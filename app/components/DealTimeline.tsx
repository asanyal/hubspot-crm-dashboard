'use client';

import { useAppState } from '../context/AppContext';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Select from 'react-select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Brush, ReferenceArea
} from 'recharts';
import { Deal } from '../context/AppContext';

interface Contact {
  champion: boolean;
  explanation: string;
  email: string;
}

interface ContactsData {
  contacts: Contact[];
  total_contacts: number;
  champions_count: number;
}

interface Event {
  id: string;
  date_str: string;
  time_str: string;
  type: string;
  subject: string;
  content: string;
  content_preview?: string;
  sentiment?: string;
  buyer_intent?: string;
  buyer_intent_explanation?: string;
}

interface TimelineData {
  events: Event[];
  start_date: string;
  end_date: string;
}

interface DealInfo {
  dealId: string;
  dealOwner: string;
  activityCount: number;
  startDate: string;
  endDate: string;
  dealStage: string;
}

interface SelectOption {
  value: string;
  label: string;
}

// Add a type for the deal data from the API
interface DealData extends Deal {
  createdate: string;
  owner: string;
}

interface BarProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  payload?: {
    date: string;
    hasLessLikelyToBuy?: boolean;
    [key: string]: any;
  };
}

const DealTimeline: React.FC = () => {
  // Get state from context
  const { state, updateState } = useAppState();
  const { 
    selectedDeal, 
    timeframe, 
    deals: allDeals, 
    activities: timelineData, 
    loading, 
    error, 
    lastFetched 
  } = state.dealTimeline;

  // Component-level UI state (doesn't need to persist)
  const [selectedOption, setSelectedOption] = useState<SelectOption | null>(null);
  const [dealInfo, setDealInfo] = useState<DealInfo | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);
  const [activitiesCount, setActivitiesCount] = useState<number | null>(null);
  const [hasMounted, setHasMounted] = useState<boolean>(false);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [meetingContacts, setMeetingContacts] = useState<Record<string, ContactsData>>({});
  const [loadingChampions, setLoadingChampions] = useState<boolean>(false);

  // Add state for search term
  const [dealSearchTerm, setDealSearchTerm] = useState<string>('');
  const [debouncedDealSearchTerm, setDebouncedDealSearchTerm] = useState<string>('');

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState<number>(0);

  const drawerRef = useRef<HTMLDivElement>(null);
  
  const chartRef = useRef<any>(null);

  // Loading state variables
  const [dealsLoading, setDealsLoading] = useState<boolean>(true);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [loadingStage, setLoadingStage] = useState<number>(1); // 1, 2, 3, or 4 for error
  const [loadingError, setLoadingError] = useState<boolean>(false);
  const [fetchingActivities, setFetchingActivities] = useState<boolean>(false);
  const [isUrlProcessed, setIsUrlProcessed] = useState<boolean>(false);

  // References to prevent useEffect loops
  const dealInfoRef = useRef<DealInfo | null>(null);
  const timelineDataRef = useRef<TimelineData | null>(null);
  const selectedDealRef = useRef<Deal | null>(null);
  const allDealsRef = useRef<Deal[]>([]);

  // Timer
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Timestamp for data expiration (25 minutes = 1500000 milliseconds)
  const DATA_EXPIRY_TIME = 1500000;

  // Add new state for storing deal info for all deals
  const [allDealsInfo, setAllDealsInfo] = useState<Record<string, DealInfo>>({});

  // Add this near the top of the component, after the state declarations
  const [isUnmounting, setIsUnmounting] = useState<boolean>(false);

  // Add new state to track the current deal ID
  const [currentDealId, setCurrentDealId] = useState<string | null>(null);

  // Add state for stage filter
  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());

  // Get unique stages from all deals
  const uniqueStages = useMemo(() => {
    const stages = new Set<string>();
    allDeals.forEach(deal => {
      if (deal.stage) {
        stages.add(deal.stage);
      }
    });
    const stagesArray = Array.from(stages).sort();
    return stagesArray;
  }, [allDeals]);

  // Initialize selectedStages with all stages when uniqueStages changes
  useEffect(() => {
    if (uniqueStages.length > 0) {
      setSelectedStages(new Set(uniqueStages));
    }
  }, [uniqueStages]);

  // Filter deals based on selected stages and search term
  const stageFilteredDeals = useMemo(() => {
    if (selectedStages.size === 0) return allDeals;
    
    return allDeals.filter(deal => {
      if (!deal.stage) return false;
      return selectedStages.has(deal.stage);
    });
  }, [allDeals, selectedStages]);

  const filteredDeals = useMemo(() => {
    if (!debouncedDealSearchTerm.trim()) {
      return stageFilteredDeals;
    }

    const searchLower = debouncedDealSearchTerm.toLowerCase();
    const searchTerms = searchLower.split(' ').filter(term => term.length > 0);
    
    if (searchTerms.length === 0) return stageFilteredDeals;
    
    return stageFilteredDeals.filter(deal => {
      // Convert all fields to strings and then to lowercase, handling null/undefined
      const dealNameLower = String(deal.name || '').toLowerCase();
      const dealStageLower = String(deal.stage || '').toLowerCase();
      const dealOwnerLower = String(deal.owner || '').toLowerCase();
      
      return searchTerms.every(term => 
        dealNameLower.includes(term) ||
        dealStageLower.includes(term) ||
        dealOwnerLower.includes(term)
      );
    });
  }, [stageFilteredDeals, debouncedDealSearchTerm]);

  // Add debounce effect for search with increased delay
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedDealSearchTerm(dealSearchTerm);
    }, 800); // Increased to 800ms for better performance
    
    return () => {
      clearTimeout(timerId);
    };
  }, [dealSearchTerm]);

  // Add color mapping for stages
  const getStageColor = (stage: string): { bg: string; text: string; border: string } => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      'Closed Won': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
      'Closed Lost': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
      'Closed Marketing Nurture': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
      'Closed Active Nurture': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
      'Assessment': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
      'Waiting for Signature': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
      '1. Sales Qualification': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
      '2. Needs Analysis & Solution Mapping': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
      '3. Technical Validation': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
      '4. Proposal & Negotiation': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
      '0. Identification': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
      'Renew/Closed Won': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
    };
    return colors[stage] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  };

  // Format stage name for display
  const formatStageName = (stage: string): string => {
    if (!stage) return '';
    return stage; // Use the exact stage name from the API
  };

  // Get initials for a stage name
  const getStageInitials = (stage: string): string => {
    return stage
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase();
  };

  // Handle stage filter toggle with new behavior
  const toggleStageFilter = (stage: string) => {
    setSelectedStages(prev => {
      const newSet = new Set(prev);
      
      // If this is the only selected stage, deselect it to show all stages
      if (newSet.size === 1 && newSet.has(stage)) {
        newSet.clear();
        return newSet;
      }
      
      // If all stages are selected, clear and select only this stage
      if (newSet.size === uniqueStages.length) {
        newSet.clear();
        newSet.add(stage);
        return newSet;
      }
      
      // Otherwise, toggle this stage
      if (newSet.has(stage)) {
        newSet.delete(stage);
      } else {
        newSet.add(stage);
      }
      
      return newSet;
    });
  };

  // Calculate days passed for a deal
  const getDaysPassed = (deal: Deal) => {
    if (!deal.createdate) return 0;
    return calculateDaysPassed(deal.createdate);
  };

  // Add cleanup function
  const cleanupState = useCallback(() => {
    setChartData([]);
    setMeetingContacts({});
    setActivitiesCount(null);
    setDealInfo(null);
    setSelectedOption(null);
    setStartIndex(0);
    setEndIndex(0);
    setCurrentDealId(null);
  }, []);

  // Utility to check if a date is valid
  const isValidDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  };

  // Update refs when values change - this prevents infinite loops
  useEffect(() => {
    selectedDealRef.current = selectedDeal;
  }, [selectedDeal]);

  useEffect(() => {
    timelineDataRef.current = timelineData;
  }, [timelineData]);

  useEffect(() => {
    dealInfoRef.current = dealInfo;
  }, [dealInfo]);

  useEffect(() => {
    allDealsRef.current = allDeals;
  }, [allDeals]);

  // Set hasMounted to true after component mounts
  useEffect(() => {
    setHasMounted(true);
    
    // Clear error when component mounts
    if (error) {
      updateState('dealTimeline.error', null);
    }
    
    // Cleanup function
    return () => {
      setHasMounted(false);
      setIsInitialLoad(true);
      setIsUrlProcessed(false);
    };
  }, []);

  // Timer effect to show loading time
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    
    if (loading && loadingStartTime) {
      // Start a timer that updates every second
      timerInterval = setInterval(() => {
        const timeElapsed = Math.floor((Date.now() - loadingStartTime) / 1000);
        setElapsedTime(timeElapsed);
      }, 1000);
    } else {
      // Reset elapsed time when loading stops
      setElapsedTime(0);
    }
    
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [loading, loadingStartTime]);

  // Escape key handler for drawer
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  // Click outside drawer to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if the click is inside a deal log row
      let element = event.target as HTMLElement;
      let isDealLogRow = false;
      
      // Check if the clicked element or any of its parents have the data-deal-log-row attribute
      while (element && !isDealLogRow) {
        if (element.hasAttribute('data-deal-log-row')) {
          isDealLogRow = true;
          break;
        }
        element = element.parentElement as HTMLElement;
      }
      
      // Only close drawer if not clicking on a deal log row and outside the drawer
      if (drawerRef.current && 
          !drawerRef.current.contains(event.target as Node) && 
          !isDealLogRow) {
        setIsDrawerOpen(false);
      }
    };

    if (isDrawerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDrawerOpen]);

  // =====================================================================
  // DEFINE ALL CALLBACK FUNCTIONS FIRST BEFORE USING THEM IN EFFECTS
  // =====================================================================

  // Format the timer's elapsed time into minutes and seconds
  const formatElapsedTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Fetch deal information - wrapped in useCallback
  const fetchDealInfo = useCallback(async (dealName: string) => {
    try {
      console.log(`Fetching deal info for: ${dealName}`);
      const response = await fetch(`http://localhost:8000/api/hubspot/deal-info?dealName=${encodeURIComponent(dealName)}`);
      
      console.log(`Deal info response status: ${response.status}`);
      
      if (response.ok) {
        const info = await response.json();
        setDealInfo(info);
        // Store the info in allDealsInfo
        setAllDealsInfo(prev => ({
          ...prev,
          [dealName]: info
        }));
      } else {
        const errorText = await response.text();
        console.error(`Error response from deal-info: ${errorText}`);
      }
    } catch (error) {
      console.error('Error fetching deal info:', error);
    }
  }, []);

  // Function to fetch activities count - wrapped in useCallback
  const fetchActivitiesCount = useCallback(async (dealName: string) => {
    setFetchingActivities(true);
    try {
      const response = await fetch(`http://localhost:8000/api/hubspot/deal-activities-count?dealName=${encodeURIComponent(dealName)}`);
      
      if (response.ok) {
        const data = await response.json();
        setActivitiesCount(data.count);
        if (data.count === 0) {
          updateState('dealTimeline.loading', false);
          setLoadingStartTime(null);
          setLoadingStage(1);
          setLoadingError(false);
        }
        return data.count;
      } else if (response.status === 404) {
        // For 404s, just log and return null without showing UI error
        console.log(`No activities found for deal "${dealName}"`);
        setActivitiesCount(null);
        return null;
      } else {
        const errorText = await response.text();
        console.error(`Error fetching activities count for deal "${dealName}":`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
        // Update UI to show error state only for non-404 errors
        setActivitiesCount(null);
        updateState('dealTimeline.error', `Failed to fetch activities count for ${dealName}. Please try again.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching activities count for deal "${dealName}":`, error);
      
      // Update UI to show error state
      setActivitiesCount(null);
      updateState('dealTimeline.error', `Failed to fetch activities count for ${dealName}. Please try again.`);
      return null;
    } finally {
      setFetchingActivities(false);
    }
  }, [updateState]);

  // Handler for "Get Timeline" button - define this before using it
  const handleGetTimeline = useCallback(async (deal: Deal | null = null, forceRefresh = false) => {
    const dealToUse = deal || selectedDealRef.current;
    if (!dealToUse) return;
    
    // Check if we need to refresh based on cache expiry or force refresh
    const currentTime = Date.now();
    const shouldRefresh = forceRefresh || 
      !lastFetched || 
      (currentTime - lastFetched >= DATA_EXPIRY_TIME) ||
      (selectedDealRef.current && dealToUse.name !== selectedDealRef.current.name);

    if (!shouldRefresh) {
      console.log(`[Timeline] Using cached timeline for ${dealToUse.name}`);
      return;
    }
    
    // Clear previous meeting contacts when loading a new timeline
    if (selectedDealRef.current && dealToUse.name !== selectedDealRef.current.name) {
      setMeetingContacts({});
    }
    
    updateState('dealTimeline.loading', true);
    updateState('dealTimeline.error', null);
    setLoadingStartTime(Date.now());
    setLoadingStage(1);
    setLoadingError(false);
    
    try {
      console.log(`[Timeline] Getting timeline for deal: ${dealToUse.name}`);
      
      // First fetch activities count to inform the user
      const count = await fetchActivitiesCount(dealToUse.name);
      
      // Then fetch deal info
      await fetchDealInfo(dealToUse.name);
      
      // Finally fetch timeline data
      const timelineResponse = await fetch(`http://localhost:8000/api/hubspot/deal-timeline?dealName=${encodeURIComponent(dealToUse.name)}`);
      
      if (timelineResponse.ok) {
        const data = await timelineResponse.json();
        
        updateState('dealTimeline.activities', data);
        updateState('dealTimeline.lastFetched', Date.now());
        
        // Note: We don't need to explicitly call fetchMeetingContacts here
        // The useEffect that watches timelineData will handle that
      } else {
        const errorText = await timelineResponse.text();
        console.error(`[Timeline] Error response: ${errorText}`);
        throw new Error(`Failed to fetch timeline data: ${timelineResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('[Timeline] Error fetching timeline:', error);
      setLoadingError(true);
      updateState('dealTimeline.error', 'Failed to load timeline data. Please try again.');
    } finally {
      updateState('dealTimeline.loading', false);
      setLoadingStartTime(null);
    }
  }, [updateState, fetchDealInfo, fetchActivitiesCount, lastFetched]);

  // Function to load timeline directly from URL params - define after handleGetTimeline
  const loadTimelineDirectly = useCallback(async (dealName: string) => {
    if (isUnmounting) return;
    
    // Check if we already have cached data for this deal
    if (selectedDealRef.current?.name === dealName && timelineDataRef.current && lastFetched) {
      const currentTime = Date.now();
      if (currentTime - lastFetched < DATA_EXPIRY_TIME) {
        // If data is fresh and for the same deal, just use the cached data
        if (!dealInfoRef.current) {
          fetchDealInfo(dealName);
        }
        return;
      }
    }
    
    // Otherwise, fetch new data
    updateState('dealTimeline.loading', true);
    updateState('dealTimeline.error', null);
    setLoadingStartTime(Date.now());
    setLoadingStage(1);
    setLoadingError(false);
    
    try {
      // First fetch activities count to inform the user
      const count = await fetchActivitiesCount(dealName);
      
      // Fetch deal info
      await fetchDealInfo(dealName);
      
      // Then fetch timeline data
      console.log(`[Timeline] Fetching timeline data for: ${dealName} from URL`);
      const timelineResponse = await fetch(`http://localhost:8000/api/hubspot/deal-timeline?dealName=${encodeURIComponent(dealName)}`);
      
      console.log(`[Timeline] Response status: ${timelineResponse.status}`);
      
      if (timelineResponse.ok) {
        const data = await timelineResponse.json();
        
        // Verify the deal name matches before updating state
        if (selectedDealRef.current?.name === dealName) {
        updateState('dealTimeline.activities', data);
        updateState('dealTimeline.lastFetched', Date.now());
        } else {
          console.warn(`Deal name mismatch: URL deal=${dealName}, current deal=${selectedDealRef.current?.name}`);
        }
      } else {
        const errorText = await timelineResponse.text();
        console.error(`[Timeline] Error response: ${errorText}`);
        throw new Error(`Failed to load timeline data: ${timelineResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('[Timeline] Error fetching timeline:', error);
      setLoadingError(true);
      updateState('dealTimeline.error', 'Failed to load timeline data. Please try again.');
    } finally {
      updateState('dealTimeline.loading', false);
      setLoadingStartTime(null);
    }
  }, [
    DATA_EXPIRY_TIME,
    updateState,
    fetchDealInfo,
    fetchActivitiesCount,
    isUnmounting
  ]);


  // Format dates for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    } catch (e) {
      return 'Error';
    }
  };

  // Format dates for more detailed display
  const formatDateDetailed = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (e) {
      return 'Error';
    }
  };

  // Format dates for x-axis
  const formatXAxisDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date in formatXAxisDate:', dateStr);
        return dateStr; // Return the original string if it can't be parsed
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    } catch (e) {
      console.warn('Error in formatXAxisDate:', e);
      return dateStr;
    }
  };

  // Handle brush change
  const handleBrushChange = (newDomain: any) => {
    if (newDomain && 
        typeof newDomain.startIndex === 'number' && 
        !isNaN(newDomain.startIndex) &&
        typeof newDomain.endIndex === 'number' && 
        !isNaN(newDomain.endIndex)) {
      setStartIndex(newDomain.startIndex);
      setEndIndex(newDomain.endIndex);
    }
  };

  // Handle bar click to open drawer
  const handleBarClick = (data: any, index: number) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const clickedDate = data.activePayload[0].payload.date;
      setSelectedDate(clickedDate);
      setIsDrawerOpen(true);
    }
  };

  // Clean content from special characters
  const cleanContent = (content: string) => {
    if (!content) return '';
    return content
      .replace(/\n/g, ' ') // replace newline with space
      .replace(/\t/g, ' ') // replace tabs with space
      .replace(/<https?:\/\/[^>]*>/g, '[Link]') // URLs replaced with [Link]
      .replace(/\[image:[^\]]*\]/gi, '') // remove [image:...] tags
      .replace(/On .* wrote:.*$/, '') // remove all quoted email threads
      .replace(/\>.*?(?=(\>|$))/g, '') // remove lines starting with '>' (quoted)
      .replace(/[-]{2,}.*$/, '') // remove email signatures (after '--')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[Email]') // emails replaced with [Email]
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .replace(/Hi team -/, '') // remove greeting if desired
      .replace(/Hi all -/, '') // remove another greeting variant
      .replace(/@[A-Za-z ]+\[Link\]/g, '') // remove @mentions with [Link]
      .replace(/\*[^*]+\*/g, '') // remove emphasized text between asterisks
      .replace(/\(\d{3}\) \d{3}-\d{4}/g, '[Phone]') // replace phone numbers with [Phone]
      .trim();
  };

  // =====================================================================
  // EFFECTS USING THE ABOVE CALLBACKS
  // =====================================================================

  // Handle the loading stages based on elapsed time
  useEffect(() => {
    let loadingTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    
    if (loading && loadingStartTime) {
      // Calculate elapsed time since loading started (in seconds)
      const checkLoadingStage = () => {
        const elapsedSeconds = (Date.now() - loadingStartTime) / 1000;
        
        if (elapsedSeconds >= 80 && elapsedSeconds < 250) {
          setLoadingStage(3); // Almost done...
        } else if (elapsedSeconds >= 15 && elapsedSeconds < 80) {
          setLoadingStage(2); // Hang on a minute! Still loading...
        } else if (elapsedSeconds < 15) {
          setLoadingStage(1); // Loading timeline data...
        }
      };
      
      // Set a timer to check loading stage every second
      loadingTimer = setInterval(checkLoadingStage, 1000);
      
      // Set a timeout to automatically fail after 80 seconds
      timeoutTimer = setTimeout(() => {
        if (loading) {
          setLoadingStage(4);
          setLoadingError(true);
          updateState('dealTimeline.loading', false);
          updateState('dealTimeline.error', 'Request timed out. Please try again.');
        }
      }, 300000);
    }
    
    return () => {
      // Clean up timers when component unmounts or loading state changes
      if (loadingTimer) clearInterval(loadingTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }, [loading, loadingStartTime, updateState]);

  // Process URL parameters only once after mount
  useEffect(() => {
    if (!hasMounted || isUrlProcessed) return;
    
      const searchParams = new URLSearchParams(window.location.search);
      const dealName = searchParams.get('dealName');
      const autoload = searchParams.get('autoload') === 'true';
      
      if (dealName) {
        const decodedDealName = decodeURIComponent(dealName);
        console.log(`Found deal name in URL: ${decodedDealName}, autoload: ${autoload}`);
        
      // Only proceed if this is a different deal than what's currently loaded
        if (!selectedDeal || selectedDeal.name !== decodedDealName) {
          
        // First, try to find the deal in allDeals
        const matchingDeal = allDeals.find(d => d.name === decodedDealName);
        
        if (matchingDeal) {
          console.log(`Found matching deal in loaded deals: ${matchingDeal.name}`);
          updateState('dealTimeline.selectedDeal', matchingDeal);
          setSelectedOption({ value: matchingDeal.id, label: matchingDeal.name });
          setCurrentDealId(matchingDeal.id);
        } else {
          // If not found, create a temporary deal object
          const tempDeal = {
                name: decodedDealName,
            id: 'pending'
          };
          updateState('dealTimeline.selectedDeal', tempDeal);
          setSelectedOption({ value: 'pending', label: decodedDealName });
        }
        
          if (autoload) {
            console.log(`Autoloading timeline for: ${decodedDealName}`);
            loadTimelineDirectly(decodedDealName);
          }
        }
      }
      
      setIsUrlProcessed(true);
  }, [hasMounted, isUrlProcessed, selectedDeal, allDeals, updateState, loadTimelineDirectly, currentDealId]);

// Fetch all deals after component mounts and when needed
  useEffect(() => {
    if (!hasMounted) return;
    
    // Track if component is mounted (for async operations)
    let isMounted = true;
    
    // Only fetch if we don't have any deals or if this is the initial load
    if (allDeals.length === 0 || isInitialLoad) {
    const fetchAllDeals = async () => {
      try {
        if (isMounted) {
          setDealsLoading(true);
        }
        
        const response = await fetch('/api/hubspot/all-deals');
        
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`All deals error response: ${errorText}`);
          throw new Error(`Failed to fetch deals: ${response.status} - ${errorText}`);
        }
        
          const data: Deal[] = await response.json();
        
        if (isMounted) {
          updateState('dealTimeline.deals', data);
          
          // If we have a selected deal (from URL or elsewhere), find and update the dropdown
          if (selectedDeal) {
              const matchingDeal = data.find(d => d.name === selectedDeal.name);
            
            if (matchingDeal) {
              
              // Update the dropdown selection to match the found deal
              setSelectedOption({ 
                value: matchingDeal.id, 
                label: matchingDeal.name 
              });
              
              // Update the selected deal in the state with the correct ID if it's different
              if (selectedDeal.id !== matchingDeal.id) {
                updateState('dealTimeline.selectedDeal', { 
                  ...selectedDeal, 
                  id: matchingDeal.id 
                });
              }
            }
          }
          
          // Clear any stale error state
          updateState('dealTimeline.error', null);
        }
      } catch (error) {
        console.error('Error fetching deals:', error);
        if (isMounted) {
          updateState('dealTimeline.error', 'Failed to load deals. Please try again.');
        }
      } finally {
        if (isMounted) {
          setDealsLoading(false);
          setIsInitialLoad(false);
        }
      }
    };

    fetchAllDeals();
    }
    
    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [hasMounted, isInitialLoad]); // Remove allDeals and selectedDeal from dependencies

  useEffect(() => {
    if (timelineData && timelineData.events && timelineData.start_date && timelineData.end_date) {
      console.log("Timeline Data Received:", {
        startDate: timelineData.start_date,
        endDate: timelineData.end_date,
        totalEvents: timelineData.events.length,
        events: timelineData.events.map(event => ({
          date: event.date_str,
          type: event.type,
          subject: event.subject,
          sentiment: event.sentiment,
          buyer_intent: event.buyer_intent,
          buyer_intent_explanation: event.buyer_intent_explanation,
          content_preview: event.content_preview?.slice(0, 100) + '...'
        }))
      });
      const extendedEndDate = new Date(timelineData.end_date);
      extendedEndDate.setDate(extendedEndDate.getDate() + 1);
      timelineData.end_date = extendedEndDate.toISOString().split('T')[0];
      try {
        // Validate start and end dates
        if (!isValidDate(timelineData.start_date) || !isValidDate(timelineData.end_date)) {
          console.error('Invalid start or end date:', timelineData.start_date, timelineData.end_date);
          setChartData([]);
          return;
        }
        
        const startDate = new Date(timelineData.start_date);
        const endDate = extendedEndDate;
        
        // Create an array of all dates in the range including the end date
        const dates = [];
        
        // Ensure we include the end date with <=
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split('T')[0]);
        }
        
        // Create a map of events by date
        const eventsByDate: Record<string, any> = {};
        
        // Initialize all dates in the range with zero counts
        dates.forEach(date => {
          eventsByDate[date] = {
            date,
            Meeting: 0,
            'Outgoing Email': 0,
            'Incoming Email': 0,
            'Note': 0,
            totalEvents: 0,
            hasNegativeSentimentIncoming: false,
            hasNegativeSentimentOutgoing: false,
            hasLessLikelyToBuy: false,
            hasVeryLikelyToBuy: false
          };
        });
        
        // Count events by type for each date
        timelineData.events.forEach(event => {
          // Skip events with invalid dates or dates outside our range
          if (!event.date_str || !eventsByDate[event.date_str]) {
            return;
          }
          
          // Handle unknown event types gracefully
          const eventType = event.type || 'Note';
          if (eventsByDate[event.date_str][eventType] !== undefined) {
            eventsByDate[event.date_str][eventType]++;
          } else {
            // Fall back to Note for unknown event types
            eventsByDate[event.date_str]['Note']++;
          }
          
          // Track negative sentiments and less likely to buy intents
          if (eventType === 'Incoming Email' && event.sentiment === 'negative') {
            eventsByDate[event.date_str].hasNegativeSentimentIncoming = true;
          }
          if (eventType === 'Outgoing Email' && event.sentiment === 'negative') {
            eventsByDate[event.date_str].hasNegativeSentimentOutgoing = true;
          }
          if (eventType === 'Meeting' && event.buyer_intent === 'Less likely to buy') {
            eventsByDate[event.date_str].hasLessLikelyToBuy = true;
          }
          if (eventType === 'Meeting' && event.buyer_intent === 'Very likely to buy') {
            eventsByDate[event.date_str].hasVeryLikelyToBuy = true;
          }
          
          eventsByDate[event.date_str].totalEvents++;
        });
        
        // Convert to array and ensure date sorting works correctly
        const formattedData = dates.map(date => eventsByDate[date])
          .sort((a, b) => {
            // Ensure valid dates for sorting
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            
            if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            
            return dateA.getTime() - dateB.getTime();
          });
        
        // Filter out any invalid dates to prevent chart errors
        const validFormattedData = formattedData.filter(item => isValidDate(item.date));
        
        setChartData(validFormattedData);
        
        // Update dealInfo if we have timeline data but not dealInfo
        if (selectedDeal && !dealInfo) {
          fetchDealInfo(selectedDeal.name);
        }
      } catch (error) {
        console.error('Error processing timeline data:', error);
        setChartData([]);
      }
    }
  }, [timelineData, selectedDeal, dealInfo, fetchDealInfo]);

  // Update end index when chart data changes
  useEffect(() => {
    if (chartData.length > 0) {
      try {
        // Find the indices of the first and last events
        const firstEventIndex = chartData.findIndex(item => 
          item.Meeting > 0 || item['Outgoing Email'] > 0 || item['Incoming Email'] > 0 || item.Note > 0
        );
        
        const lastEventIndex = chartData.length - 1 - [...chartData].reverse().findIndex(item => 
          item.Meeting > 0 || item['Outgoing Email'] > 0 || item['Incoming Email'] > 0 || item.Note > 0
        );
        
        // Handle cases where no events are found
        const validFirstIndex = firstEventIndex >= 0 ? Math.max(0, firstEventIndex - 2) : 0;
        const validLastIndex = lastEventIndex >= 0 ? Math.min(chartData.length - 1, lastEventIndex + 2) : chartData.length - 1;
        
        setStartIndex(validFirstIndex);
        setEndIndex(validLastIndex);
      } catch (error) {
        console.error('Error setting chart indices:', error);
        // Default to showing all data if there's an error
        setStartIndex(0);
        setEndIndex(chartData.length - 1);
      }
    } else {
      // Reset indices if there's no data
      setStartIndex(0);
      setEndIndex(0);
    }
  }, [chartData]);

  // Custom tooltip for the chart - SIMPLIFIED VERSION
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length || !timelineData || !label) {
      return null;
    }
    
    try {
      const dateStr = label;
      
      // Validate the date
      const tooltipDate = new Date(dateStr);
      if (isNaN(tooltipDate.getTime())) {
        return null;
      }
      
      // Get all events for this date from the original data
      const eventsForDate = timelineData.events.filter(event => event.date_str === dateStr) || [];

      // Count events by type and track meeting intents and email sentiments
      const eventTypeCount: Record<string, number> = {};
      const meetingIntents: string[] = [];
      const incomingEmailSentiments: string[] = [];
      const outgoingEmailSentiments: string[] = [];
      
      eventsForDate.forEach(event => {
        const type = event.type || 'Note';
        eventTypeCount[type] = (eventTypeCount[type] || 0) + 1;
        
        // Track buyer intents for meetings
        if (type === 'Meeting' && event.buyer_intent) {
          meetingIntents.push(event.buyer_intent);
        }
        
        // Track sentiments for emails
        if (type === 'Incoming Email' && event.sentiment) {
          incomingEmailSentiments.push(event.sentiment);
        }
        
        if (type === 'Outgoing Email' && event.sentiment) {
          outgoingEmailSentiments.push(event.sentiment);
        }
      });

      // Function to get intent color
      const getIntentColor = (intent: string) => {
        if (intent === 'Very likely to buy') {
          return 'text-[#008c28] font-bold';
        } else if (intent === 'Likely to buy') {
          return 'text-green-700 font-medium';
        } else if (intent === 'Less likely to buy') {
          return 'text-red-600 font-medium';
        }
        return 'text-gray-600';
      };

      // Function to get sentiment color
      const getSentimentColor = (sentiment: string) => {
        if (sentiment === 'positive') {
          return 'text-green-700 font-medium';
        } else if (sentiment === 'negative') {
          return 'text-red-600 font-medium';
        }
        return 'text-gray-600';
      };

      return (
        <div className="bg-white p-4 shadow-lg rounded-md border border-gray-200">
          <p className="font-medium text-lg mb-2">
            {tooltipDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
          <hr className="my-2 border-gray-200" />
          
          <div className="mt-2">
            <p className="font-semibold mb-1">Events ({eventsForDate.length}):</p>
            <ul className="list-none pl-0">
              {Object.entries(eventTypeCount).map(([type, count]) => (
                <li key={type} className="flex items-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded-full ${
                    type === 'Meeting' ? 'bg-red-300' : 
                    type === 'Incoming Email' ? 'bg-green-300' : 
                    type === 'Outgoing Email' ? 'bg-blue-300' : 'bg-teal-200'
                  }`}></span>
                  <span>
                    {type}: {count}
                    {type === 'Meeting' && meetingIntents.length > 0 && (
                      <span className="ml-2 text-sm">
                        ({meetingIntents.map((intent, index) => (
                          <span key={index} className={getIntentColor(intent)}>
                            {intent}{index < meetingIntents.length - 1 ? ', ' : ''}
                          </span>
                        ))})
                      </span>
                    )}
                    {type === 'Incoming Email' && incomingEmailSentiments.length > 0 && (
                      <span className="ml-2 text-sm">
                        ({incomingEmailSentiments.map((sentiment, index) => (
                          <span key={index} className={getSentimentColor(sentiment)}>
                            {sentiment}{index < incomingEmailSentiments.length - 1 ? ', ' : ''}
                          </span>
                        ))})
                      </span>
                    )}
                    {type === 'Outgoing Email' && outgoingEmailSentiments.length > 0 && (
                      <span className="ml-2 text-sm">
                        ({outgoingEmailSentiments.map((sentiment, index) => (
                          <span key={index} className={getSentimentColor(sentiment)}>
                            {sentiment}{index < outgoingEmailSentiments.length - 1 ? ', ' : ''}
                          </span>
                        ))})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-blue-500 mt-2 italic">Click for details</p>
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error rendering tooltip:', error);
      return null;
    }
  };

// Event Drawer Component
const EventDrawer = () => {
  // State for managing content display
  const [eventContents, setEventContents] = useState<Record<string, string>>({});
  const [loadingContents, setLoadingContents] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});

  const toggleSection = (index: number) => {
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  if (!selectedDate || !timelineData) return null;
  
  // const eventsForDate = timelineData.events.filter(event => event.date_str === selectedDate) || [];

  const eventsForDate = useMemo(() => {
    if (!selectedDate || !timelineData) return [];
    return timelineData.events
      .filter(event => event.date_str === selectedDate)
      .sort((a, b) => {
        if (!a.time_str && !b.time_str) return 0;
        if (!a.time_str) return 1;
        if (!b.time_str) return -1;
        return a.time_str.localeCompare(b.time_str);
      });
  }, [selectedDate, timelineData]);  

  // Sort events by time
  eventsForDate.sort((a, b) => {
    if (!a.time_str && !b.time_str) return 0;
    if (!a.time_str) return 1;
    if (!b.time_str) return -1;
    return a.time_str.localeCompare(b.time_str);
  });
  
  useEffect(() => {
    if (isDrawerOpen && eventsForDate && eventsForDate.length > 0) {
      const initialState: Record<number, boolean> = {};
      eventsForDate.forEach((_, index) => {
        initialState[index] = true;
      });
      setExpandedSections(initialState);
    }
  }, [isDrawerOpen, eventsForDate.length]);

  // Function to fetch event content safely
  const fetchEventContent = async (eventId: string) => {
    if (!selectedDeal || !eventId) return;
    
    // Mark this event as loading
    setLoadingContents(prev => ({ ...prev, [eventId]: true }));
    
    try {
      // Extract the engagement ID by splitting at the first underscore
      const engagementId = eventId.split('_')[0];
      
      // Try to fetch content, but use API check first
      if (dealInfo && dealInfo.dealId) {
        
        // We'll use a timeout to prevent the request from hanging too long
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch(`/api/hubspot/event-content/${dealInfo.dealId}/${engagementId}`, {
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            setEventContents(prev => ({ 
              ...prev, 
              [eventId]: data.content || 'No content available' 
            }));
            return;
          }
        } catch (fetchError) {
          console.log('Fetch operation canceled or failed:', fetchError);
          // Continue to fallback
        }
      }
      
      // Use the content preview as fallback
      const evt = eventsForDate.find(e => e.id === eventId);
      const fallbackContent = evt?.content || evt?.content_preview || 'Content unavailable';
      
      // reduce font of fallbackContent to 12px
      const reducedContent = fallbackContent.replace(/<[^>]*>/g, '').slice(0, 100);
      setEventContents(prev => ({ 
        ...prev, 
        [eventId]: reducedContent
      }));
    } catch (error) {
      console.error('Error handling event content:', error);
      
      // Use the content preview as fallback
      const evt = eventsForDate.find(e => e.id === eventId);
      const fallbackContent = evt?.content || evt?.content_preview || 'Content unavailable';
      

      // reduce font of fallbackContent to 12px
      const reducedContent = fallbackContent.replace(/<[^>]*>/g, '').slice(0, 100);
      setEventContents(prev => ({ 
        ...prev, 
        [eventId]: reducedContent
      }));
    } finally {
      setLoadingContents(prev => ({ ...prev, [eventId]: false }));
    }
  };
  
  // Clean content from special characters
  const cleanDrawerContent = (content: string) => {
    if (!content) return '';
    return content
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/<([^>]*)>/g, '[Link]') // Match anything between angle brackets
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Add new function to format email content
  const formatEmailContent = (content: string) => {
    if (!content) return '';
    
    // Split content into paragraphs
    const paragraphs = content.split(/\n\s*\n/);
    
    // Process each paragraph
    return paragraphs.map((paragraph, index) => {
      // Clean up the paragraph
      let cleanParagraph = paragraph
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/<([^>]*)>/g, '[Link]')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Skip empty paragraphs
      if (!cleanParagraph) return null;
      
      // Check if this is a quoted section
      if (cleanParagraph.startsWith('>')) {
        return (
          <div key={index} className="pl-4 border-l-2 border-gray-200 my-2 text-gray-500 italic">
            {cleanParagraph.replace(/^>+/, '').trim()}
          </div>
        );
      }
      
      // Check if this is a signature section
      if (cleanParagraph.startsWith('--')) {
        return (
          <div key={index} className="mt-4 pt-4 border-t border-gray-200 text-gray-500 text-sm">
            {cleanParagraph.replace(/^--+/, '').trim()}
          </div>
        );
      }
      
      // Regular paragraph
      return (
        <div key={index} className="my-2">
          {cleanParagraph}
        </div>
      );
    }).filter(Boolean);
  };

  return (
    <div 
      ref={drawerRef}
      className={`fixed top-0 right-0 h-full w-96 bg-white shadow-lg z-50 overflow-y-auto transform ${
        isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
      } transition-transform duration-300 ease-in-out`}
    >
      <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10 flex justify-between items-center">
        <h3 className="text-xl font-bold">
          {selectedDate ? formatDateDetailed(selectedDate) : 'Events'}
        </h3>
        <button 
          onClick={() => setIsDrawerOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-4">
        {eventsForDate.length > 0 ? (
          <div>
            <p className="text-gray-600 mb-4">Total events: {eventsForDate.length}</p>
            
            {eventsForDate.map((event, index) => (
              <div 
                id={`event-section-${index}`} 
                key={index} 
                className="mb-4 border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Header - always visible and clickable */}
                <div 
                  className={`p-3 flex items-center gap-2 cursor-pointer hover:bg-gray-50 ${
                    expandedSections[index] ? 'bg-blue-50' : 'bg-white'
                  }`}
                  onClick={() => toggleSection(index)}
                >
                  <span className={`w-4 h-4 rounded-full ${
                    event.type === 'Meeting' ? 'bg-red-400' : 
                    event.type === 'Incoming Email' ? 'bg-green-400' : 
                    event.type === 'Outgoing Email' ? 'bg-blue-400' : 'bg-teal-300'
                  }`}></span>
                  <span className="font-bold">{event.type}</span>
                  {event.time_str && (
                    <span className="text-gray-500 ml-auto mr-2">{event.time_str}</span>
                  )}
                  
                  {/* Toggle icon */}
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-5 w-5 transition-transform ${expandedSections[index] ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                
                {/* Content - only visible when expanded */}
                {expandedSections[index] && (
                  <div className="p-3 border-t border-gray-200">
                    {/* Email-specific header for email events */}
                    {(event.type === 'Incoming Email' || event.type === 'Outgoing Email') && (
                      <div className="mb-4 bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            event.type === 'Incoming Email' ? 'bg-green-100' : 'bg-blue-100'
                          }`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${
                              event.type === 'Incoming Email' ? 'text-green-600' : 'text-blue-600'
                            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{event.subject}</h4>
                            <p className="text-sm text-gray-500">
                              {event.type === 'Incoming Email' ? 'Received' : 'Sent'} at {event.time_str}
                            </p>
                          </div>
                        </div>
                        
                        {/* Sentiment indicator */}
                        {event.sentiment && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              event.sentiment === 'positive' 
                                ? 'bg-green-100 text-green-800' 
                                : event.sentiment === 'negative'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {event.sentiment.charAt(0).toUpperCase() + event.sentiment.slice(1)} Sentiment
                            </span>
                      </div>
                    )}
                    </div>
                    )}

                    {/* Meeting-specific header for meeting events */}
                    {event.type === 'Meeting' && (
                      <div className="mb-4 bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{event.subject}</h4>
                            <p className="text-sm text-gray-500">Meeting at {event.time_str}</p>
                          </div>
                        </div>
                        
                        {/* Buyer Intent indicator */}
                    {event.buyer_intent && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              event.buyer_intent === 'Very likely to buy' || event.buyer_intent === 'Likely to buy'
                                ? 'bg-green-100 text-green-800'
                            : event.buyer_intent === 'Less likely to buy' 
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                        }`}>
                          {event.buyer_intent}
                            </span>
                      </div>
                    )}
                      </div>
                    )}
                    
                    {/* Content section */}
                    <div className="mt-4">
                      {loadingContents[event.id] ? (
                          <div className="flex items-center text-blue-600 mb-2">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Loading content...
                          </div>
                      ) : (
                        <div className="prose prose-sm max-w-none">
                          {formatEmailContent(eventContents[event.id] || event.content || '')}
                          </div>
                        )}
                    </div>

                    {/* Buyer Intent Explanation for meetings */}
                    {event.type === 'Meeting' && event.buyer_intent_explanation && event.buyer_intent_explanation !== 'N/A' && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <h4 className="font-semibold text-blue-900 mb-2">Intent Analysis</h4>
                        <p className="text-sm text-blue-800">
                          {event.buyer_intent_explanation}
                        </p>
                      </div>
                    )}

                    {/* Champion Information for Meetings */}
                    {event.type === 'Meeting' && event.subject && event.date_str && (
                      <div className="mt-4">
                        <h4 className="font-semibold mb-2">Meeting Participants</h4>
                        {meetingContacts[`${event.subject}_${event.date_str}`] ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              <span>{meetingContacts[`${event.subject}_${event.date_str}`].total_contacts} Total Participants</span>
                    </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>{meetingContacts[`${event.subject}_${event.date_str}`].champions_count} Champions</span>
                  </div>
                            <div className="mt-3 space-y-2">
                              {meetingContacts[`${event.subject}_${event.date_str}`].contacts.map((contact, idx) => (
                                <div key={idx} className="p-2 bg-white rounded border border-gray-100">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{contact.email}</span>
                                    {contact.champion && (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                                        Champion
                                      </span>
                                    )}
                                  </div>
                                  {contact.champion && contact.explanation && (
                                    <p className="mt-1 text-xs text-gray-600 italic">
                                      {contact.explanation}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 italic">Loading participant information...</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 my-8">No events found for this date.</p>
        )}
      </div>
    </div>
  );
};

// Add this helper function before the DealLogs component
const isFutureDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

// New DealLogs component
const DealLogs: React.FC<{ events: Event[] }> = ({ events }) => {
  // Add state for event type filtering
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    'Meeting': true,
    'Incoming Email': true,
    'Outgoing Email': true,
    'Note': true
  });

  // Sort events by date and time in reverse chronological order
  const sortedEvents = [...events].sort((a, b) => {
    const dateCompare = b.date_str.localeCompare(a.date_str);
    if (dateCompare !== 0) return dateCompare;
    return (b.time_str || '').localeCompare(a.time_str || '');
  });

  // Filter events based on active filters
  const filteredEvents = sortedEvents.filter(event => activeFilters[event.type] || false);

  // Function to toggle a filter
  const toggleFilter = (eventType: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [eventType]: !prev[eventType]
    }));
  };

  // Function to handle row click
  const handleRowClick = (event: Event, index: number) => {
    // Set the selected date to open the drawer
    setSelectedDate(event.date_str);
    
    // Always open the drawer if it's closed
    setIsDrawerOpen(true);
    
    // After a short delay to allow the drawer to open, scroll to the event
    setTimeout(() => {
      const element = document.getElementById(`event-section-${index}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Function to get event type color
  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'Meeting':
        return 'text-red-600';
      case 'Incoming Email':
        return 'text-green-600';
      case 'Outgoing Email':
        return 'text-blue-600';
      default:
        return 'text-teal-600';
    }
  };

  // Function to get event type background color for filter buttons
  const getEventTypeBackgroundColor = (type: string) => {
    switch (type) {
      case 'Meeting':
        return 'bg-red-100';
      case 'Incoming Email':
        return 'bg-green-100';
      case 'Outgoing Email':
        return 'bg-blue-100';
      default:
        return 'bg-teal-100';
    }
  };

  // Function to get intent/sentiment color
  const getIntentSentimentColor = (event: Event) => {
    if (event.type === 'Meeting' && event.buyer_intent) {
      if (event.buyer_intent === 'Very likely to buy') {
        return 'text-[#4bdb2e] font-bold';
      } else if (event.buyer_intent === 'Likely to buy') {
        return 'text-green-700 font-medium';
      } else if (event.buyer_intent === 'Less likely to buy') {
        return 'text-red-600 font-medium';
      }
    } else if (event.sentiment) {
      if (event.sentiment === 'positive') {
        return 'text-green-700 font-medium';
      } else if (event.sentiment === 'negative') {
        return 'text-red-600 font-medium';
      }
    }
    return 'text-gray-600';
};

return (
    <div className="mt-8 bg-white rounded-lg shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)]">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-xl font-semibold">Deal Logs: {selectedDeal?.name}</h3>
        
        {/* Filter controls */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-600 self-center mr-2">Filter by:</span>
          {Object.keys(activeFilters).map(eventType => (
            <button
              key={eventType}
              onClick={() => toggleFilter(eventType)}
              className={`px-3 py-1 text-sm rounded-full transition-colors border ${
                activeFilters[eventType] 
                  ? `${getEventTypeBackgroundColor(eventType)} border-gray-300 font-medium` 
                  : 'bg-gray-100 border-gray-200 text-gray-400'
              }`}
            >
              <span className={activeFilters[eventType] ? getEventTypeColor(eventType) : ''}>
                {eventType}
              </span>
              <span className="ml-1 text-gray-500">
                ({sortedEvents.filter(e => e.type === eventType).length})
              </span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Fixed height container with scrolling */}
      <div className="h-[400px] overflow-y-auto shadow-inner">
        {/* Header row */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 grid grid-cols-12 gap-4 font-semibold text-gray-600">
          <div className="col-span-2">Date</div>
          <div className="col-span-2">Event</div>
          <div className="col-span-2">Sentiment</div>
          <div className="col-span-6">Details</div>
        </div>
        <div className="divide-y divide-gray-100">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event, index) => (
              <div 
                key={index} 
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(event, index)}
                data-deal-log-row="true"
              >
                <div className="grid grid-cols-12 gap-4">
                  {/* Date */}
                  <div className="col-span-2">
                    <span className={`text-gray-500 font-mono ${
                      isFutureDate(event.date_str) ? 'text-blue-600 font-medium' : ''
                    }`}>
                      {(() => {
                        const dateObj = new Date(event.date_str);
                        
                        // Check if time is 15:00 or later and add a day if needed
                        if (event.time_str) {
                          const timeParts = event.time_str.split(':');
                          const hours = parseInt(timeParts[0], 10);
                          
                          if (hours >= 15) {
                            dateObj.setDate(dateObj.getDate() + 1);
                          }
                        }
                        
                        return (
                          <span className="flex items-center gap-1">
                            {dateObj.toLocaleDateString('en-US', { 
                              day: '2-digit', 
                              month: 'short',
                              year: 'numeric'
                            })}
                            {isFutureDate(event.date_str) && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                                Upcoming
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </span>
                  </div>

                  {/* Event Type */}
                  <div className="col-span-2">
                    <span className={`font-medium ${getEventTypeColor(event.type)}`}>
                      {event.type}
                    </span>
                  </div>

                  {/* Intent/Sentiment */}
                  <div className="col-span-2">
                    {(event.type === 'Meeting' && event.buyer_intent) ? (
                      <span className={getIntentSentimentColor(event)}>
                        {event.buyer_intent}
                      </span>
                    ) : event.sentiment ? (
                      <span className={getIntentSentimentColor(event)}>
                        {event.sentiment}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="col-span-6">
                    {event.type === 'Meeting' && event.buyer_intent_explanation ? (
                      <span className="text-gray-700">
                        {event.buyer_intent_explanation}
                      </span>
                    ) : event.content ? (
                      <span className="text-gray-700">
                        {event.content}
                      </span>
                    ) : event.subject ? (
                      <span className="text-gray-700">
                        {event.subject}
                      </span>
                    ) : (
                      <span className="text-gray-700">
                        {event.content_preview || 'No content available'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">
              No events match the selected filters. Try changing your filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Add these helper functions before the return statement
const calculateDaysPassed = (startDate: string): number => {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDaysColor = (days: number): string => {
  if (days < 30) return 'text-green-600';
  if (days < 90) return 'text-orange-600';
  return 'text-red-600';
};

const getInitials = (name: string | undefined | null): string => {
  if (!name || typeof name !== 'string') return '';
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Handler for toggling bookmarks
const handleBookmarkToggle = (e: React.MouseEvent, dealId: string) => {
  e.stopPropagation(); // Prevent deal selection when clicking bookmark
  setBookmarkedDeals(prev => {
    const newBookmarks = new Set(prev);
    if (newBookmarks.has(dealId)) {
      newBookmarks.delete(dealId);
    } else {
      newBookmarks.add(dealId);
    }
    return newBookmarks;
  });
};

// Add this function before the return statement
const handleMetricClick = (filterType: string) => {
  if (!timelineData?.events) return;
  
  let filteredDate = '';
  let matchingEvent = null;
  
  // Find the most recent event that matches our criteria
  for (const event of timelineData.events) {
    switch (filterType) {
      case 'positive-incoming':
        if (event.type === 'Incoming Email' && event.sentiment === 'positive') {
          matchingEvent = event;
        }
        break;
      case 'likely-buy':
        if (event.type === 'Meeting' && 
            (event.buyer_intent === 'Likely to buy' || event.buyer_intent === 'Very likely to buy')) {
          matchingEvent = event;
        }
        break;
      case 'less-likely':
        if (event.type === 'Meeting' && event.buyer_intent === 'Less likely to buy') {
          matchingEvent = event;
        }
        break;
    }
    
    if (matchingEvent) {
      filteredDate = matchingEvent.date_str;
      break;
    }
  }
  
  if (filteredDate) {
    setSelectedDate(filteredDate);
    setIsDrawerOpen(true);
  }
};

// Add this near the top of the component
useEffect(() => {
  // Remove any dark mode attributes that might have been added by browser extensions
  const html = document.documentElement;
  html.removeAttribute('data-darkreader-mode');
  html.removeAttribute('data-darkreader-scheme');
  html.removeAttribute('data-darkreader-proxy-injected');
}, []);

// Add function to fetch contacts for a meeting
const fetchMeetingContacts = useCallback(async (meetingSubject: string, meetingDate: string) => {
  console.log('[Contacts] Called with:', { meetingSubject, meetingDate });
  
  if (!selectedDeal?.name) {
    console.error('[Contacts] No selected deal available');
    return null;
  }
  
  try {
    // Create a cache key
    const cacheKey = `${meetingSubject || selectedDeal.name}_${meetingDate}`;
    console.log('[Contacts] Cache key:', cacheKey);
    
    // Check if we already have data for this meeting using the ref
    if (meetingContacts[cacheKey]?.contacts?.length > 0) {
      console.log(`[Contacts] Using cached data for ${cacheKey}`);
      // Update state with cached data to ensure UI consistency
      setMeetingContacts(prev => ({
        ...prev,
        [cacheKey]: meetingContacts[cacheKey]
      }));
      return meetingContacts[cacheKey];
    }
    
    // Always use the selected deal's name as the dealName parameter
    const apiUrl = `/api/hubspot/contacts-and-champion?dealName=${encodeURIComponent(selectedDeal.name)}&date=${meetingDate}&_t=${new Date().getTime()}`;
    console.log(`[Contacts] Making API call to: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    console.log(`[Contacts] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Contacts] Error response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return null;
    }
    
    const data: ContactsData = await response.json();
    console.log(`[Contacts] Received data for ${cacheKey}:`, data);
    
    // Only update state and ref if we have valid data
    if (data && data.contacts) {
      // Update both the ref and state atomically
      setMeetingContacts(prev => ({
        ...prev,
        [cacheKey]: data
      }));
      
      console.log(`[Contacts] Successfully stored data for ${cacheKey}`);
      return data;
    } else {
      console.error('[Contacts] Invalid data received:', data);
      return null;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('[Contacts] Error fetching contacts:', error.message);
    } else {
      console.error('[Contacts] Unknown error:', error);
    }
    return null;
  }
}, [selectedDeal]);

// Update handleDealChange to ensure champions are fetched for new deals
const handleDealChange = useCallback(async (selectedOption: any) => {
  const deal = selectedOption ? { 
    id: selectedOption.value, 
    name: selectedOption.label,
    createdate: '',
    owner: ''
  } : null;
  
  // If we're selecting the same deal, don't do anything
  if (deal?.id === currentDealId) {
    return;
  }

  console.log('[DealChange] Changing to deal:', deal?.name);
  
  // Clean up previous state
  cleanupState();
  setMeetingContacts({}); // Clear meeting contacts when changing deals
  
  updateState('dealTimeline.selectedDeal', deal);
  setSelectedOption(selectedOption);
  
  if (!deal) {
    // Clear URL parameters if no deal is selected
    const url = new URL(window.location.href);
    url.searchParams.delete('dealName');
    url.searchParams.delete('autoload');
    window.history.pushState({}, '', url.toString());
    return;
  }

  // Update current deal ID
  setCurrentDealId(deal.id);
  
  // Update URL with selected deal
  const url = new URL(window.location.href);
  url.searchParams.set('dealName', deal.name);
  url.searchParams.set('autoload', 'true');
  window.history.pushState({}, '', url.toString());

  // Only fetch new data if we don't have it already
  const currentTimeline = timelineDataRef.current;
  const shouldLoadTimeline = !currentTimeline || 
    (selectedDealRef.current && deal.name !== selectedDealRef.current.name);
    
  if (shouldLoadTimeline) {
    handleGetTimeline(deal);
  } else {
    if (currentTimeline) {
      fetchDealInfo(deal.name);
    }
  }
}, [updateState, fetchDealInfo, handleGetTimeline, cleanupState, currentDealId]);

// Update handleRefresh to refresh all data including champions
const handleRefresh = useCallback(() => {
  if (selectedDealRef.current) {
    console.log('Manual refresh triggered for:', selectedDealRef.current.name);
    
    // Reset all state
    cleanupState();
    setMeetingContacts({});
    
    // Clear any cached data and force refresh
    updateState('dealTimeline.activities', null);
    updateState('dealTimeline.lastFetched', null);
    updateState('dealTimeline.error', null);
    
    // Reset loading states
    updateState('dealTimeline.loading', false);
    setLoadingStartTime(null);
    setLoadingStage(1);
    setLoadingError(false);
    
    // Clear chart data
    setChartData([]);
    
    // Force a fresh fetch of all data by passing true as second argument
    handleGetTimeline(selectedDealRef.current, true).then(() => {
      // After timeline loads, explicitly refresh champions
      console.log('[Refresh] Timeline loaded, refreshing champions...');
    }).catch(error => {
      console.error('[Refresh] Error during refresh sequence:', error);
    });
  } else {
    setIsInitialLoad(true);
  }
}, [handleGetTimeline, cleanupState, updateState]);

// Update the effect that fetches champions to be more robust
// Effect to automatically fetch champions after timeline loads
useEffect(() => {
  if (!timelineData?.events || !selectedDeal?.name || isUnmounting) {
    console.log('[Timeline] No timeline data or selected deal available');
    return;
  }
  
  // Check if we need to fetch contacts for meetings
  const meetingEvents = timelineData.events.filter(event => event.type === 'Meeting');
  
  if (meetingEvents.length === 0) {
    console.log('[Timeline] No meeting events found in timeline data');
    return;
  }
  
  console.log(`[Timeline] Found ${meetingEvents.length} meetings, fetching contacts...`);
  setLoadingChampions(true);
  
  // Process meetings sequentially to avoid overwhelming the server
  const processMeetings = async () => {
    let completedRequests = 0;
    let failedRequests = 0;
    
    for (const event of meetingEvents) {
      if (event.date_str && !isUnmounting) {
        try {
          console.log(`[Timeline] Processing meeting: ${event.subject} on ${event.date_str}`);
          const result = await fetchMeetingContacts(event.subject || '', event.date_str);
          
          if (result) {
            completedRequests++;
            console.log(`[Timeline] Successfully fetched contacts for meeting ${completedRequests}/${meetingEvents.length}`);
          } else {
            failedRequests++;
            console.log(`[Timeline] Failed to fetch contacts for meeting on ${event.date_str}`);
          }
        } catch (error) {
          console.error('[Timeline] Error fetching meeting contacts:', error);
          failedRequests++;
        }
      }
    }
    
    console.log('[Timeline] Completed fetching meeting contacts:', {
      total: meetingEvents.length,
      completed: completedRequests,
      failed: failedRequests
    });
    
    if (!isUnmounting) {
      setLoadingChampions(false);
    }
  };
  
  processMeetings();
  
}, [timelineData, selectedDeal, fetchMeetingContacts, isUnmounting]);

// Add cleanup effect when component unmounts
useEffect(() => {
  return () => {
    setIsUnmounting(true);
    cleanupState();
  };
}, [cleanupState]);

return (
  <div className="flex h-screen" suppressHydrationWarning>
    {/* Sidebar */}
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      {/* Search bar */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <input
            type="text"
            placeholder="Search deals..."
            value={dealSearchTerm}
            onChange={(e) => setDealSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Stage filter chips */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-wrap gap-2 p-2 bg-gray-50 border-b">
          {uniqueStages.map((stage) => {
            const isSelected = selectedStages.has(stage);
            return (
              <button
                key={stage}
                onClick={() => toggleStageFilter(stage)}
                className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                  isSelected 
                    ? `${getStageColor(stage).bg} ${getStageColor(stage).text} border ${getStageColor(stage).border}`
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                } hover:opacity-90 transition-opacity`}
              >
                {getStageInitials(stage)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Regular Deals Section - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">All Deals</h3>
          <div className="space-y-2">
            {filteredDeals.map(deal => {
              const daysPassed = getDaysPassed(deal);
              return (
                <div
                  key={deal.id}
                  className="flex items-start justify-between p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100"
                  onClick={() => {
                    if (deal.name) {
                      const url = new URL(window.location.href);
                      url.searchParams.set('dealName', deal.name);
                      url.searchParams.set('autoload', 'true');
                      window.history.pushState({}, '', url.toString());
                      
                      // Update selected deal
                      updateState('dealTimeline.selectedDeal', deal);
                      setSelectedOption({ value: deal.id, label: deal.name });
                      setCurrentDealId(deal.id);
                      
                      // Load timeline
                      handleGetTimeline(deal);
                    }
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {deal.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Stage: {deal.stage}
                    </div>
                    <div className="text-xs text-gray-500">
                      Created: {formatDate(deal.createdate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {deal.stage && (
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: getStageColor(deal.stage).text === 'text-emerald-700' ? '#047857' :
                                        getStageColor(deal.stage).text === 'text-red-700' ? '#b91c1c' :
                                        getStageColor(deal.stage).text === 'text-blue-700' ? '#1d4ed8' :
                                        getStageColor(deal.stage).text === 'text-yellow-700' ? '#a16207' :
                                        getStageColor(deal.stage).text === 'text-purple-700' ? '#6b21a8' :
                                        getStageColor(deal.stage).text === 'text-indigo-700' ? '#3730a3' :
                                        getStageColor(deal.stage).text === 'text-green-700' ? '#15803d' :
                                        getStageColor(deal.stage).text === 'text-orange-700' ? '#c2410c' :
                                        getStageColor(deal.stage).text === 'text-pink-700' ? '#be185d' : '#6b7280',
                          border: '1px solid rgba(0, 0, 0, 0.1)'
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

    {/* Main Content */}
    <div className="flex-1 overflow-y-auto">
      <div className="p-6">
    <div className="flex justify-between items-center mb-6">
      <div className="flex items-center gap-4">
        {/* <h1 className="text-2xl font-bold">Deal Timeline</h1> */}
        {selectedDeal && (
          <span className="text-2xl font-bold text-gray-600">{selectedDeal.name}</span>
        )}
      </div>
      
      {/* Refresh button with last updated timestamp */}
      <div className="flex items-center space-x-4">
        {lastFetched && (
          <span className="text-sm text-gray-500">
            Updated {new Date(lastFetched).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={handleRefresh}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm flex items-center"
          disabled={loading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>
    
    {/* Activity count message */}
    {selectedDeal && (
      <div className="mb-6 bg-blue-50 p-3 rounded-md border border-blue-100">
        {fetchingActivities ? (
          <p className="text-blue-700 font-medium flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Counting activities for <span className="font-bold ml-1">{selectedDeal.name}</span>...
          </p>
        ) : activitiesCount !== null ? (
          <p className="text-blue-800 font-medium">
            <span className="font-bold text-lg">{activitiesCount}</span> activities found for this deal
          </p>
        ) : timelineData ? (
          <p className="text-blue-800 font-medium">
            <span className="font-bold text-lg">{timelineData.events.length}</span> activities found for this deal
          </p>
        ) : (
          <p className="text-blue-800 font-medium">
            Loading deal activities...
          </p>
        )}
      </div>
    )}
    
    {error && (
      <div className="text-red-500 mb-4 p-3 bg-red-50 rounded-md border border-red-100">
        {error}
        <button
          className="ml-3 text-red-700 underline"
          onClick={handleRefresh}
        >
          Retry
        </button>
      </div>
    )}
    
    {loading && selectedDeal ? (
      <div className="text-center py-10">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-3 text-lg font-medium">
          {loadingStage === 1 && (
                fetchingActivities ? (
                  <span className="text-blue-600">Counting activities for {selectedDeal?.name}...</span>
                ) : activitiesCount !== null ? (
                  `Loading ${activitiesCount} activities for ${selectedDeal?.name}...`
                ) : (
                  <span>Loading deal timeline for <b>{selectedDeal?.name}</b>...</span>
                )
              )}
              {loadingStage === 2 && (
                <span className="text-orange-500">
                  Loading deal timeline for <b>{selectedDeal?.name}</b>...
                </span>
              )}
              {loadingStage === 3 && (
                <span className="text-red-500">
                  Loading deal timeline for <b>{selectedDeal?.name}</b>...
                </span>
              )}
        </p>

        <div className="mt-2 text-gray-600 font-mono">
        {formatElapsedTime(elapsedTime)}
        </div>
      </div>
    ) : loadingError ? (
      <div className="text-center py-10">
        <div className="text-red-500 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="mb-4">Encountered an error while loading. Try again?</p>
        <button 
          onClick={() => selectedDeal && handleGetTimeline(selectedDeal)} 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
      </div>
    ) : timelineData ? (
      <div className="bg-white p-4 rounded-lg shadow">
        {dealInfo && (
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <div className="flex flex-wrap gap-x-8">
              <p className="text-gray-700">
                <span className="font-semibold">Deal Owner:</span> <span className="text-red-600"><b>{dealInfo.dealOwner}</b></span>
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">Stage:</span> <span className="text-red-600"><b>{dealInfo.dealStage}</b></span>
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">Started:</span> {formatDate(dealInfo.startDate)}
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">Last Touch Point:</span> {formatDate(dealInfo.endDate)}
                <span className="text-gray-700 text-sm ml-1">
                  <b>(been {calculateDaysPassed(dealInfo.endDate)} days)</b>
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Sentiment and Intent Summary Boxes */}
        {timelineData && timelineData.events && (
          <div className="mb-6 grid grid-cols-3 gap-4">
            {/* Positive Sentiment Incoming Emails */}
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h4 className="text-sm font-medium text-gray-600">Positive Incoming Emails</h4>
                  <button 
                    onClick={() => handleMetricClick('positive-incoming')}
                    className="text-2xl font-bold text-green-600 hover:text-green-800 transition-colors cursor-pointer"
                  >
                    {timelineData.events.filter(e => e.type === 'Incoming Email' && e.sentiment === 'positive').length}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Likely/Very Likely to Buy */}
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h4 className="text-sm font-medium text-gray-600">Likely/Very Likely to Buy</h4>
                  <button 
                    onClick={() => handleMetricClick('likely-buy')}
                    className="text-2xl font-bold text-green-600 hover:text-green-800 transition-colors cursor-pointer"
                  >
                    {timelineData.events.filter(e => 
                      e.type === 'Meeting' && 
                      (e.buyer_intent === 'Likely to buy' || e.buyer_intent === 'Very likely to buy')
                    ).length}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Less Likely to Buy */}
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h4 className="text-sm font-medium text-gray-600">Less Likely to Buy</h4>
                  <button 
                    onClick={() => handleMetricClick('less-likely')}
                    className="text-2xl font-bold text-red-600 hover:text-red-800 transition-colors cursor-pointer"
                  >
                    {timelineData.events.filter(e => 
                      e.type === 'Meeting' && e.buyer_intent === 'Less likely to buy'
                    ).length}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
              <h3 className="text-xl font-semibold mb-2">Deal Timeline: {selectedDeal?.name}</h3>
          {chartData.length > 0 ? (
            <div className="h-[500px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                      margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
                  barSize={20}
                  maxBarSize={20}
                  ref={chartRef}
                  onClick={handleBarClick}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                      
                      {/* Add custom background for "Less likely to buy" meetings */}
                      {chartData.map((entry, index) => {
                        if (entry.hasLessLikelyToBuy) {
                          return (
                            <ReferenceArea
                              key={`bg-red-${index}`}
                              x1={entry.date}
                              x2={entry.date}
                              y1={0}
                              y2={500}
                              fill="#fee2e2"
                              fillOpacity={0.3}
                              stroke="none"
                            />
                          );
                        }
                        return null;
                      })}
                      
                      {/* Add custom background for "Very likely to buy" meetings */}
                      {chartData.map((entry, index) => {
                        if (entry.hasVeryLikelyToBuy) {
                          return (
                            <ReferenceArea
                              key={`bg-green-${index}`}
                              x1={entry.date}
                              x2={entry.date}
                              y1={0}
                              y2={500}
                              fill="#dcfce7"
                              fillOpacity={0.3}
                              stroke="none"
                            />
                          );
                        }
                        return null;
                      })}
                      
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatXAxisDate}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tickMargin={15}
                    domain={[
                      'dataMin',
                      () => {
                        // Get the date of the last data point
                        if (chartData.length === 0) return new Date();
                        
                        const lastDate = new Date(chartData[chartData.length - 1].date);
                        // Add 5 days to the last date
                        lastDate.setDate(lastDate.getDate() + 5);
                        return lastDate;
                      }
                    ]}
                    interval={Math.max(0, Math.ceil(Math.max(1, (endIndex - startIndex) / 10)))}
                  />

                  <YAxis allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(0,0,0,0.1)'}} />
                  <Legend />
                  
                      <Bar 
                        dataKey="Meeting" 
                        stackId="a" 
                        fill="#f87171"
                        name="Meeting" 
                        shape={(props: any) => {
                          const { x, y, width, height, payload } = props;
                          return (
                            <rect
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              fill={payload?.hasLessLikelyToBuy ? "#6e0200" : "#f87171"}
                            />
                          );
                        }}
                      />
                      <Bar 
                        dataKey="Outgoing Email" 
                        stackId="a" 
                        fill="#93c5fd"
                        name="Outgoing Email" 
                      />
                      <Bar 
                        dataKey="Incoming Email" 
                        stackId="a" 
                        fill="#86efac"
                        name="Incoming Email" 
                      />
                      <Bar 
                        dataKey="Note" 
                        stackId="a" 
                        fill="#99f6e4" 
                        name="Note" 
                      />

                  {chartData.length > 1 ? (
                    <Brush 
                      dataKey="date"
                      height={30}
                      stroke="#8884d8"
                      tickFormatter={formatXAxisDate}
                      startIndex={Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : 0}
                      endIndex={Number.isInteger(endIndex) && endIndex >= 0 && endIndex < chartData.length 
                        ? endIndex 
                        : (chartData.length > 0 ? chartData.length - 1 : 0)}
                      onChange={handleBrushChange}
                    />
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-600">
              No timeline events found for this deal.
            </div>
          )}
        </div>

            {/* Add DealLogs component */}
            {timelineData.events && timelineData.events.length > 0 && (
              <div className="mt-4">
                <DealLogs events={timelineData.events} />
              </div>
            )}
      </div>
    ) : selectedDeal ? (
      <div className="text-center py-10 text-gray-600">
        <p className="mb-4">No timeline data loaded yet.</p>
        <button 
          onClick={() => handleGetTimeline(selectedDeal)} 
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          disabled={loading}
        >
          Load Timeline
        </button>
      </div>
    ) : null}

    {/* Event Detail Drawer */}
    <EventDrawer />
      </div>
    </div>
  </div>
);
};

export default DealTimeline;

