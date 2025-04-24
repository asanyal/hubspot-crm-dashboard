'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAppState } from '../context/AppContext';
import DateRangeSlider from '../components/DateRangeSlider';

interface Deal {
  Deal_Name: string;
  Owner: string;
  Created_At: string;
  Deal_Stage: string;
  hs_object_id: string;
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant' | 'error';
  timestamp: string;
}

const AMAPage: React.FC = () => {
  const { state } = useAppState();
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('2025-01');
  const [endDate, setEndDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  // Format elapsed time
  const formatElapsedTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Handle loading stages based on elapsed time
  useEffect(() => {
    let loadingTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    
    if (isLoadingConversations && loadingStartTime) {
      // Calculate elapsed time since loading started (in seconds)
      const checkLoadingStage = () => {
        const elapsedSeconds = (Date.now() - loadingStartTime) / 1000;
        
        if (elapsedSeconds >= 180) {
          setLoadingMessage(`Still loading conversations... (${formatElapsedTime(elapsedSeconds)})`);
        } else if (elapsedSeconds >= 60) {
          setLoadingMessage(`Processing conversations... (${formatElapsedTime(elapsedSeconds)})`);
        } else if (elapsedSeconds >= 30) {
          setLoadingMessage(`Loading conversations... (${formatElapsedTime(elapsedSeconds)})`);
        } else {
          setLoadingMessage(`Analyzing meetings... (${formatElapsedTime(elapsedSeconds)})`);
        }
      };
      
      // Set a timer to check loading stage every second
      loadingTimer = setInterval(checkLoadingStage, 1000);
      
      // Set a timeout to automatically fail after 5 minutes
      timeoutTimer = setTimeout(() => {
        if (isLoadingConversations) {
          setError('Request timed out after 5 minutes. Please try again.');
          setIsLoadingConversations(false);
          setLoadingStartTime(null);
        }
      }, 300000); // 5 minutes
    }
    
    return () => {
      // Clean up timers when component unmounts or loading state changes
      if (loadingTimer) clearInterval(loadingTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }, [isLoadingConversations, loadingStartTime]);

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/hubspot/all-deals', {
          headers: {
            'accept': 'application/json',
            'X-Browser-ID': localStorage.getItem('browserId') || ''
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch deals');
        }

        const data = await response.json();
        
        // Log the response for debugging
        console.log('API Response:', data);
        
        // Validate the response data
        if (!Array.isArray(data)) {
          console.log('Response is not an array:', typeof data);
          throw new Error('Invalid data format: expected an array');
        }

        // Log the first deal to see its structure
        if (data.length > 0) {
          console.log('First deal structure:', data[0]);
        }

        // Transform the deals to our expected format
        const transformedDeals = data.map(deal => {
          // Ensure all values are strings
          const dealName = String(deal.Deal_Name || deal.dealname || deal.name || '');
          const owner = String(deal.Owner || deal.owner || '');
          const createdAt = String(deal.Created_At || deal.createdate || '');
          const dealStage = String(deal.Deal_Stage || deal.stage || '');
          const objectId = String(deal.hs_object_id || deal.id || '');

          return {
            Deal_Name: dealName,
            Owner: owner,
            Created_At: createdAt,
            Deal_Stage: dealStage,
            hs_object_id: objectId
          };
        });

        setDeals(transformedDeals);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deals. Please try again.');
        console.error('Error fetching deals:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeals();
  }, []);

  const filteredDeals = useMemo(() => {
    if (!deals || deals.length === 0) {
      return [];
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      return deals;
    }

    return deals.filter(deal => {
      const dealName = deal.Deal_Name || '';
      return dealName.toLowerCase().includes(term);
    });
  }, [deals, searchTerm]);

  const formatDateForAPI = (monthYear: string, isStart: boolean) => {
    const [year, month] = monthYear.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, isStart ? 1 : 0);
    if (!isStart) {
      date.setMonth(date.getMonth() + 1);
    }
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-');
  };

  const handleLoadConversations = async () => {
    if (!selectedDeal) return;

    try {
      setIsLoadingConversations(true);
      setLoadingStartTime(Date.now());
      setLoadingMessage('Initializing...');
      const startDateFormatted = formatDateForAPI(startDate, true);
      const endDateFormatted = formatDateForAPI(endDate, false);

      const response = await fetch(
        `/api/hubspot/load-customer-transcripts?dealName=${encodeURIComponent(selectedDeal)}&startDate=${startDateFormatted}&endDate=${endDateFormatted}`,
        {
          headers: {
            'accept': 'application/json',
            'X-Browser-ID': localStorage.getItem('browserId') || ''
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load conversations');
      }

      const data = await response.json();
      setConversations(data);

      // Handle different response cases
      if (data.stats.total_chunks_loaded === 0 && (!data.stats.dates_skipped || data.stats.dates_skipped.length === 0)) {
        setNotification('No conversations found in time range');
        setMessages([{
          id: Date.now().toString(),
          content: 'No conversations found',
          sender: 'assistant',
          timestamp: new Date().toISOString()
        }]);
      } else {
        const totalSegments = data.stats.total_chunks_loaded + (data.stats.dates_skipped?.length || 0);
        setNotification('Conversations loaded. Ready!');
        setMessages([{
          id: Date.now().toString(),
          content: `${totalSegments} conversation segments loaded`,
          sender: 'assistant',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setNotification(`Error loading conversations. ${errorMessage}`);
      setMessages([{
        id: Date.now().toString(),
        content: `Error: ${errorMessage}`,
        sender: 'error',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoadingConversations(false);
      setLoadingStartTime(null);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedDeal) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsLoadingChat(true);

    try {
      const response = await fetch('/api/hubspot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Browser-ID': localStorage.getItem('browserId') || ''
        },
        body: JSON.stringify({
          message: newMessage,
          dealName: selectedDeal,
          conversations: conversations
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.error || 'Failed to send message',
          sender: 'error',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, errorMessage]);
        return;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        sender: 'assistant',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: error instanceof Error ? error.message : 'An error occurred',
        sender: 'error',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden bg-gray-50">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 ${
          notification.includes('Error') ? 'bg-red-500' :
          notification.includes('No conversations found') ? 'bg-yellow-500' :
          'bg-green-500'
        } text-white`}>
          {notification}
        </div>
      )}

      {/* Date Range Selector */}
      <div className="flex-none bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <DateRangeSlider
              onRangeChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              isLoading={isLoadingConversations}
            />
          </div>
          <button
            className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
            disabled={!startDate || !endDate || isLoadingConversations}
            onClick={handleLoadConversations}
          >
            {isLoadingConversations ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Loading...
              </>
            ) : (
              'Load Conversations'
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Deal List */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="flex-none p-4 border-b border-gray-100">
            <div className="relative">
              <input
                type="text"
                placeholder="Search deals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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

          {/* Deal List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-gray-500 flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
                Loading deals...
              </div>
            ) : error ? (
              <div className="p-4 text-red-500">{error}</div>
            ) : filteredDeals.length === 0 ? (
              <div className="p-4 text-gray-500">No deals found</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredDeals.map((deal) => (
                  <button
                    key={deal.hs_object_id}
                    onClick={() => setSelectedDeal(deal.Deal_Name)}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                      selectedDeal === deal.Deal_Name ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900">{deal.Deal_Name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {deal.Owner} • {new Date(deal.Created_At).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Chat Interface */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden">
          <div className="flex-none flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">
              {selectedDeal ? `Chat with ${selectedDeal}` : 'Select a deal to start chatting'}
            </h2>
          </div>
          
          {/* Chat Messages Area */}
          <div className="flex-1 bg-gray-50 p-4 overflow-y-auto">
            {!selectedDeal ? (
              <div className="h-full flex items-center justify-center text-gray-400">
                Select a deal to view conversations
              </div>
            ) : isLoadingConversations ? (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                <p className="text-lg font-medium text-gray-700">{loadingMessage}</p>
                <p className="text-sm text-gray-500 mt-2">
                  This may take a few seconds (depending on the number of conversations)...
                </p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400">
                No conversations loaded. Select a date range and click "Load Conversations"
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.sender === 'user'
                          ? 'bg-sky-600 text-white'
                          : message.sender === 'error'
                          ? 'bg-red-500 text-white'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                      <div className={`text-xs mt-1 ${
                        message.sender === 'user' ? 'text-sky-100' : message.sender === 'error' ? 'text-red-100' : 'text-gray-500'
                      }`}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoadingChat && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="flex-none p-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Type your question..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                disabled={!selectedDeal || isLoadingChat || isLoadingConversations}
              />
              <button
                onClick={handleSendMessage}
                className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={!selectedDeal || isLoadingChat || isLoadingConversations || !newMessage.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AMAPage; 