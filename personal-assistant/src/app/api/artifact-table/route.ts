import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  gateway,
  streamText,
  type UIMessage,
} from "ai";

import { TableEditorArtifact } from "../../../lib/ai/artifacts/table-editor";
import {
  runWithContext,
  setCurrentArtifactData,
} from "../../../lib/ai/context";
import {
  addDataTool,
  tableEditorTool,
} from "../../../lib/ai/tools/table-editor";
import type { TableEditorData } from "../../../lib/ai/types";

// Maximum time this API route can run (30 seconds)
// This prevents long-running requests from timing out
export const maxDuration = 30;

/**
 * POST handler for ai-artifact-table
 *
 * Note: Rate limiting is handled at the route wrapper level
 * See: app/(view)/view/[name]/api/[...slug]/route.ts
 */
export async function POST(req: Request) {
  // Extract chat messages and optional currentCsv from the request
  const {
    messages,
    currentCsv,
  }: { messages: UIMessage[]; currentCsv?: string | null } = await req.json();

  const modelMessages = await convertToModelMessages(messages);

  // Create a streaming response for real-time AI interaction
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      // Run with context to enable AsyncLocalStorage context management
      return runWithContext(
        {
          writer, // Stream writer for real-time updates
          userId: "table-editor-user", // Use generic user ID since rate limiting is handled centrally
          fullName: "Table Editor User", // Display name for the user
        },
        () => {
          // Extract and restore any existing table data from previous messages
          hydrateContextFromMessages(messages);

          // Override with manually edited CSV if provided
          if (currentCsv && currentCsv.trim()) {
            // Extract artifact metadata from messages to get version info
            const latestArtifact = extractLatestTableArtifact(messages);

            if (latestArtifact && typeof latestArtifact === "object") {
              const artifact = latestArtifact as {
                id?: string;
                version?: number;
                payload?: unknown;
              };

              const payload = TableEditorArtifact.validate(
                artifact.payload ?? {}
              ) as TableEditorData;

              // Override CSV with manually edited version
              setCurrentArtifactData({
                artifactId: artifact.id ?? "",
                artifactVersion: artifact.version ?? 0,
                title: payload.title,
                csvContent: currentCsv, // Use the edited CSV!
                summary: payload.summary,
                operations: payload.operations ?? [],
                versions: payload.versions ?? [],
                stage: "complete",
                progress: 1,
              });
            }
          }

          // Start the AI text generation with table editing capabilities
          const result = streamText({
            model: gateway("openai/gpt-4.1"), // Use GPT-4.1 for advanced reasoning
            system: systemPrompt, // Instructions for the AI assistant
            messages: modelMessages, // Convert UI messages to AI format
            tools: {
              tableEditor: tableEditorTool, // Tool for table operations (create, edit, filter, etc.)
              addData: addDataTool, // Tool for adding new data to existing tables
            },
          });

          // Merge the AI response stream with our UI message stream
          writer.merge(result.toUIMessageStream());
        }
      );
    },
  });

  // Return the streaming response to the client
  return createUIMessageStreamResponse({
    stream,
  });
}

/**
 * Restores table data from previous chat messages
 *
 * This function looks through the chat history to find the most recent
 * table artifact and restores it to the AI context. This allows the
 * AI to continue working with existing table data across multiple messages.
 *
 * @param messages Array of chat messages to search through
 */
function hydrateContextFromMessages(messages: UIMessage[]) {
  // Find the most recent table artifact in the chat history
  const latestArtifact = extractLatestTableArtifact(messages);

  // If no artifact found, nothing to restore
  if (!latestArtifact || typeof latestArtifact !== "object") {
    return;
  }

  try {
    // Extract artifact metadata
    const artifact = latestArtifact as {
      id?: string; // Unique artifact identifier
      version?: number; // Version number of the artifact
      payload?: unknown; // The actual table data
    };

    // Validate the artifact data using the schema
    const payload = TableEditorArtifact.validate(artifact.payload ?? {}) as {
      title: string;
      csvContent: string;
      summary?: {
        rowCount?: number;
        columnCount?: number;
        sampleRows?: Record<string, string>[];
        columnProfiles?: Array<{
          name: string;
          inferredType: "number" | "currency" | "date" | "text" | "boolean";
          filled?: number;
          examples: string[];
        }>;
      };
      operations: Array<{
        id: string;
        label: string;
        status: "pending" | "applied" | "skipped" | "applying";
        preview?: string;
        description?: string;
      }>;
      versions: Array<{
        version: number;
        label: string;
        csvContent: string;
        createdAt: number;
        description?: string;
        operations?: string[];
      }>;
      stage:
        | "loading"
        | "profiling"
        | "editing"
        | "applying_changes"
        | "complete";
      progress: number;
    };

    // Restore the artifact data to the AI context
    setCurrentArtifactData({
      artifactId: artifact.id, // Unique ID for this table
      artifactVersion: artifact.version ?? payload.versions?.length ?? 0, // Current version
      title: payload.title, // Table title/name
      csvContent: payload.csvContent, // Raw CSV data
      summary: payload.summary, // Table metadata (rows, columns, etc.)
      operations: payload.operations ?? [], // List of operations performed
      versions: payload.versions ?? [], // All previous versions
      stage: payload.stage ?? "complete", // Current processing stage
      progress: payload.progress ?? 1, // Progress percentage (0-1)
    });
  } catch (_error) {
    // Silently ignore errors during context hydration
    // This is non-critical - we can continue without previous context
  }
}

/**
 * Searches through chat messages to find the most recent table artifact
 *
 * This function walks through all chat messages and their parts to find
 * table artifacts. It keeps track of the latest version of each artifact
 * and returns the most recently created one.
 *
 * @param messages Array of chat messages to search through
 * @returns The most recent table artifact, or null if none found
 */
function extractLatestTableArtifact(messages: UIMessage[]) {
  // Map to store artifacts by ID, keeping only the latest version of each
  const artifactsById = new Map<string, unknown>();
  const artifactType = `data-artifact-${TableEditorArtifact.id}`;

  /**
   * Recursively visits all parts of a message to find artifacts
   * @param parts Array of message parts to search through
   */
  const visitParts = (parts: unknown) => {
    if (!Array.isArray(parts)) {
      return;
    }

    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const typedPart = part as {
        type?: string; // Type of message part
        data?: unknown; // Artifact data
        result?: { parts?: unknown[] }; // Tool result parts
      };

      // Check if this part is a table artifact
      if (typedPart.type === artifactType && typedPart.data) {
        const data = typedPart.data as { id?: string; version?: number };
        if (!data.id) {
          continue;
        }

        // Keep only the latest version of each artifact
        const current = artifactsById.get(data.id) as
          | { version?: number }
          | undefined;
        if (!current || (data.version ?? 0) > (current.version ?? 0)) {
          artifactsById.set(data.id, typedPart.data);
        }
      }

      // Recursively search tool results for nested artifacts
      if (typedPart.type?.startsWith("tool-") && typedPart.result?.parts) {
        visitParts(typedPart.result.parts);
      }
    }
  };

  // Search through all messages
  for (const message of messages) {
    visitParts((message as { parts?: unknown[] }).parts);
  }

  // Sort artifacts by creation time and return the most recent
  const artifacts = Array.from(artifactsById.values()).sort((a, b) => {
    const aData = a as { createdAt?: number };
    const bData = b as { createdAt?: number };
    return (bData.createdAt ?? 0) - (aData.createdAt ?? 0);
  });

  return artifacts[0] ?? null;
}

/**
 * System prompt that instructs the AI on how to be a spreadsheet assistant
 *
 * This prompt defines:
 * - The AI's role as a spreadsheet expert
 * - All available table operations and how to use them
 * - Preferred methods for different tasks
 * - Key principles for providing good user experience
 */
const systemPrompt = `You are an expert AI spreadsheet assistant that helps users create, edit, and transform tabular data with powerful spreadsheet operations.

Always call the tableEditorTool to respond. You can perform various operations:

1. CREATE: When user provides CSV data or wants to start fresh
   tableEditorTool({
     operation: "create",
     csv: "raw CSV data here",
     title: "Dataset Name"
   })

2. ADD_COLUMN: When user wants to add calculated columns
   tableEditorTool({
     operation: "add_column", 
     instructions: ["Add bonus column as 10% of salary", "Add total compensation"]
   })

3. FILTER_ROWS: When user wants to filter data
   tableEditorTool({
     operation: "filter_rows",
     filterCriteria: "performance score > 4.0"
   })

4. SORT_DATA: When user wants to sort
   tableEditorTool({
     operation: "sort_data",
     sortBy: "salary",
     sortOrder: "desc"
   })

5. CALCULATE: When user wants calculations/aggregations
   tableEditorTool({
     operation: "calculate",
     targetColumns: ["revenue", "cost"]
   })

6. CLEAN_DATA: When user wants data cleaning
   tableEditorTool({
     operation: "clean_data"
   })

7. EDIT_COLUMN: When user wants to edit specific column data
   tableEditorTool({
     operation: "edit_column",
     editColumn: "A", // or "Name", "Column A", etc.
     editInstruction: "make uppercase" // or "add prefix 'Mr. '", "trim whitespace", etc.
   })

8. ADD_DATA: When user wants to add new rows to existing dataset (PREFERRED)
   addDataTool({
     csv: "new CSV data to add as rows",
     mergeStrategy: "append", // or "prepend", "insert_at_index"
     description: "Optional description of what data is being added"
   })

9. MERGE_DATA: When user wants to add new rows to existing dataset (FALLBACK)
   tableEditorTool({
     operation: "merge_data",
     csv: "new CSV data to add as rows",
     mergeStrategy: "append" // or "prepend", "insert_at_index"
   })

IMPORTANT: Use ADD_DATA (preferred) or MERGE_DATA when user says:
- "Add more data to the dataset"
- "Add more cities to the dataset" 
- "Add these rows to the existing data"
- "Merge this data with the current dataset"
- "Add new entries to the table"
- "Add more rows"
- "Add additional data"
- "Include more records"
- Any request to add new rows/data to existing dataset

When using ADD_DATA (preferred):
1. Use addDataTool for adding data to existing tables
2. Provide the new CSV data in the csv parameter
3. Use mergeStrategy: "append" by default
4. Add a description parameter for clarity
5. The tool will automatically match column names and merge the data

When using MERGE_DATA (fallback):
1. Always set operation: "merge_data"
2. Provide the new CSV data in the csv parameter
3. Use mergeStrategy: "append" by default
4. The tool will automatically match column names and merge the data

Key principles:
- Always provide clear, actionable instructions
- Use the operation parameter to specify the type of transformation
- Stream updates through the artifact to show real-time progress
- Focus on making the spreadsheet editor the star of the show
- Provide meaningful version labels for each operation

If no tabular data is provided, still call the tool with operation: "create" and empty csv to prompt for data.`;
