import React, { useEffect, useRef, useCallback, useState } from 'react';
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
  Info,
  X,
  FileText,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

import {
  convertToCytoscapeElements,
  CYTOSCAPE_STYLESHEET,
  getCytoscapeLayoutConfig,
} from '../utils/cytoscapeAdapter';


export default function GraphWorkspace({
  graphData,
  loading = false,
  error = null,
  onRetry,
  onRefreshGraph,
  activeInvestigation = null,
  onNodeClick,
  selectedEntityId = null,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Selected node or edge detail card state
  const [selectedDetail, setSelectedDetail] = useState(null);

  // Keep the latest callback without forcing Cytoscape recreation
  const onNodeClickRef = useRef(onNodeClick);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);


  /*
   * Apply recommendation highlight.
   */
  const applyRecommendationHighlight = useCallback((cy, entityId) => {
    if (!cy) return;

    // Step 0: Completely reset previous recommendation state
    cy.elements().removeClass(
      'nba-highlight nba-neighbour nba-highlight-edge nba-dimmed'
    );

    // No selected recommendation -> normal graph
    if (!entityId) {
      return;
    }

    // Find the selected node
    const target = cy.getElementById(entityId);

    // Safety check
    if (!target || target.length === 0) {
      return;
    }

    // Step 1: Dim all elements
    cy.elements().addClass('nba-dimmed');

    // Step 2: Target must not be dimmed
    target.removeClass('nba-dimmed');

    // Step 3: Highlight selected target
    target.addClass('nba-highlight');

    // Step 4: Get edges directly connected to target
    const connectedEdges = target.connectedEdges();

    // Step 5: Highlight direct edges
    connectedEdges
      .removeClass('nba-dimmed')
      .addClass('nba-highlight-edge');

    // Step 6: Get actual neighbouring nodes
    const neighbourNodes = connectedEdges
      .connectedNodes()
      .not(target);

    // Step 7: Highlight neighbouring nodes
    neighbourNodes
      .removeClass('nba-dimmed')
      .addClass('nba-neighbour');

    const focusElements = target.union(neighbourNodes);

    cy.animate(
      {
        fit: {
          eles: focusElements,
          padding: 80,
        },
      },
      {
        duration: 400,
        easing: 'ease-in-out-cubic',
      }
    );
  }, []);


  /*
   * Initialize Cytoscape.
   */
  useEffect(() => {
    if (
      !containerRef.current ||
      loading ||
      error ||
      !graphData ||
      !Array.isArray(graphData.nodes) ||
      graphData.nodes.length === 0
    ) {
      return;
    }

    const elements = convertToCytoscapeElements(graphData);

    // Destroy old instance before creating a new one
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    try {
      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: CYTOSCAPE_STYLESHEET,
        layout: getCytoscapeLayoutConfig(),

        minZoom: 0.3,
        maxZoom: 3.0,
        wheelSensitivity: 0.25,
        boxSelectionEnabled: false,
        autoungrabify: false,
        userZoomingEnabled: true,
        userPanningEnabled: true,
      });

      // Node click event
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const nodeData = node.data();
        setSelectedDetail({ type: 'node', data: nodeData });

        if (onNodeClickRef.current) {
          onNodeClickRef.current(nodeData);
        }
      });

      // Edge click event
      cy.on('tap', 'edge', (evt) => {
        const edge = evt.target;
        const edgeData = edge.data();
        const srcNode = cy.getElementById(edgeData.source);
        const tgtNode = cy.getElementById(edgeData.target);

        setSelectedDetail({
          type: 'edge',
          data: {
            ...edgeData,
            sourceLabel: srcNode.length > 0 ? srcNode.data('label') : edgeData.source,
            targetLabel: tgtNode.length > 0 ? tgtNode.data('label') : edgeData.target,
          },
        });
      });

      // Tap background to clear selection card
      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          setSelectedDetail(null);
        }
      });

      // Save Cytoscape instance
      cyRef.current = cy;

      applyRecommendationHighlight(cy, selectedEntityId);

      requestAnimationFrame(() => {
        if (cy && !cy.destroyed()) {
          cy.resize();
          if (!selectedEntityId) {
            cy.fit(undefined, 50);
          }
        }
      });

    } catch (err) {
      console.error('Failed to initialize Cytoscape graph:', err);
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };

  }, [
    graphData,
    loading,
    error,
    applyRecommendationHighlight,
  ]);


  // Highlight effect on selected entity change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    applyRecommendationHighlight(cy, selectedEntityId);
  }, [selectedEntityId, applyRecommendationHighlight]);


  // Toolbar actions
  const handleZoomIn = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.zoom({
      level: cy.zoom() * 1.25,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const handleZoomOut = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.zoom({
      level: cy.zoom() * 0.8,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const handleFit = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.fit(undefined, 50);
  };

  const handleResetLayout = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    cy.elements().removeClass('nba-highlight nba-neighbour nba-highlight-edge nba-dimmed');
    const layout = cy.layout(getCytoscapeLayoutConfig());
    layout.run();
    setTimeout(() => {
      if (cy && !cy.destroyed()) {
        cy.fit(undefined, 50);
      }
    }, 100);
  };


  const nodeCount = graphData?.nodes?.length || 0;
  const edgeCount = graphData?.edges?.length || 0;
  const metrics = graphData?.metrics || {};

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0 h-full relative select-none">

      {/* =========================
          TOP WORKSPACE HEADER
      ========================= */}
      <div className="h-10 px-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0 z-10">

        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium min-w-0">
          <Network className="w-3.5 h-3.5 text-blue-400 shrink-0" />

          {activeInvestigation ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-mono shrink-0">
              LIVE INVESTIGATION GRAPH
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800/60 font-mono shrink-0">
              DEMO MODE
            </span>
          )}

          {activeInvestigation && (
            <span className="text-slate-300 font-mono text-xs truncate max-w-[180px]">
              {activeInvestigation.case_number}
            </span>
          )}

          {!loading && !error && nodeCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700 shrink-0">
              {nodeCount} Nodes · {edgeCount} Edges
              {metrics.total_components !== undefined && ` · ${metrics.total_components} Components`}
            </span>
          )}
        </div>


        {/* =========================
            TOOLBAR
        ========================= */}
        <div className="flex items-center gap-1 shrink-0">

          {/* Refresh Graph Control */}
          <button
            type="button"
            onClick={onRefreshGraph}
            disabled={loading || !activeInvestigation}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded border border-slate-700/80 disabled:opacity-40 disabled:hover:bg-slate-800/80 cursor-pointer transition-colors"
            title={activeInvestigation ? "Refresh Live Investigation Graph" : "Select an investigation to enable graph refresh"}
          >
            <RefreshCw className={`w-3 h-3 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Graph</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1"></div>

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


      {/* =========================
          MAIN GRAPH AREA
      ========================= */}
      <div className="flex-1 relative flex items-center justify-center bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]">

        {/* LOADING STATE */}
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <Loader2 className="w-7 h-7 text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-200">
              {activeInvestigation
                ? 'Loading investigation intelligence graph...'
                : 'Building criminal network graph...'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Analyzing entities and computing network centrality
            </p>
          </div>
        )}

        {/* ERROR STATE */}
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

        {/* EMPTY STATE */}
        {!loading && !error && nodeCount === 0 && (
          <div className="text-center max-w-md p-6 bg-slate-900/60 border border-slate-800 rounded-xl shadow-xl">
            <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-slate-400 mb-3 shadow-sm">
              <Info className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">
              No intelligence graph available yet.
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Upload and process evidence, then extract entities and relationships to build the investigation network.
            </p>
            {activeInvestigation && onRefreshGraph && (
              <button
                type="button"
                onClick={onRefreshGraph}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Check for Updated Graph</span>
              </button>
            )}
          </div>
        )}

        {/* CYTOSCAPE CONTAINER */}
        <div
          ref={containerRef}
          className={`w-full h-full ${loading || error || nodeCount === 0 ? 'invisible' : 'visible'}`}
        />

        {/* FLOATING DETAIL INSPECTOR PANEL (On Node or Edge click) */}
        {!loading && !error && selectedDetail && (
          <div className="absolute bottom-4 left-4 z-20 max-w-sm w-full bg-slate-900/95 border border-slate-700/80 rounded-lg p-3 shadow-2xl backdrop-blur-md text-xs text-slate-200 space-y-2 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-semibold text-slate-100">
                {selectedDetail.type === 'node' ? (
                  <>
                    <ShieldAlert className="w-4 h-4 text-blue-400" />
                    <span>Entity Intelligence</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Relationship Evidence</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-slate-400 hover:text-slate-200 p-0.5 rounded hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedDetail.type === 'node' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">{selectedDetail.data.label}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800 uppercase font-mono">
                    {selectedDetail.data.entity_type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/60 p-2 rounded border border-slate-800">
                  <div>
                    <div className="text-slate-500 font-medium">Confidence</div>
                    <div className="font-mono text-emerald-400 font-semibold">
                      {Math.round((selectedDetail.data.confidence || 1.0) * 100)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-medium">Degree Centrality</div>
                    <div className="font-mono text-slate-200">
                      {selectedDetail.data.degree_centrality ?? 0}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-slate-500 font-medium">Betweenness Centrality</div>
                    <div className="font-mono text-slate-200">
                      {selectedDetail.data.betweenness_centrality ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedDetail.type === 'edge' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 uppercase font-mono">
                    {selectedDetail.data.relationship_type}
                  </span>
                  <span className="font-mono text-emerald-400 text-[11px] font-semibold">
                    Confidence: {Math.round((selectedDetail.data.confidence || 1.0) * 100)}%
                  </span>
                </div>

                <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded border border-slate-800 text-[11px] font-medium text-slate-200">
                  <span className="truncate max-w-[120px] font-semibold">{selectedDetail.data.sourceLabel || 'Source Entity'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate max-w-[120px] font-semibold">{selectedDetail.data.targetLabel || 'Target Entity'}</span>
                </div>

                {selectedDetail.data.source_document_id && (
                  <div className="bg-slate-950/60 p-2 rounded border border-slate-800 text-[10px] space-y-0.5">
                    <div className="text-slate-500 font-medium">Evidence Source Document</div>
                    <div className="font-mono text-blue-300 text-[10px] truncate">
                      {selectedDetail.data.source_document_id}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}