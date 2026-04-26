import type { FeaturedClaim, InvestigationDetail, InvestigationSummary, BootstrapPayload } from "../../data";

export type HistorySort = "manual" | "recent" | "oldest" | "score" | "lowestScore";
export type HistoryFilter =
  | "all"
  | "trustworthy"
  | "uncertain"
  | "untrustworthy"
  | "pinned"
  | "running"
  | "completed"
  | "deep"
  | "highConfidence";
export type ConsultantView = "investigate" | "history";
export type ProfileView = "overview" | "settings";
export type MaterialIconName = string;
export type ReviewDepth = "quick" | "standard" | "deep";
export type SnackbarAction = "retry" | "undoDelete" | "setupProfile";

export type InvestigationComparison = {
  compatible: boolean;
  similarityScore: number;
  sameClaim: boolean;
  summary: string;
  shortSnippet: string;
  detail: string;
  notableDifferences: string[];
  axes: Array<{
    label: string;
    summary: string;
  }>;
};

export type LocalHealthGuard = {
  allowed: boolean;
  title: string;
  body: string;
};

export type ClaimSuggestionCollection = {
  items: string[];
};

export type ConsultantPageProps = {
  bootstrap: BootstrapPayload;
  consultantView: ConsultantView;
  claimDraft: string;
  contextDraft: string;
  claimSourceDraft: string;
  populationDraft: string;
  focusDraft: string;
  sourceUrlDraft: string;
  depth: ReviewDepth;
  claimSuggestions: string[];
  suggestionsLoading: boolean;
  healthGuard: LocalHealthGuard;
  submitting: boolean;
  loadingHistory: boolean;
  loadingSelected: boolean;
  history: InvestigationSummary[];
  pinnedIds: string[];
  historySort: HistorySort;
  historyFilter: HistoryFilter;
  historyQuery: string;
  comparisonIds: string[];
  comparisonItems: InvestigationSummary[];
  comparisonResult: InvestigationComparison | null;
  comparisonLoading: boolean;
  cancellingIds: string[];
  liveInvestigation: InvestigationDetail | null;
  styles: any;
  helpers: any;
  onClaimChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onClaimSourceChange: (value: string) => void;
  onPopulationChange: (value: string) => void;
  onFocusChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onDepthChange: (value: ReviewDepth) => void;
  onSubmit: () => void;
  onOpenHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onCancelInvestigation: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onRunComparison: () => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onSortChange: (value: HistorySort) => void;
  onFilterChange: (value: HistoryFilter) => void;
  onHistoryQueryChange: (value: string) => void;
  onConsultantViewChange: (value: ConsultantView) => void;
  onUseClaim: (item: FeaturedClaim) => void;
  onClearHistory: () => void;
};
