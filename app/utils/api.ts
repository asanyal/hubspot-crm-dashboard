import { API_CONFIG } from './config';

export async function makeApiCall(endpoint: string, options: RequestInit = {}) {
  const url = API_CONFIG.getApiPath(endpoint);

  try {
    // Get existing headers or create empty object
    const existingHeaders: Record<string, string> = options.headers ? 
      Object.fromEntries(Object.entries(options.headers)) : {};

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

export const getBackendUrl = (url: string) => {
  // If the URL already contains the backend host, return it as-is
  if (url.includes('localhost:8000') || url.includes('http://')) {
    return url;
  }
  
  // Otherwise, prepend the backend URL
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return `${backendUrl}${url}`;
}; 