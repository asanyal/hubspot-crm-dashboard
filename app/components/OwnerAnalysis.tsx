'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ComposedChart, Line, LabelList, AreaChart, Area } from 'recharts';
import { API_CONFIG } from '../utils/config';

// Types
interface DealWithSignals {
  deal_name: string;
  signal_dates: string[];
}

interface SentimentData {
  count: number;
  deals: DealWithSignals[];
}

// Raw API response structure (now matches the actual API)
interface RawSentimentData {
  count: number;
  deals: DealWithSignals[];
}

interface RawOwnerPerformance {
  _id: string;
  owner: string;
  deals_performance: {
    'likely to buy': RawSentimentData;
    'very likely to buy': RawSentimentData;
    'less likely to buy': RawSentimentData;
    'neutral': RawSentimentData;
  };
}

// Processed structure for UI (maintains existing naming)
interface OwnerPerformance {
  _id: string;
  owner: string;
  deals_performance: {
    positive: SentimentData;
    negative: SentimentData;
    neutral: SentimentData;
  };
}

interface RawOwnerAnalysisData {
  owners: RawOwnerPerformance[];
}

interface OwnerAnalysisData {
  owners: OwnerPerformance[];
}

interface ProcessedOwnerData extends OwnerPerformance {
  totalInteractions: number;
  positiveRatio: number;
  efficiencyScore: number;
}

interface TeamSummary {
  totalPositive: number;
  totalNeutral: number;
  totalNegative: number;
  totalInteractions: number;
  averagePositiveRatio: number;
  topPerformer: string;
  bottomPerformer: string;
}

interface HealthScoreBucket {
  bucket_start: string;
  bucket_end: string;
  business_days: number;
  positive_signals: number;
  neutral_signals: number;
  negative_signals: number;
  ratio: number;
}

interface HealthScoreData {
  buckets: HealthScoreBucket[];
}



const COLORS = {
  positive: '#10b981', // green
  neutral: '#f59e0b',  // yellow
  negative: '#ef4444'  // red
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];



// Utility function to format dates and create display text for deals
const formatDateAndCount = (deal: DealWithSignals): string => {
  if (!deal.signal_dates || deal.signal_dates.length === 0) {
    return '';
  }
  
  const firstDate = deal.signal_dates[0];
  const signalCount = deal.signal_dates.length;
  
  // Parse the date and format it as "Jan 4 '25"
  let formattedDate = '';
  try {
    const date = new Date(firstDate);
    if (!isNaN(date.getTime())) {
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      const year = date.getFullYear().toString().slice(-2); // Get last 2 digits
      formattedDate = `${month} ${day} '${year}`;
    } else {
      // Fallback to original format if date parsing fails
      formattedDate = firstDate.replace('2027', "'27").replace('2026', "'26").replace('2025', "'25").replace('2024', "'24").replace('2023', "'23");
    }
  } catch (error) {
    // Fallback to original format if date parsing fails
    formattedDate = firstDate.replace('2027', "'27").replace('2026', "'26").replace('2025', "'25").replace('2024', "'24").replace('2023', "'23");
  }
  
  if (signalCount === 1) {
    return `(${formattedDate})`;
  } else {
    return `(${formattedDate} and ${signalCount - 1} others)`;
  }
};

// Utility function to truncate deal names to 20 characters
const truncateDealName = (dealName: string): string => {
  if (!dealName) return '';
  if (dealName.length <= 20) {
    return dealName;
  }
  return dealName.substring(0, 20) + '...';
};

const OwnerAnalysis: React.FC = () => {
  const [data, setData] = useState<OwnerAnalysisData | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedOwnerData[]>([]);
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<ProcessedOwnerData | null>(null);
  const [selectedSentiment, setSelectedSentiment] = useState<'positive' | 'neutral' | 'negative' | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, { positive: boolean; neutral: boolean; negative: boolean }>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [browserId, setBrowserId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [healthScoreData, setHealthScoreData] = useState<HealthScoreData | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{name: string, createdDate: string}>>([]);
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Initialize browser ID on component mount
  useEffect(() => {
    const initializeBrowserId = () => {
      let storedBrowserId = localStorage.getItem('browserId');
      if (!storedBrowserId) {
        storedBrowserId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('browserId', storedBrowserId);
      }
      setBrowserId(storedBrowserId);
      setIsInitialized(true);
    };

    initializeBrowserId();
  }, []);

  // Utility function for making API calls with session management
  const makeApiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!browserId || !isInitialized) {
      throw new Error('Browser ID not initialized');
    }

    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('sessionId', sessionId);
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Browser-ID': browserId,
      'X-Session-ID': sessionId,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }, [browserId, isInitialized]);

  // Fetch raw owner performance data
  const fetchRawOwnerData = useCallback(async (): Promise<RawOwnerAnalysisData> => {
    try {
      const apiPath = API_CONFIG.getApiPath('/deal-owner-performance');
      const rawResult: RawOwnerAnalysisData = await makeApiCall(apiPath);
      return rawResult;
    } catch (error) {
      console.error('Error fetching raw owner performance data:', error);
      throw error;
    }
  }, [makeApiCall]);

  // Fetch health score data
  const fetchHealthScoreData = useCallback(async (): Promise<HealthScoreData> => {
    try {
      const startDate = '1 Sep 2024';
      const endDate = new Date();
      const endDateFormatted = `${endDate.getDate()} ${endDate.toLocaleDateString('en-US', { month: 'short' })} ${endDate.getFullYear()}`;
      console.log("End date formatted: ", endDateFormatted);
      const apiPath = `${API_CONFIG.getApiPath('/health-scores')}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDateFormatted)}`;
      const result: HealthScoreData = await makeApiCall(apiPath);
      console.log('Raw API response:', result);
      console.log('Sample bucket data:', result.buckets[0]);
      console.log('API path:', apiPath);
      return result;
    } catch (error) {
      console.error('Error fetching health score data:', error);
      throw error;
    }
  }, [makeApiCall]);



  // Get all unique deal names for search
  const getAllDealNames = useCallback((): string[] => {
    if (!data) return [];
    
    const dealNames = new Set<string>();
    data.owners.forEach(owner => {
      Object.values(owner.deals_performance).forEach(sentiment => {
        sentiment.deals.forEach(deal => {
          dealNames.add(deal.deal_name);
        });
      });
    });
    return Array.from(dealNames).sort();
  }, [data]);

  // Get all deals with their creation dates
  const getAllDealsWithDates = useCallback((): Array<{name: string, createdDate: string}> => {
    if (!data || !data.owners) return [];
    
    try {
      const dealsMap = new Map<string, string>();
      data.owners.forEach(owner => {
        if (!owner.deals_performance) return;
        
        Object.values(owner.deals_performance).forEach(sentiment => {
          if (!sentiment || !sentiment.deals) return;
          
          sentiment.deals.forEach(deal => {
            if (!deal || !deal.deal_name) return;
            
            if (!dealsMap.has(deal.deal_name)) {
              // Find the earliest signal date as creation date
              let earliestDate = '';
              if (deal.signal_dates && deal.signal_dates.length > 0) {
                try {
                  const dates = deal.signal_dates
                    .map(date => new Date(date))
                    .filter(date => !isNaN(date.getTime()));
                  
                  if (dates.length > 0) {
                    earliestDate = dates.reduce((earliest, current) => 
                      current < earliest ? current : earliest
                    ).toISOString().split('T')[0];
                  }
                } catch (dateError) {
                  console.warn('Error parsing dates for deal:', deal.deal_name, dateError);
                }
              }
              dealsMap.set(deal.deal_name, earliestDate);
            }
          });
        });
      });
      
      return Array.from(dealsMap.entries())
        .map(([name, createdDate]) => ({ name, createdDate }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error in getAllDealsWithDates:', error);
      return [];
    }
  }, [data]);

  // Check if a deal is a hot deal (4+ positive signals)
  const isHotDeal = useCallback((dealName: string): boolean => {
    if (!data) return false;
    
    let totalPositiveSignals = 0;
    data.owners.forEach(owner => {
      const positiveDeals = owner.deals_performance.positive.deals;
      positiveDeals.forEach(deal => {
        if (deal.deal_name === dealName) {
          totalPositiveSignals += deal.signal_dates ? deal.signal_dates.length : 0;
        }
      });
    });
    
    return totalPositiveSignals >= 4;
  }, [data]);

  // Filter data based on selected deal
  const getFilteredData = useCallback((rawData: OwnerAnalysisData, dealName: string | null): OwnerAnalysisData => {
    if (!dealName) return rawData;
    
    return {
      owners: rawData.owners.map(owner => {
        const filteredPerformance = {
          positive: { count: 0, deals: [] as DealWithSignals[] },
          negative: { count: 0, deals: [] as DealWithSignals[] },
          neutral: { count: 0, deals: [] as DealWithSignals[] }
        };
        
        Object.entries(owner.deals_performance).forEach(([key, sentiment]) => {
          const filteredDeals = sentiment.deals.filter(deal => 
            deal.deal_name.toLowerCase().includes(dealName.toLowerCase())
          );
          
          // Calculate total signal count for this sentiment across all matching deals
          const totalSignals = filteredDeals.reduce((sum, deal) => 
            sum + (deal.signal_dates ? deal.signal_dates.length : 0), 0
          );
          
          if (key === 'positive') {
            filteredPerformance.positive = { count: totalSignals, deals: filteredDeals };
          } else if (key === 'negative') {
            filteredPerformance.negative = { count: totalSignals, deals: filteredDeals };
          } else if (key === 'neutral') {
            filteredPerformance.neutral = { count: totalSignals, deals: filteredDeals };
          }
        });
        
        return {
          ...owner,
          deals_performance: filteredPerformance
        };
      }).filter(owner => 
        owner.deals_performance.positive.count > 0 || 
        owner.deals_performance.negative.count > 0 || 
        owner.deals_performance.neutral.count > 0
      )
    };
  }, []);

  // Transform raw data to expected format
  const transformOwnerData = useCallback((rawResult: RawOwnerAnalysisData): OwnerAnalysisData => {
    return {
      owners: rawResult.owners.map(owner => {
        // Combine "likely to buy" and "very likely to buy" into "positive"
        const positiveCount = (owner.deals_performance['likely to buy']?.count || 0) + 
                             (owner.deals_performance['very likely to buy']?.count || 0);
        const positiveDeals = [
          ...(owner.deals_performance['likely to buy']?.deals || []),
          ...(owner.deals_performance['very likely to buy']?.deals || [])
        ];
        
        // Map "less likely to buy" to "negative"
        const negativeCount = owner.deals_performance['less likely to buy']?.count || 0;
        const negativeDeals = owner.deals_performance['less likely to buy']?.deals || [];
        
        // Keep neutral as is
        const neutralCount = owner.deals_performance['neutral']?.count || 0;
        const neutralDeals = owner.deals_performance['neutral']?.deals || [];
        
        return {
          _id: owner._id,
          owner: owner.owner,
          deals_performance: {
            positive: {
              count: positiveCount,
              deals: positiveDeals
            },
            negative: {
              count: negativeCount,
              deals: negativeDeals
            },
            neutral: {
              count: neutralCount,
              deals: neutralDeals
            }
          }
        };
      })
    };
  }, []);

  // Process raw data into enhanced format
  const processOwnerData = useCallback((rawData: OwnerAnalysisData): ProcessedOwnerData[] => {
    const excludedOwners = ['Galileo Marketing', 'Yash Sheth', 'Vikram Chatterji'];
    
    return rawData.owners
      .filter(owner => !excludedOwners.includes(owner.owner)) // Exclude specified owners
      .map(owner => {
        const totalInteractions = owner.deals_performance.positive.count + 
                                owner.deals_performance.neutral.count + 
                                owner.deals_performance.negative.count;
        
        const positiveRatio = totalInteractions > 0 ? 
          (owner.deals_performance.positive.count / totalInteractions) * 100 : 0;
        
        const efficiencyScore = totalInteractions > 0 ? 
          (owner.deals_performance.positive.count / totalInteractions) * 100 : 0;

        return {
          ...owner,
          totalInteractions,
          positiveRatio,
          efficiencyScore
        };
      })
      .filter(owner => owner.totalInteractions > 0) // Filter out owners with no interactions
      .sort((a, b) => b.positiveRatio - a.positiveRatio); // Sort by positive ratio descending
  }, []);

  // Handle search input changes
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (query.length === 0) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    try {
      // Get deals with their creation dates
      const dealsWithDates = getAllDealsWithDates();
      if (dealsWithDates.length > 0) {
        const filtered = dealsWithDates.filter(deal => 
          deal.name.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10); // Limit to 10 suggestions
        
        setSearchSuggestions(filtered);
        setShowSuggestions(true);
      } else {
        // Fallback to simple deal names if dates function fails
        const allDeals = getAllDealNames();
        const filtered = allDeals.filter(deal => 
          deal.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
        
        // Convert to the expected format
        const fallbackSuggestions = filtered.map(name => ({ name, createdDate: '' }));
        setSearchSuggestions(fallbackSuggestions);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error getting deals with dates:', error);
      // Fallback to simple deal names
      try {
        const allDeals = getAllDealNames();
        const filtered = allDeals.filter(deal => 
          deal.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
        
        const fallbackSuggestions = filtered.map(name => ({ name, createdDate: '' }));
        setSearchSuggestions(fallbackSuggestions);
        setShowSuggestions(true);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        setSearchSuggestions([]);
        setShowSuggestions(false);
      }
    }
  }, [getAllDealsWithDates, getAllDealNames]);

  // Handle deal selection
  const handleDealSelect = useCallback((dealName: string) => {
    setSelectedDeal(dealName);
    setSearchQuery(dealName);
    setShowSuggestions(false);
    setSearchSuggestions([]);
  }, []);

  // Clear deal filter
  const clearDealFilter = useCallback(() => {
    setSelectedDeal(null);
    setSearchQuery('');
    setShowSuggestions(false);
    setSearchSuggestions([]);
  }, []);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('#deal-search') && !target.closest('.search-suggestions')) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  // Calculate team summary statistics
  const calculateTeamSummary = useCallback((owners: ProcessedOwnerData[]): TeamSummary => {
    const totalPositive = owners.reduce((sum, owner) => sum + owner.deals_performance.positive.count, 0);
    const totalNeutral = owners.reduce((sum, owner) => sum + owner.deals_performance.neutral.count, 0);
    const totalNegative = owners.reduce((sum, owner) => sum + owner.deals_performance.negative.count, 0);
    const totalInteractions = totalPositive + totalNeutral + totalNegative;
    
    const averagePositiveRatio = owners.length > 0 ? 
      owners.reduce((sum, owner) => sum + owner.positiveRatio, 0) / owners.length : 0;
    
    const sortedByPositiveRatio = [...owners].sort((a, b) => b.positiveRatio - a.positiveRatio);
    const topPerformer = sortedByPositiveRatio[0]?.owner || 'N/A';
    const bottomPerformer = sortedByPositiveRatio[sortedByPositiveRatio.length - 1]?.owner || 'N/A';

    return {
      totalPositive,
      totalNeutral,
      totalNegative,
      totalInteractions,
      averagePositiveRatio,
      topPerformer,
      bottomPerformer
    };
  }, []);

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      if (!isInitialized) return;

      setLoading(true);
      setError(null);
      
      try {
        const rawData = await fetchRawOwnerData();
        
        // Transform raw data for UI
        const transformedData = transformOwnerData(rawData);
        setData(transformedData);
        
        // Apply deal filter if selected
        const filteredData = getFilteredData(transformedData, selectedDeal);
        const processed = processOwnerData(filteredData);
        setProcessedData(processed);
        
        // Auto-select the first owner (top performer)
        if (processed.length > 0 && !selectedOwner) {
          setSelectedOwner(processed[0]);
        }
        
        const summary = calculateTeamSummary(processed);
        setTeamSummary(summary);
        
        // Fetch health score data
        const healthData = await fetchHealthScoreData();
        setHealthScoreData(healthData);
      } catch (error) {
        console.error('Error loading Signals:', error);
        setError(error instanceof Error ? error.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isInitialized, fetchRawOwnerData, transformOwnerData, processOwnerData, calculateTeamSummary, fetchHealthScoreData, selectedDeal, getFilteredData]);

  // Refilter data when selectedDeal changes
  useEffect(() => {
    if (data) {
      const filteredData = getFilteredData(data, selectedDeal);
      const processed = processOwnerData(filteredData);
      setProcessedData(processed);
      
      if (processed.length > 0) {
        setSelectedOwner(processed[0]);
        const summary = calculateTeamSummary(processed);
        setTeamSummary(summary);
      } else {
        setSelectedOwner(null);
        setTeamSummary(null);
      }
    }
  }, [selectedDeal, data, getFilteredData, processOwnerData, calculateTeamSummary]);

  // Toggle expanded row for specific owner and sentiment
  const toggleExpandedRow = useCallback((ownerId: string, sentiment: 'positive' | 'neutral' | 'negative') => {
    setExpandedRows(prev => ({
      ...prev,
      [ownerId]: {
        ...prev[ownerId],
        [sentiment]: !prev[ownerId]?.[sentiment]
      }
    }));
  }, []);

  // Render deal list with links
  const renderDealList = useCallback((deals: DealWithSignals[], sentiment: 'positive' | 'neutral' | 'negative') => {
    const colorClass = sentiment === 'positive' ? 'text-green-600' : 
                      sentiment === 'neutral' ? 'text-yellow-600' : 'text-red-600';
    
    // Sort deals by first date (earliest first)
    const sortedDeals = [...deals].sort((a, b) => {
      if (a.signal_dates.length === 0 && b.signal_dates.length === 0) return 0;
      if (a.signal_dates.length === 0) return 1;
      if (b.signal_dates.length === 0) return -1;
      
      const aFirstDate = new Date(a.signal_dates[0]);
      const bFirstDate = new Date(b.signal_dates[0]);
      
      return bFirstDate.getTime() - aFirstDate.getTime();
    });

    return (
      <div className="mt-2 p-3 bg-gray-50 rounded-md">
        <div className="grid gap-1">
          {sortedDeals.map((deal, index) => (
            <a
              key={index}
              href={`/deal-timeline?dealName=${encodeURIComponent(deal.deal_name)}&auto_load=true`}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm hover:underline ${colorClass} block truncate`}
              title={deal.deal_name}
            >
              <div className="flex items-center gap-2">
                <span>{truncateDealName(deal.deal_name)}</span>
                {isHotDeal(deal.deal_name) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    🔥 HOT
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">{formatDateAndCount(deal)}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }, []);

  const teamPieData = teamSummary ? [
    { name: 'Positive', value: teamSummary.totalPositive, color: COLORS.positive },
    { name: 'Neutral', value: teamSummary.totalNeutral, color: COLORS.neutral },
    { name: 'Negative', value: teamSummary.totalNegative, color: COLORS.negative }
  ] : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading Signals...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="text-red-600 text-lg font-semibold">Error loading data</div>
            <p className="mt-2 text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900">Customer Signals</h1>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="max-w-2xl">
            <label htmlFor="deal-search" className="block text-sm font-medium text-gray-700 mb-2">
              Search for a specific deal
            </label>
            <div className="relative">
              <input
                type="text"
                id="deal-search"
                placeholder="Search a specific deal"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchQuery.length > 0 && setShowSuggestions(true)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              
              {/* Clear button */}
              {selectedDeal && (
                <button
                  onClick={clearDealFilter}
                  className="absolute right-12 top-1/2 transform -translate-y-1/2 px-3 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Clear
                </button>
              )}
              
              {/* Search suggestions dropdown */}
              {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto search-suggestions">
                  {searchSuggestions.map((deal, index) => (
                    <button
                      key={index}
                      onClick={() => handleDealSelect(deal.name)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{deal.name}</span>
                        {deal.createdDate && (
                          <span className="text-sm text-gray-500">
                            Created: {new Date(deal.createdDate).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Active filter indicator */}
            {selectedDeal && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-gray-600">Filtering by:</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {selectedDeal}
                  </span>
                  {isHotDeal(selectedDeal) && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 animate-pulse">
                      🔥 HOT DEAL
                    </span>
                  )}
                </div>
                <button
                  onClick={clearDealFilter}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>
        </div>



        {/* Performance Metrics Cards */}
        {teamSummary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">Captured Signals</h3>
              <p className="text-3xl font-bold text-blue-600 mt-2">{teamSummary.totalInteractions.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Across all owners</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-800">Buying Signals</h3>
                <div className="relative group">
                  <button className="w-4 h-4 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors">
                    ?
                  </button>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                    <div className="text-center leading-relaxed">
                      A buying signal points to an intent to buy or use the product at some point in the conversation. The buyer leaned in and showcased leading indicators of their pain points being addressed, and interest in next steps in the direction of a purchase.
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
              <p className="text-3xl font-bold text-green-600 mt-2">{teamSummary.totalPositive.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Across all owners</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-800">Negative Signals</h3>
                <div className="relative group">
                  <button className="w-4 h-4 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors">
                    ?
                  </button>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                    <div className="text-center leading-relaxed">
                      A negative signal reflects the buyer showing disinterest, confusion, or explicit dissatisfaction.
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
              <p className="text-3xl font-bold text-red-600 mt-2">{teamSummary.totalNegative.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Across all owners</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-800">Neutral Signals</h3>
                <div className="relative group">
                  <button className="w-4 h-4 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors">
                    ?
                  </button>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-80">
                    <div className="text-center leading-relaxed">
                      Neutral signals can be a negative signals in disguise, indicating a lack of strong interest. But usually a neutral signal reflects neither keen interest nor explicit negativity. It also could be a regular sync meeting without explicit needs of an intent. 
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{teamSummary.totalNeutral.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Across all owners</p>
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Team Distribution Pie Chart */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Signal Distribution</h3>
            {teamPieData.length > 0 && (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={teamPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {teamPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Interactions']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Owner Signal Breakdown</h3>
            <div className="mb-4">
              <select 
                className="w-full p-2 border border-gray-300 rounded-md"
                value={selectedOwner?.owner || ''}
                onChange={(e) => {
                  const owner = processedData.find(o => o.owner === e.target.value);
                  setSelectedOwner(owner || null);
                  setSelectedSentiment(null); // Reset sentiment selection
                }}
              >
                <option value="">Select an owner...</option>
                {processedData.map(owner => (
                  <option key={owner._id} value={owner.owner}>
                    {owner.owner} ({owner.totalInteractions} interactions)
                  </option>
                ))}
              </select>
            </div>
            
            {selectedOwner ? (
              <div className="space-y-4">
                {/* Sentiment Buttons */}
                <div className="grid grid-cols-3 gap-4">
                  <button
                    onClick={() => setSelectedSentiment(selectedSentiment === 'positive' ? null : 'positive')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                      selectedSentiment === 'positive' 
                        ? 'border-green-500 bg-green-50 shadow-md' 
                        : 'border-gray-200 hover:border-green-300 hover:shadow-lg hover:bg-green-50/30 hover:scale-105'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedOwner.deals_performance.positive.count}
                      </div>
                      <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                        Buying Signals
                        <div className="relative group">
                          <span className="w-3 h-3 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors cursor-help">
                            ?
                          </span>
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                            <div className="text-center leading-relaxed">
                              A positive signal means the buyer demonstrated intent at some point in the conversation, they leaned in, and showed signs of using the product.
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedSentiment(selectedSentiment === 'neutral' ? null : 'neutral')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                      selectedSentiment === 'neutral' 
                        ? 'border-yellow-500 bg-yellow-50 shadow-md' 
                        : 'border-gray-200 hover:border-yellow-300 hover:shadow-lg hover:bg-yellow-50/30 hover:scale-105'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {selectedOwner.deals_performance.neutral.count}
                      </div>
                      <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                        Neutral Signals
                        <div className="relative group">
                          <span className="w-3 h-3 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors cursor-help">
                            ?
                          </span>
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-80">
                            <div className="text-center leading-relaxed">
                              A neutral signal reflects a buyer expressing neither interest nor negative signals. It could just mean its a regular meeting (without any intent), or could point to a negative signal due to the "Mom test" principle.
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedSentiment(selectedSentiment === 'negative' ? null : 'negative')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                      selectedSentiment === 'negative' 
                        ? 'border-red-500 bg-red-50 shadow-md' 
                        : 'border-gray-200 hover:border-red-300 hover:shadow-lg hover:bg-red-50/30 hover:scale-105'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {selectedOwner.deals_performance.negative.count}
                      </div>
                      <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                        Negative Signals
                        <div className="relative group">
                          <span className="w-3 h-3 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors cursor-help">
                            ?
                          </span>
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                            <div className="text-center leading-relaxed">
                              A negative signal reflects the buyer showing disinterest, confusion, or explicit dissatisfaction.
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Deal List */}
                {selectedSentiment && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2 capitalize">
                      {selectedSentiment} Signals ({selectedOwner.deals_performance[selectedSentiment].count})
                    </h4>
                    <div className="max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                      {selectedOwner.deals_performance[selectedSentiment].deals.length > 0 ? (
                        <div className="grid gap-2">
                          {(() => {
                            // Sort deals by first date (most recent first)
                            const sortedDeals = [...selectedOwner.deals_performance[selectedSentiment].deals].sort((a, b) => {
                              if (!a.signal_dates || !b.signal_dates) return 0;
                              if (a.signal_dates.length === 0 && b.signal_dates.length === 0) return 0;
                              if (a.signal_dates.length === 0) return 1;
                              if (b.signal_dates.length === 0) return -1;
                              
                              const aFirstDate = new Date(a.signal_dates[0]);
                              const bFirstDate = new Date(b.signal_dates[0]);
                              
                              return bFirstDate.getTime() - aFirstDate.getTime();
                            });
                            
                            return sortedDeals.map((deal, index) => (
                              <a
                                key={index}
                                href={`/deal-timeline?dealName=${encodeURIComponent(deal.deal_name)}&auto_load=true`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-sm hover:underline block p-2 rounded hover:bg-white transition-colors ${
                                  selectedSentiment === 'positive' ? 'text-green-600 hover:text-green-800' :
                                  selectedSentiment === 'neutral' ? 'text-yellow-600 hover:text-yellow-800' :
                                  'text-red-600 hover:text-red-800'
                                }`}
                                title={deal.deal_name}
                              >
                                {truncateDealName(deal.deal_name)} <span className="text-xs text-gray-500">{formatDateAndCount(deal)}</span>
                              </a>
                            ));
                          })()}
                        </div>
                      ) : (
                        <div className="text-gray-500 text-sm">No deals found for this sentiment</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-500">
                Select an owner to view their breakdown
              </div>
            )}
          </div>
        </div>

        {/* Health Score Trends */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            Sales Performance
            {selectedDeal && (
              <span className="text-lg font-normal text-gray-600 ml-2">
                - Filtered by {selectedDeal}
              </span>
            )}
          </h3>
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Frequency of buying signals detected in calls across different time periods.
            </p>
            

          </div>
          
          {healthScoreData && healthScoreData.buckets.length > 0 ? (
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={(() => {
                    if (!selectedDeal || !data) return healthScoreData.buckets;
                    
                    // Filter buckets to only show data for the selected deal
                    return healthScoreData.buckets.map(bucket => {
                      let positiveSignals = 0;
                      let neutralSignals = 0;
                      let negativeSignals = 0;
                      
                      // Count signals for the selected deal across all owners
                      data.owners.forEach(owner => {
                        // Count positive signals
                        owner.deals_performance.positive.deals.forEach(deal => {
                          if (deal.deal_name.toLowerCase().includes(selectedDeal.toLowerCase())) {
                            deal.signal_dates?.forEach(date => {
                              const signalDate = new Date(date);
                              const bucketStart = new Date(bucket.bucket_start);
                              const bucketEnd = new Date(bucket.bucket_end);
                              
                              if (signalDate >= bucketStart && signalDate <= bucketEnd) {
                                positiveSignals++;
                              }
                            });
                          }
                        });
                        
                        // Count neutral signals
                        owner.deals_performance.neutral.deals.forEach(deal => {
                          if (deal.deal_name.toLowerCase().includes(selectedDeal.toLowerCase())) {
                            deal.signal_dates?.forEach(date => {
                              const signalDate = new Date(date);
                              const bucketStart = new Date(bucket.bucket_start);
                              const bucketEnd = new Date(bucket.bucket_end);
                              
                              if (signalDate >= bucketStart && signalDate <= bucketEnd) {
                                neutralSignals++;
                              }
                            });
                          }
                        });
                        
                        // Count negative signals
                        owner.deals_performance.negative.deals.forEach(deal => {
                          if (deal.deal_name.toLowerCase().includes(selectedDeal.toLowerCase())) {
                            deal.signal_dates?.forEach(date => {
                              const signalDate = new Date(date);
                              const bucketStart = new Date(bucket.bucket_start);
                              const bucketEnd = new Date(bucket.bucket_end);
                              
                              if (signalDate >= bucketStart && signalDate <= bucketEnd) {
                                negativeSignals++;
                              }
                            });
                          }
                        });
                      });
                      
                      return {
                        ...bucket,
                        positive_signals: positiveSignals,
                        neutral_signals: neutralSignals,
                        negative_signals: negativeSignals
                      };
                    });
                  })()}
                  margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  
                  {/* X-Axis with date ranges */}
                  <XAxis 
                    dataKey="bucket_start" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value, index) => {
                      const bucket = healthScoreData.buckets[index];
                      if (bucket) {
                        const start = new Date(bucket.bucket_start);
                        const end = new Date(bucket.bucket_end);
                        return `${start.getDate()} ${start.toLocaleDateString('en-US', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('en-US', { month: 'short' })}`;
                      }
                      return value;
                    }}
                  />
                  
                  {/* Y-Axis for signal counts */}
                  <YAxis 
                    label={{ value: 'Interactions', angle: -90, position: 'insideLeft' }}
                  />
                  
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === 'positive_signals') return [value, 'Positive Signals'];
                      if (name === 'neutral_signals') return [value, 'Neutral Signals'];
                      if (name === 'negative_signals') return [value, 'Negative Signals'];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Week of ${label}`}
                  />
                  
                  {/* Area charts for signal counts */}
                  <Area 
                    type="monotone" 
                    dataKey="positive_signals" 
                    stackId="1" 
                    fill="#10b981" 
                    stroke="#10b981"
                    fillOpacity={0.8}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="neutral_signals" 
                    stackId="1" 
                    fill="#f59e0b" 
                    stroke="#f59e0b"
                    fillOpacity={0.8}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="negative_signals" 
                    stackId="1" 
                    fill="#ef4444" 
                    stroke="#ef4444"
                    fillOpacity={0.8}
                  />
                  
                  {/* Legend */}
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    formatter={(value) => {
                      if (value === 'positive_signals') return 'Positive Signals';
                      if (value === 'neutral_signals') return 'Neutral Signals';
                      if (value === 'negative_signals') return 'Negative Signals';
                      return value;
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-500">
              No health score data available
            </div>
          )}
        </div>

        {/* Performance Rankings */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Performance Rankings</h3>
          <div className="overflow-x-auto">
            <table className="w-full table-auto" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 resize-x overflow-hidden min-w-[80px]">Rank</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 resize-x overflow-hidden min-w-[150px]">Owner</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 resize-x overflow-hidden min-w-[120px]">Positive Ratio</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 resize-x overflow-hidden min-w-[140px]">Total Interactions</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 resize-x overflow-hidden min-w-[140px]">
                    <div className="flex items-center justify-end gap-1">
                      Buying Signals
                      <div className="relative group">
                        <button className="w-3 h-3 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors">
                          ?
                        </button>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                          <div className="text-center leading-relaxed">
                            A positive signal means the buyer demonstrated intent at some point in the conversation, they leaned in, and showed signs of using the product.
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 resize-x overflow-hidden min-w-[130px]">
                    <div className="flex items-center justify-end gap-1">
                      Neutral Signals
                      <div className="relative group">
                        <button className="w-3 h-3 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors">
                          ?
                        </button>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-80">
                          <div className="text-center leading-relaxed">
                            A neutral signal reflects a buyer expressing neither interest nor negative signals. It could just mean its a regular meeting (without any intent), or could point to a negative signal due to the "Mom test" principle.
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 resize-x overflow-hidden min-w-[140px]">
                    <div className="flex items-center justify-end gap-1">
                      Negative Signals
                      <div className="relative group">
                        <button className="w-3 h-3 rounded-full border border-gray-400 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100 transition-colors">
                          ?
                        </button>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                          <div className="text-center leading-relaxed">
                            A negative signal reflects the buyer showing disinterest, confusion, or explicit dissatisfaction.
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((owner, index) => (
                  <React.Fragment key={owner._id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800' :
                          index === 1 ? 'bg-gray-100 text-gray-800' :
                          index === 2 ? 'bg-orange-100 text-orange-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900">{owner.owner}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-semibold ${
                          owner.positiveRatio >= 25 ? 'text-green-600' :
                          owner.positiveRatio >= 15 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {owner.positiveRatio.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700">{owner.totalInteractions.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => toggleExpandedRow(owner._id, 'positive')}
                          className="text-green-600 font-medium hover:text-green-800 hover:underline"
                        >
                          {owner.deals_performance.positive.count} {expandedRows[owner._id]?.positive ? '▼' : '▶'}
                        </button>
                        {expandedRows[owner._id]?.positive && (
                          <div className="mt-1">
                            {renderDealList(owner.deals_performance.positive.deals, 'positive')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => toggleExpandedRow(owner._id, 'neutral')}
                          className="text-yellow-600 font-medium hover:text-yellow-800 hover:underline"
                        >
                          {owner.deals_performance.neutral.count} {expandedRows[owner._id]?.neutral ? '▼' : '▶'}
                        </button>
                        {expandedRows[owner._id]?.neutral && (
                          <div className="mt-1">
                            {renderDealList(owner.deals_performance.neutral.deals, 'neutral')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => toggleExpandedRow(owner._id, 'negative')}
                          className="text-red-600 font-medium hover:text-red-800 hover:underline"
                        >
                          {owner.deals_performance.negative.count} {expandedRows[owner._id]?.negative ? '▼' : '▶'}
                        </button>
                        {expandedRows[owner._id]?.negative && (
                          <div className="mt-1">
                            {renderDealList(owner.deals_performance.negative.deals, 'negative')}
                          </div>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Statistics */}
        {teamSummary && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Team Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-700">Performance</h4>
                <p className="text-gray-600">
                  <span className="font-medium text-green-600">
                    {((teamSummary.totalPositive / teamSummary.totalInteractions) * 100).toFixed(1)}%
                  </span> of all team interactions lead to positive buying signals
                </p>
                <p className="text-gray-600">
                  <span className="font-medium text-red-600">
                    {((teamSummary.totalNegative / teamSummary.totalInteractions) * 100).toFixed(1)}%
                  </span> are negative interactions
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-gray-700">Signal Distribution</h4>
                <p className="text-gray-600">
                  <span className="font-medium">{processedData.length}</span> active deal owners
                </p>
                <p className="text-gray-600">
                  Average of <span className="font-medium">
                    {(teamSummary.totalInteractions / processedData.length).toFixed(0)}
                  </span> interactions per owner
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Deal Focus */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">🔥 Deals to Double Down</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {(() => {
              // Get all deals from all owners with their signal counts
              const allDeals: Array<{
                deal_name: string;
                owner: string;
                signal_dates: string[];
                positiveCount: number;
              }> = [];
              
              // Process deals from all owners
              data?.owners.forEach(owner => {
                const positiveDeals = owner.deals_performance.positive?.deals || [];
                
                positiveDeals.forEach(deal => {
                  if (!deal.signal_dates) return;
                  const positiveCount = deal.signal_dates.length;
                  
                  // Include if 4+ positive signals
                  if (positiveCount >= 4) {
                    allDeals.push({
                      deal_name: deal.deal_name,
                      owner: owner.owner,
                      signal_dates: deal.signal_dates,
                      positiveCount
                    });
                  }
                });
              });
              
              // Sort by positive count descending
              allDeals.sort((a, b) => b.positiveCount - a.positiveCount);
              
              if (allDeals.length === 0) {
                return (
                  <div className="text-gray-500 text-sm text-center py-4">
                    No high-priority deals found (4+ positive signals)
                  </div>
                );
              }
              
              // Sort by latest date (most recent first)
              allDeals.sort((a, b) => {
                if (!a.signal_dates || !b.signal_dates) return 0;
                if (a.signal_dates.length === 0 && b.signal_dates.length === 0) return 0;
                if (a.signal_dates.length === 0) return 1;
                if (b.signal_dates.length === 0) return -1;
                
                const aLatestDate = new Date(a.signal_dates[a.signal_dates.length - 1]);
                const bLatestDate = new Date(b.signal_dates[b.signal_dates.length - 1]);
                
                return bLatestDate.getTime() - aLatestDate.getTime();
              });
              
              return allDeals.map((deal, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={`/deal-timeline?dealName=${encodeURIComponent(deal.deal_name)}&auto_load=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline truncate"
                          title={deal.deal_name}
                        >
                          {truncateDealName(deal.deal_name)}
                        </a>
                        {isHotDeal(deal.deal_name) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            🔥 HOT
                          </span>
                        )}
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-sm text-gray-600 truncate" title={deal.owner}>
                          {deal.owner}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {deal.signal_dates.length > 0 && (
                          <span>
                            {formatDateAndCount({ deal_name: deal.deal_name, signal_dates: deal.signal_dates })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-xs font-medium text-green-600">
                        {deal.positiveCount} positive
                      </div>
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

      </div>
    </div>
  );
};

export default OwnerAnalysis;
