import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import GraphWorkspace from './components/GraphWorkspace';
import RecommendationPanel from './components/RecommendationPanel';
import { buildGraph, fetchNextBestActions } from './services/api';
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

  // Phase D: selected entity for graph highlight
  const [selectedEntityId, setSelectedEntityId] = useState(null);

  // Header status
  const [backendStatus, setBackendStatus] = useState('loading');

  // Load Graph Data
  const loadGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);

    try {
      const data = await buildGraph(RAJESH_KUMAR_DATASET.records);
      setGraphData(data);
      setBackendStatus('connected');
    } catch (err) {
      console.error('Error fetching criminal network graph:', err);
      setGraphError(err.message || 'Failed to connect to FastAPI backend');
      setBackendStatus('error');
    } finally {
      setGraphLoading(false);
    }
  }, []);

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

  // Phase D: When a recommendation card is clicked, highlight its first target entity in the graph
  const handleRecommendationClick = useCallback((rec) => {
    const targetId = rec?.target_entities?.[0]?.id ?? null;
    setSelectedEntityId((prev) => (prev === targetId ? null : targetId));
  }, []);

  // Initial load
  useEffect(() => {
    loadGraph();
    loadRecommendations();
  }, [loadGraph, loadRecommendations]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Header backendStatus={backendStatus} />
      <main className="flex-1 flex overflow-hidden">
        <GraphWorkspace
          graphData={graphData}
          loading={graphLoading}
          error={graphError}
          onRetry={loadGraph}
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
      </main>
    </div>
  );
}
