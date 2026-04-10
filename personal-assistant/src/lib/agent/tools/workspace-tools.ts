/**
 * Workspace Tools — Ephemeral sandbox management for BitBit agents
 *
 * Gives BitBit the ability to spin up isolated Firecracker microVMs (via E2B),
 * run arbitrary code in Python/JavaScript/shell, and manage files inside them.
 * This enables data analysis, code generation testing, web scraping pipelines,
 * and any workflow that benefits from a clean, disposable Linux environment.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler } from '../tools'
import { E2BProvider } from '@/lib/workspaces/e2b-provider'
import type { WorkspaceLanguage, WorkspaceTemplate } from '@/lib/workspaces/types'
import { checkWorkspaceBudget } from '@/lib/workspaces/lifecycle'
import { createWorkspaceSession, getWorkspaceSessionBySandboxId } from '@/lib/workspaces/workspace-store'
import { completeWorkspace } from '@/lib/workspaces/lifecycle'
import { deliverWorkspaceOutput } from '@/lib/workspaces/output-delivery'
import { logger } from '@/lib/core/logger'

/**
 * In-memory map of active E2B provider instances, keyed by sandboxId.
 * Each workspace gets its own provider so we can track and destroy them
 * independently. The singleton pattern is replaced by this map to support
 * proper lifecycle integration (budget check -> create -> store -> deliver -> complete).
 */
export const activeProviders = new Map<string, E2BProvider>()

export const workspaceToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'spawn_ephemeral_workspace',
    description: `Create an isolated Firecracker microVM sandbox for running code, scripts, or data analysis. The workspace has a full Linux OS, Python, Node.js, and shell access. Use when tasks require:
- Running untrusted or experimental code safely
- Data analysis with pandas, numpy, matplotlib
- Testing code snippets before applying them
- Installing packages or running build tools
- File processing (CSV, JSON, images)

The workspace lives for up to 5 minutes and is automatically destroyed after. Returns a workspace_id to use with workspace_exec, workspace_upload, workspace_download, and workspace_destroy.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        purpose: {
          type: 'string',
          description: 'Brief description of what this workspace will be used for (for audit trail)',
        },
        template: {
          type: 'string',
          enum: ['default', 'data-science', 'web-dev'],
          description: 'Workspace template. default: general purpose, data-science: pre-loaded with pandas/numpy/matplotlib, web-dev: Node.js focused',
        },
      },
      required: ['purpose'],
    },
  },
  {
    name: 'workspace_exec',
    description: `Execute code inside an existing workspace sandbox. Supports Python, JavaScript, and shell commands. Variables and imports persist across calls within the same workspace.

Examples:
- Python: "import pandas as pd; df = pd.read_csv('/tmp/data.csv'); print(df.describe())"
- JavaScript: "const fs = require('fs'); console.log(fs.readdirSync('/tmp'))"
- Shell: "pip install requests && python -c 'import requests; print(requests.get(\"https://api.github.com\").status_code)'"`,
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_id: {
          type: 'string',
          description: 'The sandbox ID returned by spawn_ephemeral_workspace',
        },
        code: {
          type: 'string',
          description: 'Code to execute in the sandbox',
        },
        language: {
          type: 'string',
          enum: ['python', 'javascript', 'shell'],
          description: 'Language to execute the code in. Defaults to python.',
        },
      },
      required: ['workspace_id', 'code'],
    },
  },
  {
    name: 'workspace_upload',
    description: 'Upload a file into the workspace sandbox filesystem. Use to provide data files, scripts, or configurations before executing code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_id: {
          type: 'string',
          description: 'The sandbox ID',
        },
        path: {
          type: 'string',
          description: 'Absolute path in the sandbox where the file should be written (e.g. /tmp/data.csv)',
        },
        content: {
          type: 'string',
          description: 'File content as a string',
        },
      },
      required: ['workspace_id', 'path', 'content'],
    },
  },
  {
    name: 'workspace_download',
    description: 'Download a file from the workspace sandbox filesystem. Use to retrieve outputs, generated files, or results after code execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_id: {
          type: 'string',
          description: 'The sandbox ID',
        },
        path: {
          type: 'string',
          description: 'Absolute path of the file to download from the sandbox',
        },
      },
      required: ['workspace_id', 'path'],
    },
  },
  {
    name: 'workspace_destroy',
    description: 'Immediately tear down a workspace sandbox and release resources. Call when done with the workspace to avoid unnecessary costs. Workspaces auto-destroy after 5 minutes if not explicitly destroyed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workspace_id: {
          type: 'string',
          description: 'The sandbox ID to destroy',
        },
      },
      required: ['workspace_id'],
    },
  },
]

export const workspaceToolHandlers: Record<string, AgentToolHandler> = {
  async spawn_ephemeral_workspace(input, orgId, supabase) {
    const purpose = input.purpose as string
    const template = (input.template as WorkspaceTemplate) || 'default'

    if (!purpose || purpose.trim().length === 0) {
      return { success: false, error: 'purpose is required' }
    }

    logger.info('[workspace-tools] Spawning workspace', { orgId, purpose, template })

    // Budget gate — reject if the org has exceeded its daily workspace spend
    try {
      const budget = await checkWorkspaceBudget(supabase, orgId)
      if (!budget.allowed) {
        logger.warn('[workspace-tools] Budget exceeded', {
          orgId,
          currentCostUsd: budget.currentCostUsd,
          limitUsd: budget.limitUsd,
        })
        return {
          success: false,
          error: `Daily workspace budget exceeded ($${budget.currentCostUsd.toFixed(2)} / $${budget.limitUsd.toFixed(2)}). Try again tomorrow or contact your admin.`,
        }
      }
    } catch (err) {
      logger.error('[workspace-tools] Budget check failed', {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      })
      // Fail open — if the budget check itself fails, allow the workspace
    }

    try {
      const provider = new E2BProvider()
      const session = await provider.create(orgId, purpose, { template })

      // Track the provider in-memory for subsequent exec/destroy calls
      activeProviders.set(session.sandboxId, provider)

      // Persist the session to the database
      try {
        await createWorkspaceSession(supabase, orgId, {
          sandboxId: session.sandboxId,
          purpose,
          template,
        })
      } catch (dbErr) {
        logger.error('[workspace-tools] Failed to persist session to DB (sandbox is live)', {
          sandboxId: session.sandboxId,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        })
      }

      return {
        success: true,
        data: {
          workspace_id: session.sandboxId,
          session_id: session.id,
          status: session.status,
          template: session.template,
          message: `Workspace created. Use workspace_id "${session.sandboxId}" with workspace_exec, workspace_upload, workspace_download. Destroy when done with workspace_destroy.`,
        },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[workspace-tools] Failed to spawn workspace', { orgId, error: errorMsg })
      return { success: false, error: `Failed to create workspace: ${errorMsg}` }
    }
  },

  async workspace_exec(input, _orgId, supabase) {
    const workspaceId = input.workspace_id as string
    const code = input.code as string
    const language = (input.language as WorkspaceLanguage) || 'python'

    if (!workspaceId) return { success: false, error: 'workspace_id is required' }
    if (!code || code.trim().length === 0) return { success: false, error: 'code is required' }

    const provider = activeProviders.get(workspaceId)
    if (!provider) {
      return { success: false, error: `Workspace "${workspaceId}" not found. It may have been destroyed or timed out.` }
    }

    try {
      const result = await provider.exec(workspaceId, code, language)

      // Look up the DB session by sandboxId for output delivery
      let dbSession
      try {
        dbSession = await getWorkspaceSessionBySandboxId(supabase, workspaceId)
      } catch {
        // If we can't find the DB session by sandbox ID, skip output delivery
      }

      // Deliver output through the pipeline (truncation + artifact storage)
      if (dbSession) {
        try {
          const delivery = await deliverWorkspaceOutput(supabase, dbSession.id, result)
          return {
            success: result.exitCode === 0,
            data: {
              output: delivery.inline,
              truncated: delivery.truncated,
              exit_code: result.exitCode,
              stored_artifact_ids: delivery.storedArtifactIds,
            },
            error: result.error,
          }
        } catch (deliveryErr) {
          logger.error('[workspace-tools] Output delivery failed, returning raw result', {
            workspaceId,
            error: deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr),
          })
        }
      }

      // Fallback: return raw result if output delivery is unavailable
      return {
        success: result.exitCode === 0,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
          artifacts: result.artifacts,
        },
        error: result.error,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMsg }
    }
  },

  async workspace_upload(input) {
    const workspaceId = input.workspace_id as string
    const path = input.path as string
    const content = input.content as string

    if (!workspaceId) return { success: false, error: 'workspace_id is required' }
    if (!path) return { success: false, error: 'path is required' }
    if (content === undefined || content === null) return { success: false, error: 'content is required' }

    const provider = activeProviders.get(workspaceId)
    if (!provider) {
      return { success: false, error: `Workspace "${workspaceId}" not found.` }
    }

    try {
      await provider.uploadFile(workspaceId, path, content)
      return { success: true, data: { path, message: `File uploaded to ${path}` } }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMsg }
    }
  },

  async workspace_download(input) {
    const workspaceId = input.workspace_id as string
    const path = input.path as string

    if (!workspaceId) return { success: false, error: 'workspace_id is required' }
    if (!path) return { success: false, error: 'path is required' }

    const provider = activeProviders.get(workspaceId)
    if (!provider) {
      return { success: false, error: `Workspace "${workspaceId}" not found.` }
    }

    try {
      const content = await provider.downloadFile(workspaceId, path)
      return { success: true, data: { path, content } }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMsg }
    }
  },

  async workspace_destroy(input, _orgId, supabase) {
    const workspaceId = input.workspace_id as string

    if (!workspaceId) return { success: false, error: 'workspace_id is required' }

    const provider = activeProviders.get(workspaceId)

    // Complete via lifecycle: destroys sandbox + updates DB status + records cost
    let dbSession
    try {
      dbSession = await getWorkspaceSessionBySandboxId(supabase, workspaceId)
    } catch {
      // DB lookup failure — still try to destroy the sandbox directly
    }

    if (dbSession && provider) {
      try {
        await completeWorkspace(supabase, provider, dbSession.id, 'completed')
      } catch (err) {
        logger.error('[workspace-tools] completeWorkspace failed, attempting direct destroy', {
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        })
        // Fall through to direct destroy below
        try {
          await provider.destroy(workspaceId)
        } catch { /* swallow — sandbox may already be dead */ }
      }
    } else if (provider) {
      try {
        await provider.destroy(workspaceId)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return { success: false, error: errorMsg }
      }
    }

    // Clean up the in-memory provider reference
    activeProviders.delete(workspaceId)

    return { success: true, data: { message: `Workspace ${workspaceId} destroyed.` } }
  },
}
