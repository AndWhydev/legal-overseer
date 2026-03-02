import { describe, it, expect } from 'vitest';
import {
  detectKeyType,
  validateAPIKey,
  maskKey,
  hashKey,
} from '../api-key-validator';

describe('API Key Type Detection', () => {
  it('should detect Anthropic keys', () => {
    const type = detectKeyType('sk-ant-abcdef1234567890');
    expect(type).toBe('anthropic');
  });

  it('should detect OpenAI keys', () => {
    const type = detectKeyType('sk-abcdef1234567890');
    expect(type).toBe('openai');
  });

  it('should detect Stripe keys', () => {
    const type = detectKeyType('sk_live_abcdef1234567890');
    expect(type).toBe('stripe');
  });

  it('should return null for unknown keys', () => {
    const type = detectKeyType('unknown_key_format');
    expect(type).toBeNull();
  });
});

describe('API Key Validation', () => {
  it('should accept valid Anthropic key', () => {
    const result = validateAPIKey('sk-ant-' + 'a'.repeat(50));
    expect(result.valid).toBe(true);
    expect(result.key_type).toBe('anthropic');
  });

  it('should reject key that is too short', () => {
    const result = validateAPIKey('short');
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain('too short');
  });

  it('should reject key with spaces', () => {
    const result = validateAPIKey('sk-ant-key with spaces');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('spaces'))).toBe(true);
  });

  it('should reject key with newlines', () => {
    const result = validateAPIKey('sk-ant-key\nwith\nnewlines');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('newlines'))).toBe(true);
  });

  it('should reject invalid Anthropic key format', () => {
    const result = validateAPIKey('sk-openai-' + 'a'.repeat(50), 'anthropic');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('sk-ant-'))).toBe(true);
  });

  it('should accept unknown key with minimum requirements', () => {
    const result = validateAPIKey('a'.repeat(32));
    expect(result.valid).toBe(true);
  });
});

describe('Key Masking', () => {
  it('should mask key keeping first 4 and last 4 chars', () => {
    const key = 'sk-ant-abcdefghijklmnopqrstuvwxyz';
    const masked = maskKey(key);
    expect(masked.startsWith('sk-a')).toBe(true);
    expect(masked.endsWith('wxyz')).toBe(true);
    expect(masked).toContain('*');
  });

  it('should handle short keys', () => {
    const masked = maskKey('short');
    expect(masked).toBe('****');
  });

  it('should handle empty keys', () => {
    const masked = maskKey('');
    expect(masked).toBe('****');
  });

  it('should handle keys exactly 8 chars', () => {
    const key = '12345678';
    const masked = maskKey(key);
    expect(masked).toContain('1234');
    expect(masked).toContain('5678');
  });
});

describe('Key Hashing', () => {
  it('should produce consistent hash for same key', async () => {
    const key = 'test-key-value';
    const hash1 = await hashKey(key);
    const hash2 = await hashKey(key);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different keys', async () => {
    const hash1 = await hashKey('key1');
    const hash2 = await hashKey('key2');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce non-empty hash', async () => {
    const hash = await hashKey('test');
    expect(hash.length).toBeGreaterThan(0);
  });
});
