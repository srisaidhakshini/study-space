import { NAME_MAX_LENGTH, sanitizeAppearance, type AssetManifest, type Profile } from '@study/shared';
import { Emitter, loadJson, saveJson } from './emitter';

const KEY = 'study-space/profile';

const ADJECTIVES = ['Cozy', 'Sleepy', 'Quiet', 'Sunny', 'Mossy', 'Gentle', 'Starry', 'Mellow', 'Rainy', 'Amber'];
const NOUNS = ['Owl', 'Fox', 'Moth', 'Fern', 'Otter', 'Finch', 'Koi', 'Panda', 'Wren', 'Tanuki'];

/** A friendly random name for guests. */
export function randomName(): string {
  const pick = (list: string[]): string => list[Math.floor(Math.random() * list.length)]!;
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${Math.floor(10 + Math.random() * 90)}`;
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
}

/** The player's saved name, look and pet. Null until the creator is finished. */
export class ProfileStore {
  readonly changed = new Emitter<Profile>();
  private profile: Profile | null = null;

  /** Reads the saved profile and repairs ids the manifest no longer has. */
  load(manifest: AssetManifest): void {
    const saved = loadJson<Partial<Profile>>(KEY);
    if (!saved || typeof saved.name !== 'string') return;
    const pet = manifest.pets.some((p) => p.id === saved.pet) ? saved.pet! : (manifest.pets[0]?.id ?? '');
    this.profile = {
      name: cleanName(saved.name) || randomName(),
      appearance: sanitizeAppearance(manifest.character, saved.appearance),
      pet,
    };
  }

  get(): Profile | null {
    return this.profile;
  }

  set(profile: Profile): void {
    this.profile = { ...profile, name: cleanName(profile.name) || randomName() };
    saveJson(KEY, this.profile);
    this.changed.emit(this.profile);
  }
}
