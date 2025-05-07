import { API_CONFIG } from './config';

export async function makeApiCall(endpoint: string, options: RequestInit = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
  const apiPath = API_CONFIG.getApiPath(endpoint);
  const url = `${baseUrl}${apiPath}`;

  try {
    // Get existing headers or create empty object
    const existingHeaders: Record<string, string> = options.headers ? 
      Object.fromEntries(Object.entries(options.headers)) : {};

    // Check if browser ID and session ID are missing
    if (!existingHeaders['X-Browser-ID']) {
      console.log('X-Browser-ID header missing, adding default value');
      existingHeaders['X-Browser-ID'] = 'default';
    }
    if (!existingHeaders['X-Session-ID']) {
      console.log('X-Session-ID header missing, adding default value');
      existingHeaders['X-Session-ID'] = 'default';
    }

    // Create final headers object
    const headers = {
      'Content-Type': 'application/json',
      ...existingHeaders,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API call failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
}

export const getBackendUrl = (path: string) => {
  return `${path}`;
}; 