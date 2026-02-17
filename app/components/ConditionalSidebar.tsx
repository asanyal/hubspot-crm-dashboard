'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function ConditionalSidebar() {
  const pathname = usePathname()

  // Don't show sidebar on auth pages
  const isAuthPage = pathname.startsWith('/auth/')

  if (isAuthPage) {
    return null
  }

  return <Sidebar />
}
