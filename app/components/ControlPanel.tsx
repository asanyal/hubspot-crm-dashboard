// app/components/ControlPanel.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts';
import { useRouter } from 'next/navigation';
import { useAppState } from '../context/AppContext';
import { API_CONFIG } from '../utils/config';
import LatestMeetings from './LatestMeetings';

interface StageData {
  stage: string;
  count: number;
  amount: number;
}

type SortOption = 'count' | 'amount';

const ControlPanel: React.FC = () => {
  const { state, updateState } = useAppState();
  const { sortBy, pipelineData, loading, error, lastFetched, dealRiskAnalysis } = state.controlPanel;
  const [showActivePipe, setShowActivePipe] = useState<boolean>(true);
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
  
  // Ref to track current risk data state for concurrent updates
  const riskDataRef = useRef<any[]>([]);

  // Function to save risk data to localStorage
  const saveRiskDataToStorage = useCallback((stage: string, data: any[]) => {
    try {
      const key = `dealRiskData_${stage}`;
      const storageData = {
        data,
        timestamp: Date.now(),
        stage
      };
      localStorage.setItem(key, JSON.stringify(storageData));
      console.log(`💾 Saved risk data to localStorage for stage: ${stage}`);
    } catch (error) {
      console.error('Error saving risk data to localStorage:', error);
    }
  }, []);

  // Function to load risk data from localStorage
  const loadRiskDataFromStorage = useCallback((stage: string) => {
    try {
      const key = `dealRiskData_${stage}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const storageData = JSON.parse(stored);
        const isExpired = Date.now() - storageData.timestamp > 300000; // 5 minutes
        if (!isExpired) {
          console.log(`📂 Loaded risk data from localStorage for stage: ${stage}`);
          return storageData.data;
        } else {
          console.log(`⏰ Cached risk data expired for stage: ${stage}`);
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Error loading risk data from localStorage:', error);
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

  // Function to fetch data - declare BEFORE using in useEffect
  const fetchPipelineData = useCallback(async () => {
    try {
      // Set loading state
      updateState('controlPanel.loading', true);
      updateState('controlPanel.error', null);
      
      console.log('Fetching pipeline data...');
      
      // Make the API call
      const response = await makeApiCall(`${API_CONFIG.getApiPath('/pipeline-summary')}`);
      
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

  // Function to fetch deal risk data with progressive loading
  const fetchDealRiskData = useCallback(async (stage: string, forceRefresh = false) => {
    try {
      // Set loading state
      updateState('controlPanel.dealRiskAnalysis.loading', true);
      updateState('controlPanel.dealRiskAnalysis.error', null);
      
      console.log('Fetching deal risk data for stage:', stage, forceRefresh ? '(forced refresh)' : '');
      
      // Check localStorage first (unless force refresh)
      if (!forceRefresh) {
        const cachedData = loadRiskDataFromStorage(stage);
        if (cachedData && cachedData.length > 0) {
          console.log('Using cached data for stage:', stage);
          updateState('controlPanel.dealRiskAnalysis.riskData', cachedData);
          riskDataRef.current = cachedData;
          updateState('controlPanel.dealRiskAnalysis.loading', false);
          updateState('controlPanel.dealRiskAnalysis.lastFetched', Date.now());
          return;
        }
      }
      
      // First get deals for the selected stage
      const dealsResponse = await makeApiCall(`${API_CONFIG.getApiPath('/deals')}?stage=${encodeURIComponent(stage)}`);
      
      if (!dealsResponse) {
        updateState('controlPanel.dealRiskAnalysis.loading', false);
        return;
      }
      
      const dealsData = await dealsResponse.json();
      console.log('Deals data fetched:', dealsData ? `${dealsData.length} deals` : 'no deals');
      
      if (!Array.isArray(dealsData) || dealsData.length === 0) {
        updateState('controlPanel.dealRiskAnalysis.riskData', []);
        updateState('controlPanel.dealRiskAnalysis.loading', false);
        return;
      }
      
      // Initialize the table with deal names and loading placeholders
      const initialRiskData = dealsData.map((deal: any) => ({
        deal_name: deal.Deal_Name,
        risk_score: 0,
        risk_level: 'Loading...',
        explanation: '',
        risk_factors: {
          no_decision_maker: { risk_score: 0, details: ['Loading...'], max_score: 25 },
          pricing_concerns: { risk_score: 0, details: ['Loading...'], max_score: 20 },
          competitor_presence: { risk_score: 0, details: ['Loading...'], max_score: 20 },
          sentiment_trends: { risk_score: 0, details: ['Loading...'], max_score: 10 }
        },
        last_calculated: '',
        isLoading: true
      }));
      
      // Set initial data immediately
      updateState('controlPanel.dealRiskAnalysis.riskData', initialRiskData);
      riskDataRef.current = initialRiskData;
      
      // Fetch risk data for each deal independently and update as they come in
      dealsData.forEach((deal: any, index: number) => {
        // Start each API call independently
        const fetchRiskData = async () => {
          console.log(`🚀 Starting risk score API call for deal: ${deal.Deal_Name} (index: ${index})`);
          try {
            const riskResponse = await makeApiCall(`${API_CONFIG.getApiPath('/deal-risk-score')}?deal_name=${encodeURIComponent(deal.Deal_Name)}`);
            if (riskResponse) {
              const riskData = await riskResponse.json();
              
              console.log(`✅ Risk score API call completed for deal: ${deal.Deal_Name} (index: ${index}) - Risk Level: ${riskData.risk_level}, Score: ${riskData.risk_score}/100`);
              
              // Update the ref first, then update state
              const currentData = [...riskDataRef.current];
              currentData[index] = {
                ...riskData,
                isLoading: false
              };
              riskDataRef.current = currentData;
              
              // Update the state with the new array
              updateState('controlPanel.dealRiskAnalysis.riskData', currentData);
              console.log(`📊 Updated row ${index} for deal: ${deal.Deal_Name} - Total rows: ${currentData.length}`);
              
              // Check if all rows are loaded (no more loading states)
              const allLoaded = currentData.every((item: any) => !item.isLoading);
              if (allLoaded) {
                console.log('All risk data loaded, saving to localStorage');
                saveRiskDataToStorage(stage, currentData);
              }
            }
          } catch (error) {
            console.error(`❌ Error fetching risk data for deal ${deal.Deal_Name} (index: ${index}):`, error);
            
            // Update the ref first, then update state for errors
            const currentData = [...riskDataRef.current];
            currentData[index] = {
              ...currentData[index],
              risk_level: 'Error',
              explanation: 'Failed to load risk data',
              isLoading: false,
              hasError: true
            };
            riskDataRef.current = currentData;
            
            // Update the state with the new array
            updateState('controlPanel.dealRiskAnalysis.riskData', currentData);
            console.log(`⚠️ Updated row ${index} for deal: ${deal.Deal_Name} with error - Total rows: ${currentData.length}`);
            
            // Check if all rows are loaded (including errors)
            const allLoaded = currentData.every((item: any) => !item.isLoading);
            if (allLoaded) {
              console.log('All risk data loaded (including errors), saving to localStorage');
              saveRiskDataToStorage(stage, currentData);
            }
          }
        };
        
        // Start the API call immediately
        fetchRiskData();
      });
      
      // Set last fetched timestamp
      updateState('controlPanel.dealRiskAnalysis.lastFetched', Date.now());
      
    } catch (error) {
      console.error('Error fetching deal risk data:', error);
      updateState('controlPanel.dealRiskAnalysis.error', 'Failed to load deal risk data');
    } finally {
      updateState('controlPanel.dealRiskAnalysis.loading', false);
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

  // Effect to handle deal risk analysis data fetching
  useEffect(() => {
    // Only proceed if initialized and we have a selected stage
    if (!isInitialized || !dealRiskAnalysis.selectedStage) return;
    
    console.log('Deal risk analysis effect running for stage:', dealRiskAnalysis.selectedStage);
    
    // Check if we need to load risk data
    if ((dealRiskAnalysis.riskData || []).length === 0 && !dealRiskAnalysis.loading) {
      console.log('No risk data and not loading - fetching risk data');
      fetchDealRiskData(dealRiskAnalysis.selectedStage, false);
    }
  }, [isInitialized, dealRiskAnalysis.selectedStage, dealRiskAnalysis.riskData.length, dealRiskAnalysis.loading, fetchDealRiskData]);

  // Check dark mode on component mount and when it changes


  // Format number as currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format number as abbreviated currency (e.g., $7.5M, $155K)
  const formatAbbreviatedCurrency = (amount: number): string => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    } else {
      return `$${amount.toFixed(0)}`;
    }
  };

  // Navigate to deals-by-stage with the stage pre-selected
  const navigateToStageDetails = (stageName: string) => {
    // Encode the stage name for URL
    const encodedStageName = encodeURIComponent(stageName);
    router.push(`/deals-by-stage?stage=${encodedStageName}&autoload=true`);
  };

  // Format and sort the data for the funnel stacked bar chart
  const getStackData = () => {
    let data = pipelineData.map((item) => ({
      name: item.stage,
      value: sortBy === 'count' ? item.count : item.amount,
      count: item.count,
      amount: item.amount,
      formattedAmount: formatCurrency(item.amount),
      label: `${item.stage} (${item.count} deals, ${formatCurrency(item.amount)})`,
      // Add an order property for funnel sorting
      funnelOrder: funnelOrder.indexOf(item.stage)
    }));

    // Filter out closed stages if showActivePipe is enabled
    if (showActivePipe) {
      data = data.filter(item => 
        item.name !== "Closed Marketing Nurture" && 
        item.name !== "Closed Lost" &&
        item.name !== "Closed Won" &&
        item.name !== "0. Identification"
      );
    }

    // Always sort by funnel order for the stacked bar chart
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
  };

  // Define colors for the chart
  const COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#5E35B1', '#1E88E5', '#00ACC1', '#43A047'];
  
  // Dark mode colors - slightly adjusted for better visibility in dark mode
  const DARK_COLORS = ['#5C9CFF', '#4ACA6B', '#FFC926', '#FF6B5B', '#7C58C7', '#42A1F5', '#25C7E0', '#5FC269'];

  // Custom tooltip for the funnel stacked bar chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const barData = payload[0];
      const stageName = barData.name;
      
      if (stageName && stageName !== 'Pipeline') {
        const currentValue = barData.value;
        const displayValue = sortBy === 'amount' ? formatAbbreviatedCurrency(currentValue) : currentValue;
        const displayLabel = sortBy === 'count' ? 'deals' : 'pipeline value';
        
        // Find the stage data by name
        const stageData = getStackData().find(item => item.name === stageName);
        
        if (stageData) {
          return (
            <div className="bg-white dark:bg-slate-800 p-4 shadow-lg rounded border border-gray-200 dark:border-gray-700">
              <p className="font-bold text-gray-900 dark:text-white">{stageName}</p>
              <p className="text-gray-700 dark:text-gray-300">
                {displayValue} {displayLabel}
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                {stageData.count} deals • {stageData.formattedAmount}
              </p>
            </div>
          );
        }
      }
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
    // Function to get display name for stages
    const getDisplayName = (stage: string) => {
      switch (stage) {
        case "4. Proposal & Negotiation":
          return "Post Pilot Negotiations";
        case "3. Technical Validation":
          return "Active Pilots";
        case "Closed Active Nurture":
          return "Active Nurture";
        case "0. Identification":
          return "Identification";
        case "1. Sales Qualification":
          return "Sales Qualification";
        case "2. Needs Analysis & Solution Mapping":
          return "Needs Analysis";
        case "Waiting for Signature":
          return "Waiting for Signature";
        case "Closed Won":
          return "Closed Won";
        case "Renew/Closed won":
          return "Renewed/Closed Won";
        case "Closed Lost":
          return "Closed Lost";
        case "Closed Marketing Nurture":
          return "Marketing Nurture";
        case "Assessment":
          return "Assessment";
        default:
          return stage;
      }
    };

    // Sort stages by funnel order for consistent display
    const sortedPipelineData = [...pipelineData].sort((a, b) => {
      const aOrder = funnelOrder.indexOf(a.stage);
      const bOrder = funnelOrder.indexOf(b.stage);
      
      if (aOrder >= 0 && bOrder >= 0) {
        return aOrder - bOrder;
      }
      if (aOrder >= 0) return -1;
      if (bOrder >= 0) return 1;
      return a.stage.localeCompare(b.stage);
    });
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 mb-8">
        {sortedPipelineData.map((stageData, index) => (
          <div key={index} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 flex flex-col items-center justify-center text-center transition-colors min-h-[120px]">
            <h3 className="text-xs font-medium text-black dark:text-gray-400 mb-2 text-center leading-tight">
              <b>{getDisplayName(stageData.stage)}</b>
            </h3>
            <button 
              onClick={() => navigateToStageDetails(stageData.stage)}
              className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1 hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
            >
              {stageData.count}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center leading-tight">
              {formatCurrency(stageData.amount)}
            </p>
          </div>
        ))}
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

  const textColor = 'var(--foreground)';
  
  // Check if we have no data yet
  if (pipelineData.length === 0) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-slate-900 transition-colors">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pipe Status</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pipeline Status</h1>
        
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

      {/* Latest Meetings Section */}
      <div className="mb-8">
        <LatestMeetings browserId={browserId} isInitialized={isInitialized} />
      </div>

      {/* Deal Risk Analysis Section */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Deal Risk Analysis</h2>
          <div className="flex items-center space-x-4">
            <select
              className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
              value={dealRiskAnalysis.selectedStage || ''}
              onChange={(e) => {
                const selectedStage = e.target.value;
                updateState('controlPanel.dealRiskAnalysis.selectedStage', selectedStage);
                if (selectedStage) {
                  fetchDealRiskData(selectedStage);
                }
              }}
            >
              <option value="">Select a stage</option>
              {pipelineData
                .filter(item => 
                  showActivePipe ? 
                    item.stage !== "Closed Marketing Nurture" && 
                    item.stage !== "Closed Lost" &&
                    item.stage !== "Closed Won" &&
                    item.stage !== "0. Identification"
                  : true
                )
                .map((item, index) => (
                  <option key={index} value={item.stage}>
                    {item.stage} ({item.count} deals)
                  </option>
                ))}
            </select>
            <button
              onClick={() => {
                if (dealRiskAnalysis.selectedStage) {
                  console.log('Manual refresh triggered for stage:', dealRiskAnalysis.selectedStage);
                  // Force fresh fetch from backend
                  fetchDealRiskData(dealRiskAnalysis.selectedStage, true);
                }
              }}
              disabled={!dealRiskAnalysis.selectedStage}
              className={`px-3 py-1 rounded transition-colors text-sm flex items-center ${
                dealRiskAnalysis.selectedStage 
                  ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white' 
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
              title={dealRiskAnalysis.selectedStage ? "Refresh risk data" : "Select a stage first"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {dealRiskAnalysis.loading && (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-indigo-400"></div>
            <span className="ml-2 text-gray-600 dark:text-gray-300">Loading risk data...</span>
          </div>
        )}

        {dealRiskAnalysis.error && (
          <div className="text-center text-red-500 dark:text-red-400 p-4">
            <p>{dealRiskAnalysis.error}</p>
          </div>
        )}

        {dealRiskAnalysis.selectedStage && (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Deal Name
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Overall Risk
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Decision Maker Risk
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Pricing Concerns
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Competitor Risk
                  </th>
                  <th className="px-4 py-3 bg-gray-50 dark:bg-slate-700 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Sentiment Trend
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                {(dealRiskAnalysis.riskData || []).map((deal, index) => {
                  const getRiskLevelColor = (level: string) => {
                    switch (level.toLowerCase()) {
                      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                      case 'mild': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
                      case 'warn': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
                      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'; // fallback for old values
                      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'; // fallback for old values
                      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
                      case 'loading...': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
                      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
                    }
                  };

                  const getRiskScoreDisplay = (factor: any) => {
                    if (deal.isLoading) {
                      return 'Loading...';
                    }
                    if (deal.hasError) {
                      return 'Error';
                    }
                    
                    // Convert numeric score to risk level
                    const percentage = (factor.risk_score / factor.max_score) * 100;
                    
                    if (percentage === 0) {
                      return 'Low';
                    } else if (percentage <= 75) {
                      return 'Mild';
                    } else {
                      return 'Warn';
                    }
                  };

                  const getRiskScoreColor = (factor: any) => {
                    if (deal.isLoading || deal.hasError) {
                      return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
                    }
                    
                    const percentage = (factor.risk_score / factor.max_score) * 100;
                    
                    if (percentage === 0) {
                      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'; // Low
                    } else if (percentage <= 75) {
                      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'; // Mild
                    } else {
                      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'; // Warn
                    }
                  };

                  const getTooltipContent = (factor: any) => {
                    if (deal.isLoading) {
                      return 'Loading risk data...';
                    }
                    if (deal.hasError) {
                      return 'Failed to load risk data';
                    }
                    if (factor.risk_score === 'N/A' || factor.max_score === 'N/A') {
                      return 'No data available';
                    }
                    // Concatenate details array into a single string
                    return factor.details && factor.details.length > 0 
                      ? factor.details.join(' • ')
                      : 'No details available';
                  };

                  const renderRiskFactor = (factor: any, factorKey: string) => {
                    if (deal.isLoading) {
                      return (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          Loading...
                        </span>
                      );
                    }
                    
                    if (deal.hasError) {
                      return (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          Error
                        </span>
                      );
                    }

                    return (
                      <div className="relative group">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskScoreColor(factor)} cursor-help`}>
                          {getRiskScoreDisplay(factor)}
                        </span>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10 max-w-xs">
                          {getTooltipContent(factor)}
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        <button 
                          onClick={() => {
                            const encodedDealName = encodeURIComponent(deal.deal_name);
                            router.push(`/deal-timeline?dealName=${encodedDealName}&autoload=true`);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-left cursor-pointer"
                        >
                          {deal.deal_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {deal.isLoading ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            Loading...
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskLevelColor(deal.risk_level)}`}>
                            {deal.risk_level}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {renderRiskFactor(deal.risk_factors.no_decision_maker, 'no_decision_maker')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {renderRiskFactor(deal.risk_factors.pricing_concerns, 'pricing_concerns')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {renderRiskFactor(deal.risk_factors.competitor_presence, 'competitor_presence')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {renderRiskFactor(deal.risk_factors.sentiment_trends, 'sentiment_trends')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!dealRiskAnalysis.selectedStage && (
          <div className="text-center text-gray-500 dark:text-gray-400 p-8">
            <p>Select a stage to view deal risk analysis</p>
          </div>
        )}

        {dealRiskAnalysis.selectedStage && (dealRiskAnalysis.riskData || []).length === 0 && !dealRiskAnalysis.loading && (
          <div className="text-center text-gray-500 dark:text-gray-400 p-8">
            <p>No deals found for the selected stage</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Custom Funnel Stacked Bar Chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow transition-colors h-[900px]">
                      <div className="flex justify-between items-center mb-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Pipeline Funnel</h2>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showActivePipe"
                  checked={showActivePipe}
                  onChange={(e) => setShowActivePipe(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="showActivePipe" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Show active pipe
                </label>
              </div>
              <select
                className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-md py-1 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                value={sortBy}
                onChange={handleSortChange}
              >
                <option value="count">Sort by Deals Count</option>
                <option value="amount">Sort by Pipeline Amount</option>
              </select>
            </div>
          </div>
          <div className="h-[800px] flex items-center justify-center">
            <div className="relative w-full max-w-md">
              {/* Custom Stacked Bar */}
              <div className="relative h-[600px]">
                {getStackData().map((entry, index) => {
                  const stackData = getStackData();
                  const totalValue = stackData.reduce((sum, item) => sum + item.value, 0);
                  
                  // Calculate minimum height needed for text (approximately 40px for two lines of text)
                  const minHeight = 40;
                  const totalMinHeight = stackData.length * minHeight;
                  
                  // Calculate proportional heights with minimum
                  const proportionalHeight = (entry.value / totalValue) * 600;
                  const adjustedHeight = Math.max(proportionalHeight, minHeight);
                  
                  // Recalculate positions with adjusted heights
                  let adjustedYPosition = 0;
                  for (let i = 0; i < index; i++) {
                    const prevEntry = stackData[i];
                    const prevProportionalHeight = (prevEntry.value / totalValue) * 600;
                    const prevAdjustedHeight = Math.max(prevProportionalHeight, minHeight);
                    adjustedYPosition += prevAdjustedHeight;
                  }
                  
                  return (
                    <div
                      key={`segment-${index}`}
                      className="absolute left-0 right-0 cursor-pointer transition-all duration-200 hover:opacity-90 rounded-sm"
                      style={{
                        top: `${adjustedYPosition}px`,
                        height: `${adjustedHeight}px`,
                        backgroundColor: COLORS[index % COLORS.length],
                        zIndex: 1
                      }}
                      onClick={() => navigateToStageDetails(entry.name)}
                      onMouseEnter={(e) => {
                        const tooltip = e.currentTarget.querySelector('.segment-tooltip');
                        if (tooltip) {
                          (tooltip as HTMLElement).style.display = 'block';
                        }
                      }}
                      onMouseLeave={(e) => {
                        const tooltip = e.currentTarget.querySelector('.segment-tooltip');
                        if (tooltip) {
                          (tooltip as HTMLElement).style.display = 'none';
                        }
                      }}
                    >
                      {/* Segment Content */}
                      <div className="h-full flex flex-col justify-center items-center text-center px-2">
                        <div className="font-semibold text-xs text-white drop-shadow-sm">
                          {entry.name}
                        </div>
                        <div className="text-xs text-white drop-shadow-sm">
                          ({sortBy === 'amount' ? formatAbbreviatedCurrency(entry.value) : entry.value})
                        </div>
                      </div>
                      
                      {/* Custom Tooltip */}
                      <div 
                        className="segment-tooltip absolute hidden bg-white dark:bg-slate-800 p-3 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700"
                        style={{
                          left: '50%',
                          transform: 'translateX(-50%)',
                          bottom: '100%',
                          marginBottom: '8px',
                          minWidth: '200px',
                          zIndex: 9999
                        }}
                      >
                        <div className="text-sm">
                          <div className="font-bold text-gray-900 dark:text-white mb-1">
                            {entry.name}
                          </div>
                          <div className="text-gray-700 dark:text-gray-300">
                            {sortBy === 'amount' ? formatAbbreviatedCurrency(entry.value) : entry.value} {sortBy === 'count' ? 'deals' : 'pipeline value'}
                          </div>
                          <div className="text-gray-700 dark:text-gray-300">
                            {entry.count} deals • {entry.formattedAmount}
                          </div>
                        </div>
                        {/* Tooltip Arrow */}
                        <div 
                          className="absolute top-full left-1/2 transform -translate-x-1/2"
                          style={{
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '6px solid white',
                            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              

            </div>
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