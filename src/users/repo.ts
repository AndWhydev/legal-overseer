/**
 * Users repository.
 *
 * Owns the `users` table — admin / lawyer / paralegal accounts that
 * log in to the local dashboard. Sessions are owned separately by
 * src/users/session.ts.
 *
 * Licence enforcement (max-users cap) lives in src/licence/enforce —
 * callers must invoke `assertCanAddUser()` before `createUser()`.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { hashPassword } from './password.js';

const logger = createSafeLogger('UserRepo');

export type UserRole = 'admin' | 'lawyer' | 'paralegal';
export type UserStatus = 'active' | 'suspended' | 'removed';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  password_hash: string;
  password_salt: string;
  password_iter: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  full_name: string;
  role: UserRole;
  password: string;
}

export function createUser(input: CreateUserInput): User {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const hashed = hashPassword(input.password);
  const email = input.email.trim().toLowerCase();

  db.prepare(
    `INSERT INTO users (
       id, email, full_name, role, status,
       password_hash, password_salt, password_iter,
       created_at, updated_at
     )
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    email,
    input.full_name,
    input.role,
    hashed.hash,
    hashed.salt,
    hashed.iter,
    now,
    now,
  );
  logger.info(`created user ${email} as ${input.role}`);
  return getUserById(id) as User;
}

export function getUserById(id: string): User | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null
  );
}

export function getUserByEmail(email: string): User | null {
  const db = getDatabase();
  const normalised = email.trim().toLowerCase();
  return (
    (db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(normalised) as User | undefined) ?? null
  );
}

export function listUsers(): User[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM users WHERE status <> 'removed' ORDER BY role, email`,
    )
    .all() as User[];
}

export function countActiveUsers(): number {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE status = 'active'`)
    .get() as { n: number };
  return row.n;
}

export function updateLastLogin(id: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(
    now,
    now,
    id,
  );
}

export function setUserStatus(id: string, status: UserStatus): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    now,
    id,
  );
}

export function setUserPassword(id: string, password: string): void {
  const db = getDatabase();
  const hashed = hashPassword(password);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ?, password_iter = ?, updated_at = ? WHERE id = ?`,
  ).run(hashed.hash, hashed.salt, hashed.iter, now, id);
}

export function setUserRole(id: string, role: UserRole): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, id);
}

export function hasAnyAdmin(): boolean {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`)
    .get() as { n: number };
  return row.n > 0;
}
