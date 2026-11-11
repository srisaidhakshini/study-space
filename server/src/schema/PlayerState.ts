import { MapSchema, schema, t, type SchemaType } from '@colyseus/schema';

/**
 * One player as clients see them. The fields are exactly PlayerSnapshot in
 * shared/src/protocol.ts: keep the two in step.
 */
export const Player = schema(
  {
    id: t.string(),
    name: t.string(),
    appearance: t.string(),
    pet: t.string(),
    tz: t.int16(),
    map: t.string(),
    x: t.float32(),
    y: t.float32(),
    dir: t.string(),
    anim: t.string(),
    seatId: t.string(),
    phase: t.string(),
    mode: t.string(),
    subject: t.string(),
    phaseStartedAt: t.float64(),
    phaseEndsAt: t.float64(),
    cycle: t.uint16(),
    sessionsToday: t.uint16(),
  },
  'Player',
);
export type Player = SchemaType<typeof Player>;

export const WorldState = schema(
  {
    players: t.map(Player),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;

export { MapSchema };
