import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { palette } from "../../data";

function renderPlainTextWithDrugLinks(text, keyPrefix, detectedDrugSet, onPressDrug) {
  const content = typeof text === "string" ? text : "";
  const parts = content.split(/([A-Za-z][A-Za-z0-9\-]{1,})/g).filter((part) => part !== "");

  return parts.map((part, index) => {
    const normalized = part.trim().toLowerCase();
    const isDrug = Boolean(normalized) && detectedDrugSet.has(normalized);
    if (!isDrug) {
      return <Text key={`${keyPrefix}-plain-${index}`}>{part}</Text>;
    }
    return (
      <Text
        key={`${keyPrefix}-drug-${index}`}
        style={styles.drugLinkText}
        onPress={(event) => {
          if (typeof onPressDrug === "function") {
            onPressDrug(part, event);
          }
        }}
      >
        {part}
      </Text>
    );
  });
}

function renderInlineMarkdown(text, keyPrefix, detectedDrugSet, onPressDrug) {
  const content = typeof text === "string" ? text : "";
  const chunks = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return chunks.map((chunk, index) => {
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return (
        <Text key={`${keyPrefix}-b-${index}`} style={styles.inlineBold}>
          {renderPlainTextWithDrugLinks(chunk.slice(2, -2), `${keyPrefix}-b-inner-${index}`, detectedDrugSet, onPressDrug)}
        </Text>
      );
    }
    if (chunk.startsWith("*") && chunk.endsWith("*")) {
      return (
        <Text key={`${keyPrefix}-i-${index}`} style={styles.inlineItalic}>
          {renderPlainTextWithDrugLinks(chunk.slice(1, -1), `${keyPrefix}-i-inner-${index}`, detectedDrugSet, onPressDrug)}
        </Text>
      );
    }
    return <Text key={`${keyPrefix}-t-${index}`}>{renderPlainTextWithDrugLinks(chunk, `${keyPrefix}-t-inner-${index}`, detectedDrugSet, onPressDrug)}</Text>;
  });
}

function renderMarkdownBlock(content, keyPrefix, detectedDrugSet, onPressDrug) {
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
              {renderInlineMarkdown(headingMatch[1], `${keyPrefix}-h-inline-${index}`, detectedDrugSet, onPressDrug)}
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
                {renderInlineMarkdown(bulletText, `${keyPrefix}-li-inline-${index}`, detectedDrugSet, onPressDrug)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`${keyPrefix}-p-${index}`} style={styles.sectionBody}>
            {renderInlineMarkdown(line, `${keyPrefix}-p-inline-${index}`, detectedDrugSet, onPressDrug)}
          </Text>
        );
      })}
    </View>
  );
}

export default function AnalysisResult({ result, selectedImageUri, selectedImageAspectRatio, onRequestDrugInfo }) {
  const [zoom, setZoom] = useState(1);
  const [infographicLoadFailed, setInfographicLoadFailed] = useState(false);
  const [popupCardHeight, setPopupCardHeight] = useState(170);
  const [drugPopup, setDrugPopup] = useState({
    visible: false,
    x: 0,
    y: 0,
    loading: false,
    error: "",
    drug: "",
    usage: "",
    sideEffects: ""
  });
  const drugInfoRequestIdRef = useRef(0);
  const infographicUri = typeof result?.infographicImageDataUrl === "string" ? result.infographicImageDataUrl : "";
  const hasInfographic = Boolean(infographicUri) && !infographicLoadFailed;
  const interactiveWidth = useMemo(() => Math.max(360, Math.round(620 * zoom)), [zoom]);
  const interactiveHeight = useMemo(() => Math.max(220, Math.round(390 * zoom)), [zoom]);
  const { width: viewportWidthRaw, height: viewportHeightRaw } = useWindowDimensions();
  const viewportWidth = Math.max(320, Number.isFinite(viewportWidthRaw) ? viewportWidthRaw : 360);
  const viewportHeight = Math.max(360, Number.isFinite(viewportHeightRaw) ? viewportHeightRaw : 640);
  const detectedDrugSet = useMemo(() => {
    const source = Array.isArray(result?.detectedDrugs) ? result.detectedDrugs : [];
    return new Set(source.map((item) => (typeof item === "string" ? item.trim().toLowerCase() : "")).filter(Boolean));
  }, [result?.detectedDrugs]);

  useEffect(() => {
    setInfographicLoadFailed(false);
    setZoom(1);
    setDrugPopup((previous) => ({ ...previous, visible: false, loading: false, error: "" }));
  }, [infographicUri, result?.analysisText]);

  if (!result) {
    return null;
  }

  const clampZoom = (value) => Math.max(1, Math.min(3, value));
  const zoomIn = () => setZoom((previous) => clampZoom(previous + 0.2));
  const zoomOut = () => setZoom((previous) => clampZoom(previous - 0.2));
  const resetZoom = () => setZoom(1);

  const downloadText = () => {
    const text = (result.analysisText || "").trim();
    if (!text || Platform.OS !== "web") {
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `supplement-analysis-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadInfographic = () => {
    if (!hasInfographic || Platform.OS !== "web") {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = infographicUri;
    anchor.download = `supplement-infographic-${Date.now()}.png`;
    anchor.click();
  };

  const shareResult = async () => {
    const summary = (result.analysisText || "").slice(0, 1200);
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "Supplement analysis",
          text: summary
        });
        return;
      }
      await Share.share({ message: summary });
    } catch {
      Alert.alert("Share unavailable", "Sharing is not available on this device right now.");
    }
  };

  const closeDrugPopup = () => {
    setDrugPopup((previous) => ({ ...previous, visible: false, loading: false, error: "" }));
  };

  const onPressDrug = async (drugLabel, event) => {
    const raw = typeof drugLabel === "string" ? drugLabel : "";
    const normalized = raw.trim().toLowerCase();
    if (!normalized || !detectedDrugSet.has(normalized)) {
      return;
    }

    const pageX = event?.nativeEvent?.pageX;
    const pageY = event?.nativeEvent?.pageY;
    const fallbackX = viewportWidth / 2;
    const fallbackY = viewportHeight / 2;
    const requestId = drugInfoRequestIdRef.current + 1;
    drugInfoRequestIdRef.current = requestId;

    setDrugPopup({
      visible: true,
      x: Number.isFinite(pageX) ? pageX : fallbackX,
      y: Number.isFinite(pageY) ? pageY : fallbackY,
      loading: true,
      error: "",
      drug: raw.trim(),
      usage: "",
      sideEffects: ""
    });

    try {
      if (typeof onRequestDrugInfo !== "function") {
        throw new Error("Drug information service is unavailable.");
      }
      const payload = await onRequestDrugInfo(normalized);
      if (drugInfoRequestIdRef.current !== requestId) {
        return;
      }
      setDrugPopup((previous) => ({
        ...previous,
        loading: false,
        error: "",
        drug: typeof payload?.drug === "string" && payload.drug.trim() ? payload.drug.trim() : previous.drug,
        usage: typeof payload?.usage === "string" ? payload.usage.trim() : "",
        sideEffects: typeof payload?.sideEffects === "string" ? payload.sideEffects.trim() : ""
      }));
    } catch (error) {
      if (drugInfoRequestIdRef.current !== requestId) {
        return;
      }
      setDrugPopup((previous) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to fetch drug info."
      }));
    }
  };

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const horizontalMargin = 12;
  const verticalMargin = 12;
  const verticalGap = 10;
  const drugPopupWidth = Math.min(360, Math.max(240, viewportWidth - horizontalMargin * 2));
  const safeLeftMax = Math.max(horizontalMargin, viewportWidth - drugPopupWidth - horizontalMargin);
  const anchorX = Number.isFinite(drugPopup.x) ? drugPopup.x : viewportWidth / 2;
  const anchorY = Number.isFinite(drugPopup.y) ? drugPopup.y : viewportHeight / 2;
  const drugPopupLeft = clamp(anchorX - drugPopupWidth / 2, horizontalMargin, safeLeftMax);
  const preferredTopAbove = anchorY - popupCardHeight - verticalGap;
  const preferredTopBelow = anchorY + verticalGap;
  const preferredTop = preferredTopAbove >= verticalMargin ? preferredTopAbove : preferredTopBelow;
  const safeTopMax = Math.max(verticalMargin, viewportHeight - popupCardHeight - verticalMargin);
  const drugPopupTop = clamp(preferredTop, verticalMargin, safeTopMax);

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
              {renderMarkdownBlock(section.content || "-", `section-${index}`, detectedDrugSet, onPressDrug)}
            </View>
          ))
        ) : (
          renderMarkdownBlock(result.analysisText, "analysis-fallback", detectedDrugSet, onPressDrug)
        )}
      </ScrollView>

      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={() => void shareResult()}>
          <Text style={styles.actionButtonText}>Share</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={downloadText} disabled={Platform.OS !== "web"}>
          <Text style={styles.actionButtonText}>Download Text</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={downloadInfographic} disabled={!hasInfographic || Platform.OS !== "web"}>
          <Text style={styles.actionButtonText}>Download Image</Text>
        </Pressable>
      </View>

      {hasInfographic ? (
        <View style={styles.infographicPanel}>
          <Text style={styles.sectionHeading}>Visual infographic</Text>
          <View style={styles.zoomControls}>
            <Pressable style={styles.zoomButton} onPress={zoomOut}>
              <Text style={styles.zoomButtonText}>-</Text>
            </Pressable>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <Pressable style={styles.zoomButton} onPress={zoomIn}>
              <Text style={styles.zoomButtonText}>+</Text>
            </Pressable>
            <Pressable style={styles.zoomResetButton} onPress={resetZoom}>
              <Text style={styles.zoomResetText}>Reset</Text>
            </Pressable>
          </View>
          <ScrollView horizontal style={styles.infographicScroll}>
            <ScrollView style={styles.infographicScrollInner}>
              <Image
                source={{ uri: infographicUri }}
                style={[styles.infographicImage, { width: interactiveWidth, height: interactiveHeight }]}
                resizeMode="contain"
                onError={() => setInfographicLoadFailed(true)}
              />
            </ScrollView>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.infographicPanel}>
          <Text style={styles.sectionHeading}>Visual infographic</Text>
          <Text style={styles.emptyInfographicText}>Infographic is unavailable for this result.</Text>
        </View>
      )}

      <Modal visible={drugPopup.visible} transparent animationType="fade" onRequestClose={closeDrugPopup}>
        <View style={styles.drugPopupOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrugPopup} />
          <View
            style={[styles.drugPopupCard, { top: drugPopupTop, left: drugPopupLeft, width: drugPopupWidth }]}
            onLayout={(event) => {
              const nextHeight = Math.ceil(event?.nativeEvent?.layout?.height || 0);
              if (nextHeight > 0) {
                setPopupCardHeight((previous) => (Math.abs(previous - nextHeight) > 1 ? nextHeight : previous));
              }
            }}
          >
            <Pressable style={styles.drugPopupClose} onPress={closeDrugPopup}>
              <Text style={styles.drugPopupCloseText}>x</Text>
            </Pressable>
            {drugPopup.loading ? (
              <Text style={styles.drugPopupLoading}>Loading drug info...</Text>
            ) : drugPopup.error ? (
              <Text style={styles.drugPopupError}>{drugPopup.error}</Text>
            ) : (
              <Text style={styles.drugPopupBody}>
                {`Drug: ${drugPopup.drug || "-"}\nUsage: ${drugPopup.usage || "-"}\nSide Effects: ${drugPopup.sideEffects || "-"}\n---`}
              </Text>
            )}
          </View>
        </View>
      </Modal>
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
  drugLinkText: {
    color: "#0b5fff",
    textDecorationLine: "underline",
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  actionButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  actionButtonText: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 12
  },
  zoomControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  zoomButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  zoomButtonText: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  zoomLabel: {
    color: palette.muted,
    fontWeight: "600"
  },
  zoomResetButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  zoomResetText: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 12
  },
  infographicScroll: {
    maxHeight: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#f8f4ee"
  },
  infographicScrollInner: {
    maxHeight: 420
  },
  infographicImage: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#f8f4ee"
  },
  emptyInfographicText: {
    color: palette.muted,
    lineHeight: 20
  },
  drugPopupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.08)"
  },
  drugPopupCard: {
    position: "absolute",
    width: 320,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdf9",
    padding: 10,
    paddingTop: 22
  },
  drugPopupClose: {
    position: "absolute",
    top: 6,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft
  },
  drugPopupCloseText: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: "800"
  },
  drugPopupBody: {
    color: palette.ink,
    fontSize: 12,
    lineHeight: 18
  },
  drugPopupLoading: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  drugPopupError: {
    color: palette.red,
    fontSize: 12,
    lineHeight: 18
  }
});
