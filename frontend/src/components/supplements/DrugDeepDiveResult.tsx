import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";
import type { SupplementDrugDeepDiveResult, SupplementSection } from "../../types/supplements";

type DrugDeepDiveResultProps = {
  result: SupplementDrugDeepDiveResult | null;
};

function normalizeHeading(value: string) {
  return (value || "").trim().toLowerCase();
}

function bulletLines(content: string) {
  return (content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function labeledValues(content: string) {
  return bulletLines(content).map((line) => {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      return { label: match[1].trim(), value: match[2].trim() };
    }
    return { label: "", value: line };
  });
}

function firstValue(lines: { label: string; value: string }[], key: string) {
  return lines.find((item) => normalizeHeading(item.label) === normalizeHeading(key))?.value || "";
}

function toneForVerdict(value: string) {
  const lowered = (value || "").toLowerCase();
  if (/(avoid|not ideal|unsafe|high risk)/.test(lowered)) {
    return { background: "#FBE8E4", color: palette.danger, icon: "alert-octagon-outline" as const };
  }
  if (/(limited|caution|careful|watch)/.test(lowered)) {
    return { background: "#FFF3E2", color: "#B8741A", icon: "alert-circle-outline" as const };
  }
  return { background: palette.primarySoft, color: palette.primary, icon: "check-decagram-outline" as const };
}

function toneForStrength(value: string) {
  const lowered = (value || "").toLowerCase();
  if (/(strong|high|good)/.test(lowered)) {
    return { background: palette.primarySoft, color: palette.primary };
  }
  if (/(moderate|medium|mixed|uncertain)/.test(lowered)) {
    return { background: "#FFF3E2", color: "#B8741A" };
  }
  return { background: "#F1F5F9", color: palette.muted };
}

function sectionMeta(heading: string) {
  const normalized = normalizeHeading(heading);
  if (normalized.includes("identity")) return { icon: "badge-account-horizontal-outline", accent: palette.primary };
  if (normalized.includes("snapshot")) return { icon: "account-heart-outline", accent: palette.primary };
  if (normalized.includes("what it does")) return { icon: "pulse", accent: palette.success };
  if (normalized.includes("dosage")) return { icon: "scale-balance", accent: "#B8741A" };
  if (normalized.includes("risk")) return { icon: "alert-circle-outline", accent: palette.danger };
  if (normalized.includes("contra")) return { icon: "alert-outline", accent: palette.danger };
  if (normalized.includes("interaction")) return { icon: "swap-horizontal", accent: "#B8741A" };
  if (normalized.includes("deficiency")) return { icon: "beaker-outline", accent: palette.secondary };
  if (normalized.includes("evidence")) return { icon: "file-document-outline", accent: palette.primary };
  if (normalized.includes("practical")) return { icon: "lightbulb-on-outline", accent: palette.success };
  if (normalized.includes("forms")) return { icon: "pill", accent: palette.primary };
  if (normalized.includes("timeline")) return { icon: "timeline-clock-outline", accent: palette.secondary };
  if (normalized.includes("red flags")) return { icon: "alarm-light-outline", accent: palette.danger };
  if (normalized.includes("sources")) return { icon: "shield-check-outline", accent: palette.primary };
  return { icon: "text-box-outline", accent: palette.primary };
}

function SummaryList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={styles.stack}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{item.label || "Detail"}</Text>
          <Text style={styles.detailValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function DrugDeepDiveResult({ result }: DrugDeepDiveResultProps) {
  const parsed = useMemo(() => {
    const sectionMap = new Map<string, SupplementSection>();
    for (const section of result?.sections || []) {
      sectionMap.set(normalizeHeading(section.heading), section);
    }

    const identity = labeledValues(sectionMap.get("identity and verdict")?.content || "");
    const snapshot = labeledValues(sectionMap.get("personalized snapshot")?.content || "");
    const uses = bulletLines(sectionMap.get("what it does")?.content || "");
    const dosage = labeledValues(sectionMap.get("dosage and usage")?.content || "");
    const risks = labeledValues(sectionMap.get("risks and side effects")?.content || "");
    const contraindications = bulletLines(sectionMap.get("contraindications")?.content || "");
    const interactions = bulletLines(sectionMap.get("interactions")?.content || "");
    const deficiency = labeledValues(sectionMap.get("deficiency analysis")?.content || "");
    const evidence = labeledValues(sectionMap.get("evidence section")?.content || "");
    const recommendation = labeledValues(sectionMap.get("practical recommendation")?.content || "");
    const forms = labeledValues(sectionMap.get("forms comparison")?.content || "");
    const timeline = labeledValues(sectionMap.get("timeline and expectations")?.content || "");
    const redFlags = bulletLines(sectionMap.get("red flags")?.content || "");
    const transparency = labeledValues(sectionMap.get("sources and transparency")?.content || "");

    const handled = new Set([
      "identity and verdict",
      "personalized snapshot",
      "what it does",
      "dosage and usage",
      "risks and side effects",
      "contraindications",
      "interactions",
      "deficiency analysis",
      "evidence section",
      "practical recommendation",
      "forms comparison",
      "timeline and expectations",
      "red flags",
      "sources and transparency",
    ]);

    return {
      identity,
      snapshot,
      uses,
      dosage,
      risks,
      contraindications,
      interactions,
      deficiency,
      evidence,
      recommendation,
      forms,
      timeline,
      redFlags,
      transparency,
      extraSections: (result?.sections || []).filter((section) => !handled.has(normalizeHeading(section.heading))),
    };
  }, [result]);

  if (!result) {
    return null;
  }

  const title = firstValue(parsed.identity, "Name") || "Medicine deep-dive";
  const category = firstValue(parsed.identity, "Category");
  const type = firstValue(parsed.identity, "Type");
  const mainUses = firstValue(parsed.identity, "Main uses");
  const mechanism = firstValue(parsed.identity, "Mechanism");
  const verdict = firstValue(parsed.identity, "Personalized verdict") || "Needs review";
  const verdictReason = firstValue(parsed.identity, "Reason for verdict");
  const confidence = firstValue(parsed.transparency, "Confidence score") || firstValue(parsed.evidence, "Evidence strength") || "Mixed";
  const verdictTone = toneForVerdict(verdict);
  const confidenceTone = toneForStrength(confidence);

  return (
    <View style={styles.shell}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Medicine / ingredient intelligence</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        {(category || type) ? <Text style={styles.heroMeta}>{[category, type].filter(Boolean).join(" • ")}</Text> : null}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: verdictTone.background }]}>
            <MaterialCommunityIcons name={verdictTone.icon} size={15} color={verdictTone.color} />
            <Text style={[styles.badgeText, { color: verdictTone.color }]}>{verdict}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: confidenceTone.background }]}>
            <Text style={[styles.badgeText, { color: confidenceTone.color }]}>{confidence}</Text>
          </View>
        </View>
        {mainUses ? <Text style={styles.heroSummary}>Main uses: {mainUses}</Text> : null}
        {mechanism ? <Text style={styles.heroMuted}>Mechanism: {mechanism}</Text> : null}
        {verdictReason ? <Text style={styles.heroMuted}>{verdictReason}</Text> : null}
      </View>

      {parsed.snapshot.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Personalized snapshot</Text>
          <SummaryList items={parsed.snapshot} />
        </View>
      ) : null}

      {parsed.uses.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>What it does</Text>
          <View style={styles.stack}>
            {parsed.uses.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {[
        { title: "Dosage and usage", items: parsed.dosage },
        { title: "Risks and side effects", items: parsed.risks },
        { title: "Deficiency analysis", items: parsed.deficiency },
        { title: "Evidence section", items: parsed.evidence },
        { title: "Practical recommendation", items: parsed.recommendation },
        { title: "Forms comparison", items: parsed.forms },
        { title: "Timeline and expectations", items: parsed.timeline },
        { title: "Sources and transparency", items: parsed.transparency },
      ].map((section) =>
        section.items.length > 0 ? (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <SummaryList items={section.items} />
          </View>
        ) : null
      )}

      {[
        { title: "Contraindications", items: parsed.contraindications },
        { title: "Interactions", items: parsed.interactions },
        { title: "Red flags", items: parsed.redFlags },
      ].map((section) =>
        section.items.length > 0 ? (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.stack}>
              {section.items.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null
      )}

      {parsed.extraSections.map((section, index) => {
        const meta = sectionMeta(section.heading);
        return (
          <View key={`${section.heading}-${index}`} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: `${meta.accent}16` }]}>
                <MaterialCommunityIcons name={meta.icon} size={18} color={meta.accent} />
              </View>
              <Text style={[styles.sectionHeading, { color: meta.accent }]}>{section.heading}</Text>
            </View>
            <View style={styles.stack}>
              {bulletLines(section.content).map((item, itemIndex) => (
                <View key={`${item}-${itemIndex}`} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 14,
  },
  heroCard: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
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
  heroTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    lineHeight: 32,
    color: palette.ink,
  },
  heroMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  heroSummary: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: palette.ink,
  },
  heroMuted: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
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
  },
  stack: {
    gap: 10,
  },
  detailRow: {
    gap: 4,
    borderRadius: 16,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  detailLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: palette.primary,
  },
  detailValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    color: palette.ink,
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
});
