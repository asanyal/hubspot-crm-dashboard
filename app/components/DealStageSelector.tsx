// app/components/DealStageSelector.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '../context/AppContext';
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

const DealStageSelector: React.FC = () => {
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
    { id: 'Deal_Name', desc: false }
  ]);
  const [hasMounted, setHasMounted] = useState(false);
  const [failedStages, setFailedStages] = useState<Set<string>>(new Set());
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsData, setInsightsData] = useState<DealInsights | null>(null);
  const [activeFilter, setActiveFilter] = useState<{type: keyof DealInsights, value: boolean} | null>(null);
  const [activityCounts, setActivityCounts] = useState<Record<string, number | 'N/A'>>({});
  const [activityCountsLoading, setActivityCountsLoading] = useState(false);
  const router = useRouter();
  
  // Track URL parameters
  const [urlStage, setUrlStage] = useState<string | null>(null);
  const [urlAutoload, setUrlAutoload] = useState<boolean>(false);
  
  // Loading timeout reference - used to track the automatic loading reset
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Timestamp for data expiration (5 minutes = 300000 milliseconds)
  const DATA_EXPIRY_TIME = 300000;
  
  // Get URL search parameters
  const getSearchParams = useCallback(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  }, []);
  
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
      const response = await makeApiCall('/api/hubspot/stages');
      
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
      const response = await makeApiCall(`/api/hubspot/deals?stage=${encodeURIComponent(stageName)}`);
      
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
        expectedCloseDate.toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [selectedStage, dealsByStage, debouncedSearchTerm]);

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
        expectedCloseDate.toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [selectedStage, dealsByStage, searchTerm]);
  

  // Function to get storage key for insights
  const getInsightsStorageKey = useCallback((stageName: string) => {
    return `insights_${stageName}`;
  }, []);

  // Function to get storage key for activity counts
  const getActivityCountsStorageKey = useCallback((stageName: string) => {
    return `activity_counts_${stageName}`;
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

  // Function to save insights to storage
  const saveInsightsToStorage = useCallback((stageName: string, data: DealInsights) => {
    const storageKey = getInsightsStorageKey(stageName);
    localStorage.setItem(storageKey, JSON.stringify(data));
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

  // Function to save activity counts to storage
  const saveActivityCountsToStorage = useCallback((stageName: string, data: Record<string, number | 'N/A'>) => {
    const storageKey = getActivityCountsStorageKey(stageName);
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [getActivityCountsStorageKey]);

  // Fetch insights data
  const fetchInsights = useCallback(async (dealNames: string[]) => {
    if (!dealNames.length) return;
    
    setInsightsLoading(true);
    try {
      const response = await makeApiCall('/api/hubspot/v2/deal-insights-aggregate', {
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
            const response = await makeApiCall(`/api/hubspot/deal-activities-count?dealName=${encodeURIComponent(dealName)}`);
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

  // Function to handle bar click
  const handleBarClick = (type: keyof DealInsights, value: boolean) => {
    if (!insightsData) return;
    
    const deals = insightsData[type];
    setActiveFilter({ type, value });
  };

  // Function to clear filter
  const clearFilter = () => {
    setActiveFilter(null);
  };

  // Get filtered deals based on active filter
  const getFilteredDeals = useCallback((): Deal[] => {
    if (!activeFilter || !insightsData) return getCurrentDeals();

    const deals = getCurrentDeals();
    const filteredDeals = activeFilter.value
      ? deals.filter(deal => insightsData[activeFilter.type].includes(deal.Deal_Name))
      : deals.filter(deal => !insightsData[activeFilter.type].includes(deal.Deal_Name));

    return filteredDeals;
  }, [activeFilter, insightsData, getCurrentDeals]);

  // Function to render insight bar
  const renderInsightBar = (type: keyof DealInsights, title: string) => {
    if (!insightsData || !insightsData[type]) return null;

    const deals = insightsData[type] || [];
    const noDataDeals = insightsData[`${type}_no_data` as keyof DealInsights] || [];
    const stageDeals = selectedStage ? dealsByStage[selectedStage] || [] : [];
    
    // Filter out deals that have no data
    const validDeals = stageDeals.filter(deal => !noDataDeals.includes(deal.Deal_Name));
    const totalDeals = validDeals.length;
    
    if (totalDeals === 0) return null; // Don't show bar if no valid deals

    const trueCount = deals.length;
    const falseCount = totalDeals - trueCount;
    const truePercentage = (trueCount / totalDeals) * 100;
    const falsePercentage = (falseCount / totalDeals) * 100;

    const falseDeals = validDeals
      .map((deal: Deal) => deal.Deal_Name)
      .filter((name: string) => !deals.includes(name));

    return (
      <div key={type} className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>
        <div className="space-y-4">
          {/* True Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">True</span>
              <span className="font-medium">{trueCount}</span>
            </div>
            <div className="relative group">
              <div 
                className="h-6 bg-red-500 rounded cursor-pointer hover:opacity-80 transition-all"
                style={{ width: `${truePercentage}%` }}
                onClick={() => handleBarClick(type, true)}
              ></div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block">
                <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 max-w-xs">
                  <div className="font-medium mb-1">Deals:</div>
                  <div className="max-h-32 overflow-y-auto">
                    {deals.map((deal: string) => (
                      <div key={deal} className="whitespace-nowrap">{deal}</div>
                    ))}
                  </div>
                </div>
                {/* Tooltip arrow */}
                <div className="absolute left-4 bottom-0 transform translate-y-full">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>

          {/* False Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">False</span>
              <span className="font-medium">{falseCount}</span>
            </div>
            <div className="relative group">
              <div 
                className="h-6 bg-green-700 rounded cursor-pointer hover:opacity-80 transition-all"
                style={{ width: `${falsePercentage}%` }}
                onClick={() => handleBarClick(type, false)}
              ></div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block">
                <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 max-w-xs">
                  <div className="font-medium mb-1">Deals:</div>
                  <div className="max-h-32 overflow-y-auto">
                    {falseDeals.map((deal: string) => (
                      <div key={deal} className="whitespace-nowrap">{deal}</div>
                    ))}
                  </div>
                </div>
                {/* Tooltip arrow */}
                <div className="absolute left-4 bottom-0 transform translate-y-full">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

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

    // Clear insights data and storage
    setInsightsData(null);
    setActivityCounts({});
    if (selectedStage) {
      localStorage.removeItem(getInsightsStorageKey(selectedStage));
      localStorage.removeItem(getActivityCountsStorageKey(selectedStage));
    }
    
    // Fetch stages (which will trigger the rest of the initialization flow)
    fetchStages();
  }, [updateState, fetchStages, getSearchParams, selectedStage, getInsightsStorageKey, getActivityCountsStorageKey]);

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

  // Define columns
  const columns = useMemo(() => [
    columnHelper.accessor('Deal_Name', {
      header: 'Deal Name',
      cell: info => (
        <button
          onClick={() => navigateToDealTimeline(info.getValue())}
          className="font-medium text-sky-600 hover:text-sky-800 hover:underline text-left"
        >
          {info.getValue()}
        </button>
      ),
    }),
    columnHelper.accessor('Deal_Name', {
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
    columnHelper.accessor('Deal_Name', {
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
    columnHelper.accessor('Owner', {
      header: 'Owner',
      cell: info => {
        const owner = info.getValue();
        const bgColor = generateColor(owner);
        const textColor = getTextColor(bgColor);
        return (
          <span
            className="px-2 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {formatOwnerInitials(owner)}
          </span>
        );
      },
    }),
    columnHelper.accessor('Deal_Name', {
      id: 'pricing_concerns',
      header: 'Pricing Concerns?',
      cell: info => {
        const dealName = info.getValue();
        const hasNoData = insightsData?.pricing_concerns_no_data?.includes(dealName) || false;
        const hasPricingConcerns = insightsData?.pricing_concerns?.includes(dealName) || false;
        
        if (hasNoData) {
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              N/A
            </span>
          );
        }
        
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            hasPricingConcerns ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {hasPricingConcerns ? 'Yes' : 'No'}
          </span>
        );
      },
    }),
    columnHelper.accessor('Deal_Name', {
      id: 'decision_maker',
      header: 'Decision Maker?',
      cell: info => {
        const dealName = info.getValue();
        const hasNoData = insightsData?.no_decision_maker_no_data?.includes(dealName) || false;
        const noDecisionMaker = insightsData?.no_decision_maker?.includes(dealName) || false;
        
        if (hasNoData) {
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              N/A
            </span>
          );
        }
        
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            noDecisionMaker ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {noDecisionMaker ? 'No' : 'Yes'}
          </span>
        );
      },
    }),
    columnHelper.accessor('Deal_Name', {
      id: 'using_competitor',
      header: 'Using Competitor?',
      cell: info => {
        const dealName = info.getValue();
        const hasNoData = insightsData?.using_competitor_no_data?.includes(dealName) || false;
        const hasCompetitor = insightsData?.using_competitor?.includes(dealName) || false;
        
        if (hasNoData) {
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              N/A
            </span>
          );
        }
        
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            hasCompetitor ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {hasCompetitor ? 'Yes' : 'No'}
          </span>
        );
      },
    }),
  ], [columnHelper, navigateToDealTimeline, selectedStage, insightsData, activityCounts, activityCountsLoading]);

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
      {/* Left Panel */}
      <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Stages</h2>
        </div>
        
        {/* Stages List */}
        <div className="divide-y divide-gray-100">
          {stagesLoading ? (
            <div key="loading" className="p-4 text-gray-500 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
              Loading stages...
            </div>
          ) : availableStages.length > 0 ? (
            availableStages.map((stage) => {
              const stageKey = stage.stage_id || stage.stage_name;
              return (
                <div
                  key={`stage-${stageKey}`}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${
                    selectedStage === stage.stage_name ? 'bg-sky-50' : ''
                  }`}
                  onClick={() => handleStageSelect(stage.stage_name)}
                >
                  <div key={`stage-content-${stageKey}`} className="flex items-center gap-3">
                    <div key={`stage-order-${stageKey}`} className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                      {stage.display_order}
                    </div>
                    <div key={`stage-info-${stageKey}`} className="flex-1">
                      <div className="font-medium text-gray-900">{stage.stage_name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {stage.closed_won || stage.closed_lost ? '' : `${stage.probability}% Probability`}
                      </div>
                    </div>
                    {selectedStage === stage.stage_name && (
                      <svg key={`stage-check-${stageKey}`} xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-sky-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div key="no-stages" className="p-4 text-gray-500">No stages found</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
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
              {error}
              <button
                className="ml-3 text-red-700 underline"
                onClick={handleRefresh}
              >
                Retry
              </button>
            </div>
          )}

          {/* Insights Section */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Deal Insights</h2>
              {activeFilter && (
                <button
                  onClick={clearFilter}
                  className="text-sm text-sky-600 hover:text-sky-800 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Clear Filter
                </button>
              )}
            </div>
            
            {insightsLoading ? (
              <div className="flex justify-center items-center h-32 text-gray-600">
                Getting Insights for stage <span className="font-bold ml-1">{selectedStage}</span>...
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { type: 'pricing_concerns' as const, title: 'Pricing Concerns' },
                  { type: 'no_decision_maker' as const, title: 'No Decision Maker' },
                  { type: 'using_competitor' as const, title: 'Using Competitor' }
                ].map(insight => (
                  <div key={insight.type}>
                    {renderInsightBar(insight.type, insight.title)}
                  </div>
                ))}
              </div>
            )}
          </div>

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

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-3">Loading deals for {selectedStage}...</p>
            </div>
          ) : getFilteredDeals().length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-100">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th 
                          key={header.id}
                          className="py-3 px-4 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {renderSortIndicator(header.column)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="py-3 px-4">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
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
    </div>
  );
};

export default DealStageSelector;