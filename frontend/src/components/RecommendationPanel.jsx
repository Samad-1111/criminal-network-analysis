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
        bg: 'bg-semantic-red-light text-semantic-red border-red-200',
        dot: 'bg-semantic-red',
      };
    case 'HIGH':
      return {
        bg: 'bg-semantic-amber-light text-semantic-amber border-amber-200',
        dot: 'bg-semantic-amber',
      };
    case 'MEDIUM':
      return {
        bg: 'bg-accent-blue-light text-accent-blue border-blue-200',
        dot: 'bg-accent-blue',
      };
    case 'LOW':
    default:
      return {
        bg: 'bg-cream text-warm-gray border-border',
        dot: 'bg-muted-gray',
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
    <aside className="w-96 border-l border-border bg-cream flex flex-col shrink-0 h-full select-none">
      {/* Panel Top Header */}
      <div className="h-10 px-4 border-b border-border bg-cream flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-charcoal font-medium">
          <Target className="w-3.5 h-3.5 text-accent-red" />
          <span className="uppercase tracking-wider text-[10px] font-semibold" style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', textTransform: 'none', letterSpacing: 'normal' }}>Next-Best-Actions</span>
          {totalCount > 0 && !loading && !error && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-accent-red-light text-accent-red text-[10px] font-mono border border-red-200 font-semibold">
              {totalCount} leads
            </span>
          )}
          {isLiveMode && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-semantic-green-light text-semantic-green border border-green-200">
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
              className="p-1 rounded hover:bg-parchment text-warm-gray hover:text-charcoal transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <div className="flex items-center gap-1.5 text-xs text-warm-gray font-mono">
            <ListFilter className="w-3.5 h-3.5 text-muted-gray" />
            <span className="text-[10px]">Ranked</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* Loading State */}
        {loading && (
          <div className="h-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-6 h-6 border-2 border-border-strong border-t-accent-red rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-medium text-charcoal">
              {isLiveMode ? 'Analysing investigation evidence…' : 'Generating Next-Best-Actions...'}
            </p>
            <p className="text-[11px] text-warm-gray mt-1">
              {isLiveMode
                ? 'Loading real entities, relationships & network metrics'
                : 'Evaluating evidence strength and network centrality'}
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-4 rounded-lg bg-semantic-red-light border border-red-200 text-center my-6">
            <div className="w-9 h-9 rounded-md bg-white border border-red-200 mx-auto flex items-center justify-center text-semantic-red mb-2">
              <AlertTriangle className="w-4 h-4 stroke-[1.5]" />
            </div>
            <h4 className="text-xs font-semibold text-charcoal">
              Failed to load recommendations
            </h4>
            <p className="text-[11px] text-warm-gray mt-1 mb-3 font-mono bg-cream p-1.5 rounded border border-border">
              {error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-red hover:bg-red-800 text-white text-xs font-medium cursor-pointer transition-colors"
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
            <div className="w-10 h-10 rounded-lg bg-cream border border-border mx-auto flex items-center justify-center text-warm-gray mb-3">
              <Info className="w-5 h-5 stroke-[1.5]" />
            </div>
            <h4 className="text-xs font-semibold text-charcoal">
              No recommendations available
            </h4>
            <p className="text-[11px] text-warm-gray mt-1 max-w-xs">
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
                  ? 'bg-accent-red-light border-accent-red/40 ring-1 ring-accent-red/20'
                  : isTopRank
                  ? 'bg-warm-white border-accent-blue/30 ring-1 ring-accent-blue/10 hover:border-accent-blue/50'
                  : 'bg-warm-white border-border hover:border-border-strong hover:bg-ivory'
              }`}
            >
              {/* Card Header: Rank, Type & Score */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Rank Badge */}
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                    isTopRank 
                      ? 'bg-accent-red text-white' 
                      : 'bg-cream text-charcoal border border-border'
                  }`}>
                    #{rank}
                  </span>

                  {/* Priority Level Badge */}
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                    {rec.priority_level}
                  </span>

                  {/* Action Type Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-cream text-warm-gray font-medium border border-border">
                    {formatActionType(rec.action_type)}
                  </span>
                </div>

                {/* Priority Score */}
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-charcoal">
                    {typeof rec.priority_score === 'number' ? rec.priority_score.toFixed(1) : rec.priority_score}
                  </span>
                  <span className="text-[9px] text-muted-gray block font-mono uppercase tracking-wider">Score</span>
                </div>
              </div>

              {/* Primary Target Entity & Title */}
              <div className="mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-charcoal">
                  <User className="w-3.5 h-3.5 text-accent-red shrink-0" />
                  <span className="truncate">{primaryEntity}</span>
                </div>
                <p className="text-[11px] text-warm-gray mt-0.5 leading-snug line-clamp-2">
                  {rec.title}
                </p>
              </div>

              {/* Core Reason Text */}
              <p className="text-[11px] text-charcoal/80 bg-cream p-2 rounded border border-border leading-relaxed mb-2.5">
                {primaryReason}
              </p>

              {/* Evidence & Context Footer */}
              <div className="flex items-center justify-between text-[10px] text-warm-gray font-mono pt-1.5 border-t border-border">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Share2 className="w-3 h-3 text-muted-gray" />
                    <span>{connectionCount} {connectionCount === 1 ? 'conn' : 'conns'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3 text-muted-gray" />
                    <span>{recordCount} {recordCount === 1 ? 'record' : 'records'}</span>
                  </span>
                </div>

                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-accent-red font-semibold">
                    <MapPin className="w-3 h-3" />
                    <span>Locate in graph</span>
                  </span>
                ) : rec.recommendation_id && (
                  <span className="text-muted-gray">
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
