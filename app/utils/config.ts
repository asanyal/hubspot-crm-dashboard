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

  // V1 Endpoints
  [API_ENDPOINTS.COMPANY_OVERVIEW]: { useV2: false },
  [API_ENDPOINTS.CHAT]: { useV2: false },
  [API_ENDPOINTS.LOAD_CUSTOMER_TRANSCRIPTS]: { useV2: false },
  [API_ENDPOINTS.ASK_CUSTOMER]: { useV2: false }
} as const;

export const API_CONFIG = {
  getApiPath: (endpoint: string) => {
    const basePath = '/api/hubspot';
    // Find the matching endpoint constant
    const matchingEndpoint = Object.entries(API_ENDPOINTS).find(([_, path]) => path === endpoint)?.[1];
    const useV2 = matchingEndpoint ? API_VERSION_CONFIG[matchingEndpoint]?.useV2 : false;
    const finalPath = useV2 ? `${basePath}/v2${endpoint}` : `${basePath}${endpoint}`;
    
    console.log(`[API Version] Endpoint: ${endpoint}, Using V2: ${useV2}, Final Path: ${finalPath}`);
    
    return finalPath;
  }
}; 