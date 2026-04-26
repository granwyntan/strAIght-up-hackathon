import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Avatar, Button, Card, Chip, IconButton, Text, TextInput, TouchableRipple } from "react-native-paper";

import { palette, type InvestigationSummary } from "../data";
import SectionTabs from "../components/shared/SectionTabs";
import { EmptyState, InvestigationResult, LoadingCard, ProcessingCard } from "../components/consultant/InvestigationResult";
import type { ConsultantPageProps, ConsultantView, HistoryFilter, HistorySort, InvestigationComparison, MaterialIconName } from "../components/consultant/types";

const HISTORY_SWIPE_THRESHOLD = 72;
const HISTORY_SWIPE_LIMIT = 108;
const MOBILE_REORDER_STEP = 76;

function clampHistorySwipe(value: number) {
  return Math.max(-HISTORY_SWIPE_LIMIT, Math.min(HISTORY_SWIPE_LIMIT, value));
}

function clampHistoryDrag(value: number) {
  return Math.max(-160, Math.min(160, value));
}

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

  const suggestionGroups = useMemo(
    () =>
      [
        { key: "recent", title: "Recent queries", items: recentQueryMatches },
        { key: "live", title: "Search suggestions", items: liveQueryMatches, loading: suggestionsLoading },
      ].filter((group) => group.items.length > 0),
    [liveQueryMatches, recentQueryMatches, suggestionsLoading]
  );
  const showSuggestionFlyout = healthGuard.allowed && (suggestionGroups.length > 0 || (suggestionsLoading && helpers.safeTrim(claimDraft).length >= 2));

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
                    <View style={styles.floatingFieldWrap}>
                      <TextInput
                        mode="outlined"
                        placeholder="Example: Magnesium glycinate cures insomnia."
                        value={claimDraft}
                        onChangeText={onClaimChange}
                        style={styles.searchbar}
                        outlineStyle={styles.inputOutline}
                        contentStyle={styles.searchbarInput}
                        activeOutlineColor={palette.primary}
                      />
                      {showSuggestionFlyout ? (
                        <Card mode="contained" style={styles.suggestionFlyout}>
                          <Card.Content style={styles.suggestionFlyoutContent}>
                            {suggestionGroups.map((group) => (
                              <View key={group.key} style={styles.suggestionGroup}>
                                <View style={styles.rowBetween}>
                                  <Text variant="bodySmall" style={styles.historyMetaLine}>
                                    {group.title}
                                  </Text>
                                  {group.loading ? <ActivityIndicator size="small" color={palette.primary} /> : null}
                                </View>
                                {group.items.map((item, index) => (
                                  <TouchableRipple key={item.id} style={[styles.recentQueryRow, index > 0 && styles.suggestionDivider]} onPress={() => onUseClaim(item)}>
                                    <View style={styles.cardStack}>
                                      <Text variant="bodyMedium" style={styles.linkTitle}>
                                        {helpers.formatClaimForDisplay(item.claim)}
                                      </Text>
                                    </View>
                                  </TouchableRipple>
                                ))}
                              </View>
                            ))}
                            {suggestionsLoading && suggestionGroups.length === 0 ? (
                              <View style={styles.suggestionLoadingRow}>
                                <ActivityIndicator size="small" color={palette.primary} />
                                <Text variant="bodySmall" style={styles.historyMetaLine}>
                                  Looking for similar claims...
                                </Text>
                              </View>
                            ) : null}
                          </Card.Content>
                        </Card>
                      ) : null}
                    </View>
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
                      <TextInput
                        mode="outlined"
                        placeholder="What do you want checked?"
                        value={contextDraft}
                        onChangeText={onContextChange}
                        style={styles.searchbar}
                        outlineStyle={styles.inputOutline}
                        contentStyle={styles.searchbarInput}
                        activeOutlineColor={palette.primary}
                      />
                      <TextInput
                        mode="outlined"
                        placeholder="Where did you see this?"
                        value={claimSourceDraft}
                        onChangeText={onClaimSourceChange}
                        style={styles.searchbar}
                        outlineStyle={styles.inputOutline}
                        contentStyle={styles.searchbarInput}
                        activeOutlineColor={palette.primary}
                      />
                      <TextInput
                        mode="outlined"
                        placeholder="Links to review"
                        value={sourceUrlDraft}
                        onChangeText={onSourceUrlChange}
                        style={styles.searchbar}
                        outlineStyle={styles.inputOutline}
                        contentStyle={styles.searchbarInput}
                        activeOutlineColor={palette.primary}
                      />
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

                <Button mode="contained" onPress={onSubmit} loading={submitting} disabled={submitting || !healthGuard.allowed} buttonColor={palette.primary}>
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
                Current-session progress and results appear here.
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
              <EmptyState title="No active investigation" body="Start a review to see the live report here." styles={styles} />
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
                  <View style={styles.rowGap}>
                    <MaterialCommunityIcons name="dots-vertical" size={16} color={palette.muted} />
                    <Text variant="bodySmall" style={styles.sectionBody}>
                      Use 3 dots to move cards. Swipe right to pin and left to delete.
                    </Text>
                  </View>
                </View>
                <Button mode="text" textColor={palette.danger} onPress={onClearHistory}>
                  Clear history
                </Button>
              </View>
              <TextInput
                mode="outlined"
                placeholder="Search claim, verdict, or summary"
                value={historyQuery}
                onChangeText={onHistoryQueryChange}
                style={styles.searchbar}
                outlineStyle={styles.inputOutline}
                contentStyle={styles.searchbarInput}
                activeOutlineColor={palette.primary}
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
            <EmptyState title="No saved investigations yet" body="Completed runs appear here for review, pinning, comparison, or reruns." styles={styles} />
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
  const scoreMeta = helpers.scoreTone(item.overallScore, item.verdict);
  const dragY = useRef(new Animated.Value(0)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const [reorderMode, setReorderMode] = useState(false);
  const reorderModeRef = useRef(false);
  const swipeLockedRef = useRef(false);
  const dragStepsRef = useRef(0);
  const panActiveRef = useRef(false);
  const isWeb = Platform.OS === "web";

  const setReorderState = (nextValue: boolean) => {
    reorderModeRef.current = nextValue;
    if (!nextValue) {
      panActiveRef.current = false;
    }
    setReorderMode(nextValue);
  };

  const resetSwipe = useMemo(
    () => () =>
      Animated.spring(swipeX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 12,
      }).start(),
    [swipeX]
  );

  const resetDrag = useMemo(
    () => () =>
      Animated.spring(dragY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 12,
      }).start(),
    [dragY]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          reorderModeRef.current && !isWeb
            ? Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
            : Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          reorderModeRef.current && !isWeb
            ? Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) >= Math.abs(gesture.dx)
            : false,
        onPanResponderGrant: () => {
          panActiveRef.current = true;
          if (reorderModeRef.current && !isWeb) {
            dragY.stopAnimation();
            swipeX.stopAnimation();
            return;
          }
          swipeLockedRef.current = false;
          swipeX.stopAnimation();
        },
        onPanResponderMove: (_event, gesture) => {
          if (reorderModeRef.current && !isWeb) {
            dragY.setValue(clampHistoryDrag(gesture.dy));
            return;
          }
          if (swipeLockedRef.current) return;
          swipeX.setValue(clampHistorySwipe(gesture.dx));
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_event, gesture) => {
          panActiveRef.current = false;
          if (reorderModeRef.current && !isWeb) {
            const steps = Math.min(3, Math.floor(Math.abs(gesture.dy) / MOBILE_REORDER_STEP));
            dragStepsRef.current = steps;
            if (steps > 0) {
              for (let index = 0; index < steps; index += 1) {
                if (gesture.dy < 0) {
                  onMoveUp();
                } else {
                  onMoveDown();
                }
              }
            }
            resetDrag();
            setReorderState(false);
            return;
          }

          if (gesture.dx <= -HISTORY_SWIPE_THRESHOLD) {
            swipeLockedRef.current = true;
            Animated.timing(swipeX, {
              toValue: -HISTORY_SWIPE_LIMIT,
              duration: 120,
              useNativeDriver: true,
            }).start(() => {
              swipeX.setValue(0);
              onDelete();
            });
            return;
          }

          if (gesture.dx >= HISTORY_SWIPE_THRESHOLD) {
            swipeLockedRef.current = true;
            Animated.timing(swipeX, {
              toValue: HISTORY_SWIPE_LIMIT,
              duration: 120,
              useNativeDriver: true,
            }).start(() => {
              swipeX.setValue(0);
              onPin();
            });
            return;
          }

          resetSwipe();
        },
        onPanResponderTerminate: () => {
          panActiveRef.current = false;
          if (reorderModeRef.current && !isWeb) {
            setReorderState(false);
            resetDrag();
            return;
          }
          resetSwipe();
        },
      }),
    [dragY, isWeb, onDelete, onMoveDown, onMoveUp, onPin, resetDrag, resetSwipe, swipeX]
  );

  return (
    <Animated.View style={{ transform: [{ translateY: dragY }] }}>
      <View style={styles.historySwipeShell}>
        <View pointerEvents="none" style={styles.historyRails}>
          <View style={styles.pinRail}>
            <Avatar.Icon size={34} icon={pinned ? "pin-off-outline" : "pin-outline"} color={palette.pin} style={styles.pinRailAvatar} />
          </View>
          <View style={styles.deleteRail}>
            <Avatar.Icon size={34} icon="delete-outline" color={palette.danger} style={styles.deleteRailAvatar} />
          </View>
        </View>
        <Animated.View style={{ transform: [{ translateX: swipeX }] }} {...panResponder.panHandlers}>
          <TouchableRipple
            onPress={reorderMode && !isWeb ? undefined : onOpen}
            onLongPress={() => {
              if (isWeb) return;
              dragStepsRef.current = 0;
              dragY.setValue(0);
              swipeX.setValue(0);
              setReorderState(true);
            }}
            delayLongPress={220}
            style={[styles.historyCard, pinned && styles.historyCardPinned, reorderMode && styles.historyCardDragging]}
          >
            <View style={styles.cardStack}>
              <View style={styles.rowBetween}>
                <View style={styles.rowGap}>
                  <HistoryVerdictMark verdict={item.verdict} styles={styles} helpers={helpers} />
                  <View style={styles.flexOne}>
                    <Text variant="titleMedium" style={styles.historyClaim}>{helpers.formatClaimForDisplay(item.claim)}</Text>
                    <Text variant="bodySmall" style={styles.historySummary}>{item.summary}</Text>
                    {helpers.safeTrim(item.context) ? (
                      <Text variant="bodySmall" style={styles.historyMetaLine} numberOfLines={2}>
                        {`Context: ${helpers.safeTrim(item.context)}`}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Chip compact style={{ backgroundColor: scoreMeta.background }} textStyle={{ color: scoreMeta.color, fontFamily: "Poppins_600SemiBold" }}>
                  {item.overallScore ?? "--"}/100
                </Chip>
              </View>
              <View style={styles.historyMetaRow}>
                <Chip compact style={styles.segmentChip}>{meta.label}</Chip>
                <Chip compact style={styles.segmentChip}>{helpers.depthLabel(item.desiredDepth)}</Chip>
                <Chip compact style={styles.segmentChip}>{helpers.safeUpper(item.confidenceLevel || "unknown")}</Chip>
                {pinned ? <Chip compact style={styles.segmentChip}>Pinned</Chip> : null}
                {compared ? <Chip compact style={styles.segmentChip}>Comparing</Chip> : null}
              </View>
              <Text variant="bodySmall" style={styles.historyMetaLine}>Updated {helpers.formatTimestamp(item.updatedAt)}</Text>
              {!isWeb ? (
                <Text variant="bodySmall" style={styles.dragModeHint}>
                  {reorderMode ? "Drag anywhere on the card to reorder, or tap the dots again to cancel." : "Touch and hold to turn on drag."}
                </Text>
              ) : null}
              <View style={styles.historyHeaderActions}>
                {helpers.isRunning(item.status) ? (
                  <Button mode="outlined" compact icon="stop-circle-outline" onPress={onCancel} textColor={palette.warning}>Stop</Button>
                ) : null}
                <Button mode="outlined" compact icon={compared ? "check-circle-outline" : "compare-horizontal"} onPress={onCompare} textColor={palette.primary}>
                  {compared ? "Selected" : "Compare"}
                </Button>
                <IconButton
                  icon={reorderMode ? "drag" : "dots-vertical"}
                  size={16}
                  onPress={() => {
                    dragY.setValue(0);
                    swipeX.setValue(0);
                    setReorderState(!reorderModeRef.current);
                  }}
                  style={[styles.webActionButton, reorderMode && styles.dragButtonActive]}
                />
                {reorderMode && isWeb ? <IconButton icon="arrow-up" size={16} onPress={onMoveUp} style={styles.webActionButton} /> : null}
                {reorderMode && isWeb ? <IconButton icon="arrow-down" size={16} onPress={onMoveDown} style={styles.webActionButton} /> : null}
                {reorderMode && !isWeb ? (
                  <>
                    <Chip compact style={styles.segmentChip} icon="drag-vertical">
                      Drag card
                    </Chip>
                    <IconButton icon="arrow-up" size={16} onPress={onMoveUp} style={styles.webActionButton} />
                    <IconButton icon="arrow-down" size={16} onPress={onMoveDown} style={styles.webActionButton} />
                  </>
                ) : null}
              </View>
            </View>
          </TouchableRipple>
        </Animated.View>
      </View>
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
            const tone = helpers.scoreTone(item.overallScore, item.verdict);
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
