// Define all available API endpoints
export const API_ENDPOINTS = {
  ALL_DEALS: '/all-deals',
  DEALS_BY_STAGE: '/deals',
  DEAL_TIMELINE: '/deal-timeline',
  PIPELINE_SUMMARY: '/pipeline-summary',
  STAGES: '/stages',
  COMPANY_OVERVIEW: '/company-overview',
  DEAL_INFO: '/deal-info',
  DEAL_ACTIVITIES_COUNT: '/deal-activities-count',
  CONTACTS_AND_CHAMPION: '/contacts-and-champion',
  EVENT_CONTENT: '/event-content',
  GET_CONCERNS: '/get-concerns',
  CHAT: '/chat',
  LOAD_CUSTOMER_TRANSCRIPTS: '/load-customer-transcripts',
  ASK_CUSTOMER: '/ask-customer'
} as const;

export const API_VERSION_CONFIG = {
  // V2 Endpoints
  [API_ENDPOINTS.ALL_DEALS]: { useV2: true },
  [API_ENDPOINTS.DEALS_BY_STAGE]: { useV2: true },
  [API_ENDPOINTS.DEAL_TIMELINE]: { useV2: true },
  [API_ENDPOINTS.PIPELINE_SUMMARY]: { useV2: true },
  [API_ENDPOINTS.STAGES]: { useV2: true },
  [API_ENDPOINTS.DEAL_INFO]: { useV2: true },
  [API_ENDPOINTS.DEAL_ACTIVITIES_COUNT]: { useV2: true },
  [API_ENDPOINTS.CONTACTS_AND_CHAMPION]: { useV2: true },
  [API_ENDPOINTS.EVENT_CONTENT]: { useV2: true },
  [API_ENDPOINTS.GET_CONCERNS]: { useV2: true },
  [API_ENDPOINTS.COMPANY_OVERVIEW]: { useV2: true },
  // V1 Endpoints
  [API_ENDPOINTS.CHAT]: { useV2: false },
  [API_ENDPOINTS.LOAD_CUSTOMER_TRANSCRIPTS]: { useV2: false },
  [API_ENDPOINTS.ASK_CUSTOMER]: { useV2: false }
} as const;

export const API_CONFIG = {
  getApiPath: (endpoint: string) => {
    // Add immediate logging of environment variables
    console.log('[API Config] Raw Environment Variables:', {
      'process.env.NEXT_PUBLIC_API_ROOT_URL': process.env.NEXT_PUBLIC_API_ROOT_URL,
      'process.env.NODE_ENV': process.env.NODE_ENV,
      'typeof NEXT_PUBLIC_API_ROOT_URL': typeof process.env.NEXT_PUBLIC_API_ROOT_URL,
      'window.env (if available)': typeof window !== 'undefined' ? (window as any).env : 'not available'
    });

    const rootUrl = process.env.NEXT_PUBLIC_API_ROOT_URL || 'http://localhost:8000';
    
    // Debug log to verify environment variable
    console.log('[API Config] Resolved Configuration:', {
      NEXT_PUBLIC_API_ROOT_URL: process.env.NEXT_PUBLIC_API_ROOT_URL,
      NODE_ENV: process.env.NODE_ENV,
      rootUrl,
      originalEndpoint: endpoint,
      'Using fallback?': !process.env.NEXT_PUBLIC_API_ROOT_URL
    });

    // Remove any leading slashes and 'api/hubspot' if present
    const cleanEndpoint = endpoint
      .replace(/^\/+/, '')
      .replace(/^api\/hubspot\//, '')
      .replace(/^hubspot\//, '');

    // Check if this endpoint should use v2
    const endpointKey = Object.entries(API_ENDPOINTS)
      .find(([_, path]) => cleanEndpoint.startsWith(path.replace(/^\//, '')))
      ?.[1];
    
    const useV2 = endpointKey ? API_VERSION_CONFIG[endpointKey]?.useV2 : false;
    
    // Construct the full URL with version if needed
    const versionPath = useV2 ? 'v2/' : '';
    const fullUrl = `${rootUrl}/api/hubspot/${versionPath}${cleanEndpoint}`;
    
    console.log(`[API Config] Final URL Construction:`, {
      rootUrl,
      cleanEndpoint,
      endpointKey,
      useV2,
      versionPath,
      fullUrl
    });
    
    return fullUrl;
  }
};