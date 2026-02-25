"use strict";
/**
 * @bitbit/core — Shared types and registries
 *
 * Currently exports: types + agent-registry
 * Future (Phase 4+): engine, model-router, orchestrator, tools, confidence, policies, channels
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDefinition = exports.getAgentConfig = exports.getRegisteredTypes = exports.listAgents = exports.getAgent = exports.registerAgent = void 0;
// Agent registry
var agent_registry_1 = require("./agent-registry");
Object.defineProperty(exports, "registerAgent", { enumerable: true, get: function () { return agent_registry_1.registerAgent; } });
Object.defineProperty(exports, "getAgent", { enumerable: true, get: function () { return agent_registry_1.getAgent; } });
Object.defineProperty(exports, "listAgents", { enumerable: true, get: function () { return agent_registry_1.listAgents; } });
Object.defineProperty(exports, "getRegisteredTypes", { enumerable: true, get: function () { return agent_registry_1.getRegisteredTypes; } });
Object.defineProperty(exports, "getAgentConfig", { enumerable: true, get: function () { return agent_registry_1.getAgentConfig; } });
Object.defineProperty(exports, "validateDefinition", { enumerable: true, get: function () { return agent_registry_1.validateDefinition; } });
//# sourceMappingURL=index.js.map