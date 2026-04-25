import React, { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Avatar, Button, Card, Chip, IconButton, ProgressBar, Text, TouchableRipple } from "react-native-paper";

import { palette, type InvestigationDetail, type InvestigationSummary, type PipelineStepSummary, type SourceAssessment, type SourceQualityLabel } from "../../data";
import type { MaterialIconName } from "./types";

export function ProcessingCard({
  investigation,
  onCancel,
  cancelling,
  styles,
  helpers,
}: {
  investigation: InvestigationDetail;
  onCancel: () => void;
  cancelling: boolean;
  styles: any;
  helpers: any;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const steps = investigation.stepSummaries.length > 0 ? investigation.stepSummaries : [];
  const recentEvents = investigation.progressEvents.slice(-5).reverse();
  return (
    <Card mode="contained" style={styles.processingCard}>
      <Card.Content style={styles.cardStack}>
        <View style={[styles.rowBetween, compact && styles.rowBetweenStacked]}>
          <View style={styles.flexOne}>
            <Text variant="titleLarge" style={styles.formTitle}>
              Review in progress
            </Text>
            <Text variant="bodyMedium" style={styles.sectionBody}>
              {helpers.formatClaimForDisplay(investigation.claim)}
            </Text>
          </View>
          <Chip style={styles.progressChip} textStyle={styles.progressChipText}>
            {investigation.progressPercent}%
          </Chip>
        </View>

        <ProgressBar progress={Math.max(0.04, investigation.progressPercent / 100)} color={palette.primary} style={styles.progressBar} />
        <View style={styles.resultActionRow}>
          <Button mode="outlined" icon="stop-circle-outline" onPress={onCancel} loading={cancelling} disabled={cancelling} textColor={palette.warning}>
            {cancelling ? "Stopping..." : "Stop current run"}
          </Button>
        </View>

        {steps.length > 0 ? (
          <View style={styles.cardStack}>
            {steps.map((step: PipelineStepSummary) => {
              const indicator = helpers.statusIcon(step.status);
              const stepTitle = helpers.splitWorkflowTitle(step.title);
              return (
                <View key={step.key} style={styles.stepRow}>
                  <Avatar.Icon size={40} icon={helpers.stageIcon(step)} color={palette.primary} style={styles.stepAvatar} />
                  <View style={styles.flexOne}>
                    <View style={[styles.rowBetween, compact && styles.stepHeaderCompact]}>
                      <View style={styles.flexOne}>
                        <Text variant="titleSmall" style={styles.stepTitle}>
                          {stepTitle.purpose}
                        </Text>
                        {stepTitle.role ? (
                          <Text variant="bodySmall" style={styles.stepRoleLine}>
                            {stepTitle.role}
                          </Text>
                        ) : null}
                      </View>
                      <Chip compact icon={indicator.icon} style={compact ? styles.statusChipCompact : undefined} textStyle={[styles.miniChipText, { color: indicator.color }]}>
                        {helpers.statusLabel(step.status)}
                      </Chip>
                    </View>
                    <View style={styles.stepDivider} />
                    <Text variant="bodySmall" style={styles.stepBody}>
                      {step.summary}
                    </Text>
                    {helpers.safeTrim(step.goal) ? (
                      <Text variant="bodySmall" style={styles.historyMetaLine}>
                        {helpers.safeTrim(step.goal)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text variant="bodyMedium" style={styles.sectionBody}>
            The report is being assembled. Progress events will appear as soon as the pipeline advances.
          </Text>
        )}

        {recentEvents.length > 0 && (
          <View style={styles.cardStack}>
            <Text variant="titleSmall" style={styles.formTitle}>
              Recent updates
            </Text>
            {recentEvents.map((event: any) => (
              <View key={event.id} style={styles.eventRow}>
                <Text variant="bodySmall" style={styles.eventMeta}>
                  {helpers.formatTimestamp(event.createdAt)}
                </Text>
                <Text variant="bodyMedium" style={styles.eventBody}>
                  {event.message}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export function InvestigationResult({
  investigation,
  styles,
  helpers,
}: {
  investigation: InvestigationDetail;
  styles: any;
  helpers: any;
}) {
  const { width } = useWindowDimensions();
  const compactSignals = width < 760;
  const compactLayout = width < 760;
  const verdict = helpers.verdictMeta(investigation.verdict);
  const scoreMeta = helpers.scoreTone(investigation.overallScore);
  const groupedSources = investigation.sourceGroups.filter((group) => group.sources.length > 0);
  const sourceDeckGroups = useMemo(() => {
    if (groupedSources.length > 0) {
      return groupedSources;
    }
    if (investigation.sources.length === 0) {
      return [];
    }
    const ranked = [...investigation.sources].sort((left, right) => {
      const leftScore = left.sourceWeight * 100 + left.confidenceFactor * 100 + left.citationIntegrity + left.evidenceScore * 16 + left.sourceScore * 20;
      const rightScore = right.sourceWeight * 100 + right.confidenceFactor * 100 + right.citationIntegrity + right.evidenceScore * 16 + right.sourceScore * 20;
      return rightScore - leftScore;
    });
    return [
      {
        key: "all_analyzed_sources",
        title: "Analyzed sources",
        summary: "The grouped evidence deck was unavailable for this run, so the app is showing the strongest analyzed sources directly.",
        sources: ranked.slice(0, 60),
      },
    ];
  }, [groupedSources, investigation.sources]);
  const riskMeta = helpers.riskTone(investigation.misinformationRisk);
  const [explanationMode, setExplanationMode] = useState<"summary" | "detailed">("summary");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | SourceQualityLabel>("all");
  const [sourceSentimentFilter, setSourceSentimentFilter] = useState<"all" | SourceAssessment["sentiment"]>("all");
  const [recencyFilter, setRecencyFilter] = useState<"all" | "recent" | "established" | "undated">("all");
  const [studyTypeFilter, setStudyTypeFilter] = useState<"all" | SourceAssessment["evidenceTier"]>("all");
  const explanationText =
    explanationMode === "detailed"
      ? investigation.expertInsight || investigation.finalNarrative || investigation.aiSummary
      : investigation.aiSummary || investigation.finalNarrative || investigation.summary;
  const agreementHighlights = [
    ...investigation.strengths,
    ...investigation.sources
      .filter((source) => source.sentiment === "positive")
      .slice(0, 4)
      .map((source) => source.sentimentSummary || source.relevanceSummary || source.title),
  ].filter(Boolean);
  const filteredGroups = useMemo(
    () =>
      sourceDeckGroups
        .map((group) => ({
          ...group,
          sources: group.sources.filter((source: SourceAssessment) => {
            if (sourceTypeFilter !== "all" && source.sourceQualityLabel !== sourceTypeFilter) return false;
            if (sourceSentimentFilter !== "all" && source.sentiment !== sourceSentimentFilter) return false;
            if (recencyFilter !== "all" && helpers.recencyBucket(source.publishedAt) !== recencyFilter) return false;
            if (studyTypeFilter !== "all" && source.evidenceTier !== studyTypeFilter) return false;
            return true;
          }),
        }))
        .filter((group) => group.sources.length > 0),
    [helpers, recencyFilter, sourceDeckGroups, sourceSentimentFilter, sourceTypeFilter, studyTypeFilter]
  );
  const filteredSourceCount = filteredGroups.reduce((total, group) => total + group.sources.length, 0);
  const effectiveVisibleCount = sourceDeckGroups.reduce((total, group) => total + group.sources.length, 0);
  const limitedAccessCount = investigation.sources.filter((source) => source.cacheStatus === "fallback" || source.notes.some((note) => helpers.safeLower(note).includes("limited-access evidence"))).length;
  const singaporeAuthoritySources = useMemo(
    () =>
      investigation.sources.filter((source) => {
        const domain = helpers.safeLower(source.domain);
        return domain.endsWith(".sg") || ["moh.gov.sg", "hsa.gov.sg", "healthhub.sg", "healthiersg.gov.sg", "ncid.sg"].some((item) => domain.includes(item));
      }),
    [helpers, investigation.sources]
  );
  const showSingaporeAuthoritySection = Boolean(investigation.singaporeAuthorityReview) || singaporeAuthoritySources.length > 0 || helpers.safeLower(investigation.claim).includes("singapore");
  const singaporeReviewMeta = helpers.singaporeAgreementMeta(investigation.singaporeAuthorityReview?.agreementLabel);
  const fullSourceLog = useMemo(
    () =>
      [...investigation.sources].sort((left, right) => {
        const leftScore = left.sourceWeight * 100 + left.confidenceFactor * 100 + left.citationIntegrity + left.evidenceScore * 16 + left.sourceScore * 20 + (left.directEvidenceEligible ? 12 : 0);
        const rightScore = right.sourceWeight * 100 + right.confidenceFactor * 100 + right.citationIntegrity + right.evidenceScore * 16 + right.sourceScore * 20 + (right.directEvidenceEligible ? 12 : 0);
        return rightScore - leftScore;
      }),
    [investigation.sources]
  );

  return (
    <View style={styles.cardStack}>
      <Card mode="contained" style={styles.resultHero}>
        <Card.Content style={styles.cardStack}>
          <View style={styles.resultHeroTopRow}>
            <VerdictPill verdict={investigation.verdict} styles={styles} helpers={helpers} />
            <Chip compact style={[styles.scoreChip, { backgroundColor: scoreMeta.background }]} textStyle={[styles.scoreChipText, { color: scoreMeta.color }]}>
              {investigation.overallScore ?? "--"}/100
            </Chip>
          </View>
          <Text variant="headlineSmall" style={styles.resultTitle}>
            {helpers.formatClaimForDisplay(investigation.claim)}
          </Text>
          <Text key={`hero-${explanationMode}`} variant="bodyMedium" style={styles.resultBody}>
            {explanationText}
          </Text>
          <View style={[styles.resultMetaRow, styles.resultMetaColumn]}>
            <MiniStat label="Assessment" value={investigation.truthClassification || helpers.scoreBandLabel(investigation.overallScore)} style={styles.miniStatFullWidth} styles={styles} />
            <MiniStat label="Confidence" value={helpers.safeUpper(investigation.confidenceLevel ?? "unknown")} style={styles.miniStatFullWidth} styles={styles} />
            <MiniStat label="Review Type" value={helpers.depthLabel(investigation.desiredDepth)} style={styles.miniStatFullWidth} styles={styles} />
          </View>
          <Text variant="bodySmall" style={styles.historyMetaLine}>
            Updated {helpers.formatTimestamp(investigation.updatedAt)}
          </Text>
          <View style={styles.historyMetaRow}>
            <Chip compact style={styles.segmentChip}>{`${investigation.sources.length} analyzed sources`}</Chip>
            {limitedAccessCount > 0 ? <Chip compact style={styles.segmentChip}>{`${limitedAccessCount} limited-access`}</Chip> : null}
          </View>
          {investigation.sentiment ? (
            <>
              <View style={[styles.resultSignalRow, compactSignals ? styles.resultSignalColumn : styles.resultSignalRowWide]}>
                <SignalPill label="Supports" value={`${investigation.sentiment.positivePct}%`} icon="check-circle" color={palette.success} background={palette.successSoft} styles={styles} />
                <SignalPill label="Mixed" value={`${investigation.sentiment.neutralPct}%`} icon="help-circle" color={palette.warning} background={palette.warningSoft} styles={styles} />
                <SignalPill label="Contradicts" value={`${investigation.sentiment.negativePct}%`} icon="close-circle" color={palette.danger} background={palette.dangerSoft} styles={styles} />
              </View>
              <ConfidenceBreakdownBar investigation={investigation} styles={styles} />
            </>
          ) : null}
        </Card.Content>
      </Card>

      <ExpandableResultSection title="Conclusion and findings" body={explanationText} icon="text-box-check-outline" bodyKey={explanationMode} defaultExpanded styles={styles}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {([
            ["summary", "Summary"],
            ["detailed", "Detailed"],
          ] as const).map(([value, label]) => (
            <Chip key={value} selected={explanationMode === value} onPress={() => setExplanationMode(value)} style={styles.segmentChip}>
              {label}
            </Chip>
          ))}
        </ScrollView>
        <Text key={`detail-${explanationMode}`} variant="bodyMedium" style={styles.resultBody}>
          {explanationText}
        </Text>
        {investigation.evidenceBreakdown.slice(0, 5).map((item) => (
          <Bullet key={item} text={item} styles={styles} />
        ))}
      </ExpandableResultSection>

      {investigation.keyFindings.length > 0 && (
        <ExpandableResultSection title="Key details" body={investigation.keyFindings[0]} icon="star-four-points-circle-outline" defaultExpanded={false} styles={styles}>
          {investigation.keyFindings.map((item) => (
            <Bullet key={item} text={item} styles={styles} />
          ))}
        </ExpandableResultSection>
      )}

      {showSingaporeAuthoritySection && (
        <ExpandableResultSection
          title="Singapore authority view"
          body={investigation.singaporeAuthorityReview?.summary || (singaporeAuthoritySources.length > 0 ? `${singaporeAuthoritySources.length} Singapore-linked health or research sources were found in this review.` : "No retained Singapore authority source made it into the final evidence set for this run.")}
          icon="map-marker-radius-outline"
          styles={styles}
        >
          <View style={styles.historyMetaRow}>
            <Chip compact icon={singaporeReviewMeta.icon} style={{ backgroundColor: singaporeReviewMeta.background }} textStyle={{ color: singaporeReviewMeta.color, fontFamily: "Poppins_600SemiBold" }}>
              {singaporeReviewMeta.label}
            </Chip>
          </View>
          {(investigation.singaporeAuthorityReview?.keyPoints || []).map((item) => (
            <Bullet key={`sg-point-${item}`} text={item} styles={styles} />
          ))}
          {singaporeAuthoritySources.slice(0, 10).map((source) => (
            <EvidenceBlock key={`sg-${source.id}`} source={source} styles={styles} helpers={helpers} />
          ))}
        </ExpandableResultSection>
      )}

      {sourceDeckGroups.length > 0 && (
        <ExpandableResultSection
          title="Evidence deck"
          body={`${filteredSourceCount || effectiveVisibleCount} evidence cards match the current filters out of ${investigation.sources.length} analyzed sources.`}
          icon="file-document-multiple-outline"
          styles={styles}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All sources"],
              ["verified", "Verified"],
              ["established", "Established"],
              ["general", "General"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={sourceTypeFilter === value} onPress={() => setSourceTypeFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All directions"],
              ["positive", "Support"],
              ["neutral", "Mixed"],
              ["negative", "Contradict"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={sourceSentimentFilter === value} onPress={() => setSourceSentimentFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All recency"],
              ["recent", "Recent"],
              ["established", "Established"],
              ["undated", "Undated"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={recencyFilter === value} onPress={() => setRecencyFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All evidence"],
              ["rct", "RCT"],
              ["review", "Review"],
              ["guideline", "Guideline"],
              ["article", "Article"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={studyTypeFilter === value} onPress={() => setStudyTypeFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          {filteredGroups.map((group) => (
            <View key={group.key} style={styles.cardStack}>
              <SectionTitle eyebrow="Evidence group" title={group.title} body={group.summary} styles={styles} />
              {group.sources.map((source: SourceAssessment) => (
                <EvidenceBlock key={source.id} source={source} styles={styles} helpers={helpers} />
              ))}
            </View>
          ))}
        </ExpandableResultSection>
      )}

      {investigation.hoaxSignals.length > 0 && (
        <ExpandableResultSection
          title="Misinformation pattern scan"
          body={`Risk currently sits in the ${riskMeta.label.toLowerCase()} band.`}
          icon="shield-check-outline"
          styles={styles}
        >
          <View style={styles.historyMetaRow}>
            <Chip compact style={{ backgroundColor: riskMeta.background }} textStyle={{ color: riskMeta.color, fontFamily: "Poppins_600SemiBold" }}>
              {riskMeta.label}
            </Chip>
          </View>
          {investigation.hoaxSignals.map((signal) => {
            const tone = helpers.riskTone(signal.severity);
            return (
              <Card key={`${signal.label}-${signal.rationale}`} mode="contained" style={styles.evidenceCard}>
                <Card.Content style={styles.cardStack}>
                  <View style={[styles.rowBetween, compactLayout && styles.rowBetweenStacked]}>
                    <Text variant="titleMedium" style={styles.evidenceTitle}>
                      {signal.label}
                    </Text>
                    <Chip compact style={{ backgroundColor: tone.background }} textStyle={{ color: tone.color, fontFamily: "Poppins_600SemiBold" }}>
                      {helpers.safeUpper(signal.severity)}
                    </Chip>
                  </View>
                  <Text variant="bodySmall" style={styles.evidenceBody}>
                    {signal.rationale}
                  </Text>
                </Card.Content>
              </Card>
            );
          })}
        </ExpandableResultSection>
      )}

      {agreementHighlights.length > 0 && (
        <ExpandableResultSection title="Supporting signals and reinforcing sources" body={agreementHighlights[0]} icon="check-decagram-outline" styles={styles}>
          {agreementHighlights.slice(0, 8).map((item) => (
            <Bullet key={`agreement-${item}`} text={item} styles={styles} />
          ))}
        </ExpandableResultSection>
      )}

      {investigation.contradictions.length > 0 && (
        <ExpandableResultSection title="Pushback and caution signals" body={investigation.contradictions[0]} icon="alert-circle-outline" styles={styles}>
          {investigation.contradictions.map((item) => (
            <Bullet key={item} text={item} styles={styles} />
          ))}
        </ExpandableResultSection>
      )}

      {investigation.providerReviews.length > 0 && (
        <ExpandableResultSection
          title="Cross-model review"
          body={`${investigation.providerReviews.length} model reviewers checked the evidence set, and the panel landed around ${investigation.llmAgreementScore ?? 0}% agreement after audit.`}
          icon="account-group-outline"
          styles={styles}
        >
          {investigation.providerReviews.map((review) => {
            const providerVerdict = helpers.verdictMeta(review.verdict);
            return (
              <Card key={`${review.provider}-${review.role}`} mode="contained" style={styles.evidenceCard}>
                <Card.Content style={styles.cardStack}>
                  <View style={[styles.rowBetween, compactLayout && styles.rowBetweenStacked]}>
                    <View style={styles.flexOne}>
                      <Text variant="titleMedium" style={styles.evidenceTitle}>
                        {helpers.providerLabel(review.provider)}
                      </Text>
                      <Text variant="bodySmall" style={styles.historyMetaLine}>
                        {review.role}
                        {helpers.safeTrim(review.model) ? ` · ${review.model}` : ""}
                      </Text>
                    </View>
                    <Chip compact style={{ backgroundColor: providerVerdict.background }} textStyle={{ color: providerVerdict.color, fontFamily: "Poppins_600SemiBold" }}>
                      {providerVerdict.label}
                    </Chip>
                  </View>
                  <Text variant="bodySmall" style={styles.evidenceBody}>
                    {review.rationale}
                  </Text>
                </Card.Content>
              </Card>
            );
          })}
        </ExpandableResultSection>
      )}

      {investigation.stepSummaries.length > 0 && (
        <ExpandableResultSection title="Workflow behind the scenes" body="Open this when you want to see how the investigation was parsed, searched, checked, and reconciled." icon="timeline-outline" styles={styles}>
          {investigation.stepSummaries.map((step: PipelineStepSummary) => {
            const indicator = helpers.statusIcon(step.status);
            const stepTitle = helpers.splitWorkflowTitle(step.title);
            return (
              <View key={step.key} style={styles.stepRow}>
                <Avatar.Icon size={38} icon={helpers.stageIcon(step)} color={palette.primary} style={styles.stepAvatar} />
                <View style={styles.flexOne}>
                  <View style={[styles.rowBetween, compactLayout && styles.stepHeaderCompact]}>
                    <View style={styles.flexOne}>
                      <Text variant="titleSmall" style={styles.stepTitle}>
                        {stepTitle.purpose}
                      </Text>
                      {stepTitle.role ? <Text variant="bodySmall" style={styles.stepRoleLine}>{stepTitle.role}</Text> : null}
                    </View>
                    <Chip compact icon={indicator.icon} style={compactLayout ? styles.statusChipCompact : undefined} textStyle={[styles.miniChipText, { color: indicator.color }]}>
                      {helpers.statusLabel(step.status)}
                    </Chip>
                  </View>
                  <View style={styles.stepDivider} />
                  <Text variant="bodySmall" style={styles.stepBody}>
                    {step.summary}
                  </Text>
                </View>
              </View>
            );
          })}
        </ExpandableResultSection>
      )}

      {fullSourceLog.length > 0 && (
        <ExpandableResultSection title="Full source log" body={`All ${investigation.sources.length} analyzed sources are preserved for this saved investigation, not just the streamlined evidence deck.`} icon="database-outline" styles={styles}>
          {fullSourceLog.map((source) => (
            <EvidenceBlock key={`full-log-${source.id}`} source={source} styles={styles} helpers={helpers} />
          ))}
        </ExpandableResultSection>
      )}
    </View>
  );
}

export function LoadingCard({ text, styles }: { text: string; styles: any }) {
  return (
    <Card mode="contained" style={styles.loadingCard}>
      <Card.Content style={styles.loadingCardContent}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text variant="bodyMedium" style={styles.sectionBody}>
          {text}
        </Text>
      </Card.Content>
    </Card>
  );
}

export function EmptyState({ title, body, styles }: { title: string; body: string; styles: any }) {
  return (
    <Card mode="contained" style={styles.loadingCard}>
      <Card.Content style={styles.loadingCardContent}>
        <Avatar.Icon size={44} icon="folder-search-outline" color={palette.primary} style={styles.metricAvatar} />
        <Text variant="titleLarge" style={styles.formTitle}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={[styles.sectionBody, { textAlign: "center" }]}>
          {body}
        </Text>
      </Card.Content>
    </Card>
  );
}

function ConfidenceBreakdownBar({ investigation, styles }: { investigation: InvestigationDetail; styles: any }) {
  if (!investigation.sentiment) return null;
  return (
    <View style={styles.cardStack}>
      <View style={styles.confidenceBarTrack}>
        <View style={[styles.confidenceBarSegment, { flex: Math.max(1, investigation.sentiment.positivePct), backgroundColor: palette.success }]} />
        <View style={[styles.confidenceBarSegment, { flex: Math.max(1, investigation.sentiment.neutralPct), backgroundColor: palette.warning }]} />
        <View style={[styles.confidenceBarSegment, { flex: Math.max(1, investigation.sentiment.negativePct), backgroundColor: palette.danger }]} />
      </View>
    </View>
  );
}

function EvidenceBlock({ source, styles, helpers }: { source: SourceAssessment; styles: any; helpers: any }) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const tone = helpers.sourceTone(source);
  const quality = helpers.sourceQualityMeta(source.sourceQualityLabel);
  const quote = helpers.safeTrim(source.evidence?.quotedEvidence);
  const hasVerifiedQuote = Boolean(quote) && source.quoteVerified;
  const quoteMeta = helpers.quoteStanceMeta(source.quoteStance);
  const access = helpers.sourceAccessMeta(source);
  const displayUrl = helpers.sourceDisplayUrl(source);
  const quoteUrl = helpers.highlightedQuoteUrl(displayUrl, quote);

  return (
    <Card mode="contained" style={styles.evidenceCard}>
      <Card.Content style={styles.cardStack}>
        <View style={[styles.rowBetween, compact && styles.rowBetweenStacked]}>
          <View style={styles.flexOne}>
            <Text variant="titleMedium" style={styles.evidenceTitle}>
              {source.sourceName || source.domain}
            </Text>
            <Pressable onPress={() => void Linking.openURL(displayUrl)}>
              <Text variant="bodySmall" style={styles.evidenceUrl} numberOfLines={2} ellipsizeMode="middle">
                {displayUrl}
              </Text>
            </Pressable>
          </View>
          <Avatar.Icon size={34} icon={tone.icon} color={tone.color} style={{ backgroundColor: tone.background }} />
        </View>

        <View style={[styles.historyMetaRow, compact && styles.historyMetaColumn]}>
          <Chip compact style={{ backgroundColor: tone.background }} textStyle={{ color: tone.color, fontFamily: "Poppins_600SemiBold" }}>
            {helpers.sourceSentimentLabel(source)}
          </Chip>
          <Chip compact style={{ backgroundColor: quality.background }} textStyle={{ color: quality.color, fontFamily: "Poppins_600SemiBold" }}>
            {quality.label}
          </Chip>
          <Chip compact style={{ backgroundColor: access.background }} textStyle={{ color: access.color, fontFamily: "Poppins_600SemiBold" }}>
            {access.label}
          </Chip>
          <Chip compact style={styles.segmentChip}>{helpers.evidenceTierLabel(source)}</Chip>
          {source.httpStatusCode ? <Chip compact style={styles.segmentChip}>{`HTTP ${source.httpStatusCode}`}</Chip> : null}
          {source.semanticSimilarity > 0 ? <Chip compact style={styles.segmentChip}>{`Match ${source.semanticSimilarity}`}</Chip> : null}
          {hasVerifiedQuote ? (
            <Chip compact style={{ backgroundColor: quoteMeta.background }} textStyle={{ color: quoteMeta.color, fontFamily: "Poppins_600SemiBold" }}>
              {quoteMeta.label}
            </Chip>
          ) : (
            <Chip compact style={styles.segmentChip}>Excerpt only</Chip>
          )}
        </View>

        <Text variant="bodySmall" style={styles.historyMetaLine}>
          {helpers.safeTrim(source.publishedAt) ? `Published ${helpers.formatTimestamp(source.publishedAt || "")}` : "Published date not available"}
        </Text>
        <Text variant="bodySmall" style={styles.historyMetaLine}>
          {source.linkValidationSummary || source.sourceQualityReason}
        </Text>

        {hasVerifiedQuote ? (
          <View style={styles.quoteBox}>
            <Text variant="labelSmall" style={styles.quoteLabel}>
              Verified quote
            </Text>
            <Text variant="bodyMedium" style={styles.quoteText}>
              "{quote}"
            </Text>
          </View>
        ) : null}

        <Text variant="bodySmall" style={styles.evidenceBody}>
          {source.sourceQualityReason || source.evidence?.expertAnalysis || source.sentimentSummary || source.relevanceSummary || "This source was included because it materially addresses the claim."}
        </Text>

        <View style={styles.resultActionRow}>
          <Button mode="outlined" compact icon="open-in-new" textColor={palette.primary} onPress={() => void Linking.openURL(displayUrl)}>
            Open source
          </Button>
          {hasVerifiedQuote ? (
            <Button mode="contained-tonal" compact icon="format-quote-close" buttonColor={palette.primarySoft} textColor={palette.primary} onPress={() => void Linking.openURL(quoteUrl)}>
              Highlight quote
            </Button>
          ) : null}
        </View>
      </Card.Content>
    </Card>
  );
}

function VerdictPill({ verdict, styles, helpers }: { verdict: InvestigationSummary["verdict"] | InvestigationDetail["verdict"]; styles: any; helpers: any }) {
  const meta = helpers.verdictMeta(verdict);
  return (
    <View style={[styles.verdictPill, { backgroundColor: meta.background }]}>
      <MaterialCommunityIcons name={meta.icon as MaterialIconName} size={16} color={meta.color} />
      <Text variant="labelMedium" style={[styles.verdictPillText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

function SignalPill({ label, value, icon, color, background, styles }: { label: string; value: string; icon: MaterialIconName; color: string; background: string; styles: any }) {
  return (
    <View style={[styles.signalPill, { backgroundColor: background }]}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <View style={styles.signalPillCopy}>
        <Text variant="labelSmall" style={[styles.signalPillLabel, { color }]}>
          {label}
        </Text>
        <Text variant="titleSmall" style={styles.signalPillValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ExpandableResultSection({
  title,
  body,
  bodyKey,
  icon,
  defaultExpanded = false,
  children,
  styles,
}: {
  title: string;
  body: string;
  bodyKey?: string;
  icon: MaterialIconName;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  styles: any;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <Card mode="contained" style={styles.resultSectionCard}>
      <Card.Content style={styles.cardStack}>
        <TouchableRipple onPress={() => setExpanded((current) => !current)} style={styles.expandableHeader}>
          <View style={styles.rowBetween}>
            <View style={styles.rowGapTop}>
              <View style={styles.expandableIconWrap}>
                <MaterialCommunityIcons name={icon} size={20} color={palette.primary} />
              </View>
              <View style={styles.flexOne}>
                <Text variant="titleMedium" style={styles.linkTitle}>
                  {title}
                </Text>
                <Text key={bodyKey} numberOfLines={expanded ? undefined : 2} variant="bodySmall" style={styles.sectionBody}>
                  {body}
                </Text>
              </View>
            </View>
            <IconButton icon={expanded ? "chevron-up" : "chevron-down"} iconColor={palette.primary} size={18} style={styles.dragButton} />
          </View>
        </TouchableRipple>
        {expanded ? <View style={styles.cardStack}>{children}</View> : null}
      </Card.Content>
    </Card>
  );
}

function MiniStat({ label, value, style, styles }: { label: string; value: string; style?: any; styles: any }) {
  return (
    <View style={[styles.miniStat, style]}>
      <Text variant="labelMedium" style={styles.miniStatLabel}>
        {label}
      </Text>
      <Text variant="titleSmall" style={styles.miniStatValue}>
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({ eyebrow, title, body, styles }: { eyebrow: string; title: string; body: string; styles: any }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="labelLarge" style={styles.eyebrow}>
        {eyebrow.toUpperCase()}
      </Text>
      <Text variant="headlineSmall" style={styles.sectionTitle}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.sectionBody}>
        {body}
      </Text>
    </View>
  );
}

function Bullet({ text, styles }: { text: string; styles: any }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text variant="bodyMedium" style={styles.bulletText}>
        {text}
      </Text>
    </View>
  );
}
