import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware(req) {
    // Middleware logic can go here if needed
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl
        
        // Always allow access to auth pages and API routes
        if (pathname.startsWith('/auth/') || 
            pathname.startsWith('/api/auth/') ||
            pathname.startsWith('/_next/') ||
            pathname === '/favicon.ico') {
          return true
        }
        
        // For all other pages, require authentication
        return !!token
      },
    },
    pages: {
      signIn: '/auth/signin',
    }
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files) 
     * - favicon.ico (favicon file)
     * - public folder
     * - auth pages (handled by callback)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|public|auth).*)',
    // Also protect the root and other main routes
    '/',
    '/deal-timeline',
    '/deals-by-stage',
    '/ama'
  ],
}
