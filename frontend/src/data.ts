export type AppTab = "home" | "consultant" | "nutrition" | "supplements" | "profile";
export type InvestigationStatus = "queued" | "running" | "completed" | "failed";
export type ClaimVerdict = "trustworthy" | "mixed" | "overstated" | "untrustworthy";
export type SourceSentiment = "positive" | "neutral" | "negative";
export type ConfidenceLevel = "low" | "medium" | "high";
export type MisinformationRisk = "low" | "moderate" | "high";

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
  desiredDepth: "standard" | "deep";
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

export interface SourceAssessment {
  id: string;
  title: string;
  url: string;
  domain: string;
  sourceName: string;
  query: string;
  snippet: string;
  sourceBucket: string;
  sourceScore: number;
  journalType: string;
  evidenceTier: string;
  evidenceScore: number;
  stance: string;
  sentiment: SourceSentiment;
  relevanceSummary: string;
  sentimentSummary: string;
  methodologyInsights: string[];
  biasNotes: string[];
  citationIntegrity: number;
  notes: string[];
  citations: CitationAssessment[];
  linkAlive: boolean;
  contentAccessible: boolean;
  extractedText: string;
  quoteVerified: boolean;
  sentimentScientific: SourceSentiment | null;
  sentimentCritical: SourceSentiment | null;
  agreementFactor: number;
  clarityFactor: number;
  studyQualityFactor: number;
  confidenceFactor: number;
  sourceWeight: number;
  weightedContribution: number;
  cacheStatus: "live" | "cached" | "fallback";
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
  status: "pending" | "running" | "completed" | "failed";
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
  status: "pending" | "running" | "completed" | "failed";
  summary: string;
  details: string[];
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
  desiredDepth: "standard" | "deep";
  createdAt: string;
  updatedAt: string;
  overallScore: number | null;
  verdict: ClaimVerdict | null;
  summary: string;
}

export interface InvestigationDetail extends InvestigationSummary {
  claimAnalysis: ClaimAnalysis | null;
  recommendedQueries: string[];
  sources: SourceAssessment[];
  sourceGroups: EvidenceGroup[];
  stepSummaries: PipelineStepSummary[];
  sentiment: SentimentDistribution | null;
  consensus: ConsensusBreakdown | null;
  matrix: DecisionMatrixFactor[];
  confidenceLevel: ConfidenceLevel | null;
  llmAgreementScore: number | null;
  misinformationRisk: MisinformationRisk | null;
  resolvedMode: "auto" | "offline" | "live" | null;
  cacheStatus: "live" | "cached" | "fallback";
  orchestrationNotes: string[];
  expertInsight: string;
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
  lime: "#b9ec83",
  aqua: "#7fd5e6",
  blue: "#164a93",
  red: "#cc3b3f",
  green: "#5f895a",
  background: "#f5f1ea",
  surface: "#fffdfa",
  surfaceSoft: "#f1ebe1",
  border: "#e6dfd3",
  ink: "#172a57",
  muted: "#6d736d"
};

export const defaultBootstrap: BootstrapPayload = {
  brand: {
    name: "GramWIN",
    tagline: "Health and Wellness at your fingertips",
    accent: ["#b9ec83", "#7fd5e6", "#164a93", "#cc3b3f"]
  },
  featuredClaims: [
    {
      id: "c1",
      claim: "Magnesium glycinate will cure insomnia",
      whyItIsInteresting: "Strong certainty language over a nuanced supplement topic."
    },
    {
      id: "c2",
      claim: "Gut health supplements can fix eczema",
      whyItIsInteresting: "Crosses from mechanism to condition outcome very quickly."
    },
    {
      id: "c3",
      claim: "Apple cider vinegar burns fat fast",
      whyItIsInteresting: "Classic viral claim with weak evidence and strong marketing."
    }
  ],
  architecture: [
    {
      id: "a1",
      title: "Claim Analyst · Medical Doctor",
      summary: "Understands the claim semantically as one meaning-preserving health assertion and checks whether the clinical wording overreaches."
    },
    {
      id: "a2",
      title: "Research Agent · Scientist",
      summary: "Uses broad and deep retrieval paths to gather studies, reviews, guidelines, and contradiction-seeking evidence."
    },
    {
      id: "a3",
      title: "Validation Agent · Data Engineer",
      summary: "Keeps only accessible links with readable content so dead or empty sources never reach the result."
    },
    {
      id: "a4",
      title: "Stance Agent · Epidemiologist",
      summary: "Interprets whether each source supports, contradicts, or stays uncertain based on actual evidence quality."
    },
    {
      id: "a5",
      title: "Consensus Agent · Statistician",
      summary: "Combines evidence quality, contradiction pressure, and agreement into the final credibility score."
    },
    {
      id: "a6",
      title: "Verifier Agent · Auditor",
      summary: "Checks quotes, contradictions, and model mismatches before the result is allowed to settle."
    },
    {
      id: "a7",
      title: "Summary Agent · Health Communicator",
      summary: "Turns the technical review into plain-language evidence guidance without medical jargon."
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
  storageNote: "SQLite persists investigations, stage runs, and progress logs so work survives restarts."
};

export const defaultHistory: InvestigationSummary[] = [];
