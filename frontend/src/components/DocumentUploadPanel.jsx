import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  PhoneCall,
  DollarSign,
  ClipboardList,
  Video,
  Folder,
  Upload,
  Download,
  File,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Cpu,
  GitFork,
  Network,
  Lightbulb,
  Check,
  RotateCcw,
  AlertCircle,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  uploadDocument,
  getDocuments,
  downloadDocument,
  processDocument,
  extractDocumentEntities,
  extractDocumentRelationships,
  getInvestigationGraph,
  getInvestigationNextBestActions,
} from '../services/api';

const CATEGORIES = [
  { id: 'FIR', label: 'FIR', description: 'First Information Report', icon: FileText, color: 'text-semantic-amber border-amber-200 bg-semantic-amber-light' },
  { id: 'CDR', label: 'CDR', description: 'Call Detail Records', icon: PhoneCall, color: 'text-accent-blue border-blue-200 bg-accent-blue-light' },
  { id: 'FINANCIAL', label: 'Financial Records', description: 'Bank & Transaction Logs', icon: DollarSign, color: 'text-semantic-green border-green-200 bg-semantic-green-light' },
  { id: 'POLICE_REPORT', label: 'Police Reports', description: 'Surveillance & Interrogation', icon: ClipboardList, color: 'text-purple-700 border-purple-200 bg-purple-50' },
  { id: 'SURVEILLANCE', label: 'Surveillance Reports', description: 'Visual & Audio Notes', icon: Video, color: 'text-semantic-red border-red-200 bg-semantic-red-light', warning: 'Video formats (.mp4, .avi) unsupported in current version' },
  { id: 'OTHER', label: 'Other Intel', description: 'Miscellaneous Evidence', icon: Folder, color: 'text-warm-gray border-border bg-cream' },
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.csv'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export default function DocumentUploadPanel({
  activeInvestigation,
  onGraphRefresh,
  onRecommendationsRefresh,
}) {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('FIR');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [alertMessage, setAlertMessage] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Per-document pipeline execution state
  // docPipelineStates[docId] = {
  //   running: boolean,
  //   activeStep: 'process' | 'entities' | 'relationships' | 'graph' | 'nba' | null,
  //   stepStatus: { process, entities, relationships, graph, nba },
  //   stepCounts: { entitiesSaved, entitiesTotal, relationshipsSaved, relationshipsTotal, nodes, edges, components, recommendations },
  //   error: { step: string, message: string } | null,
  //   summary: Object | null
  // }
  const [docPipelineStates, setDocPipelineStates] = useState({});
  // Expanded pipeline drawer per document
  const [expandedDocIds, setExpandedDocIds] = useState(new Set());

  const fileInputRef = useRef(null);

  // Helper to update a document's pipeline state
  const updateDocPipelineState = useCallback((docId, updater) => {
    setDocPipelineStates((prev) => {
      const current = prev[docId] || {
        running: false,
        activeStep: null,
        stepStatus: {
          process: 'pending',
          entities: 'pending',
          relationships: 'pending',
          graph: 'pending',
          nba: 'pending',
        },
        stepCounts: {},
        error: null,
        summary: null,
      };
      const updated = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      return { ...prev, [docId]: updated };
    });
  }, []);

  // Fetch documents for the active investigation
  const loadDocuments = useCallback(async () => {
    if (!activeInvestigation?.id) {
      setDocuments([]);
      return;
    }

    setLoadingDocs(true);
    try {
      const data = await getDocuments(activeInvestigation.id);
      setDocuments(data || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, [activeInvestigation?.id]);

  useEffect(() => {
    loadDocuments();
    setSelectedFile(null);
    setAlertMessage(null);
    setDocPipelineStates({});
    setExpandedDocIds(new Set());
  }, [loadDocuments]);

  // Toggle expanded state for document intelligence drawer
  const toggleDocExpand = (docId) => {
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // File validation routine
  const validateFile = (file) => {
    if (!file) return false;

    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (['.mp4', '.avi', '.mkv', '.mov', '.mp3', '.wav'].includes(ext)) {
      setAlertMessage({
        type: 'warning',
        text: `File type '${ext}' (video/audio) is unsupported in current version. Video processing is planned for a future update. Allowed file types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      });
      return false;
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setAlertMessage({
        type: 'error',
        text: `Unsupported file extension '${ext}'. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
      });
      return false;
    }

    if (file.size === 0) {
      setAlertMessage({
        type: 'error',
        text: 'The selected file is empty (0 bytes).',
      });
      return false;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setAlertMessage({
        type: 'error',
        text: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB maximum limit.`,
      });
      return false;
    }

    setAlertMessage(null);
    return true;
  };

  const handleFileSelect = (file) => {
    if (validateFile(file)) {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Perform actual multipart upload to backend
  const handleUploadSubmit = async () => {
    if (!activeInvestigation?.id) {
      setAlertMessage({
        type: 'warning',
        text: 'Please select or create an investigation above before uploading document evidence.',
      });
      return;
    }

    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(40);

    try {
      await uploadDocument(activeInvestigation.id, selectedFile, selectedCategory);
      setUploadProgress(100);

      setAlertMessage({
        type: 'success',
        text: `Document "${selectedFile.name}" successfully uploaded to case ${activeInvestigation.case_number} as [${selectedCategory}].`,
      });

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
    } catch (err) {
      setAlertMessage({
        type: 'error',
        text: err.message || 'Failed to upload document to server.',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = async (doc) => {
    if (!activeInvestigation?.id) return;
    try {
      await downloadDocument(activeInvestigation.id, doc.id, doc.original_filename);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  // --- Step-by-step and Full Pipeline Orchestration ---

  /**
   * Run full intelligence pipeline sequentially for a document:
   * 1. Process Document
   * 2. Extract Entities
   * 3. Extract Relationships
   * 4. Refresh Investigation Graph
   * 5. Refresh Next-Best Actions
   */
  const runFullPipeline = async (doc) => {
    if (!activeInvestigation?.id || !doc?.id) return;

    const docId = doc.id;
    const invId = activeInvestigation.id;

    // Ensure pipeline panel is expanded to view progress
    setExpandedDocIds((prev) => new Set(prev).add(docId));

    // Initialize pipeline state
    updateDocPipelineState(docId, {
      running: true,
      activeStep: 'process',
      error: null,
      stepStatus: {
        process: doc.processing_status === 'COMPLETED' ? 'completed' : 'running',
        entities: 'pending',
        relationships: 'pending',
        graph: 'pending',
        nba: 'pending',
      },
      summary: null,
    });

    let entityRes = null;
    let relRes = null;
    let graphRes = null;
    let nbaRes = null;

    try {
      // --- STAGE 1: Process Document ---
      if (doc.processing_status !== 'COMPLETED') {
        updateDocPipelineState(docId, (prev) => ({
          ...prev,
          activeStep: 'process',
          stepStatus: { ...prev.stepStatus, process: 'running' },
        }));
        await processDocument(invId, docId);
      }
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        stepStatus: { ...prev.stepStatus, process: 'completed' },
      }));

      // --- STAGE 2: Extract Entities ---
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        activeStep: 'entities',
        stepStatus: { ...prev.stepStatus, entities: 'running' },
      }));
      entityRes = await extractDocumentEntities(invId, docId);
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        stepStatus: { ...prev.stepStatus, entities: 'completed' },
        stepCounts: {
          ...prev.stepCounts,
          entitiesSaved: entityRes.entities_saved,
          entitiesTotal: entityRes.entities_total,
        },
      }));

      // --- STAGE 3: Extract Relationships ---
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        activeStep: 'relationships',
        stepStatus: { ...prev.stepStatus, relationships: 'running' },
      }));
      relRes = await extractDocumentRelationships(invId, docId);
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        stepStatus: { ...prev.stepStatus, relationships: 'completed' },
        stepCounts: {
          ...prev.stepCounts,
          relationshipsSaved: relRes.relationships_saved,
          relationshipsTotal: relRes.relationships_total,
        },
      }));

      // --- STAGE 4: Refresh Investigation Graph ---
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        activeStep: 'graph',
        stepStatus: { ...prev.stepStatus, graph: 'running' },
      }));
      graphRes = await getInvestigationGraph(invId);
      if (onGraphRefresh) {
        await onGraphRefresh(invId);
      }
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        stepStatus: { ...prev.stepStatus, graph: 'completed' },
        stepCounts: {
          ...prev.stepCounts,
          nodes: graphRes.metrics?.total_nodes ?? (graphRes.nodes?.length || 0),
          edges: graphRes.metrics?.total_edges ?? (graphRes.edges?.length || 0),
          components: graphRes.metrics?.total_components ?? 0,
        },
      }));

      // --- STAGE 5: Refresh Next-Best Actions ---
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        activeStep: 'nba',
        stepStatus: { ...prev.stepStatus, nba: 'running' },
      }));
      nbaRes = await getInvestigationNextBestActions(invId);
      if (onRecommendationsRefresh) {
        await onRecommendationsRefresh(invId);
      }
      updateDocPipelineState(docId, (prev) => ({
        ...prev,
        stepStatus: { ...prev.stepStatus, nba: 'completed' },
        stepCounts: {
          ...prev.stepCounts,
          recommendationsTotal:
            nbaRes.recommendation_summary?.total_recommendations ?? (nbaRes.recommendations?.length || 0),
        },
      }));

      // --- Pipeline Complete: Save Summary ---
      const summaryData = {
        entitiesSaved: entityRes.entities_saved,
        entitiesTotal: entityRes.entities_total,
        relationshipsSaved: relRes.relationships_saved,
        relationshipsTotal: relRes.relationships_total,
        graphNodes: graphRes.metrics?.total_nodes ?? (graphRes.nodes?.length || 0),
        graphEdges: graphRes.metrics?.total_edges ?? (graphRes.edges?.length || 0),
        graphComponents: graphRes.metrics?.total_components ?? 0,
        recommendationsTotal:
          nbaRes.recommendation_summary?.total_recommendations ?? (nbaRes.recommendations?.length || 0),
      };

      updateDocPipelineState(docId, {
        running: false,
        activeStep: null,
        summary: summaryData,
        error: null,
      });

      // Refresh document list to sync backend state
      await loadDocuments();
    } catch (err) {
      console.error(`Pipeline failed for document ${docId}:`, err);

      // Determine which stage failed based on activeStep
      setDocPipelineStates((prev) => {
        const cur = prev[docId] || {};
        const failedStep = cur.activeStep || 'process';
        return {
          ...prev,
          [docId]: {
            ...cur,
            running: false,
            activeStep: null,
            stepStatus: {
              ...cur.stepStatus,
              [failedStep]: 'failed',
            },
            error: {
              step: failedStep,
              message: err.message || 'Pipeline execution encountered an unexpected error.',
            },
          },
        };
      });
    }
  };

  // Individual step execution: Process Text
  const runStepProcess = async (doc) => {
    if (!activeInvestigation?.id || !doc?.id) return;
    updateDocPipelineState(doc.id, (prev) => ({
      ...prev,
      running: true,
      activeStep: 'process',
      error: null,
      stepStatus: { ...prev.stepStatus, process: 'running' },
    }));

    try {
      await processDocument(activeInvestigation.id, doc.id);
      updateDocPipelineState(doc.id, (prev) => ({
        ...prev,
        running: false,
        activeStep: null,
        stepStatus: { ...prev.stepStatus, process: 'completed' },
      }));
      await loadDocuments();
    } catch (err) {
      updateDocPipelineState(doc.id, (prev) => ({
        ...prev,
        running: false,
        activeStep: null,
        stepStatus: { ...prev.stepStatus, process: 'failed' },
        error: { step: 'process', message: err.message },
      }));
    }
  };

  // Individual step execution: Extract Entities
  const runStepEntities = async (doc) => {
    if (!activeInvestigation?.id || !doc?.id) return;
    updateDocPipelineState(doc.id, (prev) => ({
      ...prev,
      running: true,
      activeStep: 'entities',
      error: null,
      stepStatus: { ...prev.stepStatus, entities: 'running' },
    }));

    try {
      const res = await extractDocumentEntities(activeInvestigation.id, doc.id);
      updateDocPipelineState(doc.id, (prev) => ({
        ...prev,
        running: false,
        activeStep: null,
        stepStatus: { ...prev.stepStatus, entities: 'completed' },
        stepCounts: {
          ...prev.stepCounts,
          entitiesSaved: res.entities_saved,
          entitiesTotal: res.entities_total,
        },
      }));
    } catch (err) {
      updateDocPipelineState(doc.id, (prev) => ({
        ...prev,
        running: false,
        activeStep: null,
        stepStatus: { ...prev.stepStatus, entities: 'failed' },
        error: { step: 'entities', message: err.message },
      }));
    }
  };

  // Individual step execution: Extract Relationships
  const runStepRelationships = async (doc) => {
    if (!activeInvestigation?.id || !doc?.id) return;
    updateDocPipelineState(doc.id, (prev) => ({
      ...prev,
      running: true,
      activeStep: 'relationships',
      error: null,
      stepStatus: { ...prev.stepStatus, relationships: 'running' },
    }));

    try {
      const res = await extractDocumentRelationships(activeInvestigation.id, doc.id);
      updateDocPipelineState(doc.id, (prev) => ({
        ...prev,
        running: false,
        activeStep: null,
        stepStatus: { ...prev.stepStatus, relationships: 'completed' },
        stepCounts: {
          ...prev.stepCounts,
          relationshipsSaved: res.relationships_saved,
          relationshipsTotal: res.relationships_total,
        },
      }));
    } catch (err) {
      updateDocPipelineState(doc.id, (prev) => ({
        ...prev,
        running: false,
        activeStep: null,
        stepStatus: { ...prev.stepStatus, relationships: 'failed' },
        error: { step: 'relationships', message: err.message },
      }));
    }
  };

  // Individual step execution: Refresh Graph & NBA
  const runStepRefreshIntelligence = async () => {
    if (!activeInvestigation?.id) return;
    try {
      const gRes = await getInvestigationGraph(activeInvestigation.id);
      if (onGraphRefresh) await onGraphRefresh(activeInvestigation.id);

      const nRes = await getInvestigationNextBestActions(activeInvestigation.id);
      if (onRecommendationsRefresh) await onRecommendationsRefresh(activeInvestigation.id);

      setAlertMessage({
        type: 'success',
        text: `Investigation intelligence refreshed. Network Graph: ${gRes.nodes?.length || 0} nodes, Next-Best Actions: ${nRes.recommendations?.length || 0} recommendations.`,
      });
    } catch (err) {
      setAlertMessage({
        type: 'error',
        text: `Failed to refresh intelligence: ${err.message}`,
      });
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const currentCategoryObj = CATEGORIES.find((c) => c.id === selectedCategory) || CATEGORIES[0];

  // Pipeline stage status styling helper
  const getStageClasses = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-semantic-green-light border-green-200';
      case 'running':
        return 'bg-accent-blue-light border-blue-200';
      case 'failed':
        return 'bg-semantic-red-light border-red-200';
      default:
        return 'bg-cream border-border';
    }
  };

  const getStageIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-semantic-green" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-accent-blue animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-semantic-red" />;
      default:
        return <span className="w-3.5 h-3.5 rounded-full border border-border-strong"></span>;
    }
  };

  // Pipeline pill status styling
  const getPillClasses = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-semantic-green-light text-semantic-green border-green-200';
      case 'running':
        return 'bg-accent-blue-light text-accent-blue border-blue-200 animate-pulse';
      case 'failed':
        return 'bg-semantic-red-light text-semantic-red border-red-200';
      default:
        return 'bg-cream text-warm-gray border-border';
    }
  };

  const getPillIcon = (status) => {
    switch (status) {
      case 'completed':
        return <Check className="w-3 h-3 text-semantic-green" />;
      case 'running':
        return <RefreshCw className="w-3 h-3 animate-spin text-accent-blue" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-semantic-red" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-muted-gray"></span>;
    }
  };

  return (
    <div className="bg-warm-white border-t border-border flex flex-col shrink-0 text-charcoal transition-all duration-300">
      {/* Header bar & collapse toggle */}
      <div className="px-5 py-2 bg-cream border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-accent-red" />
          <h2 className="text-xs font-semibold tracking-wide uppercase text-charcoal">
            Evidence & Intelligence Management
          </h2>
          {activeInvestigation ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent-blue-light text-accent-blue border border-blue-200">
              {activeInvestigation.case_number}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-semantic-amber-light text-semantic-amber border border-amber-200 font-mono">
              DEMO MODE
            </span>
          )}
          {documents.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream text-warm-gray border border-border font-mono">
              {documents.length} File{documents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-warm-gray hover:text-charcoal p-1 rounded hover:bg-parchment transition-colors flex items-center gap-1 text-xs cursor-pointer"
        >
          <span className="text-[11px] font-medium">{isCollapsed ? 'Expand Drawer' : 'Collapse'}</span>
          {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Drawer Content */}
      {!isCollapsed && (
        <div className="p-4 space-y-4 max-h-[440px] overflow-y-auto">
          {/* Active Case Warning Banner if in Demo Mode */}
          {!activeInvestigation && (
            <div className="p-3 rounded bg-semantic-amber-light border border-amber-200 text-semantic-amber text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-semantic-amber" />
                <span>Select or create an investigation above to enable document uploads, pipeline orchestration, and PostgreSQL storage.</span>
              </div>
            </div>
          )}

          {/* Feedback Alerts */}
          {alertMessage && (
            <div
              className={`p-3 rounded text-xs flex items-center justify-between gap-2 border ${
                alertMessage.type === 'error'
                  ? 'bg-semantic-red-light border-red-200 text-semantic-red'
                  : alertMessage.type === 'warning'
                  ? 'bg-semantic-amber-light border-amber-200 text-semantic-amber'
                  : 'bg-semantic-green-light border-green-200 text-semantic-green'
              }`}
            >
              <div className="flex items-center gap-2">
                {alertMessage.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-semantic-red" />}
                {alertMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 text-semantic-amber" />}
                {alertMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-semantic-green" />}
                <span>{alertMessage.text}</span>
              </div>
              <button
                onClick={() => setAlertMessage(null)}
                className="text-warm-gray hover:text-charcoal text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 1. Categorized Upload Cards */}
          <div>
            <div className="text-[11px] font-semibold text-warm-gray uppercase tracking-wider mb-2">
              1. Select Evidence Category
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {CATEGORIES.map((cat) => {
                const IconComp = cat.icon;
                const isSelected = selectedCategory === cat.id;

                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      if (cat.warning) {
                        setAlertMessage({ type: 'warning', text: cat.warning });
                      }
                    }}
                    className={`p-2.5 rounded border text-left transition-all relative cursor-pointer ${
                      isSelected
                        ? 'bg-accent-red-light border-accent-red/40 ring-1 ring-accent-red/20'
                        : 'bg-warm-white border-border hover:bg-cream hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className={`p-1.5 rounded border ${cat.color}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-accent-red"></span>
                      )}
                    </div>
                    <div className="font-semibold text-xs text-charcoal truncate">{cat.label}</div>
                    <div className="text-[10px] text-warm-gray truncate">{cat.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Drag & Drop Upload Zone or File Preview Card */}
          <div>
            <div className="text-[11px] font-semibold text-warm-gray uppercase tracking-wider mb-2">
              2. Upload Document Evidence
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.csv"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
              className="hidden"
            />

            {!selectedFile ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                  isDragOver
                    ? 'border-accent-red bg-accent-red-light'
                    : 'border-border-strong bg-cream hover:border-warm-gray hover:bg-parchment'
                }`}
              >
                <div className="flex flex-col items-center justify-center py-2 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-warm-white border border-border flex items-center justify-center text-accent-red">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-charcoal">
                      Drag and drop evidence file here, or{' '}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-accent-red hover:text-red-700 underline font-semibold cursor-pointer"
                      >
                        browse files
                      </button>
                    </p>
                    <p className="text-[11px] text-warm-gray mt-0.5">
                      Supported formats: <span className="font-mono text-charcoal">.pdf, .docx, .txt, .csv</span> (Max size: 50MB)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Selected File Card with explicit Upload Action */
              <div className="bg-warm-white border border-accent-red/30 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-blue-light text-accent-blue border border-blue-200 uppercase font-mono">
                      Ready to Upload
                    </span>
                    <span className="text-xs text-warm-gray">Category: <strong className="text-charcoal">{currentCategoryObj.label}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    disabled={uploading}
                    className="text-warm-gray hover:text-semantic-red text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded bg-accent-blue-light border border-blue-200 flex items-center justify-center text-accent-blue shrink-0">
                      <File className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-charcoal truncate text-sm">{selectedFile.name}</div>
                      <div className="text-[11px] text-warm-gray flex items-center gap-2 mt-0.5">
                        <span className="uppercase font-mono text-accent-blue font-semibold">
                          .{selectedFile.name.split('.').pop()}
                        </span>
                        <span>•</span>
                        <span>{formatFileSize(selectedFile.size)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleUploadSubmit}
                      disabled={uploading || !activeInvestigation}
                      className="flex items-center gap-2 px-5 py-2 rounded bg-accent-red hover:bg-red-800 text-white font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {uploading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Uploading Document...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>Upload Document to Server</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {uploading && (
                  <div className="w-full bg-cream rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-accent-red h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Case Documents & Intelligence Workflow */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-warm-gray uppercase tracking-wider flex items-center gap-2">
                <span>3. Case Documents & Pipeline Orchestration ({documents.length})</span>
              </div>
              {activeInvestigation && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={runStepRefreshIntelligence}
                    title="Refresh graph and Next-Best-Actions from existing investigation database records"
                    className="text-xs text-accent-blue hover:text-blue-700 flex items-center gap-1 font-medium bg-accent-blue-light border border-blue-200 px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Sync Graph & NBA</span>
                  </button>
                  <button
                    onClick={loadDocuments}
                    disabled={loadingDocs}
                    className="text-xs text-warm-gray hover:text-charcoal flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingDocs ? 'animate-spin' : ''}`} />
                    <span>Refresh List</span>
                  </button>
                </div>
              )}
            </div>

            {!activeInvestigation ? (
              <div className="text-center py-6 border border-border rounded bg-cream text-warm-gray text-xs">
                No active investigation selected. Select an investigation above to view uploaded case evidence and run intelligence workflows.
              </div>
            ) : loadingDocs ? (
              <div className="text-center py-6 text-warm-gray text-xs flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-border-strong border-t-accent-red rounded-full animate-spin"></div>
                <span>Fetching document records from PostgreSQL...</span>
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-6 border border-border rounded bg-cream text-warm-gray text-xs">
                No evidence documents uploaded yet for case <span className="font-semibold text-charcoal">{activeInvestigation.case_number}</span>.
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => {
                  const pState = docPipelineStates[doc.id] || {
                    running: false,
                    activeStep: null,
                    stepStatus: {
                      process: doc.processing_status === 'COMPLETED' ? 'completed' : (doc.processing_status === 'FAILED' ? 'failed' : 'pending'),
                      entities: 'pending',
                      relationships: 'pending',
                      graph: 'pending',
                      nba: 'pending',
                    },
                    stepCounts: {},
                    error: null,
                    summary: null,
                  };

                  const isExpanded = expandedDocIds.has(doc.id);

                  return (
                    <div
                      key={doc.id}
                      className="bg-warm-white border border-border rounded-lg overflow-hidden transition-all hover:border-border-strong"
                    >
                      {/* Top Bar: Document info + High level pipeline badges + Actions */}
                      <div className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-2 rounded bg-cream border border-border text-accent-red shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-charcoal truncate text-sm flex items-center gap-2">
                              <span title={doc.original_filename}>{doc.original_filename}</span>
                              <span className="uppercase text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent-blue-light text-accent-blue border border-blue-200">
                                {doc.document_type || 'OTHER'}
                              </span>
                            </div>
                            <div className="text-[11px] text-warm-gray flex flex-wrap items-center gap-2 mt-1">
                              <span className="uppercase font-mono text-charcoal">.{doc.file_type || 'file'}</span>
                              <span>•</span>
                              <span>{formatFileSize(doc.file_size)}</span>
                              {doc.uploaded_at && (
                                <>
                                  <span>•</span>
                                  <span>{formatDate(doc.uploaded_at)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Pipeline Stage Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-medium font-mono">
                          {/* 1. Uploaded */}
                          <span className="px-2 py-0.5 rounded bg-semantic-green-light text-semantic-green border border-green-200 flex items-center gap-1">
                            <Check className="w-3 h-3 text-semantic-green" />
                            <span>Uploaded</span>
                          </span>

                          {/* 2. Text Extracted */}
                          <span
                            className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                              pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                                ? getPillClasses('completed')
                                : getPillClasses(pState.stepStatus.process)
                            }`}
                          >
                            {pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                              ? getPillIcon('completed')
                              : getPillIcon(pState.stepStatus.process)}
                            <span>Text Extracted</span>
                          </span>

                          {/* 3. Entities Extracted */}
                          <span className={`px-2 py-0.5 rounded border flex items-center gap-1 ${getPillClasses(pState.stepStatus.entities)}`}>
                            {getPillIcon(pState.stepStatus.entities)}
                            <span>Entities</span>
                          </span>

                          {/* 4. Relationships */}
                          <span className={`px-2 py-0.5 rounded border flex items-center gap-1 ${getPillClasses(pState.stepStatus.relationships)}`}>
                            {getPillIcon(pState.stepStatus.relationships)}
                            <span>Relationships</span>
                          </span>
                        </div>

                        {/* Right Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Run Full Pipeline Primary Button */}
                          <button
                            onClick={() => runFullPipeline(doc)}
                            disabled={pState.running}
                            className="px-3 py-1.5 rounded bg-accent-red hover:bg-red-800 text-white font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                          >
                            {pState.running ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Running Pipeline...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-white" />
                                <span>Run Intelligence Pipeline</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDownload(doc)}
                            title="Download document file"
                            className="p-1.5 rounded bg-cream hover:bg-parchment text-warm-gray hover:text-charcoal border border-border transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => toggleDocExpand(doc.id)}
                            className="p-1.5 rounded bg-cream hover:bg-parchment text-warm-gray hover:text-charcoal border border-border transition-colors flex items-center gap-1 text-xs cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Pipeline Workflow & Intelligence Drawer */}
                      {isExpanded && (
                        <div className="border-t border-border bg-ivory p-4 space-y-4 text-xs">
                          {/* Document Intelligence Status Stepper */}
                          <div>
                            <div className="text-[11px] font-semibold text-warm-gray uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-accent-red" />
                              <span>Document Intelligence Pipeline Status</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                              {/* Step 1: Uploaded */}
                              <div className="p-2.5 rounded bg-semantic-green-light border border-green-200 flex flex-col justify-between">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-warm-gray">STAGE 1</span>
                                  <CheckCircle2 className="w-4 h-4 text-semantic-green" />
                                </div>
                                <div className="font-semibold text-charcoal">✓ Uploaded</div>
                                <div className="text-[10px] text-warm-gray mt-0.5">Physical file stored</div>
                              </div>

                              {/* Step 2: Text Extraction */}
                              <div
                                className={`p-2.5 rounded border flex flex-col justify-between ${
                                  pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                                    ? getStageClasses('completed')
                                    : getStageClasses(pState.stepStatus.process)
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-warm-gray">STAGE 2</span>
                                  {pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                                    ? getStageIcon('completed')
                                    : getStageIcon(pState.stepStatus.process)}
                                </div>
                                <div className="font-semibold text-charcoal">
                                  {pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                                    ? '✓ Text Extracted'
                                    : '○ Text Extraction'}
                                </div>
                                <div className="text-[10px] text-warm-gray mt-0.5">
                                  {doc.processing_status === 'COMPLETED' ? 'Content parsed' : 'Extract document text'}
                                </div>
                              </div>

                              {/* Step 3: Entity Extraction */}
                              <div className={`p-2.5 rounded border flex flex-col justify-between ${getStageClasses(pState.stepStatus.entities)}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-warm-gray">STAGE 3</span>
                                  {getStageIcon(pState.stepStatus.entities)}
                                </div>
                                <div className="font-semibold text-charcoal">
                                  {pState.stepStatus.entities === 'completed'
                                    ? '✓ Entities Extracted'
                                    : '○ Entity Extraction'}
                                </div>
                                <div className="text-[10px] text-warm-gray mt-0.5">
                                  {(() => {
                                    const total = pState.stepCounts.entitiesTotal ?? pState.summary?.entitiesTotal;
                                    const saved = pState.stepCounts.entitiesSaved ?? pState.summary?.entitiesSaved;
                                    if (total === undefined || total === null) return 'Extract named entities';
                                    if (total === 0) return 'No entities found';
                                    if (saved > 0) return `${saved} new entities saved`;
                                    return `${total} entities found • existing intelligence reused`;
                                  })()}
                                </div>
                              </div>

                              {/* Step 4: Relationship Discovery */}
                              <div className={`p-2.5 rounded border flex flex-col justify-between ${getStageClasses(pState.stepStatus.relationships)}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-warm-gray">STAGE 4</span>
                                  {getStageIcon(pState.stepStatus.relationships)}
                                </div>
                                <div className="font-semibold text-charcoal">
                                  {pState.stepStatus.relationships === 'completed'
                                    ? '✓ Relationships Discovered'
                                    : '○ Relationship Discovery'}
                                </div>
                                <div className="text-[10px] text-warm-gray mt-0.5">
                                  {(() => {
                                    const total = pState.stepCounts.relationshipsTotal ?? pState.summary?.relationshipsTotal;
                                    const saved = pState.stepCounts.relationshipsSaved ?? pState.summary?.relationshipsSaved;
                                    if (total === undefined || total === null) return 'Evidence links';
                                    if (total === 0) return 'No relationships found';
                                    if (saved > 0) return `${saved} new relationships saved`;
                                    return `${total} relationships found • existing intelligence reused`;
                                  })()}
                                </div>
                              </div>

                              {/* Step 5: Graph Intelligence */}
                              <div className={`p-2.5 rounded border flex flex-col justify-between ${getStageClasses(pState.stepStatus.graph)}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-warm-gray">STAGE 5</span>
                                  {getStageIcon(pState.stepStatus.graph)}
                                </div>
                                <div className="font-semibold text-charcoal">
                                  {pState.stepStatus.graph === 'completed'
                                    ? '✓ Graph Updated'
                                    : '○ Investigation Graph'}
                                </div>
                                <div className="text-[10px] text-warm-gray mt-0.5">Cytoscape visualization</div>
                              </div>

                              {/* Step 6: Next-Best Actions */}
                              <div className={`p-2.5 rounded border flex flex-col justify-between ${getStageClasses(pState.stepStatus.nba)}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-warm-gray">STAGE 6</span>
                                  {getStageIcon(pState.stepStatus.nba)}
                                </div>
                                <div className="font-semibold text-charcoal">
                                  {pState.stepStatus.nba === 'completed'
                                    ? '✓ Recommendations Ready'
                                    : '○ Next-Best Actions'}
                                </div>
                                <div className="text-[10px] text-warm-gray mt-0.5">Ranked recommendations</div>
                              </div>
                            </div>
                          </div>

                          {/* Error State Banner with Stage-Specific Retry Action */}
                          {pState.error && (
                            <div className="p-3 rounded bg-semantic-red-light border border-red-200 text-semantic-red flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-start gap-2 max-w-xl">
                                <AlertTriangle className="w-5 h-5 text-semantic-red shrink-0 mt-0.5" />
                                <div>
                                  <div className="font-semibold text-semantic-red">
                                    Pipeline Error at Stage [{pState.error.step.toUpperCase()}]
                                  </div>
                                  <div className="text-xs text-red-700 mt-0.5">{pState.error.message}</div>
                                  <div className="text-[11px] text-warm-gray mt-1">
                                    Completed stages remain saved in PostgreSQL. You can retry from the failed step.
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => runFullPipeline(doc)}
                                className="px-3 py-1.5 rounded bg-semantic-red hover:bg-red-800 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Retry Intelligence Pipeline</span>
                              </button>
                            </div>
                          )}

                          {/* Controlled Individual Pipeline Stage Actions */}
                          <div className="pt-2 border-t border-border">
                            <div className="text-[11px] font-semibold text-warm-gray uppercase tracking-wider mb-2">
                              Controlled Stage Actions
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Step 1: Process Text */}
                              <button
                                onClick={() => runStepProcess(doc)}
                                disabled={pState.running}
                                className="px-3 py-1.5 rounded bg-warm-white hover:bg-cream text-charcoal font-medium text-xs border border-border flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5 text-accent-blue" />
                                <span>1. Process Text</span>
                              </button>

                              {/* Step 2: Extract Entities */}
                              <button
                                onClick={() => runStepEntities(doc)}
                                disabled={pState.running || doc.processing_status !== 'COMPLETED'}
                                title={
                                  doc.processing_status !== 'COMPLETED'
                                    ? 'Process evidence document first'
                                    : 'Extract Person, Phone, Location, Vehicle, and Event entities'
                                }
                                className="px-3 py-1.5 rounded bg-warm-white hover:bg-cream text-charcoal font-medium text-xs border border-border flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <Cpu className="w-3.5 h-3.5 text-semantic-amber" />
                                <span>2. Extract Entities</span>
                              </button>

                              {/* Step 3: Discover Relationships */}
                              <button
                                onClick={() => runStepRelationships(doc)}
                                disabled={pState.running || doc.processing_status !== 'COMPLETED'}
                                title="Discover evidence links between extracted entities"
                                className="px-3 py-1.5 rounded bg-warm-white hover:bg-cream text-charcoal font-medium text-xs border border-border flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <GitFork className="w-3.5 h-3.5 text-semantic-green" />
                                <span>3. Discover Relationships</span>
                              </button>

                              {/* Step 4 & 5: Refresh Investigation Intelligence */}
                              <button
                                onClick={runStepRefreshIntelligence}
                                disabled={pState.running}
                                className="px-3 py-1.5 rounded bg-warm-white hover:bg-cream text-charcoal font-medium text-xs border border-border flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Network className="w-3.5 h-3.5 text-purple-600" />
                                <span>4. Refresh Graph & NBA</span>
                              </button>
                            </div>
                          </div>

                          {/* Pipeline Result Summary Card */}
                          {pState.summary && (
                            <div className="p-3.5 rounded bg-warm-white border border-border-strong space-y-2">
                              <div className="flex items-center justify-between border-b border-border pb-2">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-4 h-4 text-accent-red" />
                                  <span className="font-semibold text-charcoal uppercase tracking-wider text-xs">
                                    Intelligence Generated Summary
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-semantic-green-light text-semantic-green border border-green-200">
                                  PIPELINE SUCCESSFUL
                                </span>
                              </div>

                              {pState.summary.entitiesSaved === 0 && pState.summary.relationshipsSaved === 0 && (
                                <div className="text-[11px] text-accent-blue bg-accent-blue-light border border-blue-200 rounded px-2.5 py-1 flex items-center gap-1.5 font-medium">
                                  <Info className="w-3.5 h-3.5 text-accent-blue shrink-0" />
                                  <span>ℹ Existing intelligence reused — no duplicate records were added.</span>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center pt-1">
                                <div className="p-2 rounded bg-cream border border-border">
                                  <div className="text-[10px] text-warm-gray uppercase">New Entities Saved</div>
                                  <div className="text-base font-bold text-semantic-amber">
                                    {pState.summary.entitiesSaved}
                                  </div>
                                  <div className="text-[9px] text-muted-gray font-mono">
                                    Entities Found: {pState.summary.entitiesTotal}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-cream border border-border">
                                  <div className="text-[10px] text-warm-gray uppercase">New Relationships Saved</div>
                                  <div className="text-base font-bold text-semantic-green">
                                    {pState.summary.relationshipsSaved}
                                  </div>
                                  <div className="text-[9px] text-muted-gray font-mono">
                                    Relationships Found: {pState.summary.relationshipsTotal}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-cream border border-border">
                                  <div className="text-[10px] text-warm-gray uppercase">Network Nodes</div>
                                  <div className="text-base font-bold text-accent-blue">
                                    {pState.summary.graphNodes}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-cream border border-border">
                                  <div className="text-[10px] text-warm-gray uppercase">Connections</div>
                                  <div className="text-base font-bold text-accent-blue">
                                    {pState.summary.graphEdges}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-cream border border-border">
                                  <div className="text-[10px] text-warm-gray uppercase">Components</div>
                                  <div className="text-base font-bold text-purple-700">
                                    {pState.summary.graphComponents}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-cream border border-border">
                                  <div className="text-[10px] text-warm-gray uppercase">Recommendations</div>
                                  <div className="text-base font-bold text-accent-red">
                                    {pState.summary.recommendationsTotal}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
