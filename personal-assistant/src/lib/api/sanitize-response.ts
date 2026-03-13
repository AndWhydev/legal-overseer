const FORBIDDEN_KEYS = ['model', 'tier', 'provider', 'model_id'];

export function sanitizeForClient<T extends Record<string, unknown>>(data: T): Partial<T> {
  const clean = { ...data };
  for (const key of FORBIDDEN_KEYS) {
    delete clean[key];
  }
  return clean;
}
