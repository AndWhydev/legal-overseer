/**
 * Agent module — Legal Overseer.
 *
 * Re-exports the SDK executor, MCP tools, classifier/coordinator,
 * task processor, model selection, and proactive overseer loop.
 */

export {
  executeQuery,
  executeQueryWithTimeout,
  type QueryOptions,
  type QueryResult,
} from './executor.js';

export { bitbitMcpServer, tools } from './tools.js';

export {
  classifyTask,
  executeWithSkill,
  routeAndExecute,
  type SkillExecutionResult,
} from './coordinator.js';

export {
  processNextTask,
  startTaskLoop,
  stopTaskLoop,
  isProcessorRunning,
} from './processor.js';

export {
  MODELS,
  MODEL_COSTS,
  selectModel,
  estimateCost,
  getModelId,
  type ModelTier,
  type Complexity,
  type RiskLevel,
  type ModelSelection,
} from './models.js';

export {
  runOverseerTick,
  startOverseerLoop,
  stopOverseerLoop,
  isOverseerLoopRunning,
  getTaskById,
} from './overseer-loop.js';
