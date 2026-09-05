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
} from 'lucide-react';
import { uploadDocument, getDocuments, downloadDocument } from '../services/api';

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

export default function DocumentUploadPanel({ activeInvestigation }) {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('FIR');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [alertMessage, setAlertMessage] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fileInputRef = useRef(null);

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
  }, [loadDocuments]);

  // File validation routine
  const validateFile = (file) => {
    if (!file) return false;

    const ext = '.' + file.name.split('.').pop().toLowerCase();

    // Check unsupported video / media extensions for graceful warning
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
          className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs"
        >
          <span className="text-[11px] font-medium">{isCollapsed ? 'Expand Drawer' : 'Collapse'}</span>
          {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Drawer Content */}
      {!isCollapsed && (
        <div className="p-4 space-y-4 max-h-[380px] overflow-y-auto">
          {/* Active Case Warning Banner if in Demo Mode */}
          {!activeInvestigation && (
            <div className="p-3 rounded bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Select or create an investigation above to enable document uploads and PostgreSQL storage for this case.</span>
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
                className="text-slate-400 hover:text-slate-200 text-xs"
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
                    className={`p-2.5 rounded border text-left transition-all relative ${
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
              2. Upload Document
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
                    className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1 transition-colors"
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

          {/* 3. Uploaded Documents List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                3. Case Documents ({documents.length})
              </div>
              {activeInvestigation && (
                <button
                  onClick={loadDocuments}
                  disabled={loadingDocs}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingDocs ? 'animate-spin' : ''}`} />
                  <span>Refresh List</span>
                </button>
              )}
            </div>

            {!activeInvestigation ? (
              <div className="text-center py-6 border border-slate-800/80 rounded bg-slate-900/50 text-slate-500 text-xs">
                No active investigation selected. Select an investigation above to view uploaded case evidence.
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded bg-slate-800/80 border border-slate-700/70 hover:border-slate-600 flex items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded bg-slate-700/60 border border-slate-600 text-blue-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-200 truncate" title={doc.original_filename}>
                          {doc.original_filename}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="uppercase font-mono px-1 py-0.2 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 font-semibold">
                            {doc.document_type || 'OTHER'}
                          </span>
                          <span className="uppercase font-mono px-1 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-700">
                            .{doc.file_type || 'file'}
                          </span>
                          {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                          {doc.uploaded_at && <span>{formatDate(doc.uploaded_at)}</span>}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownload(doc)}
                      title="Download physical document file"
                      className="p-1.5 rounded bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors shrink-0 flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
