// app/components/UseCasesRisks.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { API_CONFIG } from '../utils/config';

interface Stage {
  stage_name: string;
  display_order: number;
  probability: number | null;
  closed_won: string | boolean;
  closed_lost: boolean;
}

interface UseCase {
  use_case: string;
  deal_name: string;
}

interface RiskItem {
  deal_name: string;
  explanation: string;
}

interface UseCasesRisksProps {
  browserId: string;
  isInitialized: boolean;
}

const UseCasesRisks: React.FC<UseCasesRisksProps> = ({ browserId, isInitialized }) => {
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedStage, setSelectedStage] = useState<string | null>('3. Technical Validation');
  const [selectedDateRange, setSelectedDateRange] = useState<string | null>('3m');
  const [insightType, setInsightType] = useState<'use-cases' | 'risks' | null>('use-cases');
  const [loading, setLoading] = useState(false);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [selectedRiskTypes, setSelectedRiskTypes] = useState<string[]>([]);

  const loadingTexts = [
    'Cogitating',
    'Ruminating',
    'Contemplating',
    'Percolating',
    'Calibrating',
    'Synthesizing',
    'Triangulating',
    'Extrapolating',
    'Discombobulating',
    'Prognosticating',
    'Pontificating',
    'Deliberating',
    'Scrutinizing',
    'Deciphering',
  ];

  const dateRangeOptions = [
    { label: 'Last 3 weeks', value: '3w', weeks: 3 },
    { label: 'Last 3 months', value: '3m', months: 3 },
    { label: 'Last 5 months', value: '5m', months: 5 },
    { label: 'Last 8 months', value: '8m', months: 8 },
    { label: 'Last 1 year', value: '1y', months: 12 },
  ];

  // Fetch stages on component mount
  useEffect(() => {
    if (isInitialized && browserId) {
      fetchStages();
    }
  }, [isInitialized, browserId]);

  // Clear insights when insight type changes
  useEffect(() => {
    setInsights(null);
    setError(null);
    setSelectedRiskTypes([]); // Reset risk type filters
  }, [insightType]);

  // Rotate loading text while loading
  useEffect(() => {
    if (!loading) {
      setLoadingTextIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 1200); // Change text every 1.2 seconds

    return () => clearInterval(interval);
  }, [loading, loadingTexts.length]);

  // Auto-load default insights on component mount
  useEffect(() => {
    if (isInitialized && browserId && !hasAutoLoaded && selectedStage && selectedDateRange && insightType) {
      console.log('Auto-loading insights for default selection');
      setHasAutoLoaded(true);
      handleGetInsights();
    }
  }, [isInitialized, browserId, hasAutoLoaded, selectedStage, selectedDateRange, insightType]);

  const fetchStages = async () => {
    setStagesLoading(true);
    try {
      console.log('Fetching stages with browserId:', browserId);
      const apiPath = API_CONFIG.getApiPath('/stages');
      console.log('API path for stages:', apiPath);

      const response = await fetch(apiPath, {
        headers: {
          'X-Browser-ID': browserId,
          'X-Session-ID': localStorage.getItem('sessionId') || '',
        },
      });

      console.log('Stages response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Stages data received:', data);
        // Sort by display_order
        const sortedStages = [...data].sort((a, b) => a.display_order - b.display_order);
        setStages(sortedStages);
        console.log('Sorted stages set:', sortedStages);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch stages:', response.status, errorText);
        setError(`Failed to load stages: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching stages:', error);
      setError('Failed to load stages');
    } finally {
      setStagesLoading(false);
    }
  };

  const calculateDateRange = (option: any) => {
    const endDate = new Date();
    const startDate = new Date();

    if (option.weeks) {
      startDate.setDate(startDate.getDate() - option.weeks * 7);
    } else if (option.months) {
      startDate.setMonth(startDate.getMonth() - option.months);
    }

    return {
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    };
  };

  const handleGetInsights = async () => {
    if (!selectedStage || !selectedDateRange || !insightType) return;

    setLoading(true);
    setError(null);
    setInsights(null);

    try {
      const option = dateRangeOptions.find(opt => opt.value === selectedDateRange);
      if (!option) return;

      const { start_date, end_date } = calculateDateRange(option);

      // Use Next.js API routes (proxy pattern)
      const endpoint = insightType === 'use-cases'
        ? `/api/hubspot/stage-insights/use-cases?stage=${encodeURIComponent(selectedStage)}&start_date=${start_date}&end_date=${end_date}`
        : `/api/hubspot/stage-insights/risks?stage=${encodeURIComponent(selectedStage)}&start_date=${start_date}&end_date=${end_date}`;

      console.log('Fetching insights from:', endpoint);

      const response = await fetch(endpoint, {
        headers: {
          'X-Browser-ID': browserId,
          'X-Session-ID': localStorage.getItem('sessionId') || '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setInsights(data);
      } else {
        setError('Failed to fetch insights');
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
      setError('An error occurred while fetching insights');
    } finally {
      setLoading(false);
    }
  };

  const isButtonEnabled = selectedStage && selectedDateRange && insightType;

  const renderUseCases = () => {
    if (!insights?.data || !selectedStage) return null;

    const stageData = insights.data[selectedStage];

    if (!stageData || !Array.isArray(stageData) || stageData.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No use cases found for this stage and date range.
        </div>
      );
    }

    // Merge duplicate deal names by combining use cases
    const mergedData = stageData.reduce((acc: Record<string, string[]>, item: UseCase) => {
      if (!acc[item.deal_name]) {
        acc[item.deal_name] = [];
      }
      // Only add unique use cases
      if (!acc[item.deal_name].includes(item.use_case)) {
        acc[item.deal_name].push(item.use_case);
      }
      return acc;
    }, {});

    // Convert to array for rendering
    const deduplicatedData = Object.entries(mergedData).map(([dealName, useCases]) => ({
      deal_name: dealName,
      use_cases: useCases,
    }));

    return (
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Deal Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Use Cases
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
            {deduplicatedData.map((item, index: number) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                  <div className="flex items-center gap-2">
                    <span>{item.deal_name}</span>
                    <a
                      href={`/deal-timeline?deal=${encodeURIComponent(item.deal_name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                      title="Open deal timeline"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  <ul className="list-disc list-inside space-y-1">
                    {item.use_cases.map((useCase, idx) => (
                      <li key={idx}>{useCase}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRisks = () => {
    if (!insights?.data || !selectedStage) return null;

    const stageData = insights.data[selectedStage];
    if (!stageData || typeof stageData !== 'object') {
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No risks found for this stage and date range.
        </div>
      );
    }

    const allRisks: Array<{ dealName: string; riskType: string; explanation: string }> = [];
    const availableRiskTypes: string[] = [];

    // Map backend risk type to display name
    const getDisplayRiskType = (riskType: string) => {
      return riskType === 'Low Buyer Intent' ? 'Negative Feedback' : riskType;
    };

    try {
      Object.keys(stageData).forEach(riskType => {
        const riskItems = stageData[riskType];
        if (Array.isArray(riskItems) && riskItems.length > 0) {
          const displayRiskType = getDisplayRiskType(riskType);
          availableRiskTypes.push(displayRiskType);
          riskItems.forEach((item: RiskItem) => {
            allRisks.push({
              dealName: item.deal_name,
              riskType: displayRiskType,
              explanation: item.explanation,
            });
          });
        }
      });
    } catch (error) {
      console.error('Error processing risk data:', error);
      return (
        <div className="text-center py-12 text-red-500 dark:text-red-400">
          Error processing risk data. Please try again.
        </div>
      );
    }

    if (allRisks.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No risks found for this stage and date range.
        </div>
      );
    }

    // Merge duplicate deal names by combining risks
    const mergedRisks: Record<string, Array<{ riskType: string; explanation: string }>> = {};
    allRisks.forEach(risk => {
      if (!mergedRisks[risk.dealName]) {
        mergedRisks[risk.dealName] = [];
      }
      mergedRisks[risk.dealName].push({
        riskType: risk.riskType,
        explanation: risk.explanation,
      });
    });

    // Convert to array for filtering and rendering
    const deduplicatedRisks = Object.entries(mergedRisks).map(([dealName, risks]) => ({
      dealName,
      risks,
    }));

    // Filter risks based on selected risk types
    const filteredRisks = selectedRiskTypes.length > 0
      ? deduplicatedRisks.map(item => ({
          dealName: item.dealName,
          risks: item.risks.filter(risk => selectedRiskTypes.includes(risk.riskType)),
        })).filter(item => item.risks.length > 0)
      : deduplicatedRisks;

    const toggleRiskType = (riskType: string) => {
      setSelectedRiskTypes(prev => {
        if (prev.includes(riskType)) {
          return prev.filter(t => t !== riskType);
        } else {
          return [...prev, riskType];
        }
      });
    };

    const getRiskTypeColor = (riskType: string) => {
      switch (riskType) {
        case 'No Decision Maker':
          return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        case 'Existing Vendor':
          return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
        case 'Pricing Concerns':
          return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
        case 'Negative Feedback':
          return 'bg-red-600 text-white dark:bg-red-700 dark:text-white';
        default:
          return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      }
    };

    // Count risks by type
    const riskCountsByType = allRisks.reduce((acc, risk) => {
      acc[risk.riskType] = (acc[risk.riskType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div>
        {/* Risk Type Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 self-center">
            Filter by Risk Type:
          </span>
          {availableRiskTypes.map((riskType) => {
            const isSelected = selectedRiskTypes.length === 0 || selectedRiskTypes.includes(riskType);
            const count = riskCountsByType[riskType] || 0;
            return (
              <button
                key={riskType}
                onClick={() => toggleRiskType(riskType)}
                className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isSelected
                    ? getRiskTypeColor(riskType)
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 opacity-50'
                } hover:opacity-100 cursor-pointer`}
              >
                {riskType} ({count})
                {isSelected && (
                  <svg className="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
          {selectedRiskTypes.length > 0 && (
            <button
              onClick={() => setSelectedRiskTypes([])}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline self-center ml-2"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Risk Count */}
        <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredRisks.length} deals with {filteredRisks.reduce((sum, item) => sum + item.risks.length, 0)} risks (total: {deduplicatedRisks.length} deals, {allRisks.length} risks)
        </div>

        {/* Risks Table */}
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Deal Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Risks
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredRisks.length > 0 ? (
                filteredRisks.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white align-top">
                      <div className="flex items-center gap-2">
                        <span>{item.dealName}</span>
                        <a
                          href={`/deal-timeline?deal=${encodeURIComponent(item.dealName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                          title="Open deal timeline"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <div className="space-y-3">
                        {item.risks.map((risk, riskIdx) => (
                          <div key={riskIdx} className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-fit ${getRiskTypeColor(risk.riskType)}`}>
                              {risk.riskType}
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300 pl-1">
                              {risk.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No risks match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 transition-colors">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Pipe Insights</h2>

      {/* Compact Single Row Filters */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-6">
          {/* Stage Selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Stage
            </label>
            {stagesLoading ? (
              <div className="flex items-center h-10">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <select
                value={selectedStage || ''}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="inline-block px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                style={{ width: 'auto', minWidth: '200px' }}
              >
                <option value="">Select stage...</option>
                {stages.map((stage) => (
                  <option key={stage.stage_name} value={stage.stage_name}>
                    {stage.stage_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Vertical Divider */}
          <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>

          {/* Date Range Buttons */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Date Range
            </label>
            <div className="flex flex-wrap gap-2">
              {dateRangeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedDateRange(option.value)}
                  title={option.label}
                  className={`group relative px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    selectedDateRange === option.value
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {option.value.toUpperCase()}
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                    {option.label}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Vertical Divider */}
          <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>

          {/* Insight Type Buttons */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setInsightType('use-cases')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  insightType === 'use-cases'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                Use Cases
              </button>
              <button
                onClick={() => setInsightType('risks')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  insightType === 'risks'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                Risks
              </button>
            </div>
          </div>

          {/* Vertical Divider */}
          <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>

          {/* Get Insights Button */}
          <button
            onClick={handleGetInsights}
            disabled={!isButtonEnabled || loading}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${
              isButtonEnabled && !loading
                ? 'bg-indigo-200 dark:bg-indigo-300 text-indigo-900 dark:text-indigo-950 shadow-md hover:shadow-lg hover:bg-indigo-300 dark:hover:bg-indigo-400'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-900 dark:border-indigo-950 mr-2"></div>
                Loading...
              </div>
            ) : (
              <div className="flex items-center justify-center whitespace-nowrap">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Get Insights
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              {/* Outer rotating ring */}
              <div className="absolute inset-0 rounded-full border-4 border-indigo-200 dark:border-indigo-800 opacity-20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 dark:border-t-indigo-400 animate-spin"></div>

              {/* Inner pulsing circle */}
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900 dark:to-purple-900 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center animate-pulse">
                  <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Animated text */}
            <div className="mt-8 text-center">
              <p className="text-lg font-medium text-gray-900 dark:text-white animate-fade-in-up" key={loadingTextIndex}>
                {loadingTexts[loadingTextIndex]}
                <span className="inline-block animate-bounce ml-1">.</span>
                <span className="inline-block animate-bounce ml-0.5" style={{ animationDelay: '0.1s' }}>.</span>
                <span className="inline-block animate-bounce ml-0.5" style={{ animationDelay: '0.2s' }}>.</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Analyzing {insightType === 'use-cases' ? 'use cases' : 'risks'} for {selectedStage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Insights Display */}
      {insights && !loading && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {insightType === 'use-cases' ? 'Use Cases' : 'Risks'} - {selectedStage}
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {insights.filters?.start_date} to {insights.filters?.end_date}
            </span>
          </div>
          {insightType === 'use-cases' ? renderUseCases() : renderRisks()}
        </div>
      )}
    </div>
  );
};

export default UseCasesRisks;
