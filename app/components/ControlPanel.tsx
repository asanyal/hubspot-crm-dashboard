// app/components/ControlPanel.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '../context/AppContext';
import { API_CONFIG } from '../utils/config';
import LatestMeetings from './LatestMeetings';

const ControlPanel: React.FC = () => {
  const { state } = useAppState();
  const { pipelineData } = state.controlPanel;
  const router = useRouter();

  // Add session management state
  const [browserId, setBrowserId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Define the funnel order for stages (used by StatBoxes)
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
  }, []); // Empty dependency array = run once


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

  // Stat boxes component
  const StatBoxes = () => {
    const [currentPage, setCurrentPage] = useState(0);
    const [cardsPerPage, setCardsPerPage] = useState(3);
    const containerRef = useRef<HTMLDivElement>(null);
    
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
    
    // Calculate optimal cards per page based on container width
    const calculateCardsPerPage = useCallback(() => {
      if (!containerRef.current) return 3;
      
      const containerWidth = containerRef.current.offsetWidth;
      const cardWidth = 140; // Card width + gap (128px + 12px gap)
      const availableWidth = containerWidth - 120; // Account for carat buttons and spacing
      
      if (availableWidth <= 0) return 1;
      
      const optimalCards = Math.floor(availableWidth / cardWidth);
      return Math.max(1, Math.min(optimalCards, sortedPipelineData.length));
    }, [sortedPipelineData.length]);
    
    // Update cards per page when container size changes
    useEffect(() => {
      const updateCardsPerPage = () => {
        const newCardsPerPage = calculateCardsPerPage();
        if (newCardsPerPage !== cardsPerPage) {
          setCardsPerPage(newCardsPerPage);
          setCurrentPage(0); // Reset to first page when changing cards per page
        }
      };
      
      updateCardsPerPage();
      
      // Add resize listener
      const resizeObserver = new ResizeObserver(updateCardsPerPage);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      
      return () => {
        resizeObserver.disconnect();
      };
    }, [calculateCardsPerPage, cardsPerPage]);
    
    const totalPages = Math.ceil(sortedPipelineData.length / cardsPerPage);
    const startIndex = currentPage * cardsPerPage;
    const endIndex = startIndex + cardsPerPage;
    const currentCards = sortedPipelineData.slice(startIndex, endIndex);
    
    const goToPreviousPage = () => {
      setCurrentPage(prev => Math.max(0, prev - 1));
    };
    
    const goToNextPage = () => {
      setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
    };
    
    return (
      <div className="mb-8" ref={containerRef}>
        <div className="flex items-center justify-center space-x-4">
          {/* Left Carat */}
          <button
            onClick={goToPreviousPage}
            disabled={currentPage === 0}
            className={`p-2 rounded-full transition-colors ${
              currentPage === 0
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
            aria-label="Previous page"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          {/* Cards Container */}
          <div className="flex gap-3">
            {currentCards.map((stageData, index) => (
              <div key={startIndex + index} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 flex flex-col items-center justify-center text-center transition-colors min-h-[120px] w-32 flex-shrink-0">
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
                  {formatAbbreviatedCurrency(stageData.amount)}
                </p>
              </div>
            ))}
          </div>
          
          {/* Right Carat */}
          <button
            onClick={goToNextPage}
            disabled={currentPage === totalPages - 1}
            className={`p-2 rounded-full transition-colors ${
              currentPage === totalPages - 1
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
            aria-label="Next page"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        {/* Page Indicator */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-4 space-x-2">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index}
                onClick={() => setCurrentPage(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentPage
                    ? 'bg-blue-600 dark:bg-blue-400'
                    : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                }`}
                aria-label={`Go to page ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-slate-900 transition-colors">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      {/* Stat Boxes */}
      {pipelineData.length > 0 && <StatBoxes />}

      {/* Latest Meetings Section */}
      <LatestMeetings browserId={browserId} isInitialized={isInitialized} />
    </div>
  );
};

export default ControlPanel;