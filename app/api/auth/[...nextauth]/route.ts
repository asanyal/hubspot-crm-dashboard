import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('SignIn callback - User:', user?.email, 'Profile:', profile?.email)
      
      // Check user email first, then profile email as fallback
      const email = user?.email || profile?.email
      
      if (!email) {
        console.log('No email found in user or profile')
        return '/auth/error?error=NoEmail'
      }
      
      console.log('Checking email:', email)
      
      // Check if email ends with @galileo.ai (case insensitive)
      if (email.toLowerCase().endsWith('@galileo.ai')) {
        console.log('Email approved:', email)
        return true
      }
      
      console.log('Email rejected:', email)
      // Redirect to error page with specific message
      return '/auth/error?error=AccessDenied'
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
    async session({ session, token }) {
      return session
    },
    async jwt({ token, user }) {
      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
