/**
 * Adapter to transform FastAPI network graph responses
 * into Cytoscape.js elements and styles.
 */

// ============================================================
// ENTITY COLOR PALETTE
// ============================================================

export const ENTITY_COLORS = {
  Person: '#2563EB',
  Phone: '#059669',
  Location: '#7C3AED',
  Vehicle: '#D97706',
  Event: '#DC2626',
  Entity: '#57534E',
};


// ============================================================
// CONVERT BACKEND GRAPH TO CYTOSCAPE ELEMENTS
// ============================================================

/**
 * Convert backend graph response into Cytoscape elements.
 *
 * @param {Object} graphData
 * @returns {Array<Object>}
 */
export function convertToCytoscapeElements(graphData) {
  if (!graphData || !Array.isArray(graphData.nodes)) {
    return [];
  }

  const nodes = graphData.nodes || [];
  const edges = graphData.edges || [];


  // ----------------------------------------------------------
  // NODES
  // ----------------------------------------------------------

  const cyNodes = nodes.map((node) => {
    const degreeCentrality = Number(node.degree_centrality || 0);
    const betweennessCentrality = Number(
      node.betweenness_centrality || 0
    );

    /**
     * Dynamic node size.
     *
     * Example:
     * Rajesh:
     * degree = 1
     * betweenness = 1
     *
     * 40 + 16 + 12 = 68px
     */
    const nodeSize = Math.round(
      40 +
      degreeCentrality * 16 +
      betweennessCentrality * 12
    );

    const entityType = node.entity_type || 'Person';

    const baseColor =
      ENTITY_COLORS[entityType] ||
      ENTITY_COLORS.Entity;

    /**
     * Major network connector.
     *
     * Rajesh has:
     * degree_centrality = 1
     * betweenness_centrality = 1
     *
     * Therefore he becomes the major connector.
     */
    const isMajorConnector =
      degreeCentrality >= 0.8 ||
      betweennessCentrality >= 0.8;

    return {
      group: 'nodes',

      data: {
        id: node.id,

        label: node.label || node.id,

        entity_type: entityType,

        attributes: node.attributes || {},

        degree_centrality: degreeCentrality,

        betweenness_centrality: betweennessCentrality,

        size: nodeSize,

        color: baseColor,

        isMajorConnector,

        borderWidth: isMajorConnector ? 4 : 2,

        borderColor: isMajorConnector
          ? '#1E40AF'
          : '#A8A29E',
      },
    };
  });


  // ----------------------------------------------------------
  // EDGES
  // ----------------------------------------------------------

  const cyEdges = edges.map((edge, index) => {
    const relationshipType =
      edge.relationship_type ||
      'ASSOCIATED_WITH';

    /**
     * Use backend relationship UUID if available, otherwise construct unique edge ID.
     */
    const edgeId =
      edge.id ||
      `edge:${edge.source}` +
      `--${edge.target}` +
      `:${relationshipType}` +
      `:${edge.source_record_id || edge.source_document_id || index}`;

    const confidence =
      typeof edge.confidence === 'number'
        ? edge.confidence
        : 1;

    return {
      group: 'edges',

      data: {
        id: edgeId,

        source: edge.source,

        target: edge.target,

        relationship_type: relationshipType,

        source_record_id:
          edge.source_record_id || edge.source_document_id || 'UNKNOWN',

        source_document_id: edge.source_document_id || null,

        timestamp:
          edge.timestamp || '',

        confidence,

        label: relationshipType.replace(/_/g, ' '),
      },
    };
  });


  return [
    ...cyNodes,
    ...cyEdges,
  ];
}


// ============================================================
// CYTOSCAPE STYLESHEET — LIGHT INVESTIGATION CANVAS
// ============================================================

export const CYTOSCAPE_STYLESHEET = [

  // ==========================================================
  // DEFAULT NODE
  // ==========================================================

  {
    selector: 'node',

    style: {
      shape: 'ellipse',

      width: 'data(size)',

      height: 'data(size)',

      'background-color': 'data(color)',

      'background-opacity': 0.85,

      'border-width': 'data(borderWidth)',

      'border-color': 'data(borderColor)',

      'border-opacity': 1,

      label: 'data(label)',

      color: '#1C1917',

      'font-family': 'Inter, sans-serif',

      'font-size': '11px',

      'font-weight': 600,

      'text-valign': 'bottom',

      'text-margin-y': 8,

      'text-background-color': '#FAF8F5',

      'text-background-opacity': 0.92,

      'text-background-padding': '3px',

      'text-background-shape': 'roundrectangle',

      /*
       * Cytoscape uses text-outline,
       * not text-border.
       */
      'text-outline-color': '#FAF8F5',

      'text-outline-width': 1,

      'text-max-width': '120px',

      'text-wrap': 'ellipsis',

      'overlay-padding': '6px',

      'transition-property':
        'background-color, border-color, border-width, opacity, width, height',

      'transition-duration': '0.2s',
    },
  },


  // ==========================================================
  // NODE HOVER / SELECTED
  // ==========================================================

  {
    selector: 'node:selected',

    style: {
      'border-color': '#1E40AF',

      'border-width': 4,

      'background-opacity': 1,

      'text-outline-color': '#1E40AF',

      'text-outline-width': 2,

      color: '#FFFFFF',
    },
  },


  // ==========================================================
  // DEFAULT EDGE
  // ==========================================================

  {
    selector: 'edge',

    style: {
      width: 1.5,

      'line-color': '#A8A29E',

      'line-opacity': 0.6,

      'curve-style': 'bezier',

      'target-arrow-shape': 'triangle',

      'target-arrow-color': '#A8A29E',

      'arrow-scale': 0.8,

      label: 'data(label)',

      'font-family': 'Inter, sans-serif',

      'font-size': '9px',

      'font-weight': 500,

      color: '#78716C',

      'text-rotation': 'autorotate',

      'text-margin-y': -6,

      'text-background-color': '#FAF8F5',

      'text-background-opacity': 0.92,

      'text-background-padding': '2px',

      'text-background-shape': 'roundrectangle',

      'text-outline-color': '#FAF8F5',

      'text-outline-width': 1,

      'transition-property':
        'line-color, width, opacity',

      'transition-duration': '0.2s',
    },
  },


  // ==========================================================
  // SELECTED EDGE
  // ==========================================================

  {
    selector: 'edge:selected',

    style: {
      width: 2.5,

      'line-color': '#1E40AF',

      'target-arrow-color': '#1E40AF',

      color: '#1C1917',
    },
  },


  // ==========================================================
  // PHASE D
  // SELECTED RECOMMENDATION TARGET
  //
  // Example:
  // Click Rajesh Kumar recommendation
  // -> Rajesh gets this style
  // ==========================================================

  {
    selector: 'node.nba-highlight',

    style: {
      /*
       * Explicit opacity ensures
       * nba-dimmed does not visually win.
       */
      opacity: 1,

      'background-opacity': 1,

      /*
       * Strong muted-red ring for investigation emphasis.
       */
      'border-color': '#991B1B',

      'border-width': 6,

      /*
       * Fixed size boost for the highlighted node.
       * mapData with a dynamic range risks mismatches against
       * actual node sizes; a fixed value is reliable and visually
       * prominent regardless of the original node size.
       */
      width: 72,

      height: 72,

      /*
       * Bring selected target above
       * other graph elements.
       */
      'z-index': 999,

      /*
       * Strong label emphasis.
       */
      color: '#1C1917',

      'font-size': '13px',

      'font-weight': 700,

      'text-outline-color': '#FFFFFF',

      'text-outline-width': 2,

      'text-background-opacity': 1,

      'text-background-color': '#FFFFFF',
    },
  },


  // ==========================================================
  // PHASE D
  // NEIGHBOUR NODES
  //
  // Directly connected nodes only.
  // ==========================================================

  {
    selector: 'node.nba-neighbour',

    style: {
      opacity: 1,

      'background-opacity': 1,

      'border-color': '#B91C1C',

      'border-width': 3,

      'z-index': 100,

      'text-outline-color': '#FFFFFF',

      'text-outline-width': 1,
    },
  },


  // ==========================================================
  // PHASE D
  // DIRECTLY CONNECTED EDGES
  // ==========================================================

  {
    selector: 'edge.nba-highlight-edge',

    style: {
      opacity: 1,

      width: 3,

      'line-color': '#991B1B',

      'line-opacity': 0.9,

      'target-arrow-color': '#991B1B',

      'arrow-scale': 1.0,

      color: '#7F1D1D',

      'text-outline-color': '#FFFFFF',

      'text-outline-width': 1,

      'z-index': 200,
    },
  },


  // ==========================================================
  // PHASE D
  // DIM UNRELATED ELEMENTS
  // ==========================================================

  {
    selector: '.nba-dimmed',

    style: {
      opacity: 0.12,
    },
  },
];


// ============================================================
// GRAPH LAYOUT
// ============================================================

/**
 * Cytoscape concentric layout.
 *
 * Higher centrality entities are positioned
 * closer to the center.
 */
export function getCytoscapeLayoutConfig() {
  return {
    name: 'concentric',

    concentric: (node) => {
      const degree =
        Number(node.data('degree_centrality')) || 0;

      const betweenness =
        Number(node.data('betweenness_centrality')) || 0;

      /*
       * Rajesh:
       * degree = 1
       * betweenness = 1
       *
       * Highest score -> center.
       */
      return (
        degree * 2 +
        betweenness * 3
      );
    },

    levelWidth: () => 1,

    padding: 60,

    animate: true,

    animationDuration: 500,

    spacingFactor: 1.4,

    avoidOverlap: true,

    nodeDimensionsIncludeLabels: true,

    fit: true,
  };
}