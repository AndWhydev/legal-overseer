// ============================================
// Tool Loader - YAML config to Anthropic tools
// ============================================

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type Anthropic from '@anthropic-ai/sdk';

// Import handlers directly (Next.js doesn't handle dynamic imports well)
import {
  handleLookupOrder,
  handleGetShippingStatus,
  handleGetCustomerHistory,
  handleSendReply,
  handleCreateTask,
  handleCheckInventory,
  handleEscalate,
} from '../services/tool-handlers';

/**
 * Tool definition from YAML config
 */
interface ToolConfig {
  name: string;
  description: string;
  handler: string;
  params: Record<string, { type: string; description?: string; enum?: string[]; required?: boolean }>;
}

/**
 * Parsed tools config
 */
interface ToolsConfig {
  tools: ToolConfig[];
}

/**
 * Handler registry - maps tool names to their handler functions
 */
export type HandlerRegistry = Map<string, (input: Record<string, unknown>, sessionId: string) => Promise<unknown>>;

// Static handler mapping (loaded once)
const HANDLER_MAP: Record<string, (input: Record<string, unknown>, sessionId: string) => Promise<unknown>> = {
  'services/tool-handlers#handleLookupOrder': handleLookupOrder,
  'services/tool-handlers#handleGetShippingStatus': handleGetShippingStatus,
  'services/tool-handlers#handleGetCustomerHistory': handleGetCustomerHistory,
  'services/tool-handlers#handleSendReply': handleSendReply,
  'services/tool-handlers#handleCreateTask': handleCreateTask,
  'services/tool-handlers#handleCheckInventory': handleCheckInventory,
  'services/tool-handlers#handleEscalate': handleEscalate,
};

/**
 * Load tool definitions from YAML and create Anthropic tool schemas
 */
export function loadTools(configPath: string): Anthropic.Tool[] {
  const fullPath = path.join(process.cwd(), configPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const config = yaml.load(content) as ToolsConfig;

  return config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: buildInputSchema(tool.params),
  }));
}

/**
 * Build JSON Schema from tool params config
 */
function buildInputSchema(params: ToolConfig['params']): Anthropic.Tool['input_schema'] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, config] of Object.entries(params)) {
    const prop: Record<string, unknown> = { type: config.type };
    if (config.description) prop.description = config.description;
    if (config.enum) prop.enum = config.enum;
    properties[name] = prop;
    if (config.required) required.push(name);
  }

  return {
    type: 'object' as const,
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Load and initialize handler registry from YAML config
 */
export async function loadHandlers(configPath: string): Promise<HandlerRegistry> {
  const fullPath = path.join(process.cwd(), configPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const config = yaml.load(content) as ToolsConfig;

  const registry: HandlerRegistry = new Map();

  for (const tool of config.tools) {
    const handler = HANDLER_MAP[tool.handler];

    if (!handler) {
      throw new Error(`Handler ${tool.handler} not found in HANDLER_MAP`);
    }

    registry.set(tool.name, handler);
  }

  return registry;
}
