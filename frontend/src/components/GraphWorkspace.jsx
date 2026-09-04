import React, { useEffect, useRef, useCallback } from 'react';
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
  onNodeClick,
  selectedEntityId = null,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Keep the latest callback without forcing Cytoscape recreation
  const onNodeClickRef = useRef(onNodeClick);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);


  /*
   * Apply recommendation highlight.
   *
   * This function is shared by:
   * 1. The selectedEntityId effect
   * 2. The Cytoscape initialization effect
   *
   * This ensures highlighting works even if the recommendation
   * was selected before Cytoscape finished loading.
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
      console.warn(
        `Selected entity "${entityId}" was not found in the Cytoscape graph.`
      );
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

    /*
     * Frame target and neighbours.
     *
     * If there are no neighbours, Cytoscape simply frames
     * the selected target.
     */
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

        // Better interaction behaviour
        autoungrabify: false,
        userZoomingEnabled: true,
        userPanningEnabled: true,
      });


      /*
       * Node click event.
       */
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;

        if (onNodeClickRef.current) {
          onNodeClickRef.current(node.data());
        }
      });


      // Save Cytoscape instance
      cyRef.current = cy;


      /*
       * IMPORTANT FIX:
       *
       * Apply the currently selected recommendation immediately
       * after Cytoscape is created.
       *
       * Without this, if selectedEntityId already exists before
       * Cytoscape initialization, the graph might not highlight.
       */
      applyRecommendationHighlight(cy, selectedEntityId);


      /*
       * Resize after the graph has been mounted.
       */
      requestAnimationFrame(() => {
        if (cy && !cy.destroyed()) {
          cy.resize();

          // Only fit normally if there is no selected recommendation
          if (!selectedEntityId) {
            cy.fit(undefined, 50);
          }
        }
      });


    } catch (err) {
      console.error(
        'Failed to initialize Cytoscape graph:',
        err
      );
    }


    /*
     * Cleanup.
     */
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
    // NOTE: selectedEntityId intentionally omitted.
    // The separate highlight useEffect handles selection changes.
    // Including it here would destroy+recreate Cytoscape on every card click.
    applyRecommendationHighlight,
  ]);


  /*
   * React whenever a recommendation card is selected.
   */
  useEffect(() => {
    const cy = cyRef.current;

    if (!cy || cy.destroyed()) {
      return;
    }

    applyRecommendationHighlight(cy, selectedEntityId);

  }, [
    selectedEntityId,
    applyRecommendationHighlight,
  ]);


  /*
   * Toolbar actions.
   */

  const handleZoomIn = () => {
    const cy = cyRef.current;

    if (!cy || cy.destroyed()) return;

    cy.zoom({
      level: cy.zoom() * 1.25,
      renderedPosition: {
        x: cy.width() / 2,
        y: cy.height() / 2,
      },
    });
  };


  const handleZoomOut = () => {
    const cy = cyRef.current;

    if (!cy || cy.destroyed()) return;

    cy.zoom({
      level: cy.zoom() * 0.8,
      renderedPosition: {
        x: cy.width() / 2,
        y: cy.height() / 2,
      },
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

    // Reset recommendation highlighting
    cy.elements().removeClass(
      'nba-highlight nba-neighbour nba-highlight-edge nba-dimmed'
    );

    // Run original layout
    const layout = cy.layout(
      getCytoscapeLayoutConfig()
    );

    layout.run();

    // Ensure everything fits after layout
    setTimeout(() => {
      if (cy && !cy.destroyed()) {
        cy.fit(undefined, 50);
      }
    }, 100);
  };


  const nodeCount = graphData?.nodes?.length || 0;
  const edgeCount = graphData?.edges?.length || 0;


  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0 h-full relative select-none">

      {/* =========================
          TOP WORKSPACE HEADER
      ========================= */}

      <div className="h-10 px-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0 z-10">

        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">

          <Network className="w-3.5 h-3.5 text-blue-400" />

          <span>
            Entity Network Workspace
          </span>

          {nodeCount > 0 && !loading && !error && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
              {nodeCount} entities · {edgeCount} links
            </span>
          )}

        </div>


        {/* =========================
            TOOLBAR
        ========================= */}

        <div className="flex items-center gap-1">

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={
              loading ||
              !!error ||
              nodeCount === 0
            }
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>


          <button
            type="button"
            onClick={handleZoomOut}
            disabled={
              loading ||
              !!error ||
              nodeCount === 0
            }
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>


          <button
            type="button"
            onClick={handleFit}
            disabled={
              loading ||
              !!error ||
              nodeCount === 0
            }
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Fit to Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>


          <button
            type="button"
            onClick={handleResetLayout}
            disabled={
              loading ||
              !!error ||
              nodeCount === 0
            }
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


        {/* =========================
            LOADING STATE
        ========================= */}

        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">

            <Loader2 className="w-7 h-7 text-blue-500 animate-spin mb-3" />

            <p className="text-sm font-medium text-slate-200">
              Building criminal network graph...
            </p>

            <p className="text-xs text-slate-500 mt-1">
              Analyzing entities and computing network centrality
            </p>

          </div>
        )}


        {/* =========================
            ERROR STATE
        ========================= */}

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

                <span>
                  Retry Connection
                </span>

              </button>
            )}

          </div>
        )}


        {/* =========================
            EMPTY STATE
        ========================= */}

        {!loading &&
          !error &&
          nodeCount === 0 && (
            <div className="text-center max-w-sm p-6">

              <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-500 mb-3 shadow-sm">
                <Info className="w-6 h-6 stroke-[1.5]" />
              </div>

              <h3 className="text-sm font-semibold text-slate-200">
                No network data available
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Submit crime records to construct and inspect the
                multi-entity relationship graph.
              </p>

            </div>
          )}


        {/* =========================
            CYTOSCAPE CONTAINER
        ========================= */}

        <div
          ref={containerRef}
          className={`w-full h-full ${loading ||
              error ||
              nodeCount === 0
              ? 'invisible'
              : 'visible'
            }`}
        />

      </div>

    </div>
  );
}