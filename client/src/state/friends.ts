import type { FriendEntry, FriendRequestBody, FriendRespondBody, FriendsResponse } from '@study/shared';
import type { NetClient } from '../net/NetClient';
import type { AccountStore } from './account';
import { Emitter } from './emitter';

/** While the panel is open the list refreshes this often. */
const PANEL_REFRESH_MS = 30_000;
/** With the panel closed, the badge for new requests refreshes this often (signed in and online). */
const BACKGROUND_REFRESH_MS = 90_000;

/**
 * Friends and friend requests for a signed-in player. Talks to the REST API
 * (`/api/friends`); guests have an empty list and every call refuses politely.
 */
export class FriendsStore {
  /** Fires whenever the list, the counts or the loading state change. */
  readonly changed = new Emitter();

  friends: FriendEntry[] = [];
  loading = false;
  /** The last refresh failure, shown in the panel; cleared by the next success. */
  error: string | null = null;

  private panelOpen = 0;
  private timer: number | null = null;
  private signedInBefore = false;
  private roomRelationships = '';
  private refreshVersion = 0;

  constructor(
    private readonly account: AccountStore,
    private readonly net: NetClient,
  ) {
    // A fresh list as soon as someone signs in or the connection comes up.
    account.changed.subscribe(() => this.accountChanged());
    net.changed.subscribe(() => {
      if (net.online && account.signedIn) void this.refresh();
      this.schedule();
    });
    net.buddiesChanged.subscribe(() => {
      const relationships = net.buddies.links.map(({ id, status }) => `${id}:${status}`).sort().join(',');
      if (relationships === this.roomRelationships) return;
      this.roomRelationships = relationships;
      if (net.online && account.signedIn) void this.refresh();
    });
    this.accountChanged();
  }

  get signedIn(): boolean {
    return this.account.signedIn;
  }

  get accepted(): FriendEntry[] {
    return this.friends.filter((f) => f.status === 'accepted');
  }

  get incoming(): FriendEntry[] {
    return this.friends.filter((f) => f.status === 'incoming');
  }

  get outgoing(): FriendEntry[] {
    return this.friends.filter((f) => f.status === 'outgoing');
  }

  /** Number of waiting requests, for the badge on the HUD button. */
  get incomingCount(): number {
    return this.incoming.length;
  }

  /** Reloads the list from the server. Failures are kept in `error` rather than thrown. */
  async refresh(): Promise<void> {
    if (!this.account.signedIn) {
      this.clear();
      return;
    }
    const version = ++this.refreshVersion;
    this.loading = true;
    this.changed.emit();
    try {
      const body = await this.account.authed<FriendsResponse>('/api/friends');
      if (version !== this.refreshVersion) return;
      this.friends = body.friends;
      this.error = null;
    } catch (caught) {
      if (version !== this.refreshVersion) return;
      this.error = caught instanceof Error ? caught.message : 'Could not load your friends.';
    } finally {
      if (version === this.refreshVersion) {
        this.loading = false;
        this.changed.emit();
      }
    }
  }

  /** Sends a friend request by display name or email. Throws a readable Error. */
  async request(nameOrEmail: string): Promise<void> {
    const text = nameOrEmail.trim();
    if (text === '') throw new Error('Type a name or an email address.');
    const body: FriendRequestBody = { nameOrEmail: text };
    await this.account.authed('/api/friends/request', { method: 'POST', body });
    await this.refresh();
  }

  /** Accepts or declines a request from `id`. */
  async respond(id: string, accept: boolean): Promise<void> {
    const body: FriendRespondBody = { id, accept };
    await this.account.authed('/api/friends/respond', { method: 'POST', body });
    await this.refresh();
  }

  /** Removes a friend, or cancels a request you sent (or declines one you received). */
  async remove(id: string): Promise<void> {
    await this.account.authed(`/api/friends/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.refresh();
  }

  /**
   * Called by the panel while it is open: refreshes now and every 30 s.
   * Returns a function that stops it.
   */
  watchWhileOpen(): () => void {
    this.panelOpen += 1;
    void this.refresh();
    this.schedule();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.panelOpen = Math.max(0, this.panelOpen - 1);
      this.schedule();
    };
  }

  // ---- Internals --------------------------------------------------------------------

  private accountChanged(): void {
    const signedIn = this.account.signedIn;
    if (signedIn && !this.signedInBefore) void this.refresh();
    if (!signedIn && this.signedInBefore) this.clear();
    this.signedInBefore = signedIn;
    this.schedule();
  }

  private clear(): void {
    this.refreshVersion += 1;
    this.friends = [];
    this.error = null;
    this.loading = false;
    this.changed.emit();
  }

  /** One timer: fast while the panel is open, slow in the background when signed in and online. */
  private schedule(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.account.signedIn) return;
    const every = this.panelOpen > 0 ? PANEL_REFRESH_MS : this.net.online ? BACKGROUND_REFRESH_MS : 0;
    if (every === 0) return;
    this.timer = window.setInterval(() => void this.refresh(), every);
  }
}
