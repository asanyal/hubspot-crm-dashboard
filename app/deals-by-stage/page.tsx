'use client';

import { useState, useEffect } from 'react';
import DealStageSelector from '../components/DealStageSelector';

export default function DealsByStage() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load initial collapsed state and listen for changes
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setIsCollapsed(savedState === 'true');
    }

    const handleSidebarToggle = (event: CustomEvent) => {
      setIsCollapsed(event.detail.collapsed);
    };

    window.addEventListener('sidebarToggle', handleSidebarToggle as EventListener);
    return () => {
      window.removeEventListener('sidebarToggle', handleSidebarToggle as EventListener);
    };
  }, []);

  return (
    <div className={`min-h-screen bg-background transition-all duration-300 ${isCollapsed ? '-ml-20' : '-ml-64'}`}>
      <DealStageSelector isMainSidebarCollapsed={isCollapsed} />
    </div>
  );
}