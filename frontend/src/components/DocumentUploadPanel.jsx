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
  { id: 'FIR', label: 'FIR', description: 'First Information Report', icon: FileText, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { id: 'CDR', label: 'CDR', description: 'Call Detail Records', icon: PhoneCall, color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  { id: 'FINANCIAL', label: 'Financial Records', description: 'Bank & Transaction Logs', icon: DollarSign, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'POLICE_REPORT', label: 'Police Reports', description: 'Surveillance & Interrogation', icon: ClipboardList, color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
  { id: 'SURVEILLANCE', label: 'Surveillance Reports', description: 'Visual & Audio Notes', icon: Video, color: 'text-rose-400 border-rose-500/30 bg-rose-500/10', warning: 'Video formats (.mp4, .avi) unsupported in current version' },
  { id: 'OTHER', label: 'Other Intel', description: 'Miscellaneous Evidence', icon: Folder, color: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
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

  return (
    <div className="bg-slate-900/95 border-t border-slate-800 flex flex-col shrink-0 text-slate-100 transition-all duration-300">
      {/* Header bar & collapse toggle */}
      <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-200">
            Evidence & Intelligence Management
          </h2>
          {activeInvestigation ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/50">
              {activeInvestigation.case_number}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 font-mono">
              DEMO MODE
            </span>
          )}
          {documents.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono">
              {documents.length} File{documents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs cursor-pointer"
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
            <div className="p-3 rounded bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Select or create an investigation above to enable document uploads, pipeline orchestration, and PostgreSQL storage.</span>
              </div>
            </div>
          )}

          {/* Feedback Alerts */}
          {alertMessage && (
            <div
              className={`p-3 rounded text-xs flex items-center justify-between gap-2 border ${
                alertMessage.type === 'error'
                  ? 'bg-red-950/50 border-red-800/60 text-red-300'
                  : alertMessage.type === 'warning'
                  ? 'bg-amber-950/50 border-amber-800/60 text-amber-300'
                  : 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {alertMessage.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />}
                {alertMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />}
                {alertMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
                <span>{alertMessage.text}</span>
              </div>
              <button
                onClick={() => setAlertMessage(null)}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 1. Categorized Upload Cards */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
                        ? 'bg-blue-900/40 border-blue-500/80 shadow-[0_0_12px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className={`p-1.5 rounded border ${cat.color}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]"></span>
                      )}
                    </div>
                    <div className="font-semibold text-xs text-slate-200 truncate">{cat.label}</div>
                    <div className="text-[10px] text-slate-400 truncate">{cat.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Drag & Drop Upload Zone or File Preview Card */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
                    ? 'border-blue-500 bg-blue-950/30'
                    : 'border-slate-700/70 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex flex-col items-center justify-center py-2 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      Drag and drop evidence file here, or{' '}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-400 hover:text-blue-300 underline font-semibold cursor-pointer"
                      >
                        browse files
                      </button>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Supported formats: <span className="font-mono text-slate-300">.pdf, .docx, .txt, .csv</span> (Max size: 50MB)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Selected File Card with explicit Upload Action */
              <div className="bg-slate-800/90 border border-blue-500/50 rounded-lg p-3 shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-900/80 text-blue-300 border border-blue-700 uppercase font-mono">
                      Ready to Upload
                    </span>
                    <span className="text-xs text-slate-300">Category: <strong>{currentCategoryObj.label}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    disabled={uploading}
                    className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                      <File className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate text-sm">{selectedFile.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="uppercase font-mono text-blue-300 font-semibold">
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
                      className="flex items-center gap-2 px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-md shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 animate-pulse"
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
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>3. Case Documents & Pipeline Orchestration ({documents.length})</span>
              </div>
              {activeInvestigation && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={runStepRefreshIntelligence}
                    title="Refresh graph and Next-Best-Actions from existing investigation database records"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium bg-indigo-950/60 border border-indigo-800/60 px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Sync Graph & NBA</span>
                  </button>
                  <button
                    onClick={loadDocuments}
                    disabled={loadingDocs}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingDocs ? 'animate-spin' : ''}`} />
                    <span>Refresh List</span>
                  </button>
                </div>
              )}
            </div>

            {!activeInvestigation ? (
              <div className="text-center py-6 border border-slate-800/80 rounded bg-slate-900/50 text-slate-500 text-xs">
                No active investigation selected. Select an investigation above to view uploaded case evidence and run intelligence workflows.
              </div>
            ) : loadingDocs ? (
              <div className="text-center py-6 text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                <span>Fetching document records from PostgreSQL...</span>
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-6 border border-slate-800/80 rounded bg-slate-900/50 text-slate-500 text-xs">
                No evidence documents uploaded yet for case <span className="font-semibold text-slate-300">{activeInvestigation.case_number}</span>.
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
                      className="bg-slate-800/80 border border-slate-700/80 rounded-lg overflow-hidden transition-all shadow-sm hover:border-slate-600"
                    >
                      {/* Top Bar: Document info + High level pipeline badges + Actions */}
                      <div className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-2 rounded bg-slate-700/70 border border-slate-600 text-blue-400 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-100 truncate text-sm flex items-center gap-2">
                              <span title={doc.original_filename}>{doc.original_filename}</span>
                              <span className="uppercase text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60">
                                {doc.document_type || 'OTHER'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 mt-1">
                              <span className="uppercase font-mono text-slate-300">.{doc.file_type || 'file'}</span>
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
                          <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Uploaded</span>
                          </span>

                          {/* 2. Text Extracted */}
                          <span
                            className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                              pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                : pState.stepStatus.process === 'running'
                                ? 'bg-blue-950/90 text-blue-300 border-blue-700 animate-pulse'
                                : pState.stepStatus.process === 'failed'
                                ? 'bg-red-950/90 text-red-300 border-red-800'
                                : 'bg-slate-900/80 text-slate-400 border-slate-700'
                            }`}
                          >
                            {pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : pState.stepStatus.process === 'running' ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                            ) : pState.stepStatus.process === 'failed' ? (
                              <AlertCircle className="w-3 h-3 text-red-400" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                            )}
                            <span>Text Extracted</span>
                          </span>

                          {/* 3. Entities Extracted */}
                          <span
                            className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                              pState.stepStatus.entities === 'completed'
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                : pState.stepStatus.entities === 'running'
                                ? 'bg-blue-950/90 text-blue-300 border-blue-700 animate-pulse'
                                : pState.stepStatus.entities === 'failed'
                                ? 'bg-red-950/90 text-red-300 border-red-800'
                                : 'bg-slate-900/80 text-slate-400 border-slate-700'
                            }`}
                          >
                            {pState.stepStatus.entities === 'completed' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : pState.stepStatus.entities === 'running' ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                            ) : pState.stepStatus.entities === 'failed' ? (
                              <AlertCircle className="w-3 h-3 text-red-400" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                            )}
                            <span>Entities</span>
                          </span>

                          {/* 4. Relationships */}
                          <span
                            className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                              pState.stepStatus.relationships === 'completed'
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                : pState.stepStatus.relationships === 'running'
                                ? 'bg-blue-950/90 text-blue-300 border-blue-700 animate-pulse'
                                : pState.stepStatus.relationships === 'failed'
                                ? 'bg-red-950/90 text-red-300 border-red-800'
                                : 'bg-slate-900/80 text-slate-400 border-slate-700'
                            }`}
                          >
                            {pState.stepStatus.relationships === 'completed' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : pState.stepStatus.relationships === 'running' ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                            ) : pState.stepStatus.relationships === 'failed' ? (
                              <AlertCircle className="w-3 h-3 text-red-400" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                            )}
                            <span>Relationships</span>
                          </span>
                        </div>

                        {/* Right Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Run Full Pipeline Primary Button */}
                          <button
                            onClick={() => runFullPipeline(doc)}
                            disabled={pState.running}
                            className="px-3 py-1.5 rounded bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-blue-950/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                          >
                            {pState.running ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-200" />
                                <span>Running Pipeline...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 text-blue-200 fill-blue-200" />
                                <span>Run Intelligence Pipeline</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDownload(doc)}
                            title="Download document file"
                            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => toggleDocExpand(doc.id)}
                            className="p-1.5 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Pipeline Workflow & Intelligence Drawer */}
                      {isExpanded && (
                        <div className="border-t border-slate-700/80 bg-slate-900/90 p-4 space-y-4 text-xs">
                          {/* Document Intelligence Status Stepper */}
                          <div>
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-blue-400" />
                              <span>DOCUMENT INTELLIGENCE PIPELINE STATUS</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                              {/* Step 1: Uploaded */}
                              <div className="p-2.5 rounded bg-slate-800/80 border border-emerald-500/40 flex flex-col justify-between">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-slate-400">STAGE 1</span>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="font-semibold text-slate-200">✓ Uploaded</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">Physical file stored</div>
                              </div>

                              {/* Step 2: Text Extraction */}
                              <div
                                className={`p-2.5 rounded border flex flex-col justify-between ${
                                  pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                                    ? 'bg-slate-800/80 border-emerald-500/40'
                                    : pState.stepStatus.process === 'running'
                                    ? 'bg-blue-950/40 border-blue-500/70 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                                    : pState.stepStatus.process === 'failed'
                                    ? 'bg-red-950/40 border-red-500/70'
                                    : 'bg-slate-900/60 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-slate-400">STAGE 2</span>
                                  {pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : pState.stepStatus.process === 'running' ? (
                                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                                  ) : pState.stepStatus.process === 'failed' ? (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600"></span>
                                  )}
                                </div>
                                <div className="font-semibold text-slate-200">
                                  {pState.stepStatus.process === 'completed' || doc.processing_status === 'COMPLETED'
                                    ? '✓ Text Extracted'
                                    : '○ Text Extraction'}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {doc.processing_status === 'COMPLETED' ? 'Content parsed' : 'Extract document text'}
                                </div>
                              </div>

                              {/* Step 3: Entity Extraction */}
                              <div
                                className={`p-2.5 rounded border flex flex-col justify-between ${
                                  pState.stepStatus.entities === 'completed'
                                    ? 'bg-slate-800/80 border-emerald-500/40'
                                    : pState.stepStatus.entities === 'running'
                                    ? 'bg-blue-950/40 border-blue-500/70 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                                    : pState.stepStatus.entities === 'failed'
                                    ? 'bg-red-950/40 border-red-500/70'
                                    : 'bg-slate-900/60 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-slate-400">STAGE 3</span>
                                  {pState.stepStatus.entities === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : pState.stepStatus.entities === 'running' ? (
                                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                                  ) : pState.stepStatus.entities === 'failed' ? (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600"></span>
                                  )}
                                </div>
                                <div className="font-semibold text-slate-200">
                                  {pState.stepStatus.entities === 'completed'
                                    ? '✓ Entities Extracted'
                                    : '○ Entity Extraction'}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {pState.stepCounts.entitiesTotal
                                    ? `${pState.stepCounts.entitiesTotal} entities saved`
                                    : 'Extract named entities'}
                                </div>
                              </div>

                              {/* Step 4: Relationship Discovery */}
                              <div
                                className={`p-2.5 rounded border flex flex-col justify-between ${
                                  pState.stepStatus.relationships === 'completed'
                                    ? 'bg-slate-800/80 border-emerald-500/40'
                                    : pState.stepStatus.relationships === 'running'
                                    ? 'bg-blue-950/40 border-blue-500/70 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                                    : pState.stepStatus.relationships === 'failed'
                                    ? 'bg-red-950/40 border-red-500/70'
                                    : 'bg-slate-900/60 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-slate-400">STAGE 4</span>
                                  {pState.stepStatus.relationships === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : pState.stepStatus.relationships === 'running' ? (
                                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                                  ) : pState.stepStatus.relationships === 'failed' ? (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600"></span>
                                  )}
                                </div>
                                <div className="font-semibold text-slate-200">
                                  {pState.stepStatus.relationships === 'completed'
                                    ? '✓ Relationships Saved'
                                    : '○ Relationship Discovery'}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {pState.stepCounts.relationshipsTotal
                                    ? `${pState.stepCounts.relationshipsTotal} relationships saved`
                                    : 'Evidence links'}
                                </div>
                              </div>

                              {/* Step 5: Graph Intelligence */}
                              <div
                                className={`p-2.5 rounded border flex flex-col justify-between ${
                                  pState.stepStatus.graph === 'completed'
                                    ? 'bg-slate-800/80 border-emerald-500/40'
                                    : pState.stepStatus.graph === 'running'
                                    ? 'bg-blue-950/40 border-blue-500/70 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                                    : pState.stepStatus.graph === 'failed'
                                    ? 'bg-red-950/40 border-red-500/70'
                                    : 'bg-slate-900/60 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-slate-400">STAGE 5</span>
                                  {pState.stepStatus.graph === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : pState.stepStatus.graph === 'running' ? (
                                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                                  ) : pState.stepStatus.graph === 'failed' ? (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600"></span>
                                  )}
                                </div>
                                <div className="font-semibold text-slate-200">
                                  {pState.stepStatus.graph === 'completed'
                                    ? '✓ Graph Updated'
                                    : '○ Investigation Graph'}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">Cytoscape visualization</div>
                              </div>

                              {/* Step 6: Next-Best Actions */}
                              <div
                                className={`p-2.5 rounded border flex flex-col justify-between ${
                                  pState.stepStatus.nba === 'completed'
                                    ? 'bg-slate-800/80 border-emerald-500/40'
                                    : pState.stepStatus.nba === 'running'
                                    ? 'bg-blue-950/40 border-blue-500/70 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                                    : pState.stepStatus.nba === 'failed'
                                    ? 'bg-red-950/40 border-red-500/70'
                                    : 'bg-slate-900/60 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-mono text-slate-400">STAGE 6</span>
                                  {pState.stepStatus.nba === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : pState.stepStatus.nba === 'running' ? (
                                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                                  ) : pState.stepStatus.nba === 'failed' ? (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border border-slate-600"></span>
                                  )}
                                </div>
                                <div className="font-semibold text-slate-200">
                                  {pState.stepStatus.nba === 'completed'
                                    ? '✓ Recommendations Ready'
                                    : '○ Next-Best Actions'}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">Ranked recommendations</div>
                              </div>
                            </div>
                          </div>

                          {/* Error State Banner with Stage-Specific Retry Action */}
                          {pState.error && (
                            <div className="p-3 rounded bg-red-950/60 border border-red-800/80 text-red-200 flex flex-wrap items-center justify-between gap-3 shadow-md">
                              <div className="flex items-start gap-2 max-w-xl">
                                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                <div>
                                  <div className="font-semibold text-red-300">
                                    ⚠ Pipeline Error at Stage [{pState.error.step.toUpperCase()}]
                                  </div>
                                  <div className="text-xs text-red-200/90 mt-0.5">{pState.error.message}</div>
                                  <div className="text-[11px] text-slate-400 mt-1">
                                    Completed stages remain saved in PostgreSQL. You can retry from the failed step.
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => runFullPipeline(doc)}
                                className="px-3 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Retry Intelligence Pipeline</span>
                              </button>
                            </div>
                          )}

                          {/* Controlled Individual Pipeline Stage Actions */}
                          <div className="pt-2 border-t border-slate-800">
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                              Controlled Stage Actions
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Step 1: Process Text */}
                              <button
                                onClick={() => runStepProcess(doc)}
                                disabled={pState.running}
                                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5 text-blue-400" />
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
                                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                                <span>2. Extract Entities</span>
                              </button>

                              {/* Step 3: Discover Relationships */}
                              <button
                                onClick={() => runStepRelationships(doc)}
                                disabled={pState.running || doc.processing_status !== 'COMPLETED'}
                                title="Discover evidence links between extracted entities"
                                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                              >
                                <GitFork className="w-3.5 h-3.5 text-emerald-400" />
                                <span>3. Discover Relationships</span>
                              </button>

                              {/* Step 4 & 5: Refresh Investigation Intelligence */}
                              <button
                                onClick={runStepRefreshIntelligence}
                                disabled={pState.running}
                                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Network className="w-3.5 h-3.5 text-purple-400" />
                                <span>4. Refresh Graph & NBA</span>
                              </button>
                            </div>
                          </div>

                          {/* Pipeline Result Summary Card */}
                          {pState.summary && (
                            <div className="p-3.5 rounded bg-gradient-to-r from-blue-950/50 via-indigo-950/40 to-slate-900 border border-blue-500/40 space-y-2 shadow-lg">
                              <div className="flex items-center justify-between border-b border-blue-800/40 pb-2">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-4 h-4 text-blue-400" />
                                  <span className="font-semibold text-slate-100 uppercase tracking-wider text-xs">
                                    INTELLIGENCE GENERATED SUMMARY
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  PIPELINE SUCCESSFUL
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center pt-1">
                                <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                                  <div className="text-[10px] text-slate-400 uppercase">Entities Saved</div>
                                  <div className="text-base font-bold text-amber-400">
                                    {pState.summary.entitiesSaved}
                                  </div>
                                  <div className="text-[9px] text-slate-500 font-mono">
                                    Total: {pState.summary.entitiesTotal}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                                  <div className="text-[10px] text-slate-400 uppercase">Relationships Saved</div>
                                  <div className="text-base font-bold text-emerald-400">
                                    {pState.summary.relationshipsSaved}
                                  </div>
                                  <div className="text-[9px] text-slate-500 font-mono">
                                    Total: {pState.summary.relationshipsTotal}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                                  <div className="text-[10px] text-slate-400 uppercase">Network Nodes</div>
                                  <div className="text-base font-bold text-blue-400">
                                    {pState.summary.graphNodes}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                                  <div className="text-[10px] text-slate-400 uppercase">Connections</div>
                                  <div className="text-base font-bold text-indigo-400">
                                    {pState.summary.graphEdges}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                                  <div className="text-[10px] text-slate-400 uppercase">Components</div>
                                  <div className="text-base font-bold text-purple-400">
                                    {pState.summary.graphComponents}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                                  <div className="text-[10px] text-slate-400 uppercase">Recommendations</div>
                                  <div className="text-base font-bold text-rose-400">
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
