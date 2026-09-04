import React from 'react';
import { Network, ZoomIn, ZoomOut, Maximize2, RotateCcw, Layers } from 'lucide-react';

export default function GraphWorkspace() {
  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0 h-full">
      {/* Top Workspace Bar */}
      <div className="h-10 px-4 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Network className="w-3.5 h-3.5 text-blue-400" />
          <span>Entity Network Workspace</span>
        </div>

        {/* Toolbar Controls (Placeholders) */}
        <div className="flex items-center gap-1">
          <button 
            type="button"
            disabled
            className="p-1.5 text-slate-500 hover:text-slate-400 rounded hover:bg-slate-800 disabled:opacity-40 cursor-not-allowed"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button 
            type="button"
            disabled
            className="p-1.5 text-slate-500 hover:text-slate-400 rounded hover:bg-slate-800 disabled:opacity-40 cursor-not-allowed"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button 
            type="button"
            disabled
            className="p-1.5 text-slate-500 hover:text-slate-400 rounded hover:bg-slate-800 disabled:opacity-40 cursor-not-allowed"
            title="Fit to Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button 
            type="button"
            disabled
            className="p-1.5 text-slate-500 hover:text-slate-400 rounded hover:bg-slate-800 disabled:opacity-40 cursor-not-allowed"
            title="Reset Layout"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Graph Area / Placeholder */}
      <div className="flex-1 relative flex items-center justify-center p-8 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-500 mb-3 shadow-sm">
            <Network className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">
            Network graph will load here
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Interactive multi-entity relationship network with evidence-backed connections.
          </p>
        </div>
      </div>
    </div>
  );
}
