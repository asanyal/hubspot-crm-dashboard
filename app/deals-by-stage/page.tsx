'use client';

// import Header from '../components/Header';
import DealStageSelector from '../components/DealStageSelector';

export default function DealsByStage() {
  return (
    <div className="min-h-screen bg-background">
      {/* <Header /> */}
      <main className="container mx-auto py-6">
        <DealStageSelector />
      </main>
    </div>
  );
}