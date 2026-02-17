'use client';

import { useAppState } from '../context/AppContext';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Select from 'react-select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Brush, ReferenceArea, LineChart, Line
} from 'recharts';
import { Deal } from '../context/AppContext';
import { API_CONFIG } from '../utils/config';
import { parseBuyerIntentExplanation } from '../utils/buyerIntentParser';
import ReactMarkdown from 'react-markdown';

// Helper function to format text with dashes as proper markdown bullet points
const formatAsBulletPoints = (text: string): string => {
  if (!text) return text;
  // Replace " - " or ". - " with newline + "- " to create proper markdown bullets
  return text.replace(/(\.|^)\s*-\s+/g, (match, punctuation, offset) => {
    // Keep the first dash as-is (start of text), add newline before others
    return offset === 0 ? '- ' : punctuation + '\n- ';
  });
};

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
  createdate?: string;
  createdDate?: string;
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

const getStakeholderDisplayName = (s: Stakeholder): string => {
  if (s.name && s.name !== 'Unknown name') return s.name;
  if (s.email) return s.email.split('@')[0];
  return 'Unknown';
};

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
    activities: rawTimelineData,
    loading,
    error,
    lastFetched
  } = state.dealTimeline;

  // Normalize timelineData to ensure events is always an array
  const timelineData = React.useMemo(() => {
    if (!rawTimelineData) return null;
    if (!rawTimelineData.events || !Array.isArray(rawTimelineData.events)) {
      return { ...rawTimelineData, events: [] };
    }
    return rawTimelineData;
  }, [rawTimelineData]);

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
  const latestActivityTooltipRef = useRef<HTMLDivElement>(null);
  const stakeholderTooltipsRef = useRef<HTMLDivElement>(null);
  
  const chartRef = useRef<any>(null);

  // Loading state variables
  const [dealsLoading, setDealsLoading] = useState<boolean>(true);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
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
  const [selectedStagesInitialized, setSelectedStagesInitialized] = useState<boolean>(false);

  // Add session management state
  const [browserId, setBrowserId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);


  // Add state for company overview
  const [companyOverview, setCompanyOverview] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  
  // Add new state for concerns
  const [concerns, setConcerns] = useState<ConcernsItem[]>([]);
  const [loadingConcerns, setLoadingConcerns] = useState<boolean>(false);
  
  // Add state for Latest Activity tooltip copy functionality
  const [latestActivityCopyFeedback, setLatestActivityCopyFeedback] = useState<boolean>(false);
  
  // Add state for Latest Activity tooltip visibility (for mobile)
  const [isLatestActivityTooltipVisible, setIsLatestActivityTooltipVisible] = useState<boolean>(false);
  
  // Add state for stakeholder tooltips visibility (for mobile)
  const [visibleStakeholderTooltips, setVisibleStakeholderTooltips] = useState<Set<string>>(new Set());

  // Add this near the top of the component with other state declarations
  const [bookmarkedDeals, setBookmarkedDeals] = useState<Set<string>>(new Set());

  // Add state for active tab and selected owners
  const [activeFilterTab, setActiveFilterTab] = useState<'stages' | 'owners' | 'bookmarks'>('stages');
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());

  // Add state for activities filter
  const [showOnlyActiveDeals, setShowOnlyActiveDeals] = useState<boolean>(false);

  // Add state for sorting
  const [sortBy, setSortBy] = useState<'created' | 'name' | 'activities'>('created');

  // Add state for sidebar collapse
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

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
  const [copiedStakeholderEmail, setCopiedStakeholderEmail] = useState<string | null>(null);

  // Add this with other state declarations at the top
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Copy function for Latest Activity tooltip
  const copyLatestActivityToClipboard = async () => {
    try {
      const textToCopy = companyOverview || 'No latest activity available';
      await navigator.clipboard.writeText(textToCopy);
      
      setLatestActivityCopyFeedback(true);
      setTimeout(() => {
        setLatestActivityCopyFeedback(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy latest activity: ', err);
    }
  };

  // Toggle Latest Activity tooltip visibility
  const toggleLatestActivityTooltip = () => {
    setIsLatestActivityTooltipVisible(!isLatestActivityTooltipVisible);
  };

  // Toggle stakeholder tooltip visibility
  const toggleStakeholderTooltip = (stakeholderId: string) => {
    setVisibleStakeholderTooltips(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stakeholderId)) {
        newSet.delete(stakeholderId);
      } else {
        newSet.clear(); // Only show one tooltip at a time
        newSet.add(stakeholderId);
      }
      return newSet;
    });
  };

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

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSidebarState = localStorage.getItem('sidebarCollapsed');
      if (savedSidebarState) {
        try {
          setIsSidebarCollapsed(JSON.parse(savedSidebarState));
        } catch (error) {
          console.error('Error loading sidebar state from localStorage:', error);
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

  // Save sidebar state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed]);

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

  // Filter and sort deals based on selected stages and search term
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

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'activities':
          return (b.activities || 0) - (a.activities || 0); // Descending order
        case 'created':
        default:
          // Most recent first (descending order)
          if (!a.createdate && !b.createdate) return 0;
          if (!a.createdate) return 1;
          if (!b.createdate) return -1;
          return new Date(b.createdate).getTime() - new Date(a.createdate).getTime();
      }
    });

    return filtered;
  }, [allDeals, selectedStages, selectedOwners, debouncedDealSearchTerm, activeFilterTab, bookmarkedDeals, showOnlyActiveDeals, sortBy]);

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
      .replace(/[0-9]/g, '') // Remove any numbers
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

  // Watch for URL changes and reset isUrlProcessed flag
  useEffect(() => {
    if (!hasMounted) return;

    const handleUrlChange = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const dealName = searchParams.get('dealName') || searchParams.get('deal_name') || searchParams.get('deal');

      if (dealName) {
        const decodedDealName = decodeURIComponent(dealName);
        // If URL has a deal parameter and it's different from the current selected deal, reset processing flag
        if (!selectedDeal || selectedDeal.name !== decodedDealName) {
          console.log('URL changed to new deal:', decodedDealName);
          setIsUrlProcessed(false);
        }
      }
    };

    // Check on mount
    handleUrlChange();

    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [hasMounted, selectedDeal]);

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

  // Click outside Latest Activity tooltip to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (latestActivityTooltipRef.current && 
          !latestActivityTooltipRef.current.contains(event.target as Node)) {
        setIsLatestActivityTooltipVisible(false);
      }
    };

    if (isLatestActivityTooltipVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLatestActivityTooltipVisible]);

  // Click outside stakeholder tooltips to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stakeholderTooltipsRef.current && 
          !stakeholderTooltipsRef.current.contains(event.target as Node)) {
        setVisibleStakeholderTooltips(new Set());
      }
    };

    if (visibleStakeholderTooltips.size > 0) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visibleStakeholderTooltips]);

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
    const startTime = Date.now();
    console.log('[makeApiCall] Starting API call to:', url, 'at', new Date().toISOString());

    // Get browserId directly from localStorage to avoid async initialization delays
    let currentBrowserId = browserId;
    if (!currentBrowserId && typeof window !== 'undefined') {
      currentBrowserId = localStorage.getItem('browserId') || '';
      if (!currentBrowserId) {
        currentBrowserId = crypto.randomUUID();
        localStorage.setItem('browserId', currentBrowserId);
      }
    }

    const sessionId = localStorage.getItem('sessionId') || '';

    const headers = {
      'X-Browser-ID': currentBrowserId,
      'X-Session-ID': sessionId,
      ...options.headers,
    };

    console.log('[makeApiCall] About to call fetch for:', url, 'elapsed:', Date.now() - startTime, 'ms');

    try {
      const fetchStartTime = Date.now();
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const fetchDuration = Date.now() - fetchStartTime;
      console.log('[makeApiCall] Fetch completed for:', url, 'in', fetchDuration, 'ms');

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

  // Function to fetch company overview - simplified
  const fetchCompanyOverview = useCallback(async (dealName: string) => {
    console.log('[fetchCompanyOverview] Starting at:', new Date().toISOString());
    setLoadingOverview(true);

    try {
      // Call backend directly like other working APIs
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/company-overview')}?dealName=${encodeURIComponent(dealName)}`);

      if (response) {
        const data = await response.json();
        setCompanyOverview(data.overview);
        console.log('[fetchCompanyOverview] Completed at:', new Date().toISOString());
      }
    } catch (error) {
      console.error('[fetchCompanyOverview] Error:', error);
      setCompanyOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  }, [makeApiCall]);

  // Function to fetch stakeholders
  const fetchStakeholders = useCallback(async (dealName: string) => {
    console.log('[fetchStakeholders] ===== FUNCTION CALLED =====');
    console.log('[fetchStakeholders] Deal name:', dealName);
    console.log('[fetchStakeholders] Timestamp:', new Date().toISOString());

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
            console.log('[fetchStakeholders] Using cached data:', parsed.data);
            setStakeholders(parsed.data);
            setLoadingStakeholders(false);
            return;
          }
        } catch (e) {
          console.error('Error parsing cached stakeholders data:', e);
        }
      }

      // Fetch fresh data from API - use makeApiCall like other working APIs
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/get-stakeholders')}?deal_name=${encodeURIComponent(dealName)}`);

      if (response) {
        const data: StakeholdersData = await response.json();
        console.log('[fetchStakeholders] API Response data:', data);
        const stakeholdersData = data.stakeholders || [];
        console.log('[fetchStakeholders] Setting stakeholders:', stakeholdersData);
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
    console.log('[fetchDealInfo] ===== FUNCTION CALLED =====');
    console.log('[fetchDealInfo] Deal name:', dealName);
    console.log('[fetchDealInfo] Timestamp:', new Date().toISOString());

    try {
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/deal-info')}?dealName=${encodeURIComponent(dealName)}`);

      if (response) {
        const info = await response.json();
        console.log('[fetchDealInfo] Response received at:', new Date().toISOString());
        console.log('[fetchDealInfo] Full response data:', info);
        console.log('[fetchDealInfo] Available date fields:', {
          startDate: info.startDate,
          createdate: info.createdate,
          createdDate: info.createdDate,
          allKeys: Object.keys(info)
        });
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
    
    // Check if we already have cached data for this deal
    if (selectedDealRef.current?.name === dealName && timelineDataRef.current && lastFetched) {
      const currentTime = Date.now();
      if (currentTime - lastFetched < DATA_EXPIRY_TIME) {
        // If data is fresh and for the same deal, just use the cached data
        // REMOVED: setLoadingMessage
        // REMOVED: fetchDealInfo call - now handled by API Handler 1
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
    // REMOVED: setLoadingStage
    setLoadingError(false);
    
    // Clear chart data
    setChartData([]);

    // Otherwise, fetch new data
    updateState('dealTimeline.loading', true);
    updateState('dealTimeline.error', null);
    setLoadingStartTime(Date.now());
    // REMOVED: setLoadingStage
    setLoadingError(false);
    // REMOVED: setLoadingMessage
    
    try {
      // Fetch all data in parallel for faster loading
      // REMOVED: setLoadingMessage
      
      // Run all API calls in parallel
      const startTime = Date.now();
      
      const [count, timelineResponse] = await Promise.all([
        fetchActivitiesCount(dealName).then(result => {
          return result;
        }),
        (async () => {
          const result = await makeApiCall(`${API_CONFIG.getApiPath('/deal-timeline')}?dealName=${encodeURIComponent(dealName)}`);
          return result;
        })()
        // dealInfo, companyOverview and stakeholders now fire independently via useEffect
      ]);
      
      if (timelineResponse) {
        // REMOVED: setLoadingMessage
        const data = await timelineResponse.json();
        
        // Verify the deal name matches before updating state
        if (selectedDealRef.current?.name === dealName) {
          updateState('dealTimeline.activities', data);
          updateState('dealTimeline.lastFetched', Date.now());
          // REMOVED: setLoadingMessage
          
          // After timeline loads, explicitly fetch concerns (similar to refresh button)
          // REMOVED: setLoadingMessage
          // Note: fetchConcerns will be called by the useEffect that watches timelineData
        } else {
          console.warn(`Deal name mismatch: URL deal=${dealName}, current deal=${selectedDealRef.current?.name}`);
          // REMOVED: setLoadingMessage
        }
      } else {
        console.warn('[Timeline] No response received from timeline API');
        // REMOVED: setLoadingMessage
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
      
      // REMOVED: setLoadingMessage
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
    browserId
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

  // REMOVED: Loading stage logic - no longer showing full-page loading messages

  // Process URL parameters only once after mount
  useEffect(() => {
    if (!hasMounted || isUrlProcessed) return;

    const searchParams = new URLSearchParams(window.location.search);
    const dealName = searchParams.get('dealName') || searchParams.get('deal_name') || searchParams.get('deal');
    // REMOVED: autoload parameter - no longer needed with modular API system

    if (dealName) {
      const decodedDealName = decodeURIComponent(dealName);
      // store the deal name in local storage
      localStorage.setItem('dealName', decodedDealName);

      // Always process URL parameters for navigation, regardless of current state
      // First, try to find the deal in allDeals
      const matchingDeal = allDeals.find(d => d.name === decodedDealName);

      if (matchingDeal) {
        // Clear cached timeline data to force refresh for the new deal
        updateState('dealTimeline.activities', null);
        updateState('dealTimeline.lastFetched', null);

        updateState('dealTimeline.selectedDeal', matchingDeal);
        setSelectedOption({ value: matchingDeal.id, label: matchingDeal.name });
        setCurrentDealId(matchingDeal.id);

        // Load timeline data for the deal
        loadTimelineDirectly(decodedDealName);

        // Mark as processed only when we successfully find and process the deal
        setIsUrlProcessed(true);
      } else if (allDeals.length === 0) {
        // If allDeals is empty, don't mark as processed yet - wait for deals to load
        console.log('Waiting for deals to load before processing URL for:', decodedDealName);
        return;
      } else {
        // If allDeals is populated but deal not found, create temporary deal
        const tempDeal = {
          name: decodedDealName,
          id: 'pending'
        };

        // Clear cached timeline data to force refresh for the new deal
        updateState('dealTimeline.activities', null);
        updateState('dealTimeline.lastFetched', null);

        updateState('dealTimeline.selectedDeal', tempDeal);
        setSelectedOption({ value: 'pending', label: decodedDealName });

        // Load timeline data for the deal
        loadTimelineDirectly(decodedDealName);

        setIsUrlProcessed(true);
      }
    } else {
      // No dealName in URL, mark as processed
      setIsUrlProcessed(true);
    }
  }, [hasMounted, isUrlProcessed, allDeals, updateState, loadTimelineDirectly]);

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
  }, [hasMounted, isInitialLoad, makeApiCall, updateState, selectedDeal]);

  useEffect(() => {
    if (timelineData && timelineData.events && Array.isArray(timelineData.events) && timelineData.events.length > 0) {

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
          if (eventType === 'Meeting' && event.buyer_intent === 'Likely to buy') {
            eventsByDate[event.date_str].hasVeryLikelyToBuy = true; // Use same flag for both positive signals
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

        // REMOVED: fetchDealInfo call - now handled by API Handler 1
        // API Handler 1 automatically fetches dealInfo when selectedDeal changes
      } catch (error) {
        console.error('Error processing timeline data:', error);
        setChartData([]);
      }
    }
  }, [timelineData, selectedDeal]);

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

  // Helper function to convert buyer intent to signal format
  const formatBuyerIntentForDisplay = (intent: string): string => {
    if (intent === 'Likely to buy') {
      return 'Positive Signal';
    } else if (intent === 'Less likely to buy') {
      return 'Negative Signal';
    }
    return intent; // Return as-is for other values like "Very likely to buy", "Neutral", etc.
  };

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
                            {formatBuyerIntentForDisplay(intent)}{index < meetingIntents.length - 1 ? ', ' : ''}
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
  // State for managing display
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [meetingInsightsCopyFeedback, setMeetingInsightsCopyFeedback] = useState<Record<string, boolean>>({});


  const toggleSection = (index: number) => {
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const copyMeetingInsightsToClipboard = async (eventId: string, explanation: any) => {
    try {
      let textToCopy = '';
      
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

      // Build the text to copy
      Object.entries(sections).forEach(([title, rawBulletPoints]) => {
        const bulletPoints = Array.isArray(rawBulletPoints)
          ? rawBulletPoints
          : typeof rawBulletPoints === 'object' && rawBulletPoints !== null
            ? Object.values(rawBulletPoints)
            : [String(rawBulletPoints)];

        textToCopy += `${title}:\n`;
        bulletPoints.forEach((point) => {
          textToCopy += `• ${String(point)}\n`;
        });
        textToCopy += '\n';
      });

      await navigator.clipboard.writeText(textToCopy.trim());
      
      setMeetingInsightsCopyFeedback(prev => ({ ...prev, [eventId]: true }));
      setTimeout(() => {
        setMeetingInsightsCopyFeedback(prev => ({ ...prev, [eventId]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy meeting insights: ', err);
    }
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

  // Simplified function to get event content directly from the event data
  const getEventContent = (eventId: string): string => {
    const evt = eventsForDate.find(e => e.id === eventId);
    return evt?.content || 'No content available';
  };
  
  // Clean content from special characters and format for display
  const cleanDrawerContent = (content: string) => {
    if (!content) return '';
    return content
      .replace(/\\n/g, '\n')  // Convert escaped newlines to actual newlines
      .replace(/\\t/g, '  ')  // Convert tabs to spaces
      .replace(/<([^>]*)>/g, '[Link]')  // Replace angle brackets with [Link]
      .trim();
  };

  return (
    <div 
      ref={drawerRef}
      className={`fixed top-0 right-0 h-full w-96 bg-white shadow-xl z-50 overflow-y-auto transform ${
        isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
      } transition-transform duration-300 ease-in-out`}
    >
      <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
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
               selectedConcern === 'already_has_vendor' ? 'Competitor Mentions' :
               selectedConcern === 'positives' ? 'Positive Signals' :
               selectedConcern === 'risks' ? 'Risk Factors' : 'Unknown Concern'}
            </p>
          )}
        </div>
        <button 
          onClick={() => setIsDrawerOpen(false)}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-4">
        {selectedConcern ? (
          <div>
            {(() => {
              const processedConcerns = processConcernsArray(concerns);

              // For positives and risks, we'll render a different view
              if (selectedConcern === 'positives' || selectedConcern === 'risks') {
                const positiveEmails = timelineData?.events?.filter(e =>
                  (e.type === 'Incoming Email' || e.type === 'Outgoing Email') && e.sentiment === 'positive'
                ).length || 0;
                const buyingSignals = timelineData?.events?.filter(e =>
                  e.type === 'Meeting' && (e.buyer_intent === 'Likely to buy' || e.buyer_intent === 'Very likely to buy')
                ).length || 0;
                const lessLikelySignals = timelineData?.events?.filter(e =>
                  e.type === 'Meeting' && e.buyer_intent === 'Less likely to buy'
                ).length || 0;
                const hasDecisionMaker = stakeholders.some(s => s.potential_decision_maker);

                const signals = selectedConcern === 'positives' ? [
                  {
                    label: 'Positive Emails',
                    value: positiveEmails,
                    status: positiveEmails > 0,
                    description: `${positiveEmails} email${positiveEmails !== 1 ? 's' : ''} with positive sentiment detected`
                  },
                  {
                    label: 'Buying Signals',
                    value: buyingSignals,
                    status: buyingSignals > 0,
                    description: `${buyingSignals} meeting${buyingSignals !== 1 ? 's' : ''} with likely to buy intent`
                  },
                  {
                    label: 'No Competitors',
                    value: !processedConcerns.hasCompetitor,
                    status: !processedConcerns.hasCompetitor,
                    description: processedConcerns.hasCompetitor ? 'Competitors mentioned in conversation' : 'No competitor mentions detected'
                  },
                  {
                    label: 'No Pricing Concerns',
                    value: !processedConcerns.hasPricingConcerns,
                    status: !processedConcerns.hasPricingConcerns,
                    description: processedConcerns.hasPricingConcerns ? 'Pricing concerns identified' : 'No pricing concerns detected'
                  },
                  {
                    label: 'Decision Maker Present',
                    value: hasDecisionMaker,
                    status: hasDecisionMaker,
                    description: hasDecisionMaker ? 'Decision maker identified in stakeholders' : 'No decision maker identified'
                  }
                ] : [
                  {
                    label: 'No Decision Maker',
                    value: !hasDecisionMaker,
                    status: !hasDecisionMaker,
                    description: hasDecisionMaker ? 'Decision maker identified in stakeholders' : 'No decision maker identified'
                  },
                  {
                    label: 'Competitor Mentioned',
                    value: processedConcerns.hasCompetitor,
                    status: processedConcerns.hasCompetitor,
                    description: processedConcerns.hasCompetitor && processedConcerns.competitorExplanation
                      ? processedConcerns.competitorExplanation
                      : processedConcerns.hasCompetitor
                        ? 'Competitors mentioned in conversation'
                        : 'No competitor mentions detected'
                  },
                  {
                    label: 'Less Likely to Buy',
                    value: lessLikelySignals,
                    status: lessLikelySignals > 0,
                    description: `${lessLikelySignals} meeting${lessLikelySignals !== 1 ? 's' : ''} with less likely to buy intent`
                  },
                  {
                    label: 'Pricing Concerns',
                    value: processedConcerns.hasPricingConcerns,
                    status: processedConcerns.hasPricingConcerns,
                    description: processedConcerns.hasPricingConcerns && processedConcerns.pricingConcernsExplanation
                      ? processedConcerns.pricingConcernsExplanation
                      : processedConcerns.hasPricingConcerns
                        ? 'Pricing concerns identified'
                        : 'No pricing concerns detected'
                  }
                ];

                return (
                  <div>
                    <div className="mb-6">
                      <h2 className={`text-2xl font-bold mb-2 ${selectedConcern === 'positives' ? 'text-green-700' : 'text-red-700'}`}>
                        {selectedConcern === 'positives' ? 'Positive Signals' : 'Risk Factors'}
                      </h2>
                      <p className="text-gray-600 text-sm">
                        {selectedConcern === 'positives'
                          ? 'Indicators that suggest a favorable deal outcome'
                          : 'Potential concerns that may impact deal success'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {signals.map((signal, index) => (
                        <div
                          key={index}
                          className={`p-4 rounded-lg border-2 ${
                            signal.status
                              ? selectedConcern === 'positives'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                              : 'bg-gray-50 border-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className={`h-5 w-5 ${
                                  signal.status
                                    ? selectedConcern === 'positives'
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                    : 'text-gray-400'
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                {signal.status ? (
                                  selectedConcern === 'positives' ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  )
                                ) : (
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                )}
                              </svg>
                              <h3 className={`font-semibold ${
                                signal.status
                                  ? selectedConcern === 'positives'
                                    ? 'text-green-800'
                                    : 'text-red-800'
                                  : 'text-gray-600'
                              }`}>
                                {signal.label}
                              </h3>
                            </div>
                            {typeof signal.value === 'number' && signal.value > 0 && (
                              <span className={`font-bold text-lg ${
                                selectedConcern === 'positives' ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {signal.value}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 ml-7">
                            {signal.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // Original concern view for pricing_concerns, no_decision_maker, already_has_vendor
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
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{concernTitle}</h2>
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-bold ${concernColor}`}>
                        {concernStatus}
                      </span>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-4 relative">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Analysis</h3>
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
          <div className="space-y-3">
            {eventsForDate.map((event, index) => (
              <div
                id={`event-section-${index}`}
                key={index}
                className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                {/* Event Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                    event.type === 'Meeting' ? 'bg-red-500' :
                    event.type === 'Incoming Email' ? 'bg-green-500' :
                    event.type === 'Outgoing Email' ? 'bg-blue-500' : 'bg-teal-500'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {event.type}
                      </span>
                      {event.time_str && (
                        <span className="text-xs text-gray-400">{event.time_str}</span>
                      )}
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                      {event.subject || 'No subject'}
                    </h4>

                    {/* Sentiment or Intent Badge */}
                    {event.type === 'Meeting' && event.buyer_intent && (
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                        event.buyer_intent === 'Very likely to buy' || event.buyer_intent === 'Likely to buy'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : event.buyer_intent === 'Less likely to buy'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : event.buyer_intent === 'Neutral'
                          ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                          : 'bg-gray-50 text-gray-700 border border-gray-200'
                      }`}>
                        {event.buyer_intent === 'Likely to buy' ? 'Positive Signal' :
                         event.buyer_intent === 'Less likely to buy' ? 'Negative Signal' : event.buyer_intent}
                      </span>
                    )}

                    {(event.type === 'Incoming Email' || event.type === 'Outgoing Email') && event.sentiment && (
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                        event.sentiment === 'positive'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : event.sentiment === 'negative'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : event.sentiment === 'neutral'
                          ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                          : 'bg-gray-50 text-gray-700 border border-gray-200'
                      }`}>
                        {event.sentiment.charAt(0).toUpperCase() + event.sentiment.slice(1)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content Section - Display for all event types */}
                {event.id && event.content && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <h5 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Content</h5>
                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {cleanDrawerContent(event.content)}
                    </div>
                  </div>
                )}

                {/* Meeting Insights */}
                {event.type === 'Meeting' && event.buyer_intent_explanation && event.buyer_intent_explanation !== 'N/A' && (
                  <div className="mt-3 bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-base font-bold text-blue-900 uppercase tracking-wide">Insights</h5>
                      <button
                        onClick={() => copyMeetingInsightsToClipboard(event.id || '', event.buyer_intent_explanation)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          meetingInsightsCopyFeedback[event.id || '']
                            ? 'text-green-600 bg-green-100'
                            : 'text-blue-600 hover:text-blue-800 hover:bg-blue-100'
                        }`}
                        title={meetingInsightsCopyFeedback[event.id || ''] ? "Copied!" : "Copy insights"}
                      >
                        {meetingInsightsCopyFeedback[event.id || ''] ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="space-y-4">
                      {(() => {
                        const sections = parseBuyerIntentExplanation(event.buyer_intent_explanation);
                        return sections.map((section, sectionIndex) => (
                          <div key={sectionIndex}>
                            <h6 className="text-base font-bold text-blue-900 mb-2">{section.title}</h6>
                            <ul className="space-y-2">
                              {section.bulletPoints.map((point, pointIndex) => (
                                <li key={pointIndex} className="text-sm text-blue-800 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-blue-600">
                                  {point}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Attendees for Meetings */}
                {event.type === 'Meeting' && event.subject && event.date_str && meetingContacts[`${event.subject}_${event.date_str}`]?.contacts?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <h5 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Attendees</h5>
                    <div className="flex flex-wrap gap-2">
                      {meetingContacts[`${event.subject}_${event.date_str}`].contacts.map((contact, idx) => (
                        <div key={idx} className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                            {(contact.name !== 'Unknown name' ? contact.name : contact.email || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-gray-900">
                              {contact.name !== 'Unknown name' ? contact.name : (contact.email || 'Unknown')}
                            </span>
                            {contact.title !== 'Unknown title' && (
                              <span className="text-[10px] text-gray-500">{contact.title}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 text-sm my-8">No events found for this date.</p>
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
  // State to track whether to show "Not Recorded" rows
  const [showNotRecorded, setShowNotRecorded] = React.useState(true);

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

  // Helper function to check if an event has a recorded signal
  const hasRecordedSignal = (event: Event) => {
    const eventType = event.type || event.event_type;

    // Check for buyer_intent (for Meetings)
    if (eventType === 'Meeting' && event.buyer_intent && event.buyer_intent !== 'N/A' && event.buyer_intent !== 'Not Available') {
      return true;
    }

    // Check for sentiment (for Emails)
    if (event.sentiment && event.sentiment !== 'Unknown' && event.sentiment !== 'Not Available') {
      const sentimentLower = event.sentiment.toLowerCase();
      if (['positive', 'positive signal', 'negative', 'negative signal', 'neutral'].includes(sentimentLower)) {
        return true;
      }
    }

    return false;
  };

  // Filter events based on active filters and "Not Recorded" toggle
  const filteredEvents = sortedEvents.filter(event => {
    const eventType = event.type || event.event_type;
    const typeFilterPassed = eventType ? activeFilters[eventType] || false : false;

    if (!typeFilterPassed) return false;

    // If showNotRecorded is false, filter out events without recorded signals
    if (!showNotRecorded && !hasRecordedSignal(event)) {
      return false;
    }

    return true;
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
    <div className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Deal Logs</h3>
        
        {/* Filter controls */}
        <div className="flex flex-wrap gap-2 items-center">
          {Object.keys(activeFilters).map(eventType => (
            <button
              key={eventType}
              onClick={() => toggleFilter(eventType)}
              className={`px-2.5 py-1 text-xs rounded transition-all ${
                activeFilters[eventType]
                  ? `${getEventTypeBackgroundColor(eventType)} font-medium shadow-sm`
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span className={activeFilters[eventType] ? getEventTypeColor(eventType) : ''}>
                {eventType}
              </span>
              <span className="ml-1.5 opacity-60">
                {sortedEvents.filter(e => e.type === eventType).length}
              </span>
            </button>
          ))}

          {/* Separator */}
          <div className="h-4 w-px bg-gray-300"></div>

          {/* Show/Hide Not Recorded toggle */}
          <button
            onClick={() => setShowNotRecorded(!showNotRecorded)}
            className={`px-2.5 py-1 text-xs rounded transition-all ${
              showNotRecorded
                ? 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                : 'bg-purple-100 text-purple-700 font-medium shadow-sm'
            }`}
          >
            {showNotRecorded ? 'Hide' : 'Show'} Not Recorded
          </button>
        </div>
      </div>
      
      {/* Dynamic height container - fits content up to 5 rows, then scrolls */}
      <div className={`${filteredEvents.length > 5 ? 'max-h-[500px] overflow-y-auto' : ''} border border-gray-100 rounded-lg`}>
        {/* Header row */}
        <div className="sticky top-0 bg-gray-50 border-b border-gray-200 p-4 grid grid-cols-12 gap-4 font-semibold text-gray-600">
          <div className="col-span-2">Date</div>
          <div className="col-span-2">Event</div>
          <div className="col-span-2">Signal</div>
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
                    isSelected ? 'bg-blue-50 border-l-4 border-blue-400' : ''
                  }`}
                  onClick={() => handleRowClick(event, index)}
                  data-deal-log-row="true"
                >
                  <div className="grid grid-cols-12 gap-4">
                    {/* Date */}
                    <div className="col-span-2">
                      <div className="flex flex-col">
                        <span className={`font-mono ${
                          eventDate && isFutureDate(eventDate) ? 'text-blue-600 font-medium' : 'text-gray-500'
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
                        {eventDate && !isFutureDate(eventDate) && (
                          <span className="text-xs text-gray-400 font-bold mt-0.5">
                            {(() => {
                              const dateObj = new Date(eventDate);
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              dateObj.setHours(0, 0, 0, 0);

                              const diffTime = today.getTime() - dateObj.getTime();
                              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                              if (diffDays === 0) return 'Today';
                              if (diffDays === 1) return '1 day ago';
                              return `${diffDays} days ago`;
                            })()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Event Type */}
                    <div className="col-span-2">
                      <span className={`font-medium ${getEventTypeColor(eventType)}`}>
                        {eventType || 'Unknown'}
                      </span>
                    </div>

                    {/* Intent/Sentiment */}
                    <div className="col-span-2">
                      {(() => {
                        let displayValue = '';
                        let chipColor = '';

                        // Check for buyer_intent first (for Meetings)
                        if (eventType === 'Meeting' && event.buyer_intent && event.buyer_intent !== 'N/A' && event.buyer_intent !== 'Not Available') {
                          displayValue = event.buyer_intent === 'Likely to buy' ? 'Positive Signal' :
                                        event.buyer_intent === 'Less likely to buy' ? 'Negative Signal' : event.buyer_intent;
                          chipColor = event.buyer_intent === 'Likely to buy' || event.buyer_intent === 'Very likely to buy'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : event.buyer_intent === 'Less likely to buy'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
                        }
                        // Check for sentiment (for Emails)
                        else if (event.sentiment && event.sentiment !== 'Unknown' && event.sentiment !== 'Not Available') {
                          const sentimentLower = event.sentiment.toLowerCase();
                          if (['positive', 'positive signal', 'negative', 'negative signal', 'neutral'].includes(sentimentLower)) {
                            displayValue = event.sentiment;
                            chipColor = sentimentLower === 'positive' || sentimentLower === 'positive signal'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : sentimentLower === 'negative' || sentimentLower === 'negative signal'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
                          }
                        }

                        // Return appropriate chip
                        if (displayValue) {
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${chipColor}`}>
                              {displayValue}
                            </span>
                          );
                        } else {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                              Not Recorded
                            </span>
                          );
                        }
                      })()}
                    </div>

                    {/* Details */}
                    <div className="col-span-6">
                      <span className="text-gray-900 dark:text-white">
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

const getLatestEventDate = (timelineData: TimelineData | null): string | null => {
  if (!timelineData || !timelineData.events || !Array.isArray(timelineData.events) || timelineData.events.length === 0) {
    return null;
  }

  // Filter events with valid date_str and sort in reverse chronological order
  const sortedEvents = timelineData.events
    .filter(event => event.date_str)
    .sort((a, b) => {
      const dateA = new Date(a.date_str!);
      const dateB = new Date(b.date_str!);
      return dateB.getTime() - dateA.getTime(); // Reverse chronological
    });

  // Return the most recent date or null if no valid dates
  return sortedEvents.length > 0 ? sortedEvents[0].date_str! : null;
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
          // REMOVED: setLoadingMessage
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
    // REMOVED: setLoadingMessage
    
    // Ensure we have a valid deal name
    if (!selectedDealRef.current?.name) {
      console.error('No selected deal name available for contacts fetch');
      return null;
    }

    const url = `${API_CONFIG.getApiPath('/contacts-and-champion')}?dealName=${encodeURIComponent(selectedDealRef.current.name)}&date=${encodeURIComponent(date)}`;
    
    const response = await makeApiCall(url);
    
    if (response) {
      // REMOVED: setLoadingMessage
      const data = await response.json();
      
      // Validate the response data
      if (!data || typeof data !== 'object') {
        console.error('Invalid response format for contacts:', data);
        // REMOVED: setLoadingMessage
        return null;
      }
      
      // Validate required fields
      if (!Array.isArray(data.contacts)) {
        console.error('Missing or invalid contacts array in response:', data);
        // REMOVED: setLoadingMessage
        return null;
      }
      
      // Only update state if we're still working with the same deal
      if (selectedDealRef.current?.name) {
        // REMOVED: setLoadingMessage
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
        // REMOVED: setLoadingMessage
      } else {
        console.error('Error fetching meeting contacts:', {
          error: error.message,
          subject,
          date,
          dealName: selectedDealRef.current?.name,
          stack: error.stack
        });
        // REMOVED: setLoadingMessage
      }
    }
    return null;
  }
}, [makeApiCall, meetingContacts]);

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
    // REMOVED: setLoadingStage
    setLoadingError(false);
    // REMOVED: setLoadingMessage
    
    try {
      
      // Fetch activities count and deal info in parallel
      // REMOVED: setLoadingMessage
      // Fetch all data in parallel for faster loading
      // REMOVED: setLoadingMessage
      const [count, response] = await Promise.all([
        fetchActivitiesCount(dealToUse.name),
        makeApiCall(`${API_CONFIG.getApiPath('/deal-timeline')}?dealName=${encodeURIComponent(dealToUse.name)}`)
        // dealInfo now fires independently via useEffect
      ]);
      
      if (response) {
        // REMOVED: setLoadingMessage
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
            // REMOVED: setLoadingMessage
            
            // Process meetings sequentially with a delay between each
            let completedCount = 0;
            for (const event of meetingEvents) {
              if (event.date_str && selectedDealRef.current?.name === dealToUse.name) {
                try {
                  // Add a small delay between requests to prevent overwhelming the server
                  await new Promise(resolve => setTimeout(resolve, 100));
                  completedCount++;
                  // REMOVED: setLoadingMessage
                  await fetchMeetingContacts(event.subject || '', event.date_str);
                } catch (error) {
                  if (error instanceof Error && error.message.includes('409')) {
                  } else {
                    console.error('[Timeline] Error fetching meeting contacts:', error);
                    // REMOVED: setLoadingMessage
                  }
                }
              }
            }
            // REMOVED: setLoadingMessage
            setLoadingChampions(false);
          } else {
            // REMOVED: setLoadingMessage
          }
        }
      }
    } catch (error) {
      console.error('[Timeline] Error fetching timeline:', error);
      setLoadingError(true);
      // REMOVED: setLoadingMessage
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
  console.log('[handleDealChange] ===== DEAL CARD CLICKED =====', new Date().toISOString());
  const deal = selectedOption ? {
    id: selectedOption.value,
    name: selectedOption.label,
    createdate: '',
    owner: ''
  } : null;

  console.log('[handleDealChange] Deal:', deal?.name);

  // If we're selecting the same deal, don't do anything
  if (deal?.id === currentDealId) {
    console.log('[handleDealChange] Same deal selected, returning');
    return;
  }

  console.log('[handleDealChange] Cleaning up state');
  // Clean up previous state
  cleanupState();
  setMeetingContacts({}); // Clear meeting contacts when changing deals


  console.log('[handleDealChange] Updating state with new deal');
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
  // REMOVED: autoload parameter - no longer needed with modular API system
  window.history.pushState({}, '', url.toString());

  // Data fetching is now handled by independent useEffect API handlers
  // No need to call handleGetTimeline here - the modular API system handles it
  console.log('[handleDealChange] Deal change complete. Independent API handlers will fire.');
}, [updateState, cleanupState, currentDealId]);

// Add new function to fetch concerns
const fetchConcerns = useCallback(async (dealName: string) => {
  if (!dealName) return;

  console.log('[fetchConcerns] Starting at:', new Date().toISOString());
  setLoadingConcerns(true);

  try {
    // Call backend directly like other working APIs
    const response = await makeApiCall(`${API_CONFIG.getApiPath('/get-concerns')}?dealName=${encodeURIComponent(dealName)}`);

    if (response) {
      const data = await response.json();
      setConcerns(Array.isArray(data) ? data : []);
      console.log('[fetchConcerns] Completed at:', new Date().toISOString());
    }
  } catch (error) {
    console.error('[fetchConcerns] Error:', error);
    setConcerns([]);
  } finally {
    setLoadingConcerns(false);
  }
}, [makeApiCall]);

// Update handleRefresh to refresh all data including champions
const handleRefresh = useCallback(() => {
  if (selectedDealRef.current) {
    // REMOVED: setLoadingMessage
    
    // Reset all state
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
    // REMOVED: setLoadingStage
    setLoadingError(false);
    
    // Clear chart data
    setChartData([]);

    // Trigger all API handlers to re-fetch by temporarily clearing and resetting selectedDeal
    const currentDeal = selectedDealRef.current;
    updateState('dealTimeline.selectedDeal', null);
    setTimeout(() => {
      updateState('dealTimeline.selectedDeal', currentDeal);
    }, 10);
  } else {
    setIsInitialLoad(true);
    // REMOVED: setLoadingMessage
  }
}, [cleanupState, updateState]);

  // Concerns are now fetched in parallel with other secondary data (see consolidated useEffect below)





// Update the effect that fetches champions to be more robust
// Effect to automatically fetch champions after timeline loads
useEffect(() => {
  if (!timelineData?.events || !Array.isArray(timelineData.events) || !selectedDeal?.name || isUnmounting) {
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

// ========================================================================
// MODULAR API CALL SYSTEM - Each component has independent API handler
// ========================================================================

// API Handler 1: Deal Info (for header banner)
useEffect(() => {
  if (!selectedDeal?.name) return;

  const dealName = selectedDeal.name;
  console.log('[API-DealInfo] ===== API HANDLER 1 TRIGGERED =====');
  console.log('[API-DealInfo] Fetching for:', dealName);
  console.log('[API-DealInfo] Timestamp:', new Date().toISOString());

  // Clear previous data immediately for new deal
  setDealInfo(null);

  // Fire API call
  fetchDealInfo(dealName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDeal?.name]);

// API Handler 2: Company Overview (for Latest Activity section)
useEffect(() => {
  if (!selectedDeal?.name) return;

  const dealName = selectedDeal.name;
  console.log('[API-CompanyOverview] Fetching for:', dealName);

  // Clear previous data immediately for new deal
  setCompanyOverview(null);

  // Fire API call
  fetchCompanyOverview(dealName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDeal?.name]);

// API Handler 3: Stakeholders (for Stakeholders section)
useEffect(() => {
  if (!selectedDeal?.name) return;

  const dealName = selectedDeal.name;
  console.log('[API-Stakeholders] Fetching for:', dealName);

  // Don't clear stakeholders here - let fetchStakeholders handle it
  // This prevents clearing cached data that loads instantly

  // Fire API call
  fetchStakeholders(dealName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDeal?.name]);

// API Handler 4: Timeline Data (for Deal Logs section)
useEffect(() => {
  if (!selectedDeal?.name) return;
  const dealName = selectedDeal.name;

  console.log('[API-Timeline] Fetching for:', dealName);

  // Clear previous timeline data immediately for new deal
  updateState('dealTimeline.activities', { events: [], start_date: '', end_date: '' });
  setMeetingContacts({});
  setChartData([]);
  updateState('dealTimeline.loading', true);

  const fetchTimeline = async () => {
    try {
      // Fetch timeline and activities count in parallel
      const [count, response] = await Promise.all([
        fetchActivitiesCount(dealName),
        makeApiCall(`${API_CONFIG.getApiPath('/deal-timeline')}?dealName=${encodeURIComponent(dealName)}`)
      ]);

      if (response && selectedDeal?.name === dealName) {
        const data = await response.json();

        if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
          setChartData([]);
          updateState('dealTimeline.activities', { events: [], start_date: '', end_date: '' });
          updateState('dealTimeline.lastFetched', Date.now());
          updateState('dealTimeline.loading', false);
          return;
        }

        updateState('dealTimeline.activities', data);
        updateState('dealTimeline.lastFetched', Date.now());

        // Process meeting contacts sequentially
        const meetingEvents = data.events.filter((event: Event) => event.type === 'Meeting');
        if (meetingEvents.length > 0) {
          setLoadingChampions(true);

          for (const event of meetingEvents) {
            if (event.date_str && selectedDeal?.name === dealName) {
              try {
                await new Promise(resolve => setTimeout(resolve, 100));
                await fetchMeetingContacts(event.subject || '', event.date_str);
              } catch (error) {
                if (!(error instanceof Error && error.message.includes('409'))) {
                  console.error('[Timeline] Error fetching meeting contacts:', error);
                }
              }
            }
          }

          setLoadingChampions(false);
        }

        updateState('dealTimeline.loading', false);
      }
    } catch (error) {
      console.error('[API-Timeline] Error:', error);
      updateState('dealTimeline.error', 'Failed to load timeline data.');
      updateState('dealTimeline.loading', false);
      setChartData([]);
    }
  };

  fetchTimeline();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDeal?.name]);

// API Handler 5: Concerns (for Concerns section)
useEffect(() => {
  if (!selectedDeal?.name) return;

  const dealName = selectedDeal.name;
  console.log('[API-Concerns] Fetching for:', dealName);

  // Clear previous data immediately for new deal
  setConcerns([]);

  // Fire API call
  fetchConcerns(dealName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedDeal?.name]);



// REMOVED: This was conflicting with API Handler 3 and clearing stakeholders after cache loaded
// API Handler 3 now handles fetching stakeholders when deal changes

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
      
      // Simple toggle: if owner is selected, remove it; if not selected, add it
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
    <div className="flex h-screen bg-gray-50" suppressHydrationWarning>
      {/* Sidebar */}
      <div className={`${isSidebarCollapsed ? 'w-0' : 'w-80'} bg-white border-r border-gray-100 flex flex-col transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0`}>
        {/* Search bar */}
        <div className="p-6 border-b border-gray-50">
          <div className="relative">
            <input
              type="text"
              placeholder="Search deals..."
              value={dealSearchTerm}
              onChange={(e) => {
                setDealSearchTerm(e.target.value);
              }}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-gray-50"
            />
            <svg
              className="absolute left-3 top-3 h-4 w-4 text-gray-400"
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
        <div className="px-6 py-4 border-b border-gray-50 bg-white">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 mb-4">
            <button
              onClick={() => setActiveFilterTab('stages')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeFilterTab === 'stages'
                  ? 'border-b-2 border-blue-400 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Stages
            </button>
            <button
              onClick={() => setActiveFilterTab('owners')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeFilterTab === 'owners'
                  ? 'border-b-2 border-blue-400 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Owners
            </button>
            <button
              onClick={() => setActiveFilterTab('bookmarks')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeFilterTab === 'bookmarks'
                  ? 'border-b-2 border-blue-400 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Bookmarks
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
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
              <>
                {/* Select All/None buttons */}
                <div className="w-full flex gap-2 mb-2 pb-2 border-b border-gray-200">
                  <button
                    onClick={() => setSelectedOwners(new Set(uniqueOwners))}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors font-medium"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedOwners(new Set())}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium"
                  >
                    None
                  </button>
                </div>
                
                {/* Owner filters */}
                {uniqueOwners.map((owner) => {
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
                })}
              </>
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
          <div className="p-6">
            <div className="mb-4 space-y-3 overflow-visible">
              {/* Title row */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-600">
                  {activeFilterTab === 'bookmarks' ? 'Bookmarked Deals' : 'All Deals'}
                </h3>
                <span className="text-xs text-gray-400 font-medium">
                  {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              {/* Controls row */}
              <div className="flex items-center gap-3 overflow-visible">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'created' | 'name' | 'activities')}
                    className="px-2 py-1 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  >
                    <option value="created">Created</option>
                    <option value="name">Name</option>
                    <option value="activities">Activities</option>
                  </select>
                </div>

                {activeFilterTab !== 'bookmarks' && (
                  <div className="relative inline-block group">
                    <label className="flex items-center gap-px cursor-pointer">
                      <span className="text-xs text-gray-600 group-hover:text-gray-800 transition-colors">
                        Active Deals
                      </span>
                      <div
                        onClick={() => setShowOnlyActiveDeals(!showOnlyActiveDeals)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          showOnlyActiveDeals
                            ? 'bg-blue-500'
                            : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            showOnlyActiveDeals ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </label>
                    <div className="invisible group-hover:visible absolute z-50 -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      Deals with 1 or more Activities
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {filteredDeals.map(deal => {
                const daysPassed = getDaysPassed(deal);
                const isSelected = selectedDeal?.id === deal.id;
                const isBookmarked = bookmarkedDeals.has(deal.id);
                return (
                  <div
                    key={deal.id}
                    className={`flex items-start justify-between p-4 rounded-lg transition-all duration-200 cursor-pointer border ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                        : 'bg-white border-gray-100 hover:bg-gray-50 hover:shadow-sm'
                    }`}
                    onClick={() => {
                      if (deal.name) {
                        // Use the unified deal change handler
                        handleDealChange({ value: deal.id, label: deal.name });
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate mb-1 ${
                        isSelected ? 'text-blue-700' : 'text-gray-900 dark:text-white'
                      }`}>
                        {deal.name}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                        <div>Stage: {deal.stage}</div>
                        <div>Owner: {deal.owner || 'NA'}</div>
                        <div>Created: {formatDate(deal.createdate)}</div>
                        <div>Activities: <span className={deal.activities && deal.activities >= 15 ? 'text-orange-600 font-medium' : ''}>
                          {deal.activities || 0}
                        </span></div>
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
        <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 rounded-lg bg-white hover:bg-gray-50 transition-colors border border-gray-200 flex items-center justify-center shadow-sm"
            title={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-4 w-4 text-gray-600 transition-transform duration-200 ${isSidebarCollapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          {selectedDeal && (
            <div className="flex items-center">
              <span className="text-2xl font-bold text-gray-800 dark:text-white">{selectedDeal.name}</span>
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center shadow-sm"
            disabled={loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
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
      
      {/* REMOVED: Full-page loading screen - components now show immediately with individual loading states */}
      {loadingError && !selectedDeal ? (
        <div className="text-center py-10">
          <div className="text-red-500 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mb-4">Encountered an error while loading. Try again?</p>
          <button
            onClick={() => handleRefresh()}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
            disabled={loading}
          >
            Load Timeline
          </button>
        </div>
      ) : selectedDeal ? (
        <div className="space-y-6">
          {/* Deal Info Banner - Always show, with loading state if needed */}
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Activities</span>
                {dealInfo ? (
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">
                    {dealInfo.activityCount || 0}
                  </div>
                ) : (
                  <div className="animate-pulse h-5 w-24 bg-gray-200 rounded"></div>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Owner</span>
                {dealInfo ? (
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">{dealInfo.dealOwner}</div>
                ) : (
                  <div className="animate-pulse h-5 w-32 bg-gray-200 rounded"></div>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Stage</span>
                {dealInfo ? (
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">{dealInfo.dealStage}</div>
                ) : (
                  <div className="animate-pulse h-5 w-28 bg-gray-200 rounded"></div>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Last Touch</span>
                {dealInfo ? (
                  (() => {
                    const latestDate = getLatestEventDate(timelineData);
                    return latestDate ? (
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">{formatDate(latestDate)}</div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          calculateDaysPassed(latestDate) > 10
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {calculateDaysPassed(latestDate)}d
                        </span>
                      </div>
                    ) : (
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">-</div>
                    );
                  })()
                ) : (
                  <div className="animate-pulse h-5 w-24 bg-gray-200 rounded"></div>
                )}
              </div>
            </div>
          </div>

          {/* Latest Activity Section */}
          <div className={`p-6 rounded-lg shadow-sm border transition-all duration-500 ${
            loadingOverview
              ? 'bg-red-50 border-red-200 animate-pulse'
              : 'bg-white border-gray-100'
          }`}>
            <h3 className="font-semibold text-gray-700 dark:text-white mb-3 text-xl">Latest Activity</h3>
            {loadingOverview ? (
              <div className="flex items-center gap-2">
                <div className="relative flex items-center gap-1">
                  {/* Sparkle 1 */}
                  <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-[ping_1s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }}></span>
                  {/* Sparkle 2 */}
                  <span className="inline-block w-2 h-2 bg-purple-400 rounded-full animate-[ping_1s_ease-in-out_infinite]" style={{ animationDelay: '200ms' }}></span>
                  {/* Sparkle 3 */}
                  <span className="inline-block w-1.5 h-1.5 bg-pink-400 rounded-full animate-[ping_1s_ease-in-out_infinite]" style={{ animationDelay: '400ms' }}></span>
                  {/* Sparkle 4 */}
                  <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-[ping_1s_ease-in-out_infinite]" style={{ animationDelay: '600ms' }}></span>
                  {/* Sparkle 5 */}
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full animate-[ping_1s_ease-in-out_infinite]" style={{ animationDelay: '800ms' }}></span>
                </div>
                <span className="text-sm font-medium bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent animate-pulse">
                  Generating AI summary...
                </span>
              </div>
            ) : companyOverview ? (
              <div className="text-base text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm max-w-none prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-ul:my-3 prose-ul:ml-0 prose-li:my-1.5 prose-li:ml-0 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown>{formatAsBulletPoints(companyOverview)}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-base text-gray-400 italic">No latest activity available</p>
            )}
          </div>

          {/* Concerns Section */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-700 dark:text-white mb-4">Deal Insights</h3>
            {loadingConcerns ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="animate-pulse h-32 bg-gray-200 rounded-lg"></div>
                <div className="animate-pulse h-32 bg-gray-200 rounded-lg"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Positives Card */}
                {(() => {
                  // Check if there are any activities first
                  const hasActivities = timelineData?.events && timelineData.events.length > 0;

                  if (!hasActivities) {
                    // If no activities, show 0 positives
                    return (
                      <button
                        onClick={() => {
                          setSelectedConcern('positives');
                          setSelectedDate(null);
                          setSelectedEventId(null);
                          setIsDrawerOpen(true);
                        }}
                        className="p-6 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-all hover:shadow-md text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-green-800 text-lg">Positives</h4>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="text-3xl font-bold text-green-700 mb-1">0</div>
                        <div className="text-sm text-green-600">positive signals</div>
                      </button>
                    );
                  }

                  const processedConcerns = processConcernsArray(concerns);
                  const positiveEmails = timelineData?.events?.filter(e =>
                    (e.type === 'Incoming Email' || e.type === 'Outgoing Email') && e.sentiment === 'positive'
                  ).length || 0;
                  const buyingSignals = timelineData?.events?.filter(e =>
                    e.type === 'Meeting' && (e.buyer_intent === 'Likely to buy' || e.buyer_intent === 'Very likely to buy')
                  ).length || 0;
                  const hasDecisionMaker = stakeholders.some(s => s.potential_decision_maker);

                  const positivesCount =
                    (positiveEmails > 0 ? 1 : 0) +
                    buyingSignals +
                    (!processedConcerns.hasCompetitor ? 1 : 0) +
                    (!processedConcerns.hasPricingConcerns ? 1 : 0) +
                    (hasDecisionMaker ? 1 : 0);

                  return (
                    <button
                      onClick={() => {
                        setSelectedConcern('positives');
                        setSelectedDate(null);
                        setSelectedEventId(null);
                        setIsDrawerOpen(true);
                      }}
                      className="p-6 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-all hover:shadow-md text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-green-800 text-lg">Positives</h4>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-green-700 mb-1">{positivesCount}</div>
                      <div className="text-sm text-green-600">positive signals</div>
                    </button>
                  );
                })()}

                {/* Risks Card */}
                {(() => {
                  // Check if there are any activities first
                  const hasActivities = timelineData?.events && timelineData.events.length > 0;

                  if (!hasActivities) {
                    // If no activities, show 0 risks
                    return (
                      <button
                        onClick={() => {
                          setSelectedConcern('risks');
                          setSelectedDate(null);
                          setSelectedEventId(null);
                          setIsDrawerOpen(true);
                        }}
                        className="p-6 rounded-lg border-2 border-red-200 bg-red-50 hover:bg-red-100 transition-all hover:shadow-md text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-red-800 text-lg">Risks</h4>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div className="text-3xl font-bold text-red-700 mb-1">0</div>
                        <div className="text-sm text-red-600">risk factors</div>
                      </button>
                    );
                  }

                  const processedConcerns = processConcernsArray(concerns);
                  const lessLikelySignals = timelineData?.events?.filter(e =>
                    e.type === 'Meeting' && e.buyer_intent === 'Less likely to buy'
                  ).length || 0;
                  const hasDecisionMaker = stakeholders.some(s => s.potential_decision_maker);

                  const risksCount =
                    (!hasDecisionMaker ? 1 : 0) +
                    (processedConcerns.hasCompetitor ? 1 : 0) +
                    lessLikelySignals +
                    (processedConcerns.hasPricingConcerns ? 1 : 0);

                  return (
                    <button
                      onClick={() => {
                        setSelectedConcern('risks');
                        setSelectedDate(null);
                        setSelectedEventId(null);
                        setIsDrawerOpen(true);
                      }}
                      className="p-6 rounded-lg border-2 border-red-200 bg-red-50 hover:bg-red-100 transition-all hover:shadow-md text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-red-800 text-lg">Risks</h4>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="text-3xl font-bold text-red-700 mb-1">{risksCount}</div>
                      <div className="text-sm text-red-600">risk factors</div>
                    </button>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Stakeholders Section */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-700 dark:text-white mb-4">Stakeholders</h3>
            {loadingStakeholders ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ) : stakeholders.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto pr-1 space-y-4">
                {/* Decision Makers */}
                {stakeholders.filter(s => s.potential_decision_maker).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2.5 text-[10px] uppercase tracking-widest sticky top-0 bg-white pb-1 flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      Decision Makers
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {stakeholders
                        .filter(stakeholder => stakeholder.potential_decision_maker)
                        .map((stakeholder, index) => (
                          <div
                            key={index}
                            className="group relative p-2.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 hover:border-blue-300 hover:shadow-sm transition-all duration-200 cursor-default"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <span className="text-white text-[9px] font-bold leading-none">{getStakeholderDisplayName(stakeholder).charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(stakeholder.email);
                                    setCopiedStakeholderEmail(stakeholder.email);
                                    setTimeout(() => setCopiedStakeholderEmail(null), 1500);
                                  }}
                                  className="peer p-0.5 text-gray-300 hover:text-blue-500 rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                                <span className={`absolute bottom-full right-0 mb-1 px-1.5 py-0.5 text-[9px] font-medium rounded shadow-lg whitespace-nowrap pointer-events-none transition-opacity duration-150 ${
                                  copiedStakeholderEmail === stakeholder.email
                                    ? 'bg-green-600 text-white opacity-100'
                                    : 'bg-gray-800 text-white opacity-0 peer-hover:opacity-100'
                                }`}>
                                  {copiedStakeholderEmail === stakeholder.email ? 'Copied!' : 'Copy email'}
                                </span>
                              </div>
                            </div>
                            <div className="mt-1.5 min-w-0">
                              <div className="font-semibold text-gray-900 text-[11px] truncate leading-tight">{getStakeholderDisplayName(stakeholder)}</div>
                              {stakeholder.title && (
                                <div className="text-[10px] text-indigo-600/70 truncate mt-0.5 leading-tight">{stakeholder.title}</div>
                              )}
                              <div className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{stakeholder.email}</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Others */}
                {stakeholders.filter(s => !s.potential_decision_maker).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-400 mb-2.5 text-[10px] uppercase tracking-widest sticky top-0 bg-white pb-1">
                      Others
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {stakeholders
                        .filter(stakeholder => !stakeholder.potential_decision_maker)
                        .map((stakeholder, index) => (
                          <div
                            key={index}
                            className="group relative p-2.5 bg-white rounded-lg border border-gray-150 hover:border-gray-300 hover:shadow-sm transition-all duration-200 cursor-default"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center flex-shrink-0">
                                <span className="text-white text-[9px] font-bold leading-none">{getStakeholderDisplayName(stakeholder).charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(stakeholder.email);
                                    setCopiedStakeholderEmail(stakeholder.email);
                                    setTimeout(() => setCopiedStakeholderEmail(null), 1500);
                                  }}
                                  className="peer p-0.5 text-gray-300 hover:text-gray-500 rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                                <span className={`absolute bottom-full right-0 mb-1 px-1.5 py-0.5 text-[9px] font-medium rounded shadow-lg whitespace-nowrap pointer-events-none transition-opacity duration-150 ${
                                  copiedStakeholderEmail === stakeholder.email
                                    ? 'bg-green-600 text-white opacity-100'
                                    : 'bg-gray-800 text-white opacity-0 peer-hover:opacity-100'
                                }`}>
                                  {copiedStakeholderEmail === stakeholder.email ? 'Copied!' : 'Copy email'}
                                </span>
                              </div>
                            </div>
                            <div className="mt-1.5 min-w-0">
                              <div className="font-medium text-gray-800 text-[11px] truncate leading-tight">{getStakeholderDisplayName(stakeholder)}</div>
                              {stakeholder.title && (
                                <div className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{stakeholder.title}</div>
                              )}
                              <div className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{stakeholder.email}</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic">No stakeholders found</div>
            )}
          </div>

          {/* Deal Logs Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100">
            {!timelineData || loading ? (
              <div className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            ) : timelineData.events && timelineData.events.length > 0 ? (
              <DealLogs
                events={timelineData.events}
                activeFilters={activeEventFilters}
                onFilterChange={setActiveEventFilters}
                selectedEventId={selectedEventId}
                onRowClick={(date, eventId) => {
                  setSelectedDate(date);
                  setSelectedEventId(eventId);
                  setSelectedConcern(null);
                  setIsDrawerOpen(true);
                }}
              />
            ) : (
              <div className="p-6 text-center text-gray-500">
                No timeline events found
              </div>
            )}
          </div>

          {/* OTHER COMPONENTS STILL DISABLED */}
          {false && (
          <>
          {/* REMOVED: Latest Activity - now shown above */}
          {/* REMOVED: Stakeholders - now shown above between Latest Activity and Deal Logs */}

          {/* All components now shown above - this block kept for future use */}
          </>
          )}

          {/* End of disabled components */}
        </div>
      ) : null}

      {/* Remove this duplicate conditional */}
      {false && selectedDeal ? (
        <div className="text-center py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-3 text-lg font-medium text-gray-600">
            Loading timeline data for <b>{selectedDeal?.name}</b>...
          </p>
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


