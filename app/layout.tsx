// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProvider } from './context/AppContext';
import { Providers } from './providers';
import ConditionalHeader from './components/ConditionalHeader';
import DynamicTitle from './components/DynamicTitle';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spotlight Revenue Intelligence",
  description: "Spotlight Revenue Intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased bg-background text-foreground">
        <Providers>
          <AppProvider>
            <DynamicTitle />
            <ConditionalHeader />
            <main>
              {children}
            </main>
          </AppProvider>
        </Providers>
      </body>
    </html>
  );
}