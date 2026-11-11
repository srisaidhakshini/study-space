import {
  MAX_IMPORT_SESSIONS,
  MAX_SESSION_MINUTES,
  type AccountInfo,
  type ApiError,
  type AuthResponse,
  type ImportRequest,
  type LoginRequest,
  type MeResponse,
  type ProfileUpdate,
  type RegisterRequest,
  type StatsMessage,
  type StatsResponse,
} from '@study/shared';
import { serverBase, tzOffsetMin, UNREACHABLE } from '../net/http';
import type { NetClient } from '../net/NetClient';
import { Emitter, loadJson, saveJson } from './emitter';
import type { ProfileStore } from './profile';
import type { SessionStore } from './sessions';

const TOKEN_KEY = 'study-space/token';
const ACCOUNT_KEY = 'study-space/account';
const IMPORTED_KEY = 'study-space/history-imported';

type Purpose = 'login' | 'register' | 'other';

/** Turns an HTTP failure into something a player can act on. */
function messageFor(status: number, purpose: Purpose, serverMessage: string | undefined): string {
  switch (status) {
    case 400:
      return serverMessage ?? 'Please check what you entered.';
    case 401:
      return purpose === 'login' ? 'Wrong email or password.' : 'Your sign-in has expired. Please sign in again.';
    case 409:
      return 'That email is already registered. Try signing in instead.';
    case 429:
      return 'Too many attempts. Wait a minute and try again.';
    case 503:
      return 'Accounts are unavailable right now. You can still play as a guest.';
    default:
      return serverMessage ?? `The server answered with an error (${status}).`;
  }
}

/** Raised for a 401 on a signed-in request, after the stale sign-in has been dropped. */
class SignedOutError extends Error {}

/**
 * The player's account: token, profile on the server, coins and stats.
 * Guests have none of this and nothing is saved for them on the server.
 */
export class AccountStore {
  /** Fires on sign-in, sign-out and whenever coins or live stats change. */
  readonly changed = new Emitter();
  /** Fires with the new coin total only when it went up. */
  readonly coinsEarned = new Emitter<number>();

  account: AccountInfo | null = loadJson<AccountInfo>(ACCOUNT_KEY);
  /** The last stats message from the room (today's totals and streak), or null. */
  live: StatsMessage | null = null;

  private token: string | null = this.readToken();
  private applyingServerProfile = false;

  constructor(
    private readonly profile: ProfileStore,
    private readonly sessions: SessionStore,
    private readonly net: NetClient,
  ) {
    if (!this.token) this.account = null;
    net.auth = { token: () => this.token, rejected: () => this.clearSession() };
    net.stats.subscribe((message) => this.receiveStats(message));
    // A look saved in the creator is kept on the account too.
    profile.changed.subscribe((next) => {
      if (this.signedIn && !this.applyingServerProfile) {
        void this.saveProfile({ name: next.name, appearance: next.appearance, pet: next.pet }).catch(() => undefined);
      }
    });
    // Leaving a room drops its live numbers.
    net.changed.subscribe(() => {
      if (!net.online && this.live) {
        this.live = null;
        this.changed.emit();
      }
    });
  }

  get signedIn(): boolean {
    return this.token !== null && this.account !== null;
  }

  get coins(): number {
    return this.live?.coins ?? this.account?.coins ?? 0;
  }

  // ---- Sign up, sign in, sign out -------------------------------------------

  async register(email: string, password: string, name: string): Promise<void> {
    const guest = this.profile.get();
    const body: RegisterRequest = {
      email: email.trim(),
      password,
      name: name.trim(),
      ...(guest ? { appearance: guest.appearance, pet: guest.pet } : {}),
    };
    const result = await this.request<AuthResponse>('/api/auth/register', 'register', { method: 'POST', body });
    await this.startSession(result);
  }

  async login(email: string, password: string): Promise<void> {
    const body: LoginRequest = { email: email.trim(), password };
    const result = await this.request<AuthResponse>('/api/auth/login', 'login', { method: 'POST', body });
    await this.startSession(result);
  }

  /** Signs out, leaves the room and carries on solo. */
  logout(): void {
    this.net.leave();
    this.clearSession();
  }

  /** Checks a stored token against the server on startup. A rejected token is dropped quietly. */
  async refresh(): Promise<void> {
    if (!this.token) return;
    try {
      const me = await this.request<MeResponse>('/api/me', 'other');
      this.setAccount(me.account);
      this.applyServerProfile(me.account);
    } catch {
      // Rejected tokens were already cleared; if the server is merely unreachable
      // the stored sign-in is kept and checked again next time.
    }
  }

  // ---- Data -----------------------------------------------------------------

  async fetchStats(): Promise<StatsResponse> {
    const stats = await this.request<StatsResponse>(`/api/stats?tz=${tzOffsetMin()}`, 'other');
    if (this.account && stats.coins !== this.account.coins) this.setAccount({ ...this.account, coins: stats.coins });
    return stats;
  }

  async saveProfile(update: ProfileUpdate): Promise<void> {
    if (!this.signedIn) return;
    const me = await this.request<MeResponse>('/api/profile', 'other', { method: 'PUT', body: update });
    this.setAccount(me.account);
  }

  // ---- Internals ------------------------------------------------------------

  private async startSession(result: AuthResponse): Promise<void> {
    this.token = result.token;
    this.writeToken(result.token);
    this.setAccount(result.account);
    this.applyServerProfile(result.account);
    await this.importHistory();
  }

  private clearSession(): void {
    const had = this.token !== null || this.account !== null;
    this.token = null;
    this.account = null;
    this.live = null;
    this.writeToken(null);
    saveJson(ACCOUNT_KEY, null);
    if (had) this.changed.emit();
  }

  private setAccount(account: AccountInfo): void {
    const raised = this.account !== null && account.coins > this.account.coins;
    this.account = account;
    saveJson(ACCOUNT_KEY, account);
    this.changed.emit();
    if (raised) this.coinsEarned.emit(account.coins);
  }

  private receiveStats(message: StatsMessage): void {
    const before = this.coins;
    this.live = message;
    if (this.account && this.account.coins !== message.coins) {
      this.account = { ...this.account, coins: message.coins };
      saveJson(ACCOUNT_KEY, this.account);
    }
    this.changed.emit();
    if (message.coins > before) this.coinsEarned.emit(message.coins);
  }

  /** The server's stored look replaces the local one, without saving it straight back. */
  private applyServerProfile(account: AccountInfo): void {
    this.applyingServerProfile = true;
    try {
      this.profile.applyAccount(account);
    } finally {
      this.applyingServerProfile = false;
    }
  }

  /** Uploads this device's guest history once. It earns no coins; it only fills the stats. */
  private async importHistory(): Promise<void> {
    if (loadJson<boolean>(IMPORTED_KEY) === true) return;
    const now = Date.now();
    const sessions = this.sessions
      .all()
      .filter((r) => r.minutes >= 1 && r.minutes <= MAX_SESSION_MINUTES && r.endedAt <= now && r.startedAt < r.endedAt)
      .slice(-MAX_IMPORT_SESSIONS);
    if (sessions.length > 0) {
      try {
        const body: ImportRequest = { sessions };
        await this.request('/api/sessions/import', 'other', { method: 'POST', body });
      } catch {
        return; // not marked as done, so the next sign-in tries again
      }
    }
    saveJson(IMPORTED_KEY, true);
  }

  private async request<T>(path: string, purpose: Purpose, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response: Response;
    try {
      response = await fetch(serverBase() + path, {
        method: init.method ?? 'GET',
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch {
      throw new Error(UNREACHABLE);
    }
    const data = (await response.json().catch(() => null)) as (T & Partial<ApiError>) | null;
    if (!response.ok) {
      if (response.status === 401 && purpose === 'other' && this.token) {
        this.clearSession();
        throw new SignedOutError(messageFor(401, purpose, data?.error));
      }
      throw new Error(messageFor(response.status, purpose, data?.error));
    }
    if (data === null) throw new Error('The server sent an unreadable answer.');
    return data;
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private writeToken(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage blocked: the sign-in lasts until the page is closed.
    }
  }
}
