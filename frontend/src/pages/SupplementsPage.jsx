import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { palette } from "../data";
import ImageUpload from "../components/supplements/ImageUpload";
import AnalysisResult from "../components/supplements/AnalysisResult";
import { loadProfile } from "../storage/profileStorage";
import {
  addSupplementHistoryEntry,
  clearSupplementHistory,
  loadSupplementHistory,
  removeSupplementHistoryEntry
} from "../storage/supplementSearchStorage";

const DEFAULT_CONDITIONS = "NIL";
const DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power";
const SCANNER_GUIDE_PAGES = [
  {
    title: "Welcome",
    body: "Welcome to medicine and supplement analyser."
  },
  {
    title: "Choose a search method",
    body: "Choose how you want to scan: search by name, camera capture, or upload image."
  },
  {
    title: "How analysis works",
    body:
      "The text is analysed by ChatGPT first, then an infographic image is generated from that output. Estimated completion time: text analysis 10-25 seconds, infographic generation 20-45 seconds."
  },
  {
    title: "Share your result",
    body: "You can share the text report or download the infographic image to educate your friends and family."
  },
  {
    title: "Use history",
    body: "Open the History tab to view recent supplement searches, then tap an item to reopen that previous result."
  }
];

function composeConditionsFromProfile(profile) {
  const lines = [];
  if (profile.medicalConditions.trim()) {
    lines.push(`Medical conditions: ${profile.medicalConditions.trim()}`);
  }
  if (profile.medicalHistory.trim()) {
    lines.push(`Medical history: ${profile.medicalHistory.trim()}`);
  }
  if (profile.medicationsOrSupplements.trim()) {
    lines.push(`Current medications/supplements: ${profile.medicationsOrSupplements.trim()}`);
  }
  return lines.join("\n");
}

function buildClientActionId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function inferSupplementTitleFromResult(payload, fallback) {
  const analysisText = typeof payload?.analysisText === "string" ? payload.analysisText : "";
  const firstAnalysisLine = analysisText.split("\n").find((line) => (line || "").trim());
  const cleanedFromFirstLine = (firstAnalysisLine || "")
    .replace(/^[-*]\s*/, "")
    .replace(/^supplement\s*name[:\s-]*/i, "")
    .replace(/^supplement(?:\s+identity)?[:\s-]*/i, "")
    .replace(/^name[:\s-]*/i, "")
    .trim();
  if (cleanedFromFirstLine) {
    return cleanedFromFirstLine.slice(0, 90);
  }

  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const identitySection = sections.find((section) => /identity|ingredient|supplement/i.test((section?.heading || "").toLowerCase()));
  const fallbackLine = (identitySection?.content || "").split("\n").find((line) => (line || "").trim());
  const cleaned = (fallbackLine || "")
    .replace(/^[-*]\s*/, "")
    .replace(/^supplement(?:\s+identity)?[:\s-]*/i, "")
    .replace(/^name[:\s-]*/i, "")
    .trim();
  return (cleaned || fallback || "Supplement analysis").slice(0, 90);
}

async function readApiError(response, fallback) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const detail = typeof payload?.detail === "string" ? payload.detail.trim() : "";
      if (detail) {
        return detail;
      }
    }
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export default function SupplementsPage({ requestApi, accountId, accountEmail }) {
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSubPage, setActiveSubPage] = useState("analyzer");
  const [searchHistory, setSearchHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiCallStartedAt, setApiCallStartedAt] = useState(null);
  const [apiCallElapsedMs, setApiCallElapsedMs] = useState(0);
  const [apiCallInFlight, setApiCallInFlight] = useState(false);
  const [textGenerationStatus, setTextGenerationStatus] = useState("idle");
  const [imageGenerationStatus, setImageGenerationStatus] = useState("idle");
  const [error, setError] = useState("");
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [infographicEnabled, setInfographicEnabled] = useState(true);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guidePageWidth, setGuidePageWidth] = useState(320);
  const [activeGuidePage, setActiveGuidePage] = useState(0);
  const [selectedHistoryEntryId, setSelectedHistoryEntryId] = useState("");
  const canCallApi = useMemo(() => typeof requestApi === "function", [requestApi]);
  const selectedImageAspectRatio = selectedAsset?.width && selectedAsset?.height ? selectedAsset.width / selectedAsset.height : 1.4;
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);
  const guideScrollRef = useRef(null);
  const trimmedSearchQuery = searchQuery.trim();
  const hasImageInput = Boolean(selectedAsset) || webcamActive;
  const hasSearchInput = Boolean(trimmedSearchQuery);
  const selectedMode = hasSearchInput ? "search" : hasImageInput ? "image" : "none";
  const imageOptionsDisabled = selectedMode === "search";
  const searchOptionsDisabled = selectedMode === "image";

  useEffect(() => {
    if (!apiCallInFlight || !apiCallStartedAt) {
      return;
    }
    const timer = setInterval(() => {
      setApiCallElapsedMs(Date.now() - apiCallStartedAt);
    }, 120);
    return () => clearInterval(timer);
  }, [apiCallInFlight, apiCallStartedAt]);

  const beginApiCallTimer = () => {
    const started = Date.now();
    setApiCallStartedAt(started);
    setApiCallElapsedMs(0);
    setApiCallInFlight(true);
    setTextGenerationStatus("generating");
    setImageGenerationStatus("waiting");
  };

  const finishApiCallTimer = () => {
    if (!apiCallStartedAt) {
      setApiCallInFlight(false);
      return;
    }
    setApiCallElapsedMs(Date.now() - apiCallStartedAt);
    setApiCallInFlight(false);
  };

  const formatElapsed = (elapsedMs) => `${(elapsedMs / 1000).toFixed(2)}s`;

  const phaseDurationLabel = (startSeconds, endSeconds, prefix) => {
    if (typeof startSeconds !== "number" || typeof endSeconds !== "number") {
      return "";
    }
    const durationMs = Math.max(0, (endSeconds - startSeconds) * 1000);
    return `${prefix}: ${(durationMs / 1000).toFixed(2)}s`;
  };

  const applyGenerationStatusFromPayload = (payload) => {
    const timing = payload?.generationTiming || {};
    if (timing?.textCompletedAt) {
      setTextGenerationStatus("completed");
    } else if (timing?.textStartedAt) {
      setTextGenerationStatus("generating");
    } else {
      setTextGenerationStatus(payload?.analysisText ? "completed" : "idle");
    }

    if (timing?.imageCompletedAt) {
      setImageGenerationStatus("completed");
      return;
    }
    if (timing?.imageStartedAt) {
      setImageGenerationStatus("generating");
      return;
    }
    if (payload?.infographicImageDataUrl) {
      setImageGenerationStatus("completed");
      return;
    }
    setImageGenerationStatus("not_available");
  };

  const textStatusLabel =
    textGenerationStatus === "generating"
      ? "Text generation: generating..."
      : textGenerationStatus === "completed"
        ? "Text generation: completed"
        : textGenerationStatus === "failed"
          ? "Text generation: failed"
          : "Text generation: waiting";

  const imageStatusLabel =
    imageGenerationStatus === "waiting"
      ? "Image generation: waiting for text..."
      : imageGenerationStatus === "generating"
        ? "Image generation: generating..."
        : imageGenerationStatus === "completed"
          ? "Image generation: completed"
          : imageGenerationStatus === "failed"
            ? "Image generation: failed"
            : imageGenerationStatus === "not_available"
              ? "Image generation: unavailable"
              : "Image generation: waiting";

  const generationTiming = result?.generationTiming || null;
  const textDuration = phaseDurationLabel(generationTiming?.textStartedAt, generationTiming?.textCompletedAt, "Text duration");
  const imageDuration = phaseDurationLabel(generationTiming?.imageStartedAt, generationTiming?.imageCompletedAt, "Image duration");

  const hydrateHistory = async () => {
    try {
      const entries = await loadSupplementHistory(accountId, accountEmail);
      setSearchHistory(entries);
    } catch (storageError) {
      console.warn("Unable to load supplement history", storageError);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && webcamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [webcamActive]);

  useEffect(() => {
    let mounted = true;
    const hydrateFromProfile = async () => {
      try {
        const profile = await loadProfile(accountId, accountEmail);
        if (!mounted) {
          return;
        }
        const profileConditions = composeConditionsFromProfile(profile);
        if (profileConditions) {
          setConditions(profileConditions);
        }
        if (profile.goals.trim()) {
          setGoals(profile.goals.trim());
        }
      } catch (error) {
        console.warn("Unable to prefill supplement inputs from profile", error);
      }
    };
    void hydrateFromProfile();
    return () => {
      mounted = false;
    };
  }, [accountId, accountEmail]);

  useEffect(() => {
    void hydrateHistory();
  }, [accountId, accountEmail]);

  const pickImage = async () => {
    if (imageOptionsDisabled) {
      return;
    }
    setError("");

    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Media library access is required to pick an image.");
        return;
      }
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.95
    });
    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    setSelectedHistoryEntryId("");
    setSelectedAsset(pickerResult.assets[0]);
    setResult(null);
  };

  const captureImage = async () => {
    if (imageOptionsDisabled) {
      return;
    }
    setError("");
    setWebcamError("");

    if (Platform.OS === "web") {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setWebcamError("Webcam is not available in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        setWebcamActive(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }, 0);
      } catch {
        setWebcamError("Could not access webcam. Please allow camera permission.");
      }
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera access is required to take a photo.");
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.95
    });
    if (cameraResult.canceled || !cameraResult.assets?.length) {
      return;
    }

    setSelectedHistoryEntryId("");
    setSelectedAsset(cameraResult.assets[0]);
    setResult(null);
  };

  const closeWebcam = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setWebcamActive(false);
  };

  const clearImageSelection = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    closeWebcam();
    setSelectedAsset(null);
    setSelectedHistoryEntryId("");
  };

  const captureWebcamFrame = async () => {
    if (Platform.OS !== "web" || !videoRef.current) {
      return;
    }
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setWebcamError("Unable to capture webcam frame.");
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), "image/jpeg", 0.95);
    });
    if (!blob) {
      setWebcamError("Unable to capture webcam image.");
      return;
    }
    const filename = `webcam-${Date.now()}.jpg`;
    const file = new File([blob], filename, { type: "image/jpeg" });

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = URL.createObjectURL(blob);
    setSelectedAsset({
      uri: objectUrlRef.current,
      file,
      fileName: filename,
      mimeType: "image/jpeg",
      width,
      height
    });
    setSelectedHistoryEntryId("");
    setResult(null);
    closeWebcam();
  };

  const analyzeSupplement = async () => {
    if (!canCallApi) {
      setError("Supplements API is not configured in this screen.");
      return;
    }
    if (!selectedAsset) {
      setError("Please select an image before analysis.");
      return;
    }

    setLoading(true);
    beginApiCallTimer();
    setError("");
    setSelectedHistoryEntryId("");

    try {
      const clientActionId = buildClientActionId("supplement-image");
      const formData = new FormData();
      if (Platform.OS === "web" && selectedAsset.file) {
        formData.append("photo", selectedAsset.file);
      } else {
        formData.append("photo", {
          uri: selectedAsset.uri,
          name: selectedAsset.fileName || "supplement.jpg",
          type: selectedAsset.mimeType || "image/jpeg"
        });
      }

      formData.append("conditions", conditions || DEFAULT_CONDITIONS);
      formData.append("goals", goals || DEFAULT_GOALS);
      formData.append("generateInfographic", infographicEnabled ? "true" : "false");

      const response = await requestApi("/api/supplements/analyze", {
        method: "POST",
        headers: { "X-Client-Action-Id": clientActionId },
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Supplement analysis failed."));
      }

      const payload = await response.json();
      setResult(payload);
      applyGenerationStatusFromPayload(payload);
      const queryLabel =
        (selectedAsset?.fileName && selectedAsset.fileName.trim()) ||
        (selectedAsset?.uri ? "Uploaded supplement image" : "Supplement image");
      const title = inferSupplementTitleFromResult(payload, queryLabel);
      const nowIso = new Date().toISOString();
      const updatedHistory = await addSupplementHistoryEntry({
        id: nowIso.replace(/[-:.TZ]/g, "").slice(0, 17),
        query: queryLabel,
        title,
        mode: "image",
        searchedAt: nowIso,
        inputImage: selectedAsset?.uri || selectedAsset?.fileName || queryLabel,
        infographic: payload?.infographicImageDataUrl || "",
        result: payload
      }, accountId, accountEmail);
      setSearchHistory(updatedHistory);
    } catch (fetchError) {
      setTextGenerationStatus("failed");
      setImageGenerationStatus("failed");
      setError(fetchError instanceof Error ? fetchError.message : "Unable to analyze the supplement right now.");
    } finally {
      finishApiCallTimer();
      setLoading(false);
    }
  };

  const searchSupplementByName = async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setError("Please enter a supplement name to search.");
      return;
    }
    if (searchOptionsDisabled) {
      return;
    }
    if (!canCallApi) {
      setError("Supplements API is not configured in this screen.");
      return;
    }

    setLoading(true);
    beginApiCallTimer();
    setError("");
    setSelectedAsset(null);
    setSelectedHistoryEntryId("");
    closeWebcam();

    try {
      const clientActionId = buildClientActionId("supplement-search");
      const response = await requestApi("/api/supplements/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Action-Id": clientActionId
        },
        body: JSON.stringify({
          supplementName: trimmedQuery,
          conditions: conditions || DEFAULT_CONDITIONS,
          goals: goals || DEFAULT_GOALS,
          generateInfographic: infographicEnabled
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Supplement search failed."));
      }
      const payload = await response.json();
      setResult(payload);
      applyGenerationStatusFromPayload(payload);
      const title = inferSupplementTitleFromResult(payload, trimmedQuery);
      const nowIso = new Date().toISOString();
      const updatedHistory = await addSupplementHistoryEntry({
        id: nowIso.replace(/[-:.TZ]/g, "").slice(0, 17),
        query: trimmedQuery,
        title,
        mode: "text",
        searchedAt: nowIso,
        inputImage: "",
        infographic: payload?.infographicImageDataUrl || "",
        result: payload
      }, accountId, accountEmail);
      setSearchHistory(updatedHistory);
      if (activeSubPage !== "analyzer") {
        setActiveSubPage("analyzer");
      }
    } catch (fetchError) {
      setTextGenerationStatus("failed");
      setImageGenerationStatus("failed");
      setError(fetchError instanceof Error ? fetchError.message : "Unable to search supplement right now.");
    } finally {
      finishApiCallTimer();
      setLoading(false);
    }
  };

  const clearOneHistoryItem = async (entryId) => {
    const updated = await removeSupplementHistoryEntry(entryId, accountId, accountEmail);
    setSearchHistory(updated);
  };

  const clearAllHistoryItems = async () => {
    const updated = await clearSupplementHistory(accountId, accountEmail);
    setSearchHistory(updated);
  };

  const clearSearchInput = () => {
    setSearchQuery("");
    setSelectedHistoryEntryId("");
  };

  const openHistoryEntry = (entry) => {
    if (!entry?.result) {
      return;
    }
    closeWebcam();
    setSelectedAsset(null);
    setError("");
    setSearchQuery("");
    setResult(entry.result);
    setSelectedHistoryEntryId(entry.id || "history");
    applyGenerationStatusFromPayload(entry.result);
    setActiveSubPage("analyzer");
  };

  const closeGuide = () => {
    setGuideVisible(false);
  };

  const openGuide = () => {
    setActiveGuidePage(0);
    setGuideVisible(true);
    setTimeout(() => {
      guideScrollRef.current?.scrollTo?.({ x: 0, animated: false });
    }, 0);
  };

  const exitHistoryPreviewMode = () => {
    setSelectedHistoryEntryId("");
    setResult(null);
    setError("");
    setApiCallStartedAt(null);
    setApiCallElapsedMs(0);
    setApiCallInFlight(false);
    setTextGenerationStatus("idle");
    setImageGenerationStatus("idle");
  };

  const formatDateTime = (isoValue) => {
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) {
      return isoValue;
    }
    return date.toLocaleString();
  };

  const requestDrugInfo = async (drugName) => {
    if (!canCallApi) {
      throw new Error("Supplements API is not configured in this screen.");
    }
    const normalized = typeof drugName === "string" ? drugName.trim() : "";
    if (!normalized) {
      throw new Error("Drug name is required.");
    }
    const response = await requestApi("/api/supplements/drug-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drugName: normalized })
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, "Unable to fetch drug information right now."));
    }
    return response.json();
  };

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Text style={styles.chip}>Supplement scanner</Text>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>Medicine and supplement analyzer</Text>
          <Pressable style={styles.guideButton} onPress={openGuide} accessibilityRole="button" accessibilityLabel="Open scanner guide">
            <Text style={styles.guideButtonText}>?</Text>
          </Pressable>
        </View>
        <Text style={styles.heroSubtitle}>Upload a supplement label to review key ingredients, expected benefits, contraindications, and goal fit in one guided report.</Text>
      </View>

      <View style={styles.segmentRow}>
        <Pressable style={[styles.segmentButton, activeSubPage === "analyzer" && styles.segmentButtonSelected]} onPress={() => setActiveSubPage("analyzer")}>
          <Text style={[styles.segmentText, activeSubPage === "analyzer" && styles.segmentTextSelected]}>Analyzer</Text>
        </Pressable>
        <Pressable style={[styles.segmentButton, activeSubPage === "history" && styles.segmentButtonSelected]} onPress={() => setActiveSubPage("history")}>
          <Text style={[styles.segmentText, activeSubPage === "history" && styles.segmentTextSelected]}>History</Text>
        </Pressable>
      </View>

      {activeSubPage === "analyzer" ? (
        <>
          {selectedHistoryEntryId ? (
            <View style={styles.historyPreviewBanner}>
              <Text style={styles.historyPreviewText}>Viewing a past supplement search.</Text>
              <Pressable style={styles.historyPreviewButton} onPress={exitHistoryPreviewMode}>
                <Text style={styles.historyPreviewButtonText}>Start a new analysis</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.searchCard}>
                <Text style={styles.searchTitle}>Search supplement by name</Text>
                <TextInput
                  style={[styles.searchInput, searchOptionsDisabled && styles.searchInputDisabled]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="e.g. magnesium glycinate"
                  editable={!loading && !searchOptionsDisabled}
                  returnKeyType="search"
                  onSubmitEditing={() => void searchSupplementByName()}
                />
                {hasSearchInput ? (
                  <Pressable style={styles.clearMiniButton} onPress={clearSearchInput} disabled={loading}>
                    <Text style={styles.clearMiniButtonText}>Clear search</Text>
                  </Pressable>
                ) : null}
              </View>

              <ImageUpload
                selectedImageUri={selectedAsset?.uri || ""}
                selectedImageAspectRatio={selectedImageAspectRatio}
                conditions={conditions}
                onChangeConditions={setConditions}
                goals={goals}
                onChangeGoals={setGoals}
                loading={loading}
                error={error}
                showCameraButton
                disableImageOptions={imageOptionsDisabled}
                onClearImageSelection={clearImageSelection}
                clearImageSelectionLabel="Clear image"
                onCaptureImage={captureImage}
                onPickImage={pickImage}
              />
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrap}>
                  <Text style={styles.toggleTitle}>Generate infographic</Text>
                  <Text style={styles.toggleBody}>Disable to speed up supplement analysis.</Text>
                </View>
                <Switch value={infographicEnabled} onValueChange={setInfographicEnabled} disabled={loading} />
              </View>

              <Pressable
                style={[styles.searchButton, (loading || selectedMode === "none") && styles.searchButtonDisabled]}
                onPress={() => void (selectedMode === "search" ? searchSupplementByName() : analyzeSupplement())}
                disabled={loading || selectedMode === "none"}
              >
                <Text style={styles.searchButtonText}>
                  {loading ? "Analyzing..." : selectedMode === "search" ? "Search and analyze supplement" : "Analyze supplement"}
                </Text>
              </Pressable>
              {apiCallStartedAt ? (
                <View style={styles.callMetaCard}>
                  <Text style={styles.callMetaText}>Call started: {new Date(apiCallStartedAt).toLocaleTimeString()}</Text>
                  <Text style={styles.callMetaText}>
                    {apiCallInFlight ? "Elapsed (live): " : "Elapsed: "}
                    {formatElapsed(apiCallElapsedMs)}
                  </Text>
                  <Text style={styles.callMetaText}>{textStatusLabel}</Text>
                  <Text style={styles.callMetaText}>{imageStatusLabel}</Text>
                  {textDuration ? <Text style={styles.callMetaTextMuted}>{textDuration}</Text> : null}
                  {imageDuration ? <Text style={styles.callMetaTextMuted}>{imageDuration}</Text> : null}
                </View>
              ) : null}
            </>
          )}

          <AnalysisResult
            result={result}
            selectedImageUri={selectedAsset?.uri || ""}
            selectedImageAspectRatio={selectedImageAspectRatio}
            onRequestDrugInfo={requestDrugInfo}
          />
        </>
      ) : (
        <View style={styles.historyCard}>
          <View style={styles.historyHeaderRow}>
            <Text style={styles.historyTitle}>Recent supplement searches</Text>
            <Pressable style={styles.clearAllButton} onPress={() => void clearAllHistoryItems()}>
              <Text style={styles.clearAllButtonText}>Clear all</Text>
            </Pressable>
          </View>
          {searchHistory.length === 0 ? <Text style={styles.emptyHistoryText}>No searches yet.</Text> : null}
          {searchHistory.map((entry) => (
            <Pressable key={entry.id} style={styles.historyItem} onPress={() => openHistoryEntry(entry)}>
              <View style={styles.historyTextWrap}>
                <Text style={styles.historyQuery}>{entry.title || entry.query || "Unknown supplement"}</Text>
                <Text style={styles.historyMeta}>
                  {entry.mode === "image" ? "Image scan" : "Text search"} · {formatDateTime(entry.searchedAt)}
                </Text>
              </View>
              <Pressable
                style={styles.clearOneButton}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  void clearOneHistoryItem(entry.id);
                }}
              >
                <Text style={styles.clearOneButtonText}>Remove</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={guideVisible} transparent animationType="fade" onRequestClose={closeGuide}>
        <View style={styles.guideBackdrop}>
          <View style={styles.guideCard}>
            <Pressable style={styles.guideCloseButton} onPress={closeGuide} accessibilityRole="button" accessibilityLabel="Close scanner guide">
              <Text style={styles.guideCloseButtonText}>x</Text>
            </Pressable>
            <Text style={styles.guideTitle}>Scanner guide</Text>
            <ScrollView
              ref={guideScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onLayout={(event) => {
                const width = Math.max(280, Math.floor(event.nativeEvent.layout.width));
                setGuidePageWidth(width);
              }}
              onScroll={(event) => {
                const width = guidePageWidth || 1;
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                if (nextIndex !== activeGuidePage) {
                  setActiveGuidePage(nextIndex);
                }
              }}
              scrollEventThrottle={16}
            >
              {SCANNER_GUIDE_PAGES.map((page, index) => (
                <View key={page.title} style={[styles.guidePage, { width: guidePageWidth }]}>
                  <Text style={styles.guideStepLabel}>Page {index + 1}</Text>
                  <Text style={styles.guidePageTitle}>{page.title}</Text>
                  <Text style={styles.guidePageBody}>{page.body}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.guideFooter}>
              <Text style={styles.guideFooterText}>
                {activeGuidePage + 1} / {SCANNER_GUIDE_PAGES.length}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {Platform.OS === "web" ? (
        <Modal visible={webcamActive} transparent animationType="fade" onRequestClose={closeWebcam}>
          <View style={styles.webcamBackdrop}>
            <View style={styles.webcamCard}>
              <Text style={styles.webcamModalTitle}>Webcam capture</Text>
              <video ref={videoRef} autoPlay playsInline muted style={StyleSheet.flatten(styles.webcamVideo)} />
              {webcamError ? <Text style={styles.webcamError}>{webcamError}</Text> : null}
              <View style={styles.webcamButtonRow}>
                <Pressable style={styles.webcamButton} onPress={captureWebcamFrame} disabled={loading}>
                  <Text style={styles.webcamButtonText}>Capture frame</Text>
                </Pressable>
                <Pressable style={styles.webcamSecondaryButton} onPress={closeWebcam} disabled={loading}>
                  <Text style={styles.webcamSecondaryButtonText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 16
  },
  heroPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    backgroundColor: palette.surface,
    gap: 8
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#e6f7fd",
    color: "#0f5b69",
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "700"
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "700",
    flex: 1
  },
  guideButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#eef3fc",
    alignItems: "center",
    justifyContent: "center"
  },
  guideButtonText: {
    color: palette.blue,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "800"
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10
  },
  segmentButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  segmentButtonSelected: {
    borderColor: palette.blue,
    backgroundColor: "#e8effb"
  },
  segmentText: {
    color: palette.ink,
    fontWeight: "600"
  },
  segmentTextSelected: {
    color: palette.blue
  },
  searchCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10
  },
  searchTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 15
  },
  searchInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdf9",
    paddingHorizontal: 12,
    color: palette.ink
  },
  searchInputDisabled: {
    opacity: 0.5
  },
  searchButton: {
    borderRadius: 12,
    backgroundColor: palette.blue,
    paddingVertical: 11,
    alignItems: "center"
  },
  searchButtonDisabled: {
    opacity: 0.55
  },
  searchButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  toggleRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdf9",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  toggleTextWrap: {
    flex: 1,
    gap: 2
  },
  toggleTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  toggleBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18
  },
  callMetaCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#f7f3ec",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 2
  },
  callMetaText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "600"
  },
  callMetaTextMuted: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  historyPreviewBanner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#c8d8ef",
    backgroundColor: "#eef4ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8
  },
  historyPreviewText: {
    color: "#23456f",
    fontSize: 13,
    fontWeight: "600"
  },
  historyPreviewButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.blue,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  historyPreviewButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  },
  clearMiniButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  clearMiniButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  webcamBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  webcamCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10
  },
  webcamModalTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  webcamVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#000"
  },
  webcamButtonRow: {
    flexDirection: "row",
    gap: 10
  },
  webcamButton: {
    borderRadius: 12,
    backgroundColor: "#0f5b69",
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  webcamButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  webcamSecondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  webcamSecondaryButtonText: {
    color: palette.ink,
    fontWeight: "600"
  },
  webcamError: {
    color: palette.red,
    fontSize: 13
  },
  historyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10
  },
  historyHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  historyTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  clearAllButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  clearAllButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  emptyHistoryText: {
    color: palette.muted,
    fontSize: 13
  },
  historyItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#faf7f1",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  historyTextWrap: {
    flex: 1,
    gap: 3
  },
  historyQuery: {
    color: palette.ink,
    fontWeight: "700"
  },
  historyMeta: {
    color: palette.muted,
    fontSize: 12
  },
  clearOneButton: {
    borderRadius: 10,
    backgroundColor: "#d95a5a",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  clearOneButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  },
  guideBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 20, 34, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  guideCard: {
    width: "86%",
    maxWidth: 420,
    minHeight: 400,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingTop: 16,
    paddingBottom: 12
  },
  guideCloseButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  },
  guideCloseButtonText: {
    color: palette.ink,
    fontWeight: "800",
    fontSize: 14
  },
  guideTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10
  },
  guidePage: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 300,
    gap: 10
  },
  guideStepLabel: {
    color: "#0f5b69",
    fontSize: 12,
    fontWeight: "800"
  },
  guidePageTitle: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800"
  },
  guidePageBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21
  },
  guideFooter: {
    alignItems: "center",
    justifyContent: "center"
  },
  guideFooterText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700"
  }
});
