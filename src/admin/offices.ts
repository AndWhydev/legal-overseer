/**
 * 9.7 — Multi-office support.
 *
 * Offices are firm-defined locations (e.g. "Sydney", "Melbourne"). A
 * matter and a user can each belong to one or more offices. Per-office
 * analytics + filters in the dashboard let a managing partner see one
 * office at a time or roll everything up.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { appendLegalAudit } from '../compliance/audit.js';

export interface Office {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
}

export function createOffice(name: string, acting: string, address?: string, phone?: string): Office {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(`INSERT INTO offices (id, name, address, phone) VALUES (?, ?, ?, ?)`).run(
    id,
    name,
    address ?? null,
    phone ?? null,
  );
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'office.create',
    detail: name,
    refTable: 'offices',
    refId: id,
  });
  return db.prepare('SELECT * FROM offices WHERE id = ?').get(id) as Office;
}

export function listOffices(): Office[] {
  const db = getDatabase();
  return db.prepare(`SELECT * FROM offices ORDER BY name`).all() as Office[];
}

export function getOffice(id: string): Office | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM offices WHERE id = ?').get(id) as Office | undefined) ?? null;
}

export function assignUserToOffice(userId: string, officeId: string, isPrimary: boolean): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO user_offices (user_id, office_id, is_primary) VALUES (?, ?, ?)`,
  ).run(userId, officeId, isPrimary ? 1 : 0);
}

export function listUserOffices(userId: string): Office[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT o.* FROM offices o
       JOIN user_offices uo ON uo.office_id = o.id
       WHERE uo.user_id = ?
       ORDER BY uo.is_primary DESC, o.name`,
    )
    .all(userId) as Office[];
}

export function assignMatterToOffice(matterId: string, officeId: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE matters SET office_id = ? WHERE id = ?`).run(officeId, matterId);
  appendLegalAudit({
    matterId,
    actorId: acting,
    action: 'office.assign_matter',
    detail: `→ ${officeId}`,
    refTable: 'matters',
    refId: matterId,
  });
}

export interface OfficeStats {
  officeId: string;
  officeName: string;
  matterCount: number;
  openMatters: number;
  closedMatters: number;
  userCount: number;
}

export function officeStats(): OfficeStats[] {
  const db = getDatabase();
  const offices = listOffices();
  const out: OfficeStats[] = [];
  for (const o of offices) {
    const matters = db
      .prepare(`SELECT status FROM matters WHERE office_id = ?`)
      .all(o.id) as { status: string }[];
    const users = (db
      .prepare(`SELECT COUNT(*) AS n FROM user_offices WHERE office_id = ?`)
      .get(o.id) as { n: number }).n;
    out.push({
      officeId: o.id,
      officeName: o.name,
      matterCount: matters.length,
      openMatters: matters.filter((m) => m.status === 'open').length,
      closedMatters: matters.filter((m) => m.status === 'closed').length,
      userCount: users,
    });
  }
  return out;
}
