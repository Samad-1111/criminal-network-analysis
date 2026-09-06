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
    <div className="bg-cream border-b border-border px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
      {/* Left side: Active Case & Selection */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-medium text-warm-gray">
          <Briefcase className="w-4 h-4 text-accent-red" />
          <span className="hidden sm:inline uppercase tracking-wider text-[10px] font-semibold">Active Case:</span>
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
            className="bg-warm-white border border-border-strong hover:border-warm-gray rounded px-3 py-1.5 text-charcoal font-medium focus:outline-none focus:ring-1 focus:ring-accent-blue cursor-pointer max-w-[280px] sm:max-w-[360px] truncate"
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
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-accent-blue-light border border-blue-200 text-accent-blue">
            <span className="font-semibold font-mono text-[11px]">{activeInvestigation.case_number}</span>
            <span className="text-blue-300">•</span>
            <span className="truncate max-w-[200px] text-[11px]">{activeInvestigation.title}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-blue-100 text-accent-blue font-semibold">
              {activeInvestigation.status || 'OPEN'}
            </span>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-semantic-amber-light border border-amber-200 text-semantic-amber">
            <span className="w-1.5 h-1.5 rounded-full bg-semantic-amber"></span>
            <span className="text-[11px]">Demo Mode (Synthetic Records)</span>
          </div>
        )}
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenModal}
          className="flex items-center gap-1.5 bg-accent-red hover:bg-red-800 text-white font-medium px-3 py-1.5 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Investigation</span>
        </button>

        {activeInvestigation && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete current investigation"
            className="flex items-center gap-1 bg-warm-white hover:bg-semantic-red-light text-warm-gray hover:text-semantic-red border border-border hover:border-red-300 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh investigations list"
          className="p-1.5 rounded bg-warm-white hover:bg-cream text-warm-gray hover:text-charcoal border border-border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* New Investigation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 backdrop-blur-sm p-4">
          <div className="bg-warm-white border border-border-strong rounded-lg shadow-xl w-full max-w-md p-5 text-charcoal">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-charcoal">
                <FolderOpen className="w-4 h-4 text-accent-red" />
                <span>Create New Investigation</span>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-warm-gray hover:text-charcoal p-1 rounded hover:bg-cream"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 rounded bg-semantic-red-light border border-red-200 text-semantic-red text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-semantic-red" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-warm-gray font-medium mb-1">
                  Case Reference Number <span className="text-semantic-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CAS-2026-101"
                  value={formData.case_number}
                  onChange={(e) => setFormData({ ...formData, case_number: e.target.value })}
                  className="w-full bg-ivory border border-border-strong rounded px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-accent-blue font-mono"
                />
              </div>

              <div>
                <label className="block text-warm-gray font-medium mb-1">
                  Investigation Title <span className="text-semantic-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operation Syndicate Blackout"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-ivory border border-border-strong rounded px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>

              <div>
                <label className="block text-warm-gray font-medium mb-1">Description / Context</label>
                <textarea
                  rows="3"
                  placeholder="Summary of case details, target syndicates, or intelligence objectives..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-ivory border border-border-strong rounded px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>

              <div>
                <label className="block text-warm-gray font-medium mb-1">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-ivory border border-border-strong rounded px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-accent-blue cursor-pointer"
                >
                  <option value="OPEN">OPEN (Active Investigation)</option>
                  <option value="IN_PROGRESS">IN_PROGRESS (Under Review)</option>
                  <option value="CLOSED">CLOSED (Resolved)</option>
                  <option value="ARCHIVED">ARCHIVED (Stored)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3 py-1.5 rounded bg-cream hover:bg-parchment text-warm-gray transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-accent-red hover:bg-red-800 text-white font-medium transition-colors disabled:opacity-50"
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
