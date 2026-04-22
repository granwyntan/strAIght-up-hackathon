import React, { Fragment, ReactNode } from "react";
import { Image, ScrollView, Text, View } from "react-native";

import type { SupplementAnalysisResult } from "../../types/supplements";

type AnalysisResultProps = {
  result: SupplementAnalysisResult | null;
  selectedImageUri: string;
  selectedImageAspectRatio: number;
};

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const chunks = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return chunks.map((chunk, index) => {
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return (
        <Text key={`${keyPrefix}-b-${index}`} className="font-['Poppins_700Bold'] text-ink">
          {chunk.slice(2, -2)}
        </Text>
      );
    }
    if (chunk.startsWith("*") && chunk.endsWith("*")) {
      return (
        <Text key={`${keyPrefix}-i-${index}`} className="font-['Poppins_400Regular'] italic text-ink">
          {chunk.slice(1, -1)}
        </Text>
      );
    }
    return (
      <Text key={`${keyPrefix}-t-${index}`} className="font-['Poppins_400Regular'] text-ink">
        {chunk}
      </Text>
    );
  });
}

function renderMarkdownBlock(content: string, keyPrefix: string) {
  const lines = content.split("\n");

  return (
    <View className="gap-1.5">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) {
          return <View key={`${keyPrefix}-sp-${index}`} className="h-1" />;
        }

        const headingMatch = line.match(/^#{1,3}\s+(.*)$/);
        if (headingMatch) {
          return (
            <Text key={`${keyPrefix}-h-${index}`} className="font-['Poppins_700Bold'] leading-6 text-ink">
              {renderInlineMarkdown(headingMatch[1], `${keyPrefix}-h-inline-${index}`)}
            </Text>
          );
        }

        const bulletMatch = line.match(/^[-*]\s+(.*)$/);
        const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
        if (bulletMatch || numberedMatch) {
          const bulletText = (bulletMatch || numberedMatch)?.[1] || line;
          return (
            <View key={`${keyPrefix}-li-${index}`} className="flex-row items-start gap-2">
              <Text className="font-['Poppins_600SemiBold'] leading-6 text-ink">•</Text>
              <Text className="flex-1 font-['Poppins_400Regular'] leading-6 text-ink">
                {renderInlineMarkdown(bulletText, `${keyPrefix}-li-inline-${index}`)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`${keyPrefix}-p-${index}`} className="font-['Poppins_400Regular'] leading-6 text-ink">
            {renderInlineMarkdown(line, `${keyPrefix}-p-inline-${index}`)}
          </Text>
        );
      })}
    </View>
  );
}

export default function AnalysisResult({ result, selectedImageUri, selectedImageAspectRatio }: AnalysisResultProps) {
  if (!result) {
    return null;
  }

  return (
    <View className="gap-3 rounded-[28px] border border-line bg-card p-5 shadow-panel">
      <Text className="font-['Poppins_700Bold'] text-base text-ink">Analysis result</Text>
      <Text className="font-['Poppins_400Regular'] leading-6 text-muted">
        Structured pharmacist-style feedback generated from the uploaded label, using the same typography and calmer material styling as the main app.
      </Text>

      {selectedImageUri ? (
        <Image
          source={{ uri: selectedImageUri }}
          className="w-full rounded-2xl border border-line bg-soft"
          style={{ aspectRatio: selectedImageAspectRatio || 1.4, maxHeight: 260 }}
          resizeMode="contain"
        />
      ) : null}

      <ScrollView className="max-h-[420px] rounded-2xl border border-line bg-soft" contentContainerStyle={{ gap: 12, padding: 12 }} nestedScrollEnabled>
        {Array.isArray(result.sections) && result.sections.length > 0
          ? result.sections.map((section, index) => (
              <View key={`${section.heading}-${index}`} className="gap-1.5">
                <Text className="font-['Poppins_700Bold'] text-[14px] text-sage">{section.heading}</Text>
                {renderMarkdownBlock(section.content || "-", `section-${index}`)}
              </View>
            ))
          : renderMarkdownBlock(result.analysisText, "analysis-fallback")}
      </ScrollView>

      {result.infographicImageDataUrl ? (
        <View className="gap-2">
          <Text className="font-['Poppins_700Bold'] text-[14px] text-sage">Visual infographic</Text>
          <Image
            source={{ uri: result.infographicImageDataUrl }}
            className="w-full rounded-2xl border border-line bg-soft"
            style={{ aspectRatio: 1.6 }}
            resizeMode="contain"
          />
        </View>
      ) : null}
    </View>
  );
}
