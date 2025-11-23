// app/context/AppContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import set from 'lodash/set';
import get from 'lodash/get';

// Define types for all components
// ---- DealTimeline Types ----
export interface Deal {
  id: string;
  name: string;
  createdate: string;
  owner?: string;
  stage?: string;
  startDate?: string;
  endDate?: string;
  activities?: number;
}

interface TimelineEvent {
  id: string;
  date_str: string;
  time_str: string;
  type: string;
  subject: string;
  content: string;
  content_preview?: string;
  sentiment?: string;
  buyer_intent?: string;
  buyer_intent_explanation?: string;
  business_pain?: string;
}

interface TimelineData {
  events: TimelineEvent[];
  start_date: string;
  end_date: string;
}

// ---- DealStageSelector Types ----
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

interface DealDetail {
  Deal_Name: string;
  Owner: string;
  Amount: string;
  Created_At: string;
  Last_Update: string;
  Expected_Close_Date: string;
  Closed_Won: boolean;
  Closed_Lost: boolean;
}

// ---- ControlPanel Types ----
interface PipelineData {
  stage: string;
  count: number;
  amount: number;
}


// Define the shape of the application state
interface AppState {
  dealTimeline: {
    selectedDeal: Deal | null;
    timeframe: string;
    deals: Deal[]; 
    activities: TimelineData | null;
    loading: boolean;
    error: string | null;
    lastFetched: number | null;
  };
  dealsByStage: {
    selectedStage: string | null;
    availableStages: Stage[];
    dealsByStage: Record<string, DealDetail[]>;
    loading: boolean;
    stagesLoading: boolean;
    error: string | null;
    lastFetched: number | null;
  };
  controlPanel: {
    pipelineData: PipelineData[];
    loading: boolean;
    error: string | null;
    lastFetched: number | null;
  };
}

// Initial state
const initialState: AppState = {
  dealTimeline: {
    selectedDeal: null,
    timeframe: 'all',
    deals: [],
    activities: null,
    loading: false,
    error: null,
    lastFetched: null
  },
  dealsByStage: {
    selectedStage: null,
    availableStages: [],
    dealsByStage: {},
    loading: false,
    stagesLoading: false,
    error: null,
    lastFetched: null
  },
  controlPanel: {
    pipelineData: [],
    loading: false,
    error: null,
    lastFetched: null
  },
};

// Define context type
interface AppContextType {
  state: AppState;
  updateState: (path: string, value: any) => void;
  resetState: () => void;
}

// Create context with initial state
const AppContext = createContext<AppContextType>({
  state: initialState,
  updateState: () => {},
  resetState: () => {},
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(initialState);
  
  // Load state from localStorage on initial mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('appState');
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        
        // Reset all loading states to prevent stuck UI
        parsedState.dealTimeline.loading = false;
        parsedState.dealsByStage.loading = false;
        parsedState.dealsByStage.stagesLoading = false;
        parsedState.controlPanel.loading = false;
        
        setState(parsedState);
        console.log('Restored state from localStorage with reset loading states');
      }
    } catch (error) {
      console.error('Error loading state from localStorage:', error);
    }
    
    // IIFE workaround to reset loading states after a small delay
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      setState(prevState => {
        // Create a deep clone to ensure immutability
        const newState = JSON.parse(JSON.stringify(prevState));
        
        // Reset all loading states
        newState.dealTimeline.loading = false;
        newState.dealsByStage.loading = false;
        newState.dealsByStage.stagesLoading = false;
        newState.controlPanel.loading = false;
        
        return newState;
      });
    })();
  }, []);
  
  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      // To avoid localStorage size limitations, we could potentially limit what gets saved
      // For instance, if the timeline data is very large, we might want to exclude it
      
      // Option 1: Save everything (may cause issues if state is very large)
      localStorage.setItem('appState', JSON.stringify(state));
      
      // Option 2: If state gets too large, save a filtered version
      // const savedState = {
      //   ...state,
      //   dealTimeline: {
      //     ...state.dealTimeline,
      //     // Keep essential data but exclude large arrays if needed
      //     // activities: null // Uncomment this if timeline data gets too large
      //   }
      // };
      // localStorage.setItem('appState', JSON.stringify(savedState));
    } catch (error) {
      console.error('Error saving state to localStorage:', error);
      
      // If we hit quota errors, try saving a smaller version
      try {
        // Exclude large data
        const minimalState = {
          dealTimeline: {
            selectedDeal: state.dealTimeline.selectedDeal,
            timeframe: state.dealTimeline.timeframe,
            deals: state.dealTimeline.deals,
            activities: null, // Don't store timeline activities
            loading: false,
            error: null,
            lastFetched: null
          },
          dealsByStage: {
            selectedStage: state.dealsByStage.selectedStage,
            availableStages: state.dealsByStage.availableStages,
            dealsByStage: {}, // Don't store deals by stage
            loading: false,
            stagesLoading: false,
            error: null,
            lastFetched: null
          },
          controlPanel: state.controlPanel
        };
        localStorage.setItem('appState', JSON.stringify(minimalState));
      } catch (fallbackError) {
        console.error('Failed to save even minimal state:', fallbackError);
      }
    }
  }, [state]);
  
  // Function to update specific parts of the state using lodash's set for deep updates
  const updateState = (path: string, value: any) => {
    setState(prevState => {
      // Create a deep clone to ensure immutability
      const newState = JSON.parse(JSON.stringify(prevState));
      
      // Use lodash's set for safer nested updates
      set(newState, path, value);
      
      return newState;
    });
  };
  
  // Function to reset state to initial values
  const resetState = () => {
    setState(initialState);
    localStorage.removeItem('appState');
  };
  
  return (
    <AppContext.Provider value={{ state, updateState, resetState }}>
      {children}
    </AppContext.Provider>
  );
};

// Custom hook to use the context
export const useAppState = () => useContext(AppContext);