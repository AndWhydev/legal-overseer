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
