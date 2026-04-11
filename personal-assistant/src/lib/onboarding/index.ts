// Barrel export for onboarding library

// Beta onboarding flow
export { runBetaOnboarding } from './beta-flow'
export type {
  BetaOnboardingInput,
  ChannelSetup,
  OnboardingResult,
} from './beta-flow'

// Multi-tenant setup
export {
  createOrg,
  setupChannels,
  getPlanLimits,
} from './multi-tenant'

export type {
  CreateOrgInput,
  OrgCreationResult,
  SetupChannelsInput,
  ChannelSetupResult,
} from './multi-tenant'

// New onboarding redesign exports
export type { OnboardingStreamEvent, RevealWorldModel, RevealStats, UserReply } from './stream-types'
export { generateNarration } from './narration'
export type { NarrationContext, PipelineEvent } from './narration'
export { determineAgents } from './agent-activator'
export type { AgentActivationResult } from './agent-activator'
