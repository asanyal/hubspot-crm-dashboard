"use client";

import { useEffect } from 'react';
import { useAppState } from '../context/AppContext';

const DynamicTitle = () => {
  const { state } = useAppState();
  const { selectedDeal } = state.dealTimeline;

  useEffect(() => {
    if (selectedDeal?.name) {
      document.title = `Spotlight - ${selectedDeal.name}`;
    } else {
      document.title = 'Spotlight Revenue Intelligence';
    }
  }, [selectedDeal]);

  return null; // This component doesn't render anything
};

export default DynamicTitle; 