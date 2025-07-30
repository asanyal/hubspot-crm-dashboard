export const API_CONFIG = {
  getApiPath: (endpoint: string) => {
    const rootUrl = process.env.NEXT_PUBLIC_API_URL;
    console.log("Backend URL is ", rootUrl);
    
    // Remove any leading slashes if present
    const cleanEndpoint = endpoint
      .replace(/^\/+/, '');

    return `${rootUrl}/api/hubspot/v2/${cleanEndpoint}`;
  }
};