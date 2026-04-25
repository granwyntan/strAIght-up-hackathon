import React, { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";
import type {
  SupplementAnalysisResult,
  SupplementIngredientDetail,
  SupplementSection,
  SupplementStructuredAnalysis,
  SupplementUserProfileSnapshot,
} from "../../types/supplements";

type AnalysisResultProps = {
  result: SupplementAnalysisResult | null;
  selectedImageUri: string;
  selectedImageAspectRatio: number;
};

type GoalCard = {
  name: string;
  fit: string;
  reason: string;
};

type BenefitCard = {
  name: string;
  evidence: string;
  bestFor: string;
  limit: string;
};

type RiskCard = {
  severity: string;
  issue: string;
  trigger: string;
  advice: string;
};

type LabeledValue = {
  label: string;
  value: string;
};

function normalizeHeading(value: string) {
  return (value || "").trim().toLowerCase();
}

function bulletLines(content: string) {
  return (content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*=]\s*/, "").trim())
    .filter(Boolean);
}

function labeledValues(content: string) {
  const values = new Map<string, string>();
  for (const line of bulletLines(content)) {
    const match = line.match(/^([^:|]+):\s*(.+)$/);
    if (match) {
      values.set(match[1].trim(), match[2].trim());
    }
  }
  return values;
}

function namedBullets(content: string): LabeledValue[] {
  return bulletLines(content).map((line) => {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      return { label: match[1].trim(), value: match[2].trim() };
    }
    return { label: "", value: line };
  });
}

function valueFromParts(parts: string[], prefix: string) {
  const match = parts.find((part) => part.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!match) {
    return "";
  }
  return match.split(":").slice(1).join(":").trim();
}

function parseGoalCards(content: string): GoalCard[] {
  return bulletLines(content).map((line) => {
    const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
    return {
      name: parts[0] || "Goal",
      fit: valueFromParts(parts.slice(1), "Fit") || "Unclear",
      reason: valueFromParts(parts.slice(1), "Reason") || "",
    };
  });
}

function parseBenefitCards(content: string): BenefitCard[] {
  return bulletLines(content).map((line) => {
    const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
    return {
      name: parts[0] || "Benefit",
      evidence: valueFromParts(parts.slice(1), "Evidence") || "Unclear",
      bestFor: valueFromParts(parts.slice(1), "Best for") || "",
      limit: valueFromParts(parts.slice(1), "Limit") || "",
    };
  });
}

function parseRiskCards(content: string): RiskCard[] {
  return bulletLines(content).map((line) => {
    const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
    return {
      severity: valueFromParts(parts, "Severity") || "Low",
      issue: valueFromParts(parts, "Issue") || parts[0] || "Warning",
      trigger: valueFromParts(parts, "Trigger") || "",
      advice: valueFromParts(parts, "Advice") || "",
    };
  });
}

function inferTitle(result: SupplementAnalysisResult | null) {
  const firstLine = (result?.analysisText || "").split("\n").find((line) => line.trim());
  const match = firstLine?.match(/^Supplement Name:\s*(.+)$/i);
  return match?.[1]?.trim() || "Supplement analysis";
}

function toneForVerdict(value: string) {
  const lowered = (value || "").toLowerCase();
  if (lowered.includes("avoid")) {
    return { background: "#FBE8E4", color: palette.danger, icon: "close-octagon-outline" as const };
  }
  if (lowered.includes("limited") || lowered.includes("caution")) {
    return { background: "#FFF3E2", color: "#B8741A", icon: "alert-circle-outline" as const };
  }
  return { background: palette.primarySoft, color: palette.primary, icon: "check-decagram-outline" as const };
}

function toneForEvidence(value: string) {
  const lowered = (value || "").toLowerCase();
  if (lowered.includes("strong") || lowered.includes("high")) {
    return { background: palette.primarySoft, color: palette.primary };
  }
  if (lowered.includes("moderate") || lowered.includes("medium") || lowered.includes("normal")) {
    return { background: "#FFF3E2", color: "#B8741A" };
  }
  return { background: "#F1F5F9", color: palette.muted };
}

function toneForRisk(value: string) {
  const lowered = (value || "").toLowerCase();
  if (lowered.includes("high")) {
    return { background: "#FBE8E4", color: palette.danger, icon: "alert-octagon-outline" as const };
  }
  if (lowered.includes("medium")) {
    return { background: "#FFF3E2", color: "#B8741A", icon: "alert-outline" as const };
  }
  return { background: "#F1F5F9", color: palette.muted, icon: "information-outline" as const };
}

function fallbackStructuredAnalysis(result: SupplementAnalysisResult | null): SupplementStructuredAnalysis | null {
  if (!result) {
    return null;
  }
  const sectionMap = new Map<string, SupplementSection>();
  for (const section of result.sections || []) {
    sectionMap.set(normalizeHeading(section.heading), section);
  }
  const ingredientLines = bulletLines(sectionMap.get("ingredient breakdown")?.content || "");
  if (ingredientLines.length === 0) {
    return null;
  }
  const personalization = namedBullets(sectionMap.get("personalization")?.content || "");
  const profileFallback: SupplementUserProfileSnapshot = {
    age: "",
    gender: "",
    conditions: [],
    medications: result.detectedDrugs || [],
  };
  return {
    ingredients: ingredientLines.map((line, index) => {
      const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
      const name = parts[0] || `Ingredient ${index + 1}`;
      const amount = valueFromParts(parts.slice(1), "Amount") || "Unknown";
      const dose = valueFromParts(parts.slice(1), "Dose") || "Unknown";
      const evidence = valueFromParts(parts.slice(1), "Evidence") || "Unclear";
      const risks = valueFromParts(parts.slice(1), "Risks") || "";
      const whyItMatters = valueFromParts(parts.slice(1), "Why it matters") || "";
      return {
        id: `ingredient-${index + 1}`,
        name,
        category: "ingredient",
        description: whyItMatters || `${name} was reviewed in the formula summary.`,
        amount,
        dose_assessment: dose,
        evidence: [
          {
            id: `ingredient-${index + 1}-evidence-1`,
            ingredient_id: `ingredient-${index + 1}`,
            study_type: "summary",
            strength: evidence,
            summary: whyItMatters || "Evidence notes were summarized from the report text.",
            source_link: "",
          },
        ],
        interactions: risks
          ? [
              {
                ingredient_id: `ingredient-${index + 1}`,
                interacts_with: "sensitive users or concurrent treatments",
                severity: /avoid|contraind/i.test(risks) ? "high" : "medium",
                description: risks,
              },
            ]
          : [],
        personal_relevance: personalization[0]?.value || whyItMatters,
        analysis_result: {
          effectiveness_score: evidence.toLowerCase().includes("strong") ? 84 : evidence.toLowerCase().includes("moderate") ? 66 : 48,
          safety_score: risks ? 56 : 78,
          compatibility_score: whyItMatters ? 72 : 58,
        },
      };
    }),
    user_profile: profileFallback,
    analysis_result: {
      effectiveness_score: 64,
      safety_score: 70,
      compatibility_score: 66,
    },
  };
}

function SummaryList({ items }: { items: LabeledValue[] }) {
  return (
    <View style={styles.cardStack}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.usageRow}>
          <Text style={styles.usageLabel}>{item.label || "Detail"}</Text>
          <Text style={styles.usageValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function ProfileSnapshot({ profile }: { profile: SupplementUserProfileSnapshot }) {
  return (
    <View style={styles.cardStack}>
      <View style={styles.usageRow}>
        <Text style={styles.usageLabel}>Age</Text>
        <Text style={styles.usageValue}>{profile.age || "Not provided"}</Text>
      </View>
      <View style={styles.usageRow}>
        <Text style={styles.usageLabel}>Gender</Text>
        <Text style={styles.usageValue}>{profile.gender || "Not provided"}</Text>
      </View>
      <View style={styles.usageRow}>
        <Text style={styles.usageLabel}>Conditions</Text>
        <Text style={styles.usageValue}>{profile.conditions?.length ? profile.conditions.join(", ") : "None listed"}</Text>
      </View>
      <View style={styles.usageRow}>
        <Text style={styles.usageLabel}>Medications</Text>
        <Text style={styles.usageValue}>{profile.medications?.length ? profile.medications.join(", ") : "None listed"}</Text>
      </View>
    </View>
  );
}

export default function AnalysisResult({ result, selectedImageUri, selectedImageAspectRatio }: AnalysisResultProps) {
  const [selectedIngredient, setSelectedIngredient] = useState<SupplementIngredientDetail | null>(null);

  const parsed = useMemo(() => {
    const sectionMap = new Map<string, SupplementSection>();
    for (const section of result?.sections || []) {
      sectionMap.set(normalizeHeading(section.heading), section);
    }

    const hero = labeledValues(sectionMap.get("hero summary")?.content || "");
    const goalCards = parseGoalCards(sectionMap.get("quick match to user goals")?.content || "");
    const benefitCards = parseBenefitCards(sectionMap.get("benefits")?.content || "");
    const riskCards = parseRiskCards(sectionMap.get("risks and warnings")?.content || "");
    const stackAnalysis = namedBullets(sectionMap.get("stack analysis")?.content || "");
    const personalization = namedBullets(sectionMap.get("personalization")?.content || "");
    const usage = namedBullets(sectionMap.get("usage guide")?.content || "");
    const evidence = namedBullets(sectionMap.get("evidence and transparency")?.content || "");
    const claimAnalyzer = namedBullets(sectionMap.get("claim analyzer (quick)")?.content || "");
    const plainLanguage = bulletLines(sectionMap.get("plain language summary")?.content || "");
    const structured = result?.structuredAnalysis || fallbackStructuredAnalysis(result);

    const consumed = new Set([
      "hero summary",
      "quick match to user goals",
      "plain language summary",
      "ingredient breakdown",
      "stack analysis",
      "benefits",
      "risks and warnings",
      "personalization",
      "usage guide",
      "evidence and transparency",
      "claim analyzer (quick)",
    ]);
    const extraSections = (result?.sections || []).filter((section) => !consumed.has(normalizeHeading(section.heading)));

    return {
      hero,
      goalCards,
      benefitCards,
      riskCards,
      stackAnalysis,
      personalization,
      usage,
      evidence,
      claimAnalyzer,
      plainLanguage,
      structured,
      extraSections,
    };
  }, [result]);

  if (!result) {
    return null;
  }

  const title = parsed.hero.get("Product Name") || inferTitle(result);
  const brand = parsed.hero.get("Brand") || "";
  const category = parsed.hero.get("Category") || "";
  const form = parsed.hero.get("Form") || "";
  const verdict = parsed.hero.get("Verdict") || "Needs caution";
  const confidence = parsed.hero.get("Confidence") || "Medium";
  const keyWarning = parsed.hero.get("Key warning") || "";
  const summary = parsed.hero.get("Summary") || "";
  const verdictTone = toneForVerdict(verdict);
  const confidenceTone = toneForEvidence(confidence);
  const overallStructuredScores = parsed.structured?.analysis_result;

  return (
    <View style={styles.shell}>
      <View style={styles.heroCard}>
        {selectedImageUri ? (
          <Image source={{ uri: selectedImageUri }} style={[styles.productImage, { aspectRatio: selectedImageAspectRatio || 1.3 }]} resizeMode="contain" />
        ) : null}
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>Supplement review</Text>
          <Text style={styles.productTitle}>{title}</Text>
          {(brand || category || form) ? <Text style={styles.productMeta}>{[brand, category, form].filter(Boolean).join(" • ")}</Text> : null}
          <View style={styles.heroBadgeRow}>
            <View style={[styles.heroBadge, { backgroundColor: verdictTone.background }]}>
              <MaterialCommunityIcons name={verdictTone.icon} size={15} color={verdictTone.color} />
              <Text style={[styles.heroBadgeText, { color: verdictTone.color }]}>{verdict}</Text>
            </View>
            <View style={[styles.heroBadge, { backgroundColor: confidenceTone.background }]}>
              <Text style={[styles.heroBadgeText, { color: confidenceTone.color }]}>{confidence} confidence</Text>
            </View>
          </View>
          {keyWarning && !/^none noted$/i.test(keyWarning) ? (
            <View style={styles.warningBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={palette.danger} />
              <Text style={styles.warningText}>{keyWarning}</Text>
            </View>
          ) : null}
          {summary ? <Text style={styles.heroSummary}>{summary}</Text> : null}
          {confidence && confidence.toLowerCase() !== "high" ? (
            <Text style={styles.heroNuance}>
              Supplement analysis carries more nuance than medicine review because label quality, ingredient overlap, and stack effects can vary across products.
            </Text>
          ) : null}
          {overallStructuredScores ? (
            <View style={styles.scoreRow}>
              <View style={styles.scoreStat}>
                <Text style={styles.usageLabel}>Effectiveness</Text>
                <Text style={styles.scoreValue}>{overallStructuredScores.effectiveness_score}/100</Text>
              </View>
              <View style={styles.scoreStat}>
                <Text style={styles.usageLabel}>Safety</Text>
                <Text style={styles.scoreValue}>{overallStructuredScores.safety_score}/100</Text>
              </View>
              <View style={styles.scoreStat}>
                <Text style={styles.usageLabel}>Compatibility</Text>
                <Text style={styles.scoreValue}>{overallStructuredScores.compatibility_score}/100</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {parsed.goalCards.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick match to your goals</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalScroll}>
            {parsed.goalCards.map((item, index) => {
              const tone = toneForEvidence(item.fit);
              return (
                <View key={`${item.name}-${index}`} style={styles.goalCard}>
                  <Text style={styles.goalTitle}>{item.name}</Text>
                  <View style={[styles.goalFitChip, { backgroundColor: tone.background }]}>
                    <Text style={[styles.goalFitText, { color: tone.color }]}>{item.fit}</Text>
                  </View>
                  <Text style={styles.goalReason}>{item.reason}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {parsed.plainLanguage.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Plain language summary</Text>
          <View style={styles.cardStack}>
            {parsed.plainLanguage.map((line, index) => (
              <View key={`${line}-${index}`} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {parsed.structured?.ingredients?.length ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Ingredient breakdown</Text>
          <View style={styles.cardStack}>
            {parsed.structured.ingredients.map((ingredient) => {
              const tone = toneForEvidence(ingredient.evidence[0]?.strength || "");
              return (
                <Pressable key={ingredient.id} style={styles.ingredientRow} onPress={() => setSelectedIngredient(ingredient)}>
                  <View style={styles.ingredientLeft}>
                    <Text style={styles.ingredientName}>{ingredient.name}</Text>
                    <Text style={styles.ingredientMeta}>
                      {[ingredient.category, ingredient.amount || "Unknown amount", ingredient.dose_assessment || "Unknown dose"].filter(Boolean).join(" • ")}
                    </Text>
                  </View>
                  <View style={styles.ingredientRight}>
                    <View style={[styles.goalFitChip, { backgroundColor: tone.background }]}>
                      <Text style={[styles.goalFitText, { color: tone.color }]}>{ingredient.evidence[0]?.strength || "Unclear"}</Text>
                    </View>
                    <Text style={styles.ingredientScoreText}>{ingredient.analysis_result.compatibility_score}/100 fit</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {parsed.stackAnalysis.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Stack analysis</Text>
          <SummaryList items={parsed.stackAnalysis} />
        </View>
      ) : null}

      {parsed.benefitCards.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Benefits with evidence context</Text>
          <View style={styles.cardStack}>
            {parsed.benefitCards.map((item, index) => (
              <View key={`${item.name}-${index}`} style={styles.subCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.subCardTitle}>{item.name}</Text>
                  <View style={[styles.goalFitChip, { backgroundColor: toneForEvidence(item.evidence).background }]}>
                    <Text style={[styles.goalFitText, { color: toneForEvidence(item.evidence).color }]}>{item.evidence}</Text>
                  </View>
                </View>
                {item.bestFor ? <Text style={styles.subCardBody}>Best for: {item.bestFor}</Text> : null}
                {item.limit ? <Text style={styles.subCardMuted}>Limit: {item.limit}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {parsed.riskCards.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Risks and warnings</Text>
          <View style={styles.cardStack}>
            {parsed.riskCards.map((item, index) => {
              const tone = toneForRisk(item.severity);
              return (
                <View key={`${item.issue}-${index}`} style={styles.riskRow}>
                  <View style={[styles.riskIconWrap, { backgroundColor: tone.background }]}>
                    <MaterialCommunityIcons name={tone.icon} size={16} color={tone.color} />
                  </View>
                  <View style={styles.riskCopy}>
                    <Text style={styles.riskTitle}>{item.issue}</Text>
                    {item.trigger ? <Text style={styles.subCardBody}>Trigger: {item.trigger}</Text> : null}
                    {item.advice ? <Text style={styles.subCardMuted}>Advice: {item.advice}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {parsed.personalization.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Personalization</Text>
          <SummaryList items={parsed.personalization} />
        </View>
      ) : null}

      {parsed.usage.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Usage guide</Text>
          <SummaryList items={parsed.usage} />
        </View>
      ) : null}

      {parsed.evidence.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Evidence and transparency</Text>
          <SummaryList items={parsed.evidence} />
        </View>
      ) : null}

      {parsed.claimAnalyzer.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Claim analyzer (quick)</Text>
          <SummaryList items={parsed.claimAnalyzer} />
        </View>
      ) : null}

      {parsed.extraSections.map((section, index) => (
        <View key={`${section.heading}-${index}`} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{section.heading}</Text>
          <View style={styles.cardStack}>
            {bulletLines(section.content).map((line, lineIndex) => (
              <View key={`${line}-${lineIndex}`} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {result.infographicImageDataUrl ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Visual infographic</Text>
          <Image source={{ uri: result.infographicImageDataUrl }} style={styles.infographicImage} resizeMode="contain" />
        </View>
      ) : null}

      <Modal visible={Boolean(selectedIngredient)} transparent animationType="fade" onRequestClose={() => setSelectedIngredient(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>{selectedIngredient?.name || "Ingredient"}</Text>
              <Pressable style={styles.modalCloseButton} onPress={() => setSelectedIngredient(null)}>
                <MaterialCommunityIcons name="close" size={18} color={palette.primary} />
              </Pressable>
            </View>
            {selectedIngredient ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardStack}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Ingredient ID</Text>
                  <Text style={styles.usageValue}>{selectedIngredient.id}</Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Category</Text>
                  <Text style={styles.usageValue}>{selectedIngredient.category || "Unknown"}</Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Description</Text>
                  <Text style={styles.usageValue}>{selectedIngredient.description || "No extra description was generated for this ingredient."}</Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Amount</Text>
                  <Text style={styles.usageValue}>{selectedIngredient.amount || "Unknown"}</Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Dose assessment</Text>
                  <Text style={styles.usageValue}>{selectedIngredient.dose_assessment || "Unknown"}</Text>
                </View>

                <View style={styles.scoreRow}>
                  <View style={styles.scoreStat}>
                    <Text style={styles.usageLabel}>Effectiveness</Text>
                    <Text style={styles.scoreValue}>{selectedIngredient.analysis_result.effectiveness_score}/100</Text>
                  </View>
                  <View style={styles.scoreStat}>
                    <Text style={styles.usageLabel}>Safety</Text>
                    <Text style={styles.scoreValue}>{selectedIngredient.analysis_result.safety_score}/100</Text>
                  </View>
                  <View style={styles.scoreStat}>
                    <Text style={styles.usageLabel}>Compatibility</Text>
                    <Text style={styles.scoreValue}>{selectedIngredient.analysis_result.compatibility_score}/100</Text>
                  </View>
                </View>

                <View style={styles.cardStack}>
                  <Text style={styles.sectionTitle}>Evidence</Text>
                  {selectedIngredient.evidence.map((item) => (
                    <View key={item.id} style={styles.modalSubCard}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.modalSubTitle}>{item.study_type || "Study summary"}</Text>
                        <View style={[styles.goalFitChip, { backgroundColor: toneForEvidence(item.strength).background }]}>
                          <Text style={[styles.goalFitText, { color: toneForEvidence(item.strength).color }]}>{item.strength || "Unclear"}</Text>
                        </View>
                      </View>
                      <Text style={styles.subCardBody}>{item.summary}</Text>
                      {item.source_link ? <Text style={styles.sourceLinkText}>{item.source_link}</Text> : null}
                    </View>
                  ))}
                </View>

                <View style={styles.cardStack}>
                  <Text style={styles.sectionTitle}>Interactions</Text>
                  {selectedIngredient.interactions.length > 0 ? (
                    selectedIngredient.interactions.map((item, index) => (
                      <View key={`${item.ingredient_id}-${index}`} style={styles.modalSubCard}>
                        <Text style={styles.modalSubTitle}>{item.interacts_with || "Potential interaction"}</Text>
                        <Text style={styles.subCardMuted}>Severity: {item.severity || "low"}</Text>
                        <Text style={styles.subCardBody}>{item.description || "No further interaction detail was generated."}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.bulletText}>No specific interaction signal was generated for this ingredient.</Text>
                  )}
                </View>

                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Personal relevance</Text>
                  <Text style={styles.usageValue}>{selectedIngredient.personal_relevance || "No personal note was generated for this ingredient."}</Text>
                </View>

                {parsed.structured?.user_profile ? (
                  <View style={styles.cardStack}>
                    <Text style={styles.sectionTitle}>User profile used</Text>
                    <ProfileSnapshot profile={parsed.structured.user_profile} />
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 14,
  },
  heroCard: {
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
  },
  heroCopy: {
    gap: 10,
  },
  eyebrow: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    color: palette.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  productTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    lineHeight: 32,
    color: palette.ink,
  },
  productMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  heroSummary: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    lineHeight: 24,
    color: palette.ink,
  },
  heroNuance: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 21,
    color: palette.muted,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#FDF1EE",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    color: palette.danger,
  },
  productImage: {
    width: "100%",
    maxHeight: 260,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  sectionCard: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
  },
  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    lineHeight: 24,
    color: palette.ink,
  },
  goalScroll: {
    gap: 12,
    paddingRight: 4,
  },
  goalCard: {
    width: 210,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
  },
  goalTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: palette.ink,
  },
  goalFitChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  goalFitText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  goalReason: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  cardStack: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.primary,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
    color: palette.ink,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ingredientLeft: {
    flex: 1,
    gap: 4,
  },
  ingredientName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: palette.ink,
  },
  ingredientMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  ingredientRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  ingredientScoreText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: palette.primary,
  },
  subCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  subCardTitle: {
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: palette.ink,
  },
  subCardBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    color: palette.ink,
  },
  subCardMuted: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
  },
  riskIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  riskCopy: {
    flex: 1,
    gap: 4,
  },
  riskTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: palette.ink,
  },
  usageRow: {
    gap: 4,
    borderRadius: 16,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  usageLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: palette.primary,
  },
  usageValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    color: palette.ink,
  },
  infographicImage: {
    width: "100%",
    aspectRatio: 1.2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "86%",
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 14,
  },
  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: palette.ink,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
  },
  scoreRow: {
    flexDirection: "row",
    gap: 10,
  },
  scoreStat: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  scoreValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: palette.ink,
  },
  modalSubCard: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalSubTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: palette.ink,
  },
  sourceLinkText: {
    color: palette.primary,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
});
