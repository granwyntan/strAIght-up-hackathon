export type AppTab = "home" | "investigate" | "history" | "stack";
export type InvestigationStatus = "queued" | "running" | "completed" | "failed";
export type ClaimVerdict = "trustworthy" | "mixed" | "overstated" | "untrustworthy";
export type SourceSentiment = "positive" | "neutral" | "negative";
export type ConfidenceLevel = "low" | "moderate" | "high";
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
  action: string;
  outcome: string;
  impliedCausation: boolean;
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
      title: "Claim analyzer",
      summary: "Understands the claim semantically as one meaning-preserving health assertion and scores its certainty."
    },
    {
      id: "a2",
      title: "Source scout",
      summary: "Uses SerpAPI for breadth and Tavily for deeper retrieval before ranking candidate evidence."
    },
    {
      id: "a3",
      title: "Source validator",
      summary: "Keeps only accessible links with readable content so dead or empty sources never reach the result."
    },
    {
      id: "a4",
      title: "Quote verifier",
      summary: "Checks that any displayed quote actually exists in the source text before it can be shown."
    },
    {
      id: "a5",
      title: "Decision engine",
      summary: "Combines evidence quality, contradiction pressure, and dual-model agreement into the final score."
    }
  ],
  suggestedLibraries: [
    {
      id: "l1",
      name: "Tavily / SerpAPI",
      category: "Search",
      whyItHelps: "Live web discovery for secondary queries.",
      adoptionNote: "Best first live-search upgrade."
    },
    {
      id: "l2",
      name: "OpenAlex / Crossref / Semantic Scholar",
      category: "Academic graph",
      whyItHelps: "Metadata, citation graph enrichment, and journal lookups.",
      adoptionNote: "Strong next step for evidence depth."
    },
    {
      id: "l3",
      name: "trafilatura",
      category: "Extraction",
      whyItHelps: "Cleaner article text extraction before agent analysis.",
      adoptionNote: "Useful once you move beyond snippets."
    },
    {
      id: "l4",
      name: "OpenAI structured outputs",
      category: "LLM reasoning",
      whyItHelps: "Better query generation and narrative synthesis.",
      adoptionNote: "Optional upgrade on top of this architecture."
    }
  ],
  storageNote: "SQLite persists investigations, stage runs, and progress logs so work survives restarts."
};

export const defaultHistory: InvestigationSummary[] = [];
