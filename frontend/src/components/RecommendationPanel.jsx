import React from 'react';
import { Target, ListFilter } from 'lucide-react';

export default function RecommendationPanel() {
  return (
    <aside className="w-96 border-l border-slate-800 bg-slate-900/90 flex flex-col shrink-0 h-full">
      {/* Panel Header */}
      <div className="h-10 px-4 border-b border-slate-800/80 bg-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Target className="w-3.5 h-3.5 text-indigo-400" />
          <span>Next-Best-Actions</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <ListFilter className="w-3.5 h-3.5" />
          <span>Ranked</span>
        </div>
      </div>

      {/* Main Panel Content / Placeholder */}
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center max-w-xs">
          <div className="w-12 h-12 rounded-lg bg-slate-800/80 border border-slate-700/60 mx-auto flex items-center justify-center text-slate-500 mb-3 shadow-sm">
            <Target className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">
            Investigation recommendations will appear here
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic decision-support leads prioritized by case evidence and network structure.
          </p>
        </div>
      </div>
    </aside>
  );
}
