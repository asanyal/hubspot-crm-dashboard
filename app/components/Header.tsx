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
      'bg-sky-50 text-sky-600 dark:bg-slate-700 dark:text-sky-300' : 
      'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700';
  };

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700 transition-colors duration-200 dark:text-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 font-bold text-xl text-sky-600 dark:text-sky-400 flex items-center group transition-all duration-300">
              <span className="mr-1.5 text-sky-500 dark:text-sky-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform group-hover:rotate-12 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </span>
              <span className="font-extrabold tracking-tight font-sans">SPOT</span>
              <span className="font-light tracking-wider font-sans">LIGHT</span>
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-300 group-hover:bg-sky-400 transition-colors"></span>
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