export type AppTab = "home" | "consultant" | "diet" | "activity" | "profile";
export type InvestigationStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ClaimVerdict = "trustworthy" | "mixed" | "overstated" | "untrustworthy";
export type SourceSentiment = "positive" | "neutral" | "negative";
export type ConfidenceLevel = "low" | "medium" | "high";
export type MisinformationRisk = "low" | "moderate" | "high";
export type SourceQualityLabel = "verified" | "established" | "general";
export type QuoteStance = "supportive" | "uncertain" | "unsupportive";

export interface BrandInfo {
  name: string;
  tagline: string;
  accent: string[];
}

export interface FeaturedClaim {
  id: string;
  claim: string;
  whyItIsInteresting: string;
}

export interface ArchitectureBlock {
  id: string;
  title: string;
  summary: string;
}

export interface StackLibrary {
  id: string;
  name: string;
  category: string;
  whyItHelps: string;
  adoptionNote: string;
}

export interface BootstrapPayload {
  brand: BrandInfo;
  featuredClaims: FeaturedClaim[];
  architecture: ArchitectureBlock[];
  suggestedLibraries: StackLibrary[];
  storageNote: string;
}

export interface InvestigationCreateRequest {
  claim: string;
  context: string;
  sourceUrls: string[];
  mode: "auto" | "offline" | "live";
  desiredDepth: "quick" | "standard" | "deep";
}

export interface ClaimAnalysis {
  claimType: string;
  summary: string;
  focusTerms: string[];
  redFlags: string[];
  languageRiskScore: number;
  languageLabel: string;
  generatedQueries: string[];
  atomicClaims: AtomicClaim[];
  semantics: ClaimSemantics | null;
  nlpEntities: string[];
  claimDomain: string;
}

export interface AtomicClaim {
  text: string;
  strength: number;
  rationale: string;
}

export interface ClaimSemantics {
  subject: string;
  intervention: string;
  action: string;
  outcome: string;
  impliedCausation: boolean;
  relationshipType: "causal" | "correlational" | "opinion";
  strength: number;
}

export interface CitationAssessment {
  title: string;
  url: string;
  sourceBucket: string;
  evidenceTier: string;
  stance: string;
  broken: boolean;
}

export interface ClaimGraphNode {
  id: string;
  text: string;
  claimType: "factual" | "statistical" | "causal" | "opinion";
  importanceWeight: number;
  entities: string[];
}

export interface SourceRegistryEntry {
  sourceId: string;
  title: string;
  domain: string;
  provider: string;
  discoveredUrl: string;
  resolvedUrl: string;
  evidenceUrl: string;
  linkAlive: boolean;
  contentAccessible: boolean;
  httpStatusCode: number | null;
  quoteVerified: boolean;
  directEvidenceEligible: boolean;
  sourceQualityLabel: SourceQualityLabel;
}

export interface EvidenceGraphNode {
  id: string;
  claimId: string;
  sourceId: string;
  stance: QuoteStance;
  quote: string;
  quoteVerified: boolean;
  directEvidenceEligible: boolean;
  evidenceUrl: string;
  credibilityScore: number;
}

export interface SourceAssessment {
  id: string;
  title: string;
  url: string;
  discoveredUrl: string;
  resolvedUrl: string;
  evidenceUrl: string;
  domain: string;
  publishedAt: string | null;
  author: string;
  sourceName: string;
  query: string;
  sourceProvider: string;
  snippet: string;
  sourceBucket: string;
  sourceScore: number;
  journalType: string;
  evidenceTier: string;
  evidenceScore: number;
  stance: string;
  sentiment: SourceSentiment;
  relevanceSummary: string;
  relevanceCheckSummary: string;
  relevanceScore: number;
  sentimentSummary: string;
  methodologyInsights: string[];
  biasNotes: string[];
  citationIntegrity: number;
  notes: string[];
  citations: CitationAssessment[];
  linkAlive: boolean;
  contentAccessible: boolean;
  httpStatusCode: number | null;
  contentType: string;
  fetchRedirected: boolean;
  extractedText: string;
  semanticSimilarity: number;
  directEvidenceEligible: boolean;
  linkValidationSummary: string;
  quoteVerified: boolean;
  quoteStance: QuoteStance;
  sentimentScientific: SourceSentiment | null;
  sentimentCritical: SourceSentiment | null;
  agreementFactor: number;
  clarityFactor: number;
  studyQualityFactor: number;
  confidenceFactor: number;
  sourceWeight: number;
  weightedContribution: number;
  cacheStatus: "live" | "cached" | "fallback";
  sourceQualityLabel: SourceQualityLabel;
  sourceQualityReason: string;
  spamRiskScore: number;
  credibilityNotes: string[];
  evidence: EvidenceExtraction | null;
}

export interface EvidenceExtraction {
  conclusion: string;
  studyType: string;
  sampleSize: string;
  limitations: string[];
  effectDirection: "support" | "neutral" | "contradict";
  quotedEvidence: string;
  quoteVerified: boolean;
  quoteStance: QuoteStance;
  expertAnalysis: string;
}

export interface DecisionMatrixFactor {
  name: string;
  score: number;
  weight: number;
  rationale: string;
}

export interface AgentRun {
  id: string;
  agentKey: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  summary: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface ProgressEvent {
  id: string;
  agentKey: string;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: string;
}

export interface PipelineStepSummary {
  key: string;
  title: string;
  role: string;
  goal: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  summary: string;
  details: string[];
}

export interface ProviderReviewSummary {
  provider: "openai" | "claude" | "gemini" | "xai" | "deepseek";
  model: string;
  role: string;
  verdict: ClaimVerdict;
  confidence: number;
  scoreAdjustment: number;
  rationale: string;
  strengths: string[];
  concerns: string[];
  hallucinationFlags: string[];
}

export interface HoaxSignal {
  label: string;
  severity: "low" | "moderate" | "high";
  rationale: string;
}

export interface SingaporeAuthorityReview {
  totalSources: number;
  supportiveCount: number;
  neutralCount: number;
  contradictoryCount: number;
  agreementLabel: "supportive" | "mixed" | "contradictory" | "insufficient";
  summary: string;
  keyPoints: string[];
  domains: string[];
  sourceIds: string[];
}

export interface ProfilePersonalizationReview {
  relevanceLabel: "high" | "medium" | "low" | "not_available";
  summary: string;
  keyPoints: string[];
  alerts: string[];
}

export interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
  positivePct: number;
  neutralPct: number;
  negativePct: number;
  summary: string;
}

export interface ConsensusBreakdown {
  supportingWeight: number;
  neutralWeight: number;
  contradictingWeight: number;
  disagreementWeight: number;
  rawScore: number;
  totalWeight: number;
  supportShare: number;
  contradictionShare: number;
  credibilityScore: number;
  normalizedScore: number;
  summary: string;
}

export interface EvidenceGroup {
  key: string;
  title: string;
  summary: string;
  sources: SourceAssessment[];
}

export interface InvestigationSummary {
  id: string;
  claim: string;
  context: string;
  status: InvestigationStatus;
  mode: "auto" | "offline" | "live";
  desiredDepth: "quick" | "standard" | "deep";
  createdAt: string;
  updatedAt: string;
  overallScore: number | null;
  verdict: ClaimVerdict | null;
  confidenceLevel: ConfidenceLevel | null;
  truthClassification: string;
  sourceCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  summary: string;
}

export interface InvestigationDetail extends InvestigationSummary {
  claimAnalysis: ClaimAnalysis | null;
  claimGraph: ClaimGraphNode[];
  evidenceGraph: EvidenceGraphNode[];
  sourceRegistry: SourceRegistryEntry[];
  recommendedQueries: string[];
  sources: SourceAssessment[];
  sourceGroups: EvidenceGroup[];
  stepSummaries: PipelineStepSummary[];
  providerReviews: ProviderReviewSummary[];
  hoaxSignals: HoaxSignal[];
  profilePersonalizationReview: ProfilePersonalizationReview | null;
  singaporeAuthorityReview: SingaporeAuthorityReview | null;
  sentiment: SentimentDistribution | null;
  consensus: ConsensusBreakdown | null;
  matrix: DecisionMatrixFactor[];
  confidenceLevel: ConfidenceLevel | null;
  llmAgreementScore: number | null;
  misinformationRisk: MisinformationRisk | null;
  progressPercent: number;
  truthClassification: string;
  discoveredDomains: string[];
  resolvedMode: "auto" | "offline" | "live" | null;
  cacheStatus: "live" | "cached" | "fallback";
  orchestrationNotes: string[];
  expertInsight: string;
  aiSummary: string;
  eli15Summary: string;
  verdictSummary: string;
  finalNarrative: string;
  evidenceBreakdown: string[];
  keyFindings: string[];
  contradictions: string[];
  methodology: string[];
  strengths: string[];
  concerns: string[];
  agentRuns: AgentRun[];
  progressEvents: ProgressEvent[];
}

export interface InvestigationCollection {
  items: InvestigationSummary[];
}

export const palette = {
  lime: "#EEF5F1",
  aqua: "#EAF0F6",
  blue: "#5E7EA7",
  red: "#C25747",
  green: "#1E7A5F",
  background: "#F7F8F5",
  surface: "#FFFFFF",
  surfaceSoft: "#FBFBF8",
  surfaceMuted: "#F1F3EE",
  border: "rgba(16, 24, 40, 0.07)",
  ink: "#101828",
  muted: "#667085",
  primary: "#28554A",
  primarySoft: "#EDF4F0",
  secondary: "#7A8478",
  text: "#101828",
  success: "#1E7A5F",
  successSoft: "#E7F5EF",
  warning: "#7B8CA4",
  warningSoft: "#EFF3F8",
  danger: "#C25747",
  dangerSoft: "#FBECE9",
  pin: "#C49A37",
  pinSoft: "#FFF5D9"
};

export const defaultBootstrap: BootstrapPayload = {
  brand: {
    name: "GramWIN",
    tagline: "Health and Wellness at your fingertips",
    accent: ["#3D695C", "#6D877C", "#DDEBE3", "#E6F0EB"]
  },
  featuredClaims: [],
  architecture: [
    {
      id: "a1",
      title: "Investigation Brief Agent · Truth Guard",
      summary: "Frames the run around falsification, contradiction evidence, and misinformation risk before any search results arrive."
    },
    {
      id: "a2",
      title: "NLP Claim Scan Agent · Clinical Linguist",
      summary: "Uses NLP Cloud to extract entities, relationship type, domain, and wording strength before the deeper reasoning stages."
    },
    {
      id: "a3",
      title: "Claim Framing Agent · Medical Doctor",
      summary: "Preserves the actual meaning of the claim, separates hype from semantics, and sets up the search questions."
    },
    {
      id: "a4",
      title: "Query Planning Agent · Research Librarian",
      summary: "Builds search paths that look for support, contradiction, limitations, and hoax-style mismatch instead of only supportive content."
    },
    {
      id: "a5",
      title: "Evidence Retrieval Agent · Scientist",
      summary: "Pulls candidate evidence from Tavily, SerpAPI, manual URLs, and known authority sources at deep-review scale."
    },
    {
      id: "a6",
      title: "Link Validation Agent · Data Engineer",
      summary: "Checks dead links, extracts readable content, and rescues only credible excerpts when direct fetching fails."
    },
    {
      id: "a7",
      title: "Credibility Audit Agent · Quality Auditor",
      summary: "Downgrades promotional domains, spammy pages, weak authority signals, and fragile source credibility."
    },
    {
      id: "a8",
      title: "Study & Citation Audit Agent · Epidemiologist",
      summary: "Classifies study design, checks citation integrity, and penalizes weak or broken reference chains."
    },
    {
      id: "a9",
      title: "Quote & Stance Agent · Evidence Interpreter",
      summary: "Verifies exact highlights and classifies each source or quote as supportive, uncertain, or unsupportive."
    },
    {
      id: "a10",
      title: "Hoax Detection Agent · Misinformation Analyst",
      summary: "Scans for fabricated-health patterns, evidence mismatch, and claims that behave more like hoaxes than facts."
    },
    {
      id: "a11",
      title: "Decision Engine Agent · Statistician",
      summary: "Builds the weighted evidence score using source quality, contradiction pressure, citation strength, and wording discipline."
    },
    {
      id: "a12",
      title: "Cross-Model Review Agent · Fact-Check Panel",
      summary: "Has OpenAI, Claude, Gemini, Grok, and DeepSeek challenge the evidence set, then audits that panel for hallucinations."
    },
    {
      id: "a13",
      title: "Summary Synthesis Agent · Consultant Doctor",
      summary: "Uses Gemini-first writing with fallback and verification to produce short, simple, and detailed explanations."
    }
  ],
  suggestedLibraries: [
    {
      id: "l1",
      name: "TanStack Query",
      category: "Caching",
      whyItHelps: "Reliable data fetching, caching, and background refresh.",
      adoptionNote: "Best next frontend upgrade."
    },
    {
      id: "l2",
      name: "Zustand",
      category: "State",
      whyItHelps: "Simple global state for tabs, filters, and result preferences.",
      adoptionNote: "Keeps the app clean as screens grow."
    },
    {
      id: "l3",
      name: "NLP Cloud",
      category: "NLP",
      whyItHelps: "Semantic parsing, entity extraction, and text classification for claim understanding.",
      adoptionNote: "Best added with guarded fallbacks."
    },
    {
      id: "l4",
      name: "react-native-paper",
      category: "UI",
      whyItHelps: "Production-grade components with polished mobile defaults.",
      adoptionNote: "Good fit for the next design pass."
    },
    {
      id: "l5",
      name: "react-native-reanimated",
      category: "Motion",
      whyItHelps: "Smooth swipes, expansions, and bottom-sheet motion.",
      adoptionNote: "Recommended for premium interactions."
    },
    {
      id: "l6",
      name: "AsyncStorage",
      category: "Offline cache",
      whyItHelps: "Keeps lightweight result data available when connections wobble.",
      adoptionNote: "Helpful for mobile resilience."
    }
  ],
  storageNote: "Saved investigations and progress updates are stored locally so history survives app restarts."
};

export const defaultHistory: InvestigationSummary[] = [];
