'use client';

import React, { useState, useEffect, useRef } from 'react';

interface DateRangeSliderProps {
  onRangeChange: (startDate: string, endDate: string) => void;
  isLoading?: boolean;
}

const DateRangeSlider: React.FC<DateRangeSliderProps> = ({ onRangeChange, isLoading = false }) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  
  // Generate months array (6 months past to 2 months future)
  const generateMonths = () => {
    const months: string[] = [];
    const currentDate = new Date();
    
    // Add past 6 months
    for (let i = 6; i > 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      months.push(date.toISOString().slice(0, 7)); // Format: YYYY-MM
    }
    
    // Add current month
    months.push(currentDate.toISOString().slice(0, 7));
    
    // Add future 2 months
    for (let i = 1; i <= 2; i++) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() + i);
      months.push(date.toISOString().slice(0, 7));
    }
    
    return months;
  };

  const months = generateMonths();
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  // Initialize with current month and next month
  const [startIndex, setStartIndex] = useState(months.indexOf(currentMonth));
  const [endIndex, setEndIndex] = useState(months.indexOf(currentMonth) + 1);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Calculate index from mouse position
  const getIndexFromMousePosition = (clientX: number) => {
    if (!sliderRef.current) return 0;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = x / rect.width;
    const index = Math.round(percentage * (months.length - 1));
    
    return Math.max(0, Math.min(months.length - 1, index));
  };

  // Handle mouse move
  const handleMouseMove = (e: MouseEvent) => {
    if (!activeHandle) return;
    
    const newIndex = getIndexFromMousePosition(e.clientX);
    
    if (activeHandle === 'start') {
      if (newIndex <= endIndex) {
        setStartIndex(newIndex);
        onRangeChange(months[newIndex], months[endIndex]);
      }
    } else if (activeHandle === 'end') {
      if (newIndex >= startIndex) {
        setEndIndex(newIndex);
        onRangeChange(months[startIndex], months[newIndex]);
      }
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    setActiveHandle(null);
  };

  // Handle track click
  const handleTrackClick = (e: React.MouseEvent) => {
    if (isLoading) return;
    
    const newIndex = getIndexFromMousePosition(e.clientX);
    
    // Determine which handle to move based on which is closer
    const startDistance = Math.abs(newIndex - startIndex);
    const endDistance = Math.abs(newIndex - endIndex);
    
    if (startDistance <= endDistance) {
      // Move start handle
      if (newIndex <= endIndex) {
        setStartIndex(newIndex);
        onRangeChange(months[newIndex], months[endIndex]);
      }
    } else {
      // Move end handle
      if (newIndex >= startIndex) {
        setEndIndex(newIndex);
        onRangeChange(months[startIndex], months[newIndex]);
      }
    }
  };

  // Handle time range shortcuts
  const handleTimeRangeShortcut = (monthsBack: number) => {
    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setMonth(currentDate.getMonth() - monthsBack);
    
    const startMonth = startDate.toISOString().slice(0, 7);
    const endMonth = currentDate.toISOString().slice(0, 7);
    
    const newStartIndex = months.indexOf(startMonth);
    const newEndIndex = months.indexOf(endMonth);
    
    if (newStartIndex !== -1 && newEndIndex !== -1) {
      setStartIndex(newStartIndex);
      setEndIndex(newEndIndex);
      onRangeChange(months[newStartIndex], months[newEndIndex]);
    }
  };

  // Add and remove event listeners
  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeHandle, startIndex, endIndex]);

  return (
    <div className="w-full space-y-4">
      {/* Time Range Shortcuts */}
      <div className="flex justify-center gap-2 mb-4">
        <button
          onClick={() => handleTimeRangeShortcut(1)}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap"
          disabled={isLoading}
        >
          Last 1 Month
        </button>
        <button
          onClick={() => handleTimeRangeShortcut(2)}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap"
          disabled={isLoading}
        >
          Last 2 Months
        </button>
        <button
          onClick={() => handleTimeRangeShortcut(3)}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap"
          disabled={isLoading}
        >
          Last 3 Months
        </button>
        <button
          onClick={() => handleTimeRangeShortcut(6)}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap"
          disabled={isLoading}
        >
          Last 6 Months
        </button>
      </div>

      {/* Selected Range Display */}
      <div className="text-center text-sm font-medium text-gray-700">
        {formatMonth(months[startIndex])} - {formatMonth(months[endIndex])}
      </div>

      {/* Slider Container */}
      <div ref={sliderRef} className="relative px-2">
        {/* Track */}
        <div 
          className="h-2 bg-gray-200 rounded-full cursor-pointer"
          onClick={handleTrackClick}
        >
          {/* Selected Range */}
          <div
            className="absolute h-2 bg-sky-500 rounded-full"
            style={{
              left: `${(startIndex / (months.length - 1)) * 100}%`,
              width: `${((endIndex - startIndex) / (months.length - 1)) * 100}%`
            }}
          />
        </div>

        {/* Start Handle */}
        <div
          className={`absolute w-4 h-4 bg-white border-2 border-sky-500 rounded-full -mt-1 cursor-pointer hover:scale-110 transition-transform ${
            activeHandle === 'start' ? 'ring-2 ring-sky-300' : ''
          }`}
          style={{
            left: `calc(${(startIndex / (months.length - 1)) * 100}% - 8px)`
          }}
          onMouseDown={() => setActiveHandle('start')}
        />

        {/* End Handle */}
        <div
          className={`absolute w-4 h-4 bg-white border-2 border-sky-500 rounded-full -mt-1 cursor-pointer hover:scale-110 transition-transform ${
            activeHandle === 'end' ? 'ring-2 ring-sky-300' : ''
          }`}
          style={{
            left: `calc(${(endIndex / (months.length - 1)) * 100}% - 8px)`
          }}
          onMouseDown={() => setActiveHandle('end')}
        />

        {/* Month Labels */}
        <div className="flex justify-between mt-4">
          {months.map((month, index) => (
            <div
              key={month}
              className={`text-xs ${
                month === currentMonth
                  ? 'text-gray-900 font-bold'
                  : 'text-gray-500'
              }`}
            >
              {formatMonth(month)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DateRangeSlider; 