/**
 * 9.2 — Practice group isolation.
 *
 * Practice groups are firm-defined collections (commercial, family,
 * litigation, etc.). Users and matters are tagged with groups. A
 * lawyer only sees matters tagged with a group they belong to.
 * Admins and managing partners see everything.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getUserById, type User } from '../users/repo.js';
import { listMatters, type Matter } from '../db/repositories/matters.js';

export interface PracticeGroup {
  id: string;
  name: string;
  description: string | null;
  active: number;
  created_at: string;
}

export function createPracticeGroup(name: string, acting: string, description?: string): PracticeGroup {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO practice_groups (id, name, description) VALUES (?, ?, ?)`,
  ).run(id, name, description ?? null);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'practice_group.create',
    detail: name,
    refTable: 'practice_groups',
    refId: id,
  });
  return db.prepare('SELECT * FROM practice_groups WHERE id = ?').get(id) as PracticeGroup;
}

export function listPracticeGroups(): PracticeGroup[] {
  const db = getDatabase();
  return db.prepare(`SELECT * FROM practice_groups WHERE active = 1 ORDER BY name`).all() as PracticeGroup[];
}

export function assignUserToGroup(userId: string, groupId: string, acting: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR IGNORE INTO user_practice_groups (user_id, practice_group_id) VALUES (?, ?)`,
  ).run(userId, groupId);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'practice_group.assign_user',
    detail: `user ${userId} ↔ group ${groupId}`,
    refTable: 'user_practice_groups',
    refId: null,
  });
}

export function removeUserFromGroup(userId: string, groupId: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM user_practice_groups WHERE user_id = ? AND practice_group_id = ?`).run(userId, groupId);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'practice_group.remove_user',
    detail: `user ${userId} from group ${groupId}`,
    refTable: 'user_practice_groups',
    refId: null,
  });
}

export function assignMatterToGroup(matterId: string, groupId: string, acting: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR IGNORE INTO matter_practice_groups (matter_id, practice_group_id) VALUES (?, ?)`,
  ).run(matterId, groupId);
  appendLegalAudit({
    matterId,
    actorId: acting,
    action: 'practice_group.assign_matter',
    detail: `matter ${matterId} ↔ group ${groupId}`,
    refTable: 'matter_practice_groups',
    refId: null,
  });
}

export function listUserGroups(userId: string): PracticeGroup[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT g.* FROM practice_groups g
       JOIN user_practice_groups u ON u.practice_group_id = g.id
       WHERE u.user_id = ? AND g.active = 1
       ORDER BY g.name`,
    )
    .all(userId) as PracticeGroup[];
}

export function listMatterGroups(matterId: string): PracticeGroup[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT g.* FROM practice_groups g
       JOIN matter_practice_groups m ON m.practice_group_id = g.id
       WHERE m.matter_id = ? AND g.active = 1
       ORDER BY g.name`,
    )
    .all(matterId) as PracticeGroup[];
}

/**
 * Filter a matter list to only those the supplied user is permitted
 * to see. Admins bypass the filter.
 */
export function filterMattersForUser(matters: Matter[], user: User): Matter[] {
  if (user.role === 'admin') return matters;
  const groups = listUserGroups(user.id).map((g) => g.id);
  if (!groups.length) return matters; // no group config → no isolation
  const db = getDatabase();
  return matters.filter((m) => {
    const matterGroups = db
      .prepare(`SELECT practice_group_id FROM matter_practice_groups WHERE matter_id = ?`)
      .all(m.id) as { practice_group_id: string }[];
    if (!matterGroups.length) return true;
    return matterGroups.some((g) => groups.includes(g.practice_group_id));
  });
}

export function listMattersForUser(userId: string): Matter[] {
  const user = getUserById(userId);
  if (!user) return [];
  return filterMattersForUser(listMatters(), user);
}
