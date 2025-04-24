'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppState } from '../context/AppContext';

interface Stage {
  pipeline_id: string;
  pipeline_name: string;
  stage_id: string;
  stage_name: string;
  display_order: number;
  probability: number;
  closed_won: boolean;
  closed_lost: boolean;
}

interface DealListProps {
  onDealSelect: (dealName: string) => void;
}

const DealList: React.FC<DealListProps> = ({ onDealSelect }) => {
  const { state, updateState } = useAppState();
  const { 
    selectedStage, 
    availableStages, 
    dealsByStage, 
    stagesLoading, 
    error,
    lastFetched 
  } = state.dealsByStage;

  const [hasMounted, setHasMounted] = useState(false);
  const [failedStages, setFailedStages] = useState<Set<string>>(new Set());
  const [browserId, setBrowserId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Timestamp for data expiration (5 minutes = 300000 milliseconds)
  const DATA_EXPIRY_TIME = 300000;

  // Initialize browser ID on component mount
  useEffect(() => {
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

  // Update fetchStages to use makeApiCall
  const fetchStages = useCallback(async (): Promise<void> => {
    console.log('fetchStages called, current state:', {
      stagesLoading,
      availableStagesLength: availableStages.length,
      lastFetched,
      currentTime: Date.now()
    });

    // If we already have stages and they're not stale, just ensure loading state is false
    if (availableStages.length > 0 && lastFetched && (Date.now() - lastFetched <= DATA_EXPIRY_TIME)) {
      console.log('Using existing stages data');
      updateState('dealsByStage.stagesLoading', false);
      return;
    }

    // Set loading state before starting the fetch
    updateState('dealsByStage.stagesLoading', true);
    updateState('dealsByStage.error', null);
    
    try {
      console.log('Fetching pipeline stages...');
      const response = await makeApiCall('/api/hubspot/stages');
      
      if (response) {
        const data = await response.json();
        
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('No valid stages received from the API');
        }
        
        // Sort stages by display order
        const sortedStages = [...data].sort((a, b) => a.display_order - b.display_order);
        
        // Update the context
        updateState('dealsByStage.availableStages', sortedStages);
        updateState('dealsByStage.lastFetched', Date.now());
      }
    } catch (error) {
      console.error('Error fetching stages:', error);
      updateState('dealsByStage.error', 'Failed to load stages. Please try refreshing.');
      updateState('dealsByStage.availableStages', []);
    } finally {
      updateState('dealsByStage.stagesLoading', false);
    }
  }, [updateState, lastFetched, DATA_EXPIRY_TIME, makeApiCall]);

  // Initialize component
  useEffect(() => {
    setHasMounted(true);
    
    // Only fetch if we don't have stages or if they're stale
    if (availableStages.length === 0 || (lastFetched && Date.now() - lastFetched > DATA_EXPIRY_TIME)) {
      fetchStages();
    }
    
    return () => {
      setHasMounted(false);
    };
  }, [hasMounted, availableStages.length, lastFetched, DATA_EXPIRY_TIME]);

  // Handler for stage selection
  const handleStageSelect = useCallback((stageName: string): void => {
    if (stagesLoading || stageName === selectedStage) return;
    
    // Clear any failed status for this stage when manually selected
    if (failedStages.has(stageName)) {
      setFailedStages(prev => {
        const newSet = new Set(prev);
        newSet.delete(stageName);
        return newSet;
      });
    }
    
    // Update the selected stage
    updateState('dealsByStage.selectedStage', stageName);
    updateState('dealsByStage.error', null);
  }, [stagesLoading, selectedStage, failedStages, updateState]);

  // Get stage chip style based on stage name
  const getStageChipStyle = (stageName: string) => {
    const isActive = selectedStage === stageName;
    
    // Base classes
    let classes = "py-2 px-4 rounded-full text-sm font-medium transition-colors duration-200 ";
    
    // Find matching stage to check if it's a closed stage
    const stageInfo = availableStages.find(s => s.stage_name === stageName);
    
    if (isActive) {
      classes += "bg-sky-600 text-white ";
    } else if (stageInfo?.closed_won) {
      classes += "bg-gray-200 text-gray-800 hover:bg-gray-300 ";
    } else if (stageInfo?.closed_lost) {
      classes += "bg-gray-200 text-gray-800 hover:bg-gray-300 ";
    } else {
      classes += "bg-gray-200 text-gray-800 hover:bg-gray-300 ";
    }
    
    return classes;
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Stages</h2>
      </div>
      
      {/* Stages List */}
      <div className="divide-y divide-gray-100">
        {stagesLoading ? (
          <div className="p-4 text-gray-500 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
            Loading stages...
          </div>
        ) : availableStages.length > 0 ? (
          availableStages.map((stage) => (
            <div
              key={stage.stage_id}
              className={`p-4 cursor-pointer hover:bg-gray-50 ${
                selectedStage === stage.stage_name ? 'bg-sky-50' : ''
              }`}
              onClick={() => handleStageSelect(stage.stage_name)}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                  {stage.display_order}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{stage.stage_name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {stage.closed_won || stage.closed_lost ? '' : `${stage.probability}% Probability`}
                  </div>
                </div>
                {selectedStage === stage.stage_name && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-sky-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-gray-500">No stages found</div>
        )}
      </div>

      {/* Deals List */}
      {selectedStage && dealsByStage[selectedStage] && (
        <div className="p-4 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Deals</h3>
          <div className="space-y-2">
            {dealsByStage[selectedStage].map((deal) => (
              <div
                key={deal.Deal_Name}
                className="flex items-start justify-between p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100"
                onClick={() => onDealSelect(deal.Deal_Name)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {deal.Deal_Name}
                  </div>
                  <div className="text-xs text-gray-500">
                    Owner: {deal.Owner}
                  </div>
                  <div className="text-xs text-gray-500">
                    Amount: {deal.Amount}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DealList; 