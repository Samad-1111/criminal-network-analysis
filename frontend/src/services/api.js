/**
 * API Service layer for communicating with the FastAPI Criminal Network Analysis backend.
 */

export const API_BASE_URL = 'http://127.0.0.1:8000';

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

    const data = await response.json();
    return data;
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

    const data = await response.json();
    return data;
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
