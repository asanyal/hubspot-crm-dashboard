import { API_CONFIG } from './config';

export async function makeApiCall(endpoint: string, options: RequestInit = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
  const apiPath = API_CONFIG.getApiPath(endpoint);
  const url = `${baseUrl}${apiPath}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
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
  const backendUrl = process.env.NEXT_PUBLIC_API_ROOT_URL || 'http://localhost:8000';
  return `${backendUrl}${path}`;
}; 