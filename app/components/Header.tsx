// app/components/Header.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Header: React.FC = () => {
  const pathname = usePathname();
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Check for dark mode preference on initial load
  useEffect(() => {
    // Check if the user has a stored preference
    const storedTheme = localStorage.getItem('theme');
    
    // Check if user has dark mode preference or has previously selected dark mode
    if (storedTheme === 'dark' || 
       (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Active link style
  const isActive = (path: string) => {
    return pathname === path ? 
      'bg-indigo-50 text-indigo-700 dark:bg-slate-700 dark:text-indigo-300' : 
      'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700';
  };

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700 transition-colors duration-200 dark:text-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 font-bold text-xl text-indigo-600 dark:text-indigo-400 font-serif hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors">
              Spotlight
            </Link>
            <nav className="ml-10 flex space-x-2">
              <Link href="/" 
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${isActive('/')}`}>
                Overview
              </Link>
              <Link href="/deals-by-stage" 
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${isActive('/deals-by-stage')}`}>
                Pipeline Explorer
              </Link>
              <Link href="/deal-timeline" 
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${isActive('/deal-timeline')}`}>
                Deal Timeline
              </Link>
            </nav>
          </div>
          
        </div>
      </div>
    </header>
  );
};

export default Header;