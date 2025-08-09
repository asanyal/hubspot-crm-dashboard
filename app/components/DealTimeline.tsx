'use client';

import { useAppState } from '../context/AppContext';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Select from 'react-select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Brush, ReferenceArea
} from 'recharts';
import { Deal } from '../context/AppContext';
import { API_CONFIG } from '../utils/config';

interface Contact {
  champion: boolean;
  explanation: string;
  email: string;
  business_pain?: string;
  speakerName?: string;
  parr_analysis?: {
    pain: number;
    authority: number;
    preference: number;
    role: number;
    parr_explanation: string;
  };
  name?: string; // Add name field
  title?: string; // Add title field
}

interface ContactsData {
  contacts: Contact[];
  total_contacts: number;
  champions_count: number;
  total_attendees?: number; // Add total_attendees field
}

interface Event {
  // V1 format fields
  id?: string;
  date_str?: string;
  time_str?: string;
  type?: string;
  subject?: string;
  content?: string;
  content_preview?: string;
  sentiment?: string;
  buyer_intent?: string;
  buyer_intent_explanation?: string;
  business_pain?: string;
  
  // V2 format fields
  event_id?: string;
  event_type?: string;
  event_date?: string;
  engagement_id?: string;
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

// Add new interface for concerns
interface Concerns {
  pricing_concerns: {
    has_concerns: boolean;
    explanation: string;
  } | string;
  no_decision_maker: {
    is_issue: boolean;
    explanation: string;
  } | string;
  already_has_vendor: {
    has_vendor: boolean;
    explanation: string;
  } | string;
}

// New interface for the array format
interface ConcernsItem {
  pricing_concerns: {
    has_concerns: boolean;
    explanation: string;
  } | string;
  no_decision_maker: {
    is_issue: boolean;
    explanation: string;
  } | string;
  already_has_vendor: {
    has_vendor: boolean;
    explanation: string;
  } | string;
}

interface Stakeholder {
  name: string;
  email: string;
  title: string;
  potential_decision_maker: boolean;
}

interface StakeholdersData {
  stakeholders: Stakeholder[];
}

// Helper functions to process concerns array
const processConcernsArray = (concernsArray: ConcernsItem[]): {
  hasPricingConcerns: boolean;
  pricingConcernsExplanation: string;
  hasDecisionMaker: boolean;
  noDecisionMakerExplanation: string;
  hasCompetitor: boolean;
  competitorExplanation: string;
} => {
  if (!concernsArray || !Array.isArray(concernsArray) || concernsArray.length === 0) {
    return {
      hasPricingConcerns: false,
      pricingConcernsExplanation: '',
      hasDecisionMaker: false,
      noDecisionMakerExplanation: '',
      hasCompetitor: false,
      competitorExplanation: ''
    };
  }

  let hasPricingConcerns = false;
  let pricingConcernsExplanations: string[] = [];
  let hasDecisionMaker = false;
  let noDecisionMakerExplanations: string[] = [];
  let hasCompetitor = false;
  let competitorExplanations: string[] = [];

  concernsArray.forEach(item => {
    // Process pricing concerns
    if (typeof item.pricing_concerns === 'object') {
      if (item.pricing_concerns?.has_concerns) {
        hasPricingConcerns = true;
      }
      if (item.pricing_concerns?.explanation && typeof item.pricing_concerns.explanation === 'string') {
        pricingConcernsExplanations.push(item.pricing_concerns.explanation);
      }
    }

    // Process decision maker - if ANY decision maker value is true, mark as Yes
    if (typeof item.no_decision_maker === 'object') {
      if (item.no_decision_maker?.is_issue === false) {
        hasDecisionMaker = true;
      }
      if (item.no_decision_maker?.explanation && typeof item.no_decision_maker.explanation === 'string') {
        noDecisionMakerExplanations.push(item.no_decision_maker.explanation);
      }
    }

    // Process competitor
    if (typeof item.already_has_vendor === 'object') {
      if (item.already_has_vendor?.has_vendor) {
        hasCompetitor = true;
      }
      if (item.already_has_vendor?.explanation && typeof item.already_has_vendor.explanation === 'string') {
        competitorExplanations.push(item.already_has_vendor.explanation);
      }
    }
  });

  return {
    hasPricingConcerns,
    pricingConcernsExplanation: pricingConcernsExplanations.join(' '),
    hasDecisionMaker,
    noDecisionMakerExplanation: noDecisionMakerExplanations.join(' '),
    hasCompetitor,
    competitorExplanation: competitorExplanations.join(' ')
  };
};

interface ChartDataPoint {
  date: string;
  Meeting: number;
  'Outgoing Email': number;
  'Incoming Email': number;
  'Note': number;
  totalEvents: number;
  hasNegativeSentimentIncoming: boolean;
  hasNegativeSentimentOutgoing: boolean;
  hasLessLikelyToBuy: boolean;
  hasVeryLikelyToBuy: boolean;
  events: Event[];
  [key: string]: any; // Add index signature to allow string indexing
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
  const [selectedConcern, setSelectedConcern] = useState<string | null>(null);
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
  const concernsFetchedRef = useRef<Set<string>>(new Set());

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
  const [selectedStagesInitialized, setSelectedStagesInitialized] = useState<boolean>(false);

  // Add session management state
  const [browserId, setBrowserId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Add new state for dynamic loading message
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  // Add state for company overview
  const [companyOverview, setCompanyOverview] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  
  // Add new state for concerns
  const [concerns, setConcerns] = useState<ConcernsItem[]>([]);
  const [loadingConcerns, setLoadingConcerns] = useState<boolean>(false);

  // Add this near the top of the component with other state declarations
  const [bookmarkedDeals, setBookmarkedDeals] = useState<Set<string>>(new Set());

  // Add state for active tab and selected owners
  const [activeFilterTab, setActiveFilterTab] = useState<'stages' | 'owners' | 'bookmarks'>('stages');
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());

  // Add state for activities filter
  const [showOnlyActiveDeals, setShowOnlyActiveDeals] = useState<boolean>(false);

  // Add this with other state declarations at the top of DealTimeline component
  const [activeEventFilters, setActiveEventFilters] = useState<Record<string, boolean>>({
    'Meeting': true,
    'Incoming Email': true,
    'Outgoing Email': true,
    'Note': true
  });

  // Add state for stakeholders
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [loadingStakeholders, setLoadingStakeholders] = useState<boolean>(false);
  const [stakeholdersCache, setStakeholdersCache] = useState<Record<string, { data: Stakeholder[]; timestamp: number }>>({});

  // Add this with other state declarations at the top
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Initialize browser ID on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('browserId');
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('browserId', id);
      }
      setBrowserId(id);
      setIsInitialized(true);
    }
  }, []);

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedBookmarks = localStorage.getItem('bookmarkedDeals');
      if (savedBookmarks) {
        try {
          const bookmarksArray = JSON.parse(savedBookmarks);
          setBookmarkedDeals(new Set(bookmarksArray));
        } catch (error) {
          console.error('Error loading bookmarks from localStorage:', error);
        }
      }
    }
  }, []);

  // Load meeting contacts from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('meetingContacts');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setMeetingContacts(parsed);
        } catch (error) {
          console.error('Error loading meeting contacts from localStorage:', error);
        }
      }
    }
  }, []);

  // Save bookmarks to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bookmarkedDeals', JSON.stringify(Array.from(bookmarkedDeals)));
    }
  }, [bookmarkedDeals]);

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

  // Initialize selectedStages with all stages only on first mount
  useEffect(() => {
    // Initialize only once when component first mounts and uniqueStages are loaded
    if (uniqueStages.length > 0 && !selectedStagesInitialized) {
      setSelectedStages(new Set(uniqueStages));
      setSelectedStagesInitialized(true);
    }
  }, [uniqueStages, selectedStagesInitialized]);

  // Filter deals based on selected stages and search term
  const filteredDeals = useMemo(() => {
    let filtered = allDeals;

    // Apply bookmark filter when bookmarks tab is active
    if (activeFilterTab === 'bookmarks') {
      filtered = filtered.filter(deal => bookmarkedDeals.has(deal.id));
    } else {
      // Apply stage filter
      if (selectedStages.size > 0) {
        filtered = filtered.filter(deal => {
          if (!deal.stage) return false;
          return selectedStages.has(deal.stage);
        });
      }

      // Apply owner filter
      if (selectedOwners && selectedOwners.size > 0) {
        filtered = filtered.filter(deal => {
          if (!deal.owner) return false;
          return selectedOwners.has(deal.owner);
        });
      }
    }

    // Apply activities filter (only show deals with activities > 0)
    if (showOnlyActiveDeals) {
      filtered = filtered.filter(deal => {
        return deal.activities && deal.activities > 0;
      });
    }

    // Apply search filter
    if (debouncedDealSearchTerm.trim()) {
      const searchLower = debouncedDealSearchTerm.toLowerCase();
      const searchTerms = searchLower.split(' ').filter(term => term.length > 0);
      if (searchTerms.length > 0) {
        filtered = filtered.filter(deal => {
          const dealNameLower = String(deal.name || '').toLowerCase();
          const dealStageLower = String(deal.stage || '').toLowerCase();
          const dealOwnerLower = String(deal.owner || '').toLowerCase();
          return searchTerms.every(term => 
            dealNameLower.includes(term) ||
            dealStageLower.includes(term) ||
            dealOwnerLower.includes(term)
          );
        });
      }
    }
    return filtered;
  }, [allDeals, selectedStages, selectedOwners, debouncedDealSearchTerm, activeFilterTab, bookmarkedDeals, showOnlyActiveDeals]);

  // Add debounce effect for search with increased delay
  useEffect(() => {
    // Skip debounce for empty input
    if (dealSearchTerm === '') {
      setDebouncedDealSearchTerm('');
      return;
    }
    
    // Determine delay - longer for first few characters
    const delay = dealSearchTerm.length <= 5 ? 800 : 300;
    
    const timerId = setTimeout(() => {
      setDebouncedDealSearchTerm(dealSearchTerm);
    }, delay);
    
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
    setConcerns([]); // Clear concerns state when changing deals
    // Deliberately NOT resetting selectedStages and selectedStagesInitialized
    // to preserve stage filter selections when changing deals
  }, []);

  // Utility to check if a date is valid
  const isValidDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  };

  // Update refs when values change - this prevents infinite loops
  useEffect(() => {
    selectedDealRef.current = selectedDeal;
  }, [selectedDeal, selectedStages]);

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

  // Utility function for making API calls with session management
  const makeApiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!isInitialized) {
      return null;
    }

    if (!browserId) {
      console.error('Browser ID not initialized yet');
      throw new Error('Browser ID not initialized');
    }

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
            headers,
            localStorage: {
              browserId: localStorage.getItem('browserId'),
              sessionId: localStorage.getItem('sessionId')
            }
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
        let errorText;
        try {
          const errorData = await response.json();
          errorText = errorData.error || JSON.stringify(errorData);
        } catch (e) {
          errorText = await response.text();
        }
        
        console.error('Server error details:', {
          url,
          status: response.status,
          error: errorText,
          headers: Object.fromEntries(response.headers.entries()),
          requestHeaders: headers
        });
        
        throw new Error(`Server error: ${errorText || 'Unknown server error'}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed: ${response.status} - ${errorText}`);
      }

      return response;
    } catch (error) {
      console.error('API call error:', {
        url,
        error,
        browserId,
        sessionId,
        headers
      });
      throw error;
    }
  }, [browserId, isInitialized]);

  // Function to fetch company overview
  const fetchCompanyOverview = useCallback(async (dealName: string) => {
    try {
      setLoadingOverview(true);
      const apiPath = API_CONFIG.getApiPath('/company-overview');
      const response = await makeApiCall(`${apiPath}?dealName=${encodeURIComponent(dealName)}`);
      
      if (response) {
        const data = await response.json();
        setCompanyOverview(data.overview);
      }
    } catch (error) {
      console.error('Error fetching company overview:', error);
      setCompanyOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  }, [makeApiCall]);

  // Function to fetch stakeholders
  const fetchStakeholders = useCallback(async (dealName: string) => {
    try {
      setLoadingStakeholders(true);
      
      // Check if we have cached data for this deal
      const cacheKey = `stakeholders_${dealName}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          const now = Date.now();
          const cacheAge = now - parsed.timestamp;
          const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
          
          // Use cached data if it's less than 30 minutes old
          if (cacheAge < CACHE_DURATION) {
            setStakeholders(parsed.data);
            setLoadingStakeholders(false);
            return;
          }
        } catch (e) {
          console.error('Error parsing cached stakeholders data:', e);
        }
      }
      
      // Fetch fresh data from API
      const apiPath = API_CONFIG.getApiPath('/get-stakeholders');
      const response = await makeApiCall(`${apiPath}?deal_name=${encodeURIComponent(dealName)}`);
      
      if (response) {
        const data: StakeholdersData = await response.json();
        const stakeholdersData = data.stakeholders || [];
        setStakeholders(stakeholdersData);
        
        // Cache the data
        const cacheData = {
          data: stakeholdersData,
          timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      }
    } catch (error) {
      console.error('Error fetching stakeholders:', error);
      setStakeholders([]);
    } finally {
      setLoadingStakeholders(false);
    }
  }, [makeApiCall]);

  // Update fetchDealInfo to use API_CONFIG
  const fetchDealInfo = useCallback(async (dealName: string) => {
    try {
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/deal-info')}?dealName=${encodeURIComponent(dealName)}`);
      
      if (response) {
        const info = await response.json();
        setDealInfo(info);
        setAllDealsInfo(prev => ({
          ...prev,
          [dealName]: info
        }));
      }
    } catch (error) {
      console.error('Error fetching deal info:', error);
    }
  }, [makeApiCall]);

  // Update fetchActivitiesCount to use API_CONFIG
  const fetchActivitiesCount = useCallback(async (dealName: string) => {
    setFetchingActivities(true);
    try {
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/deal-activities-count')}?dealName=${encodeURIComponent(dealName)}`);
      
      if (response) {
        const data = await response.json();
        setActivitiesCount(data.count);
        return data.count;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching activities count for deal "${dealName}":`, error);
      setActivitiesCount(null);
      updateState('dealTimeline.error', `Failed to fetch activities count for ${dealName}. Please try again.`);
      return null;
    } finally {
      setFetchingActivities(false);
    }
  }, [makeApiCall, updateState]);

  // Function to load timeline directly from URL params - define after handleGetTimeline
  const loadTimelineDirectly = useCallback(async (dealName: string) => {
    if (isUnmounting) return;
    
    // Ensure browser ID is initialized before making API calls
    if (!browserId || !isInitialized) {
      console.warn('[Timeline] Browser ID not initialized, waiting...');
      setLoadingMessage(`Initializing browser session for ${dealName}...`);
      
      // Wait a bit and try again
      setTimeout(() => {
        if (!isUnmounting && browserId && isInitialized) {
          loadTimelineDirectly(dealName);
        } else {
          setLoadingMessage(`Failed to initialize browser session for ${dealName}. Please refresh the page.`);
          updateState('dealTimeline.error', 'Failed to initialize browser session. Please refresh the page.');
          updateState('dealTimeline.loading', false);
        }
      }, 1000);
      return;
    }
    
    // Check if we already have cached data for this deal
    if (selectedDealRef.current?.name === dealName && timelineDataRef.current && lastFetched) {
      const currentTime = Date.now();
      if (currentTime - lastFetched < DATA_EXPIRY_TIME) {
        // If data is fresh and for the same deal, just use the cached data
        setLoadingMessage(`Using cached data for ${dealName}...`);
        if (!dealInfoRef.current) {
          fetchDealInfo(dealName);
        }
        return;
      }
    }

    // Clean up state before loading new data (similar to refresh button)
    cleanupState();
    setMeetingContacts({});
    
    // Clear localStorage meetingContacts
    if (typeof window !== 'undefined') {
      localStorage.removeItem('meetingContacts');
    }
    
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

    // Otherwise, fetch new data
    updateState('dealTimeline.loading', true);
    updateState('dealTimeline.error', null);
    setLoadingStartTime(Date.now());
    setLoadingStage(1);
    setLoadingError(false);
    setLoadingMessage(`Initializing timeline data for ${dealName} from URL...`);
    
    try {
      // Fetch all data in parallel for faster loading
      setLoadingMessage(`Loading all data for ${dealName}...`);
      
      // Run all API calls in parallel
      const startTime = Date.now();
      
      const [count, dealInfoResult, timelineResponse] = await Promise.all([
        fetchActivitiesCount(dealName).then(result => {
          return result;
        }),
        fetchDealInfo(dealName).then(result => {
          return result;
        }),
        (async () => {
          const result = await makeApiCall(`${API_CONFIG.getApiPath('/deal-timeline')}?dealName=${encodeURIComponent(dealName)}`);
          return result;
        })()
      ]);
      
      if (timelineResponse) {
        setLoadingMessage(`Processing timeline data for ${dealName}...`);
        const data = await timelineResponse.json();
        
        // Verify the deal name matches before updating state
        if (selectedDealRef.current?.name === dealName) {
          updateState('dealTimeline.activities', data);
          updateState('dealTimeline.lastFetched', Date.now());
          setLoadingMessage(`Timeline data loaded successfully for ${dealName}!`);
          
          // After timeline loads, explicitly fetch concerns (similar to refresh button)
          setLoadingMessage(`Timeline data loaded for ${dealName}, loading concerns...`);
          // Note: fetchConcerns will be called by the useEffect that watches timelineData
        } else {
          console.warn(`Deal name mismatch: URL deal=${dealName}, current deal=${selectedDealRef.current?.name}`);
          setLoadingMessage(`Error: Deal name mismatch. Please refresh the page.`);
        }
      } else {
        console.warn('[Timeline] No response received from timeline API');
        setLoadingMessage(`No response received for ${dealName}. Please try again.`);
      }
    } catch (error) {
      console.error('[Timeline] Error fetching timeline:', error);
      setLoadingError(true);
      
      // Provide more specific error messages based on the error type
      let errorMessage = 'Failed to load timeline data. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('Browser ID not initialized')) {
          errorMessage = 'Browser session not initialized. Please refresh the page.';
        } else if (error.message.includes('Server error')) {
          errorMessage = 'Server error occurred. Please try again in a moment.';
        } else if (error.message.includes('Request timed out')) {
          errorMessage = 'Request timed out. Please try again.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
      }
      
      setLoadingMessage(`Error loading timeline data for ${dealName}: ${errorMessage}`);
      updateState('dealTimeline.error', errorMessage);
    } finally {
      updateState('dealTimeline.loading', false);
      setLoadingStartTime(null);
    }
  }, [
    DATA_EXPIRY_TIME,
    updateState,
    fetchDealInfo,
    fetchActivitiesCount,
    isUnmounting,
    makeApiCall,
    cleanupState,
    browserId,
    isInitialized
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
      setSelectedConcern(null);
      setIsDrawerOpen(true);
    }
  };

  // Handle concern click to open drawer
  const handleConcernClick = (concernType: string) => {
    setSelectedConcern(concernType);
    setSelectedDate(null);
    setIsDrawerOpen(true);
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
      }, 1800000);
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
      // store the deal name in local storage
      localStorage.setItem('dealName', decodedDealName);
      
      // Always process URL parameters for navigation, regardless of current state
      // First, try to find the deal in allDeals
      const matchingDeal = allDeals.find(d => d.name === decodedDealName);
      
      if (matchingDeal) {
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
        loadTimelineDirectly(decodedDealName);
      }
    }
    
    setIsUrlProcessed(true);
  }, [hasMounted, isUrlProcessed, allDeals, updateState, loadTimelineDirectly]);

// Fetch all deals after component mounts and when needed
  useEffect(() => {
    if (!hasMounted || !isInitialized) return;
    
    // Track if component is mounted (for async operations)
    let isMounted = true;
    
    // Only fetch if we don't have any deals or if this is the initial load
    if (allDeals.length === 0 || isInitialLoad) {
      const fetchAllDeals = async () => {
        try {
          if (isMounted) {
            setDealsLoading(true);
          }
          
          const response = await makeApiCall(`${API_CONFIG.getApiPath('/all-deals')}`);
          
          if (!response) {
            throw new Error('No response from server');
          }

          if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          // Validate that data is an array
          if (!Array.isArray(data)) {
            console.error('Invalid response format: expected an array of deals');
            throw new Error('Invalid response format from server');
          }
          
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
  }, [hasMounted, isInitialLoad, makeApiCall, updateState, selectedDeal, isInitialized]);

  useEffect(() => {
    if (timelineData && timelineData.events && timelineData.events.length > 0) {
      
      try {
        // Find the earliest and latest dates from the events
        const eventDates = timelineData.events
          .map(event => event.date_str)
          .filter(date => date && isValidDate(date));

        if (eventDates.length === 0) {
          console.error('No valid dates found in events');
          setChartData([]);
          return;
        }

        // Sort dates as strings to avoid timezone issues
        const sortedDates = eventDates.sort();
        const startDate = sortedDates[0];
        const endDate = sortedDates[sortedDates.length - 1];
        
        // Create an array of all dates in the range
        const dates = [];
        let currentDate = new Date(startDate);
        const lastDate = new Date(endDate);
        
        // Add one day to end date to include the last day
        lastDate.setDate(lastDate.getDate() + 1);
        
        // Ensure we include the end date with <=
        while (currentDate <= lastDate) {
          // Format date as YYYY-MM-DD to avoid timezone issues
          const dateStr = currentDate.toISOString().split('T')[0];
          dates.push(dateStr);
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Create a map of events by date
        const eventsByDate: Record<string, ChartDataPoint> = {};
        
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
            hasVeryLikelyToBuy: false,
            events: [] as Event[]
          };
        });
        
        // Count events by type for each date
        timelineData.events.forEach((event: Event) => {
          // Skip events with invalid dates or dates outside our range
          if (!event.date_str || !eventsByDate[event.date_str]) {
            console.warn('Skipping event with invalid date:', event.date_str);
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
          
          // Store the full event data
          eventsByDate[event.date_str].events.push(event);
          
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
      
      // Get the events for this date from the payload
      const eventsForDate = payload[0].payload.events || [];

      // Count events by type and track meeting intents and email sentiments
      const eventTypeCount: Record<string, number> = {};
      const meetingIntents: string[] = [];
      const incomingEmailSentiments: string[] = [];
      const outgoingEmailSentiments: string[] = [];
      
      eventsForDate.forEach((event: Event) => {
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
        } else if (intent === 'Neutral') {
          return 'text-[#F5F5DC] font-medium';
        }
        return 'text-gray-600';
      };

      // Function to get sentiment color
      const getSentimentColor = (sentiment: string) => {
        if (sentiment === 'positive') {
          return 'text-green-700 font-medium';
        } else if (sentiment === 'negative') {
          return 'text-red-600 font-medium';
        } else if (sentiment === 'neutral') {
          return 'text-yellow-600 font-medium';
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
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  const toggleSection = (index: number) => {
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  if ((!selectedDate && !selectedConcern) || !timelineData) return null;
  
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
          console.error('Fetch operation canceled or failed:', fetchError);
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
        <div>
          <h3 className="text-xl font-bold">
            {selectedDeal?.name || 'Events'}
          </h3>
          {selectedDate && (
            <p className="text-sm text-gray-500 mt-1">
              {formatDateDetailed(selectedDate)}
            </p>
          )}
          {selectedConcern && (
            <p className="text-sm text-gray-500 mt-1">
              {selectedConcern === 'pricing_concerns' ? 'Pricing Concerns' :
               selectedConcern === 'no_decision_maker' ? 'Decision Maker' :
               selectedConcern === 'already_has_vendor' ? 'Using a Competitor' : 'Unknown Concern'}
            </p>
          )}
        </div>
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
        {selectedConcern ? (
          <div>
            {(() => {
              const processedConcerns = processConcernsArray(concerns);
              let concernTitle = '';
              let concernExplanation = '';
              let concernStatus = '';
              let concernColor = '';
              
              switch (selectedConcern) {
                case 'pricing_concerns':
                  concernTitle = 'Pricing Concerns';
                  concernExplanation = processedConcerns.pricingConcernsExplanation;
                  concernStatus = processedConcerns.hasPricingConcerns ? 'Yes' : 'No';
                  concernColor = processedConcerns.hasPricingConcerns ? 'text-red-600' : 'text-green-600';
                  break;
                case 'no_decision_maker':
                  concernTitle = 'Decision Maker';
                  concernExplanation = processedConcerns.noDecisionMakerExplanation;
                  concernStatus = processedConcerns.hasDecisionMaker ? 'Yes' : 'No';
                  concernColor = processedConcerns.hasDecisionMaker ? 'text-green-600' : 'text-red-600';
                  break;
                case 'already_has_vendor':
                  concernTitle = 'Competitor Mentions';
                  concernExplanation = processedConcerns.competitorExplanation;
                  concernStatus = processedConcerns.hasCompetitor ? 'Yes' : 'No';
                  concernColor = processedConcerns.hasCompetitor ? 'text-red-600' : 'text-green-600';
                  break;
                default:
                  concernTitle = 'Unknown';
                  concernExplanation = 'No explanation available';
                  concernStatus = 'N/A';
                  concernColor = 'text-gray-600';
              }
              
              return (
                <div>
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{concernTitle}</h2>
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-bold ${concernColor}`}>
                        {concernStatus}
                      </span>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-4 relative">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">Analysis</h3>
                      {concernExplanation && (
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(concernExplanation);
                              setCopyFeedback(true);
                              setTimeout(() => setCopyFeedback(false), 2000);
                            } catch (err) {
                              console.error('Failed to copy text: ', err);
                            }
                          }}
                          className={`p-2 rounded-lg transition-colors ${
                            copyFeedback 
                              ? 'text-green-600 bg-green-100' 
                              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          }`}
                          title={copyFeedback ? "Copied!" : "Copy analysis to clipboard"}
                        >
                          {copyFeedback ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                    {concernExplanation ? (
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {concernExplanation}
                      </p>
                    ) : (
                      <p className="text-gray-500 italic">No detailed analysis available.</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : eventsForDate.length > 0 ? (
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
                                : event.sentiment === 'neutral'
                                ? 'bg-yellow-100 text-yellow-800'
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
                                : event.buyer_intent === 'Neutral'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                        }`}>
                          {event.buyer_intent === 'Likely to buy' ? 'Positive Signal' : event.buyer_intent}
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
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <h4 className="font-semibold text-blue-900">Meeting Insights</h4>
                        </div>
                        <div className="space-y-6">
                          {(() => {
                            const explanation = event.buyer_intent_explanation;

                            const isStructuredObject =
                              typeof explanation === 'object' &&
                              explanation !== null &&
                              !Array.isArray(explanation);

                            const sections = isStructuredObject
                              ? explanation
                              : {
                                  Explanation: [
                                    typeof explanation === 'string' ? explanation : 'N/A',
                                  ],
                                };

                            return Object.entries(sections).map(([title, rawBulletPoints]) => {
                              // Normalize bullet points into an array of strings
                              const bulletPoints = Array.isArray(rawBulletPoints)
                                ? rawBulletPoints
                                : typeof rawBulletPoints === 'object' && rawBulletPoints !== null
                                  ? Object.values(rawBulletPoints)
                                  : [String(rawBulletPoints)];

                              return (
                                <div key={title} className="space-y-2">
                                  <h5 className="font-bold text-blue-900">{title}</h5>
                                  <ul className="list-disc pl-5 space-y-1">
                                    {bulletPoints.map((point, index) => (
                                      <li key={index} className="text-sm text-blue-800 leading-relaxed">
                                        {String(point)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Champion Information for Meetings */}
                    {event.type === 'Meeting' && event.subject && event.date_str && (
                      <div className="mt-4">
                        <h4 className="font-semibold mb-2">Attendees</h4>
                        {meetingContacts[`${event.subject}_${event.date_str}`]?.contacts?.length > 0 ? (
                          meetingContacts[`${event.subject}_${event.date_str}`].contacts.map((contact, idx) => (
                            <div key={idx} className="p-2 bg-white rounded border border-gray-100">
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">
                                  {contact.name !== 'Unknown name' ? contact.name : (contact.email || 'No email available')}
                                </span>
                                <span className="text-xs text-gray-600">
                                  {contact.title !== 'Unknown title' ? contact.title : 'No title available'}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500 italic">No attendees in this call</p>
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
const isFutureDate = (dateStr: string | undefined): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

// New DealLogs component
const DealLogs: React.FC<{ 
  events: Event[];
  activeFilters: Record<string, boolean>;
  onFilterChange: (filters: Record<string, boolean>) => void;
  selectedEventId: string | null;
  onRowClick: (date: string | null, eventId: string | null) => void;
}> = ({ events, activeFilters, onFilterChange, selectedEventId, onRowClick }) => {
  // Sort events by date and time in reverse chronological order
  const sortedEvents = [...events].sort((a, b) => {
    // Handle V2 format (event_date)
    if (a.event_date && b.event_date) {
      return b.event_date.localeCompare(a.event_date);
    }
    
    // Handle V1 format (date_str + time_str)
    if (a.date_str && b.date_str) {
      const dateCompare = b.date_str.localeCompare(a.date_str);
      if (dateCompare !== 0) return dateCompare;
      return (b.time_str || '').localeCompare(a.time_str || '');
    }
    
    // Fallback to comparing IDs if dates are not available
    return (b.id || b.event_id || '').localeCompare(a.id || a.event_id || '');
  });

  // Filter events based on active filters
  const filteredEvents = sortedEvents.filter(event => {
    const eventType = event.type || event.event_type;
    return eventType ? activeFilters[eventType] || false : false;
  });

  // Function to toggle a filter
  const toggleFilter = (eventType: string) => {
    onFilterChange(
      Object.values(activeFilters).filter(Boolean).length === 1 && activeFilters[eventType]
        ? Object.keys(activeFilters).reduce((acc, key) => {
            acc[key] = true;
            return acc;
          }, {} as Record<string, boolean>)
        : Object.keys(activeFilters).reduce((acc, key) => {
            acc[key] = key === eventType;
            return acc;
          }, {} as Record<string, boolean>)
    );
  };

  // Function to handle row click
  const handleRowClick = (event: Event, index: number) => {
    // Set the selected date to open the drawer
    const dateToUse = event.date_str || event.event_date?.split('T')[0] || null;
    const eventId = event.id || event.event_id || null;
    
    // Call the parent's handler
    onRowClick(dateToUse, eventId);
    
    // After a short delay to allow the drawer to open, scroll to the event
    setTimeout(() => {
      const element = document.getElementById(`event-section-${index}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Function to get event type color
  const getEventTypeColor = (type: string | undefined) => {
    if (!type) return 'text-gray-600';
    
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
  const getEventTypeBackgroundColor = (type: string | undefined) => {
    if (!type) return 'bg-gray-100';
    
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
    const type = event.type || event.event_type;
    const buyerIntent = event.buyer_intent;
    const sentiment = event.sentiment;
    
    if (type === 'Meeting' && buyerIntent) {
      if (buyerIntent === 'Very likely to buy') {
        return 'text-[#4bdb2e] font-bold';
      } else if (buyerIntent === 'Likely to buy') {
        return 'text-green-700 font-medium';
      } else if (buyerIntent === 'Less likely to buy') {
        return 'text-red-600 font-medium';
      } else if (buyerIntent === 'Neutral') {
        return 'text-yellow-600 font-medium';
      }
    } else if (sentiment) {
      if (sentiment === 'positive') {
        return 'text-green-700 font-medium';
      } else if (sentiment === 'negative') {
        return 'text-red-600 font-medium';
      } else if (sentiment === 'neutral') {
        return 'text-yellow-600 font-medium';
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
            filteredEvents.map((event, index) => {
              const eventDate = event.date_str || event.event_date?.split('T')[0];
              const eventType = event.type || event.event_type;
              const eventSubject = event.subject;
              const isSelected = selectedEventId === (event.id || event.event_id);
              
              return (
                <div 
                  key={index} 
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => handleRowClick(event, index)}
                  data-deal-log-row="true"
                >
                  <div className="grid grid-cols-12 gap-4">
                    {/* Date */}
                    <div className="col-span-2">
                      <span className={`text-gray-500 font-mono ${
                        eventDate && isFutureDate(eventDate) ? 'text-blue-600 font-medium' : ''
                      }`}>
                        {(() => {
                          if (!eventDate) return 'No date';
                          
                          const dateObj = new Date(eventDate);
                          
                          // Check if time is 15:00 or later and add a day if needed
                          const timeStr = event.time_str || event.event_date?.split('T')[1];
                          if (timeStr) {
                            const timeParts = timeStr.split(':');
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
                              {isFutureDate(eventDate) && (
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
                      <span className={`font-medium ${getEventTypeColor(eventType)}`}>
                        {eventType || 'Unknown'}
                      </span>
                    </div>

                    {/* Intent/Sentiment */}
                    <div className="col-span-2">
                      {(eventType === 'Meeting' && event.buyer_intent) ? (
                        <span className={getIntentSentimentColor(event)}>
                          {event.buyer_intent === 'Likely to buy' ? 'Positive Signal' : event.buyer_intent}
                        </span>
                      ) : event.sentiment ? (
                        <span className={getIntentSentimentColor(event)}>
                          {event.sentiment}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="col-span-6">
                      <span className="text-gray-900">
                        {eventSubject || 'No subject'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-gray-500 text-center">No events found</div>
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

// Save meeting contacts to localStorage whenever they change
useEffect(() => {
  if (typeof window !== 'undefined' && Object.keys(meetingContacts).length > 0) {
    localStorage.setItem('meetingContacts', JSON.stringify(meetingContacts));
  }
}, [meetingContacts]);

// Update fetchMeetingContacts to use API_CONFIG
const fetchMeetingContacts = useCallback(async (subject: string, date: string) => {
  if (!date) {
    return null;
  }

  // Skip future meetings
  const meetingDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (meetingDate > today) {
    return null;
  }
  
  // Use deal name if subject is missing
  const key = subject ? `${subject}_${date}` : `${selectedDealRef.current?.name}_${date}`;

  // Check localStorage
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('meetingContacts');
    if (saved) {
      try {
        const savedContacts = JSON.parse(saved);
        if (savedContacts[key]) {
          setLoadingMessage(`Loading stored contact data for "${subject || 'Meeting'}" on ${date}`);
          // Update state with saved data
          setMeetingContacts(prev => ({
            ...prev,
            [key]: savedContacts[key]
          }));
          return savedContacts[key];
        }
      } catch (e) {
        console.error('Error loading meeting contacts from localStorage:', e);
      }
    }
  }
  
  try {
    setLoadingMessage(`Analyzing transcripts for "${subject || 'Meeting'}" on ${date}...`);
    
    // Ensure we have a valid deal name
    if (!selectedDealRef.current?.name) {
      console.error('No selected deal name available for contacts fetch');
      return null;
    }

    const url = `${API_CONFIG.getApiPath('/contacts-and-champion')}?dealName=${encodeURIComponent(selectedDealRef.current.name)}&date=${encodeURIComponent(date)}`;
    
    const response = await makeApiCall(url);
    
    if (response) {
      setLoadingMessage(`Processing contact data for "${subject || 'Meeting'}" on ${date}...`);
      const data = await response.json();
      
      // Validate the response data
      if (!data || typeof data !== 'object') {
        console.error('Invalid response format for contacts:', data);
        setLoadingMessage(`Error: Invalid contact data for "${subject || 'Meeting'}" on ${date}`);
        return null;
      }
      
      // Validate required fields
      if (!Array.isArray(data.contacts)) {
        console.error('Missing or invalid contacts array in response:', data);
        setLoadingMessage(`Error: Missing contact data for "${subject || 'Meeting'}" on ${date}`);
        return null;
      }
      
      // Only update state if we're still working with the same deal
      if (selectedDealRef.current?.name) {
        setLoadingMessage(`Found ${data.total_contacts} contacts with ${data.champions_count} champions for "${subject || 'Meeting'}" on ${date}`);
        // Use functional update to avoid stale state
        setMeetingContacts(prev => {
          // Don't update if we already have this data
          if (prev[key]) return prev;
          return {
            ...prev,
            [key]: data
          };
        });
        return data;
      }
    }
    return null;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('409')) {
        setLoadingMessage('Request was cancelled, proceeding with next step...');
      } else {
        console.error('Error fetching meeting contacts:', {
          error: error.message,
          subject,
          date,
          dealName: selectedDealRef.current?.name,
          stack: error.stack
        });
        setLoadingMessage(`Error analyzing contacts for "${subject || 'Meeting'}" on ${date}: ${error.message}`);
      }
    }
    return null;
  }
}, [makeApiCall, meetingContacts, setLoadingMessage]);

  // Update handleGetTimeline to use API_CONFIG
  const handleGetTimeline = useCallback(async (deal: Deal | null = null, forceRefresh = false) => {
    const dealToUse = deal || selectedDealRef.current;
    if (!dealToUse) return;
    
    const currentTime = Date.now();
    const shouldRefresh = forceRefresh || 
      !lastFetched || 
      (currentTime - lastFetched >= DATA_EXPIRY_TIME) ||
      (selectedDealRef.current && dealToUse.name !== selectedDealRef.current.name);

    if (!shouldRefresh) {
      return;
    }
    
    // Clear meeting contacts before fetching new data
    setMeetingContacts({});
    // Clear chart data immediately when changing deals
    setChartData([]);
    
    // Set loading state
    updateState('dealTimeline.loading', true);
    updateState('dealTimeline.error', null);
    setLoadingStartTime(Date.now());
    setLoadingStage(1);
    setLoadingError(false);
    setLoadingMessage(`Initializing timeline data for ${dealToUse.name}...`);
    
    try {
      
      // Fetch activities count and deal info in parallel
      setLoadingMessage(`Fetching activities count and deal info for ${dealToUse.name}...`);
      // Fetch all data in parallel for faster loading
      setLoadingMessage(`Loading all data for ${dealToUse.name}...`);
      const [count, dealInfoResponse, response] = await Promise.all([
        fetchActivitiesCount(dealToUse.name),
        fetchDealInfo(dealToUse.name),
        makeApiCall(`${API_CONFIG.getApiPath('/deal-timeline')}?dealName=${encodeURIComponent(dealToUse.name)}`)
      ]);
      
      if (response) {
        setLoadingMessage(`Processing timeline data for ${dealToUse.name}...`);
        const data = await response.json();
        
        // Only update state if we're still working with the same deal
        if (selectedDealRef.current?.name === dealToUse.name) {
          // Clear chart data if there are no events or if events is not an array
          if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
            setChartData([]);
            updateState('dealTimeline.activities', { events: [], start_date: '', end_date: '' });
            updateState('dealTimeline.lastFetched', Date.now());
            return;
          }
          
          updateState('dealTimeline.activities', data);
          updateState('dealTimeline.lastFetched', Date.now());
          
          // Process meeting contacts sequentially
          const meetingEvents = data.events.filter((event: Event) => event.type === 'Meeting');
          if (meetingEvents.length > 0) {
            setLoadingChampions(true);
            setLoadingMessage(`Found ${meetingEvents.length} meetings. Fetching contact details...`);
            
            // Process meetings sequentially with a delay between each
            let completedCount = 0;
            for (const event of meetingEvents) {
              if (event.date_str && selectedDealRef.current?.name === dealToUse.name) {
                try {
                  // Add a small delay between requests to prevent overwhelming the server
                  await new Promise(resolve => setTimeout(resolve, 100));
                  completedCount++;
                  setLoadingMessage(`Fetching contacts for meeting ${completedCount}/${meetingEvents.length}: ${event.subject || 'Untitled Meeting'}...`);
                  await fetchMeetingContacts(event.subject || '', event.date_str);
                } catch (error) {
                  if (error instanceof Error && error.message.includes('409')) {
                  } else {
                    console.error('[Timeline] Error fetching meeting contacts:', error);
                    setLoadingMessage(`Error fetching contacts for meeting: ${event.subject || 'Untitled Meeting'}`);
                  }
                }
              }
            }
            setLoadingMessage(`Completing timeline data analysis for ${dealToUse.name}...`);
            setLoadingChampions(false);
          } else {
            setLoadingMessage(`No meetings found for ${dealToUse.name}. Finalizing timeline...`);
          }
        }
      }
    } catch (error) {
      console.error('[Timeline] Error fetching timeline:', error);
      setLoadingError(true);
      setLoadingMessage(`Error loading timeline data for ${dealToUse.name}`);
      updateState('dealTimeline.error', 'Failed to load timeline data. Please try again.');
      // Clear chart data on error
      setChartData([]);
    } finally {
      if (!loadingChampions) {
        updateState('dealTimeline.loading', false);
        setLoadingStartTime(null);
      }
    }
  }, [updateState, fetchDealInfo, fetchActivitiesCount, lastFetched, fetchMeetingContacts, loadingChampions, makeApiCall, DATA_EXPIRY_TIME]);

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

  
  // Clean up previous state
  cleanupState();
  setMeetingContacts({}); // Clear meeting contacts when changing deals
  
  // Clear concerns tracking when changing deals
  console.log('Clearing concerns tracking for new deal selection');
  concernsFetchedRef.current.clear();
  
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

// Add new function to fetch concerns
const fetchConcerns = useCallback(async (dealName: string) => {
  if (!dealName) return;
  
  console.log('Making API call to fetch concerns for:', dealName);
  setLoadingConcerns(true);
  try {
    const response = await makeApiCall(
      `${API_CONFIG.getApiPath('/get-concerns')}?dealName=${encodeURIComponent(dealName)}`
    );
    
    if (response) {
      const data = await response.json();
      // Handle empty responses properly - set to empty array if null/undefined/empty object
      if (Array.isArray(data)) {
        setConcerns(data);
      } else {
        setConcerns([]);
      }
    } else {
      // If no response, set to empty array
      setConcerns([]);
    }
  } catch (error) {
    console.error('Error fetching concerns:', error);
    setConcerns([]); // Set to empty array instead of null to prevent infinite loops
  } finally {
    setLoadingConcerns(false);
  }
}, [makeApiCall]);

// Update handleRefresh to refresh all data including champions
const handleRefresh = useCallback(() => {
  if (selectedDealRef.current) {
    setLoadingMessage(`Starting refresh for ${selectedDealRef.current.name}...`);
    
    // Reset all state
    cleanupState();
    setMeetingContacts({});
    
    // Clear concerns tracking for refresh
    console.log('Clearing concerns tracking for refresh');
    concernsFetchedRef.current.clear();
    setConcerns([]); // Clear concerns state
    
    // Clear localStorage meetingContacts
    if (typeof window !== 'undefined') {
      localStorage.removeItem('meetingContacts');
    }
    
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
      // After timeline loads, the useEffect will automatically fetch concerns
      setLoadingMessage(`Timeline data loaded for ${selectedDealRef.current?.name}, loading concerns...`);
    }).catch(error => {
      console.error('[Refresh] Error during refresh sequence:', error);
      setLoadingMessage(`Error refreshing data for ${selectedDealRef.current?.name}: ${error.message}`);
    });
  } else {
    setIsInitialLoad(true);
    setLoadingMessage('Initializing deal data...');
  }
}, [handleGetTimeline, cleanupState, updateState]);

  // Effect to automatically fetch concerns after timeline loads
  useEffect(() => {
    if (!timelineData?.events || !selectedDeal?.name || isUnmounting) {
      console.log('Skipping concerns fetch - conditions not met:', {
        hasEvents: !!timelineData?.events,
        dealName: selectedDeal?.name,
        isUnmounting
      });
      return;
    }
    
    // Only fetch concerns if we haven't already fetched them for this deal (prevents infinite loops)
    if (!concernsFetchedRef.current.has(selectedDeal.name)) {
      console.log('Fetching concerns for deal:', selectedDeal.name);
      concernsFetchedRef.current.add(selectedDeal.name);
      
      // Inline the fetch concerns call to avoid circular dependencies
      const fetchConcernsInline = async () => {
        if (!selectedDeal.name) return;
        
        console.log('Making API call to fetch concerns for:', selectedDeal.name);
        setLoadingConcerns(true);
        try {
          const response = await makeApiCall(
            `${API_CONFIG.getApiPath('/get-concerns')}?dealName=${encodeURIComponent(selectedDeal.name)}`
          );
          
          if (response) {
            const data = await response.json();
            // Handle empty responses properly - set to empty array if null/undefined/empty object
            if (Array.isArray(data)) {
              setConcerns(data);
            } else {
              setConcerns([]);
            }
          } else {
            // If no response, set to empty array
            setConcerns([]);
          }
        } catch (error) {
          console.error('Error fetching concerns:', error);
          setConcerns([]); // Set to empty array instead of null to prevent infinite loops
        } finally {
          setLoadingConcerns(false);
        }
      };
      
      fetchConcernsInline();
    } else {
      console.log('Concerns already fetched for deal:', selectedDeal.name);
    }
  }, [timelineData?.events, selectedDeal?.name, isUnmounting]);

  // Clean up concerns ref on unmount
  useEffect(() => {
    return () => {
      concernsFetchedRef.current.clear();
    };
  }, []);

// Update the effect that fetches champions to be more robust
// Effect to automatically fetch champions after timeline loads
useEffect(() => {
  if (!timelineData?.events || !selectedDeal?.name || isUnmounting) {
    return;
  }
  
  // Check if we need to fetch contacts for meetings
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const meetingEvents = timelineData.events.filter(event => {
    if (event.type !== 'Meeting') return false;
    const meetingDate = new Date(event.date_str);
    return meetingDate <= today;
  });
  
  if (meetingEvents.length === 0) {
    return;
  }
  
  setLoadingChampions(true);
  
  // Process meetings sequentially to avoid overwhelming the server
  const processMeetings = async () => {
    let completedRequests = 0;
    let failedRequests = 0;
    let cancelledRequests = 0;
    let skippedFutureMeetings = 0;
    
    for (const event of meetingEvents) {
      if (event.date_str && !isUnmounting) {
        try {
          
          // Skip if we already have the contacts for this meeting
          const url = new URL(window.location.href);
          const dealName = url.searchParams.get('dealName') || '';
          const meetingKey = event.subject ? `${event.subject}_${event.date_str}` : `${dealName}_${event.date_str}`;
          const contactsData = meetingContacts[meetingKey];
          
          
          if (contactsData && contactsData.contacts) {
            completedRequests++;
          } else {
            failedRequests++;
          }
          
          // Add a small delay between requests to prevent overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('409')) {
              cancelledRequests++;
            } else {
              failedRequests++;
              console.error('[Timeline] Error processing meeting:', {
                error: error.message,
                subject: event.subject,
                date: event.date_str
              });
            }
          }
        }
      }
    }
    
    
    
    if (!isUnmounting) {
      setLoadingChampions(false);
    }
  };
  
  processMeetings();
  
}, [timelineData, selectedDeal, fetchMeetingContacts, isUnmounting]); // Remove meetingContacts from dependencies

// Add cleanup effect when component unmounts
useEffect(() => {
  return () => {
    setIsUnmounting(true);
    cleanupState();
  };
}, [cleanupState]);

// Store browser ID on mount
useEffect(() => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('browserId', browserId);
  }
}, [browserId]);

// Fetch company overview when the selected deal changes
useEffect(() => {
  // Only fetch company overview after everything else has loaded
  if (selectedDeal?.name && !loading && timelineData) {
    fetchCompanyOverview(selectedDeal.name);
  }
}, [selectedDeal?.name, fetchCompanyOverview, loading, timelineData]);

// Fetch stakeholders when the selected deal changes
useEffect(() => {
  // Only fetch stakeholders after everything else has loaded
  if (selectedDeal?.name && !loading && timelineData) {
    fetchStakeholders(selectedDeal.name);
  }
}, [selectedDeal?.name, fetchStakeholders, loading, timelineData]);

// Removed redundant useEffect to prevent infinite loops

// Clear concerns when deal changes to prevent stale data
useEffect(() => {
  if (selectedDeal?.name) {
    setConcerns([]); // Set to empty array instead of null to prevent infinite loops
    setLoadingConcerns(false);
  }
}, [selectedDeal?.name]);

// Clear stakeholders when deal changes to prevent stale data
useEffect(() => {
  if (selectedDeal?.name) {
    setStakeholders([]);
    setLoadingStakeholders(false);
  }
}, [selectedDeal?.name]);

// Clear stakeholders cache on page refresh
useEffect(() => {
  const handleBeforeUnload = () => {
    // Clear all stakeholders cache on page refresh
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('stakeholders_')) {
        localStorage.removeItem(key);
      }
    });
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}, []);

// Removed redundant fallback useEffect hooks to prevent infinite loops

  // Get unique owners from all deals
  const uniqueOwners = useMemo(() => {
    const owners = new Set<string>();
    allDeals.forEach(deal => {
      if (deal.owner) {
        owners.add(deal.owner);
      }
    });
    return Array.from(owners).sort();
  }, [allDeals]);

  // Handle owner filter toggle
  const toggleOwnerFilter = (owner: string) => {
    setSelectedOwners(prev => {
      const newSet = new Set(prev);
      
      // If this is the only selected owner, deselect it to show all owners
      if (newSet.size === 1 && newSet.has(owner)) {
        newSet.clear();
        return newSet;
      }
      
      // If all owners are selected, clear and select only this owner
      if (newSet.size === uniqueOwners.length) {
        newSet.clear();
        newSet.add(owner);
        return newSet;
      }
      
      // Otherwise, toggle this owner
      if (newSet.has(owner)) {
        newSet.delete(owner);
      } else {
        newSet.add(owner);
      }
      
      return newSet;
    });
  };

  // Get initials for an owner name
  const getOwnerInitials = (owner: string): string => {
    return owner
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get color for owner filter
  const getOwnerColor = (owner: string): { bg: string; text: string; border: string } => {
    // Generate a consistent color based on the owner name
    const colors = [
      { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
      { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
      { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
      { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
      { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
      { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
      { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
      { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
    ];
    
    // Use the owner name to generate a consistent index
    const index = owner.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  // Add this helper function before the EventDrawer component
  const parseMarkdownSections = (markdown: string | Record<string, string[]>): Record<string, string[]> => {
    // If it's already an object with arrays, return it as is
    if (typeof markdown === 'object' && markdown !== null) {
      return markdown as Record<string, string[]>;
    }

    // If it's a string, return empty object (old format no longer supported)
    return {};
  };

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
              onChange={(e) => {
                // Update the input value immediately for smooth typing
                setDealSearchTerm(e.target.value);
              }}
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
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-3">
            <button
              onClick={() => setActiveFilterTab('stages')}
              className={`px-4 py-2 text-sm font-medium ${
                activeFilterTab === 'stages'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Stages
            </button>
            <button
              onClick={() => setActiveFilterTab('owners')}
              className={`px-4 py-2 text-sm font-medium ${
                activeFilterTab === 'owners'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Owners
            </button>
            <button
              onClick={() => setActiveFilterTab('bookmarks')}
              className={`px-4 py-2 text-sm font-medium ${
                activeFilterTab === 'bookmarks'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Bookmarks
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 p-2 bg-gray-50">
            {activeFilterTab === 'stages' ? (
              // Stage filters
              uniqueStages.map((stage) => {
                const isSelected = selectedStages.has(stage);
                return (
                  <div key={stage} className="relative inline-block group">
                    <button
                      onClick={() => toggleStageFilter(stage)}
                      className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                        isSelected 
                          ? `${getStageColor(stage).bg} ${getStageColor(stage).text} border ${getStageColor(stage).border}`
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      } hover:opacity-90 transition-opacity`}
                    >
                      {getStageInitials(stage)}
                    </button>
                    <div className="invisible group-hover:visible absolute z-50 -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      {stage}
                    </div>
                  </div>
                );
              })
            ) : activeFilterTab === 'owners' ? (
              // Owner filters
              uniqueOwners.map((owner) => {
                const isSelected = selectedOwners.has(owner);
                return (
                  <div key={owner} className="relative inline-block group">
                    <button
                      onClick={() => toggleOwnerFilter(owner)}
                      className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                        isSelected 
                          ? `${getOwnerColor(owner).bg} ${getOwnerColor(owner).text} border ${getOwnerColor(owner).border}`
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      } hover:opacity-90 transition-opacity`}
                    >
                      {getOwnerInitials(owner)}
                    </button>
                    <div className="invisible group-hover:visible absolute z-50 -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      {owner}
                    </div>
                  </div>
                );
              })
            ) : (
              // Bookmarks tab - show count
              <div className="text-sm text-gray-600">
                {bookmarkedDeals.size > 0 ? (
                  <span>Showing {bookmarkedDeals.size} bookmarked deal{bookmarkedDeals.size !== 1 ? 's' : ''}</span>
                ) : (
                  <span className="text-gray-500 italic">No bookmarks yet. Click the star icon on any deal to bookmark it.</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Regular Deals Section - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-500">
                {activeFilterTab === 'bookmarks' ? 'Bookmarked Deals' : 'All Deals'} ({filteredDeals.length})
              </h3>
              {activeFilterTab !== 'bookmarks' && (
                <button
                  onClick={() => setShowOnlyActiveDeals(!showOnlyActiveDeals)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    showOnlyActiveDeals 
                      ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                  title={showOnlyActiveDeals ? 'Show all deals' : 'Show only deals with activities'}
                >
                  {showOnlyActiveDeals ? 'All Deals' : 'Active Deals'}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {filteredDeals.map(deal => {
                const daysPassed = getDaysPassed(deal);
                const isSelected = selectedDeal?.id === deal.id;
                const isBookmarked = bookmarkedDeals.has(deal.id);
                return (
                  <div
                    key={deal.id}
                    className={`flex items-start justify-between p-3 rounded-lg transition-colors cursor-pointer border ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                        : 'bg-white border-gray-100 hover:bg-gray-50'
                    }`}
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
                        
                        // Load timeline without resetting selectedStages
                        handleGetTimeline(deal);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${
                        isSelected ? 'text-blue-700' : 'text-gray-900'
                      }`}>
                        {deal.name}
                      </div>
                      <div className={`text-xs ${
                        isSelected ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        Stage: {deal.stage}
                      </div>
                      <div className={`text-xs ${
                        isSelected ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        Owner: {deal.owner || 'NA'}
                      </div>
                      <div className={`text-xs ${
                        isSelected ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        Created: {formatDate(deal.createdate)}
                      </div>
                      <div className={`text-xs ${
                        isSelected ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        Activities: <span className={deal.activities && deal.activities >= 15 ? 'text-orange-600 font-medium' : ''}>
                          {deal.activities || 0}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Bookmark icon */}
                      <button
                        onClick={(e) => handleBookmarkToggle(e, deal.id)}
                        className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                          isBookmarked ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'
                        }`}
                        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                      >
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className="h-4 w-4" 
                          fill={isBookmarked ? 'currentColor' : 'none'} 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" 
                          />
                        </svg>
                      </button>
                      
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
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
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
            <div className="flex items-center">
              <span className="text-2xl font-bold text-gray-600">{selectedDeal.name}</span>
              <div className="relative inline-block ml-2">
                <div className="cursor-help group">
                  <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm hover:bg-gray-300 transition-colors">
                    ?
                  </div>
                  <div className="absolute z-10 invisible group-hover:visible hover:visible bg-white p-4 rounded-md shadow-lg border border-gray-200 w-72 sm:w-96 left-0 top-full mt-1">
                    {loadingOverview ? (
                      <div className="flex items-center justify-center py-2">
                        <div className="animate-spin h-4 w-4 border-2 border-sky-500 rounded-full border-t-transparent mr-2"></div>
                        <p className="text-sm text-gray-500">Loading company overview...</p>
                      </div>
                    ) : companyOverview ? (
                      <p className="text-sm text-gray-700">{companyOverview}</p>
                    ) : (
                      <p className="text-sm text-gray-500">No company information available</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
            className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors text-sm flex items-center"
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
        <div className="mb-6 bg-sky-50 p-3 rounded-md border border-sky-100">
          {fetchingActivities ? (
            <p className="text-sky-700 font-medium flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-sky-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Counting activities for <span className="font-bold ml-1">{selectedDeal.name}</span>...
            </p>
          ) : activitiesCount !== null ? (
            <p className="text-sky-800 font-medium">
              <span className="font-bold text-lg">{activitiesCount}</span> activities found for this deal
            </p>
          ) : timelineData ? (
            <p className="text-sky-800 font-medium">
              <span className="font-bold text-lg">{timelineData.events.length}</span> activities found for this deal
            </p>
          ) : (
            <p className="text-sky-800 font-medium">
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
            {loadingMessage ? (
              <span className={`text-blue-600 ${elapsedTime > 15 ? 'text-orange-500' : ''} ${elapsedTime > 80 ? 'text-red-500' : ''}`}>
                {loadingMessage}
              </span>
            ) : (
              <span className={`${elapsedTime > 15 ? 'text-orange-500' : ''} ${elapsedTime > 80 ? 'text-red-500' : ''}`}>
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
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
            disabled={loading}
          >
            Load Timeline
          </button>
        </div>
      ) : timelineData ? (
        <div className="bg-white p-4 rounded-lg shadow">
          {dealInfo && (
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <div className="flex flex-wrap gap-x-8">
                <p className="text-gray-700">
                  <span className="font-semibold">Started:</span> {formatDate(dealInfo.startDate)}
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Deal Owner:</span> <span className="text-red-600"><b>{dealInfo.dealOwner}</b></span>
                </p>
                <p className="text-gray-700">
                  <span className="font-semibold">Stage:</span> <span className="text-red-600"><b>{dealInfo.dealStage}</b></span>
                </p>
              </div>
            </div>
          )}

          {/* Stakeholders Section */}
          {loadingStakeholders ? (
            <div className="mb-4 p-3 bg-blue-50 rounded-md">
              <h3 className="font-semibold text-gray-700 mb-3">Stakeholders by Title</h3>
              <div className="text-gray-500">
                Loading...
              </div>
            </div>
          ) : stakeholders.length > 0 ? (
            <div className="mb-4 p-3 bg-blue-50 rounded-md">
              <h3 className="font-semibold text-gray-700 mb-3">Stakeholders by Title</h3>
              <div className="flex flex-wrap gap-3">
                {stakeholders.map((stakeholder, index) => (
                  <div
                    key={index}
                    className="relative group"
                    title={`${stakeholder.name}${stakeholder.title ? ` - ${stakeholder.title}` : ''}\n${stakeholder.email}`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm cursor-pointer transition-all duration-200 hover:scale-110 ${
                        stakeholder.potential_decision_maker 
                          ? 'bg-blue-600 ring-2 ring-green-500' 
                          : 'bg-gray-500 ring-2 ring-gray-300'
                      }`}
                    >
                      {getInitials(stakeholder.name)}
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-0 transform mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap" style={{ zIndex: 999999 }}>
                      <div className="font-semibold">{stakeholder.name}</div>
                      {stakeholder.title && <div className="text-gray-300">{stakeholder.title}</div>}
                      <div className="text-gray-300">{stakeholder.email}</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Last Touch Point Section */}
          {dealInfo && (
            <div className={`mb-4 p-3 rounded-md ${
              calculateDaysPassed(dealInfo.endDate) > 10 
                ? 'bg-red-50' 
                : 'bg-green-50'
            }`}>
              <p className="text-gray-700">
                <span className="font-semibold">Last Touch Point:</span> {formatDate(dealInfo.endDate)}
                <span className="text-gray-700 text-sm ml-1">
                  <b>(been {calculateDaysPassed(dealInfo.endDate)} days)</b>
                </span>
              </p>
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
                    <h4 className="text-sm font-medium text-gray-600">Positive Buying Signals</h4>
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

          {/* Add Challenges section */}
          {timelineData && timelineData.events && (
            <div className="mb-6 grid grid-cols-3 gap-4">
              {/* Pricing Concerns */}
              <div 
                className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleConcernClick('pricing_concerns')}
              >
                <div className="flex items-center">
                  {(() => {
                    const processedConcerns = processConcernsArray(concerns);
                    return (
                      <>
                        <div className={`p-2 rounded-lg ${
                          !concerns || concerns.length === 0 ? 'bg-gray-100' : 
                          processedConcerns.hasPricingConcerns ? 'bg-orange-100' : 'bg-green-100'
                        }`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${
                            !concerns || concerns.length === 0 ? 'text-gray-400' :
                            processedConcerns.hasPricingConcerns ? 'text-orange-600' : 'text-green-600'
                          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="ml-4">
                          <h4 className="text-sm font-medium text-gray-600">Pricing Concerns</h4>
                          {loadingConcerns ? (
                            <div className="animate-pulse h-6 w-16 bg-gray-200 rounded"></div>
                          ) : !concerns || concerns.length === 0 ? (
                            <span className="text-gray-400">N/A</span>
                          ) : (
                            <div className="relative">
                              <span className={`text-lg font-bold ${
                                processedConcerns.hasPricingConcerns ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {processedConcerns.hasPricingConcerns ? 'Yes' : 'No'}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Decision Maker */}
              <div 
                className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleConcernClick('no_decision_maker')}
              >
                <div className="flex items-center">
                  {(() => {
                    const processedConcerns = processConcernsArray(concerns);
                    return (
                      <>
                        <div className={`p-2 rounded-lg ${
                          !concerns || concerns.length === 0 ? 'bg-gray-100' :
                          processedConcerns.hasDecisionMaker ? 'bg-green-100' : 'bg-orange-100'
                        }`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${
                            !concerns || concerns.length === 0 ? 'text-gray-400' :
                            processedConcerns.hasDecisionMaker ? 'text-green-600' : 'text-orange-600'
                          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                        </div>
                        <div className="ml-4">
                          <h4 className="text-sm font-medium text-gray-600">Decision Maker</h4>
                          {loadingConcerns ? (
                            <div className="animate-pulse h-6 w-16 bg-gray-200 rounded"></div>
                          ) : !concerns || concerns.length === 0 ? (
                            <span className="text-gray-400">N/A</span>
                          ) : (
                            <div className="relative">
                              <span className={`text-lg font-bold ${
                                processedConcerns.hasDecisionMaker ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {processedConcerns.hasDecisionMaker ? 'Yes' : 'No'}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Existing Vendor */}
              <div 
                className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleConcernClick('already_has_vendor')}
              >
                <div className="flex items-center">
                  {(() => {
                    const processedConcerns = processConcernsArray(concerns);
                    return (
                      <>
                        <div className={`p-2 rounded-lg ${
                          !concerns || concerns.length === 0 ? 'bg-gray-100' :
                          processedConcerns.hasCompetitor ? 'bg-orange-100' : 'bg-green-100'
                        }`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${
                            !concerns || concerns.length === 0 ? 'text-gray-400' :
                            processedConcerns.hasCompetitor ? 'text-orange-600' : 'text-green-600'
                          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div className="ml-4">
                          <h4 className="text-sm font-medium text-gray-600">Using a Competitor?</h4>
                          {loadingConcerns ? (
                            <div className="animate-pulse h-6 w-16 bg-gray-200 rounded"></div>
                          ) : !concerns || concerns.length === 0 ? (
                            <span className="text-gray-400">N/A</span>
                          ) : (
                            <div className="relative">
                              <span className={`text-lg font-bold ${
                                processedConcerns.hasCompetitor ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {processedConcerns.hasCompetitor ? 'Yes' : 'No'}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
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
                                key={`bg-red-${entry.date}-${index}-less-likely`}
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
                                key={`bg-green-${entry.date}-${index}-very-likely`}
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
              <DealLogs 
                events={timelineData.events} 
                activeFilters={activeEventFilters}
                onFilterChange={setActiveEventFilters}
                selectedEventId={selectedEventId}
                onRowClick={(date, eventId) => {
                  setSelectedDate(date);
                  setSelectedEventId(eventId);
                  setSelectedConcern(null); // Clear any selected concern to show events instead
                  setIsDrawerOpen(true);
                }}
              />
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


