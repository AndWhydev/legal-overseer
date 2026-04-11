/**
 * Database module for BitBit
 *
 * Re-exports database connection utilities and types.
 */

export { getDatabase, closeDatabase } from './connection.js';
export { initializeDatabase } from './init.js';
export type { Database } from 'better-sqlite3';
