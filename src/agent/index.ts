/**
 * Agent module for BitBit
 *
 * Re-exports agent execution utilities, types, MCP tools, coordinator,
 * processor, and model selection functions.
 */

// Executor - low-level query execution
export {
  executeQuery,
  executeQueryWithTimeout,
  type QueryOptions,
  type QueryResult,
} from './executor.js';

// Tools - MCP server configuration
export { bitbitMcpServer, tools } from './tools.js';

// Coordinator - task classification and skill routing
export {
  classifyTask,
  executeWithSkill,
  routeAndExecute,
  type SkillExecutionResult,
} from './coordinator.js';

// Processor - task processing loop
export {
  processNextTask,
  startTaskLoop,
  stopTaskLoop,
  isProcessorRunning,
} from './processor.js';

// Models - model selection and cost estimation
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
