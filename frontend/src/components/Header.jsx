import React from 'react';
import { Shield } from 'lucide-react';

export default function Header({ backendStatus = 'connected' }) {
  const getStatusBadge = () => {
    switch (backendStatus) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="text-slate-300 font-medium">Backend Ready</span>
          </div>
        );
      case 'loading':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span>
            <span className="text-slate-300 font-medium">Connecting...</span>
          </div>
        );
      case 'error':
      default:
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-red-950/40 border border-red-800/50 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
            <span className="text-red-300 font-medium">Backend Offline</span>
          </div>
        );
    }
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <Shield className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight">
              Criminal Network Analysis
            </h1>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              v1.0
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Investigation Intelligence & Next-Best-Action System
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {getStatusBadge()}
      </div>
    </header>
  );
}
