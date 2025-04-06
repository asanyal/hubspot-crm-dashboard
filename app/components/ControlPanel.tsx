// app/components/ControlPanel.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { useRouter } from 'next/navigation';
import { useAppState } from '../context/AppContext';

interface StageData {
  stage: string;
  count: number;
  amount: number;
}

type SortOption = 'count' | 'amount' | 'funnel';

const ControlPanel: React.FC = () => {
  const { state, updateState } = useAppState();
  const { sortBy, pipelineData, loading, error, lastFetched } = state.controlPanel;
  const [isDark, setIsDark] = useState<boolean>(false);
  const router = useRouter();

  console.log('ControlPanel rendered:', {
    hasData: pipelineData.length > 0,
    loading,
    lastFetched
  });

  // Define the funnel order for stages
  const funnelOrder = [
    "0. Identification",
    "1. Sales Qualification",
    "2. Needs Analysis & Solution Mapping",
    "3. Technical Validation",
    "4. Proposal & Negotiation",
    "Waiting for Signature",
    "Closed Won",
    "Renew/Closed won",
    "Closed Active Nurture",
    "Closed Lost",
    "Closed Marketing Nurture",
    "Assessment"
  ];
  
  // Timestamp for data expiration (5 minutes = 300000 milliseconds)
  const DATA_EXPIRY_TIME = 300000;

  // Add session management state
  const [browserId, setBrowserId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

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

  // Function to fetch data - declare BEFORE using in useEffect
  const fetchPipelineData = useCallback(async () => {
    try {
      // Set loading state
      updateState('controlPanel.loading', true);
      updateState('controlPanel.error', null);
      
      console.log('Fetching pipeline data...');
      
      // Make the API call
      const response = await makeApiCall('/api/hubspot/pipeline-summary');
      
      if (response) {
        const data = await response.json();
        console.log('Pipeline data fetched:', data ? `${data.length} items` : 'no data');
        
        // Update the state with the new data
        updateState('controlPanel.pipelineData', data);
        updateState('controlPanel.lastFetched', Date.now());
      }
      
      // Always update loading state regardless of result
      updateState('controlPanel.loading', false);
    } catch (error) {
      console.error('Error fetching pipeline data:', error);
      updateState('controlPanel.loading', false);
      updateState('controlPanel.error', 'Failed to load pipeline data');
    }
  }, [updateState, makeApiCall]);

  // ULTRA SIMPLIFIED APPROACH
  // Initialize browser ID only once on component mount
  useEffect(() => {
    // This effect runs once on mount and sets up browser ID
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('browserId');
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('browserId', id);
      }
      console.log('Initializing browser ID:', id);
      setBrowserId(id);
      setIsInitialized(true);
    }
    return () => {
      console.log('Browser ID effect cleanup');
    };
  }, []); // Empty dependency array = run once

  // ONE simple effect to fetch data when needed
  useEffect(() => {
    // Only proceed if initialized
    if (!isInitialized) return;
    
    console.log('Main effect running, checking if we need to fetch data');
    // Check if we need to load data
    if (pipelineData.length === 0 && !loading) {
      console.log('No data and not loading - fetching data');
      // Wrap in function to avoid dependency
      const loadData = () => fetchPipelineData();
      loadData();
    }
  }, [isInitialized, pipelineData.length, loading]); // Removed fetchPipelineData

  // Check dark mode on component mount and when it changes
  useEffect(() => {
    // Check initial state
    const checkDarkMode = () => {
      if (typeof window !== 'undefined') {
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    };
    
    checkDarkMode();
    
    // Set up observer to detect dark mode changes
    if (typeof window !== 'undefined' && window.MutationObserver) {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (
            mutation.type === 'attributes' && 
            mutation.attributeName === 'class'
          ) {
            checkDarkMode();
          }
        });
      });
      
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
      
      return () => observer.disconnect();
    }
  }, []);

  // Format number as currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Navigate to deals-by-stage with the stage pre-selected
  const navigateToStageDetails = (stageName: string) => {
    // Encode the stage name for URL
    const encodedStageName = encodeURIComponent(stageName);
    router.push(`/deals-by-stage?stage=${encodedStageName}&autoload=true`);
  };

  // Format and sort the data for the stack chart
  const getStackData = () => {
    const data = pipelineData.map((item) => ({
      name: item.stage,
      value: sortBy === 'count' ? item.count : item.amount,
      count: item.count,
      amount: item.amount,
      formattedAmount: formatCurrency(item.amount),
      label: `${item.stage} (${item.count} deals, ${formatCurrency(item.amount)})`,
      // Add an order property for funnel sorting
      funnelOrder: funnelOrder.indexOf(item.stage)
    }));

    // Sort the data based on selected option
    if (sortBy === 'funnel') {
      // Custom sort for funnel view
      return data.sort((a, b) => {
        // If both items are in the funnel order, sort by their position
        if (a.funnelOrder >= 0 && b.funnelOrder >= 0) {
          return a.funnelOrder - b.funnelOrder;
        }
        // If only a is in the funnel order, put it first
        if (a.funnelOrder >= 0) {
          return -1;
        }
        // If only b is in the funnel order, put it first
        if (b.funnelOrder >= 0) {
          return 1;
        }
        // If neither is in the funnel order, sort by name
        return a.name.localeCompare(b.name);
      });
    } else {
      // Standard sorting by count or amount (descending)
      return data.sort((a, b) => b.value - a.value);
    }
  };

  // Define colors for the chart
  const COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#5E35B1', '#1E88E5', '#00ACC1', '#43A047'];
  
  // Dark mode colors - slightly adjusted for better visibility in dark mode
  const DARK_COLORS = ['#5C9CFF', '#4ACA6B', '#FFC926', '#FF6B5B', '#7C58C7', '#42A1F5', '#25C7E0', '#5FC269'];

  // Custom tooltip for the stack chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-4 shadow-lg rounded border border-gray-200 dark:border-gray-700">
          <p className="font-bold text-gray-900 dark:text-white">{payload[0].payload.name}</p>
          <p className="text-gray-700 dark:text-gray-300">{payload[0].payload.count} deals</p>
          <p className="text-gray-700 dark:text-gray-300">{payload[0].payload.formattedAmount}</p>
        </div>
      );
    }
    return null;
  };

  // Handle sort option change
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateState('controlPanel.sortBy', e.target.value as SortOption);
  };

  // Handle manual refresh
  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    // Simplified approach - just reset loading and fetch
    updateState('controlPanel.loading', false);
    fetchPipelineData();
  };

  // Stat boxes component
  const StatBoxes = () => {
    // Find the data for each stage
    const proposalData = pipelineData.find(item => item.stage === "4. Proposal & Negotiation") || { count: 0, amount: 0 };
    const technicalData = pipelineData.find(item => item.stage === "3. Technical Validation") || { count: 0, amount: 0 };
    const nurtureData = pipelineData.find(item => item.stage === "Closed Active Nurture") || { count: 0, amount: 0 };
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Proposal & Negotiation Box */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 flex flex-col items-center justify-center text-center transition-colors">
          <h3 className="text-sm font-medium text-black dark:text-gray-400 mb-1"><b>Post Pilot Negotiations</b></h3>

          <button 
          onClick={() => navigateToStageDetails("4. Proposal & Negotiation")}
          className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2 hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
          >
            {proposalData.count}
          </button>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(proposalData.amount)}</p>
        </div>
        
        {/* Technical Validation Box */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 flex flex-col items-center justify-center text-center transition-colors">
          <h3 className="text-sm font-medium text-black dark:text-gray-400 mb-1"><b>Active Pilots</b></h3>
          <button 
            onClick={() => navigateToStageDetails("3. Technical Validation")}
            className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2 hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
          >
            {technicalData.count}
          </button>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(technicalData.amount)}</p>
        </div>
        
        {/* Closed Active Nurture Box */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 flex flex-col items-center justify-center text-center transition-colors">
          <h3 className="text-sm font-medium text-black dark:text-gray-400 mb-1"><b>Active Nurture</b></h3>
          <button 
            onClick={() => navigateToStageDetails("Closed Active Nurture")}
            className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2 hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
          >
            {nurtureData.count}
          </button>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(nurtureData.amount)}</p>
        </div>
      </div>
    );
  };

  // Add a safety timeout to reset loading state if it gets stuck
  useEffect(() => {
    // If loading is true, set a timeout to reset it after 10 seconds
    if (loading) {
      console.log('Loading timeout safety started');
      const timeoutId = setTimeout(() => {
        console.log('Loading timeout safety triggered - resetting loading state');
        updateState('controlPanel.loading', false);
      }, 10000); // 10 seconds timeout
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [loading, updateState]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-indigo-400"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-300">Loading pipeline data...</p>
        <button 
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors"
          onClick={handleRefresh}
        >
          Reset
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 dark:text-red-400 p-4">
        <p>{error}</p>
        <button
          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors"
          onClick={handleRefresh}
        >
          Retry
        </button>
      </div>
    );
  }

  const textColor = isDark ? '#e5e7eb' : '#000000';
  
  // Check if we have no data yet
  if (pipelineData.length === 0) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-slate-900 transition-colors">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pipeline Performance</h1>
          <button
            onClick={handleRefresh}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors text-sm flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Load Data
          </button>
        </div>
        <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">No pipeline data available yet.</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors"
          >
            Load Pipeline Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-slate-900 transition-colors">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pipeline Performance</h1>
        
        {/* Refresh button with last updated timestamp */}
        <div className="flex items-center space-x-4">
          {lastFetched && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Updated {new Date(lastFetched).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded transition-colors text-sm flex items-center"
            title="Refresh data"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Boxes */}
      <StatBoxes />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Stack Chart - Replacing Funnel */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Pipeline Stack</h2>
            <div className="relative">
              <select
                className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-md py-1 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                value={sortBy}
                onChange={handleSortChange}
              >
                <option value="funnel">Show Funnel</option>
                <option value="count">Sort by Deals Count</option>
                <option value="amount">Sort by Pipeline Amount</option>
              </select>
            </div>
          </div>
          <div className="h-[600px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={getStackData()}
                margin={{ top: 20, right: 30, bottom: 20, left: 150 }}
              >
                <XAxis 
                  type="number"
                  tickFormatter={sortBy === 'amount' ? (value) => formatCurrency(value) : undefined}
                  label={{ 
                    value: sortBy === 'count' ? 'Number of Deals' : 
                           sortBy === 'amount' ? 'Pipeline Amount' : 'Number of Deals',
                    position: 'insideBottom',
                    offset: -10,
                    style: { fill: textColor }
                  }}
                  tick={{ fill: textColor }}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ 
                    fontSize: 12, 
                    fill: textColor
                  }}
                  width={140}
                  interval={0}
                  tickMargin={5}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="value" 
                  fill="#8884d8"
                  barSize={30}
                  isAnimationActive
                >
                  {getStackData().map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={isDark ? 
                        DARK_COLORS[index % DARK_COLORS.length] : 
                        COLORS[index % COLORS.length]} 
                      onClick={() => navigateToStageDetails(entry.name)}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table with Stage Data */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Pipeline Summary</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 dark:bg-slate-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-6 py-3 bg-gray-50 dark:bg-slate-700 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-6 py-3 bg-gray-50 dark:bg-slate-700 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total Value
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                {pipelineData.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      <button 
                        onClick={() => navigateToStageDetails(item.stage)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-left"
                      >
                        {item.stage}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 text-right">
                      {item.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 text-right">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {pipelineData.reduce((sum, item) => sum + item.count, 0)}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {formatCurrency(pipelineData.reduce((sum, item) => sum + item.amount, 0))}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;