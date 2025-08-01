'use client';

// import Header from './components/Header';
import ControlPanel from './components/ControlPanel';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* <Header /> */}
      <main className="container mx-auto py-6">
        <ControlPanel />
      </main>
    </div>
  );
}