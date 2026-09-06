import React from 'react';
import { Shield } from 'lucide-react';

export default function Header({ backendStatus = 'connected' }) {
  const getStatusBadge = () => {
    switch (backendStatus) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-semantic-green-light border border-green-200 text-xs">
            <span className="w-2 h-2 rounded-full bg-semantic-green"></span>
            <span className="text-semantic-green font-medium">Backend Online</span>
          </div>
        );
      case 'loading':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-semantic-amber-light border border-amber-200 text-xs">
            <span className="w-2 h-2 rounded-full bg-semantic-amber animate-pulse"></span>
            <span className="text-semantic-amber font-medium">Connecting...</span>
          </div>
        );
      case 'error':
      default:
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-semantic-red-light border border-red-200 text-xs">
            <span className="w-2 h-2 rounded-full bg-semantic-red"></span>
            <span className="text-semantic-red font-medium">Backend Offline</span>
          </div>
        );
    }
  };

  return (
    <header className="h-14 bg-warm-white border-b border-border px-5 flex items-center justify-between shrink-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-accent-red-light border border-red-200 flex items-center justify-center text-accent-red">
          <Shield className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-charcoal tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
              Criminal Network Analysis
            </h1>
          </div>
          <p className="text-xs text-warm-gray">
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
