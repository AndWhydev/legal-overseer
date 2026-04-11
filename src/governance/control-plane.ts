/**
 * Agent Control Plane for BitBit
 *
 * External governance layer that agents query but cannot modify.
 * Kill switches must exist OUTSIDE agent control per security requirements.
 *
 * This is a singleton - agents can only query, not modify state.
 */

import { checkRateLimit, type RiskLevel } from './rate-limiter.js';
import {
  detectRateAnomaly,
  detectSequenceAnomaly,
  recordAnomaly,
  type Action as AnomalyAction,
} from './anomaly-detector.js';
import { logAuditSafe, createSafeLogger } from './logger.js';
import { sendSystemAlert } from '../telegram/notifications.js';

const logger = createSafeLogger('ControlPlane');

/**
 * Action to be checked by control plane
 */
export interface Action {
  type: string;
  riskLevel: RiskLevel;
  agentId: string;
  skillId?: string;
  domain?: string;
  details?: unknown;
}

/**
 * Control plane status for monitoring
 */
export interface ControlPlaneStatus {
  globalKillSwitch: boolean;
  disabledAgents: string[];
  lastEmergencyStop: string | null;
  lastEmergencyReason: string | null;
  uptimeMs: number;
}

/**
 * Kill switch cache entry
 */
interface KillSwitchCache {
  value: boolean;
  timestamp: number;
}

/**
 * Cache TTL for kill switch checks (5 seconds)
 */
const KILL_SWITCH_CACHE_TTL = 5000;

/**
 * Admin chat ID for notifications
 */
const ADMIN_CHAT_ID = parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || '0', 10);

/**
 * Agent Control Plane singleton
 *
 * Provides external governance for agent actions.
 * Agents can query this but cannot modify state.
 */
class AgentControlPlane {
  private globalKillSwitch = false;
  private agentEnabled = new Map<string, boolean>();
  private killSwitchCache = new Map<string, KillSwitchCache>();
  private recentActions = new Map<string, AnomalyAction[]>();
  private lastEmergencyStop: Date | null = null;
  private lastEmergencyReason: string | null = null;
  private startTime = Date.now();

  /**
   * Check if an action can be executed
   *
   * Returns false on ANY failure - global kill, agent kill, rate limit, or anomaly.
   * Returns true only if all checks pass.
   *
   * @param agentId - Agent attempting the action
   * @param action - Action to be executed
   * @returns Whether the action is allowed
   */
  async canExecute(agentId: string, action: Action): Promise<boolean> {
    // 1. Global kill switch (cached check)
    if (this.isKillSwitchActive('global')) {
      logger.warn('Action blocked: global kill switch active', { agentId, action: action.type });
      return false;
    }

    // 2. Agent-level kill switch (cached check)
    if (this.isKillSwitchActive(agentId)) {
      logger.warn('Action blocked: agent kill switch active', { agentId, action: action.type });
      return false;
    }

    // 3. Rate limit check
    const rateLimitKey = `${agentId}:${action.type}`;
    const rateLimitResult = await checkRateLimit(rateLimitKey, action.riskLevel);
    if (!rateLimitResult.allowed) {
      logger.warn('Action blocked: rate limit exceeded', {
        agentId,
        action: action.type,
        riskLevel: action.riskLevel,
        msBeforeNext: rateLimitResult.msBeforeNext,
      });

      await logAuditSafe({
        agentId,
        actionType: 'rate_limit_exceeded',
        actionDetail: `Rate limit exceeded for ${action.type} at ${action.riskLevel} risk level`,
        riskLevel: action.riskLevel,
      });

      return false;
    }

    // 4. Anomaly detection for high/critical risk actions
    if (action.riskLevel === 'high' || action.riskLevel === 'critical') {
      const anomalyCheck = await this.checkForAnomalies(agentId, action);
      if (!anomalyCheck) {
        logger.warn('Action blocked: anomaly detected', { agentId, action: action.type });
        return false;
      }
    }

    // 5. Track action for future anomaly detection
    this.trackAction(agentId, action);

    // All checks passed
    logger.debug('Action allowed', { agentId, action: action.type, riskLevel: action.riskLevel });
    return true;
  }

  /**
   * Emergency stop - disable agent or entire system
   *
   * @param reason - Reason for emergency stop
   * @param agentId - Optional agent ID (if not provided, global stop)
   */
  async emergencyStop(reason: string, agentId?: string): Promise<void> {
    this.lastEmergencyStop = new Date();
    this.lastEmergencyReason = reason;

    if (agentId) {
      // Agent-level stop
      this.agentEnabled.set(agentId, false);
      this.invalidateCache(agentId);
      logger.error('EMERGENCY STOP: Agent disabled', { agentId, reason });

      await logAuditSafe({
        agentId,
        actionType: 'emergency_stop',
        actionDetail: `Agent emergency stop: ${reason}`,
        riskLevel: 'critical',
      });
    } else {
      // Global stop
      this.globalKillSwitch = true;
      this.invalidateCache('global');
      logger.error('EMERGENCY STOP: Global kill switch activated', { reason });

      await logAuditSafe({
        agentId: 'system',
        actionType: 'global_emergency_stop',
        actionDetail: `Global emergency stop: ${reason}`,
        riskLevel: 'critical',
      });
    }

    // Notify operator via Telegram
    if (ADMIN_CHAT_ID) {
      await sendSystemAlert(ADMIN_CHAT_ID, {
        severity: 'critical',
        title: agentId ? `Agent Emergency Stop: ${agentId}` : 'Global Emergency Stop',
        message: reason,
        component: 'ControlPlane',
        action: agentId
          ? `Use /resume ${agentId} to re-enable`
          : 'Use /resume all to re-enable',
      });
    }
  }

  /**
   * Re-enable an agent after emergency stop
   *
   * @param agentId - Agent ID or 'all' for global
   */
  async enableAgent(agentId: string): Promise<void> {
    if (agentId === 'all') {
      this.globalKillSwitch = false;
      this.invalidateCache('global');
      logger.info('Global kill switch disabled');

      await logAuditSafe({
        agentId: 'system',
        actionType: 'global_resume',
        actionDetail: 'Global kill switch disabled',
        riskLevel: 'high',
      });
    } else {
      this.agentEnabled.set(agentId, true);
      this.invalidateCache(agentId);
      logger.info('Agent re-enabled', { agentId });

      await logAuditSafe({
        agentId,
        actionType: 'agent_resume',
        actionDetail: 'Agent re-enabled after emergency stop',
        riskLevel: 'high',
      });
    }

    // Notify operator
    if (ADMIN_CHAT_ID) {
      await sendSystemAlert(ADMIN_CHAT_ID, {
        severity: 'warning',
        title: agentId === 'all' ? 'Global Resume' : `Agent Resumed: ${agentId}`,
        message: 'Operations have been re-enabled',
        component: 'ControlPlane',
      });
    }
  }

  /**
   * Get current control plane status
   */
  getControlPlaneStatus(): ControlPlaneStatus {
    const disabledAgents: string[] = [];
    for (const [agentId, enabled] of this.agentEnabled) {
      if (!enabled) {
        disabledAgents.push(agentId);
      }
    }

    return {
      globalKillSwitch: this.globalKillSwitch,
      disabledAgents,
      lastEmergencyStop: this.lastEmergencyStop?.toISOString() || null,
      lastEmergencyReason: this.lastEmergencyReason,
      uptimeMs: Date.now() - this.startTime,
    };
  }

  /**
   * Check if global kill switch is active
   */
  isGlobalKillActive(): boolean {
    return this.globalKillSwitch;
  }

  /**
   * Check if kill switch is active (with caching)
   */
  private isKillSwitchActive(key: string): boolean {
    // Check cache first
    const cached = this.killSwitchCache.get(key);
    if (cached && Date.now() - cached.timestamp < KILL_SWITCH_CACHE_TTL) {
      return cached.value;
    }

    // Calculate fresh value
    let isActive: boolean;
    if (key === 'global') {
      isActive = this.globalKillSwitch;
    } else {
      // Agent-level: if not in map, default to enabled (true)
      isActive = this.agentEnabled.get(key) === false;
    }

    // Update cache
    this.killSwitchCache.set(key, {
      value: isActive,
      timestamp: Date.now(),
    });

    return isActive;
  }

  /**
   * Invalidate cache entry
   */
  private invalidateCache(key: string): void {
    this.killSwitchCache.delete(key);
  }

  /**
   * Check for anomalies in agent behavior
   */
  private async checkForAnomalies(agentId: string, action: Action): Promise<boolean> {
    const recentActions = this.recentActions.get(agentId) || [];

    // Check sequence anomaly
    const sequenceResult = detectSequenceAnomaly(agentId, recentActions);
    if (sequenceResult.isAnomaly) {
      recordAnomaly(
        agentId,
        action.skillId || 'unknown',
        action.domain || 'unknown',
        sequenceResult
      );

      await logAuditSafe({
        agentId,
        actionType: 'anomaly_detected',
        actionDetail: `Sequence anomaly: ${sequenceResult.reason}`,
        riskLevel: 'high',
      });

      // Notify on high severity
      if (sequenceResult.severity === 'high' && ADMIN_CHAT_ID) {
        await sendSystemAlert(ADMIN_CHAT_ID, {
          severity: 'warning',
          title: 'Anomaly Detected',
          message: sequenceResult.reason || 'Unusual behavior pattern detected',
          component: `Agent: ${agentId}`,
        });
      }

      return false;
    }

    return true;
  }

  /**
   * Track action for anomaly detection
   */
  private trackAction(agentId: string, action: Action): void {
    const actions = this.recentActions.get(agentId) || [];
    actions.push({
      type: action.type,
      timestamp: new Date(),
      success: true, // Will be updated on failure
      agentId,
      skillId: action.skillId,
    });

    // Keep only last 100 actions
    if (actions.length > 100) {
      actions.shift();
    }

    this.recentActions.set(agentId, actions);
  }

  /**
   * Record action result (for failure tracking)
   */
  recordActionResult(agentId: string, actionType: string, success: boolean): void {
    const actions = this.recentActions.get(agentId) || [];
    const lastAction = actions.find(
      (a) => a.type === actionType && a.timestamp.getTime() > Date.now() - 60000
    );
    if (lastAction) {
      lastAction.success = success;
    }
  }
}

// Singleton instance
const controlPlane = new AgentControlPlane();

// Export functions that wrap the singleton (agents can only call these, not modify instance)
export const canExecute = (agentId: string, action: Action) =>
  controlPlane.canExecute(agentId, action);

export const emergencyStop = (reason: string, agentId?: string) =>
  controlPlane.emergencyStop(reason, agentId);

export const enableAgent = (agentId: string) =>
  controlPlane.enableAgent(agentId);

export const getControlPlaneStatus = () =>
  controlPlane.getControlPlaneStatus();

export const isGlobalKillActive = () =>
  controlPlane.isGlobalKillActive();

export const recordActionResult = (agentId: string, actionType: string, success: boolean) =>
  controlPlane.recordActionResult(agentId, actionType, success);
