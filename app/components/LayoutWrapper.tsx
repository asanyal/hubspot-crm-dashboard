'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Don't apply margin on auth pages
  const isAuthPage = pathname.startsWith('/auth/')

  // Load initial collapsed state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed')
    if (savedState !== null) {
      setIsCollapsed(savedState === 'true')
    }
  }, [])

  // Listen for sidebar toggle events
  useEffect(() => {
    const handleSidebarToggle = (event: CustomEvent) => {
      setIsCollapsed(event.detail.collapsed)
    }

    window.addEventListener('sidebarToggle', handleSidebarToggle as EventListener)
    return () => {
      window.removeEventListener('sidebarToggle', handleSidebarToggle as EventListener)
    }
  }, [])

  const marginClass = isAuthPage ? '' : isCollapsed ? 'ml-20' : 'ml-64'

  return (
    <main className={`${marginClass} transition-all duration-300`}>
      {children}
    </main>
  )
}
