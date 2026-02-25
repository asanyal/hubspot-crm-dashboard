// app/components/DealStageSelector.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '../context/AppContext';
import { API_CONFIG } from '../utils/config';
import { 
  useReactTable, 
  getCoreRowModel, 
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState
} from '@tanstack/react-table';

interface Stage {
  pipeline_id: string;
  pipeline_name: string;
  stage_id: string;
  stage_name: string;
  display_order: number;
  probability: number;
  closed_won: boolean;
  closed_lost: boolean;
}

interface Deal {
  Deal_Name: string;
  Owner: string;
  Amount: string;
  Expected_Close_Date: string;
  Closed_Won: boolean;
  Closed_Lost: boolean;
}



interface DealSignalMeeting {
  subject: string;
  date: string;
  buyer_intent: string;
  buyer_intent_explanation: Record<string, string[]> | string;
}

interface DealSignals {
  very_likely_to_buy: number;
  likely_to_buy: number;
  less_likely_to_buy: number;
  meetings?: DealSignalMeeting[];
}

interface DealSignalsData {
  [dealName: string]: DealSignals;
}

interface DealInsights {
  pricing_concerns: string[];
  pricing_concerns_no_data: string[];
  no_decision_maker: string[];
  no_decision_maker_no_data: string[];
  using_competitor: string[];
  using_competitor_no_data: string[];
}

interface ActivityCount {
  count: number;
}

// Add color utility functions
const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 80%)`;
};

const getTextColor = (bgColor: string): string => {
  // Convert HSL to RGB and check if it's light or dark
  const [h, s, l] = bgColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
  return l > 60 ? '#1a1a1a' : '#ffffff';
};

const formatStageAbbr = (stageName: string): string => {
  return stageName
    .split(' ')
    .map(word => word[0])
    .join('')
    .replace(/[0-9]/g, '') // Remove any numbers
    .toUpperCase();
};

const formatOwnerInitials = (owner: string | null | undefined): string => {
  if (!owner || typeof owner !== 'string') return '';
  
  // Handle special cases
  if (owner.toLowerCase() === 'unknown owner') return 'UNK';
  
  // Remove any special characters and extra spaces
  const cleanOwner = owner.replace(/[^a-zA-Z\s]/g, '').trim();
  if (!cleanOwner) return '';
  
  return cleanOwner
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase();
};

interface DealStageSelectorProps {
  isMainSidebarCollapsed?: boolean;
}

const DealStageSelector: React.FC<DealStageSelectorProps> = ({ isMainSidebarCollapsed = false }) => {
  const { state, updateState } = useAppState();
  const { 
    selectedStage, 
    availableStages, 
    dealsByStage, 
    loading, 
    stagesLoading, 
    error,
    lastFetched 
  } = state.dealsByStage;
  

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'deal_name', desc: false }
  ]);
  const [hasMounted, setHasMounted] = useState(false);
  const [failedStages, setFailedStages] = useState<Set<string>>(new Set());

  const [activityCounts, setActivityCounts] = useState<Record<string, number | 'N/A'>>({});
  const [activityCountsLoading, setActivityCountsLoading] = useState(false);
  const [signalsData, setSignalsData] = useState<DealSignalsData | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsData, setInsightsData] = useState<DealInsights | null>(null);
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set(['deal_name']));
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'deal_name', 'positives', 'risks', 'stage', 'activity_count'
  ]));
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDealName, setDrawerDealName] = useState<string | null>(null);
  const [drawerType, setDrawerType] = useState<'positives' | 'risks' | null>(null);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [drawerSearch, setDrawerSearch] = useState('');
  const router = useRouter();
  
  // Track URL parameters
  const [urlStage, setUrlStage] = useState<string | null>(null);
  const [urlAutoload, setUrlAutoload] = useState<boolean>(false);
  
  // Loading timeout reference - used to track the automatic loading reset
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  
  // Timestamp for data expiration (5 minutes = 300000 milliseconds)
  const DATA_EXPIRY_TIME = 300000;
  
  // Get URL search parameters
  const getSearchParams = useCallback(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  }, []);
  
  // Escape key to close drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [drawerOpen]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  
  // Set hasMounted to true after component mounts and read URL parameters
  useEffect(() => {
    setHasMounted(true);
    
    // Read URL parameters on mount
    const searchParams = getSearchParams();
    const stageFromUrl = searchParams.get('stage');
    const autoload = searchParams.get('autoload') === 'true';
    
    // Store URL parameters in state
    setUrlStage(stageFromUrl);
    setUrlAutoload(autoload);
    
    return () => {
      // Clear any state when component unmounts
      setFailedStages(new Set());
      setHasMounted(false);
      
      // Clear any timeouts to prevent memory leaks
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [getSearchParams]);
  
  // Setup safety timeout for loading state
  useEffect(() => {
    // Clear any existing timeout when loading state changes
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    // Set a new timeout if we're in loading state
    if (loading) {
      loadingTimeoutRef.current = setTimeout(() => {
        console.log('Loading timeout triggered - resetting loading state');
        updateState('dealsByStage.loading', false);
      }, 15000); // 15 seconds should be enough for any normal API call
    }
    
    return () => {
      // Clear timeout on cleanup
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [loading, updateState]);
  
  // Add session management state
  const [browserId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('browserId') || crypto.randomUUID();
    }
    return crypto.randomUUID();
  });

  // Utility function for making API calls with session management
  const makeApiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    const sessionId = localStorage.getItem('sessionId') || '';
    
    const headers = {
      'X-Browser-ID': browserId,
      'X-Session-ID': sessionId,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Store session ID from response headers if present
      const newSessionId = response.headers.get('X-Session-ID');
      if (newSessionId) {
        localStorage.setItem('sessionId', newSessionId);
      }

      // Handle different status codes
      if (response.status === 400) {
        const errorText = await response.text();
        if (errorText.includes('Browser ID is required')) {
          console.error('Browser ID is missing or invalid:', {
            browserId,
            url,
            headers
          });
        }
        throw new Error(`Bad request: ${errorText}`);
      } else if (response.status === 409) {
        console.warn('Request was cancelled by a new request');
        return null;
      } else if (response.status === 504) {
        console.error('Request timed out');
        throw new Error('Request timed out. Please try again.');
      } else if (response.status === 500) {
        console.error('Server error');
        throw new Error('Server error. Please try again later.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed: ${response.status} - ${errorText}`);
      }

      return response;
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  }, [browserId]);

  // Update fetchStages to use makeApiCall
  const fetchStages = useCallback(async (): Promise<void> => {
    console.log('fetchStages called, current state:', {
      stagesLoading,
      availableStagesLength: availableStages.length,
      lastFetched,
      currentTime: Date.now()
    });

    // If we already have stages and they're not stale, just ensure loading state is false
    if (availableStages.length > 0 && lastFetched && (Date.now() - lastFetched <= DATA_EXPIRY_TIME)) {
      console.log('Using existing stages data');
      updateState('dealsByStage.stagesLoading', false);
      return;
    }

    // Set loading state before starting the fetch
    updateState('dealsByStage.stagesLoading', true);
    updateState('dealsByStage.error', null);
    
    try {
      console.log('Fetching pipeline stages...');
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/stages')}`);
      
      console.log(`Stages response status: ${response?.status}`);
      
      if (response) {
        const data = await response.json();
        console.log(`Received ${data.length} pipeline stages:`, data);
        
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No valid stages received from the API');
        }
        
        // Sort stages by display order
        const sortedStages = [...data].sort((a, b) => a.display_order - b.display_order);
        
        // Update the context
        updateState('dealsByStage.availableStages', sortedStages);
        updateState('dealsByStage.lastFetched', Date.now());
        
        console.log('Successfully updated stages in state:', {
          stagesCount: sortedStages.length,
          stages: sortedStages
        });
        
        // If we have a URL stage parameter, ensure it exists in the fetched stages
        if (urlStage && !sortedStages.some((s: Stage) => s.stage_name === urlStage)) {
          console.warn(`URL stage "${urlStage}" not found in available stages`);
          setUrlStage(null);
        }
      }
    } catch (error) {
      console.error('Error fetching stages:', error);
      updateState('dealsByStage.error', 'Failed to load stages. Please try refreshing.');
      updateState('dealsByStage.availableStages', []);
    } finally {
      console.log('Setting stagesLoading to false');
      updateState('dealsByStage.stagesLoading', false);
    }
  }, [updateState, urlStage, lastFetched, DATA_EXPIRY_TIME, makeApiCall]);

  // Simplify the initial fetch effect
  useEffect(() => {
    console.log('Initial fetch effect running:', {
      hasMounted,
      availableStagesLength: availableStages.length,
      stagesLoading,
      lastFetched
    });

    if (!hasMounted) {
      console.log('Component not mounted yet, skipping fetch');
      return;
    }

    // Only fetch if we don't have stages or if they're stale
    if (availableStages.length === 0 || (lastFetched && Date.now() - lastFetched > DATA_EXPIRY_TIME)) {
      console.log('Fetching stages...');
      fetchStages();
    }
  }, [hasMounted, availableStages.length, lastFetched, DATA_EXPIRY_TIME]);

  // Add a safety timeout for stages loading
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (stagesLoading) {
      timeoutId = setTimeout(() => {
        console.log('Stages loading timeout triggered - resetting loading state');
        updateState('dealsByStage.stagesLoading', false);
        updateState('dealsByStage.error', 'Stages loading timed out. Please try refreshing.');
      }, 10000); // 10 second timeout
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [stagesLoading, updateState]);

  // Add a debug effect to monitor state changes
  useEffect(() => {
    console.log('State changed:', {
      stagesLoading,
      availableStagesLength: availableStages.length,
      error,
      lastFetched
    });
  }, [stagesLoading, availableStages.length, error, lastFetched]);

  // Click outside column menu to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setIsColumnMenuOpen(false);
      }
    };

    if (isColumnMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColumnMenuOpen]);
  
  // Update fetchDealsForStage to use makeApiCall
  const fetchDealsForStage = useCallback(async (stageName: string): Promise<void> => {
    if (!stageName) return;
    
    // Skip if already loaded or previously failed
    if ((dealsByStage[stageName] && dealsByStage[stageName].length >= 0) || 
        failedStages.has(stageName) || 
        loading) {
      return;
    }
    
    // Set loading state
    updateState('dealsByStage.loading', true);
    updateState('dealsByStage.error', null);
    
    try {
      console.log(`Fetching deals for stage: ${stageName}`);
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/deals')}?stage=${encodeURIComponent(stageName)}`);
      
      // Log the entire response for debugging
      console.log(`Response status: ${response?.status}`);
      
      if (response) {
        const data = await response.json();
        console.log(`Received ${data.length} deals for stage: ${stageName}`);
        
        // Update the context with the new deals
        updateState('dealsByStage.dealsByStage', {
          ...dealsByStage,
          [stageName]: data
        });
      }
    } catch (error) {
      console.error(`Error fetching deals for ${stageName}:`, error);
      updateState('dealsByStage.error', `Failed to load deals for ${stageName}`);
      
      // Add this stage to the failed stages set to prevent infinite retries
      setFailedStages(prev => new Set(prev).add(stageName));
      
      // Initialize this stage with an empty array to prevent repeated fetching
      updateState('dealsByStage.dealsByStage', {
        ...dealsByStage,
        [stageName]: []
      });
    } finally {
      updateState('dealsByStage.loading', false);
    }
  }, [dealsByStage, failedStages, loading, updateState, makeApiCall]);
  
  // Handle stage selection after stages are available
  useEffect(() => {
    if (!hasMounted || stagesLoading || availableStages.length === 0) return;
    
    // Choose which stage to select
    let stageToSelect = selectedStage;
    
    // If URL has a stage parameter and it exists in available stages, use that
    if (urlStage && availableStages.some(s => s.stage_name === urlStage)) {
      stageToSelect = urlStage;
      
      // If autoload is true, force refresh the data for this stage
      if (urlAutoload) {
        // Clear any cached data for this stage to force a fresh load
        const updatedDealsByStage = {...dealsByStage};
        if (updatedDealsByStage[urlStage]) {
          delete updatedDealsByStage[urlStage];
          updateState('dealsByStage.dealsByStage', updatedDealsByStage);
        }
        
        // Remove from failed stages if needed
        if (failedStages.has(urlStage)) {
          setFailedStages(prev => {
            const newSet = new Set(prev);
            newSet.delete(urlStage);
            return newSet;
          });
        }
      }
    } 
    // If no URL stage or no selected stage, use the first available stage
    else if (!stageToSelect && availableStages.length > 0) {
      stageToSelect = availableStages[0].stage_name;
    }
    
    // Only update if different from current selection
    if (stageToSelect && stageToSelect !== selectedStage) {
      console.log(`Setting selected stage to: ${stageToSelect}`);
      updateState('dealsByStage.selectedStage', stageToSelect);
    }
    
    // Clear URL parameters after handling them
    setUrlStage(null);
    setUrlAutoload(false);
    
  }, [
    hasMounted, 
    stagesLoading, 
    availableStages, 
    selectedStage, 
    urlStage, 
    urlAutoload, 
    dealsByStage, 
    failedStages, 
    updateState
  ]);

  // Handle fetching deals for selected stage
  useEffect(() => {
    if (!hasMounted || !selectedStage || stagesLoading) return;
    
    // Skip if we already have deals for this stage or if it failed before
    if (dealsByStage[selectedStage] !== undefined || failedStages.has(selectedStage) || loading) {
      return;
    }
    
    // Fetch deals for this stage
    fetchDealsForStage(selectedStage);
  }, [hasMounted, selectedStage, stagesLoading, dealsByStage, failedStages, loading, fetchDealsForStage]);

  // Add a debounce effect to delay filtering until typing stops
  useEffect(() => {
    // Set a timeout to update the debounced value
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms delay
    
    // Cleanup function to clear the timeout if the search term changes again
    return () => {
      clearTimeout(timerId);
    };
  }, [searchTerm]);

  // Compute which deals have theme matches for the current search term
  const themeMatches = useMemo(() => {
    const result: Record<string, { positives: boolean; risks: boolean }> = {};
    const term = debouncedSearchTerm.toLowerCase().trim();
    if (!term || !signalsData) return result;

    const meetingMatchesTerm = (m: DealSignalMeeting): boolean => {
      const explanation = m.buyer_intent_explanation;
      if (!explanation) return false;
      if (typeof explanation === 'string') return explanation.toLowerCase().includes(term);
      return Object.entries(explanation).some(([theme, bullets]) =>
        theme.toLowerCase().includes(term) ||
        (Array.isArray(bullets) && bullets.some(b => typeof b === 'string' ? b.toLowerCase().includes(term) : JSON.stringify(b).toLowerCase().includes(term)))
      );
    };

    Object.entries(signalsData).forEach(([dealName, signals]) => {
      const meetings = signals.meetings || [];
      const posMatch = meetings.some(m =>
        (m.buyer_intent === 'Likely to buy' || m.buyer_intent === 'Very likely to buy') && meetingMatchesTerm(m)
      );
      const riskMatch = meetings.some(m =>
        (m.buyer_intent === 'Less likely to buy' || m.buyer_intent === 'Neutral') && meetingMatchesTerm(m)
      );
      if (posMatch || riskMatch) {
        result[dealName] = { positives: posMatch, risks: riskMatch };
      }
    });
    return result;
  }, [debouncedSearchTerm, signalsData]);

  // Handler for stage selection
  const handleStageSelect = useCallback((stageName: string): void => {
    // Prevent clicks while loading stages or if already selected
    if (stagesLoading || stageName === selectedStage) return;
    
    // Clear any failed status for this stage when manually selected
    if (failedStages.has(stageName)) {
      setFailedStages(prev => {
        const newSet = new Set(prev);
        newSet.delete(stageName);
        return newSet;
      });
    }
    
    // Update the selected stage
    updateState('dealsByStage.selectedStage', stageName);
    updateState('dealsByStage.error', null);
    
    // Update URL with selected stage
    const newSearchParams = new URLSearchParams(getSearchParams());
    newSearchParams.set('stage', stageName);
    newSearchParams.set('autoload', 'true');
    
    // Use window.history to update URL without reloading
    if (typeof window !== 'undefined') {
      window.history.pushState(
        {},
        '',
        `${window.location.pathname}?${newSearchParams.toString()}`
      );
    }
  }, [stagesLoading, selectedStage, failedStages, updateState, getSearchParams]);

  // Navigate to deal timeline
  const navigateToDealTimeline = useCallback((dealName: string) => {
    const encodedDealName = encodeURIComponent(dealName);
    // Force a complete page reload and clear history
    window.location.replace(`/deal-timeline?dealName=${encodedDealName}&autoload=true&t=${Date.now()}`);
  }, []);

  // Format amount as currency
  const formatAmount = (amount: string): string => {
    if (!amount || amount === 'Not specified') return amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(parseFloat(amount.replace(/[^0-9.-]+/g, '')));
  };

  // Get stage chip style based on stage name
  const getStageChipStyle = (stageName: string) => {
    const isActive = selectedStage === stageName;
    
    // Base classes
    let classes = "py-2 px-4 rounded-full text-sm font-medium transition-colors duration-200 ";
    
    // Find matching stage to check if it's a closed stage
    const stageInfo = availableStages.find(s => s.stage_name === stageName);
    
    if (isActive) {
      classes += "bg-sky-600 text-white ";
    } else if (stageInfo?.closed_won) {
      classes += "bg-gray-200 text-gray-800 hover:bg-gray-300 ";
    } else if (stageInfo?.closed_lost) {
      classes += "bg-gray-200 text-gray-800 hover:bg-gray-300 ";
    } else {
      classes += "bg-gray-200 text-gray-800 hover:bg-gray-300 ";
    }
    
    return classes;
  };

  // Get current deals based on selected stage
  const getCurrentDeals = useCallback((): Deal[] => {
    const dealsForStage = (selectedStage && dealsByStage[selectedStage]) || [];

    if (!debouncedSearchTerm.trim()) {
      return dealsForStage;
    }

    const lowerCaseSearch = debouncedSearchTerm.toLowerCase();
    
    return dealsForStage.filter(deal => {
      // Safely handle null/undefined values and convert to string
      const dealName = String(deal.Deal_Name || '');
      const owner = String(deal.Owner || '');
      const amount = String(deal.Amount || '');
      const expectedCloseDate = String(deal.Expected_Close_Date || '');

      return (
        dealName.toLowerCase().includes(lowerCaseSearch) ||
        owner.toLowerCase().includes(lowerCaseSearch) ||
        amount.toLowerCase().includes(lowerCaseSearch) ||
        expectedCloseDate.toLowerCase().includes(lowerCaseSearch) ||
        !!themeMatches[dealName]
      );
    });
  }, [selectedStage, dealsByStage, debouncedSearchTerm, themeMatches]);

  const filteredDeals = useMemo(() => {
    const dealsForStage = (selectedStage && dealsByStage[selectedStage]) || [];
    
    // If search is empty, return all deals without filtering
    if (!searchTerm.trim()) {
      return dealsForStage;
    }
    
    const lowerCaseSearch = searchTerm.toLowerCase();
    
    // Only filter when necessary
    return dealsForStage.filter(deal => {
      // Safely handle null/undefined values and convert to string
      const dealName = String(deal.Deal_Name || '');
      const owner = String(deal.Owner || '');
      const amount = String(deal.Amount || '');
      const expectedCloseDate = String(deal.Expected_Close_Date || '');

      // Most common fields first for better performance (short-circuit evaluation)
      return (
        dealName.toLowerCase().includes(lowerCaseSearch) ||
        owner.toLowerCase().includes(lowerCaseSearch) ||
        amount.toLowerCase().includes(lowerCaseSearch) ||
        expectedCloseDate.toLowerCase().includes(lowerCaseSearch) ||
        !!themeMatches[dealName]
      );
    });
  }, [selectedStage, dealsByStage, searchTerm, themeMatches]);
  



  // Function to get storage key for insights
  const getInsightsStorageKey = useCallback((stageName: string) => {
    return `insights_${stageName}`;
  }, []);

  // Function to get storage key for activity counts
  const getActivityCountsStorageKey = useCallback((stageName: string) => {
    return `activity_counts_${stageName}`;
  }, []);

  // Function to get storage key for signals
  const getSignalsStorageKey = useCallback((stageName: string) => {
    return `signals_${stageName}`;
  }, []);





  // Function to load insights from storage
  const loadInsightsFromStorage = useCallback((stageName: string) => {
    const storageKey = getInsightsStorageKey(stageName);
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        setInsightsData(parsedData);
        return true;
      } catch (error) {
        console.error('Error parsing stored insights:', error);
        localStorage.removeItem(storageKey);
      }
    }
    return false;
  }, [getInsightsStorageKey]);

  // Function to load activity counts from storage
  const loadActivityCountsFromStorage = useCallback((stageName: string) => {
    const storageKey = getActivityCountsStorageKey(stageName);
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        setActivityCounts(parsedData);
        return true;
      } catch (error) {
        console.error('Error parsing stored activity counts:', error);
        localStorage.removeItem(storageKey);
      }
    }
    return false;
  }, [getActivityCountsStorageKey]);

  // Function to save insights to storage
  const saveInsightsToStorage = useCallback((stageName: string, data: DealInsights) => {
    const storageKey = getInsightsStorageKey(stageName);
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [getInsightsStorageKey]);

  // Function to save activity counts to storage
  const saveActivityCountsToStorage = useCallback((stageName: string, data: Record<string, number | 'N/A'>) => {
    const storageKey = getActivityCountsStorageKey(stageName);
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [getActivityCountsStorageKey]);

  // Function to load signals from storage
  const loadSignalsFromStorage = useCallback((stageName: string) => {
    const storageKey = getSignalsStorageKey(stageName);
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        // Invalidate cache if it lacks meetings data (old format)
        const firstDeal = Object.values(parsedData)[0] as DealSignals | undefined;
        if (firstDeal && !firstDeal.meetings) {
          localStorage.removeItem(storageKey);
          return false;
        }
        setSignalsData(parsedData);
        return true;
      } catch (error) {
        console.error('Error parsing stored signals:', error);
        localStorage.removeItem(storageKey);
      }
    }
    return false;
  }, [getSignalsStorageKey]);

  // Function to save signals to storage
  const saveSignalsToStorage = useCallback((stageName: string, data: DealSignalsData) => {
    const storageKey = getSignalsStorageKey(stageName);
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [getSignalsStorageKey]);



  // Fetch insights data
  const fetchInsights = useCallback(async (dealNames: string[]) => {
    if (!dealNames.length) return;
    
    setInsightsLoading(true);
    try {
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/deal-insights-aggregate')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dealNames),
      });
      
      if (response) {
        const data = await response.json();
        setInsightsData(data);
        if (selectedStage) {
          saveInsightsToStorage(selectedStage, data);
        }
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setInsightsLoading(false);
    }
  }, [makeApiCall, selectedStage, saveInsightsToStorage]);

  // Fetch activity counts for all deals
  const fetchActivityCounts = useCallback(async (dealNames: string[]) => {
    if (!dealNames.length) return;
    
    setActivityCountsLoading(true);
    try {
      // Fetch all activity counts in parallel
              const promises = dealNames.map(async (dealName) => {
          try {
            const response = await makeApiCall(`${API_CONFIG.getApiPath('/deal-activities-count')}?dealName=${encodeURIComponent(dealName)}`);
            if (response) {
              const data = await response.json();
            return { dealName, count: data.count };
          }
        } catch (error) {
          console.error(`Error fetching activity count for ${dealName}:`, error);
          return { dealName, count: 'N/A' as const };
        }
      });

      const results = await Promise.all(promises);
      const countsMap: Record<string, number | 'N/A'> = {};
      
      results.forEach((result) => {
        if (result) {
          countsMap[result.dealName] = result.count;
        }
      });

      setActivityCounts(countsMap);
      if (selectedStage) {
        saveActivityCountsToStorage(selectedStage, countsMap);
      }
    } catch (error) {
      console.error('Error fetching activity counts:', error);
    } finally {
      setActivityCountsLoading(false);
    }
  }, [makeApiCall, selectedStage, saveActivityCountsToStorage]);

  // Fetch signals data for all deals in batches of 10
  const fetchSignals = useCallback(async (dealNames: string[]) => {
    if (!dealNames.length) return;
    
    setSignalsLoading(true);
    try {
      const BATCH_SIZE = 10;
      const allSignalsData: DealSignalsData = {};
      
      // Process deals in batches
      for (let i = 0; i < dealNames.length; i += BATCH_SIZE) {
        const batch = dealNames.slice(i, i + BATCH_SIZE);
        console.log(`Fetching signals for batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dealNames.length / BATCH_SIZE)} (${batch.length} deals)`);
        
        try {
          const response = await makeApiCall(`${API_CONFIG.getApiPath('/get-signals-group')}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ deal_names: batch }),
          });
          
          if (response) {
            const batchData = await response.json();
            // Merge batch data into all signals data
            Object.assign(allSignalsData, batchData);
            
            // Update state with partial data as it comes in
            setSignalsData(prev => ({ ...prev, ...batchData }));
            
            console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} completed - ${Object.keys(batchData).length} deals updated`);
          }
        } catch (error) {
          console.error(`Error fetching signals for batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
          // Continue with next batch even if this one fails
        }
        
        // Add a small delay between batches to avoid overwhelming the API
        if (i + BATCH_SIZE < dealNames.length) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between batches
        }
      }
      
      // Save complete data to storage
      if (selectedStage) {
        saveSignalsToStorage(selectedStage, allSignalsData);
      }
      
      console.log(`Completed fetching signals for ${dealNames.length} deals in ${Math.ceil(dealNames.length / BATCH_SIZE)} batches`);
    } catch (error) {
      console.error('Error in fetchSignals:', error);
    } finally {
      setSignalsLoading(false);
    }
  }, [makeApiCall, selectedStage, saveSignalsToStorage]);

  // Function to toggle column pinning
  const toggleColumnPin = useCallback((columnId: string) => {
    setPinnedColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnId)) {
        newSet.delete(columnId);
      } else {
        newSet.add(columnId);
      }
      return newSet;
    });
  }, []);

  // Function to toggle column visibility
  const toggleColumnVisibility = useCallback((columnId: string) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnId)) {
        newSet.delete(columnId);
      } else {
        newSet.add(columnId);
      }
      return newSet;
    });
  }, []);

  // Function to show all columns
  const showAllColumns = useCallback(() => {
    setVisibleColumns(new Set([
      'deal_name', 'positives', 'risks', 'stage', 'activity_count'
    ]));
  }, []);

  // Function to hide all columns (except deal_name which is required)
  const hideAllColumns = useCallback(() => {
    setVisibleColumns(new Set(['deal_name']));
  }, []);

  // Column display names mapping
  const columnDisplayNames = useMemo(() => ({
    deal_name: 'Deal Name',
    positives: 'Positives',
    risks: 'Risks',
    stage: 'Stage',
    activity_count: 'Activity Count'
  }), []);



  // Effect to fetch insights after deals load
  useEffect(() => {
    if (!selectedStage || !dealsByStage[selectedStage]) return;

    // Try to load from storage first
    if (loadInsightsFromStorage(selectedStage)) {
      return;
    }

    const dealNames = dealsByStage[selectedStage].map(deal => deal.Deal_Name);
    
    // Clear any existing timeout
    const timeoutId = setTimeout(() => {
      fetchInsights(dealNames);
    }, 1000); // 1 second delay

    return () => clearTimeout(timeoutId);
  }, [selectedStage, dealsByStage, fetchInsights, loadInsightsFromStorage]);

  // Effect to fetch activity counts after deals load
  useEffect(() => {
    if (!selectedStage || !dealsByStage[selectedStage]) return;

    // Try to load from storage first
    if (loadActivityCountsFromStorage(selectedStage)) {
      return;
    }

    const dealNames = dealsByStage[selectedStage].map(deal => deal.Deal_Name);
    
    // Clear any existing timeout
    const timeoutId = setTimeout(() => {
      fetchActivityCounts(dealNames);
    }, 1500); // 1.5 second delay to avoid overwhelming the API

    return () => clearTimeout(timeoutId);
  }, [selectedStage, dealsByStage, fetchActivityCounts, loadActivityCountsFromStorage]);

  // Effect to fetch signals after deals load
  useEffect(() => {
    if (!selectedStage || !dealsByStage[selectedStage]) return;

    const dealNames = dealsByStage[selectedStage].map(deal => deal.Deal_Name);

    // Try to load from storage first
    if (loadSignalsFromStorage(selectedStage)) {
      return;
    }

    // Clear any existing timeout
    const timeoutId = setTimeout(() => {
      fetchSignals(dealNames);
    }, 2000); // 2 second delay to avoid overwhelming the API

    return () => clearTimeout(timeoutId);
  }, [selectedStage, dealsByStage, fetchSignals, loadSignalsFromStorage]);

  // Auto-sort by positives once signals data loads
  useEffect(() => {
    // Only auto-sort if we have signals data and we're not already sorted by positives
    if (signalsData && Object.keys(signalsData).length > 0 && !signalsLoading) {
      const currentSort = sorting[0];
      // If not already sorted by positives, set it to descending
      if (!currentSort || currentSort.id !== 'positives') {
        setSorting([{ id: 'positives', desc: true }]);
      }
    }
  }, [signalsData, signalsLoading]);







  // Update the handleRefresh function
  const handleRefresh = useCallback(() => {
    console.log('Manual refresh triggered');
    
    // Read URL parameters again in case they've changed
    const searchParams = getSearchParams();
    const stageFromUrl = searchParams.get('stage');
    const autoload = searchParams.get('autoload') === 'true';
    
    // Store URL parameters in state for processing
    setUrlStage(stageFromUrl);
    setUrlAutoload(autoload);
    
    // Clear failed stages on manual refresh
    setFailedStages(new Set());
    
    // Clear error state
    updateState('dealsByStage.error', null);
    
    // Force reset loading states
    updateState('dealsByStage.loading', false);
    updateState('dealsByStage.stagesLoading', false);
    
    // Clear the stages to force a fresh fetch
    updateState('dealsByStage.availableStages', []);
    updateState('dealsByStage.lastFetched', null);

    // Clear insights, activity counts and signals data and storage
    setInsightsData(null);
    setActivityCounts({});
    setSignalsData(null);
    if (selectedStage) {
      localStorage.removeItem(getInsightsStorageKey(selectedStage));
      localStorage.removeItem(getActivityCountsStorageKey(selectedStage));
      localStorage.removeItem(getSignalsStorageKey(selectedStage));
    }
    
    // Fetch stages (which will trigger the rest of the initialization flow)
    fetchStages();
  }, [updateState, fetchStages, getSearchParams, selectedStage, getInsightsStorageKey, getActivityCountsStorageKey, getSignalsStorageKey]);

  // Function to render sort indicator
  const renderSortIndicator = (column: any) => {
    // Get current sort direction
    const sortDirection = column.getIsSorted();
    
    if (sortDirection === 'asc') {
      // Ascending sort
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1 text-sky-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
      );
    } else if (sortDirection === 'desc') {
      // Descending sort
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1 text-sky-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      );
    } else {
      // Not sorted - show subtle indicator
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      );
    }
  };

  // Create column helper
  const columnHelper = createColumnHelper<Deal>();

  // Define all columns
  const allColumns = useMemo(() => [
    columnHelper.accessor('Deal_Name', {
      id: 'deal_name',
      header: 'Deal Name',
      size: 250,
      maxSize: 250,
      cell: info => {
        const dealName = info.getValue();
        const encodedDealName = encodeURIComponent(dealName);
        return (
          <div className="max-w-[250px] flex items-center gap-1.5">
            <span className="font-medium text-gray-900 truncate" title={dealName}>
              {dealName}
            </span>
            <a
              href={`/deal-timeline?dealName=${encodedDealName}&autoload=true&t=${Date.now()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-sky-600 hover:text-sky-800 transition-colors"
              title="Open deal timeline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        );
      },
    }),
    columnHelper.accessor((row) => {
      const dealName = row.Deal_Name;
      const signals = signalsData?.[dealName];
      const hasNoCompetitorData = insightsData?.using_competitor_no_data?.includes(dealName) || false;
      const hasCompetitor = insightsData?.using_competitor?.includes(dealName) || false;
      const hasNoPricingData = insightsData?.pricing_concerns_no_data?.includes(dealName) || false;
      const hasPricingConcerns = insightsData?.pricing_concerns?.includes(dealName) || false;
      const hasNoDecisionMakerData = insightsData?.no_decision_maker_no_data?.includes(dealName) || false;
      const noDecisionMaker = insightsData?.no_decision_maker?.includes(dealName) || false;

      const buyingSignals = (signals?.likely_to_buy || 0) + (signals?.very_likely_to_buy || 0);
      const positiveMeetings = (signals?.meetings || []).filter((m: any) =>
        m.buyer_intent === 'Likely to buy' || m.buyer_intent === 'Very likely to buy'
      ).length;

      let count = buyingSignals + positiveMeetings;
      if (!hasNoCompetitorData && !hasCompetitor) count += 1;
      if (!hasNoPricingData && !hasPricingConcerns) count += 1;
      if (!hasNoDecisionMakerData && !noDecisionMaker) count += 1;

      return count;
    }, {
      id: 'positives',
      header: 'Positives',
      cell: info => {
        const dealName = info.row.original.Deal_Name;
        const signals = signalsData?.[dealName];
        const hasNoCompetitorData = insightsData?.using_competitor_no_data?.includes(dealName) || false;
        const hasCompetitor = insightsData?.using_competitor?.includes(dealName) || false;
        const hasNoPricingData = insightsData?.pricing_concerns_no_data?.includes(dealName) || false;
        const hasPricingConcerns = insightsData?.pricing_concerns?.includes(dealName) || false;
        const hasNoDecisionMakerData = insightsData?.no_decision_maker_no_data?.includes(dealName) || false;
        const noDecisionMaker = insightsData?.no_decision_maker?.includes(dealName) || false;

        // Show loading if still loading data
        if ((signalsLoading && !signals) || insightsLoading) {
          return (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-2"></div>
              <span className="text-gray-500 text-xs">Loading...</span>
            </div>
          );
        }

        const buyingSignals = (signals?.likely_to_buy || 0) + (signals?.very_likely_to_buy || 0);
        const hasNoCompetitor = !hasNoCompetitorData && !hasCompetitor;
        const hasNoPricing = !hasNoPricingData && !hasPricingConcerns;
        const hasDecisionMaker = !hasNoDecisionMakerData && !noDecisionMaker;

        const positiveMeetingsCount = (signals?.meetings || []).filter((m: any) =>
          m.buyer_intent === 'Likely to buy' || m.buyer_intent === 'Very likely to buy'
        ).length;

        const positivesCount =
          buyingSignals +
          (hasNoCompetitor ? 1 : 0) +
          (hasNoPricing ? 1 : 0) +
          (hasDecisionMaker ? 1 : 0) +
          positiveMeetingsCount;

        // Build tooltip content - only show actual signals
        const positiveSignals = [];
        if (buyingSignals > 0) {
          positiveSignals.push({
            icon: '🎯',
            title: 'Buying Signals',
            value: `${buyingSignals} signal${buyingSignals > 1 ? 's' : ''}`,
            color: 'bg-emerald-500'
          });
        }
        if (hasNoCompetitor) {
          positiveSignals.push({
            icon: '🏆',
            title: 'No Competitors',
            color: 'bg-blue-500'
          });
        }
        if (hasNoPricing) {
          positiveSignals.push({
            icon: '💰',
            title: 'No Pricing Concerns',
            color: 'bg-green-500'
          });
        }
        if (hasDecisionMaker) {
          positiveSignals.push({
            icon: '👤',
            title: 'Decision Maker Present',
            color: 'bg-purple-500'
          });
        }

        return (
          <button
            onClick={() => {
              setDrawerDealName(dealName);
              setDrawerType('positives');
              setDrawerOpen(true);
              setExpandedThemes(new Set());
              setDrawerSearch(themeMatches[dealName]?.positives ? debouncedSearchTerm : '');
            }}
            className={`inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2.5 rounded-full text-xs font-medium cursor-pointer transition-all duration-300 border ${
              themeMatches[dealName]?.positives
                ? 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-300 hover:bg-teal-700'
                : positivesCount > 0
                ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 hover:border-teal-300 hover:shadow-sm'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <span className="tabular-nums">{positivesCount}</span><span className="ml-1">signals</span>
          </button>
        );
      },
    }),
    columnHelper.accessor((row) => {
      const dealName = row.Deal_Name;
      const signals = signalsData?.[dealName];
      const hasNoCompetitorData = insightsData?.using_competitor_no_data?.includes(dealName) || false;
      const hasCompetitor = insightsData?.using_competitor?.includes(dealName) || false;
      const hasNoPricingData = insightsData?.pricing_concerns_no_data?.includes(dealName) || false;
      const hasPricingConcerns = insightsData?.pricing_concerns?.includes(dealName) || false;
      const hasNoDecisionMakerData = insightsData?.no_decision_maker_no_data?.includes(dealName) || false;
      const noDecisionMaker = insightsData?.no_decision_maker?.includes(dealName) || false;

      const lessLikelySignals = signals?.less_likely_to_buy || 0;
      const riskMeetings = (signals?.meetings || []).filter((m: any) =>
        m.buyer_intent === 'Less likely to buy' || m.buyer_intent === 'Neutral'
      ).length;

      let count = riskMeetings;
      if (!hasNoDecisionMakerData && noDecisionMaker) count += 1;
      if (!hasNoCompetitorData && hasCompetitor) count += 1;
      count += lessLikelySignals;
      if (!hasNoPricingData && hasPricingConcerns) count += 1;

      return count;
    }, {
      id: 'risks',
      header: 'Risks',
      cell: info => {
        const dealName = info.row.original.Deal_Name;
        const signals = signalsData?.[dealName];
        const hasNoCompetitorData = insightsData?.using_competitor_no_data?.includes(dealName) || false;
        const hasCompetitor = insightsData?.using_competitor?.includes(dealName) || false;
        const hasNoPricingData = insightsData?.pricing_concerns_no_data?.includes(dealName) || false;
        const hasPricingConcerns = insightsData?.pricing_concerns?.includes(dealName) || false;
        const hasNoDecisionMakerData = insightsData?.no_decision_maker_no_data?.includes(dealName) || false;
        const noDecisionMaker = insightsData?.no_decision_maker?.includes(dealName) || false;

        // Show loading if still loading data
        if ((signalsLoading && !signals) || insightsLoading) {
          return (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-2"></div>
              <span className="text-gray-500 text-xs">Loading...</span>
            </div>
          );
        }

        const lessLikelySignals = signals?.less_likely_to_buy || 0;
        const hasNoDecisionMakerFlag = !hasNoDecisionMakerData && noDecisionMaker;
        const hasCompetitorFlag = !hasNoCompetitorData && hasCompetitor;
        const hasPricingFlag = !hasNoPricingData && hasPricingConcerns;

        const riskMeetingsCount = (signals?.meetings || []).filter((m: any) =>
          m.buyer_intent === 'Less likely to buy' || m.buyer_intent === 'Neutral'
        ).length;

        const risksCount =
          (hasNoDecisionMakerFlag ? 1 : 0) +
          (hasCompetitorFlag ? 1 : 0) +
          lessLikelySignals +
          (hasPricingFlag ? 1 : 0) +
          riskMeetingsCount;

        // Build tooltip content - only show actual risks
        const riskSignals = [];
        if (hasNoDecisionMakerFlag) {
          riskSignals.push({
            icon: '⚠️',
            title: 'No Decision Maker',
            color: 'bg-orange-500'
          });
        }
        if (hasCompetitorFlag) {
          riskSignals.push({
            icon: '🥊',
            title: 'Competitor Mentioned',
            color: 'bg-red-500'
          });
        }
        if (lessLikelySignals > 0) {
          riskSignals.push({
            icon: '📉',
            title: 'Less Likely to Buy',
            value: `${lessLikelySignals} signal${lessLikelySignals > 1 ? 's' : ''}`,
            color: 'bg-red-600'
          });
        }
        if (hasPricingFlag) {
          riskSignals.push({
            icon: '💸',
            title: 'Pricing Concerns',
            color: 'bg-amber-500'
          });
        }

        return (
          <button
            onClick={() => {
              setDrawerDealName(dealName);
              setDrawerType('risks');
              setDrawerOpen(true);
              setExpandedThemes(new Set());
              setDrawerSearch(themeMatches[dealName]?.risks ? debouncedSearchTerm : '');
            }}
            className={`inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2.5 rounded-full text-xs font-medium cursor-pointer transition-all duration-300 border ${
              themeMatches[dealName]?.risks
                ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-300 hover:bg-rose-700'
                : risksCount > 0
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 hover:border-rose-300 hover:shadow-sm'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <span className="tabular-nums">{risksCount}</span><span className="ml-1">signals</span>
          </button>
        );
      },
    }),
    columnHelper.accessor(row => row.Deal_Name, {
      id: 'stage',
      header: 'Stage',
      cell: info => {
        const stageName = selectedStage || '';
        const bgColor = generateColor(stageName);
        const textColor = getTextColor(bgColor);
        return (
          <span
            className="px-2 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {formatStageAbbr(stageName)}
          </span>
        );
      },
    }),
    columnHelper.accessor(row => row.Deal_Name, {
      id: 'activity_count',
      header: 'Activity Count',
      cell: info => {
        const dealName = info.getValue();
        const count = activityCounts[dealName];

        if (activityCountsLoading) {
          return (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-2"></div>
              <span className="text-gray-500 text-xs">Loading...</span>
            </div>
          );
        }

        if (count === undefined) {
          return <span className="text-gray-400">-</span>;
        }

        if (count === 'N/A') {
          return <span className="text-gray-500">N/A</span>;
        }

        return <span>{count}</span>;
      },
    }),
  ], [columnHelper, navigateToDealTimeline, selectedStage, insightsData, activityCounts, activityCountsLoading, signalsData, signalsLoading, insightsLoading]);

  // Filter columns based on visibility
  const columns = useMemo(() => {
    return allColumns.filter(column => visibleColumns.has(column.id as string));
  }, [allColumns, visibleColumns]);

  // Create the table instance
  const table = useReactTable({
    data: filteredDeals,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex h-screen">
      {/* Left Panel - Stages Sidebar */}
      <div className={`w-80 bg-white border-r border-gray-200 overflow-y-auto transition-all duration-300 ${isMainSidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Stages</h2>
        </div>
        
        {/* Stages List */}
        <div>
          {stagesLoading ? (
            <div key="loading" className="py-3 px-4 text-gray-500 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
              Loading stages...
            </div>
          ) : availableStages.length > 0 ? (
            (() => {
              const funnelGroups = [
                {
                  label: 'Top of Funnel',
                  stages: ['0. Identification', '1. Sales Qualification', '2. Needs Analysis & Solution Mapping'],
                  color: 'text-green-700 bg-green-50'
                },
                {
                  label: 'Mid Funnel',
                  stages: ['3. Technical Validation', '4. Proposal & Negotiation', 'Proposal'],
                  color: 'text-yellow-700 bg-yellow-50'
                },
                {
                  label: 'Bottom of Funnel',
                  stages: ['Assessment', 'Closed Active Nurture', 'Closed Lost', 'Closed Marketing Nurture', 'Closed Won', 'Renew/Closed won', 'Churned'],
                  color: 'text-red-700 bg-red-50'
                },
              ];

              return funnelGroups.map((group, groupIndex) => {
                const groupStages = availableStages.filter(stage =>
                  group.stages.includes(stage.stage_name)
                );

                if (groupStages.length === 0) return null;

                return (
                  <div key={group.label}>
                    {/* Funnel Group Header */}
                    <div className={`px-4 py-1 ${group.color} border-b border-gray-200`}>
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {group.label}
                      </span>
                    </div>

                    {/* Stages in this group */}
                    <div className="divide-y divide-gray-100">
                      {groupStages.map((stage) => {
                        const stageKey = stage.stage_id || stage.stage_name;
                        return (
                          <div
                            key={`stage-${stageKey}`}
                            className={`py-2 px-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                              selectedStage === stage.stage_name ? 'bg-sky-50' : ''
                            }`}
                            onClick={() => handleStageSelect(stage.stage_name)}
                          >
                            <div key={`stage-content-${stageKey}`} className="flex items-center justify-between">
                              <div key={`stage-info-${stageKey}`} className="flex-1">
                                <div className="font-medium text-gray-700 text-sm">{stage.stage_name}</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {stage.closed_won || stage.closed_lost ? '' : `${stage.probability}% Probability`}
                                </div>
                              </div>
                              {selectedStage === stage.stage_name && (
                                <svg key={`stage-check-${stageKey}`} xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-sky-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()
          ) : (
            <div key="no-stages" className="py-3 px-4 text-gray-500">No stages found</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Deals Overview</h1>
            
            {/* Refresh button with last updated timestamp */}
            <div className="flex items-center space-x-4">
              {lastFetched && (
                <span className="text-sm text-gray-500">
                  Updated {new Date(lastFetched).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={handleRefresh}
                className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors text-sm flex items-center"
                disabled={stagesLoading}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
          
          {error && (
            <div className="text-red-500 mb-4 p-3 bg-red-50 rounded-md">
              {typeof error === 'string' ? error : (error as any)?.header || (error as any)?.details || 'An error occurred'}
              <button
                className="ml-3 text-red-700 underline"
                onClick={handleRefresh}
              >
                Retry
              </button>
            </div>
          )}



          {!loading && selectedStage && dealsByStage[selectedStage] && (
            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search deals..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-5 w-5 text-gray-400" 
                    viewBox="0 0 20 20" 
                    fill="currentColor"
                  >
                    <path 
                      fillRule="evenodd" 
                      d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" 
                      clipRule="evenodd" 
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Search results count */}
          {!loading && searchTerm.trim() !== '' && (
            <div className="mb-4 text-sm text-gray-600">
              Found {filteredDeals.length} {filteredDeals.length === 1 ? 'deal' : 'deals'} matching "{searchTerm}"
            </div>
          )}

          {/* Table controls - Column selector and row count */}
          {!loading && selectedStage && dealsByStage[selectedStage] && (
            <div className="mb-4 flex justify-between items-center">
              {/* Column visibility control */}
              <div className="relative" ref={columnMenuRef}>
                <button
                  onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Columns
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isColumnMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isColumnMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-200">
                        <span className="text-sm font-medium text-gray-900">Show/Hide Columns</span>
                        <div className="flex gap-1">
                          <button
                            onClick={showAllColumns}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          >
                            Show All
                          </button>
                          <button
                            onClick={hideAllColumns}
                            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                          >
                            Hide All
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {Object.entries(columnDisplayNames).map(([columnId, displayName]) => (
                          <label key={columnId} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(columnId)}
                              onChange={() => toggleColumnVisibility(columnId)}
                              disabled={columnId === 'deal_name'} // Deal Name is always required
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className={`text-sm ${columnId === 'deal_name' ? 'text-gray-500' : 'text-gray-700'}`}>
                              {displayName}
                              {columnId === 'deal_name' && <span className="text-xs text-gray-400 ml-1">(required)</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Row count display */}
              <div className="inline-flex items-center px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-sm font-medium text-gray-700">
                  {filteredDeals.length} {filteredDeals.length === 1 ? 'deal' : 'deals'}
                </span>
                {searchTerm.trim() !== '' && (
                  <span className="text-xs text-gray-500 ml-2">
                    (filtered)
                  </span>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-3">Loading deals for {selectedStage}...</p>
            </div>
          ) : filteredDeals.length > 0 ? (
            <div className="overflow-x-auto overflow-y-visible border border-gray-200 rounded-lg">
                <table className="min-w-full bg-white" style={{ minWidth: '1200px' }}>
                <thead className="bg-gray-100">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header, index) => {
                        const isPinned = pinnedColumns.has(header.id);
                        const pinnedIndex = Array.from(pinnedColumns).indexOf(header.id);
                        const leftPosition = pinnedIndex >= 0 ? `${pinnedIndex * 250}px` : 'auto';
                        
                        return (
                          <th 
                            key={header.id}
                            className={`py-3 px-4 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors ${
                              isPinned ? 'sticky z-20 bg-gray-100 shadow-sm' : ''
                            }`}
                            style={isPinned ? { left: leftPosition, minWidth: '250px', maxWidth: '250px' } : {}}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                                {renderSortIndicator(header.column)}
                                {isPinned && (
                                  <span className="ml-1 text-xs text-sky-600 font-medium">📌</span>
                                )}
                              </div>
                              {header.id === 'deal_name' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Toggling pin for column:', header.id, 'Current pinned:', Array.from(pinnedColumns));
                                    toggleColumnPin(header.id);
                                  }}
                                  className={`ml-2 p-1 rounded hover:bg-gray-300 transition-colors ${
                                    isPinned ? 'text-sky-600' : 'text-gray-400'
                                  }`}
                                  title={isPinned ? 'Unpin column' : 'Pin column'}
                                >
                                  <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    className="h-4 w-4" 
                                    viewBox="0 0 20 20" 
                                    fill="currentColor"
                                  >
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className={`group hover:bg-sky-50 transition-colors ${drawerOpen && drawerDealName === row.original.Deal_Name ? 'bg-sky-50' : ''}`}>
                      {row.getVisibleCells().map((cell, index) => {
                        const isPinned = pinnedColumns.has(cell.column.id);
                        const pinnedIndex = Array.from(pinnedColumns).indexOf(cell.column.id);
                        const leftPosition = pinnedIndex >= 0 ? `${pinnedIndex * 250}px` : 'auto';
                        const isActiveRow = drawerOpen && drawerDealName === row.original.Deal_Name;

                        return (
                          <td
                            key={cell.id}
                            className={`py-3 px-4 ${
                              isPinned ? `sticky z-20 shadow-sm transition-colors ${isActiveRow ? 'bg-sky-50' : 'bg-white group-hover:bg-sky-50'}` : ''
                            }`}
                            style={isPinned ? { left: leftPosition, minWidth: '250px', maxWidth: '250px' } : {}}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : selectedStage && !loading ? (
            <div className="text-center py-10 text-gray-600">
              {failedStages.has(selectedStage) ? 
                "Failed to load deals for this stage." : 
                "No deals found in this stage."}
            </div>
          ) : null}
        </div>
      </div>

      {/* Signals Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-xl z-50 overflow-y-auto transform ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        } transition-transform duration-300 ease-in-out`}
      >
        {drawerDealName && drawerType && (() => {
          const signals = signalsData?.[drawerDealName];
          const meetings = signals?.meetings || [];
          const isPositives = drawerType === 'positives';

          // Compute summary cards
          const hasNoCompetitorData = insightsData?.using_competitor_no_data?.includes(drawerDealName) || false;
          const hasCompetitor = insightsData?.using_competitor?.includes(drawerDealName) || false;
          const hasNoPricingData = insightsData?.pricing_concerns_no_data?.includes(drawerDealName) || false;
          const hasPricingConcerns = insightsData?.pricing_concerns?.includes(drawerDealName) || false;
          const hasNoDecisionMakerData = insightsData?.no_decision_maker_no_data?.includes(drawerDealName) || false;
          const noDecisionMaker = insightsData?.no_decision_maker?.includes(drawerDealName) || false;

          const summaryCards: { title: string; color: string; dotColor: string }[] = [];
          if (isPositives) {
            if (!hasNoCompetitorData && !hasCompetitor) summaryCards.push({ title: 'No Competitors', dotColor: 'bg-blue-400', color: 'bg-blue-50 text-blue-700 border-blue-100' });
            if (!hasNoPricingData && !hasPricingConcerns) summaryCards.push({ title: 'No Pricing Concerns', dotColor: 'bg-teal-500', color: 'bg-teal-50 text-teal-800 border-teal-100' });
            if (!hasNoDecisionMakerData && !noDecisionMaker) summaryCards.push({ title: 'Decision Maker Present', dotColor: 'bg-violet-400', color: 'bg-violet-50 text-violet-700 border-violet-100' });
          } else {
            if (!hasNoCompetitorData && hasCompetitor) summaryCards.push({ title: 'Competitor Mentioned', dotColor: 'bg-rose-400', color: 'bg-rose-50 text-rose-600 border-rose-100' });
            if (!hasNoPricingData && hasPricingConcerns) summaryCards.push({ title: 'Pricing Concerns', dotColor: 'bg-amber-400', color: 'bg-amber-50 text-amber-600 border-amber-100' });
            if (!hasNoDecisionMakerData && noDecisionMaker) summaryCards.push({ title: 'No Decision Maker', dotColor: 'bg-orange-400', color: 'bg-orange-50 text-orange-600 border-orange-100' });
          }

          // Filter meetings by intent and collect themes
          const relevantMeetings = meetings.filter(m => {
            if (isPositives) {
              return m.buyer_intent === 'Likely to buy' || m.buyer_intent === 'Very likely to buy';
            }
            return m.buyer_intent === 'Less likely to buy' || m.buyer_intent === 'Neutral';
          });

          // Collect themes per meeting, keeping meeting context for each
          const themeEntries: { theme: string; bullets: string[]; subject: string; date: string }[] = [];
          relevantMeetings.forEach(meeting => {
            const explanation = meeting.buyer_intent_explanation;
            if (!explanation) return;

            // Handle dict format (newer meetings)
            if (typeof explanation === 'object' && !Array.isArray(explanation)) {
              Object.entries(explanation).forEach(([theme, rawBullets]) => {
                const bulletArr = Array.isArray(rawBullets) ? rawBullets : [rawBullets];
                const bullets = (bulletArr as any[]).flatMap(b => {
                  if (typeof b === 'string') return [b];
                  if (b && typeof b === 'object' && b.header) {
                    const lines: string[] = [b.header];
                    if (Array.isArray(b.details)) lines.push(...b.details);
                    return lines;
                  }
                  return [String(b)];
                });
                themeEntries.push({ theme, bullets, subject: meeting.subject, date: meeting.date });
              });
            }
            // Handle markdown string format (older meetings)
            else if (typeof explanation === 'string' && explanation.trim().length > 0) {
              const lines = explanation.split('\n');
              let currentTheme = '';
              let currentBullets: string[] = [];

              const flushTheme = () => {
                if (currentTheme && currentBullets.length > 0) {
                  themeEntries.push({ theme: currentTheme, bullets: currentBullets, subject: meeting.subject, date: meeting.date });
                }
                currentBullets = [];
              };

              lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                // Markdown heading = theme
                if (trimmed.startsWith('# ')) {
                  flushTheme();
                  currentTheme = trimmed.replace(/^#+\s*/, '');
                } else {
                  // Strip leading "- " bullets
                  const bullet = trimmed.replace(/^[-*]\s*/, '');
                  if (bullet) currentBullets.push(bullet);
                }
              });
              flushTheme();
            }
          });
          // Sort by date descending (latest first)
          themeEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
            <>
              {/* Sticky header */}
              <div className={`sticky top-0 z-10 border-b border-gray-200 ${
                isPositives
                  ? 'bg-gradient-to-r from-teal-600 to-teal-700'
                  : 'bg-gradient-to-r from-red-500 to-rose-600'
              }`}>
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-white/80 text-xs font-medium uppercase tracking-wide">
                      {isPositives ? 'Signals & Themes' : 'Risk Factors'}
                    </div>
                    <div className="text-white font-semibold text-base mt-0.5 truncate max-w-[360px]">
                      {drawerDealName}
                    </div>
                  </div>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Summary cards */}
                {summaryCards.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {summaryCards.map((card, idx) => (
                      <span key={idx} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${card.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${card.dotColor}`} />
                        {card.title}
                      </span>
                    ))}
                  </div>
                )}

                {/* Search bar */}
                {themeEntries.length > 0 && (
                  <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text"
                      value={drawerSearch}
                      onChange={e => setDrawerSearch(e.target.value)}
                      placeholder="Search themes..."
                      className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors"
                    />
                    {drawerSearch && (
                      <button
                        onClick={() => setDrawerSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}

                {/* Themed breakdown */}
                {(() => {
                  const searchLower = drawerSearch.toLowerCase().trim();
                  const filteredEntries = searchLower
                    ? themeEntries.filter(entry =>
                        entry.theme.toLowerCase().includes(searchLower) ||
                        entry.bullets.some(b => b.toLowerCase().includes(searchLower))
                      )
                    : themeEntries;

                  const highlightMatch = (text: string) => {
                    if (!searchLower) return text;
                    const idx = text.toLowerCase().indexOf(searchLower);
                    if (idx === -1) return text;
                    return <span>{text.slice(0, idx)}<mark className="bg-orange-200 text-inherit rounded-sm">{text.slice(idx, idx + searchLower.length)}</mark>{text.slice(idx + searchLower.length)}</span>;
                  };

                  return filteredEntries.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                      {drawerType === 'positives' ? 'Themes from meetings with positive signals' : 'Themes from meetings with neutral or negative signals'}
                      {searchLower && ` · ${filteredEntries.length} of ${themeEntries.length}`}
                    </div>
                    {filteredEntries.map((entry, entryIdx) => {
                      const themeKey = `${entry.theme}|||${entry.subject}|||${entry.date}`;
                      const hasBulletMatch = searchLower && entry.bullets.some(b => b.toLowerCase().includes(searchLower));
                      const isExpanded = expandedThemes.has(themeKey) || !!hasBulletMatch;
                      return (
                        <div key={themeKey + entryIdx} className="border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => {
                              setExpandedThemes(prev => {
                                const next = new Set(prev);
                                if (next.has(themeKey)) next.delete(themeKey);
                                else next.add(themeKey);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-800">{highlightMatch(entry.theme)}</span>
                              <div className="text-xs text-gray-400 mt-0.5 truncate">
                                <span className="font-semibold text-gray-600">{(() => {
                                  const days = Math.floor((Date.now() - new Date(entry.date).getTime()) / 86400000);
                                  if (days === 0) return 'Today';
                                  if (days === 1) return '1 day ago';
                                  if (days < 30) return `${days} days ago`;
                                  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
                                  return `${Math.floor(days / 365)}y ago`;
                                })()}</span> &middot; {drawerDealName} | {entry.subject}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                isPositives ? 'bg-teal-100 text-teal-800' : 'bg-rose-100 text-rose-700'
                              }`}>
                                {entry.bullets.length}
                              </span>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-4 py-3">
                              <ul className="space-y-1.5">
                                {entry.bullets.map((bullet, bIdx) => (
                                  <li key={bIdx} className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className={`mt-1.5 flex-shrink-0 h-1.5 w-1.5 rounded-full ${
                                      isPositives ? 'bg-teal-500' : 'bg-rose-400'
                                    }`} />
                                    {highlightMatch(bullet)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : searchLower ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No themes matching &ldquo;{drawerSearch}&rdquo;
                  </div>
                ) : (
                  summaryCards.length === 0 && (
                    <div className="text-center py-10 text-gray-500 text-sm">
                      {isPositives ? 'No positive signals detected' : 'No risk factors detected'}
                    </div>
                  )
                );
                })()}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default DealStageSelector;