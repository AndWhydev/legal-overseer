/**
 * Tool API Patterns — barrel export
 *
 * Re-exports all ported AI SDK tool patterns as a single import surface:
 *
 *   import { createContextAwareTool, createToolCallRepairHandler, ... }
 *     from '@/lib/agent/engine/patterns'
 */

// 1. Tool Context — inject tenant/user context into tool calls
export {
  type ToolContext,
  type ContextUsageReport,
  type ContextAwareToolOptions,
  extractContext,
  reportContextUsage,
  createContextAwareTool,
} from './tool-context'

// 2. Tool Call Repair — auto-fix malformed tool arguments via AI
export {
  type RepairInfo,
  type ToolRepairOptions,
  createToolCallRepairHandler,
} from './tool-repair'

// 3. Tool Lifecycle Hooks — observe input generation stages
export {
  type ToolLifecycleCallbacks,
  type ToolWithHooksOptions,
  createToolWithHooks,
  createLoggingHooks,
} from './tool-lifecycle-hooks'

// 4. Preliminary Tool Results — stream progress from long-running tools
export {
  type StepStatus,
  type ProgressStep,
  type ProgressReport,
  type PreliminaryResultToolOptions,
  buildProgressSnapshot,
  createPreliminaryResultTool,
} from './tool-preliminary-results'

// 5. Dynamic Tools — generate tool schemas at runtime
export {
  type DynamicFieldDef,
  type DynamicToolBlueprint,
  buildSchemaFromFields,
  createDynamicTool,
  createDynamicToolSet,
} from './tool-dynamic'
