'use client';

// import Header from '../components/Header';
import DealStageSelector from '../components/DealStageSelector';

export default function DealsByStage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* <Header /> */}
      <main className="container mx-auto py-6 dark:bg-gray-900">
        <DealStageSelector />
      </main>
    </div>
  );
}