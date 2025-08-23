export const API_CONFIG = {
  getApiPath: (endpoint: string) => {
    const rootUrl = process.env.NEXT_PUBLIC_API_ROOT_URL;
    
    
    const cleanEndpoint = endpoint
      .replace(/^\/+/, '');

    const fullyQualifiedApiPath = `${rootUrl}/api/hubspot/v2/${cleanEndpoint}`;
    console.log("Backend URL is ", fullyQualifiedApiPath);
    return fullyQualifiedApiPath;
  }
};