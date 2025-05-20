import { API_CONFIG } from './config';

export async function makeApiCall(endpoint: string, options: RequestInit = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_ROOT_URL || 'https://midnight-snack-a7X9bQ.replit.app';
  const apiPath = API_CONFIG.getApiPath(endpoint);
  const url = `${baseUrl}${apiPath}`;
  console.log('ATIN SANYAL url', url);

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
  const baseUrl = process.env.NEXT_PUBLIC_API_ROOT_URL || 'https://midnight-snack-a7X9bQ.replit.app';
  // Remove trailing slash from baseUrl and leading slash from path
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBaseUrl}/${cleanPath}`;
}; 