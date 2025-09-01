'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { API_CONFIG } from '../utils/config';

// Types
interface SentimentData {
  count: number;
  deals: string[];
}

interface OwnerPerformance {
  _id: string;
  owner: string;
  deals_performance: {
    positive: SentimentData;
    negative: SentimentData;
    neutral: SentimentData;
  };
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

const COLORS = {
  positive: '#10b981', // green
  neutral: '#f59e0b',  // yellow
  negative: '#ef4444'  // red
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

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

  // Fetch owner performance data
  const fetchOwnerData = useCallback(async () => {
    try {
      const apiPath = API_CONFIG.getApiPath('/deal-owner-performance');
      const result = await makeApiCall(apiPath);
      return result;
    } catch (error) {
      console.error('Error fetching owner performance data:', error);
      throw error;
    }
  }, [makeApiCall]);

  // Process raw data into enhanced format
  const processOwnerData = useCallback((rawData: OwnerAnalysisData): ProcessedOwnerData[] => {
    const excludedOwners = ['Galileo Marketing', 'Vikram Chatterji', 'Soumya Mohan', 'Yash Sheth'];
    
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
        const rawData = await fetchOwnerData();
        setData(rawData);
        
        const processed = processOwnerData(rawData);
        setProcessedData(processed);
        
        // Auto-select the first owner (top performer)
        if (processed.length > 0 && !selectedOwner) {
          setSelectedOwner(processed[0]);
        }
        
        const summary = calculateTeamSummary(processed);
        setTeamSummary(summary);
      } catch (error) {
        console.error('Error loading owner analysis data:', error);
        setError(error instanceof Error ? error.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isInitialized, fetchOwnerData, processOwnerData, calculateTeamSummary]);

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
  const renderDealList = useCallback((deals: string[], sentiment: 'positive' | 'neutral' | 'negative') => {
    const colorClass = sentiment === 'positive' ? 'text-green-600' : 
                      sentiment === 'neutral' ? 'text-yellow-600' : 'text-red-600';
    
    return (
      <div className="mt-2 p-3 bg-gray-50 rounded-md">
        <div className="grid gap-1">
          {deals.map((deal, index) => (
            <a
              key={index}
              href={`/deal-timeline?deal_name=${encodeURIComponent(deal)}&auto_load=true`}
              className={`text-sm hover:underline ${colorClass} block truncate`}
              title={deal}
            >
              • {deal}
            </a>
          ))}
        </div>
      </div>
    );
  }, []);

  // Prepare data for charts
  const chartData = processedData.map(owner => ({
    name: owner.owner,
    Positive: owner.deals_performance.positive.count,
    Neutral: owner.deals_performance.neutral.count,
    Negative: owner.deals_performance.negative.count,
    totalInteractions: owner.totalInteractions,
    positiveRatio: owner.positiveRatio
  }));

  const teamPieData = teamSummary ? [
    { name: 'Positive', value: teamSummary.totalPositive, color: COLORS.positive },
    { name: 'Neutral', value: teamSummary.totalNeutral, color: COLORS.neutral },
    { name: 'Negative', value: teamSummary.totalNegative, color: COLORS.negative }
  ] : [];

  const selectedOwnerPieData = selectedOwner ? [
    { name: 'Positive', value: selectedOwner.deals_performance.positive.count, color: COLORS.positive },
    { name: 'Neutral', value: selectedOwner.deals_performance.neutral.count, color: COLORS.neutral },
    { name: 'Negative', value: selectedOwner.deals_performance.negative.count, color: COLORS.negative }
  ] : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading owner analysis data...</p>
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
          <h1 className="text-3xl font-bold text-gray-900">Sentiment Analysis Dashboard</h1>
        </div>

        {/* Performance Metrics Cards */}
        {teamSummary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">Total Captured Sentiments</h3>
              <p className="text-3xl font-bold text-blue-600 mt-2">{teamSummary.totalInteractions.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Across all owners</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">Positive Sentiment</h3>
              <p className="text-3xl font-bold text-green-600 mt-2">{teamSummary.averagePositiveRatio.toFixed(1)}%</p>
              <p className="text-sm text-gray-500 mt-1">Team average</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">Top Performer</h3>
              <p className="text-xl font-bold text-purple-600 mt-2">{teamSummary.topPerformer}</p>
              <p className="text-sm text-gray-500 mt-1">Highest positive ratio</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">Active Owners</h3>
              <p className="text-3xl font-bold text-indigo-600 mt-2">{processedData.length}</p>
              <p className="text-sm text-gray-500 mt-1">With interactions</p>
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Team Distribution Pie Chart */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Team Distribution</h3>
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
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Deal Owner Breakdown</h3>
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
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedSentiment === 'positive' 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedOwner.deals_performance.positive.count}
                      </div>
                      <div className="text-sm text-gray-600">Positive</div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedSentiment(selectedSentiment === 'neutral' ? null : 'neutral')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedSentiment === 'neutral' 
                        ? 'border-yellow-500 bg-yellow-50' 
                        : 'border-gray-200 hover:border-yellow-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {selectedOwner.deals_performance.neutral.count}
                      </div>
                      <div className="text-sm text-gray-600">Neutral</div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedSentiment(selectedSentiment === 'negative' ? null : 'negative')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedSentiment === 'negative' 
                        ? 'border-red-500 bg-red-50' 
                        : 'border-gray-200 hover:border-red-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {selectedOwner.deals_performance.negative.count}
                      </div>
                      <div className="text-sm text-gray-600">Negative</div>
                    </div>
                  </button>
                </div>

                {/* Deal List */}
                {selectedSentiment && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2 capitalize">
                      {selectedSentiment} Sentiment Deals ({selectedOwner.deals_performance[selectedSentiment].count})
                    </h4>
                    <div className="max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                      {selectedOwner.deals_performance[selectedSentiment].deals.length > 0 ? (
                        <div className="grid gap-2">
                          {selectedOwner.deals_performance[selectedSentiment].deals.map((deal, index) => (
                            <a
                              key={index}
                              href={`/deal-timeline?deal_name=${encodeURIComponent(deal)}&auto_load=true`}
                              className={`text-sm hover:underline block p-2 rounded hover:bg-white transition-colors ${
                                selectedSentiment === 'positive' ? 'text-green-600 hover:text-green-800' :
                                selectedSentiment === 'neutral' ? 'text-yellow-600 hover:text-yellow-800' :
                                'text-red-600 hover:text-red-800'
                              }`}
                              title={deal}
                            >
                              • {deal}
                            </a>
                          ))}
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

        {/* Performance Rankings */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Performance Rankings</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Owner</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Positive Ratio</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Total Interactions</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Positive</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Neutral</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Negative</th>
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
                  </span> of all team interactions are positive
                </p>
                <p className="text-gray-600">
                  <span className="font-medium text-red-600">
                    {((teamSummary.totalNegative / teamSummary.totalInteractions) * 100).toFixed(1)}%
                  </span> are negative interactions
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-gray-700">Team Distribution</h4>
                <p className="text-gray-600">
                  <span className="font-medium">{processedData.length}</span> active deal owners
                </p>
                <p className="text-gray-600">
                  Average of <span className="font-medium">
                    {(teamSummary.totalInteractions / processedData.length).toFixed(0)}
                  </span> interactions per owner
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-gray-700">Performance Range</h4>
                <p className="text-gray-600">
                  Top performer: <span className="font-medium text-green-600">{teamSummary.topPerformer}</span>
                </p>
                <p className="text-gray-600">
                  Highest ratio: <span className="font-medium">
                    {processedData[0]?.positiveRatio.toFixed(1)}%
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default OwnerAnalysis;
