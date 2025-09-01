// app/components/Header.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const Header: React.FC = () => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Active link style
  const isActive = (path: string) => {
    return pathname === path ? 
      'bg-sky-50 text-sky-600 dark:bg-slate-700 dark:text-sky-300' : 
      'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700';
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/signin' });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header className="bg-card border-b border-border shadow-sm transition-colors duration-200">
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
              <Link href="/owner-analysis" 
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${isActive('/owner-analysis')}`}>
                Owner Analysis
              </Link>
            </nav>
          </div>
          
          {/* User Avatar and Dropdown */}
          {session?.user && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-2 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200"
              >
                <img
                  src={session.user.image || '/default-avatar.png'}
                  alt={session.user.name || 'User'}
                  className="w-8 h-8 rounded-full border-2 border-sky-200 dark:border-sky-600"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
                  {session.user.name}
                </span>
                <svg 
                  className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-gray-200 dark:border-slate-700 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {session.user.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {session.user.email}
                    </p>
                  </div>
                  
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          )}
          
        </div>
      </div>
    </header>
  );
};

export default Header;