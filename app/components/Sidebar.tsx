// app/components/Sidebar.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Active link style
  const isActive = (path: string) => {
    if (isCollapsed) {
      return pathname === path ?
        'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' :
        'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50';
    }
    return pathname === path ?
      'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 border-l-4 border-sky-600 dark:border-sky-400' :
      'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50 border-l-4 border-transparent hover:border-slate-300 dark:hover:border-slate-600';
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/signin' });
  };

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setIsCollapsed(savedState === 'true');
    }
  }, []);

  // Save collapsed state to localStorage and dispatch event
  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
    // Dispatch custom event so LayoutWrapper can listen
    window.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { collapsed: newState } }));
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
    <aside className={`fixed left-0 top-0 h-screen bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 shadow-sm transition-all duration-300 flex flex-col z-40 ${isCollapsed ? 'w-20' : 'w-64'}`} suppressHydrationWarning>
      {/* Logo and Toggle Section */}
      <div className={`border-b border-gray-200 dark:border-slate-700 ${isCollapsed ? 'p-4' : 'p-6'} relative`}>
        <Link href="/" className={`flex items-center group transition-all duration-300 ${isCollapsed ? 'justify-center' : ''}`}>
          <span className={`text-sky-500 dark:text-sky-300 ${isCollapsed ? 'mr-0' : 'mr-2'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 transform group-hover:rotate-12 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          {!isCollapsed && (
            <div className="flex items-center">
              <span className="font-extrabold text-xl tracking-tight font-sans text-sky-600 dark:text-sky-400">SPOT</span>
              <span className="font-light text-xl tracking-wider font-sans text-sky-600 dark:text-sky-400">LIGHT</span>
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-300 group-hover:bg-sky-400 transition-colors"></span>
            </div>
          )}
        </Link>

        {/* Minimal Toggle Button */}
        <button
          onClick={toggleCollapsed}
          className={`absolute ${isCollapsed ? 'top-4 right-2' : 'top-6 right-4'} p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className={`flex-1 py-6 space-y-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-3'}`}>
        <div className="relative group">
          <Link href="/"
                className={`flex items-center py-3 rounded-r-md text-sm font-medium transition-all duration-200 ${isCollapsed ? 'px-3 justify-center' : 'px-4'} ${isActive('/')}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isCollapsed ? 'mr-0' : 'mr-3'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            {!isCollapsed && <span>Overview</span>}
          </Link>
          {isCollapsed && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-200 z-50">
              Overview
            </div>
          )}
        </div>

        <div className="relative group">
          <Link href="/deals-by-stage"
                className={`flex items-center py-3 rounded-r-md text-sm font-medium transition-all duration-200 ${isCollapsed ? 'px-3 justify-center' : 'px-4'} ${isActive('/deals-by-stage')}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isCollapsed ? 'mr-0' : 'mr-3'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {!isCollapsed && <span>Pipe Explorer</span>}
          </Link>
          {isCollapsed && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-200 z-50">
              Pipe Explorer
            </div>
          )}
        </div>

        <div className="relative group">
          <Link href="/deal-timeline"
                className={`flex items-center py-3 rounded-r-md text-sm font-medium transition-all duration-200 ${isCollapsed ? 'px-3 justify-center' : 'px-4'} ${isActive('/deal-timeline')}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isCollapsed ? 'mr-0' : 'mr-3'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {!isCollapsed && <span>Timeline</span>}
          </Link>
          {isCollapsed && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-200 z-50">
              Timeline
            </div>
          )}
        </div>

        <div className="relative group">
          <Link href="/signals"
                className={`flex items-center py-3 rounded-r-md text-sm font-medium transition-all duration-200 ${isCollapsed ? 'px-3 justify-center' : 'px-4'} ${isActive('/signals')}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isCollapsed ? 'mr-0' : 'mr-3'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {!isCollapsed && <span>Signals</span>}
          </Link>
          {isCollapsed && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-200 z-50">
              Signals
            </div>
          )}
        </div>
      </nav>

      {/* User Section at Bottom */}
      {session?.user && (
        <div className={`border-t border-gray-200 dark:border-slate-700 ${isCollapsed ? 'p-2' : 'p-4'}`} ref={dropdownRef}>
          <div className="relative group">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`w-full flex items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-200 ${isCollapsed ? 'justify-center' : 'space-x-3'}`}
            >
              <img
                src={session.user.image || '/default-avatar.png'}
                alt={session.user.name || 'User'}
                className={`rounded-full border-2 border-sky-200 dark:border-sky-600 flex-shrink-0 ${isCollapsed ? 'w-8 h-8' : 'w-10 h-10'}`}
              />
              {!isCollapsed && (
                <>
                  <div className="flex-1 text-left overflow-hidden">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {session.user.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {session.user.email}
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 flex-shrink-0 ${
                      isDropdownOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {/* Tooltip for collapsed state */}
            {isCollapsed && !isDropdownOpen && (
              <div className="absolute left-full ml-2 bottom-0 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-200 z-50">
                <p className="font-medium">{session.user.name}</p>
                <p className="text-xs opacity-75">{session.user.email}</p>
              </div>
            )}
          </div>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className={`absolute ${isCollapsed ? 'bottom-16 left-full ml-2' : 'bottom-20 left-4 right-4'} bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1 ${isCollapsed ? 'w-48' : ''}`}>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors duration-200 flex items-center space-x-2 rounded-lg"
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
    </aside>
  );
};

export default Sidebar;
