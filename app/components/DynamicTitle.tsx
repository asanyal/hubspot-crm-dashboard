"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppState } from '../context/AppContext';

const pageTitles: Record<string, string> = {
  '/': 'Overview',
  '/deals-by-stage': 'Pipe Explorer',
  '/deal-timeline': 'Deal Timeline',
  '/signals': 'Signals',
};

const DynamicTitle = () => {
  const pathname = usePathname();
  const { state } = useAppState();
  const { selectedDeal } = state.dealTimeline;

  useEffect(() => {
    const baseTitle = pageTitles[pathname] || 'Spotlight Revenue Intelligence';

    if (pathname === '/deal-timeline' && selectedDeal?.name) {
      document.title = `${baseTitle} - ${selectedDeal.name}`;
    } else {
      document.title = baseTitle;
    }
  }, [pathname, selectedDeal]);

  return null;
};

export default DynamicTitle; 