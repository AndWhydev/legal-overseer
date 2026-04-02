/**
 * Workflow Patterns — Barrel Export
 *
 * Five AI workflow patterns ported from the WDK (Workflow Development Kit):
 *
 * - **Sequential**: Chain steps in order with optional quality gates
 * - **Parallel**: Run independent analyses concurrently, then aggregate
 * - **Routing**: Classify input and route to specialized handlers
 * - **Evaluator**: Quality-gate eval/optimize loop until acceptable
 * - **Orchestrator**: Coordinator plans, workers execute in parallel
 */

export {
  runSequentialWorkflow,
  type SequentialStep,
  type SequentialWorkflowConfig,
  type SequentialStepResult,
  type SequentialWorkflowResult,
} from './sequential'

export {
  runParallelWorkflow,
  type ParallelBranch,
  type ParallelAggregation,
  type ParallelWorkflowConfig,
  type ParallelBranchResult,
  type ParallelWorkflowResult,
} from './parallel'

export {
  runRoutingWorkflow,
  type RouteHandler,
  type RoutingWorkflowConfig,
  type RoutingWorkflowResult,
} from './routing'

export {
  runEvaluatorWorkflow,
  type EvaluatorWorkflowConfig,
  type EvaluatorIteration,
  type EvaluatorWorkflowResult,
} from './evaluator'

export {
  runOrchestratorWorkflow,
  type OrchestratorWorkflowConfig,
  type WorkerResult,
  type OrchestratorWorkflowResult,
} from './orchestrator'
