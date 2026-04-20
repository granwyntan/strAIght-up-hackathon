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
  progressPercent: number;
  truthClassification: string;
  discoveredDomains: string[];
  resolvedMode: "auto" | "offline" | "live" | null;
  cacheStatus: "live" | "cached" | "fallback";
  orchestrationNotes: string[];
  expertInsight: string;
  aiSummary: string;
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
  lime: "#E8F1EC",
  aqua: "#DDEBE3",
  blue: "#477DB3",
  red: "#B34C43",
  green: "#3D695C",
  background: "#F7FAF8",
  surface: "#ffffff",
  surfaceSoft: "#F1F6F3",
  surfaceMuted: "#E8EFEA",
  border: "#D8E2DC",
  ink: "#18231d",
  muted: "#617068",
  primary: "#3D695C",
  primarySoft: "#E6F0EB",
  secondary: "#6D877C",
  text: "#18231d",
  success: "#2F7D5C",
  successSoft: "#E8F4EE",
  warning: "#477DB3",
  warningSoft: "#EAF2FB",
  danger: "#B34C43",
  dangerSoft: "#F8E9E7",
  pin: "#C8A92D",
  pinSoft: "#FFF6D8"
};

export const defaultBootstrap: BootstrapPayload = {
  brand: {
    name: "GramWIN",
    tagline: "Health and Wellness at your fingertips",
    accent: ["#3D695C", "#D3E9A4", "#BED6C8", "#A35A4F"]
  },
  featuredClaims: [
    {
      id: "c1",
      claim: "A short video says magnesium glycinate cures insomnia within a week for most adults.",
      whyItIsInteresting: "It mixes a common supplement topic with very strong cure language."
    },
    {
      id: "c2",
      claim: "A wellness post says gut health supplements can fix eczema flare-ups in adults.",
      whyItIsInteresting: "It turns a plausible mechanism story into a much stronger clinical promise."
    },
    {
      id: "c3",
      claim: "A reel says drinking more water is automatically healthy and better than other beverages.",
      whyItIsInteresting: "It sounds reasonable, but still needs wording checks and real evidence context."
    }
  ],
  architecture: [
    {
      id: "a1",
      title: "Claim Analyst · Medical Doctor",
      summary: "Reads the full claim as one meaning-preserving health statement and checks whether the wording clinically overreaches."
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
      summary: "Turns the technical review into plain-language guidance without burying the user in jargon."
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
