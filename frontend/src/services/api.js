/**
 * API Service layer for communicating with the FastAPI Criminal Network Analysis backend.
 */

export const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Helper to handle fetch responses and extract error details cleanly.
 */
async function handleResponse(response) {
  if (!response.ok) {
    let errorMsg = `Server error (${response.status})`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.detail || errorMsg;
    } catch {
      const errText = await response.text();
      if (errText) errorMsg = errText;
    }
    throw new Error(errorMsg);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return true;
  }

  return await response.json();
}

/**
 * Build graph network from crime / intelligence records.
 * 
 * @param {Array<Object>} records - List of intelligence records with entities and relationships
 * @returns {Promise<Object>} Network graph response containing nodes, edges, and metrics
 */
export async function buildGraph(records) {
  const url = `${API_BASE_URL}/pipeline/build-graph`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: records || [] }),
    });

    return await handleResponse(response);
  } catch (err) {
    if (url.startsWith('http')) {
      try {
        const proxyRes = await fetch('/pipeline/build-graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: records || [] }),
        });
        if (proxyRes.ok) {
          return await proxyRes.json();
        }
      } catch {
        // Ignore fallback error and throw original
      }
    }
    throw err;
  }
}

/**
 * Fetch ranked Next-Best-Action recommendations.
 * 
 * @param {Object} payload - Object containing records, identity_results, max_recommendations
 * @returns {Promise<Object>} Recommendation payload containing summary and ranked recommendations
 */
export async function fetchNextBestActions(payload) {
  const url = `${API_BASE_URL}/pipeline/next-best-actions`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload || {}),
    });

    return await handleResponse(response);
  } catch (err) {
    if (url.startsWith('http')) {
      try {
        const proxyRes = await fetch('/pipeline/next-best-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {}),
        });
        if (proxyRes.ok) {
          return await proxyRes.json();
        }
      } catch {
        // Ignore fallback error and throw original
      }
    }
    throw err;
  }
}

/**
 * Health check to verify FastAPI backend availability.
 * @returns {Promise<boolean>}
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/`, { method: 'GET' });
    return res.ok;
  } catch {
    try {
      const proxyRes = await fetch('/', { method: 'GET' });
      return proxyRes.ok;
    } catch {
      return false;
    }
  }
}

// --- Investigation CRUD API Service Methods ---

/**
 * Create a new criminal investigation.
 * @param {Object} payload - { case_number, title, description, status }
 */
export async function createInvestigation(payload) {
  const response = await fetch(`${API_BASE_URL}/investigations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await handleResponse(response);
}

/**
 * Fetch list of stored criminal investigations.
 */
export async function getInvestigations() {
  const response = await fetch(`${API_BASE_URL}/investigations`, {
    method: 'GET',
  });
  return await handleResponse(response);
}

/**
 * Fetch a single investigation by UUID.
 * @param {string} id - Investigation UUID
 */
export async function getInvestigation(id) {
  const response = await fetch(`${API_BASE_URL}/investigations/${id}`, {
    method: 'GET',
  });
  return await handleResponse(response);
}

/**
 * Delete an investigation by UUID.
 * @param {string} id - Investigation UUID
 */
export async function deleteInvestigation(id) {
  const response = await fetch(`${API_BASE_URL}/investigations/${id}`, {
    method: 'DELETE',
  });
  return await handleResponse(response);
}

// --- Document Upload & Management API Service Methods ---

/**
 * Upload a document file to an investigation.
 * @param {string} investigationId - Investigation UUID
 * @param {File} file - File object from input
 * @param {string} [documentType] - Optional category/document_type (FIR, CDR, FINANCIAL, etc.)
 */
export async function uploadDocument(investigationId, file, documentType) {
  const formData = new FormData();
  formData.append('file', file);
  if (documentType) {
    formData.append('document_type', documentType);
  }

  const response = await fetch(`${API_BASE_URL}/investigations/${investigationId}/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  return await handleResponse(response);
}

/**
 * Fetch uploaded documents for an investigation.
 * @param {string} investigationId - Investigation UUID
 */
export async function getDocuments(investigationId) {
  const response = await fetch(`${API_BASE_URL}/investigations/${investigationId}/documents`, {
    method: 'GET',
  });
  return await handleResponse(response);
}

/**
 * Download a document file by triggering a browser download stream.
 * @param {string} investigationId - Investigation UUID
 * @param {string} documentId - Document UUID
 * @param {string} originalFilename - Preferred download filename
 */
export async function downloadDocument(investigationId, documentId, originalFilename) {
  const url = `${API_BASE_URL}/investigations/${investigationId}/documents/${documentId}/download`;
  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    let errorMsg = `Failed to download file (${response.status})`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.detail || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = originalFilename || 'downloaded_document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

// --- Intelligence Pipeline Orchestration API Service Methods ---

/**
 * Process a document: extract text content from PDF/DOCX/TXT/CSV file.
 * @param {string} investigationId - Investigation UUID
 * @param {string} documentId - Document UUID
 */
export async function processDocument(investigationId, documentId) {
  const url = `${API_BASE_URL}/investigations/${investigationId}/documents/${documentId}/process`;
  const response = await fetch(url, { method: 'POST' });
  return await handleResponse(response);
}

/**
 * Extract entities from a processed document and save to PostgreSQL idempotently.
 * @param {string} investigationId - Investigation UUID
 * @param {string} documentId - Document UUID
 */
export async function extractDocumentEntities(investigationId, documentId) {
  const url = `${API_BASE_URL}/investigations/${investigationId}/documents/${documentId}/extract-entities`;
  const response = await fetch(url, { method: 'POST' });
  return await handleResponse(response);
}

/**
 * Discover and extract evidence-based relationships from document entities and save to PostgreSQL.
 * @param {string} investigationId - Investigation UUID
 * @param {string} documentId - Document UUID
 */
export async function extractDocumentRelationships(investigationId, documentId) {
  const url = `${API_BASE_URL}/investigations/${investigationId}/documents/${documentId}/extract-relationships`;
  const response = await fetch(url, { method: 'POST' });
  return await handleResponse(response);
}

/**
 * Fetch real investigation graph (nodes, edges, metrics) from database.
 * @param {string} investigationId - Investigation UUID
 * @returns {Promise<Object>} Investigation graph response containing nodes, edges, metrics
 */
export async function getInvestigationGraph(investigationId) {
  const response = await fetch(`${API_BASE_URL}/investigations/${investigationId}/graph`, {
    method: 'GET',
  });
  return await handleResponse(response);
}

/**
 * Fetch real Next-Best-Action recommendations for a live investigation from the database.
 * Recommendations are generated from actual entities, relationships, and network metrics.
 * @param {string} investigationId - Investigation UUID
 * @param {number} [maxRecommendations=10] - Maximum number of recommendations to return
 * @returns {Promise<Object>} NBA response containing investigation_id, network_summary,
 *   recommendation_summary, and recommendations array
 */
export async function getInvestigationNextBestActions(investigationId, maxRecommendations = 10) {
  const url = `${API_BASE_URL}/investigations/${investigationId}/next-best-actions?max_recommendations=${maxRecommendations}`;
  const response = await fetch(url, { method: 'GET' });
  return await handleResponse(response);
}
