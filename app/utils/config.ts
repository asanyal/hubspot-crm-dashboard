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
    const rootUrl = process.env.NEXT_PUBLIC_API_ROOT_URL || 'http://localhost:8000';
    
    // Debug log to verify environment variable
    console.log('[API Config] Environment:', {
      NEXT_PUBLIC_API_ROOT_URL: process.env.NEXT_PUBLIC_API_ROOT_URL,
      NODE_ENV: process.env.NODE_ENV,
      rootUrl,
      originalEndpoint: endpoint
    });

    // If the endpoint already starts with /api/hubspot, just append it to the root URL
    if (endpoint.startsWith('/api/hubspot/')) {
      const fullUrl = `${rootUrl}${endpoint}`;
      console.log(`[API Config] Direct endpoint: ${endpoint} to URL: ${fullUrl}`);
      return fullUrl;
    }
    
    // Remove any leading slashes from the path to avoid double slashes
    const cleanPath = endpoint.replace(/^\/+/, '');
    
    // Construct the full URL
    const fullUrl = `${rootUrl}/api/hubspot/${cleanPath}`;
    
    console.log(`[API Config] Converting endpoint: ${endpoint} to URL: ${fullUrl}`);
    
    return fullUrl;
  }
};