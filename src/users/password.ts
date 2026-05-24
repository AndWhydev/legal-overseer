/**
 * PBKDF2-SHA256 password hashing.
 *
 * Stored as three columns: hash (base64), salt (base64), iter count.
 * Default 200_000 iterations — adequate against offline attack with
 * modest CPU cost on a server boot. The user can be re-hashed at
 * next login if the iteration count is raised.
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 32;
const DEFAULT_ITER = 200_000;
const DIGEST = 'sha256';

export interface PasswordHash {
  hash: string;
  salt: string;
  iter: number;
}

export function hashPassword(password: string, iter = DEFAULT_ITER): PasswordHash {
  if (!password || password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, iter, KEY_LEN, DIGEST);
  return {
    hash: derived.toString('base64'),
    salt: salt.toString('base64'),
    iter,
  };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  if (!password) return false;
  const salt = Buffer.from(stored.salt, 'base64');
  const expected = Buffer.from(stored.hash, 'base64');
  const derived = pbkdf2Sync(password, salt, stored.iter, expected.length, DIGEST);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
