/**
 * Adapter to transform FastAPI network graph responses into Cytoscape.js elements and styles.
 */

// Color palette by entity type
export const ENTITY_COLORS = {
  Person: '#3b82f6',    // Blue
  Phone: '#10b981',     // Emerald
  Location: '#8b5cf6',  // Purple
  Vehicle: '#f59e0b',   // Amber
  Event: '#ef4444',     // Red
  Entity: '#64748b',    // Slate
};

/**
 * Convert backend graph response into Cytoscape elements.
 * 
 * @param {Object} graphData - Backend JSON containing nodes, edges, metrics
 * @returns {Array<Object>} Cytoscape elements array
 */
export function convertToCytoscapeElements(graphData) {
  if (!graphData || !Array.isArray(graphData.nodes)) {
    return [];
  }

  const nodes = graphData.nodes || [];
  const edges = graphData.edges || [];

  // Cytoscape Nodes
  const cyNodes = nodes.map((node) => {
    const degCentrality = Number(node.degree_centrality || 0);
    const betCentrality = Number(node.betweenness_centrality || 0);
    
    // Compute visual size based on network metrics (base 40px, up to 68px for central hubs)
    const nodeSize = Math.round(40 + degCentrality * 16 + betCentrality * 12);
    const entityType = node.entity_type || 'Person';
    const baseColor = ENTITY_COLORS[entityType] || ENTITY_COLORS.Person;
    
    // Highlight central connector with prominent ring
    const isMajorConnector = degCentrality >= 0.8 || betCentrality >= 0.8;

    return {
      group: 'nodes',
      data: {
        id: node.id,
        label: node.label || node.id,
        entity_type: entityType,
        attributes: node.attributes || {},
        degree_centrality: degCentrality,
        betweenness_centrality: betCentrality,
        size: nodeSize,
        color: baseColor,
        isMajorConnector,
        borderWidth: isMajorConnector ? 4 : 2,
        borderColor: isMajorConnector ? '#60a5fa' : '#334155',
      },
    };
  });

  // Cytoscape Edges
  const cyEdges = edges.map((edge, idx) => {
    const relType = edge.relationship_type || 'ASSOCIATED_WITH';
    const edgeId = `edge:${edge.source}--${edge.target}:${relType}:${edge.source_record_id || idx}`;
    const confidence = typeof edge.confidence === 'number' ? edge.confidence : 1.0;

    return {
      group: 'edges',
      data: {
        id: edgeId,
        source: edge.source,
        target: edge.target,
        relationship_type: relType,
        source_record_id: edge.source_record_id || 'UNKNOWN',
        timestamp: edge.timestamp || '',
        confidence: confidence,
        label: relType.replace(/_/g, ' '),
      },
    };
  });

  return [...cyNodes, ...cyEdges];
}

/**
 * Standard Cytoscape stylesheet for dark intelligence theme.
 */
export const CYTOSCAPE_STYLESHEET = [
  // Core Node Style
  {
    selector: 'node',
    style: {
      'shape': 'ellipse',
      'width': 'data(size)',
      'height': 'data(size)',
      'background-color': 'data(color)',
      'background-opacity': 0.85,
      'border-width': 'data(borderWidth)',
      'border-color': 'data(borderColor)',
      'border-opacity': 1,
      'label': 'data(label)',
      'color': '#f8fafc',
      'font-family': 'Inter, sans-serif',
      'font-size': '11px',
      'font-weight': 600,
      'text-valign': 'bottom',
      'text-margin-y': 7,
      'text-background-color': '#090d16',
      'text-background-opacity': 0.85,
      'text-background-padding': '3px',
      'text-background-shape': 'roundrectangle',
      'text-border-color': '#1e293b',
      'text-border-width': 1,
      'text-border-opacity': 0.6,
      'text-max-width': '120px',
      'text-wrap': 'ellipsis',
      'overlay-padding': '4px',
      'transition-property': 'background-color, border-color, border-width, width, height',
      'transition-duration': '0.2s',
    },
  },
  // Selected / Hovered Node
  {
    selector: 'node:selected',
    style: {
      'border-color': '#38bdf8',
      'border-width': 4,
      'background-opacity': 1,
      'text-border-color': '#38bdf8',
      'text-border-width': 1.5,
    },
  },
  // Core Edge Style
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#475569',
      'line-opacity': 0.8,
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#64748b',
      'arrow-scale': 0.9,
      'label': 'data(label)',
      'font-family': 'Inter, sans-serif',
      'font-size': '9px',
      'font-weight': 500,
      'color': '#94a3b8',
      'text-rotation': 'autorotate',
      'text-margin-y': -6,
      'text-background-color': '#020617',
      'text-background-opacity': 0.9,
      'text-background-padding': '2px',
      'text-background-shape': 'roundrectangle',
      'edge-text-rotation': 'autorotate',
      'transition-property': 'line-color, width, target-arrow-color',
      'transition-duration': '0.2s',
    },
  },
  // Selected Edge
  {
    selector: 'edge:selected',
    style: {
      'width': 3,
      'line-color': '#38bdf8',
      'target-arrow-color': '#38bdf8',
      'color': '#f8fafc',
    },
  },
];

/**
 * Get layout configuration for Cytoscape.
 * Utilizes concentric layout positioned by centrality or cose layout with spacing.
 */
export function getCytoscapeLayoutConfig() {
  return {
    name: 'concentric',
    concentric: function (node) {
      const deg = node.data('degree_centrality') || 0;
      const bet = node.data('betweenness_centrality') || 0;
      // High centrality placed in innermost center concentric level
      return Math.round((deg + bet) * 10) + 1;
    },
    levelWidth: function () {
      return 2;
    },
    padding: 60,
    animate: true,
    animationDuration: 500,
    spacingFactor: 1.4,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
  };
}
