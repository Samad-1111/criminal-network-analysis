import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import InvestigationSelector from './components/InvestigationSelector';
import GraphWorkspace from './components/GraphWorkspace';
import RecommendationPanel from './components/RecommendationPanel';
import DocumentUploadPanel from './components/DocumentUploadPanel';
import {
  buildGraph,
  getInvestigationGraph,
  fetchNextBestActions,
  getInvestigations,
  createInvestigation,
  deleteInvestigation,
} from './services/api';
import { RAJESH_KUMAR_DATASET } from './data/testDataset';

export default function App() {
  // Graph state
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState(null);

  // Recommendations state
  const [recommendationsData, setRecommendationsData] = useState(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [recommendationsError, setRecommendationsError] = useState(null);

  // Selected entity for graph highlight
  const [selectedEntityId, setSelectedEntityId] = useState(null);

  // Header status
  const [backendStatus, setBackendStatus] = useState('loading');

  // Investigation management state
  const [investigations, setInvestigations] = useState([]);
  const [activeInvestigation, setActiveInvestigation] = useState(null);
  const [investigationsLoading, setInvestigationsLoading] = useState(false);

  // Load Graph Data (Demo Mode vs Live Investigation Mode)
  const loadGraph = useCallback(async (invId = null) => {
    setGraphLoading(true);
    setGraphError(null);

    const targetInvId = invId !== null ? invId : activeInvestigation?.id;

    try {
      if (targetInvId) {
        // Real Live Investigation Mode
        const data = await getInvestigationGraph(targetInvId);
        setGraphData(data);
      } else {
        // Synthetic Demo Mode
        const data = await buildGraph(RAJESH_KUMAR_DATASET.records);
        setGraphData(data);
      }
      setBackendStatus('connected');
    } catch (err) {
      console.error('Error fetching criminal network graph:', err);
      setGraphError(err.message || 'Failed to connect to FastAPI backend');
      setBackendStatus('error');
    } finally {
      setGraphLoading(false);
    }
  }, [activeInvestigation?.id]);

  // Load Recommendations Data
  const loadRecommendations = useCallback(async () => {
    setRecommendationsLoading(true);
    setRecommendationsError(null);

    try {
      const payload = {
        records: RAJESH_KUMAR_DATASET.records,
        identity_results: RAJESH_KUMAR_DATASET.identity_results || [],
        max_recommendations: 10,
      };
      const data = await fetchNextBestActions(payload);
      setRecommendationsData(data);
      setBackendStatus('connected');
    } catch (err) {
      console.error('Error fetching next-best-actions:', err);
      setRecommendationsError(err.message || 'Failed to load recommendations');
    } finally {
      setRecommendationsLoading(false);
    }
  }, []);

  // Load Investigations list from database
  const loadInvestigationsList = useCallback(async () => {
    setInvestigationsLoading(true);
    try {
      const data = await getInvestigations();
      setInvestigations(data || []);
    } catch (err) {
      console.error('Error fetching investigations:', err);
    } finally {
      setInvestigationsLoading(false);
    }
  }, []);

  // Create new investigation handler
  const handleCreateInvestigation = async (payload) => {
    const newInv = await createInvestigation(payload);
    await loadInvestigationsList();
    setActiveInvestigation(newInv);
    return newInv;
  };

  // Delete investigation handler
  const handleDeleteInvestigation = async (id) => {
    await deleteInvestigation(id);
    if (activeInvestigation?.id === id) {
      setActiveInvestigation(null);
    }
    await loadInvestigationsList();
  };

  // When a recommendation card is clicked, highlight its target entity
  const handleRecommendationClick = useCallback((rec) => {
    const targetId = rec?.target_entities?.[0]?.id ?? null;
    setSelectedEntityId((prev) => (prev === targetId ? null : targetId));
  }, []);

  // Fetch graph whenever activeInvestigation changes
  useEffect(() => {
    loadGraph();
  }, [activeInvestigation, loadGraph]);

  // Initial load for recommendations & investigations list
  useEffect(() => {
    loadRecommendations();
    loadInvestigationsList();
  }, [loadRecommendations, loadInvestigationsList]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Header backendStatus={backendStatus} />

      {/* Investigation Selector Sub-header */}
      <InvestigationSelector
        investigations={investigations}
        activeInvestigation={activeInvestigation}
        onSelectInvestigation={setActiveInvestigation}
        onCreateInvestigation={handleCreateInvestigation}
        onDeleteInvestigation={handleDeleteInvestigation}
        onRefresh={loadInvestigationsList}
        loading={investigationsLoading}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="flex-1 flex overflow-hidden">
          <GraphWorkspace
            graphData={graphData}
            loading={graphLoading}
            error={graphError}
            onRetry={loadGraph}
            onRefreshGraph={loadGraph}
            activeInvestigation={activeInvestigation}
            selectedEntityId={selectedEntityId}
          />
          <RecommendationPanel
            recommendationsData={recommendationsData}
            loading={recommendationsLoading}
            error={recommendationsError}
            onRetry={loadRecommendations}
            selectedEntityId={selectedEntityId}
            onRecommendationClick={handleRecommendationClick}
          />
        </div>

        {/* Evidence & Intelligence Upload Bottom Panel */}
        <DocumentUploadPanel
          activeInvestigation={activeInvestigation}
          onGraphRefresh={loadGraph}
        />
      </main>
    </div>
  );
}

