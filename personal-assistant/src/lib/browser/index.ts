// ---------------------------------------------------------------------------
// Browser automation barrel — re-exports from all browser modules
// ---------------------------------------------------------------------------

// Types
export type {
  BrowserTaskStatus,
  BrowserTaskParams,
  BrowserTaskResult,
  BrowserAction,
  StagehandConfig,
} from './types'

// Stagehand client (session lifecycle + primitives)
export {
  getConfig,
  createSession,
  navigateTo,
  act,
  observe,
  extract,
  closeSession,
  runBrowserTask,
} from './stagehand-client'
export type { StagehandSession } from './stagehand-client'

// Domain gate
export { checkDomainAuthorization, extractDomain } from './domain-gate'
export type { DomainAuthResult } from './domain-gate'

// Credential injector
export { injectCredentials } from './credential-injector'
export type {
  CredentialSource,
  CredentialOptions,
  CredentialResult,
} from './credential-injector'

// Cost monitor
export {
  createCostBudget,
  recordTokens,
  recordSessionTime,
  checkBudget,
  preFlightBudgetCheck,
} from './cost-monitor'
export type {
  CostBudget,
  BudgetCheck,
  PreFlightBudgetResult,
} from './cost-monitor'

// Browser task engine (full lifecycle)
export {
  executeBrowserTask,
  runPreFlightChecks,
} from './browser-task'
export type {
  ExecuteBrowserTaskOptions,
  PreFlightResult,
} from './browser-task'
