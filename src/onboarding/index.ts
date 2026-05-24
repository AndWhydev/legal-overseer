/**
 * Onboarding module — public surface.
 *
 * The dashboard server checks isSetupComplete() before any request,
 * and routes /setup/* through handleOnboardingRoute. Setup status is
 * stored in setup_state (one row).
 */

export { getSetupState, isSetupComplete, markSetupComplete, type SetupState } from './state.js';
export { handleOnboardingRoute, isSetupRoute } from './server.js';
export { renderWizard } from './wizard.js';
