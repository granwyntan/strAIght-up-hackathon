import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

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

export default function CalorieResult({ result }) {
  if (!result) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Calorie result</Text>

      <View style={styles.contextRow}>
        <Metric label="Age" value={`${Math.round(result.calorieContext.age)}`} />
        <Metric label="BMI" value={result.calorieContext.bmi.toFixed(1)} />
        <Metric label="Daily Target" value={`${result.calorieContext.dailyTarget} kcal`} />
      </View>
      {typeof result.calorieContext.bmr === "number" ? <Text style={styles.contextText}>Estimated BMR: {result.calorieContext.bmr} kcal</Text> : null}
      <Text style={styles.contextText}>{result.calorieContext.note}</Text>

      <ScrollView style={styles.resultScroller} contentContainerStyle={styles.resultContent} nestedScrollEnabled>
        {Array.isArray(result.sections) && result.sections.length > 0 ? (
          result.sections.map((section, index) => (
            <View key={`${section.heading}-${index}`} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {renderMarkdownBlock(section.content || "-", `calorie-section-${index}`)}
            </View>
          ))
        ) : (
          renderMarkdownBlock(result.analysisText, "calorie-fallback")
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 10
  },
  cardTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  contextRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  metricTile: {
    minWidth: 90,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2
  },
  metricLabel: {
    color: palette.muted,
    fontSize: 11
  },
  metricValue: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 12
  },
  contextText: {
    color: palette.muted,
    lineHeight: 19
  },
  resultScroller: {
    maxHeight: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft
  },
  resultContent: {
    padding: 12,
    gap: 12
  },
  section: {
    gap: 6
  },
  sectionHeading: {
    color: palette.blue,
    fontWeight: "700",
    fontSize: 14
  },
  markdownBlock: {
    gap: 6
  },
  blankLine: {
    height: 4
  },
  sectionBody: {
    color: palette.ink,
    lineHeight: 21
  },
  inlineBold: {
    fontWeight: "700"
  },
  inlineItalic: {
    fontStyle: "italic"
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  bulletMarker: {
    color: palette.ink,
    lineHeight: 21
  }
});

