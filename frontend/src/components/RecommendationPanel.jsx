import React from 'react';
import { 
  Target, 
  ListFilter, 
  Loader2, 
  AlertTriangle, 
  RefreshCw, 
  User, 
  Share2, 
  ShieldAlert, 
  FileText,
  TrendingUp,
  Info,
  MapPin
} from 'lucide-react';

/**
 * Priority badge styling helper
 */
function getPriorityBadge(priorityLevel) {
  switch (priorityLevel) {
    case 'CRITICAL':
      return {
        bg: 'bg-red-950/60 text-red-400 border-red-800/60',
        dot: 'bg-red-500',
      };
    case 'HIGH':
      return {
        bg: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
        dot: 'bg-amber-500',
      };
    case 'MEDIUM':
      return {
        bg: 'bg-blue-950/60 text-blue-400 border-blue-800/60',
        dot: 'bg-blue-500',
      };
    case 'LOW':
    default:
      return {
        bg: 'bg-slate-800/80 text-slate-400 border-slate-700/60',
        dot: 'bg-slate-500',
      };
  }
}

/**
 * Format Action Type display label
 */
function formatActionType(actionType) {
  switch (actionType) {
    case 'REVIEW_NETWORK_CONNECTOR':
      return 'Network Connector';
    case 'INVESTIGATE_HIGH_VALUE_ENTITY':
      return 'High-Value Entity';
    case 'REVIEW_LOW_CONFIDENCE_EVIDENCE':
      return 'Evidence Review';
    case 'VERIFY_AMBIGUOUS_IDENTITY':
      return 'Identity Verification';
    default:
      return actionType ? actionType.replace(/_/g, ' ') : 'Action Lead';
  }
}

export default function RecommendationPanel({
  recommendationsData,
  loading = false,
  error = null,
  onRetry,
  onRefresh,
  selectedEntityId = null,
  onRecommendationClick,
  activeInvestigation = null,
}) {
  const recommendations = recommendationsData?.recommendations || [];
  const totalCount = recommendationsData?.summary?.total_recommendations ?? recommendations.length;
  const isLiveMode = activeInvestigation !== null;

  return (
    <aside className="w-96 border-l border-slate-800 bg-slate-900/95 flex flex-col shrink-0 h-full select-none">
      {/* Panel Top Header */}
      <div className="h-10 px-4 border-b border-slate-800/80 bg-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-200 font-medium">
          <Target className="w-3.5 h-3.5 text-indigo-400" />
          <span>Next-Best-Actions</span>
          {totalCount > 0 && !loading && !error && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-950/70 text-indigo-300 text-[10px] font-mono border border-indigo-800/50">
              {totalCount} leads
            </span>
          )}
          {isLiveMode && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 animate-pulse">
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={loading}
              title="Refresh recommendations"
              className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <ListFilter className="w-3.5 h-3.5 text-slate-500" />
            <span>Ranked</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* Loading State */}
        {loading && (
          <div className="h-full flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mb-3" />
            <p className="text-xs font-medium text-slate-300">
              {isLiveMode ? 'Analysing investigation evidence…' : 'Generating Next-Best-Actions...'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {isLiveMode
                ? 'Loading real entities, relationships & network metrics'
                : 'Evaluating evidence strength and network centrality'}
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-center my-6">
            <div className="w-9 h-9 rounded-md bg-red-950/70 border border-red-800/60 mx-auto flex items-center justify-center text-red-400 mb-2">
              <AlertTriangle className="w-4 h-4 stroke-[1.5]" />
            </div>
            <h4 className="text-xs font-semibold text-slate-200">
              Failed to load recommendations
            </h4>
            <p className="text-[11px] text-slate-400 mt-1 mb-3 font-mono bg-slate-950/80 p-1.5 rounded border border-slate-800">
              {error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer transition-colors shadow-xs"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Analysis</span>
              </button>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && recommendations.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700/60 mx-auto flex items-center justify-center text-slate-500 mb-3 shadow-xs">
              <Info className="w-5 h-5 stroke-[1.5]" />
            </div>
            <h4 className="text-xs font-semibold text-slate-200">
              No recommendations available
            </h4>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
              {isLiveMode
                ? 'Process documents and extract entities in this investigation to generate real recommendations.'
                : 'Add investigation records to generate prioritized decision-support leads.'}
            </p>
          </div>
        )}

        {/* Render Ranked Recommendations */}
        {!loading && !error && recommendations.map((rec) => {
          const rank = rec.investigation_rank || 1;
          const isTopRank = rank === 1;
          const badge = getPriorityBadge(rec.priority_level);
          const primaryEntity = rec.target_entities?.[0]?.label || 'Entity Lead';
          const primaryReason = rec.reasons?.[1] || rec.reasons?.[0] || 'Investigate based on network relevance.';
          const connectionCount = rec.supporting_evidence?.connection_count ?? 0;
          const recordCount = rec.supporting_evidence?.record_ids?.length ?? 0;

          // Phase D: detect whether this card's primary entity is currently selected
          const cardTargetId = rec.target_entities?.[0]?.id ?? null;
          const isActive = cardTargetId !== null && cardTargetId === selectedEntityId;

          return (
            <div
              key={rec.recommendation_id || rank}
              role="button"
              tabIndex={0}
              onClick={() => onRecommendationClick?.(rec)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRecommendationClick?.(rec)}
              className={`p-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-orange-950/30 border-orange-500/70 shadow-[0_0_12px_2px_rgba(249,115,22,0.25)] ring-1 ring-orange-500/40'
                  : isTopRank
                  ? 'bg-slate-900/90 border-blue-500/40 shadow-xs ring-1 ring-blue-500/20 hover:border-blue-400/60'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-600 hover:bg-slate-900/80'
              }`}
            >
              {/* Card Header: Rank, Type & Score */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Rank Badge */}
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                    isTopRank 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}>
                    #{rank}
                  </span>

                  {/* Priority Level Badge */}
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                    {rec.priority_level}
                  </span>

                  {/* Action Type Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800/80 text-slate-400 font-medium border border-slate-700/50">
                    {formatActionType(rec.action_type)}
                  </span>
                </div>

                {/* Priority Score */}
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-slate-100">
                    {typeof rec.priority_score === 'number' ? rec.priority_score.toFixed(1) : rec.priority_score}
                  </span>
                  <span className="text-[9px] text-slate-500 block font-mono">SCORE</span>
                </div>
              </div>

              {/* Primary Target Entity & Title */}
              <div className="mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{primaryEntity}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">
                  {rec.title}
                </p>
              </div>

              {/* Core Reason Text */}
              <p className="text-[11px] text-slate-300/90 bg-slate-950/60 p-2 rounded border border-slate-800/60 leading-relaxed mb-2.5">
                {primaryReason}
              </p>

              {/* Evidence & Context Footer */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1.5 border-t border-slate-800/50">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Share2 className="w-3 h-3 text-slate-500" />
                    <span>{connectionCount} {connectionCount === 1 ? 'conn' : 'conns'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3 text-slate-500" />
                    <span>{recordCount} {recordCount === 1 ? 'record' : 'records'}</span>
                  </span>
                </div>

                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-orange-400 font-semibold">
                    <MapPin className="w-3 h-3" />
                    <span>Locate in graph</span>
                  </span>
                ) : rec.recommendation_id && (
                  <span className="text-slate-500">
                    {rec.recommendation_id}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
