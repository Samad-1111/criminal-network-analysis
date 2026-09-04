import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { 
  Network, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Loader2, 
  AlertTriangle, 
  RefreshCw,
  Info
} from 'lucide-react';
import { 
  convertToCytoscapeElements, 
  CYTOSCAPE_STYLESHEET, 
  getCytoscapeLayoutConfig 
} from '../utils/cytoscapeAdapter';

export default function GraphWorkspace({
  graphData,
  loading = false,
  error = null,
  onRetry,
  onNodeClick,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Initialize and update Cytoscape instance
  useEffect(() => {
    if (!containerRef.current || loading || error || !graphData || !graphData.nodes || graphData.nodes.length === 0) {
      return;
    }

    const elements = convertToCytoscapeElements(graphData);

    // Clean up prior instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    try {
      const cy = cytoscape({
        container: containerRef.current,
        elements: elements,
        style: CYTOSCAPE_STYLESHEET,
        layout: getCytoscapeLayoutConfig(),
        minZoom: 0.3,
        maxZoom: 3.0,
        wheelSensitivity: 0.25,
        boxSelectionEnabled: false,
      });

      // Bind node click/tap
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        if (onNodeClick) {
          onNodeClick(node.data());
        }
      });

      cyRef.current = cy;
    } catch (err) {
      console.error('Failed to initialize Cytoscape graph:', err);
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [graphData, loading, error, onNodeClick]);

  // Toolbar Actions
  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.25);
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 50);
    }
  };

  const handleResetLayout = () => {
    if (cyRef.current) {
      const layout = cyRef.current.layout(getCytoscapeLayoutConfig());
      layout.run();
    }
  };

  const nodeCount = graphData?.nodes?.length || 0;
  const edgeCount = graphData?.edges?.length || 0;

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0 h-full relative select-none">
      {/* Top Workspace Header */}
      <div className="h-10 px-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Network className="w-3.5 h-3.5 text-blue-400" />
          <span>Entity Network Workspace</span>
          {nodeCount > 0 && !loading && !error && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
              {nodeCount} entities · {edgeCount} links
            </span>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFit}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Fit to Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetLayout}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Reset Concentric Layout"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas & States */}
      <div className="flex-1 relative flex items-center justify-center bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]">
        {/* Loading State */}
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xs">
            <Loader2 className="w-7 h-7 text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-200">
              Building criminal network graph...
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Analyzing entities and computing network centrality
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/90 text-center">
            <div className="w-12 h-12 rounded-lg bg-red-950/50 border border-red-800/60 flex items-center justify-center text-red-400 mb-3 shadow-sm">
              <AlertTriangle className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">
              Failed to load network graph
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4 font-mono bg-slate-900 px-3 py-1.5 rounded border border-slate-800">
              {error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && nodeCount === 0 && (
          <div className="text-center max-w-sm p-6">
            <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-500 mb-3 shadow-sm">
              <Info className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">
              No network data available
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Submit crime records to construct and inspect the multi-entity relationship graph.
            </p>
          </div>
        )}

        {/* Cytoscape DOM Canvas Container */}
        <div 
          ref={containerRef} 
          className={`w-full h-full ${loading || error || nodeCount === 0 ? 'invisible' : 'visible'}`}
        />
      </div>
    </div>
  );
}
