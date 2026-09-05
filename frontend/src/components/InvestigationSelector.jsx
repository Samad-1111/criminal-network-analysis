import React, { useState } from 'react';
import { Briefcase, Plus, Trash2, RefreshCw, FolderOpen, AlertCircle, CheckCircle2, X } from 'lucide-react';

export default function InvestigationSelector({
  investigations = [],
  activeInvestigation = null,
  onSelectInvestigation,
  onCreateInvestigation,
  onDeleteInvestigation,
  onRefresh,
  loading = false,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    case_number: '',
    title: '',
    description: '',
    status: 'OPEN',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleOpenModal = () => {
    // Generate default case number suggestion
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setFormData({
      case_number: `CAS-2026-${randomNum}`,
      title: '',
      description: '',
      status: 'OPEN',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.case_number.trim() || !formData.title.trim()) {
      setFormError('Case number and Title are required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await onCreateInvestigation(formData);
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err.message || 'Failed to create investigation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeInvestigation) return;

    if (!window.confirm(`Are you sure you want to delete investigation "${activeInvestigation.title}" (${activeInvestigation.case_number})? This will delete all associated document metadata.`)) {
      return;
    }

    setDeleting(true);
    try {
      await onDeleteInvestigation(activeInvestigation.id);
    } catch (err) {
      alert(`Failed to delete investigation: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
      {/* Left side: Active Case & Selection */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-medium text-slate-300">
          <Briefcase className="w-4 h-4 text-blue-400" />
          <span className="hidden sm:inline">Active Case:</span>
        </div>

        {/* Dropdown Selector */}
        <div className="relative">
          <select
            value={activeInvestigation?.id || 'demo'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'demo') {
                onSelectInvestigation(null);
              } else {
                const found = investigations.find((inv) => inv.id === val);
                onSelectInvestigation(found || null);
              }
            }}
            disabled={loading}
            className="bg-slate-800 border border-slate-700 hover:border-slate-600 rounded px-3 py-1.5 text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[280px] sm:max-w-[360px] truncate"
          >
            <option value="demo">🔬 Synthetic Demo Case (Operation Blackout)</option>
            {investigations.map((inv) => (
              <option key={inv.id} value={inv.id}>
                📂 {inv.case_number} — {inv.title}
              </option>
            ))}
          </select>
        </div>

        {/* Active Investigation Status Badge */}
        {activeInvestigation ? (
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-blue-950/60 border border-blue-800/60 text-blue-300">
            <span className="font-semibold">{activeInvestigation.case_number}</span>
            <span className="text-blue-400/50">•</span>
            <span className="truncate max-w-[200px]">{activeInvestigation.title}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-blue-900/80 text-blue-200">
              {activeInvestigation.status || 'OPEN'}
            </span>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>Demo Mode (Synthetic Records)</span>
          </div>
        )}
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenModal}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1.5 rounded transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Investigation</span>
        </button>

        {activeInvestigation && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete current investigation"
            className="flex items-center gap-1 bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-800 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh investigations list"
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* New Investigation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-2xl w-full max-w-md p-5 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-100">
                <FolderOpen className="w-4 h-4 text-blue-400" />
                <span>Create New Investigation</span>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 rounded bg-red-950/50 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Case Reference Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CAS-2026-101"
                  value={formData.case_number}
                  onChange={(e) => setFormData({ ...formData, case_number: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Investigation Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operation Syndicate Blackout"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description / Context</label>
                <textarea
                  rows="3"
                  placeholder="Summary of case details, target syndicates, or intelligence objectives..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="OPEN">OPEN (Active Investigation)</option>
                  <option value="IN_PROGRESS">IN_PROGRESS (Under Review)</option>
                  <option value="CLOSED">CLOSED (Resolved)</option>
                  <option value="ARCHIVED">ARCHIVED (Stored)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Create Investigation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
