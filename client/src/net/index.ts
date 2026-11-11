import type { Profile } from '@study/shared';
import { NetClient } from './NetClient';

export type { NetClient } from './NetClient';

/** Creates the network client. It implements NetApi and adds the game-facing hooks. */
export function createNet(getProfile: () => Profile | null): NetClient {
  return new NetClient(getProfile);
}
