// app/components/UseCasesRisks.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [selectedStages, setSelectedStages] = useState<string[]>([
    '0. Identification',
    '1. Sales Qualification',
    '2. Needs Analysis & Solution Mapping'
  ]);
  const [selectedDateRange, setSelectedDateRange] = useState<string | null>('3m');
  const [insightType, setInsightType] = useState<'use-cases' | 'risks' | null>('use-cases');
  const [loading, setLoading] = useState(false);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [selectedRiskTypes, setSelectedRiskTypes] = useState<string[]>([]);
  const [lastTouchPoints, setLastTouchPoints] = useState<Record<string, string>>({});
  const [dealOwners, setDealOwners] = useState<Record<string, string>>({});
  const [overviewDeal, setOverviewDeal] = useState<string | null>(null);
  const [overviewContent, setOverviewContent] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewCache, setOverviewCache] = useState<Record<string, string>>({});
  const [overviewAbove, setOverviewAbove] = useState(false);
  const overviewButtonRef = useRef<HTMLButtonElement | null>(null);

  const overviewBtnRefCallback = useCallback((node: HTMLButtonElement | null) => {
    overviewButtonRef.current = node;
    if (node) {
      const rect = node.getBoundingClientRect();
      setOverviewAbove(rect.bottom + 250 > window.innerHeight);
    }
  }, [overviewDeal]);

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

  // Auto-fetch insights when any filter changes
  useEffect(() => {
    if (!isInitialized || !browserId) return;
    if (selectedStages.length === 0 || !selectedDateRange || !insightType) return;

    setSelectedRiskTypes([]);
    handleGetInsights();
  }, [selectedStages, selectedDateRange, insightType, isInitialized, browserId]);

  // Format a date string as "x days ago"
  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1d ago';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks}w ago`;
    }
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  };

  const fetchOverview = async (dealName: string) => {
    if (overviewDeal === dealName) {
      setOverviewDeal(null);
      return;
    }
    setOverviewDeal(dealName);
    if (overviewCache[dealName]) {
      setOverviewContent(overviewCache[dealName]);
      return;
    }
    setOverviewLoading(true);
    setOverviewContent(null);
    try {
      const response = await fetch(
        `${API_CONFIG.getApiPath('/company-overview')}?dealName=${encodeURIComponent(dealName)}`,
        {
          headers: {
            'X-Browser-ID': browserId,
            'X-Session-ID': localStorage.getItem('sessionId') || '',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const content = data.company_overview || data.overview || JSON.stringify(data);
        setOverviewContent(content);
        setOverviewCache(prev => ({ ...prev, [dealName]: content }));
      } else {
        setOverviewContent('Failed to load overview.');
      }
    } catch {
      setOverviewContent('Failed to load overview.');
    } finally {
      setOverviewLoading(false);
    }
  };

  // Fetch last touch point dates when insights change
  useEffect(() => {
    if (!insights?.data || !isInitialized || !browserId) return;

    const dealNames = new Set<string>();
    selectedStages.forEach(stage => {
      const stageData = insights.data[stage];
      if (Array.isArray(stageData)) {
        stageData.forEach((item: any) => dealNames.add(item.deal_name));
      } else if (stageData && typeof stageData === 'object') {
        Object.values(stageData).forEach((items: any) => {
          if (Array.isArray(items)) {
            items.forEach((item: any) => dealNames.add(item.deal_name));
          }
        });
      }
    });

    if (dealNames.size === 0) return;

    let cancelled = false;

    const fetchTouchPoints = async () => {
      const results: Record<string, string> = {};

      const promises = Array.from(dealNames).map(async (dealName) => {
        try {
          const response = await fetch(
            `${API_CONFIG.getApiPath('/deal-timeline')}?dealName=${encodeURIComponent(dealName)}`,
            {
              headers: {
                'X-Browser-ID': browserId,
                'X-Session-ID': localStorage.getItem('sessionId') || '',
              },
            }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.events && data.events.length > 0) {
              let latestDate = '';
              data.events.forEach((event: any) => {
                const d = event.event_date || event.date_str || '';
                if (d > latestDate) latestDate = d;
              });
              if (latestDate) results[dealName] = latestDate;
            }
          }
        } catch (err) {
          console.error(`Error fetching timeline for ${dealName}:`, err);
        }
      });

      await Promise.all(promises);
      if (!cancelled) setLastTouchPoints(results);
    };

    const fetchDealOwners = async () => {
      const results: Record<string, string> = {};

      const promises = Array.from(dealNames).map(async (dealName) => {
        try {
          const response = await fetch(
            `${API_CONFIG.getApiPath('/deal-info')}?dealName=${encodeURIComponent(dealName)}`,
            {
              headers: {
                'X-Browser-ID': browserId,
                'X-Session-ID': localStorage.getItem('sessionId') || '',
              },
            }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.dealOwner) results[dealName] = data.dealOwner;
          }
        } catch (err) {
          console.error(`Error fetching deal info for ${dealName}:`, err);
        }
      });

      await Promise.all(promises);
      if (!cancelled) setDealOwners(results);
    };

    fetchTouchPoints();
    fetchDealOwners();
    return () => { cancelled = true; };
  }, [insights, isInitialized, browserId, selectedStages]);

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
    if (selectedStages.length === 0 || !selectedDateRange || !insightType) return;

    setLoading(true);
    setError(null);
    setInsights(null);

    try {
      const option = dateRangeOptions.find(opt => opt.value === selectedDateRange);
      if (!option) return;

      const { start_date, end_date } = calculateDateRange(option);

      // Fetch insights for each stage individually and merge results
      const fetchPromises = selectedStages.map(async (stage) => {
        const endpoint = insightType === 'use-cases'
          ? `/api/hubspot/stage-insights/use-cases?stage=${encodeURIComponent(stage)}&start_date=${start_date}&end_date=${end_date}`
          : `/api/hubspot/stage-insights/risks?stage=${encodeURIComponent(stage)}&start_date=${start_date}&end_date=${end_date}`;

        console.log('Fetching insights from:', endpoint);

        const response = await fetch(endpoint, {
          headers: {
            'X-Browser-ID': browserId,
            'X-Session-ID': localStorage.getItem('sessionId') || '',
          },
        });

        if (response.ok) {
          return response.json();
        } else {
          console.error(`Failed to fetch insights for stage: ${stage}`);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);

      // Merge all results into a single insights object
      const mergedData: Record<string, any> = {};
      let filters: any = null;

      results.forEach((result) => {
        if (result?.data) {
          Object.keys(result.data).forEach((stage) => {
            mergedData[stage] = result.data[stage];
          });
          if (!filters && result.filters) {
            filters = result.filters;
          }
        }
      });

      if (Object.keys(mergedData).length > 0) {
        setInsights({ data: mergedData, filters });
      } else {
        setError('No insights found for the selected stages');
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
      setError('An error occurred while fetching insights');
    } finally {
      setLoading(false);
    }
  };

  const renderUseCases = () => {
    if (!insights?.data || selectedStages.length === 0) return null;

    // Combine data from all selected stages
    const allStageData: UseCase[] = [];
    selectedStages.forEach(stage => {
      const stageData = insights.data[stage];
      if (Array.isArray(stageData)) {
        allStageData.push(...stageData);
      }
    });

    if (allStageData.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No use cases found for the selected stages and date range.
        </div>
      );
    }

    // Merge duplicate deal names by combining use cases
    const mergedData = allStageData.reduce((acc: Record<string, string[]>, item: UseCase) => {
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
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-md border border-gray-100 dark:border-slate-700">
        <table className="min-w-full">
          <thead className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-600">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-1/4">
                Deal
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                Use Cases
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-28">
                Owner
              </th>
              <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-24">
                Last Touch
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {deduplicatedData.map((item, index: number) => (
              <tr key={index} className="group hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                <td className="px-4 py-2 align-top">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/deal-timeline?deal=${encodeURIComponent(item.deal_name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Open deal timeline"
                    >
                      {item.deal_name}
                    </a>
                    <div className="relative">
                      <button
                        ref={overviewDeal === item.deal_name ? overviewBtnRefCallback : undefined}
                        onClick={() => fetchOverview(item.deal_name)}
                        className="p-0.5 text-violet-300 hover:text-violet-500 transition-colors rounded cursor-pointer"
                        title="Latest activity"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 4a1 1 0 011.414 0l1.293 1.293a1 1 0 00.707.293H14a1 1 0 011 1v1.586a1 1 0 00.293.707L16.586 10A1 1 0 0116.586 11.414l-1.293 1.293a1 1 0 00-.293.707V15a1 1 0 01-1 1h-1.586a1 1 0 00-.707.293L10.414 17.586A1 1 0 019 17.586l-1.293-1.293A1 1 0 007 16H5.414a1 1 0 01-1-1v-1.586a1 1 0 00-.293-.707L2.828 11.414a1 1 0 010-1.414L4.121 8.707A1 1 0 004.414 8V6.414a1 1 0 011-1H7a1 1 0 00.707-.293L9 3.828z" />
                          <path d="M17.5 13a.5.5 0 01.462.308l.58 1.42 1.42.58a.5.5 0 010 .924l-1.42.58-.58 1.42a.5.5 0 01-.924 0l-.58-1.42-1.42-.58a.5.5 0 010-.924l1.42-.58.58-1.42A.5.5 0 0117.5 13z" />
                          <path d="M20 8a.5.5 0 01.429.243l.321.536.536.321a.5.5 0 010 .858l-.536.321-.321.536a.5.5 0 01-.858 0l-.321-.536-.536-.321a.5.5 0 010-.858l.536-.321.321-.536A.5.5 0 0120 8z" />
                        </svg>
                      </button>
                      {overviewDeal === item.deal_name && (
                        <div className={`absolute left-0 z-50 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-600 p-3 ${overviewAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate mr-2">{item.deal_name} - Latest Activity</span>
                            <button
                              onClick={() => setOverviewDeal(null)}
                              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {overviewLoading ? (
                            <div className="flex items-center gap-2 py-3">
                              <span className="text-violet-500 text-sm animate-spin inline-block">✻</span>
                              <span className="text-xs text-gray-400">Loading overview...</span>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">{overviewContent}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  {item.use_cases.map((useCase, idx) => (
                    <span key={idx}>
                      {useCase}{idx < item.use_cases.length - 1 && <span className="mx-1.5 text-gray-300 dark:text-gray-600">&middot;</span>}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap">
                  {dealOwners[item.deal_name] ? (
                    <span className="text-[12px] text-gray-600 dark:text-gray-400">{dealOwners[item.deal_name]}</span>
                  ) : (
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-200 dark:border-gray-600 border-t-gray-400 dark:border-t-gray-400 animate-spin" />
                  )}
                </td>
                <td className="px-4 py-2 text-right align-top whitespace-nowrap">
                  {lastTouchPoints[item.deal_name] ? (
                    <span className="text-[12px] text-gray-500 dark:text-gray-400">
                      {formatTimeAgo(lastTouchPoints[item.deal_name])}
                    </span>
                  ) : (
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-200 dark:border-gray-600 border-t-gray-400 dark:border-t-gray-400 animate-spin" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRisks = () => {
    if (!insights?.data || selectedStages.length === 0) return null;

    const allRisks: Array<{ dealName: string; riskType: string; explanation: string }> = [];
    const availableRiskTypes: string[] = [];

    // Map backend risk type to display name
    const getDisplayRiskType = (riskType: string) => {
      return riskType === 'Low Buyer Intent' ? 'Negative Feedback' : riskType;
    };

    try {
      // Process data from all selected stages
      selectedStages.forEach(stage => {
        const stageData = insights.data[stage];
        if (stageData && typeof stageData === 'object') {
          Object.keys(stageData).forEach(riskType => {
            const riskItems = stageData[riskType];
            if (Array.isArray(riskItems) && riskItems.length > 0) {
              const displayRiskType = getDisplayRiskType(riskType);
              if (!availableRiskTypes.includes(displayRiskType)) {
                availableRiskTypes.push(displayRiskType);
              }
              riskItems.forEach((item: RiskItem) => {
                allRisks.push({
                  dealName: item.deal_name,
                  riskType: displayRiskType,
                  explanation: item.explanation,
                });
              });
            }
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
          No risks found for the selected stages and date range.
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
                        <div className="relative">
                          <button
                            ref={overviewDeal === item.dealName ? overviewBtnRefCallback : undefined}
                            onClick={() => fetchOverview(item.dealName)}
                            className="p-0.5 text-violet-300 hover:text-violet-500 transition-colors rounded cursor-pointer"
                            title="Latest activity"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 4a1 1 0 011.414 0l1.293 1.293a1 1 0 00.707.293H14a1 1 0 011 1v1.586a1 1 0 00.293.707L16.586 10A1 1 0 0116.586 11.414l-1.293 1.293a1 1 0 00-.293.707V15a1 1 0 01-1 1h-1.586a1 1 0 00-.707.293L10.414 17.586A1 1 0 019 17.586l-1.293-1.293A1 1 0 007 16H5.414a1 1 0 01-1-1v-1.586a1 1 0 00-.293-.707L2.828 11.414a1 1 0 010-1.414L4.121 8.707A1 1 0 004.414 8V6.414a1 1 0 011-1H7a1 1 0 00.707-.293L9 3.828z" />
                              <path d="M17.5 13a.5.5 0 01.462.308l.58 1.42 1.42.58a.5.5 0 010 .924l-1.42.58-.58 1.42a.5.5 0 01-.924 0l-.58-1.42-1.42-.58a.5.5 0 010-.924l1.42-.58.58-1.42A.5.5 0 0117.5 13z" />
                              <path d="M20 8a.5.5 0 01.429.243l.321.536.536.321a.5.5 0 010 .858l-.536.321-.321.536a.5.5 0 01-.858 0l-.321-.536-.536-.321a.5.5 0 010-.858l.536-.321.321-.536A.5.5 0 0120 8z" />
                            </svg>
                          </button>
                          {overviewDeal === item.dealName && (
                            <div className={`absolute left-0 z-50 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-600 p-3 ${overviewAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate mr-2">{item.dealName} - Latest Activity</span>
                                <button
                                  onClick={() => setOverviewDeal(null)}
                                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              {overviewLoading ? (
                                <div className="flex items-center gap-2 py-3">
                                  <span className="text-violet-500 text-sm animate-spin inline-block">✻</span>
                                  <span className="text-xs text-gray-400">Loading overview...</span>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">{overviewContent}</p>
                              )}
                            </div>
                          )}
                        </div>
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

      {/* Filters */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 mb-6 space-y-4">
        {/* Stage Multi-Select - Grouped by Funnel */}
        {stagesLoading ? (
          <div className="flex justify-center items-center h-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            {(() => {
              const funnelGroups = [
                { label: 'Top of Funnel', stages: ['0. Identification', '1. Sales Qualification', '2. Needs Analysis & Solution Mapping'], color: 'green' },
                { label: 'Mid Funnel', stages: ['3. Technical Validation', '4. Proposal & Negotiation', 'Proposal'], color: 'yellow' },
                { label: 'Bottom of Funnel', stages: ['Assessment', 'Closed Active Nurture', 'Closed Lost', 'Closed Marketing Nurture', 'Closed Won', 'Renew/Closed won', 'Churned'], color: 'red' },
              ];
              return funnelGroups.map(({ label, stages: groupStages, color }) => {
                const existingStages = groupStages.filter(s => stages.some(st => st.stage_name === s));
                const isSelected = existingStages.length > 0 && existingStages.every(s => selectedStages.includes(s)) && selectedStages.every(s => existingStages.includes(s));
                const colorMap: Record<string, { active: string; inactive: string }> = {
                  green: { active: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700', inactive: 'bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700' },
                  yellow: { active: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700', inactive: 'bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700' },
                  red: { active: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700', inactive: 'bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700' },
                };
                return (
                  <button
                    key={label}
                    onClick={() => setSelectedStages(isSelected ? [] : [...existingStages])}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-all ${
                      isSelected ? colorMap[color].active : colorMap[color].inactive
                    }`}
                  >
                    {label}
                  </button>
                );
              });
            })()}
          </div>
        )}

        {/* Horizontal Divider */}
        <div className="h-px bg-gray-300 dark:bg-gray-600"></div>

        {/* Second Row - Date Range, Type, and Get Insights */}
        <div className="flex flex-wrap items-center justify-center gap-6">
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
                Analyzing {insightType === 'use-cases' ? 'use cases' : 'risks'} for {selectedStages.length} stage{selectedStages.length !== 1 ? 's' : ''}
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
              {insightType === 'use-cases' ? 'Use Cases' : 'Risks'} - {selectedStages.length} stage{selectedStages.length !== 1 ? 's' : ''}
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
