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
    <div className="flex-1 flex flex-col bg-ivory min-w-0 h-full relative select-none">

      {/* =========================
          TOP WORKSPACE HEADER
      ========================= */}
      <div className="h-10 px-4 border-b border-border bg-cream flex items-center justify-between shrink-0 z-10">

        <div className="flex items-center gap-2 text-xs text-warm-gray font-medium min-w-0">
          <Network className="w-3.5 h-3.5 text-accent-red shrink-0" />

          {activeInvestigation ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-semantic-green-light text-semantic-green border border-green-200 font-mono shrink-0 uppercase tracking-wider">
              Live Investigation
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-semantic-amber-light text-semantic-amber border border-amber-200 font-mono shrink-0 uppercase tracking-wider">
              Demo Mode
            </span>
          )}

          {activeInvestigation && (
            <span className="text-charcoal font-mono text-xs truncate max-w-[180px]">
              {activeInvestigation.case_number}
            </span>
          )}

          {!loading && !error && nodeCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-warm-white text-warm-gray text-[10px] font-mono border border-border shrink-0">
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
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-warm-gray hover:text-charcoal bg-warm-white hover:bg-parchment rounded border border-border disabled:opacity-40 disabled:hover:bg-warm-white cursor-pointer transition-colors"
            title={activeInvestigation ? "Refresh Live Investigation Graph" : "Select an investigation to enable graph refresh"}
          >
            <RefreshCw className={`w-3 h-3 text-accent-blue ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Graph</span>
          </button>

          <div className="h-4 w-px bg-border mx-1"></div>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-warm-gray hover:text-charcoal rounded hover:bg-parchment disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleZoomOut}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-warm-gray hover:text-charcoal rounded hover:bg-parchment disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleFit}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-warm-gray hover:text-charcoal rounded hover:bg-parchment disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Fit to Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleResetLayout}
            disabled={loading || !!error || nodeCount === 0}
            className="p-1.5 text-warm-gray hover:text-charcoal rounded hover:bg-parchment disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Reset Concentric Layout"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

        </div>

      </div>


      {/* =========================
          MAIN GRAPH AREA
      ========================= */}
      <div className="flex-1 relative flex items-center justify-center bg-[radial-gradient(#D6D3D1_1px,transparent_1px)] [background-size:24px_24px]">

        {/* LOADING STATE */}
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ivory/80 backdrop-blur-sm">
            <div className="w-8 h-8 border-2 border-border-strong border-t-accent-red rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-medium text-charcoal">
              {activeInvestigation
                ? 'Loading investigation intelligence graph...'
                : 'Building criminal network graph...'}
            </p>
            <p className="text-xs text-warm-gray mt-1">
              Analyzing entities and computing network centrality
            </p>
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-ivory/90 text-center">
            <div className="w-12 h-12 rounded-lg bg-semantic-red-light border border-red-200 flex items-center justify-center text-semantic-red mb-3">
              <AlertTriangle className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-charcoal">
              Failed to load network graph
            </h3>
            <p className="text-xs text-warm-gray max-w-sm mt-1 mb-4 font-mono bg-cream px-3 py-1.5 rounded border border-border">
              {error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-red hover:bg-red-800 text-white text-xs font-medium cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            )}
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && !error && nodeCount === 0 && (
          <div className="text-center max-w-md p-6 bg-warm-white border border-border rounded-lg">
            <div className="w-12 h-12 rounded-lg bg-cream border border-border mx-auto flex items-center justify-center text-warm-gray mb-3">
              <Info className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-charcoal">
              No intelligence graph available yet.
            </h3>
            <p className="text-xs text-warm-gray mt-2 leading-relaxed">
              Upload and process evidence, then extract entities and relationships to build the investigation network.
            </p>
            {activeInvestigation && onRefreshGraph && (
              <button
                type="button"
                onClick={onRefreshGraph}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-red hover:bg-red-800 text-white text-xs font-medium cursor-pointer transition-colors"
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
          <div className="absolute bottom-4 left-4 z-20 max-w-sm w-full bg-warm-white border border-border-strong rounded-lg p-3 shadow-lg text-xs text-charcoal space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2 font-semibold text-charcoal">
                {selectedDetail.type === 'node' ? (
                  <>
                    <ShieldAlert className="w-4 h-4 text-accent-red" />
                    <span>Entity Intelligence</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 text-semantic-green" />
                    <span>Relationship Evidence</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-warm-gray hover:text-charcoal p-0.5 rounded hover:bg-cream"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedDetail.type === 'node' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-charcoal">{selectedDetail.data.label}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-blue-light text-accent-blue border border-blue-200 uppercase font-mono">
                    {selectedDetail.data.entity_type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-cream p-2 rounded border border-border">
                  <div>
                    <div className="text-warm-gray font-medium">Confidence</div>
                    <div className="font-mono text-semantic-green font-semibold">
                      {Math.round((selectedDetail.data.confidence || 1.0) * 100)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-warm-gray font-medium">Degree Centrality</div>
                    <div className="font-mono text-charcoal">
                      {selectedDetail.data.degree_centrality ?? 0}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-warm-gray font-medium">Betweenness Centrality</div>
                    <div className="font-mono text-charcoal">
                      {selectedDetail.data.betweenness_centrality ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedDetail.type === 'edge' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-semantic-green-light text-semantic-green border border-green-200 uppercase font-mono">
                    {selectedDetail.data.relationship_type}
                  </span>
                  <span className="font-mono text-semantic-green text-[11px] font-semibold">
                    Confidence: {Math.round((selectedDetail.data.confidence || 1.0) * 100)}%
                  </span>
                </div>

                <div className="flex items-center justify-between bg-cream p-2 rounded border border-border text-[11px] font-medium text-charcoal">
                  <span className="truncate max-w-[120px] font-semibold">{selectedDetail.data.sourceLabel || 'Source Entity'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-warm-gray shrink-0" />
                  <span className="truncate max-w-[120px] font-semibold">{selectedDetail.data.targetLabel || 'Target Entity'}</span>
                </div>

                {selectedDetail.data.source_document_id && (
                  <div className="bg-cream p-2 rounded border border-border text-[10px] space-y-0.5">
                    <div className="text-warm-gray font-medium">Evidence Source Document</div>
                    <div className="font-mono text-accent-blue text-[10px] truncate">
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