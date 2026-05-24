/**
 * Users module — public surface.
 */

export {
  createUser,
  getUserById,
  getUserByEmail,
  listUsers,
  countActiveUsers,
  updateLastLogin,
  setUserStatus,
  setUserPassword,
  setUserRole,
  hasAnyAdmin,
  type User,
  type UserRole,
  type UserStatus,
  type CreateUserInput,
} from './repo.js';

export { hashPassword, verifyPassword } from './password.js';

export {
  createSession,
  destroySession,
  destroyAllUserSessions,
  loadSession,
  purgeExpiredSessions,
  parseSessionCookie,
  setSessionCookieHeader,
  clearSessionCookieHeader,
  SESSION_COOKIE,
  type Session,
} from './session.js';
