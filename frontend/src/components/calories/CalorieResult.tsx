// @ts-nocheck
import React, { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { palette } from "../../data";

function renderInlineMarkdown(text, keyPrefix) {
  const content = typeof text === "string" ? text : "";
  const chunks = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return chunks.map((chunk, index) => {
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return (
        <Text key={`${keyPrefix}-b-${index}`} style={styles.inlineBold}>
          {chunk.slice(2, -2)}
        </Text>
      );
    }
    if (chunk.startsWith("*") && chunk.endsWith("*")) {
      return (
        <Text key={`${keyPrefix}-i-${index}`} style={styles.inlineItalic}>
          {chunk.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={`${keyPrefix}-t-${index}`}>{chunk}</Text>;
  });
}

function renderMarkdownBlock(content, keyPrefix) {
  const lines = (typeof content === "string" ? content : "").split("\n");
  return (
    <View style={styles.markdownBlock}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) {
          return <View key={`${keyPrefix}-sp-${index}`} style={styles.blankLine} />;
        }
        const bulletMatch = line.match(/^[-*]\s+(.*)$/);
        const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
        if (bulletMatch || numberedMatch) {
          const bulletText = (bulletMatch || numberedMatch)?.[1] || line;
          return (
            <View key={`${keyPrefix}-li-${index}`} style={styles.bulletRow}>
              <Text style={styles.bulletMarker}>•</Text>
              <Text style={styles.sectionBody}>{renderInlineMarkdown(bulletText, `${keyPrefix}-li-inline-${index}`)}</Text>
            </View>
          );
        }
        return (
          <Text key={`${keyPrefix}-p-${index}`} style={styles.sectionBody}>
            {renderInlineMarkdown(line, `${keyPrefix}-p-inline-${index}`)}
          </Text>
        );
      })}
    </View>
  );
}

function parseBulletMap(content) {
  const result = {};
  const lines = (typeof content === "string" ? content : "").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[-*=]\s*/, "");
    const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (!match) continue;
    result[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return result;
}

function parseNumericValue(rawValue) {
  const text = typeof rawValue === "string" ? rawValue : "";
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function sectionMeta(heading) {
  const normalized = (heading || "").trim().toLowerCase();
  if (normalized.includes("top summary")) {
    return { icon: "star-four-points-outline", accent: palette.primary };
  }
  if (normalized.includes("nutrition")) {
    return { icon: "chart-bar-stacked", accent: palette.success };
  }
  if (normalized.includes("body impact")) {
    return { icon: "heart-pulse", accent: palette.warning };
  }
  if (normalized.includes("quality")) {
    return { icon: "leaf-circle-outline", accent: palette.primary };
  }
  if (normalized.includes("claims")) {
    return { icon: "shield-check-outline", accent: palette.secondary };
  }
  if (normalized.includes("personalized")) {
    return { icon: "account-heart-outline", accent: palette.danger };
  }
  if (normalized.includes("ingredient")) {
    return { icon: "format-list-bulleted-square", accent: palette.primary };
  }
  if (normalized.includes("suggest")) {
    return { icon: "lightbulb-on-outline", accent: palette.success };
  }
  return { icon: "text-box-outline", accent: palette.primary };
}

function buildQuickTags(topSummaryMap) {
  const tags = [];
  const quickTags = topSummaryMap["quick tags"];
  if (quickTags) {
    quickTags
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3)
      .forEach((item) => tags.push(item));
  }
  return tags;
}

function buildNutritionMetrics(nutritionMap, totalEstimatedCalories) {
  const metrics = [];
  const pushMetric = (label, value) => {
    if (typeof value === "string" && value.trim()) {
      metrics.push({ label, value: value.trim() });
    }
  };

  pushMetric("Protein", nutritionMap["protein"]);
  pushMetric("Carbs", nutritionMap["carbs"]);
  pushMetric("Fat", nutritionMap["fat"]);
  pushMetric("Sugar", nutritionMap["sugar"]);
  pushMetric("Caffeine", nutritionMap["caffeine"]);
  pushMetric("Alcohol", nutritionMap["alcohol"]);
  pushMetric("Sodium", nutritionMap["sodium"]);
  return metrics.slice(0, 6);
}

function parseStructuredBullets(content) {
  return (typeof content === "string" ? content : "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((part) => part.trim()).filter(Boolean));
}

function parseProfileImpactCards(content) {
  return parseStructuredBullets(content).map((parts, index) => {
    const [label, detail = "", note = ""] = parts;
    return {
      id: `profile-${index}`,
      label: label || "Profile fit",
      detail,
      note,
    };
  });
}

function sanitizeSectionContent(content) {
  return (typeof content === "string" ? content : "")
    .split("\n")
    .filter((line) => !/^\s*total estimated calories\b/i.test(line.trim()))
    .join("\n")
    .trim();
}

function parseProsConsCards(content, kind) {
  return parseStructuredBullets(content).map((parts, index) => {
    const [title, detail = "", note = ""] = parts;
    return {
      id: `${kind}-${index}`,
      title: title || (kind === "benefit" ? "Benefit" : "Drawback"),
      detail,
      note,
    };
  });
}

function parseClaimRealityCards(content) {
  return parseStructuredBullets(content).map((parts, index) => {
    const [claim, verdict = "", rationale = ""] = parts;
    return {
      id: `claim-${index}`,
      claim: claim || "Claim",
      verdict,
      rationale,
    };
  });
}

function chipTone(value) {
  const lowered = (value || "").toLowerCase();
  if (/(support|good|stable|fit|minimal|hydrating|benefit)/.test(lowered)) {
    return { backgroundColor: `${palette.success}16`, color: palette.success };
  }
  if (/(high|warning|spike|drawback|alert|weak|misleading|watch-out)/.test(lowered)) {
    return { backgroundColor: `${palette.danger}14`, color: palette.danger };
  }
  return { backgroundColor: palette.primarySoft, color: palette.primary };
}

export default function CalorieResult({ result }) {
  const sections = Array.isArray(result?.sections) ? result.sections : [];
  const topSummarySection = sections.find((section) => /summary|top summary|meal summary/i.test(section.heading || ""));
  const nutritionSection = sections.find((section) => /nutrition overview|itemized breakdown/i.test(section.heading || ""));
  const ingredientsSection = sections.find((section) => /^ingredients$/i.test(section.heading || ""));
  const bodyImpactSection = sections.find((section) => /body impact|daily intake context/i.test(section.heading || ""));
  const claimsSection = sections.find((section) => /claims vs reality/i.test(section.heading || ""));
  const profileSection = sections.find((section) => /personalized impact|how this affects you/i.test(section.heading || ""));
  const benefitsSection = sections.find((section) => /^benefits$/i.test(section.heading || ""));
  const drawbacksSection = sections.find((section) => /^drawbacks$/i.test(section.heading || ""));
  const qualitySection = sections.find((section) => /food or drink quality|quality/i.test(section.heading || ""));
  const suggestionsSection = sections.find((section) => /smart suggestions|suggestions/i.test(section.heading || ""));
  const topSummaryMap = useMemo(() => parseBulletMap(topSummarySection?.content), [topSummarySection?.content]);
  const nutritionMap = useMemo(() => parseBulletMap(nutritionSection?.content), [nutritionSection?.content]);
  const bodyImpactMap = useMemo(() => parseBulletMap(bodyImpactSection?.content), [bodyImpactSection?.content]);
  const quickTags = useMemo(() => buildQuickTags(topSummaryMap), [topSummaryMap]);
  const nutritionMetrics = useMemo(() => buildNutritionMetrics(nutritionMap, result?.totalEstimatedCalories), [nutritionMap, result?.totalEstimatedCalories]);
  const profileCards = useMemo(
    () =>
      parseProfileImpactCards(profileSection?.content).filter(
        (item) =>
          item.detail ||
          item.note ||
          !/(no major mismatch detected|not applicable|none noted)/i.test(`${item.label} ${item.detail} ${item.note}`)
      ),
    [profileSection?.content]
  );
  const benefitCards = useMemo(() => parseProsConsCards(benefitsSection?.content, "benefit"), [benefitsSection?.content]);
  const drawbackCards = useMemo(() => parseProsConsCards(drawbacksSection?.content, "drawback"), [drawbacksSection?.content]);
  const claimCards = useMemo(() => parseClaimRealityCards(claimsSection?.content), [claimsSection?.content]);

  if (!result) {
    return null;
  }

  const healthScore = parseNumericValue(topSummaryMap["health score"]);
  const overallRead = topSummaryMap["overall read"] || "";
  const fitLabel = typeof healthScore === "number" ? (healthScore >= 75 ? "Supportive" : healthScore >= 50 ? "Mixed" : "Watch-outs") : overallRead || "Quick read";
  const confidence = topSummaryMap["confidence"] || "Estimated from visible food cues";
  const proteinValue = Math.max(0, parseNumericValue(nutritionMap["protein"]) || 0);
  const carbsValue = Math.max(0, parseNumericValue(nutritionMap["carbs"]) || 0);
  const fatValue = Math.max(0, parseNumericValue(nutritionMap["fat"]) || 0);
  const macroTotal = Math.max(1, proteinValue + carbsValue + fatValue);
  const summaryLine = topSummaryMap["item"] || result.analysisText.split("\n").find((line) => line.trim())?.replace(/^Food Name:\s*/i, "").trim() || "Consumable analysis";
  const portionLine = topSummaryMap["portion"] || "Estimated from the uploaded image";
  const contextLine = topSummaryMap["context"] || "General dietary review";
  const extendedSummary = topSummaryMap["extended summary"] || topSummaryMap["overall read"] || "";
  const topCaloriesLabel =
    typeof result?.totalEstimatedCalories === "number" && Number.isFinite(result.totalEstimatedCalories)
      ? `${Math.round(result.totalEstimatedCalories)} kcal`
      : nutritionMap["calories"] || "Estimate unavailable";

  const handledSectionKeys = new Set(
    [
      topSummarySection?.heading,
      nutritionSection?.heading,
      ingredientsSection?.heading,
      bodyImpactSection?.heading,
      profileSection?.heading,
      benefitsSection?.heading,
      drawbacksSection?.heading,
      claimsSection?.heading,
      qualitySection?.heading,
      suggestionsSection?.heading,
    ]
      .filter(Boolean)
      .map((heading) => (heading || "").trim().toLowerCase())
  );

  return (
    <View style={styles.card}>
      <AccordionSection title="Summary" accent={palette.primary} icon="text-box-check-outline" defaultExpanded>
      <View style={styles.heroCard}>
        <View style={styles.heroHeaderRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.cardTitle}>Diet analysis</Text>
            <Text style={styles.heroTitle}>{summaryLine}</Text>
            <Text style={styles.heroSubline}>
              {portionLine} · {contextLine}
            </Text>
            {extendedSummary ? <Text style={styles.heroDetail}>{extendedSummary}</Text> : null}
          </View>
          <View style={styles.scoreRing}>
            <Text style={styles.scoreValue}>{typeof healthScore === "number" ? Math.round(healthScore) : fitLabel}</Text>
            <Text style={styles.scoreLabel}>{typeof healthScore === "number" ? fitLabel : "Overall read"}</Text>
          </View>
        </View>

        <View style={styles.contextRow}>
          <Metric label="Estimated calories" value={topCaloriesLabel} />
          <Metric label="Confidence" value={confidence} wide />
          <Metric label="Daily target" value={`${result.calorieContext.dailyTarget} kcal`} />
          {typeof result.calorieContext.bmr === "number" ? <Metric label="BMR" value={`${result.calorieContext.bmr} kcal`} /> : null}
        </View>

        {quickTags.length > 0 ? (
          <View style={styles.tagRow}>
            {quickTags.map((tag) => (
              <View key={tag} style={styles.quickTag}>
                <Text style={styles.quickTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {(proteinValue > 0 || carbsValue > 0 || fatValue > 0) ? (
          <View style={styles.macroBlock}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionMiniTitle}>Macro balance</Text>
              <Text style={styles.contextText}>Protein / Carbs / Fat</Text>
            </View>
            <View style={styles.macroTrack}>
              <View style={[styles.macroSegment, { flex: proteinValue / macroTotal, backgroundColor: palette.success }]} />
              <View style={[styles.macroSegment, { flex: carbsValue / macroTotal, backgroundColor: palette.warning }]} />
              <View style={[styles.macroSegment, { flex: fatValue / macroTotal, backgroundColor: palette.primary }]} />
            </View>
          </View>
        ) : null}
      </View>
      </AccordionSection>

      {nutritionMetrics.length > 0 ? (
        <AccordionSection title="Summary details" accent={palette.secondary} icon="chart-donut">
        <View style={styles.metricGrid}>
          {nutritionMetrics.map((item) => (
            <Metric key={item.label} label={item.label} value={item.value} />
          ))}
        </View>
        </AccordionSection>
      ) : null}

      {ingredientsSection ? (
        <AccordionSection title="Ingredients" accent={palette.success} icon="format-list-bulleted-square">
          {renderMarkdownBlock(sanitizeSectionContent(ingredientsSection.content || "-"), "ingredients")}
        </AccordionSection>
      ) : null}

      {bodyImpactSection ? (
        <AccordionSection title="Body impact" accent={palette.warning} icon="heart-pulse" defaultExpanded>
          <View style={styles.impactRow}>
          {["blood sugar impact", "energy effect", "fullness", "hydration", "stimulant effect", "alcohol effect"]
            .filter((key) => bodyImpactMap[key])
            .slice(0, 4)
            .map((key) => (
              <View key={key} style={styles.impactCard}>
                <Text style={styles.metricLabel}>{key.replace(/\b\w/g, (char) => char.toUpperCase())}</Text>
                <Text style={styles.impactValue}>{bodyImpactMap[key]}</Text>
              </View>
            ))}
          </View>
        </AccordionSection>
      ) : null}

      {profileCards.length > 0 ? (
        <AccordionSection title="How this affects you" accent={palette.primary} icon="account-heart-outline" defaultExpanded>
          <View style={styles.profileImpactStack}>
            {profileCards.map((item) => {
              const tone = chipTone(item.label);
              return (
                <View key={item.id} style={styles.profileImpactCard}>
                  <View style={[styles.inlineChip, { backgroundColor: tone.backgroundColor }]}>
                    <Text style={[styles.inlineChipText, { color: tone.color }]}>{item.label}</Text>
                  </View>
                  {item.detail ? <Text style={styles.profileImpactDetail}>{item.detail}</Text> : null}
                  {item.note ? <Text style={styles.profileImpactNote}>{item.note}</Text> : null}
                </View>
              );
            })}
          </View>
        </AccordionSection>
      ) : null}

      {claimCards.length > 0 ? (
        <AccordionSection title="Claims vs reality" accent={palette.secondary} icon="shield-check-outline">
          <View style={styles.cardStack}>
            {claimCards.map((item) => {
              const tone = chipTone(item.verdict);
              return (
                <View key={item.id} style={styles.subCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.subCardTitle}>{item.claim}</Text>
                    {item.verdict ? (
                      <View style={[styles.inlineChip, { backgroundColor: tone.backgroundColor }]}>
                        <Text style={[styles.inlineChipText, { color: tone.color }]}>{item.verdict}</Text>
                      </View>
                    ) : null}
                  </View>
                  {item.rationale ? <Text style={styles.subCardBody}>{item.rationale}</Text> : null}
                </View>
              );
            })}
          </View>
        </AccordionSection>
      ) : null}

      {(benefitCards.length > 0 || drawbackCards.length > 0) ? (
        <>
          {benefitCards.length > 0 ? (
            <AccordionSection title="Benefits" accent={palette.success} icon="thumb-up-outline">
              <View style={styles.cardStack}>
                {benefitCards.map((item) => (
                  <View key={item.id} style={styles.subCard}>
                    <Text style={styles.subCardTitle}>{item.title}</Text>
                    {item.detail ? <Text style={styles.subCardBody}>{item.detail}</Text> : null}
                    {item.note ? <Text style={styles.subCardMuted}>{item.note}</Text> : null}
                  </View>
                ))}
              </View>
            </AccordionSection>
          ) : null}
          {drawbackCards.length > 0 ? (
            <AccordionSection title="Drawbacks" accent={palette.danger} icon="alert-circle-outline">
              <View style={styles.cardStack}>
                {drawbackCards.map((item) => (
                  <View key={item.id} style={styles.subCard}>
                    <Text style={styles.subCardTitle}>{item.title}</Text>
                    {item.detail ? <Text style={styles.subCardBody}>{item.detail}</Text> : null}
                    {item.note ? <Text style={styles.subCardMuted}>{item.note}</Text> : null}
                  </View>
                ))}
              </View>
            </AccordionSection>
          ) : null}
        </>
      ) : null}

          {qualitySection ? (
        <AccordionSection title="Food or drink quality" accent={palette.primary} icon="leaf-circle-outline">
          {renderMarkdownBlock(sanitizeSectionContent(qualitySection.content || "-"), "quality")}
        </AccordionSection>
      ) : null}

      {suggestionsSection ? (
        <AccordionSection title="Smart suggestions" accent={palette.success} icon="lightbulb-on-outline" defaultExpanded>
          {renderMarkdownBlock(sanitizeSectionContent(suggestionsSection.content || "-"), "suggestions")}
        </AccordionSection>
      ) : null}

      <ScrollView style={styles.resultScroller} contentContainerStyle={styles.resultContent} nestedScrollEnabled>
        {sections.length > 0
          ? sections.map((section, index) => {
              if (handledSectionKeys.has((section.heading || "").trim().toLowerCase())) {
                return null;
              }
              const meta = sectionMeta(section.heading);
                return (
                <AccordionSection key={`${section.heading}-${index}`} title={section.heading} accent={meta.accent} icon={meta.icon}>
                  {renderMarkdownBlock(sanitizeSectionContent(section.content || "-"), `calorie-section-${index}`)}
                </AccordionSection>
              );
            })
          : renderMarkdownBlock(sanitizeSectionContent(result.analysisText), "calorie-fallback")}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, wide = false }) {
  return (
    <View style={[styles.metricTile, wide && styles.metricTileWide]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function AccordionSection({ title, accent, icon, children, style, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={[styles.sectionCard, style]}>
      <Pressable style={styles.sectionHeader} onPress={() => setExpanded((value) => !value)}>
        <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}16` }]}>
          <MaterialCommunityIcons name={icon} size={18} color={accent} />
        </View>
        <Text style={[styles.sectionHeading, { color: accent }]}>{title}</Text>
        <View style={styles.sectionChevron}>
          <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={accent} />
        </View>
      </Pressable>
      {expanded ? <View style={styles.sectionContent}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 14,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 16,
    gap: 12,
  },
  heroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    lineHeight: 28,
  },
  heroSubline: {
    color: palette.muted,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
  },
  heroDetail: {
    color: palette.ink,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
  },
  scoreRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 6,
    borderColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  scoreValue: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
  },
  scoreLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
  },
  contextRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inlineChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineChipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  metricTile: {
    minWidth: 102,
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  metricTileWide: {
    minWidth: 160,
    flexBasis: "100%",
  },
  metricLabel: {
    color: palette.muted,
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
  },
  metricValue: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickTag: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickTagText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  macroBlock: {
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionMiniTitle: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  contextText: {
    color: palette.muted,
    lineHeight: 19,
    fontFamily: "Poppins_400Regular",
  },
  macroTrack: {
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
  },
  macroSegment: {
    height: "100%",
  },
  impactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  impactCard: {
    flexGrow: 1,
    flexBasis: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  impactValue: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 19,
  },
  profileImpactStack: {
    gap: 10,
  },
  profileImpactCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
  },
  profileImpactDetail: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    lineHeight: 19,
  },
  profileImpactNote: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  prosConsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  prosConsColumn: {
    flex: 1,
    minWidth: 240,
  },
  resultScroller: {
    maxHeight: 560,
  },
  resultContent: {
    gap: 12,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionChevron: {
    marginLeft: "auto",
  },
  sectionContent: {
    gap: 10,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeading: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  markdownBlock: {
    gap: 6,
  },
  blankLine: {
    height: 4,
  },
  sectionBody: {
    color: palette.ink,
    lineHeight: 21,
    fontFamily: "Poppins_400Regular",
  },
  inlineBold: {
    fontFamily: "Poppins_700Bold",
  },
  inlineItalic: {
    fontFamily: "Poppins_400Regular",
    fontStyle: "italic",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletMarker: {
    color: palette.ink,
    lineHeight: 21,
    fontFamily: "Poppins_600SemiBold",
  },
});
