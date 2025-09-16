'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { API_CONFIG } from '../utils/config';
import { parseBuyerIntentExplanation } from '../utils/buyerIntentParser';

interface Meeting {
  event_id: string;
  deal_id: string;
  subject: string;
  event_date: string;
  sentiment: string;
  buyer_intent: string;
  buyer_intent_explanation?: any;
  engagement_id?: string;
  deal_stage: string;
  owner?: string;
}

interface LatestMeetingsProps {
  browserId: string;
  isInitialized: boolean;
}

const LatestMeetings: React.FC<LatestMeetingsProps> = ({ browserId, isInitialized }) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<number>(3); // Changed default to 3 (Last 3 days)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());
  const [selectedSignals, setSelectedSignals] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loadingInsights, setLoadingInsights] = useState<Set<string>>(new Set());
  const [processedWithoutInsights, setProcessedWithoutInsights] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Feature flag to disable buyer intent explanation fetching if CORS issues persist
  const ENABLE_BUYER_INTENT_ENHANCEMENT = true; // Re-enabled to restore insights functionality

  // Function to save meetings data to localStorage
  const saveMeetingsToStorage = useCallback((days: number, data: Meeting[]) => {
    try {
      const key = `latestMeetings_${days}`;
      const storageData = {
        data,
        timestamp: Date.now(),
        days
      };
      localStorage.setItem(key, JSON.stringify(storageData));
      console.log(`💾 Saved meetings data to localStorage for ${days} days`);
    } catch (error) {
      console.error('Error saving meetings data to localStorage:', error);
    }
  }, []);

  // Function to load meetings data from localStorage
  const loadMeetingsFromStorage = useCallback((days: number) => {
    try {
      const key = `latestMeetings_${days}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const storageData = JSON.parse(stored);
        const isExpired = Date.now() - storageData.timestamp > 300000; // 5 minutes
        if (!isExpired) {
          console.log(`📂 Loaded meetings data from localStorage for ${days} days`);
          return storageData.data;
        } else {
          console.log(`⏰ Cached meetings data expired for ${days} days`);
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Error loading meetings data from localStorage:', error);
    }
    return null;
  }, []);

  // Utility function for making API calls with session management
  const makeApiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!isInitialized) {
      console.log('Waiting for browser ID initialization...');
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
      console.log('Making API call:', {
        url,
        method: options.method || 'GET',
        headers,
        browserId,
        localStorage: {
          browserId: localStorage.getItem('browserId'),
          sessionId: localStorage.getItem('sessionId')
        }
      });
      
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
  }, [browserId, isInitialized]);

  // Function to fetch latest meetings
  const fetchLatestMeetings = useCallback(async (days: number, forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching latest meetings for days:', days, forceRefresh ? '(forced refresh)' : '');
      
      // Check localStorage first (unless force refresh)
      if (!forceRefresh) {
        const cachedData = loadMeetingsFromStorage(days);
        if (cachedData && cachedData.length > 0) {
          console.log('Using cached data for days:', days);
          
          // Set cached data immediately for fast loading
          setMeetings(cachedData);
          setLoading(false);
          
          // Check if cached data needs enhancement and do it in background (if enabled)
          if (ENABLE_BUYER_INTENT_ENHANCEMENT) {
            const meetingsNeedingEnhancement = cachedData.filter((meeting: Meeting) => 
              !meeting.buyer_intent_explanation || meeting.buyer_intent_explanation === 'N/A'
            );
            
            if (meetingsNeedingEnhancement.length > 0) {
              // Immediately mark meetings that need enhancement as loading
              setLoadingInsights(prev => {
                const newSet = new Set(prev);
                meetingsNeedingEnhancement.forEach((meeting: Meeting) => newSet.add(meeting.event_id));
                return newSet;
              });
              
              console.log('Enhancing cached data in background...');
              
              // First enhance with owners, then with explanations
              enhanceMeetingsWithOwners(cachedData).then(ownerEnhancedData => {
                return enhanceMeetingsWithExplanations(ownerEnhancedData);
              }).then(fullyEnhancedData => {
                setMeetings(fullyEnhancedData);
                // Update cache with enhanced data
                saveMeetingsToStorage(days, fullyEnhancedData);
              }).catch(error => {
                console.error('Error enhancing cached data:', error);
                // Keep the cached data even if enhancement fails
              });
            }
          }
          
          return;
        }
      }
      
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/get-latest-meetings')}?days=${days}`);
      
      if (response) {
        const data = await response.json();
        console.log('Latest meetings data fetched:', data ? `${data.length} meetings` : 'no data');
        
        // Sort by event_date descending
        const sortedMeetings = Array.isArray(data) ? data.sort((a: Meeting, b: Meeting) => 
          new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
        ) : [];
        
        // Debug: Log the first meeting to see what fields are available
        if (sortedMeetings.length > 0) {
          console.log('Sample meeting data:', sortedMeetings[0]);
          console.log('Available fields:', Object.keys(sortedMeetings[0]));
        }
        
        // Set meetings immediately for fast loading
        setMeetings(sortedMeetings);
        
        // Save basic meetings data to localStorage
        saveMeetingsToStorage(days, sortedMeetings);
        
        // Enhance meetings with buyer intent explanations in the background (if enabled)
        if (ENABLE_BUYER_INTENT_ENHANCEMENT) {
          // Immediately mark meetings that need enhancement as loading
          const meetingsNeedingEnhancement = sortedMeetings.filter(meeting => 
            !meeting.buyer_intent_explanation || meeting.buyer_intent_explanation === 'N/A'
          );
          
          if (meetingsNeedingEnhancement.length > 0) {
            setLoadingInsights(prev => {
              const newSet = new Set(prev);
              meetingsNeedingEnhancement.forEach((meeting: Meeting) => newSet.add(meeting.event_id));
              return newSet;
            });
          }
          
          console.log('Enhancing meetings with owner and buyer intent information in background...');
          
          // First enhance with owners, then with explanations
          enhanceMeetingsWithOwners(sortedMeetings).then(ownerEnhancedMeetings => {
            return enhanceMeetingsWithExplanations(ownerEnhancedMeetings);
          }).then(fullyEnhancedMeetings => {
            setMeetings(fullyEnhancedMeetings);
            // Update cache with enhanced data
            saveMeetingsToStorage(days, fullyEnhancedMeetings);
          }).catch(error => {
            console.error('Error enhancing meetings:', error);
            // Keep the basic meetings even if enhancement fails
          });
        }
      }
    } catch (error) {
      console.error('Error fetching latest meetings:', error);
      setError('Failed to load latest meetings');
    } finally {
      setLoading(false);
    }
  }, [makeApiCall, loadMeetingsFromStorage, saveMeetingsToStorage]);

  // Fetch data when component mounts or timeframe changes
  useEffect(() => {
    if (isInitialized) {
      // Clear any existing loading states when fetching new data
      setLoadingInsights(new Set());
      setProcessedWithoutInsights(new Set());
      fetchLatestMeetings(timeframe, false);
    }
  }, [isInitialized, timeframe, fetchLatestMeetings]);

  // Cleanup loading states on unmount
  useEffect(() => {
    return () => {
      setLoadingInsights(new Set());
      setProcessedWithoutInsights(new Set());
    };
  }, []);

  // Format date
  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      return dateStr;
    }
  };

  // Get sentiment color
  const getSentimentColor = (sentiment: string): string => {
    const lowerSentiment = sentiment.toLowerCase();
    if (lowerSentiment.includes('negative') || lowerSentiment.includes('bad')) {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    } else if (lowerSentiment.includes('positive') || lowerSentiment.includes('good')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    } else {
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  // Get buyer intent badge
  const getBuyerIntentBadge = (intent: string) => {
    const lowerIntent = intent.toLowerCase();
    let badgeText = intent;
    let badgeColor = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

    // Handle specific buyer intent values to match Deal Logs display
    if (lowerIntent === 'very likely to buy') {
      badgeText = 'Very Likely to Buy';
      badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    } else if (lowerIntent === 'likely to buy') {
      badgeText = 'Positive Signal'; // Match Deal Logs display
      badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    } else if (lowerIntent === 'less likely to buy') {
      badgeText = 'Negative Signal';
      badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    } else if (lowerIntent === 'neutral' || lowerIntent.includes('neutral')) {
      badgeText = 'Neutral';
      badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    } else if (lowerIntent.includes('unable') || lowerIntent.includes('determine')) {
      badgeText = 'Unable to Determine';
      badgeColor = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }

    return { text: badgeText, color: badgeColor };
  };

  // Add color mapping for stages with distinct colors
  const getStageColor = (stage: string): { bg: string; text: string; border: string } => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      'Closed Won': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
      'Closed Lost': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
      'Closed Marketing Nurture': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
      'Closed Active Nurture': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
      'Assessment': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
      'Waiting for Signature': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
      '1. Sales Qualification': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
      '2. Needs Analysis & Solution Mapping': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
      '3. Technical Validation': { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
      '4. Proposal & Negotiation': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
      '0. Identification': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
      'Renew/Closed Won': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' }
    };
    return colors[stage] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  };

  // Get initials for a stage name (same as DealTimeline)
  const getStageInitials = (stage: string): string => {
    return stage
      .split(' ')
      .map(word => word[0])
      .join('')
      .replace(/[0-9]/g, '') // Remove any numbers
      .toUpperCase();
  };

  // Handle stage filter toggle (same behavior as DealTimeline)
  const toggleStageFilter = (stage: string) => {
    setSelectedStages(prev => {
      const newSet = new Set(prev);
      
      // If this is the only selected stage, deselect it to show all stages
      if (newSet.size === 1 && newSet.has(stage)) {
        return new Set();
      }
      
      if (newSet.has(stage)) {
        newSet.delete(stage);
      } else {
        newSet.add(stage);
      }
      
      return newSet;
    });
  };

  // Handle signal filter toggle
  const toggleSignalFilter = (signal: string) => {
    setSelectedSignals(prev => {
      const newSet = new Set(prev);
      
      // If this is the only selected signal, deselect it to show all signals
      if (newSet.size === 1 && newSet.has(signal)) {
        return new Set();
      }
      
      if (newSet.has(signal)) {
        newSet.delete(signal);
      } else {
        newSet.add(signal);
      }
      
      return newSet;
    });
  };

  // Get signal type from buyer_intent
  const getSignalType = (buyerIntent: string): string => {
    const lowerIntent = buyerIntent.toLowerCase();
    if (lowerIntent === 'very likely to buy' || lowerIntent === 'likely to buy') {
      return 'positive';
    } else if (lowerIntent === 'less likely to buy') {
      return 'negative';
    } else {
      return 'neutral';
    }
  };

  // Get signal color
  const getSignalColor = (signalType: string): { bg: string; text: string; border: string } => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      'positive': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
      'negative': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
      'neutral': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' }
    };
    return colors[signalType] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedStages(new Set());
    setSelectedSignals(new Set());
    setSelectedDate('');
  };

  // Handle date filter from chart click
  const handleDateFilter = (date: string) => {
    console.log('📅 Date clicked:', date);
    setSelectedDate(date);
  };

  // Filter meetings based on search term, stage filter, signal filter, and date filter
  const filteredMeetings = meetings.filter(meeting => {
    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = meeting.subject.toLowerCase().includes(searchLower) || 
                           meeting.deal_id.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }
    
    // Apply stage filter
    if (selectedStages.size > 0) {
      if (!selectedStages.has(meeting.deal_stage)) return false;
    }
    
    // Apply signal filter
    if (selectedSignals.size > 0) {
      const signalType = getSignalType(meeting.buyer_intent);
      if (!selectedSignals.has(signalType)) return false;
    }
    
    // Apply date filter
    if (selectedDate.trim()) {
      const meetingDate = new Date(meeting.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (meetingDate !== selectedDate) return false;
    }
    
    return true;
  });

  // Navigate to deal timeline
  const navigateToDealTimeline = (dealId: string) => {
    const encodedDealId = encodeURIComponent(dealId);
    const url = `/deal-timeline?dealName=${encodedDealId}&autoload=true`;
    window.open(url, '_blank');
  };

  // Open Gong call
  const openGongCall = (eventId: string) => {
    if (eventId.startsWith('gong_')) {
      window.open(`https://app.gong.io/call/${eventId}`, '_blank');
    }
  };

  // Handle timeframe change
  const handleTimeframeChange = (newTimeframe: number) => {
    setTimeframe(newTimeframe);
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchLatestMeetings(timeframe, true); // Force refresh from backend
  };

  // Handle modal open
  const handleOpenModal = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setIsModalOpen(true);
  };

  // Handle modal close
  const handleCloseModal = () => {
    setSelectedMeeting(null);
    setIsModalOpen(false);
  };

  // Navigation functions for modal
  const getCurrentMeetingIndex = useCallback(() => {
    if (!selectedMeeting) return -1;
    return filteredMeetings.findIndex(meeting => meeting.event_id === selectedMeeting.event_id);
  }, [selectedMeeting, filteredMeetings]);

  const navigateToPreviousMeeting = useCallback(() => {
    const currentIndex = getCurrentMeetingIndex();
    if (currentIndex > 0) {
      setSelectedMeeting(filteredMeetings[currentIndex - 1]);
    }
  }, [getCurrentMeetingIndex, filteredMeetings]);

  const navigateToNextMeeting = useCallback(() => {
    const currentIndex = getCurrentMeetingIndex();
    if (currentIndex < filteredMeetings.length - 1) {
      setSelectedMeeting(filteredMeetings[currentIndex + 1]);
    }
  }, [getCurrentMeetingIndex, filteredMeetings]);

  const canNavigatePrevious = useCallback(() => {
    const currentIndex = getCurrentMeetingIndex();
    return currentIndex > 0;
  }, [getCurrentMeetingIndex]);

  const canNavigateNext = useCallback(() => {
    const currentIndex = getCurrentMeetingIndex();
    return currentIndex < filteredMeetings.length - 1;
  }, [getCurrentMeetingIndex, filteredMeetings]);

  // Memoized function to get chart data that updates when filteredMeetings changes
  const getChartData = useCallback(() => {
    console.log('🔄 getChartData called - filteredMeetings length:', filteredMeetings.length);
    console.log('🔍 Current filters:', { 
      searchTerm, 
      selectedStages: Array.from(selectedStages), 
      selectedSignals: Array.from(selectedSignals) 
    });
    
    const dateGroups: Record<string, { positive: number; negative: number; neutral: number }> = {};
    
    filteredMeetings.forEach(meeting => {
      const date = new Date(meeting.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (!dateGroups[date]) {
        dateGroups[date] = { positive: 0, negative: 0, neutral: 0 };
      }
      
      const signalType = getSignalType(meeting.buyer_intent);
      dateGroups[date][signalType as keyof typeof dateGroups[string]]++;
    });
    
    const chartData = Object.entries(dateGroups)
      .map(([date, signals]) => ({
        date,
        positive: signals.positive,
        negative: signals.negative,
        neutral: signals.neutral,
        // Add original date for sorting
        sortDate: filteredMeetings.find(m => new Date(m.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) === date)?.event_date
      }))
      .sort((a, b) => {
        // Sort by the original date
        if (a.sortDate && b.sortDate) {
          return new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime();
        }
        return 0;
      })
      .map(({ sortDate, ...rest }) => rest); // Remove sortDate after sorting
      
    console.log('📊 Chart data generated:', chartData);
    return chartData;
  }, [filteredMeetings, searchTerm, selectedStages, selectedSignals, selectedDate]);

  // Handle keyboard navigation in modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isModalOpen) return;
      
      switch (event.key) {
        case 'Escape':
          handleCloseModal();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (canNavigatePrevious()) {
            navigateToPreviousMeeting();
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (canNavigateNext()) {
            navigateToNextMeeting();
          }
          break;
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isModalOpen, canNavigatePrevious, canNavigateNext, navigateToPreviousMeeting, navigateToNextMeeting]);

  // Function to fetch deal owner information
  const fetchDealOwner = useCallback(async (dealId: string): Promise<string | null> => {
    try {
      console.log('🔍 Fetching owner for deal:', dealId);
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/deal-info')}?dealName=${encodeURIComponent(dealId)}`);
      if (response) {
        const data = await response.json();
        console.log('📊 Deal info response:', data);
        console.log('👤 Deal owner:', data?.dealOwner);
        return data?.dealOwner || null;
      }
    } catch (error) {
      console.error('❌ Error fetching deal owner for:', dealId, error);
    }
    return null;
  }, [makeApiCall]);

  // Function to enhance meetings with owner information
  const enhanceMeetingsWithOwners = useCallback(async (meetings: Meeting[]) => {
    console.log('🚀 Starting owner enhancement for', meetings.length, 'meetings');
    const BATCH_SIZE = 3; // Limit concurrent API calls
    const enhancedMeetings = [...meetings];
    
    // Process meetings in batches
    for (let i = 0; i < meetings.length; i += BATCH_SIZE) {
      const batch = meetings.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}, meetings ${i} to ${i + batch.length - 1}`);
      
      const batchPromises = batch.map(async (meeting, batchIndex) => {
        const actualIndex = i + batchIndex;
        
        // If meeting already has owner, skip it
        if (meeting.owner) {
          console.log(`⏭️ Skipping ${meeting.deal_id}, already has owner: ${meeting.owner}`);
          return;
        }
        
        try {
          console.log(`🔄 Fetching owner for meeting: ${meeting.deal_id}`);
          const owner = await fetchDealOwner(meeting.deal_id);
          enhancedMeetings[actualIndex] = {
            ...meeting,
            owner: owner || undefined
          };
          console.log(`✅ Enhanced meeting ${meeting.deal_id} with owner: ${owner || 'null'}`);
        } catch (error) {
          console.error(`❌ Error fetching owner for meeting ${meeting.deal_id}:`, error);
        }
      });
      
      // Wait for current batch to complete before starting next batch
      await Promise.all(batchPromises);
      
      // Add a small delay between batches to be gentle on the API
      if (i + BATCH_SIZE < meetings.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('🏁 Owner enhancement complete');
    return enhancedMeetings;
  }, [fetchDealOwner]);

  // Function to fetch buyer intent explanation for a specific meeting
  const fetchBuyerIntentExplanation = useCallback(async (dealId: string, eventId: string) => {
    try {
      // Use local Next.js API route instead of direct backend call to avoid CORS
      const response = await makeApiCall(`/api/hubspot/v2/deal-timeline?dealName=${encodeURIComponent(dealId)}`);
      if (response) {
        const data = await response.json();
        if (data.events && Array.isArray(data.events)) {
          // Find the specific meeting by event_id
          const meeting = data.events.find((event: any) => 
            event.event_id === eventId || event.id === eventId
          );
          return meeting?.buyer_intent_explanation || null;
        }
      }
    } catch (error) {
      // Handle CORS and other errors gracefully - don't let them break the component
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('CORS')) {
        console.warn('CORS error fetching buyer intent explanation - skipping enhancement for:', dealId);
      } else {
        console.warn('Error fetching buyer intent explanation for:', dealId, errorMessage);
      }
      // Return null instead of throwing to prevent component from breaking
    }
    return null;
  }, [makeApiCall]);

  // Function to enhance meeting data with buyer intent explanations (with concurrency limit)
  const enhanceMeetingsWithExplanations = useCallback(async (meetings: Meeting[]) => {
    const BATCH_SIZE = 3; // Limit concurrent API calls to avoid overwhelming the backend
    const enhancedMeetings = [...meetings];
    
    // Process meetings in batches to avoid too many concurrent requests
    for (let i = 0; i < meetings.length; i += BATCH_SIZE) {
      const batch = meetings.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (meeting, batchIndex) => {
        const actualIndex = i + batchIndex;
        
        // If meeting already has buyer_intent_explanation, skip it
        if (meeting.buyer_intent_explanation && meeting.buyer_intent_explanation !== 'N/A') {
          return;
        }
        
        try {
          // Try to fetch the explanation
          const explanation = await fetchBuyerIntentExplanation(meeting.deal_id, meeting.event_id);
          enhancedMeetings[actualIndex] = {
            ...meeting,
            buyer_intent_explanation: explanation
          };
          
          if (explanation && explanation !== 'N/A') {
            // Successfully got insights - remove from loading state
            setLoadingInsights(prev => {
              const newSet = new Set(prev);
              newSet.delete(meeting.event_id);
              return newSet;
            });
          } else {
            // No insights available - remove from loading and mark as processed without insights
            setLoadingInsights(prev => {
              const newSet = new Set(prev);
              newSet.delete(meeting.event_id);
              return newSet;
            });
            setProcessedWithoutInsights(prev => {
              const newSet = new Set(prev);
              newSet.add(meeting.event_id);
              return newSet;
            });
          }
        } catch (error) {
          console.error(`Error fetching explanation for meeting ${meeting.deal_id}:`, error);
          // Error occurred - remove from loading and mark as processed without insights
          setLoadingInsights(prev => {
            const newSet = new Set(prev);
            newSet.delete(meeting.event_id);
            return newSet;
          });
          setProcessedWithoutInsights(prev => {
            const newSet = new Set(prev);
            newSet.add(meeting.event_id);
            return newSet;
          });
        }
      });
      
      // Wait for current batch to complete before starting next batch
      await Promise.all(batchPromises);
      
      // Add a small delay between batches to be gentle on the API
      if (i + BATCH_SIZE < meetings.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return enhancedMeetings;
  }, [fetchBuyerIntentExplanation]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Latest Meetings</h2>
          <div className="flex items-center space-x-4">
            <select
              className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
              value={timeframe}
              onChange={(e) => handleTimeframeChange(Number(e.target.value))}
            >
              <option value={1}>Last 24h</option>
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 2 weeks</option>
              <option value={21}>Last 3 weeks</option>
              <option value={30}>Last 1 month</option>
              <option value={60}>Last 2 months</option>
            </select>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors text-sm flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-indigo-400"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-300">Loading meetings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Latest Meetings</h2>
          <div className="flex items-center space-x-4">
            <select
              className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
              value={timeframe}
              onChange={(e) => handleTimeframeChange(Number(e.target.value))}
            >
              <option value={1}>Last 24h</option>
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 2 weeks</option>
              <option value={21}>Last 3 weeks</option>
              <option value={30}>Last 1 month</option>
              <option value={60}>Last 2 months</option>
            </select>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors text-sm flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
        <div className="text-center text-red-500 dark:text-red-400 p-4">
          <p>{error}</p>
          <button
            className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Get chart data that updates when filters change
  const chartData = getChartData();
  

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Latest Meetings</h2>
        <div className="flex items-center space-x-4">
          <select
            className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
            value={timeframe}
            onChange={(e) => handleTimeframeChange(Number(e.target.value))}
          >
            <option value={1}>Last 24h</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 2 weeks</option>
            <option value={21}>Last 3 weeks</option>
            <option value={30}>Last 1 month</option>
            <option value={60}>Last 2 months</option>
          </select>
          <button
            onClick={handleRefresh}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors text-sm flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by deal name or meeting subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-colors"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filters Section */}
      {meetings.length > 0 && (
        <div className="mb-6 bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            {/* Filter Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
              </h3>
              {(selectedStages.size > 0 || selectedSignals.size > 0 || selectedDate) && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All
                </button>
              )}
            </div>

            {/* Filters Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full lg:w-auto">
              {/* Date Filter */}
              {selectedDate && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Date</span>
                    <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">
                      Selected
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="flex items-center gap-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-lg text-xs font-medium border-2 border-purple-200 dark:border-purple-700">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{selectedDate}</span>
                      <button
                        onClick={() => setSelectedDate('')}
                        className="ml-1 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Deal Stage Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Deal Stage</span>
                  {selectedStages.size > 0 && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      {selectedStages.size} selected
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(meetings.map(meeting => meeting.deal_stage))).map(stage => {
                    const isSelected = selectedStages.has(stage);
                    return (
                      <div key={stage} className="relative inline-block group">
                        <button
                          onClick={() => toggleStageFilter(stage)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-200 ${
                            isSelected 
                              ? `${getStageColor(stage).bg} ${getStageColor(stage).text} border-2 ${getStageColor(stage).border} shadow-sm`
                              : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-400 dark:hover:border-gray-500'
                          }`}
                        >
                          {getStageInitials(stage)}
                        </button>
                        <div className="invisible group-hover:visible absolute z-50 -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          {stage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Signal Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Signal</span>
                  {selectedSignals.size > 0 && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      {selectedSignals.size} selected
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {['positive', 'negative', 'neutral'].map(signalType => {
                    const isSelected = selectedSignals.has(signalType);
                    const signalColor = getSignalColor(signalType);
                    const signalIcon = signalType === 'positive' ? '↗' : signalType === 'negative' ? '↘' : '→';
                    const signalLabel = signalType.charAt(0).toUpperCase() + signalType.slice(1);
                    
                    return (
                      <button
                        key={signalType}
                        onClick={() => toggleSignalFilter(signalType)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-200 ${
                          isSelected 
                            ? `${signalColor.bg} ${signalColor.text} border-2 ${signalColor.border} shadow-sm`
                            : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                      >
                        <span className="text-sm">{signalIcon}</span>
                        {signalLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Active Filters Summary */}
          {(selectedStages.size > 0 || selectedSignals.size > 0 || selectedDate) && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium">Active filters:</span>
                {selectedDate && (
                  <span className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                    Date: {selectedDate}
                  </span>
                )}
                {selectedStages.size > 0 && (
                  <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                    {selectedStages.size} stage{selectedStages.size !== 1 ? 's' : ''}
                  </span>
                )}
                {selectedSignals.size > 0 && (
                  <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                    {selectedSignals.size} signal{selectedSignals.size !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-gray-500 dark:text-gray-400">
                  • Showing {filteredMeetings.length} of {meetings.length} meetings
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {filteredMeetings.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 p-8">
          <p>
            {searchTerm || selectedStages.size > 0 || selectedSignals.size > 0
              ? 'No meetings found matching your filters'
              : 'No meetings found for the selected timeframe'
            }
          </p>
          {(searchTerm || selectedStages.size > 0 || selectedSignals.size > 0 || selectedDate) && (
            <button
              onClick={() => {
                setSearchTerm('');
                clearAllFilters();
              }}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Insights
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Deal Name
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Meeting Subject
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Deal Stage
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Signal
                  </th>

                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredMeetings.map((meeting, index) => {
                  const buyerIntentBadge = getBuyerIntentBadge(meeting.buyer_intent);
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {loadingInsights.has(meeting.event_id) ? (
                          <div className="flex justify-center" title="Loading insights...">
                            <svg className="animate-spin h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </div>
                        ) : meeting.buyer_intent_explanation && meeting.buyer_intent_explanation !== 'N/A' ? (
                          <button
                            onClick={() => handleOpenModal(meeting)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="View meeting insights"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </button>
                        ) : ENABLE_BUYER_INTENT_ENHANCEMENT && !processedWithoutInsights.has(meeting.event_id) ? (
                          <div className="flex justify-center" title="Loading insights...">
                            <svg className="animate-spin h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        <button 
                          onClick={() => navigateToDealTimeline(meeting.deal_id)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-left cursor-pointer"
                        >
                          {meeting.deal_id}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white max-w-xs truncate">
                        {meeting.subject}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="relative inline-block group">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageColor(meeting.deal_stage).bg} ${getStageColor(meeting.deal_stage).text} border ${getStageColor(meeting.deal_stage).border} cursor-help`}>
                            {getStageInitials(meeting.deal_stage)}
                          </span>
                          <div className="invisible group-hover:visible absolute z-50 -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            {meeting.deal_stage}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        {formatDate(meeting.event_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${buyerIntentBadge.color}`}>
                          {buyerIntentBadge.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filteredMeetings.map((meeting, index) => {
              const buyerIntentBadge = getBuyerIntentBadge(meeting.buyer_intent);
              return (
                <div key={index} className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <button 
                      onClick={() => navigateToDealTimeline(meeting.deal_id)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-left font-medium text-sm cursor-pointer"
                    >
                      {meeting.deal_id}
                    </button>
                  </div>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {meeting.subject}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-300">
                    <span className="font-medium">Stage:</span> 
                    <div className="ml-2 relative inline-block group">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(meeting.deal_stage).bg} ${getStageColor(meeting.deal_stage).text} border ${getStageColor(meeting.deal_stage).border} cursor-help`}>
                        {getStageInitials(meeting.deal_stage)}
                      </span>
                      <div className="invisible group-hover:visible absolute z-50 -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        {meeting.deal_stage}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-300">
                    {formatDate(meeting.event_date)}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${buyerIntentBadge.color}`}>
                      {buyerIntentBadge.text}
                    </span>
                    {loadingInsights.has(meeting.event_id) || (ENABLE_BUYER_INTENT_ENHANCEMENT && !processedWithoutInsights.has(meeting.event_id) && (!meeting.buyer_intent_explanation || meeting.buyer_intent_explanation === 'N/A')) ? (
                      <div className="flex justify-center" title="Loading insights...">
                        <svg className="animate-spin h-3 w-3 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    ) : meeting.buyer_intent_explanation && meeting.buyer_intent_explanation !== 'N/A' ? (
                      <button
                        onClick={() => handleOpenModal(meeting)}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="View meeting insights"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Signal Trends Chart */}
      {filteredMeetings.length > 0 && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daily Call Signals</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <span>Click bars to filter by date</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData}
                onClick={(data) => {
                  if (data && data.activeLabel) {
                    handleDateFilter(data.activeLabel as string);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const total = payload.reduce((sum, entry) => sum + (typeof entry.value === 'number' ? entry.value : 0), 0);
                      const positiveCount = typeof payload.find(p => p.dataKey === 'positive')?.value === 'number' 
                        ? payload.find(p => p.dataKey === 'positive')?.value || 0 
                        : 0;
                      const negativeCount = typeof payload.find(p => p.dataKey === 'negative')?.value === 'number' 
                        ? payload.find(p => p.dataKey === 'negative')?.value || 0 
                        : 0;
                      const neutralCount = typeof payload.find(p => p.dataKey === 'neutral')?.value === 'number' 
                        ? payload.find(p => p.dataKey === 'neutral')?.value || 0 
                        : 0;
                      
                      return (
                        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-4 min-w-[200px]">
                          {/* Header */}
                          <div className="text-center mb-3">
                            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{label}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {total} meeting{total !== 1 ? 's' : ''} total
                            </p>
                          </div>
                          
                          {/* Signal Breakdown */}
                          <div className="space-y-2">
                            {typeof positiveCount === 'number' && positiveCount > 0 && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">Positive</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{positiveCount}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({Math.round((positiveCount / total) * 100)}%)
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            {typeof negativeCount === 'number' && negativeCount > 0 && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">Negative</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{negativeCount}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({Math.round((negativeCount / total) * 100)}%)
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            {typeof neutralCount === 'number' && neutralCount > 0 && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">Neutral</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{neutralCount}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({Math.round((neutralCount / total) * 100)}%)
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Bottom indicator */}
                          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                            <div className="flex items-center justify-center space-x-1">
                              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Meeting signals</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="positive" stackId="a" fill="#10b981" name="Positive" />
                <Bar dataKey="negative" stackId="a" fill="#ef4444" name="Negative" />
                <Bar dataKey="neutral" stackId="a" fill="#eab308" name="Neutral" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Meeting Insights Modal */}
      {isModalOpen && selectedMeeting && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          {/* Left Navigation Arrow */}
          <button
            onClick={navigateToPreviousMeeting}
            disabled={!canNavigatePrevious()}
            className={`absolute left-4 top-1/2 transform -translate-y-1/2 p-4 rounded-full transition-all duration-200 backdrop-blur-sm ${
              canNavigatePrevious()
                ? 'bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:scale-110 shadow-lg border border-white/20'
                : 'bg-gray-300/50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
            }`}
            title="Previous meeting (←)"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Right Navigation Arrow */}
          <button
            onClick={navigateToNextMeeting}
            disabled={!canNavigateNext()}
            className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-4 rounded-full transition-all duration-200 backdrop-blur-sm ${
              canNavigateNext()
                ? 'bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:scale-110 shadow-lg border border-white/20'
                : 'bg-gray-300/50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
            }`}
            title="Next meeting (→)"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-start p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex-1 space-y-4">
                {/* Deal Name - Main Title */}
                <div className="space-y-2 text-center">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white leading-tight">
                    {selectedMeeting.deal_id}
                  </h2>
                  <div className="flex items-center justify-center space-x-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Meeting Insights</p>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {getCurrentMeetingIndex() + 1} of {filteredMeetings.length}
                    </p>
                  </div>
                </div>
                
                {/* Metadata Chips - Organized in a clean grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Meeting Subject */}
                  <div className="flex items-center space-x-2">
                    <div className="flex-shrink-0 w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Meeting</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{selectedMeeting.subject}</p>
                    </div>
                  </div>

                  {/* Meeting Date */}
                  <div className="flex items-center space-x-2">
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(selectedMeeting.event_date)}</p>
                    </div>
                  </div>

                  {/* Signal */}
                  {(() => {
                    const buyerIntentBadge = getBuyerIntentBadge(selectedMeeting.buyer_intent);
                    const isPositive = buyerIntentBadge.text.includes('Positive') || buyerIntentBadge.text.includes('Very Likely');
                    const isNegative = buyerIntentBadge.text.includes('Negative');
                    const iconColor = isPositive ? 'text-green-600 dark:text-green-400' : 
                                    isNegative ? 'text-red-600 dark:text-red-400' : 
                                    'text-yellow-600 dark:text-yellow-400';
                    const bgColor = isPositive ? 'bg-green-100 dark:bg-green-900' : 
                                   isNegative ? 'bg-red-100 dark:bg-red-900' : 
                                   'bg-yellow-100 dark:bg-yellow-900';
                    
                    return (
                      <div className="flex items-center space-x-2">
                        <div className={`flex-shrink-0 w-8 h-8 ${bgColor} rounded-full flex items-center justify-center`}>
                          <svg className={`w-4 h-4 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Signal</p>
                          <p className={`text-sm font-medium ${isPositive ? 'text-green-700 dark:text-green-300' : 
                                        isNegative ? 'text-red-700 dark:text-red-300' : 
                                        'text-yellow-700 dark:text-yellow-300'}`}>
                            {buyerIntentBadge.text}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* Deal Owner Section - Simple one line with icon */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-medium">Deal Owner:</span>
                    <span>{selectedMeeting.owner || 'Loading...'}</span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={handleCloseModal}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Close modal (Esc)"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Buyer Intent Explanation */}
              {selectedMeeting.buyer_intent_explanation && selectedMeeting.buyer_intent_explanation !== 'N/A' && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100">Meeting Insights</h4>
                  </div>
                  <div className="space-y-6">
                    {(() => {
                      const sections = parseBuyerIntentExplanation(selectedMeeting.buyer_intent_explanation);

                      return sections.map((section, sectionIndex) => (
                        <div key={sectionIndex} className="space-y-2">
                          <h5 className="font-bold text-blue-900 dark:text-blue-100">{section.title}</h5>
                          <ul className="list-disc pl-5 space-y-1">
                            {section.bulletPoints.map((point, pointIndex) => (
                              <li key={pointIndex} className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LatestMeetings;