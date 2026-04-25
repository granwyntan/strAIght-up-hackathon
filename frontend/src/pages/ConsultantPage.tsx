import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Avatar, Button, Card, Chip, IconButton, Searchbar, Text, TouchableRipple } from "react-native-paper";

import { palette, type InvestigationSummary } from "../data";
import SectionTabs from "../components/shared/SectionTabs";
import { EmptyState, InvestigationResult, LoadingCard, ProcessingCard } from "../components/consultant/InvestigationResult";
import type { ConsultantPageProps, ConsultantView, HistoryFilter, HistorySort, InvestigationComparison, MaterialIconName } from "../components/consultant/types";

export default function ConsultantPage(props: ConsultantPageProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1120;
  const [showOptionalContext, setShowOptionalContext] = useState(false);
  const {
    consultantView,
    claimDraft,
    contextDraft,
    claimSourceDraft,
    sourceUrlDraft,
    depth,
    claimSuggestions,
    suggestionsLoading,
    healthGuard,
    submitting,
    loadingHistory,
    loadingSelected,
    history,
    pinnedIds,
    historySort,
    historyFilter,
    historyQuery,
    comparisonIds,
    comparisonItems,
    comparisonResult,
    comparisonLoading,
    cancellingIds,
    liveInvestigation,
    styles,
    helpers,
    onClaimChange,
    onContextChange,
    onClaimSourceChange,
    onSourceUrlChange,
    onDepthChange,
    onSubmit,
    onOpenHistory,
    onDeleteHistory,
    onCancelInvestigation,
    onTogglePin,
    onToggleCompare,
    onRunComparison,
    onMoveUp,
    onMoveDown,
    onSortChange,
    onFilterChange,
    onHistoryQueryChange,
    onConsultantViewChange,
    onUseClaim,
    onClearHistory,
  } = props;

  const recentSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return history
      .map((item) => ({
        id: `recent-${item.id}`,
        claim: item.claim,
        whyItIsInteresting: "",
      }))
      .filter((item) => {
        const key = helpers.normalizedClaimKey(item.claim);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }, [helpers, history]);

  const recentQueryMatches = useMemo(() => {
    if (!healthGuard.allowed) return [];
    const query = helpers.normalizedClaimKey(claimDraft);
    if (!query) return [];
    return recentSuggestions.filter((item) => helpers.normalizedClaimKey(item.claim).includes(query)).slice(0, 5);
  }, [claimDraft, healthGuard.allowed, helpers, recentSuggestions]);

  const liveQueryMatches = useMemo(() => {
    const seen = new Set(recentQueryMatches.map((item) => helpers.normalizedClaimKey(item.claim)));
    return claimSuggestions
      .map((claim, index) => ({
        id: `suggestion-${index}-${helpers.normalizedClaimKey(claim)}`,
        claim,
        whyItIsInteresting: "",
      }))
      .filter((item) => {
        const key = helpers.normalizedClaimKey(item.claim);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [claimSuggestions, helpers, recentQueryMatches]);

  useEffect(() => {
    if ([contextDraft, claimSourceDraft, sourceUrlDraft].some((value) => helpers.safeTrim(value))) {
      setShowOptionalContext(true);
    }
  }, [claimSourceDraft, contextDraft, helpers, sourceUrlDraft]);

  return (
    <View style={styles.screenStack}>
      <SectionTabs
        value={consultantView}
        onValueChange={(value) => onConsultantViewChange(value as ConsultantView)}
        tabs={[
          { value: "investigate", label: "Investigate", icon: "stethoscope" },
          { value: "history", label: "History", icon: "history" },
        ]}
      />

      {consultantView === "investigate" ? (
        <View style={[styles.cardStack, isWide && styles.consultantWideGrid]}>
          <View style={styles.consultantPrimaryColumn}>
            <Card mode="contained" style={styles.formCard}>
              <Card.Content style={styles.formCardContent}>
                <Text variant="titleLarge" style={styles.formTitle}>
                  New investigation
                </Text>
                <Text variant="bodyMedium" style={styles.sectionBody}>
                  Paste the claim as you saw it. Keep context light. The backend handles wording risk, contradiction checks, source quality, and final synthesis.
                </Text>

                <View style={styles.cardStack}>
                  <View>
                    <Text variant="labelLarge" style={styles.linkTitle}>Claim to investigate</Text>
                    <Searchbar
                      placeholder="Example: Magnesium glycinate cures insomnia."
                      value={claimDraft}
                      onChangeText={onClaimChange}
                      style={styles.searchbar}
                      inputStyle={styles.searchbarInput}
                    />
                  </View>
                  {!healthGuard.allowed ? (
                    <Card mode="contained" style={styles.scopeWarningCard}>
                      <Card.Content style={styles.cardStack}>
                        <View style={styles.rowGapTop}>
                          <View style={styles.scopeWarningIcon}>
                            <MaterialCommunityIcons name="shield-off-outline" size={20} color={palette.warning} />
                          </View>
                          <View style={styles.flexOne}>
                            <Text variant="titleMedium" style={styles.linkTitle}>
                              {healthGuard.title}
                            </Text>
                            <Text variant="bodySmall" style={styles.sectionBody}>
                              {healthGuard.body}
                            </Text>
                          </View>
                        </View>
                      </Card.Content>
                    </Card>
                  ) : null}
                  {recentQueryMatches.length > 0 ? (
                    <Card mode="contained" style={styles.recentQueryCard}>
                      <Card.Content style={styles.cardStack}>
                        <Text variant="labelLarge" style={styles.linkTitle}>
                          Recent queries
                        </Text>
                        {recentQueryMatches.map((item) => (
                          <TouchableRipple key={item.id} style={styles.recentQueryRow} onPress={() => onUseClaim(item)}>
                            <View style={styles.cardStack}>
                              <Text variant="bodyMedium" style={styles.linkTitle}>
                                {helpers.formatClaimForDisplay(item.claim)}
                              </Text>
                            </View>
                          </TouchableRipple>
                        ))}
                      </Card.Content>
                    </Card>
                  ) : null}
                  {liveQueryMatches.length > 0 ? (
                    <Card mode="contained" style={styles.recentQueryCard}>
                      <Card.Content style={styles.cardStack}>
                        <View style={styles.rowBetween}>
                          <Text variant="labelLarge" style={styles.linkTitle}>
                            Search suggestions
                          </Text>
                          {suggestionsLoading ? <ActivityIndicator size="small" color={palette.primary} /> : null}
                        </View>
                        {liveQueryMatches.map((item) => (
                          <TouchableRipple key={item.id} style={styles.recentQueryRow} onPress={() => onUseClaim(item)}>
                            <View style={styles.cardStack}>
                              <Text variant="bodyMedium" style={styles.linkTitle}>
                                {helpers.formatClaimForDisplay(item.claim)}
                              </Text>
                            </View>
                          </TouchableRipple>
                        ))}
                      </Card.Content>
                    </Card>
                  ) : null}
                  <TouchableRipple style={styles.optionalContextCard} onPress={() => setShowOptionalContext((current) => !current)}>
                    <View style={styles.rowBetween}>
                      <View style={styles.rowGapTop}>
                        <View style={styles.expandableIconWrap}>
                          <MaterialCommunityIcons name="tune-variant" size={20} color={palette.primary} />
                        </View>
                        <View style={styles.flexOne}>
                          <Text variant="titleMedium" style={styles.linkTitle}>
                            Optional context
                          </Text>
                          <Text variant="bodySmall" style={styles.sectionBody}>
                            Add one note about what worries you, where you saw it, or links you already have.
                          </Text>
                        </View>
                      </View>
                      <IconButton icon={showOptionalContext ? "chevron-up" : "chevron-down"} iconColor={palette.primary} size={18} style={styles.dragButton} />
                    </View>
                  </TouchableRipple>

                  {showOptionalContext ? (
                    <View style={styles.cardStack}>
                      <Searchbar placeholder="What do you want checked?" value={contextDraft} onChangeText={onContextChange} style={styles.searchbar} inputStyle={styles.searchbarInput} />
                      <Searchbar placeholder="Where did you see this?" value={claimSourceDraft} onChangeText={onClaimSourceChange} style={styles.searchbar} inputStyle={styles.searchbarInput} />
                      <Searchbar placeholder="Links to review" value={sourceUrlDraft} onChangeText={onSourceUrlChange} style={styles.searchbar} inputStyle={styles.searchbarInput} />
                    </View>
                  ) : null}
                </View>

                <View style={styles.segmentRow}>
                  <Chip selected={depth === "quick"} onPress={() => onDepthChange("quick")} style={styles.segmentChip}>Quick</Chip>
                  <Chip selected={depth === "standard"} onPress={() => onDepthChange("standard")} style={styles.segmentChip}>Standard</Chip>
                  <Chip selected={depth === "deep"} onPress={() => onDepthChange("deep")} style={styles.segmentChip}>Deep</Chip>
                </View>
                <Text variant="bodySmall" style={styles.depthHint}>
                  {helpers.depthDescription(depth)}
                </Text>

                <Button mode="contained" icon="magnify" onPress={onSubmit} loading={submitting} disabled={submitting || !healthGuard.allowed} buttonColor={palette.primary}>
                  Start investigation
                </Button>
              </Card.Content>
            </Card>
          </View>

          <View style={styles.consultantSecondaryColumn}>
            <View style={styles.sectionHeader}>
              <Text variant="labelLarge" style={styles.eyebrow}>LIVE REPORT</Text>
              <Text variant="headlineSmall" style={styles.sectionTitle}>Current review</Text>
              <Text variant="bodyMedium" style={styles.sectionBody}>
                Only investigations started in this session appear here. Saved history stays separate until you run it again.
              </Text>
            </View>
            {loadingSelected ? (
              <LoadingCard text="Loading investigation..." styles={styles} />
            ) : liveInvestigation ? (
              helpers.isRunning(liveInvestigation.status) ? (
                <ProcessingCard investigation={liveInvestigation} onCancel={() => onCancelInvestigation(liveInvestigation.id)} cancelling={cancellingIds.includes(liveInvestigation.id)} styles={styles} helpers={helpers} />
              ) : (
                <InvestigationResult investigation={liveInvestigation} styles={styles} helpers={helpers} />
              )
            ) : !healthGuard.allowed && helpers.safeTrim(claimDraft) ? (
              <EmptyState title={healthGuard.title} body={healthGuard.body} styles={styles} />
            ) : (
              <EmptyState title="No active investigation" body="Start a new review to populate the live report. Saved investigations stay in History until you choose to run them again." styles={styles} />
            )}
          </View>
        </View>
      ) : (
        <HistoryPanel
          loadingHistory={loadingHistory}
          history={history}
          pinnedIds={pinnedIds}
          historySort={historySort}
          historyFilter={historyFilter}
          historyQuery={historyQuery}
          comparisonIds={comparisonIds}
          comparisonItems={comparisonItems}
          comparisonResult={comparisonResult}
          comparisonLoading={comparisonLoading}
          styles={styles}
          helpers={helpers}
          onOpenHistory={onOpenHistory}
          onDeleteHistory={onDeleteHistory}
          onCancelInvestigation={onCancelInvestigation}
          onTogglePin={onTogglePin}
          onToggleCompare={onToggleCompare}
          onRunComparison={onRunComparison}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onSortChange={onSortChange}
          onFilterChange={onFilterChange}
          onHistoryQueryChange={onHistoryQueryChange}
          onClearHistory={onClearHistory}
        />
      )}
    </View>
  );
}

function HistoryPanel({
  loadingHistory,
  history,
  pinnedIds,
  historySort,
  historyFilter,
  historyQuery,
  comparisonIds,
  comparisonItems,
  comparisonResult,
  comparisonLoading,
  styles,
  helpers,
  onOpenHistory,
  onDeleteHistory,
  onCancelInvestigation,
  onTogglePin,
  onToggleCompare,
  onRunComparison,
  onMoveUp,
  onMoveDown,
  onSortChange,
  onFilterChange,
  onHistoryQueryChange,
  onClearHistory,
}: any) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1120;
  const averageScore =
    history.filter((item: InvestigationSummary) => item.overallScore !== null).reduce((sum: number, item: InvestigationSummary) => sum + (item.overallScore ?? 0), 0) /
    Math.max(1, history.filter((item: InvestigationSummary) => item.overallScore !== null).length);

  return (
    <View style={styles.cardStack}>
      <View style={[styles.cardStack, isWide && styles.historyWideGrid]}>
        <View style={styles.historySidebarColumn}>
          <Card mode="contained" style={styles.resultSectionCard}>
            <Card.Content style={styles.resultMetaRow}>
              <MiniStat label="Saved" value={String(history.length)} styles={styles} />
              <MiniStat label="Pinned" value={String(pinnedIds.length)} styles={styles} />
              <MiniStat label="Avg. score" value={Number.isFinite(averageScore) ? `${Math.round(averageScore)}/100` : "--"} styles={styles} />
            </Card.Content>
          </Card>

          <Card mode="contained" style={styles.filterCard}>
            <Card.Content style={styles.cardStack}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text variant="titleSmall" style={styles.linkTitle}>
                    {helpers.historySortLabel(historySort)}
                  </Text>
                  <Text variant="bodySmall" style={styles.sectionBody}>
                    Dragging a card switches the list into custom order automatically.
                  </Text>
                </View>
                <Button mode="text" textColor={palette.danger} onPress={onClearHistory}>
                  Clear history
                </Button>
              </View>
              <Searchbar
                placeholder="Search claim, verdict, or summary"
                value={historyQuery}
                onChangeText={onHistoryQueryChange}
                style={styles.searchbar}
                inputStyle={styles.searchbarInput}
                iconColor={palette.primary}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {([
                  ["recent", "Newest"],
                  ["oldest", "Oldest"],
                  ["manual", "Custom"],
                  ["score", "Highest score"],
                  ["lowestScore", "Lowest score"],
                ] as const).map(([value, label]) => (
                  <Chip key={value} selected={historySort === value} onPress={() => onSortChange(value)} style={styles.segmentChip}>{label}</Chip>
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {([
                  ["all", "All"],
                  ["pinned", "Pinned"],
                  ["running", "Running"],
                  ["completed", "Completed"],
                  ["deep", "Deep"],
                  ["highConfidence", "High confidence"],
                  ["trustworthy", "Trustworthy"],
                  ["uncertain", "Mixed evidence"],
                  ["untrustworthy", "Untrustworthy"],
                ] as const).map(([value, label]) => (
                  <Chip key={value} selected={historyFilter === value} onPress={() => onFilterChange(value)} style={styles.segmentChip}>{label}</Chip>
                ))}
              </ScrollView>
            </Card.Content>
          </Card>
        </View>

        <View style={styles.historyMainColumn}>
          <ComparisonBoard items={comparisonItems} result={comparisonResult} loading={comparisonLoading} onRunComparison={onRunComparison} onOpenHistory={onOpenHistory} onRemove={onToggleCompare} styles={styles} helpers={helpers} />
          {loadingHistory ? (
            <LoadingCard text="Loading investigation history..." styles={styles} />
          ) : history.length === 0 ? (
            <EmptyState title="No saved investigations yet" body="Completed runs will appear here so you can review, pin, compare, or rerun them later." styles={styles} />
          ) : (
            <View style={styles.cardStack}>
              {history.map((item: InvestigationSummary) => (
                <HistoryItem
                  key={item.id}
                  item={item}
                  styles={styles}
                  helpers={helpers}
                  pinned={pinnedIds.includes(item.id)}
                  compared={comparisonIds.includes(item.id)}
                  onOpen={() => onOpenHistory(item.id)}
                  onDelete={() => onDeleteHistory(item.id)}
                  onCancel={() => onCancelInvestigation(item.id)}
                  onPin={() => onTogglePin(item.id)}
                  onCompare={() => onToggleCompare(item.id)}
                  onMoveUp={() => onMoveUp(item.id)}
                  onMoveDown={() => onMoveDown(item.id)}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function HistoryItem({ item, pinned, compared, onOpen, onDelete, onCancel, onPin, onCompare, onMoveUp, onMoveDown, styles, helpers }: any) {
  const meta = helpers.verdictMeta(item.verdict);
  const dragY = useRef(new Animated.Value(0)).current;

  return (
    <Animated.View style={{ transform: [{ translateY: dragY }] }}>
      <TouchableRipple onPress={onOpen} style={[styles.historyCard, pinned && styles.historyCardPinned]}>
        <View style={styles.cardStack}>
          <View style={styles.rowBetween}>
            <View style={styles.rowGap}>
              <HistoryVerdictMark verdict={item.verdict} styles={styles} helpers={helpers} />
              <View style={styles.flexOne}>
                <Text variant="titleMedium" style={styles.historyClaim}>{helpers.formatClaimForDisplay(item.claim)}</Text>
                <Text variant="bodySmall" style={styles.historySummary}>{item.summary}</Text>
              </View>
            </View>
            <Chip compact style={{ backgroundColor: meta.background }} textStyle={{ color: meta.color, fontFamily: "Poppins_600SemiBold" }}>
              {item.overallScore ?? "--"}/100
            </Chip>
          </View>
          <View style={styles.historyMetaRow}>
            <Chip compact style={styles.segmentChip}>{meta.label}</Chip>
            <Chip compact style={styles.segmentChip}>{helpers.depthLabel(item.desiredDepth)}</Chip>
            <Chip compact style={styles.segmentChip}>{helpers.safeUpper(item.confidenceLevel || "unknown")}</Chip>
            {compared ? <Chip compact style={styles.segmentChip}>Comparing</Chip> : null}
          </View>
          <Text variant="bodySmall" style={styles.historyMetaLine}>Updated {helpers.formatTimestamp(item.updatedAt)}</Text>
          <View style={styles.historyHeaderActions}>
            {helpers.isRunning(item.status) ? (
              <Button mode="outlined" compact icon="stop-circle-outline" onPress={onCancel} textColor={palette.warning}>Stop</Button>
            ) : null}
            <Button mode="outlined" compact icon="compare-horizontal" onPress={onCompare} textColor={palette.primary}>Compare</Button>
            <IconButton icon="arrow-up" size={16} onPress={onMoveUp} style={styles.webActionButton} />
            <IconButton icon="arrow-down" size={16} onPress={onMoveDown} style={styles.webActionButton} />
            <IconButton icon={pinned ? "pin-off-outline" : "pin-outline"} size={16} iconColor={palette.pin} style={[styles.webActionButton, styles.webPinButton]} onPress={onPin} />
            <IconButton icon="delete-outline" size={16} iconColor={palette.danger} style={[styles.webActionButton, styles.webDeleteButton]} onPress={onDelete} />
          </View>
        </View>
      </TouchableRipple>
    </Animated.View>
  );
}

function ComparisonBoard({ items, result, loading, onRunComparison, onOpenHistory, onRemove, styles, helpers }: { items: InvestigationSummary[]; result: InvestigationComparison | null; loading: boolean; onRunComparison: () => void; onOpenHistory: (id: string) => void; onRemove: (id: string) => void; styles: any; helpers: any; }) {
  const { width } = useWindowDimensions();
  const lastTapRef = useRef<Record<string, number>>({});
  const openTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  if (items.length === 0) return null;

  const groupedByClaim = new Map<string, InvestigationSummary[]>();
  for (const item of items) {
    const key = helpers.normalizedClaimKey(item.claim);
    groupedByClaim.set(key, [...(groupedByClaim.get(key) ?? []), item]);
  }
  const sameClaim = [...groupedByClaim.values()].some((group) => group.length > 1);
  const localCompatibility = items.length === 2 ? helpers.canCompareClaims(items[0], items[1]) : { allowed: false, similarity: 0 };
  const stackedCards = width < 760;

  return (
    <Card mode="contained" style={styles.resultSectionCard}>
      <Card.Content style={styles.cardStack}>
        <View style={styles.rowBetween}>
          <View style={styles.flexOne}>
            <Text variant="titleMedium" style={styles.linkTitle}>Multi-run comparison</Text>
            <Text variant="bodySmall" style={styles.sectionBody}>
              {sameClaim ? "These runs share the same claim, so you can compare reruns side by side." : "Compare two closely related runs to spot score, confidence, and evidence shifts."}
            </Text>
          </View>
          <View style={styles.historyMetaRow}>
            <Chip compact style={styles.segmentChip}>{items.length}/2 selected</Chip>
            {items.length === 2 ? <Chip compact style={styles.segmentChip}>{`Similarity ${localCompatibility.similarity}/100`}</Chip> : null}
          </View>
        </View>
        <View style={[styles.comparisonCardGrid, stackedCards && styles.comparisonCardGridStacked]}>
          {items.map((item) => {
            const meta = helpers.verdictMeta(item.verdict);
            const tone = helpers.scoreTone(item.overallScore);
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  const now = Date.now();
                  const lastTap = lastTapRef.current[item.id] ?? 0;
                  if (now - lastTap < 280) {
                    const pendingOpen = openTimerRef.current[item.id];
                    if (pendingOpen) clearTimeout(pendingOpen);
                    delete openTimerRef.current[item.id];
                    onRemove(item.id);
                    lastTapRef.current[item.id] = 0;
                    return;
                  }
                  lastTapRef.current[item.id] = now;
                  openTimerRef.current[item.id] = setTimeout(() => {
                    onOpenHistory(item.id);
                    delete openTimerRef.current[item.id];
                  }, 260);
                }}
                style={[styles.comparisonCard, stackedCards && styles.comparisonCardStacked]}
              >
                <View style={styles.cardStack}>
                  <View style={styles.rowBetween}>
                    <Chip compact style={{ backgroundColor: meta.background }} textStyle={{ color: meta.color, fontFamily: "Poppins_600SemiBold" }}>{meta.label}</Chip>
                    <Chip compact style={{ backgroundColor: tone.background }} textStyle={{ color: tone.color, fontFamily: "Poppins_700Bold" }}>{item.overallScore ?? "--"}/100</Chip>
                  </View>
                  <Text variant="titleSmall" style={styles.linkTitle}>{helpers.formatClaimForDisplay(item.claim)}</Text>
                  <Text variant="bodySmall" style={styles.sectionBody}>{item.summary}</Text>
                  <Text variant="bodySmall" style={styles.historyMetaLine}>Updated {helpers.formatTimestamp(item.updatedAt)}</Text>
                  <Text variant="bodySmall" style={styles.historyMetaLine}>Double-tap to remove from comparison.</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.resultActionRow}>
          <Button mode="contained" icon="compare-horizontal" onPress={onRunComparison} loading={loading} disabled={items.length !== 2 || !localCompatibility.allowed || loading} buttonColor={palette.primary}>
            Compare selected runs
          </Button>
        </View>
        {result ? (
          <Card mode="contained" style={styles.comparisonInsightCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.linkTitle}>Comparison snapshot</Text>
              <Text variant="bodyMedium" style={styles.resultBody}>{result.shortSnippet || result.summary}</Text>
              <Text variant="bodySmall" style={styles.sectionBody}>{result.detail}</Text>
            </Card.Content>
          </Card>
        ) : null}
      </Card.Content>
    </Card>
  );
}

function HistoryVerdictMark({ verdict, styles, helpers }: { verdict: InvestigationSummary["verdict"]; styles: any; helpers: any }) {
  const meta = helpers.verdictMeta(verdict);
  return (
    <View style={[styles.historyVerdictMark, { backgroundColor: meta.background }]}>
      <MaterialCommunityIcons name={meta.icon as MaterialIconName} size={18} color={meta.color} />
    </View>
  );
}

function MiniStat({ label, value, styles }: { label: string; value: string; styles: any }) {
  return (
    <View style={styles.miniStat}>
      <Text variant="labelMedium" style={styles.miniStatLabel}>{label}</Text>
      <Text variant="titleSmall" style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}
