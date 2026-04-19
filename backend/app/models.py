from typing import Literal

from pydantic import BaseModel, Field


InvestigationStatus = Literal["queued", "running", "completed", "failed"]
AgentStatus = Literal["pending", "running", "completed", "failed"]
InvestigationMode = Literal["auto", "offline", "live"]
DesiredDepth = Literal["standard", "deep"]
ClaimVerdict = Literal["trustworthy", "mixed", "overstated", "untrustworthy"]
SourceStance = Literal["supportive", "mixed", "contradictory", "unclear"]
SourceBucket = Literal["tier_1_blog", "tier_2_scholarly", "tier_3_authority"]
EvidenceTier = Literal["review", "rct", "observational", "case_report", "blog"]
SourceSentiment = Literal["positive", "neutral", "negative"]
ConfidenceLevel = Literal["low", "medium", "high"]
EffectDirection = Literal["support", "neutral", "contradict"]
MisinformationRisk = Literal["low", "moderate", "high"]
CacheStatus = Literal["live", "cached", "fallback"]


class BrandInfo(BaseModel):
    name: str
    tagline: str
    accent: list[str]


class FeaturedClaim(BaseModel):
    id: str
    claim: str
    whyItIsInteresting: str


class ArchitectureBlock(BaseModel):
    id: str
    title: str
    summary: str


class StackLibrary(BaseModel):
    id: str
    name: str
    category: str
    whyItHelps: str
    adoptionNote: str


class BootstrapPayload(BaseModel):
    brand: BrandInfo
    featuredClaims: list[FeaturedClaim]
    architecture: list[ArchitectureBlock]
    suggestedLibraries: list[StackLibrary]
    storageNote: str


class InvestigationCreateRequest(BaseModel):
    claim: str = Field(min_length=5, max_length=800)
    context: str = Field(default="", max_length=2000)
    sourceUrls: list[str] = Field(default_factory=list)
    mode: InvestigationMode = "auto"
    desiredDepth: DesiredDepth = "standard"


class ProgressEvent(BaseModel):
    id: str
    agentKey: str
    level: Literal["info", "warning", "error"] = "info"
    message: str
    createdAt: str


class AgentRun(BaseModel):
    id: str
    agentKey: str
    title: str
    status: AgentStatus
    summary: str = ""
    startedAt: str
    finishedAt: str | None = None


class ClaimAnalysis(BaseModel):
    claimType: str
    summary: str
    focusTerms: list[str]
    redFlags: list[str]
    languageRiskScore: int = Field(ge=0, le=100)
    languageLabel: str
    generatedQueries: list[str]
    atomicClaims: list["AtomicClaim"] = Field(default_factory=list)
    semantics: "ClaimSemantics | None" = None


class AtomicClaim(BaseModel):
    text: str
    strength: int = Field(ge=1, le=5)
    rationale: str = ""


class ClaimSemantics(BaseModel):
    subject: str = ""
    intervention: str = ""
    action: str = ""
    outcome: str = ""
    impliedCausation: bool = False
    relationshipType: Literal["causal", "correlational", "opinion"] = "correlational"
    strength: int = Field(default=1, ge=1, le=5)


class CitationAssessment(BaseModel):
    title: str
    url: str
    sourceBucket: SourceBucket
    evidenceTier: EvidenceTier
    stance: SourceStance
    broken: bool = False


class EvidenceExtraction(BaseModel):
    conclusion: str = ""
    studyType: str = ""
    sampleSize: str = ""
    limitations: list[str] = Field(default_factory=list)
    effectDirection: EffectDirection = "neutral"
    quotedEvidence: str = ""
    quoteVerified: bool = False
    expertAnalysis: str = ""


class SourceAssessment(BaseModel):
    id: str
    title: str
    url: str
    domain: str
    sourceName: str = ""
    query: str
    snippet: str
    sourceBucket: SourceBucket
    sourceScore: int = Field(ge=1, le=3)
    journalType: str
    evidenceTier: EvidenceTier
    evidenceScore: int = Field(ge=1, le=5)
    stance: SourceStance
    sentiment: SourceSentiment = "neutral"
    relevanceSummary: str = ""
    sentimentSummary: str = ""
    methodologyInsights: list[str] = Field(default_factory=list)
    biasNotes: list[str] = Field(default_factory=list)
    citationIntegrity: int = Field(default=0, ge=0, le=100)
    notes: list[str] = Field(default_factory=list)
    citations: list[CitationAssessment] = Field(default_factory=list)
    linkAlive: bool = True
    contentAccessible: bool = True
    extractedText: str = ""
    quoteVerified: bool = False
    sentimentScientific: SourceSentiment | None = None
    sentimentCritical: SourceSentiment | None = None
    agreementFactor: float = Field(default=1.0, ge=0.0, le=1.0)
    clarityFactor: float = Field(default=0.5, ge=0.5, le=1.0)
    studyQualityFactor: float = Field(default=0.5, ge=0.5, le=1.0)
    confidenceFactor: float = Field(default=0.5, ge=0.5, le=1.0)
    sourceWeight: float = Field(default=0.4, ge=0.0, le=1.0)
    weightedContribution: float = 0.0
    cacheStatus: CacheStatus = "live"
    evidence: EvidenceExtraction | None = None


class DecisionMatrixFactor(BaseModel):
    name: str
    score: int = Field(ge=0, le=100)
    weight: float = Field(gt=0, le=1)
    rationale: str


class PipelineStepSummary(BaseModel):
    key: str
    title: str
    status: AgentStatus
    summary: str
    details: list[str] = Field(default_factory=list)


class SentimentDistribution(BaseModel):
    positive: int = 0
    neutral: int = 0
    negative: int = 0
    positivePct: int = 0
    neutralPct: int = 0
    negativePct: int = 0
    summary: str = ""


class ConsensusBreakdown(BaseModel):
    supportingWeight: float = 0.0
    neutralWeight: float = 0.0
    contradictingWeight: float = 0.0
    disagreementWeight: float = 0.0
    rawScore: float = 0.0
    totalWeight: float = 0.0
    supportShare: float = 0.0
    contradictionShare: float = 0.0
    credibilityScore: int = Field(default=50, ge=0, le=100)
    normalizedScore: int = Field(default=50, ge=0, le=100)
    summary: str = ""


class EvidenceGroup(BaseModel):
    key: str
    title: str
    summary: str
    sources: list[SourceAssessment] = Field(default_factory=list)


class InvestigationState(BaseModel):
    claimAnalysis: ClaimAnalysis | None = None
    recommendedQueries: list[str] = Field(default_factory=list)
    sources: list[SourceAssessment] = Field(default_factory=list)
    sourceGroups: list[EvidenceGroup] = Field(default_factory=list)
    stepSummaries: list[PipelineStepSummary] = Field(default_factory=list)
    sentiment: SentimentDistribution | None = None
    consensus: ConsensusBreakdown | None = None
    matrix: list[DecisionMatrixFactor] = Field(default_factory=list)
    confidenceLevel: ConfidenceLevel | None = None
    llmAgreementScore: int | None = Field(default=None, ge=0, le=100)
    misinformationRisk: MisinformationRisk | None = None
    resolvedMode: InvestigationMode | None = None
    cacheStatus: CacheStatus = "live"
    orchestrationNotes: list[str] = Field(default_factory=list)
    expertInsight: str = ""
    verdictSummary: str = ""
    finalNarrative: str = ""
    evidenceBreakdown: list[str] = Field(default_factory=list)
    keyFindings: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    methodology: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


class InvestigationSummary(BaseModel):
    id: str
    claim: str
    context: str
    status: InvestigationStatus
    mode: InvestigationMode
    desiredDepth: DesiredDepth
    createdAt: str
    updatedAt: str
    overallScore: int | None = None
    verdict: ClaimVerdict | None = None
    summary: str = ""


class InvestigationDetail(InvestigationSummary):
    claimAnalysis: ClaimAnalysis | None = None
    recommendedQueries: list[str] = Field(default_factory=list)
    sources: list[SourceAssessment] = Field(default_factory=list)
    sourceGroups: list[EvidenceGroup] = Field(default_factory=list)
    stepSummaries: list[PipelineStepSummary] = Field(default_factory=list)
    sentiment: SentimentDistribution | None = None
    consensus: ConsensusBreakdown | None = None
    matrix: list[DecisionMatrixFactor] = Field(default_factory=list)
    confidenceLevel: ConfidenceLevel | None = None
    llmAgreementScore: int | None = Field(default=None, ge=0, le=100)
    misinformationRisk: MisinformationRisk | None = None
    expertInsight: str = ""
    verdictSummary: str = ""
    finalNarrative: str = ""
    evidenceBreakdown: list[str] = Field(default_factory=list)
    keyFindings: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    methodology: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    agentRuns: list[AgentRun] = Field(default_factory=list)
    progressEvents: list[ProgressEvent] = Field(default_factory=list)


class InvestigationCollection(BaseModel):
    items: list[InvestigationSummary]
