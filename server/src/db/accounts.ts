import type { Appearance, AccountInfo } from '@study/shared';
import { Prisma, type User } from '../generated/prisma/client';
import { withDb } from './client';

export function toAccountInfo(user: User): AccountInfo {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    appearance: (user.appearanceJson as Appearance | null) ?? null,
    pet: user.pet,
    coins: user.coins,
  };
}

export interface NewUser {
  email: string;
  passwordHash: string;
  name: string;
  appearance: Appearance | null;
  pet: string;
  tzOffsetMin: number;
}

/** Creates the account, or returns 'exists' when the email is taken. */
export async function createUser(data: NewUser): Promise<User | 'exists'> {
  return withDb(async (prisma) => {
    try {
      return await prisma.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          name: data.name,
          appearanceJson: data.appearance ? (data.appearance as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          pet: data.pet,
          tzOffsetMin: data.tzOffsetMin,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'exists';
      throw error;
    }
  });
}

export function findUserByEmail(email: string): Promise<User | null> {
  return withDb((prisma) => prisma.user.findUnique({ where: { email } }));
}

export function findUserById(id: string): Promise<User | null> {
  return withDb((prisma) => prisma.user.findUnique({ where: { id } }));
}

/** Notes a login or join: when it happened and the player's current UTC offset. */
export function touchLogin(userId: string, tzOffsetMin?: number): Promise<unknown> {
  return withDb((prisma) =>
    prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), ...(tzOffsetMin === undefined ? {} : { tzOffsetMin }) },
    }),
  );
}

export interface ProfilePatch {
  name?: string;
  appearance?: Appearance;
  pet?: string;
}

export function updateProfile(userId: string, patch: ProfilePatch): Promise<User> {
  return withDb((prisma) =>
    prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.appearance === undefined ? {} : { appearanceJson: patch.appearance as unknown as Prisma.InputJsonValue }),
        ...(patch.pet === undefined ? {} : { pet: patch.pet }),
      },
    }),
  );
}
