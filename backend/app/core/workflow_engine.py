from dataclasses import dataclass

from ..models import ArchitectureBlock, PipelineStepSummary


@dataclass(frozen=True)
class WorkflowStageDefinition:
    key: str
    title: str
    role: str
    summary: str
    goal: str


WORKFLOW_STAGES: tuple[WorkflowStageDefinition, ...] = (
    WorkflowStageDefinition(
        key="briefing",
        title="Orchestrator",
        role="Controller",
        summary="Waiting to frame the review, choose the right depth, and anchor the run to falsification paths.",
        goal="Break the claim into a controlled investigation plan and keep every agent aligned to the same truth-first brief.",
    ),
    WorkflowStageDefinition(
        key="nlp_claim_scan",
        title="Query Analyzer",
        role="Clinical Linguist",
        summary="Waiting to extract entities, relationship type, and wording strength from the claim.",
        goal="Use NLP and semantic parsing to classify the claim, detect overclaiming, and set the evidence difficulty.",
    ),
    WorkflowStageDefinition(
        key="claim_analysis",
        title="Claim Framing",
        role="Medical Reviewer",
        summary="Waiting to interpret the claim as one meaning-preserving medical statement.",
        goal="Preserve the full claim meaning, separate semantics from hype, and expose what would falsify it.",
    ),
    WorkflowStageDefinition(
        key="query_planning",
        title="Planner",
        role="Research Librarian",
        summary="Waiting to build support, contradiction, and hoax-sensitive search paths.",
        goal="Break the claim into sub-questions and generate a research tree that can support, narrow, or falsify it.",
    ),
    WorkflowStageDefinition(
        key="source_retrieval",
        title="Parallel Research",
        role="Web, Deep, and Contrarian Researchers",
        summary="Waiting to search broad web evidence, deeper reasoning paths, and contradiction-heavy angles in parallel.",
        goal="Build a broad, diverse candidate pool from the live web instead of only leaning on pre-weighted authority lists.",
    ),
    WorkflowStageDefinition(
        key="link_validation",
        title="Source Expansion & Validation",
        role="Data Engineer",
        summary="Waiting to expand beyond the first wave of results, remove dead links, and rescue blocked-but-usable evidence.",
        goal="Reach the requested source depth while preserving only live, readable, or clearly rescued evidence excerpts.",
    ),
    WorkflowStageDefinition(
        key="credibility_audit",
        title="Credibility Audit",
        role="Quality Auditor",
        summary="Waiting to score domain authority, spam risk, and source trust signals.",
        goal="Downgrade promotional or weakly sourced material before it affects the conclusion.",
    ),
    WorkflowStageDefinition(
        key="relevance_screen",
        title="Relevance Screen",
        role="Evidence Curator",
        summary="Waiting to keep only evidence that truly addresses the same claim or contradiction path.",
        goal="Prevent adjacent wellness content from pretending to answer the claim.",
    ),
    WorkflowStageDefinition(
        key="study_citation_audit",
        title="Study & Citation Audit",
        role="Epidemiologist",
        summary="Waiting to classify study types and audit citation chains for breakage or weakness.",
        goal="Reward stronger study designs and penalize weak or broken reference trails.",
    ),
    WorkflowStageDefinition(
        key="quote_sentiment_analysis",
        title="Quote & Stance Analysis",
        role="Evidence Interpreter",
        summary="Waiting to verify quotes and classify evidence as supportive, unsupportive, or uncertain.",
        goal="Keep quote highlights exact and make each source's direction explicit.",
    ),
    WorkflowStageDefinition(
        key="singapore_authority_review",
        title="Singapore Authority Review",
        role="Regional Health Authority Analyst",
        summary="Waiting to isolate what Singapore public-health and institutional sources say about the claim.",
        goal="Summarize whether Singapore authority and Singapore institutional sources support, contradict, or stay mixed on the claim.",
    ),
    WorkflowStageDefinition(
        key="hoax_detection",
        title="Hoax Detection",
        role="Misinformation Analyst",
        summary="Waiting to scan for hoax markers, overclaiming patterns, and evidence mismatch.",
        goal="Separate normal uncertainty from signals that a claim behaves like a hoax or fabricated health promise.",
    ),
    WorkflowStageDefinition(
        key="decision_engine",
        title="Decision Engine",
        role="Statistician",
        summary="Waiting to combine weighted evidence, contradiction pressure, and evidence quality into a base score.",
        goal="Produce a calibrated baseline verdict before the cross-model panel pressure-tests it.",
    ),
    WorkflowStageDefinition(
        key="cross_model_review",
        title="Fact-Check Debate",
        role="Fact-Checker and Judge",
        summary="Waiting to pressure-test the base verdict with challenger reviews, model-panel critique, and a final judge pass.",
        goal="Run critique loops so unsupported conclusions are challenged before the final report is written.",
    ),
    WorkflowStageDefinition(
        key="finalizing_results",
        title="Summary Synthesis",
        role="Consultant Writer",
        summary="Waiting to turn the checked evidence into concise, plain-language, and detailed explanations.",
        goal="Present the result clearly, with a short summary first and deeper explanation only when the user wants it.",
    ),
)


def workflow_stage_by_key(key: str) -> WorkflowStageDefinition:
    for stage in WORKFLOW_STAGES:
        if stage.key == key:
            return stage
    return WorkflowStageDefinition(
        key=key,
        title=key.replace("_", " ").title(),
        role="Investigator",
        summary="Waiting for this part of the investigation to begin.",
        goal="Continue the fact-check workflow.",
    )


def workflow_default_step_summaries() -> list[PipelineStepSummary]:
    return [
        PipelineStepSummary(
            key=stage.key,
            title=f"{stage.title} · {stage.role}",
            role=stage.role,
            goal=stage.goal,
            status="pending",
            summary=stage.summary,
            details=[stage.goal],
        )
        for stage in WORKFLOW_STAGES
    ]


def workflow_architecture_blocks() -> list[ArchitectureBlock]:
    return [
        ArchitectureBlock(
            id=f"wf-{index + 1}",
            title=f"{stage.title} Agent · {stage.role}",
            summary=stage.goal,
        )
        for index, stage in enumerate(WORKFLOW_STAGES)
    ]
