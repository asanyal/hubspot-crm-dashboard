// app/deal-timeline/page.tsx
'use client';

// import Header from '../components/Header';
import DealTimeline from '../components/DealTimeline';

export default function DealTimelinePage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* <Header /> */}
      <main className="container mx-auto py-6 dark:bg-gray-900">
        <DealTimeline />
      </main>
    </div>
  );
}