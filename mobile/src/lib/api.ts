import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  ok: boolean;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return session.access_token;
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 by triggering token refresh
  if (response.status === 401) {
    const { data: { session }, error } = await supabase.auth.refreshSession();
    if (error || !session) {
      throw new Error('Session expired');
    }

    // Retry with refreshed token
    headers['Authorization'] = `Bearer ${session.access_token}`;
    const retryResponse = await fetch(url, { ...options, headers });

    if (!retryResponse.ok) {
      const text = await retryResponse.text();
      throw new Error(`API error ${retryResponse.status}: ${text}`);
    }

    const data = await retryResponse.json() as T;
    return { data, status: retryResponse.status, ok: retryResponse.ok };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const data = await response.json() as T;
  return { data, status: response.status, ok: response.ok };
}

export const apiClient = {
  get<T = unknown>(path: string) {
    return request<T>(path, { method: 'GET' });
  },

  post<T = unknown>(path: string, body?: unknown) {
    return request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T = unknown>(path: string, body?: unknown) {
    return request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T = unknown>(path: string) {
    return request<T>(path, { method: 'DELETE' });
  },
};

// Convenience exports
export const apiGet = apiClient.get;
export const apiPost = apiClient.post;
