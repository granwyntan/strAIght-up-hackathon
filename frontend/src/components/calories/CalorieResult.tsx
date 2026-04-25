// @ts-nocheck
import React, { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { palette } from "../../data";

function parseNumericValue(rawValue) {
  const text = typeof rawValue === "string" ? rawValue : "";
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseLabelMap(content) {
  const map = {};
  const lines = (typeof content === "string" ? content : "").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^[-*]\s*/, "");
    const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (!match) continue;
    map[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return map;
}

function parsePipeBullets(content) {
  return (typeof content === "string" ? content : "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: `${index}-${line.slice(0, 24)}`,
      parts: line.split("|").map((part) => part.trim()).filter(Boolean),
    }));
}

function sanitizeSectionContent(content) {
  return (typeof content === "string" ? content : "")
    .split("\n")
    .filter((line) => !/^\s*total estimated calories\b/i.test(line.trim()))
    .join("\n")
    .trim();
}

function findSection(sections, pattern) {
  return sections.find((section) => pattern.test((section?.heading || "").trim()));
}

function pctString(value, total) {
  if (!(value > 0) || !(total > 0)) {
    return "0%";
  }
  return `${Math.round((value / total) * 100)}%`;
}

function pickTone(value) {
  const lowered = (value || "").toLowerCase();
  if (/(clean|supportive|good|high|ideal|best|stable|low risk|great)/.test(lowered)) {
    return { color: palette.success, backgroundColor: palette.successSoft, icon: "check-circle-outline" };
  }
  if (/(ultra|high sodium|high sugar|high glycemic|watch|less ideal|poor|dense|spike|crash|low fiber|alert|not ideal)/.test(lowered)) {
    return { color: palette.danger, backgroundColor: palette.dangerSoft, icon: "alert-circle-outline" };
  }
  return { color: palette.warning, backgroundColor: palette.warningSoft, icon: "information-outline" };
}

function toneForScore(score) {
  if (score >= 80) {
    return { color: palette.success, backgroundColor: palette.successSoft };
  }
  if (score >= 60) {
    return { color: palette.warning, backgroundColor: palette.warningSoft };
  }
  return { color: palette.danger, backgroundColor: palette.dangerSoft };
}

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

function sectionMeta(heading) {
  const normalized = (heading || "").trim().toLowerCase();
  if (normalized.includes("macro")) return { icon: "chart-box-outline", accent: palette.primary };
  if (normalized.includes("goal")) return { icon: "bullseye-arrow", accent: palette.success };
  if (normalized.includes("ingredient")) return { icon: "food-apple-outline", accent: palette.warning };
  if (normalized.includes("health")) return { icon: "heart-pulse", accent: palette.danger };
  if (normalized.includes("personal")) return { icon: "account-heart-outline", accent: palette.primary };
  if (normalized.includes("satiety")) return { icon: "silverware-fork-knife", accent: palette.success };
  if (normalized.includes("timing")) return { icon: "clock-outline", accent: palette.secondary };
  if (normalized.includes("optimization")) return { icon: "swap-horizontal", accent: palette.success };
  if (normalized.includes("micronutrient")) return { icon: "molecule", accent: palette.warning };
  if (normalized.includes("why")) return { icon: "lightbulb-on-outline", accent: palette.primary };
  return { icon: "text-box-outline", accent: palette.primary };
}

function MetricTile({ label, value, muted = false }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
        {label}
      </Text>
      <Text style={[styles.metricValue, muted && styles.metricValueMuted]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>
        {value || "-"}
      </Text>
    </View>
  );
}

function DataLine({ label, value }) {
  if (!value) {
    return null;
  }
  return (
    <View style={styles.dataLine}>
      <Text style={styles.dataLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
        {label}
      </Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

function AccentChip({ label, tone }) {
  return (
    <View style={[styles.chip, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.chipText, { color: tone.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
        {label}
      </Text>
    </View>
  );
}

function AccordionSection({ title, accent, icon, children, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.sectionCard}>
      <Pressable style={styles.sectionHeader} onPress={() => setExpanded((value) => !value)}>
        <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}18` }]}>
          <MaterialCommunityIcons name={icon} size={18} color={accent} />
        </View>
        <Text style={[styles.sectionHeading, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
          {title}
        </Text>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={accent} style={styles.sectionChevron} />
      </Pressable>
      {expanded ? <View style={styles.sectionContent}>{children}</View> : null}
    </View>
  );
}

export default function CalorieResult({ result }) {
  const sections = Array.isArray(result?.sections) ? result.sections : [];
  const overviewSection = findSection(sections, /calorie\s*&\s*macro overview|summary/i);
  const goalSection = findSection(sections, /goal alignment score/i);
  const ingredientSection = findSection(sections, /ingredient quality analysis|ingredients/i);
  const healthSection = findSection(sections, /health impact layer|body impact/i);
  const personalizationSection = findSection(sections, /personalization layer|how this affects you|personalized impact/i);
  const satietySection = findSection(sections, /satiety\s*&\s*hunger prediction/i);
  const timingSection = findSection(sections, /timing insight/i);
  const optimizationSection = findSection(sections, /meal optimization suggestions|smart suggestions/i);
  const microSection = findSection(sections, /micronutrient snapshot/i);
  const whySection = findSection(sections, /why this matters/i);

  const overviewMap = useMemo(() => parseLabelMap(overviewSection?.content), [overviewSection?.content]);
  const goalMap = useMemo(() => parseLabelMap(goalSection?.content), [goalSection?.content]);
  const healthMap = useMemo(() => parseLabelMap(healthSection?.content), [healthSection?.content]);
  const satietyMap = useMemo(() => parseLabelMap(satietySection?.content), [satietySection?.content]);
  const timingMap = useMemo(() => parseLabelMap(timingSection?.content), [timingSection?.content]);
  const whyMap = useMemo(() => parseLabelMap(whySection?.content), [whySection?.content]);
  const ingredientRows = useMemo(() => parsePipeBullets(ingredientSection?.content), [ingredientSection?.content]);
  const personalizationRows = useMemo(() => parsePipeBullets(personalizationSection?.content), [personalizationSection?.content]);
  const optimizationRows = useMemo(() => parsePipeBullets(optimizationSection?.content), [optimizationSection?.content]);
  const micronutrientRows = useMemo(() => parsePipeBullets(microSection?.content), [microSection?.content]);

  if (!result) {
    return null;
  }

  const protein = Math.max(0, parseNumericValue(overviewMap["protein"]) || 0);
  const carbs = Math.max(0, parseNumericValue(overviewMap["carbs"]) || 0);
  const fats = Math.max(0, parseNumericValue(overviewMap["fats"] || overviewMap["fat"]) || 0);
  const macroTotal = Math.max(1, protein + carbs + fats);
  const totalCalories =
    typeof result?.totalEstimatedCalories === "number" && Number.isFinite(result.totalEstimatedCalories)
      ? `${Math.round(result.totalEstimatedCalories)} kcal`
      : overviewMap["total calories"] || "Estimate unavailable";
  const score = parseNumericValue(goalMap["score"]);
  const scoreTone = toneForScore(score || 0);
  const mealTitle =
    overviewMap["item"] ||
    result.analysisText.split("\n").find((line) => line.trim())?.replace(/^food name:\s*/i, "").trim() ||
    "Meal analysis";
  const handledSectionKeys = new Set(
    [
      overviewSection?.heading,
      goalSection?.heading,
      ingredientSection?.heading,
      healthSection?.heading,
      personalizationSection?.heading,
      satietySection?.heading,
      timingSection?.heading,
      optimizationSection?.heading,
      microSection?.heading,
      whySection?.heading,
    ]
      .filter(Boolean)
      .map((value) => value.trim().toLowerCase())
  );

  return (
    <View style={styles.card}>
      <LinearGradient colors={["#F7FBF8", "#EEF4FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <View style={styles.heroChipRow}>
          <View style={styles.heroChip}>
            <MaterialCommunityIcons name="sparkles" size={14} color={palette.primary} />
            <Text style={styles.heroChipText}>AI nutrition analysis</Text>
          </View>
          {goalMap["goal"] ? (
            <View style={styles.heroChip}>
              <MaterialCommunityIcons name="flag-checkered" size={14} color={palette.primary} />
              <Text style={styles.heroChipText} numberOfLines={1}>
                {goalMap["goal"]}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.heroTopRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>Nutrition snapshot</Text>
            <Text style={styles.heroTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>
              {mealTitle}
            </Text>
            <Text style={styles.heroSubtitle}>
              {(overviewMap["portion"] || "Estimated portion")} · {(overviewMap["confidence"] || "AI estimate from visible food cues")}
            </Text>
            {(overviewMap["quick take"] || overviewMap["macro interpretation"]) ? (
              <Text style={styles.heroSummary}>{overviewMap["quick take"] || overviewMap["macro interpretation"]}</Text>
            ) : null}
          </View>
          <View style={[styles.scoreCard, { backgroundColor: scoreTone.backgroundColor }]}>
            <Text style={[styles.scoreValue, { color: scoreTone.color }]}>{typeof score === "number" ? Math.round(score) : "--"}</Text>
            <Text style={[styles.scoreLabel, { color: scoreTone.color }]}>
              {goalMap["goal"] ? `For ${goalMap["goal"]}` : "Goal fit"}
            </Text>
          </View>
        </View>

        <View style={styles.topMetricRow}>
          <MetricTile label="Total calories" value={totalCalories} />
          <MetricTile label="Protein" value={`${overviewMap["protein"] || `${protein}g`} (${overviewMap["protein share"] || pctString(protein, macroTotal)})`} />
          <MetricTile label="Carbs" value={`${overviewMap["carbs"] || `${carbs}g`} (${overviewMap["carbs share"] || pctString(carbs, macroTotal)})`} />
          <MetricTile label="Fats" value={`${overviewMap["fats"] || overviewMap["fat"] || `${fats}g`} (${overviewMap["fats share"] || pctString(fats, macroTotal)})`} />
        </View>

        {(protein > 0 || carbs > 0 || fats > 0) ? (
          <View style={styles.balanceCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
                Macro balance
              </Text>
              <Text style={styles.visualBalanceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
                {overviewMap["visual balance"] || "Protein / Carbs / Fats"}
              </Text>
            </View>
            <View style={styles.balanceTrack}>
              <View style={[styles.balanceSegment, { flex: protein || 0.1, backgroundColor: palette.success }]} />
              <View style={[styles.balanceSegment, { flex: carbs || 0.1, backgroundColor: palette.warning }]} />
              <View style={[styles.balanceSegment, { flex: fats || 0.1, backgroundColor: palette.primary }]} />
            </View>
            <View style={styles.legendRow}>
              <LegendDot color={palette.success} label={`Protein ${overviewMap["protein share"] || pctString(protein, macroTotal)}`} />
              <LegendDot color={palette.warning} label={`Carbs ${overviewMap["carbs share"] || pctString(carbs, macroTotal)}`} />
              <LegendDot color={palette.primary} label={`Fats ${overviewMap["fats share"] || pctString(fats, macroTotal)}`} />
            </View>
            {overviewMap["macro interpretation"] ? <Text style={styles.balanceInsight}>{overviewMap["macro interpretation"]}</Text> : null}
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.dashboardGrid}>
        <View style={styles.dashboardColumn}>
          <AccordionSection title="Goal Alignment Score" accent={palette.success} icon="bullseye-arrow" defaultExpanded>
            <View style={styles.metricGrid}>
              <MetricTile label="Calorie fit" value={goalMap["calorie fit"] || "-"} />
              <MetricTile label="Macro balance" value={goalMap["macro balance"] || "-"} />
              <MetricTile label="Satiety level" value={goalMap["satiety level"] || "-"} />
            </View>
            {goalMap["reason"] ? <Text style={styles.insightText}>{goalMap["reason"]}</Text> : null}
          </AccordionSection>

          <AccordionSection title="Health Impact Layer" accent={palette.danger} icon="heart-pulse" defaultExpanded>
            <View style={styles.signalGrid}>
              {[
                ["Blood sugar impact", healthMap["blood sugar impact"]],
                ["Sodium", healthMap["sodium"]],
                ["Saturated fat", healthMap["saturated fat"]],
                ["Fiber", healthMap["fiber"]],
                ["Energy stability", healthMap["energy stability"]],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => {
                  const tone = pickTone(value);
                  return (
                    <View key={label} style={[styles.signalCard, { backgroundColor: tone.backgroundColor }]}>
                      <MaterialCommunityIcons name={tone.icon} size={18} color={tone.color} />
                      <Text style={styles.signalLabel}>{label}</Text>
                      <Text style={[styles.signalValue, { color: tone.color }]}>{value}</Text>
                    </View>
                  );
                })}
            </View>
            {healthMap["watch-outs"] ? <Text style={styles.insightText}>{healthMap["watch-outs"]}</Text> : null}
          </AccordionSection>

          <AccordionSection title="Timing Insight" accent={palette.secondary} icon="clock-outline">
            <DataLine label="Best timing" value={timingMap["best timing"]} />
            <DataLine label="Less ideal timing" value={timingMap["less ideal timing"]} />
            <DataLine label="Pre-workout" value={timingMap["pre-workout"]} />
            <DataLine label="Post-workout" value={timingMap["post-workout"]} />
            <DataLine label="Late night" value={timingMap["late night"]} />
            <DataLine label="Morning" value={timingMap["morning"]} />
          </AccordionSection>

          <AccordionSection title="Why This Matters" accent={palette.primary} icon="lightbulb-on-outline" defaultExpanded>
            <DataLine label="Main insight" value={whyMap["main insight"]} />
            <DataLine label="Short explanation" value={whyMap["short explanation"]} />
            <DataLine label="Priority action" value={whyMap["priority action"]} />
          </AccordionSection>
        </View>

        <View style={styles.dashboardColumn}>
          <AccordionSection title="Ingredient Quality Analysis" accent={palette.warning} icon="food-apple-outline" defaultExpanded>
            <View style={styles.stack}>
              {ingredientRows.length > 0
                ? ingredientRows.map((row) => {
                    const [ingredient, flag = "", processing = "", additiveNote = "", whyItMatters = ""] = row.parts;
                    const tone = pickTone(flag);
                    return (
                      <View key={row.id} style={styles.subCard}>
                        <View style={styles.rowBetween}>
                          <Text style={styles.subCardTitle}>{ingredient || "Ingredient"}</Text>
                          {flag ? <AccentChip label={flag} tone={tone} /> : null}
                        </View>
                        {processing ? <Text style={styles.subCardBody}>{processing}</Text> : null}
                        {additiveNote ? <Text style={styles.subCardMuted}>{additiveNote}</Text> : null}
                        {whyItMatters ? <Text style={styles.subCardBody}>{whyItMatters}</Text> : null}
                      </View>
                    );
                  })
                : renderMarkdownBlock(sanitizeSectionContent(ingredientSection?.content || ""), "ingredient-fallback")}
            </View>
          </AccordionSection>

          <AccordionSection title="Personalization Layer" accent={palette.primary} icon="account-heart-outline" defaultExpanded>
            <View style={styles.stack}>
              {personalizationRows.length > 0
                ? personalizationRows.map((row) => {
                    const [focusArea, fit = "", whyItMatters = ""] = row.parts;
                    const tone = pickTone(fit);
                    return (
                      <View key={row.id} style={styles.subCard}>
                        <View style={styles.rowBetween}>
                          <Text style={styles.subCardTitle}>{focusArea || "Profile fit"}</Text>
                          {fit ? <AccentChip label={fit} tone={tone} /> : null}
                        </View>
                        {whyItMatters ? <Text style={styles.subCardBody}>{whyItMatters}</Text> : null}
                      </View>
                    );
                  })
                : renderMarkdownBlock(sanitizeSectionContent(personalizationSection?.content || ""), "profile-fallback")}
            </View>
          </AccordionSection>

          <AccordionSection title="Satiety & Hunger Prediction" accent={palette.success} icon="silverware-fork-knife">
            <View style={styles.metricGrid}>
              <MetricTile label="Satiety score" value={satietyMap["satiety score"] || "-"} />
              <MetricTile label="Protein level" value={satietyMap["protein level"] || "-"} />
              <MetricTile label="Fiber level" value={satietyMap["fiber level"] || "-"} />
              <MetricTile label="Energy density" value={satietyMap["energy density"] || "-"} />
            </View>
            {satietyMap["hunger forecast"] ? <Text style={styles.insightText}>{satietyMap["hunger forecast"]}</Text> : null}
          </AccordionSection>

          <AccordionSection title="Meal Optimization Suggestions" accent={palette.success} icon="swap-horizontal" defaultExpanded>
            <View style={styles.stack}>
              {optimizationRows.length > 0
                ? optimizationRows.map((row) => {
                    const [suggestion, benefit = "", effect = ""] = row.parts;
                    return (
                      <View key={row.id} style={styles.subCard}>
                        <Text style={styles.subCardTitle}>{suggestion || "Suggestion"}</Text>
                        {benefit ? <Text style={styles.subCardBody}>{benefit}</Text> : null}
                        {effect ? <Text style={styles.subCardMuted}>{effect}</Text> : null}
                      </View>
                    );
                  })
                : renderMarkdownBlock(sanitizeSectionContent(optimizationSection?.content || ""), "opt-fallback")}
            </View>
          </AccordionSection>

          <AccordionSection title="Micronutrient Snapshot" accent={palette.warning} icon="molecule">
            <View style={styles.stack}>
              {micronutrientRows.length > 0
                ? micronutrientRows.map((row) => {
                    const [nutrient, level = "", whyItMatters = ""] = row.parts;
                    return (
                      <View key={row.id} style={styles.subCard}>
                        <View style={styles.rowBetween}>
                          <Text style={styles.subCardTitle}>{nutrient || "Nutrient"}</Text>
                          {level ? <Text style={styles.subCardTag}>{level}</Text> : null}
                        </View>
                        {whyItMatters ? <Text style={styles.subCardBody}>{whyItMatters}</Text> : null}
                      </View>
                    );
                  })
                : renderMarkdownBlock(sanitizeSectionContent(microSection?.content || ""), "micro-fallback")}
            </View>
          </AccordionSection>
        </View>
      </View>

      <ScrollView style={styles.resultScroller} contentContainerStyle={styles.resultContent} nestedScrollEnabled>
        {sections.length > 0
          ? sections.map((section, index) => {
              const key = (section.heading || "").trim().toLowerCase();
              if (handledSectionKeys.has(key)) {
                return null;
              }
              const meta = sectionMeta(section.heading);
              return (
                <AccordionSection key={`${section.heading}-${index}`} title={section.heading} accent={meta.accent} icon={meta.icon}>
                  {renderMarkdownBlock(sanitizeSectionContent(section.content || "-"), `calorie-section-${index}`)}
                </AccordionSection>
              );
            })
          : renderMarkdownBlock(sanitizeSectionContent(result.analysisText || ""), "calorie-fallback")}
      </ScrollView>
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FAFCF9",
    padding: 18,
    gap: 16,
    shadowColor: "#173122",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 14,
  },
  heroChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "#DDE7E0",
  },
  heroChipText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    maxWidth: 170,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    lineHeight: 30,
  },
  heroSubtitle: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
  },
  heroSummary: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    lineHeight: 21,
  },
  scoreCard: {
    minWidth: 96,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  scoreValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
  },
  scoreLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    textAlign: "center",
  },
  topMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricTile: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  metricLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  metricValue: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    lineHeight: 19,
  },
  metricValueMuted: {
    color: palette.muted,
  },
  balanceCard: {
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  visualBalanceText: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  balanceTrack: {
    height: 14,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
  },
  balanceSegment: {
    height: "100%",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    flexShrink: 1,
  },
  balanceInsight: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    lineHeight: 20,
  },
  dashboardGrid: {
    gap: 12,
  },
  dashboardColumn: {
    gap: 12,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#F6FAF7",
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
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
    flex: 1,
  },
  sectionChevron: {
    marginLeft: "auto",
    flexShrink: 0,
  },
  sectionContent: {
    gap: 10,
  },
  signalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  signalCard: {
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: 18,
    padding: 12,
    gap: 6,
  },
  signalLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  signalValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    lineHeight: 19,
  },
  insightText: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    lineHeight: 20,
  },
  stack: {
    gap: 10,
  },
  subCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 6,
  },
  subCardTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    flex: 1,
  },
  subCardBody: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    lineHeight: 19,
  },
  subCardMuted: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
  },
  subCardTag: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  dataLine: {
    gap: 2,
    paddingVertical: 2,
  },
  dataLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  dataValue: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 20,
  },
  resultScroller: {
    maxHeight: 420,
  },
  resultContent: {
    gap: 12,
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
