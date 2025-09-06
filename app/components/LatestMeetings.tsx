'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_CONFIG } from '../utils/config';

interface Meeting {
  event_id: string;
  deal_id: string;
  subject: string;
  event_date: string;
  sentiment: string;
  buyer_intent: string;
  buyer_intent_explanation?: any;
  engagement_id?: string;
}

interface LatestMeetingsProps {
  browserId: string;
  isInitialized: boolean;
}

const LatestMeetings: React.FC<LatestMeetingsProps> = ({ browserId, isInitialized }) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<number>(1); // Changed default to 1 (Last 24h)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const router = useRouter();

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
          // Check if cached data has buyer_intent_explanation, if not enhance it
          const needsEnhancement = cachedData.some((meeting: Meeting) => 
            !meeting.buyer_intent_explanation || meeting.buyer_intent_explanation === 'N/A'
          );
          
          if (needsEnhancement) {
            console.log('Cached data needs enhancement, fetching explanations...');
            const enhancedCachedData = await enhanceMeetingsWithExplanations(cachedData);
            setMeetings(enhancedCachedData);
            // Update cache with enhanced data
            saveMeetingsToStorage(days, enhancedCachedData);
          } else {
            setMeetings(cachedData);
          }
          setLoading(false);
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
        
        // Enhance meetings with buyer intent explanations
        console.log('Enhancing meetings with buyer intent explanations...');
        const enhancedMeetings = await enhanceMeetingsWithExplanations(sortedMeetings);
        setMeetings(enhancedMeetings);
        
        // Save to localStorage
        saveMeetingsToStorage(days, enhancedMeetings);
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
      fetchLatestMeetings(timeframe, false);
    }
  }, [isInitialized, timeframe, fetchLatestMeetings]);

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

    if (lowerIntent.includes('likely') || lowerIntent.includes('buy')) {
      badgeText = 'Likely to Buy';
      badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    } else if (lowerIntent.includes('neutral')) {
      badgeText = 'Neutral';
      badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    } else if (lowerIntent.includes('unable') || lowerIntent.includes('determine')) {
      badgeText = 'Unable to Determine';
      badgeColor = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }

    return { text: badgeText, color: badgeColor };
  };

  // Filter meetings based on search term
  const filteredMeetings = meetings.filter(meeting => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return meeting.subject.toLowerCase().includes(searchLower);
  });

  // Navigate to deal timeline
  const navigateToDealTimeline = (dealId: string) => {
    const encodedDealId = encodeURIComponent(dealId);
    router.push(`/deal-timeline?dealName=${encodedDealId}&autoload=true`);
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

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isModalOpen) {
        handleCloseModal();
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleEscKey);
      return () => {
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [isModalOpen]);

  // Function to fetch buyer intent explanation for a specific meeting
  const fetchBuyerIntentExplanation = useCallback(async (dealId: string, eventId: string) => {
    try {
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/deal-timeline')}?dealName=${encodeURIComponent(dealId)}`);
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
      console.error('Error fetching buyer intent explanation:', error);
    }
    return null;
  }, [makeApiCall]);

  // Function to enhance meeting data with buyer intent explanations
  const enhanceMeetingsWithExplanations = useCallback(async (meetings: Meeting[]) => {
    const enhancedMeetings = await Promise.all(
      meetings.map(async (meeting) => {
        // If meeting already has buyer_intent_explanation, keep it
        if (meeting.buyer_intent_explanation && meeting.buyer_intent_explanation !== 'N/A') {
          return meeting;
        }
        
        // Try to fetch the explanation
        const explanation = await fetchBuyerIntentExplanation(meeting.deal_id, meeting.event_id);
        return {
          ...meeting,
          buyer_intent_explanation: explanation
        };
      })
    );
    
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
            placeholder="Search meetings by subject..."
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

      {filteredMeetings.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 p-8">
          <p>{searchTerm ? 'No meetings found matching your search' : 'No meetings found for the selected timeframe'}</p>
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
                    Date
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Buyer Intent
                  </th>

                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredMeetings.map((meeting, index) => {
                  const buyerIntentBadge = getBuyerIntentBadge(meeting.buyer_intent);
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {meeting.buyer_intent_explanation && meeting.buyer_intent_explanation !== 'N/A' ? (
                          <button
                            onClick={() => handleOpenModal(meeting)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="View meeting insights"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </button>
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
                    {formatDate(meeting.event_date)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${buyerIntentBadge.color}`}>
                      {buyerIntentBadge.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Meeting Insights Modal */}
      {isModalOpen && selectedMeeting && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-start p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-2">
                  {/* Deal Name Chip */}
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {selectedMeeting.deal_id}
                  </div>
                  
                  {/* Meeting Date Chip */}
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDate(selectedMeeting.event_date)}
                  </div>
                </div>
                
                {/* Meeting Subject Chip */}
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 max-w-full">
                  <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="truncate">{selectedMeeting.subject}</span>
                </div>
              </div>
              
              <button
                onClick={handleCloseModal}
                className="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      const explanation = selectedMeeting.buyer_intent_explanation;

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
                            <h5 className="font-bold text-blue-900 dark:text-blue-100">{title}</h5>
                            <ul className="list-disc pl-5 space-y-1">
                              {bulletPoints.map((point, index) => (
                                <li key={index} className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LatestMeetings; 