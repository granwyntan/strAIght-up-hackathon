import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

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

        const headingMatch = line.match(/^#{1,3}\s+(.*)$/);
        if (headingMatch) {
          return (
            <Text key={`${keyPrefix}-h-${index}`} style={styles.sectionSubheading}>
              {renderInlineMarkdown(headingMatch[1], `${keyPrefix}-h-inline-${index}`)}
            </Text>
          );
        }

        const bulletMatch = line.match(/^[-*]\s+(.*)$/);
        const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
        if (bulletMatch || numberedMatch) {
          const bulletText = (bulletMatch || numberedMatch)?.[1] || line;
          return (
            <View key={`${keyPrefix}-li-${index}`} style={styles.bulletRow}>
              <Text style={styles.bulletMarker}>•</Text>
              <Text style={styles.sectionBody}>
                {renderInlineMarkdown(bulletText, `${keyPrefix}-li-inline-${index}`)}
              </Text>
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

export default function AnalysisResult({ result, selectedImageUri, selectedImageAspectRatio }) {
  if (!result) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Analysis result</Text>
      <Text style={styles.cardBody}>Structured pharmacist-style feedback generated from your uploaded supplement label.</Text>

      {selectedImageUri ? <Image source={{ uri: selectedImageUri }} style={[styles.previewImage, { aspectRatio: selectedImageAspectRatio || 1.4 }]} resizeMode="contain" /> : null}

      <ScrollView style={styles.resultScroller} contentContainerStyle={styles.resultContent} nestedScrollEnabled>
        {Array.isArray(result.sections) && result.sections.length > 0 ? (
          result.sections.map((section, index) => (
            <View key={`${section.heading}-${index}`} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {renderMarkdownBlock(section.content || "-", `section-${index}`)}
            </View>
          ))
        ) : (
          renderMarkdownBlock(result.analysisText, "analysis-fallback")
        )}
      </ScrollView>

      {result.infographicImageDataUrl ? (
        <View style={styles.infographicPanel}>
          <Text style={styles.sectionHeading}>Visual infographic</Text>
          <Image source={{ uri: result.infographicImageDataUrl }} style={styles.infographicImage} resizeMode="contain" />
        </View>
      ) : null}
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
    gap: 12
  },
  cardTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  cardBody: {
    color: palette.muted,
    lineHeight: 20
  },
  previewImage: {
    width: "100%",
    maxHeight: 260,
    borderRadius: 14,
    backgroundColor: "#f8f4ee",
    borderWidth: 1,
    borderColor: palette.border
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
  markdownBlock: {
    gap: 6
  },
  blankLine: {
    height: 4
  },
  sectionHeading: {
    color: palette.blue,
    fontWeight: "700",
    fontSize: 14
  },
  sectionSubheading: {
    color: palette.ink,
    fontWeight: "700",
    lineHeight: 21
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
  },
  infographicPanel: {
    gap: 8
  },
  infographicImage: {
    width: "100%",
    aspectRatio: 1.6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#f8f4ee"
  }
});
