/**
 * Client portal — public surface.
 *
 * Two callers:
 *   - dashboard/server: mounts /client-portal/* routes via
 *     handleClientPortalRoute() before normal lawyer auth runs.
 *   - lawyer-side management views: grant/revoke document visibility,
 *     mint share links, list client users.
 */

export {
  createClientUser,
  getClientUserById,
  getClientUserByEmail,
  listClientUsers,
  grantClientMatter,
  revokeClientMatter,
  listClientMatters,
  isClientAllowedMatter,
  grantDocumentVisibility,
  revokeDocumentVisibility,
  isDocumentVisibleToClients,
  listVisibleDocumentIds,
  createShareLink,
  getShareLink,
  isShareLinkLive,
  revokeShareLink,
  listMatterShareLinks,
  createClientSession,
  loadClientSession,
  destroyClientSession,
  parseClientSessionCookie,
  setClientSessionCookie,
  clearClientSessionCookie,
  verifyClientPassword,
  type ClientUser,
  type ClientUserStatus,
  type CreateClientUserInput,
  type ShareLink,
  type CreateShareLinkInput,
  type ClientSession,
} from './repo.js';

export { handleClientPortalRoute, isClientPortalRoute } from './server.js';
