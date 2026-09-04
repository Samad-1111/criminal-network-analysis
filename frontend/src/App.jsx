import React from 'react';
import Header from './components/Header';
import GraphWorkspace from './components/GraphWorkspace';
import RecommendationPanel from './components/RecommendationPanel';

export default function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        <GraphWorkspace />
        <RecommendationPanel />
      </main>
    </div>
  );
}
