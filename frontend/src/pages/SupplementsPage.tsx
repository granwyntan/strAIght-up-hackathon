import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../data";
import { typography } from "../styles/typography";
import AnalysisResult from "../components/supplements/AnalysisResult";
import ImageUpload from "../components/supplements/ImageUpload";
import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import { loadProfile } from "../storage/profileStorage";
import { addSupplementHistoryEntry, clearSupplementHistory, loadSupplementHistory, removeSupplementHistoryEntry } from "../storage/supplementSearchStorage";
import type { PickedSupplementAsset, RequestApi, SupplementAnalysisResult } from "../types/supplements";
import { compactIsoId, formatDisplayDateTime, formatDisplayTime } from "../utils/dateTime";
import ToolHeader from "../components/shared/ToolHeader";

const DEFAULT_CONDITIONS = "NIL";
const DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power";
const SCANNER_GUIDE_PAGES = [
  {
    title: "Welcome",
    body: "Scan by name or image to review likely uses, cautions, and fit for your goals in one calmer report.",
  },
  {
    title: "Pick one input mode",
    body: "Use either supplement name search OR image scanning. When one mode is active, the other is dimmed so the analysis stays clear.",
  },
  {
    title: "Result flow",
    body: "GramWIN creates a text report first, then optionally generates an infographic if you keep that toggle on.",
  },
  {
    title: "Use history",
    body: "Past supplement scans stay in local or account-backed history so you can reopen them without rescanning.",
  },
];

type SupplementsPageProps = {
  requestApi: RequestApi;
  accountId?: string;
  accountEmail?: string;
};

type SearchHistoryEntry = {
  id: string;
  query: string;
  title: string;
  mode: "image" | "text";
  searchedAt: string;
  result: SupplementAnalysisResult | null;
  inputImage: string;
  infographic: string;
};

function composeConditionsFromProfile(profile: {
  medicalConditions?: string;
  medicalHistory?: string;
  medicationsOrSupplements?: string;
}) {
  const lines = [];
  if (profile.medicalConditions?.trim()) {
    lines.push(`Medical conditions: ${profile.medicalConditions.trim()}`);
  }
  if (profile.medicalHistory?.trim()) {
    lines.push(`Medical history: ${profile.medicalHistory.trim()}`);
  }
  if (profile.medicationsOrSupplements?.trim()) {
    lines.push(`Current medications or supplements: ${profile.medicationsOrSupplements.trim()}`);
  }
  return lines.join("\n");
}

function buildClientActionId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function inferSupplementTitleFromResult(payload: SupplementAnalysisResult | null, fallback: string) {
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

async function readApiError(response: Response, fallback: string) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { detail?: unknown };
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

function formatElapsed(elapsedMs: number) {
  return `${(elapsedMs / 1000).toFixed(2)}s`;
}

function phaseDurationLabel(startSeconds?: number | null, endSeconds?: number | null, prefix = "Duration") {
  if (typeof startSeconds !== "number" || typeof endSeconds !== "number") {
    return "";
  }
  const durationMs = Math.max(0, (endSeconds - startSeconds) * 1000);
  return `${prefix}: ${(durationMs / 1000).toFixed(2)}s`;
}

function analysisProgressValue(textStatus: "idle" | "waiting" | "generating" | "completed" | "failed", imageStatus: "idle" | "waiting" | "generating" | "completed" | "failed" | "not_available") {
  if (textStatus === "failed" || imageStatus === "failed") {
    return 0.18;
  }
  if (textStatus === "completed" && (imageStatus === "completed" || imageStatus === "not_available")) {
    return 1;
  }
  if (textStatus === "completed" && imageStatus === "generating") {
    return 0.82;
  }
  if (textStatus === "completed") {
    return 0.72;
  }
  if (textStatus === "generating") {
    return 0.48;
  }
  if (textStatus === "waiting") {
    return 0.18;
  }
  return 0;
}

export default function SupplementsPage({ requestApi, accountId, accountEmail, guideSignal = 0 }: SupplementsPageProps & { guideSignal?: number }) {
  const [selectedAsset, setSelectedAsset] = useState<PickedSupplementAsset | null>(null);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSubPage, setActiveSubPage] = useState<"analyzer" | "history">("analyzer");
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [result, setResult] = useState<SupplementAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiCallStartedAt, setApiCallStartedAt] = useState<number | null>(null);
  const [apiCallElapsedMs, setApiCallElapsedMs] = useState(0);
  const [apiCallInFlight, setApiCallInFlight] = useState(false);
  const [textGenerationStatus, setTextGenerationStatus] = useState<"idle" | "waiting" | "generating" | "completed" | "failed">("idle");
  const [imageGenerationStatus, setImageGenerationStatus] = useState<"idle" | "waiting" | "generating" | "completed" | "failed" | "not_available">("idle");
  const [error, setError] = useState("");
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [infographicEnabled, setInfographicEnabled] = useState(true);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guidePageWidth, setGuidePageWidth] = useState(320);
  const [activeGuidePage, setActiveGuidePage] = useState(0);
  const [selectedHistoryEntryId, setSelectedHistoryEntryId] = useState("");
  const [historyModalEntry, setHistoryModalEntry] = useState<SearchHistoryEntry | null>(null);
  const canCallApi = useMemo(() => typeof requestApi === "function", [requestApi]);
  const selectedImageAspectRatio = selectedAsset?.width && selectedAsset?.height ? selectedAsset.width / selectedAsset.height : 1.4;
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const guideScrollRef = useRef<ScrollView | null>(null);

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
        if (profile.goals?.trim()) {
          setGoals(profile.goals.trim());
        }
      } catch {
        // Fall back to local defaults quietly.
      }
    };
    void hydrateFromProfile();
    return () => {
      mounted = false;
    };
  }, [accountEmail, accountId]);

  useEffect(() => {
    let mounted = true;
    const hydrateHistory = async () => {
      try {
        const entries = (await loadSupplementHistory(accountId, accountEmail)) as SearchHistoryEntry[];
        if (mounted) {
          setSearchHistory(entries);
        }
      } catch {
        if (mounted) {
          setSearchHistory([]);
        }
      }
    };
    void hydrateHistory();
    return () => {
      mounted = false;
    };
  }, [accountEmail, accountId]);

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

  function beginApiCallTimer() {
    const started = Date.now();
    setApiCallStartedAt(started);
    setApiCallElapsedMs(0);
    setApiCallInFlight(true);
    setTextGenerationStatus("generating");
    setImageGenerationStatus("waiting");
  }

  function finishApiCallTimer() {
    if (!apiCallStartedAt) {
      setApiCallInFlight(false);
      return;
    }
    setApiCallElapsedMs(Date.now() - apiCallStartedAt);
    setApiCallInFlight(false);
  }

  function applyGenerationStatusFromPayload(payload: SupplementAnalysisResult | null) {
    const timing = payload?.generationTiming || null;
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
  }

  async function pickImage() {
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
      quality: 0.95,
    });
    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    const asset = pickerResult.assets[0];
    setSelectedHistoryEntryId("");
    setSelectedAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setResult(null);
  }

  async function captureImage() {
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
      quality: 0.95,
    });
    if (cameraResult.canceled || !cameraResult.assets?.length) {
      return;
    }

    const asset = cameraResult.assets[0];
    setSelectedHistoryEntryId("");
    setSelectedAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setResult(null);
  }

  function closeWebcam() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setWebcamActive(false);
  }

  function clearImageSelection() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    closeWebcam();
    setSelectedAsset(null);
    setSelectedHistoryEntryId("");
  }

  async function captureWebcamFrame() {
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

    const blob = await new Promise<Blob | null>((resolve) => {
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
      height,
    });
    setSelectedHistoryEntryId("");
    setResult(null);
    closeWebcam();
  }

  async function analyzeSupplement() {
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
        formData.append(
          "photo",
          {
            uri: selectedAsset.uri,
            name: selectedAsset.fileName || "supplement.jpg",
            type: selectedAsset.mimeType || "image/jpeg",
          } as never
        );
      }

      formData.append("conditions", conditions || DEFAULT_CONDITIONS);
      formData.append("goals", goals || DEFAULT_GOALS);
      formData.append("generateInfographic", infographicEnabled ? "true" : "false");

      const response = await requestApi("/api/supplements/analyze", {
        method: "POST",
        headers: { "X-Client-Action-Id": clientActionId },
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Supplement analysis failed."));
      }

      const payload = (await response.json()) as SupplementAnalysisResult;
      setResult(payload);
      applyGenerationStatusFromPayload(payload);
      const queryLabel = (selectedAsset.fileName && selectedAsset.fileName.trim()) || (selectedAsset.uri ? "Uploaded supplement image" : "Supplement image");
      const title = inferSupplementTitleFromResult(payload, queryLabel);
      const nowIso = new Date().toISOString();
      const updatedHistory = (await addSupplementHistoryEntry(
        {
          id: compactIsoId(nowIso),
          query: queryLabel,
          title,
          mode: "image",
          searchedAt: nowIso,
          inputImage: selectedAsset.uri || selectedAsset.fileName || queryLabel,
          infographic: payload?.infographicImageDataUrl || "",
          result: payload,
        },
        accountId,
        accountEmail
      )) as SearchHistoryEntry[];
      setSearchHistory(updatedHistory);
    } catch (fetchError) {
      setTextGenerationStatus("failed");
      setImageGenerationStatus("failed");
      setError(fetchError instanceof Error ? fetchError.message : "Unable to analyze the supplement right now.");
    } finally {
      finishApiCallTimer();
      setLoading(false);
    }
  }

  async function searchSupplementByName() {
    const normalizedQuery = trimmedSearchQuery;
    if (!normalizedQuery) {
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
          "X-Client-Action-Id": clientActionId,
        },
        body: JSON.stringify({
          supplementName: normalizedQuery,
          conditions: conditions || DEFAULT_CONDITIONS,
          goals: goals || DEFAULT_GOALS,
          generateInfographic: infographicEnabled,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Supplement search failed."));
      }
      const payload = (await response.json()) as SupplementAnalysisResult;
      setResult(payload);
      applyGenerationStatusFromPayload(payload);
      const title = inferSupplementTitleFromResult(payload, normalizedQuery);
      const nowIso = new Date().toISOString();
      const updatedHistory = (await addSupplementHistoryEntry(
        {
          id: compactIsoId(nowIso),
          query: normalizedQuery,
          title,
          mode: "text",
          searchedAt: nowIso,
          inputImage: "",
          infographic: payload?.infographicImageDataUrl || "",
          result: payload,
        },
        accountId,
        accountEmail
      )) as SearchHistoryEntry[];
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
  }

  async function clearOneHistoryItem(entryId: string) {
    const updated = (await removeSupplementHistoryEntry(entryId, accountId, accountEmail)) as SearchHistoryEntry[];
    setSearchHistory(updated);
    if (historyModalEntry?.id === entryId) {
      setHistoryModalEntry(null);
    }
  }

  async function clearAllHistoryItems() {
    const updated = (await clearSupplementHistory(accountId, accountEmail)) as SearchHistoryEntry[];
    setSearchHistory(updated);
    setHistoryModalEntry(null);
  }

  function clearSearchInput() {
    setSearchQuery("");
    setSelectedHistoryEntryId("");
  }

  function openHistoryEntry(entry: SearchHistoryEntry, options?: { openInAnalyzer?: boolean }) {
    if (!entry?.result) {
      return;
    }
    if (!options?.openInAnalyzer) {
      setHistoryModalEntry(entry);
      return;
    }
    closeWebcam();
    setSelectedAsset(entry.inputImage ? { uri: entry.inputImage } : null);
    setError("");
    setSearchQuery("");
    setResult(entry.result);
    setSelectedHistoryEntryId(entry.id || "history");
    setHistoryModalEntry(null);
    applyGenerationStatusFromPayload(entry.result);
    setActiveSubPage("analyzer");
  }

  function closeHistoryModal() {
    setHistoryModalEntry(null);
  }

  function closeGuide() {
    setGuideVisible(false);
  }

  function openGuide() {
    setActiveGuidePage(0);
    setGuideVisible(true);
    setTimeout(() => {
      guideScrollRef.current?.scrollTo?.({ x: 0, animated: false });
    }, 0);
  }

  useEffect(() => {
    if (guideSignal > 0) {
      openGuide();
    }
  }, [guideSignal]);

  function exitHistoryPreviewMode() {
    setSelectedHistoryEntryId("");
    setResult(null);
    setError("");
    setApiCallStartedAt(null);
    setApiCallElapsedMs(0);
    setApiCallInFlight(false);
    setTextGenerationStatus("idle");
    setImageGenerationStatus("idle");
  }

  const generationTiming = result?.generationTiming || null;
  const textDuration = phaseDurationLabel(generationTiming?.textStartedAt, generationTiming?.textCompletedAt, "Text duration");
  const imageDuration = phaseDurationLabel(generationTiming?.imageStartedAt, generationTiming?.imageCompletedAt, "Image duration");
  const progressValue = analysisProgressValue(textGenerationStatus, imageGenerationStatus);

  const textStatusLabel =
    textGenerationStatus === "generating"
      ? "Text report: generating..."
      : textGenerationStatus === "completed"
        ? "Text report: completed"
        : textGenerationStatus === "failed"
          ? "Text report: failed"
          : "Text report: waiting";

  const imageStatusLabel =
    imageGenerationStatus === "waiting"
      ? "Infographic: waiting for text..."
      : imageGenerationStatus === "generating"
        ? "Infographic: generating..."
        : imageGenerationStatus === "completed"
          ? "Infographic: completed"
          : imageGenerationStatus === "failed"
            ? "Infographic: failed"
            : imageGenerationStatus === "not_available"
              ? "Infographic: unavailable"
              : "Infographic: waiting";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ToolHeader
        title="Medicine and Supplement Analyzer"
        subtitle="Use either bottle or label upload OR supplement-name search to get a calmer report on ingredients, benefits, cautions, interactions, and goal fit."
        onPressHelp={openGuide}
      />

      <View className="flex-row rounded-[18px] border border-line bg-card p-1 shadow-panel">
        <Pressable className={`flex-1 items-center rounded-2xl px-4 py-3 ${activeSubPage === "analyzer" ? "bg-sage" : "bg-transparent"}`} onPress={() => setActiveSubPage("analyzer")}>
          <Text style={typography.semibold} className={`font-['Poppins_600SemiBold'] ${activeSubPage === "analyzer" ? "text-card" : "text-muted"}`}>Analyzer</Text>
        </Pressable>
        <Pressable className={`flex-1 items-center rounded-2xl px-4 py-3 ${activeSubPage === "history" ? "bg-sage" : "bg-transparent"}`} onPress={() => setActiveSubPage("history")}>
          <Text style={typography.semibold} className={`font-['Poppins_600SemiBold'] ${activeSubPage === "history" ? "text-card" : "text-muted"}`}>History</Text>
        </Pressable>
      </View>

      {activeSubPage === "analyzer" ? (
        <>
          {selectedHistoryEntryId ? (
            <View className="gap-2 rounded-[18px] border border-line bg-soft px-4 py-4">
              <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-ink">Viewing a saved supplement analysis inside the live analyzer layout.</Text>
              <Pressable className="self-start rounded-full border border-line bg-card px-3 py-2" onPress={exitHistoryPreviewMode}>
                <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Start a new analysis</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="gap-3 rounded-[22px] border border-line bg-card p-5 shadow-panel">
                <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Search supplement by name</Text>
                <Text style={typography.regular} className="font-['Poppins_400Regular'] leading-5 text-muted">Use name search for a quick product review, then switch to an image when you want more label-specific detail.</Text>
                <TextInput style={typography.regular} className={`min-h-[50px] rounded-2xl border px-4 py-3 font-['Poppins_400Regular'] text-ink ${searchOptionsDisabled ? "border-line bg-soft/60" : "border-line bg-card"}`}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="e.g. magnesium glycinate"
                  placeholderTextColor="#8B8F99"
                  editable={!loading && !searchOptionsDisabled}
                  returnKeyType="search"
                  onSubmitEditing={() => void searchSupplementByName()}
                />
                <View className="flex-row flex-wrap items-center gap-2">
                  <Pressable className={`rounded-2xl px-4 py-3 ${loading || !trimmedSearchQuery || searchOptionsDisabled ? "bg-sage/50" : "bg-sage"}`} onPress={() => void searchSupplementByName()} disabled={loading || !trimmedSearchQuery || searchOptionsDisabled}>
                    <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-card">{loading && selectedMode === "search" ? "Searching..." : "Search and analyze"}</Text>
                  </Pressable>
                  {trimmedSearchQuery ? (
                    <Pressable className="rounded-2xl border border-line bg-soft px-4 py-3" onPress={clearSearchInput} disabled={loading}>
                      <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Clear search</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {Platform.OS === "web" ? (
                <View className="gap-2.5 rounded-[22px] border border-line bg-card p-5 shadow-panel">
                  <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Webcam capture</Text>
                  <Text style={typography.regular} className="font-['Poppins_400Regular'] leading-5 text-muted">Use your browser webcam for a quick front-label scan.</Text>
                  {webcamActive ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted style={styles.webcamVideo} />
                      <View className="flex-row gap-2.5">
                        <Pressable className="items-center rounded-2xl bg-sage px-4 py-3" onPress={captureWebcamFrame} disabled={loading}>
                          <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-card">Capture frame</Text>
                        </Pressable>
                        <Pressable className="items-center rounded-2xl border border-line bg-soft px-4 py-3" onPress={closeWebcam} disabled={loading}>
                          <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-ink">Close webcam</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <Pressable className={`items-center rounded-2xl px-4 py-3 ${imageOptionsDisabled ? "bg-soft/60 opacity-50" : "bg-sage"}`} onPress={captureImage} disabled={loading || imageOptionsDisabled}>
                      <Text style={typography.semibold} className={`font-['Poppins_600SemiBold'] ${imageOptionsDisabled ? "text-muted" : "text-card"}`}>Open webcam</Text>
                    </Pressable>
                  )}
                  {webcamError ? <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] text-danger">{webcamError}</Text> : null}
                </View>
              ) : null}

              <ImageUpload
                selectedImageUri={selectedAsset?.uri || ""}
                selectedImageAspectRatio={selectedImageAspectRatio}
                conditions={conditions}
                onChangeConditions={setConditions}
                goals={goals}
                onChangeGoals={setGoals}
                loading={loading}
                error={error}
                showCameraButton={Platform.OS !== "web"}
                disableImageOptions={imageOptionsDisabled}
                onClearImageSelection={clearImageSelection}
                clearImageSelectionLabel="Clear image"
                analyzeLabel="Analyze supplement"
                onCaptureImage={captureImage}
                onPickImage={pickImage}
                onAnalyze={analyzeSupplement}
              />

              <View className="flex-row items-center justify-between gap-3 rounded-[22px] border border-line bg-card px-5 py-4 shadow-panel">
                <View className="flex-1">
                  <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Generate infographic</Text>
                  <Text style={typography.regular} className="font-['Poppins_400Regular'] leading-5 text-muted">Turn this off if you want faster supplement analysis.</Text>
                </View>
                <Switch value={infographicEnabled} onValueChange={setInfographicEnabled} disabled={loading} />
              </View>

              {apiCallStartedAt ? (
                <View className="gap-3 rounded-[22px] border border-line bg-card px-5 py-4 shadow-panel">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">{loading ? "Working on your report" : "Latest analysis run"}</Text>
                      <Text style={typography.regular} className="font-['Poppins_400Regular'] text-muted">
                        Started {formatDisplayTime(apiCallStartedAt)} • {apiCallInFlight ? "Elapsed" : "Total time"} {formatElapsed(apiCallElapsedMs)}
                      </Text>
                    </View>
                    <Text style={typography.semibold} className="rounded-full bg-moss px-3 py-1.5 font-['Poppins_600SemiBold'] text-xs text-sage">{Math.round(progressValue * 100)}%</Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-full bg-moss">
                    <View className="h-full rounded-full bg-sage" style={{ width: `${Math.max(8, Math.round(progressValue * 100))}%` }} />
                  </View>
                  <View className="gap-2">
                    {[
                      { label: "Extractor", body: "Reading the label or product name.", active: progressValue >= 0.18, complete: progressValue >= 0.48 },
                      { label: "Claim analyzer", body: "Separating real claims from marketing language.", active: progressValue >= 0.48, complete: progressValue >= 0.72 },
                      { label: "Safety and evidence", body: "Checking ingredient fit, risks, and evidence strength.", active: progressValue >= 0.72, complete: progressValue >= 1 },
                    ].map((step) => (
                      <View key={step.label} className="flex-row items-start gap-3">
                        <View className={`mt-0.5 h-6 w-6 items-center justify-center rounded-full ${step.complete ? "bg-moss" : step.active ? "bg-soft" : "bg-shell"}`}>
                          <MaterialCommunityIcons
                            name={step.complete ? "check" : step.active ? "progress-clock" : "circle-outline"}
                            size={14}
                            color={step.complete ? palette.primary : palette.muted}
                          />
                        </View>
                        <View className="flex-1 gap-0.5">
                          <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-[13px] text-ink">{step.label}</Text>
                          <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[12px] leading-5 text-muted">{step.body}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View className="gap-1">
                    <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] text-muted">{textStatusLabel}</Text>
                    <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] text-muted">{imageStatusLabel}</Text>
                    {textDuration ? <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] text-muted">{textDuration}</Text> : null}
                    {imageDuration ? <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] text-muted">{imageDuration}</Text> : null}
                  </View>
                </View>
              ) : null}
            </>
          )}

          <AnalysisResult result={result} selectedImageUri={selectedAsset?.uri || ""} selectedImageAspectRatio={selectedImageAspectRatio} />
        </>
      ) : (
        <View className="gap-4 rounded-[22px] border border-line bg-card p-5 shadow-panel">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-[12px] bg-moss">
                <MaterialCommunityIcons name="history" size={18} color={palette.primary} />
              </View>
              <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Recent supplement searches</Text>
            </View>
            <Pressable className="rounded-full border border-line bg-soft px-3 py-2" onPress={() => void clearAllHistoryItems()}>
              <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Clear all</Text>
            </Pressable>
          </View>
          <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] leading-5 text-muted">Open a saved result in a modal, then move it back into the analyzer only if you want to rework it.</Text>
          {searchHistory.length === 0 ? <Text style={typography.regular} className="font-['Poppins_400Regular'] text-muted">No searches yet.</Text> : null}
          {searchHistory.map((entry) => (
            <Pressable key={entry.id} className="gap-3 rounded-[18px] border border-line bg-soft px-4 py-4" onPress={() => openHistoryEntry(entry)}>
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-ink">{entry.title || entry.query || "Unknown supplement"}</Text>
                  <Text style={typography.regular} className="font-['Poppins_400Regular'] text-muted">
                    {entry.mode === "image" ? "Image scan" : "Text search"} • {formatDisplayDateTime(entry.searchedAt)}
                  </Text>
                </View>
                <View className="rounded-full bg-card px-3 py-1.5">
                  <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-xs text-sage">View</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-end gap-2">
                <Pressable
                  className="rounded-full border border-line bg-card px-3 py-2"
                  onPress={(event) => {
                    event.stopPropagation();
                    openHistoryEntry(entry, { openInAnalyzer: true });
                  }}
                >
                  <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Open in analyzer</Text>
                </Pressable>
                <Pressable
                  className="rounded-full border border-line bg-card px-3 py-2"
                  onPress={(event) => {
                    event.stopPropagation();
                    void clearOneHistoryItem(entry.id);
                  }}
                >
                  <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Remove</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={Boolean(historyModalEntry)} transparent animationType="slide" onRequestClose={closeHistoryModal}>
        <View style={styles.guideBackdrop}>
          <View style={[styles.guideCard, styles.historyModalCard]}>
            <View style={styles.sheetHandle} />
            <View style={styles.historyModalHeader}>
              <View style={styles.historyModalCopy}>
                <Text style={styles.guideTitle}>Saved supplement analysis</Text>
                <Text style={styles.historyModalMeta}>
                  {(historyModalEntry?.mode === "image" ? "Image scan" : "Text search")} • {historyModalEntry ? formatDisplayDateTime(historyModalEntry.searchedAt) : ""}
                </Text>
              </View>
              <Pressable style={styles.guideCloseButton} onPress={closeHistoryModal}>
                <Text style={styles.guideCloseButtonText}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.historyModalScroller}>
              <AnalysisResult
                result={historyModalEntry?.result || null}
                selectedImageUri={historyModalEntry?.inputImage || ""}
                selectedImageAspectRatio={selectedImageAspectRatio}
              />
            </ScrollView>
            <View style={styles.historyModalActions}>
              <Pressable
                style={styles.historyModalPrimaryButton}
                onPress={() => {
                  if (historyModalEntry) {
                    openHistoryEntry(historyModalEntry, { openInAnalyzer: true });
                  }
                }}
              >
                <Text style={styles.historyModalPrimaryText}>Open in analyzer</Text>
              </Pressable>
              {historyModalEntry ? (
                <Pressable
                  style={styles.historyModalSecondaryButton}
                  onPress={() => {
                    void clearOneHistoryItem(historyModalEntry.id);
                  }}
                >
                  <Text style={styles.historyModalSecondaryText}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <TutorialSheet visible={guideVisible} title="Supplement tutorial" pages={SCANNER_GUIDE_PAGES} onClose={closeGuide} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  webcamVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8E2DC",
    backgroundColor: "#000",
  },
  guideBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 0,
  },
  guideCard: {
    width: "100%",
    maxWidth: 420,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: palette.surface,
    padding: 20,
    gap: 12,
  },
  historyModalCard: {
    maxWidth: 720,
    maxHeight: "88%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 10,
  },
  historyModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  historyModalCopy: {
    flex: 1,
    gap: 4,
  },
  historyModalMeta: {
    ...typography.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  historyModalScroller: {
    gap: 12,
    paddingBottom: 4,
  },
  historyModalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
  },
  historyModalPrimaryButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  historyModalPrimaryText: {
    ...typography.semibold,
    fontSize: 13,
    color: palette.surface,
  },
  historyModalSecondaryButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  historyModalSecondaryText: {
    ...typography.semibold,
    fontSize: 13,
    color: palette.ink,
  },
  guideCloseButton: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
  },
  guideCloseButtonText: {
    ...typography.bold,
    fontSize: 18,
    color: palette.primary,
  },
  guideTitle: {
    ...typography.bold,
    fontSize: 20,
    color: palette.ink,
  },
  guidePage: {
    gap: 8,
    paddingRight: 16,
  },
  guideStepLabel: {
    ...typography.semibold,
    fontSize: 12,
    color: palette.primary,
    textTransform: "uppercase",
  },
  guidePageTitle: {
    ...typography.bold,
    fontSize: 18,
    color: palette.ink,
  },
  guidePageBody: {
    ...typography.regular,
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  guideFooter: {
    alignItems: "center",
  },
  guideFooterText: {
    ...typography.semibold,
    fontSize: 12,
    color: palette.muted,
  },
});


