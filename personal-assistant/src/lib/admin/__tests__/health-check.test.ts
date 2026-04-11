import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runHealthChecks, type ServiceHealth } from '../health-check';

describe('Health Checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for API checks
    global.fetch = vi.fn();
  });

  it('should return array of service health checks', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [{ id: '1' }], error: null })),
        })),
      })),
    };

    const result = await runHealthChecks(mockSupabase as any);
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should include supabase service check', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [{ id: '1' }], error: null })),
        })),
      })),
    };

    const result = await runHealthChecks(mockSupabase as any);
    const supabaseCheck = result.find((s) => s.service === 'supabase');
    expect(supabaseCheck).toBeDefined();
    expect(supabaseCheck?.status).toBe('healthy');
  });

  it('should mark anthropic as down when API key missing', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [{ id: '1' }], error: null })),
        })),
      })),
    };

    const result = await runHealthChecks(mockSupabase as any);
    const anthropic = result.find((s) => s.service === 'ai');
    expect(anthropic?.status).toBe('down');
    expect(anthropic?.error).toContain('not set');

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('should measure latency for each service', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [{ id: '1' }], error: null })),
        })),
      })),
    };

    const result = await runHealthChecks(mockSupabase as any);
    result.forEach((check) => {
      expect(check).toHaveProperty('latency_ms');
      expect(typeof check.latency_ms).toBe('number');
      expect(check.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  it('should mark supabase as degraded on query error', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Connection error' } })
          ),
        })),
      })),
    };

    const result = await runHealthChecks(mockSupabase as any);
    const supabaseCheck = result.find((s) => s.service === 'supabase');
    expect(supabaseCheck?.status).toBe('degraded');
    expect(supabaseCheck?.error).toContain('Connection error');
  });

  it('should include all expected services in results', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [{ id: '1' }], error: null })),
        })),
      })),
    };

    const result = await runHealthChecks(mockSupabase as any);
    const services = result.map((r) => r.service);
    expect(services).toContain('supabase');
    expect(services).toContain('ai');
    expect(services).toContain('resend');
    expect(services).toContain('whatsapp');
  });

  it('should have correct ServiceHealth structure', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [{ id: '1' }], error: null })),
        })),
      })),
    };

    const result = await runHealthChecks(mockSupabase as any);
    result.forEach((check) => {
      expect(check).toHaveProperty('service');
      expect(check).toHaveProperty('status');
      expect(check).toHaveProperty('latency_ms');
      expect(['healthy', 'degraded', 'down']).toContain(check.status);
    });
  });
});
