import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../data";
import { typography } from "../styles/typography";
import AnalysisResult from "../components/supplements/AnalysisResult";
import DrugDeepDiveResult from "../components/supplements/DrugDeepDiveResult";
import ImageUpload from "../components/supplements/ImageUpload";
import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import { buildSupplementProfileContext, loadProfile } from "../storage/profileStorage";
import { addSupplementHistoryEntry, clearSupplementHistory, loadSupplementHistory, removeSupplementHistoryEntry } from "../storage/supplementSearchStorage";
import type { PickedSupplementAsset, RequestApi, SupplementAnalysisResult, SupplementDrugDeepDiveResult, SupplementHistoryEntry as SearchHistoryEntry } from "../types/supplements";
import { compactIsoId, formatDisplayDateTime, formatDisplayTime } from "../utils/dateTime";

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

function safeDateGroup(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "Unknown date";
  }
  try {
    return formatDisplayDateTime(trimmed).split(",")[0] || trimmed;
  } catch {
    return trimmed;
  }
}

function phaseDurationLabel(startSeconds?: number | null, endSeconds?: number | null, prefix = "Duration") {
  if (typeof startSeconds !== "number" || typeof endSeconds !== "number") {
    return "";
  }
  const durationMs = Math.max(0, (endSeconds - startSeconds) * 1000);
  return `${prefix}: ${(durationMs / 1000).toFixed(2)}s`;
}

function aspectRatioTuple(value: string) {
  if (value === "1:1") {
    return [1, 1] as [number, number];
  }
  if (value === "3:4") {
    return [3, 4] as [number, number];
  }
  if (value === "16:9") {
    return [16, 9] as [number, number];
  }
  return [4, 3] as [number, number];
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
  const [selectedAssetSource, setSelectedAssetSource] = useState<"library" | "camera">("library");
  const [aspectRatio, setAspectRatio] = useState("4:3");
  const [cropVisible, setCropVisible] = useState(false);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [analysisMode, setAnalysisMode] = useState<"supplement" | "medicine">("supplement");
  const [searchQuery, setSearchQuery] = useState("");
  const [drugQuery, setDrugQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [drugSuggestions, setDrugSuggestions] = useState<string[]>([]);
  const [searchMenuVisible, setSearchMenuVisible] = useState(false);
  const [drugMenuVisible, setDrugMenuVisible] = useState(false);
  const [activeSubPage, setActiveSubPage] = useState<"analyzer" | "history" | "logs">("analyzer");
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [pinnedHistoryIds, setPinnedHistoryIds] = useState<string[]>([]);
  const [result, setResult] = useState<SupplementAnalysisResult | null>(null);
  const [drugResult, setDrugResult] = useState<SupplementDrugDeepDiveResult | null>(null);
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
  const trimmedDrugQuery = drugQuery.trim();
  const hasImageInput = Boolean(selectedAsset) || webcamActive;
  const hasSearchInput = Boolean(trimmedSearchQuery);
  const selectedMode = hasSearchInput ? "search" : hasImageInput ? "image" : "none";
  const imageOptionsDisabled = selectedMode === "search";
  const searchOptionsDisabled = selectedMode === "image";
  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    const base = query
      ? searchHistory.filter((entry) => {
          const summary = (entry.result as { summary?: string } | null)?.summary || (entry.drugResult as { summary?: string } | null)?.summary || "";
          return `${entry.title || ""} ${entry.query || ""} ${summary} ${entry.analysisType || ""}`.toLowerCase().includes(query);
        })
      : searchHistory;
    return [...base].sort((a, b) => {
      const aPinned = pinnedHistoryIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedHistoryIds.includes(b.id) ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }
      return `${b.searchedAt || ""}`.localeCompare(`${a.searchedAt || ""}`);
    });
  }, [historySearch, pinnedHistoryIds, searchHistory]);
  const groupedHistoryLogs = useMemo(() => {
    const grouped = new Map<string, SearchHistoryEntry[]>();
    filteredHistory.forEach((entry) => {
      const key = safeDateGroup(entry.searchedAt);
      grouped.set(key, [...(grouped.get(key) || []), entry]);
    });
    return Array.from(grouped.entries());
  }, [filteredHistory]);

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
        const profileConditions = buildSupplementProfileContext(profile);
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
    if (!canCallApi || trimmedSearchQuery.length < 2) {
      setSearchSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await requestApi(
          `/api/search-suggestions?q=${encodeURIComponent(trimmedSearchQuery)}&hint=${encodeURIComponent("supplement ingredient vitamins minerals product")}&limit=8`
        );
        if (!response.ok) {
          setSearchSuggestions([]);
          return;
        }
        const payload = (await response.json()) as { items?: string[] };
        setSearchSuggestions(Array.isArray(payload.items) ? payload.items.slice(0, 8) : []);
      } catch {
        setSearchSuggestions([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [canCallApi, requestApi, trimmedSearchQuery]);

  useEffect(() => {
    if (!canCallApi || trimmedDrugQuery.length < 2) {
      setDrugSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await requestApi(
          `/api/search-suggestions?q=${encodeURIComponent(trimmedDrugQuery)}&hint=${encodeURIComponent("medicine drug ingredient compound pharmacology")}&limit=8`
        );
        if (!response.ok) {
          setDrugSuggestions([]);
          return;
        }
        const payload = (await response.json()) as { items?: string[] };
        setDrugSuggestions(Array.isArray(payload.items) ? payload.items.slice(0, 8) : []);
      } catch {
        setDrugSuggestions([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [canCallApi, requestApi, trimmedDrugQuery]);

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
      mediaTypes: "images",
      quality: 0.95,
      allowsEditing: Platform.OS !== "web",
      aspect: aspectRatioTuple(aspectRatio),
    });
    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    const asset = pickerResult.assets[0];
    setSelectedHistoryEntryId("");
    setSelectedAssetSource("library");
    setSelectedAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setCropVisible(true);
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
      mediaTypes: "images",
      quality: 0.95,
      allowsEditing: true,
      aspect: aspectRatioTuple(aspectRatio),
    });
    if (cameraResult.canceled || !cameraResult.assets?.length) {
      return;
    }

    const asset = cameraResult.assets[0];
    setSelectedHistoryEntryId("");
    setSelectedAssetSource("camera");
    setSelectedAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setCropVisible(true);
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
    setSelectedAssetSource("camera");
    setSelectedHistoryEntryId("");
    setCropVisible(true);
    setResult(null);
    closeWebcam();
  }

  async function reopenCrop() {
    setCropVisible(false);
    if (selectedAssetSource === "camera") {
      await captureImage();
      return;
    }
    await pickImage();
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
    setDrugResult(null);

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
          analysisType: "supplement",
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
    setSearchMenuVisible(false);
    setSelectedAsset(null);
    setSelectedHistoryEntryId("");
    setDrugResult(null);
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
          analysisType: "supplement",
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

  async function searchDrugDeepDive() {
    const normalizedQuery = trimmedDrugQuery;
    if (!normalizedQuery) {
      setError("Please enter a medicine, drug, or single ingredient to analyze.");
      return;
    }
    if (!canCallApi) {
      setError("Supplements API is not configured in this screen.");
      return;
    }

    setLoading(true);
    beginApiCallTimer();
    setError("");
    setDrugMenuVisible(false);
    setSelectedAsset(null);
    setSelectedHistoryEntryId("");
    setResult(null);
    closeWebcam();

    try {
      const clientActionId = buildClientActionId("drug-deep-dive");
      const response = await requestApi("/api/supplements/drug-deep-dive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Action-Id": clientActionId,
        },
        body: JSON.stringify({
          drugName: normalizedQuery,
          profileContext: conditions || DEFAULT_CONDITIONS,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Drug deep-dive failed."));
      }
      const payload = (await response.json()) as SupplementDrugDeepDiveResult;
      setDrugResult(payload);
      setTextGenerationStatus("completed");
      setImageGenerationStatus("not_available");
      const nowIso = new Date().toISOString();
      const updatedHistory = (await addSupplementHistoryEntry(
        {
          id: compactIsoId(nowIso),
          query: normalizedQuery,
          title: normalizedQuery,
          analysisType: "medicine",
          mode: "text",
          searchedAt: nowIso,
          inputImage: "",
          infographic: "",
          result: null,
          drugResult: payload,
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
      setImageGenerationStatus("not_available");
      setError(fetchError instanceof Error ? fetchError.message : "Unable to analyze this medicine right now.");
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
    if (analysisMode === "medicine") {
      setDrugQuery("");
      setDrugSuggestions([]);
      setDrugMenuVisible(false);
    } else {
      setSearchQuery("");
      setSearchSuggestions([]);
      setSearchMenuVisible(false);
    }
    setSelectedHistoryEntryId("");
  }

  function toggleHistoryPin(entryId: string) {
    setPinnedHistoryIds((current) => (current.includes(entryId) ? current.filter((id) => id !== entryId) : [entryId, ...current]));
  }

  async function runSupplementAnalysisFromCurrentInput() {
    if (trimmedSearchQuery) {
      await searchSupplementByName();
      return;
    }
    if (selectedAsset) {
      await analyzeSupplement();
      return;
    }
    setError("Add a supplement name or scan a label before analysis.");
  }

  function openHistoryEntry(entry: SearchHistoryEntry, options?: { openInAnalyzer?: boolean }) {
    if (!entry?.result && !entry?.drugResult) {
      return;
    }
    if (!options?.openInAnalyzer) {
      setHistoryModalEntry(entry);
      return;
    }
    closeWebcam();
    setAnalysisMode(entry.analysisType === "medicine" ? "medicine" : "supplement");
    setSelectedAsset(entry.inputImage ? { uri: entry.inputImage } : null);
    setError("");
    setSearchQuery("");
    setDrugQuery("");
    setResult(entry.result);
    setDrugResult(entry.drugResult || null);
    setSelectedHistoryEntryId(entry.id || "history");
    setHistoryModalEntry(null);
    if (entry.result) {
      applyGenerationStatusFromPayload(entry.result);
    } else {
      setTextGenerationStatus("completed");
      setImageGenerationStatus("not_available");
    }
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
    setDrugResult(null);
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 28 }}>
      <SectionTabs
        value={activeSubPage}
        onValueChange={(value) => setActiveSubPage(value as "analyzer" | "history" | "logs")}
        tabs={[
          { value: "analyzer", label: "Analyse", icon: "leaf-circle-outline" },
          { value: "history", label: "History", icon: "history" },
          { value: "logs", label: "Logs", icon: "text-box-outline" },
        ]}
      />

      <View style={activeSubPage === "analyzer" ? undefined : styles.hiddenSection}>
        <>
          <SectionTabs
            value={analysisMode}
            onValueChange={(value) => {
              const nextMode = value as "supplement" | "medicine";
              setAnalysisMode(nextMode);
              setError("");
              setSelectedHistoryEntryId("");
              if (nextMode === "medicine") {
                setSelectedAsset(null);
                setResult(null);
                closeWebcam();
              } else {
                setDrugResult(null);
              }
            }}
            tabs={[
              { value: "medicine", label: "Medicine/Drug", icon: "medical-bag" },
              { value: "supplement", label: "Supplement", icon: "pill-multiple" },
            ]}
          />
          {selectedHistoryEntryId ? (
            <View className="gap-2 rounded-[18px] border border-line bg-soft px-4 py-4">
              <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-ink">Viewing a saved nutraceutical analysis inside the live analyser layout.</Text>
              <Pressable className="self-start rounded-full border border-line bg-card px-3 py-2" onPress={exitHistoryPreviewMode}>
                <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Start a new analysis</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {analysisMode === "supplement" ? (
                <>
                  <View className="gap-3 rounded-[22px] border border-line bg-card p-5 shadow-panel">
                    <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Nutraceutical analysis</Text>
                    <Text style={typography.regular} className="font-['Poppins_400Regular'] leading-5 text-muted">Search by name or scan a label. Your saved profile is loaded automatically in the background for relevance, safety, and stack checks.</Text>
                    <View className="gap-2 rounded-[18px] border border-line bg-soft p-4">
                      <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-[13px] text-ink">Search by name</Text>
                      <View className="relative">
                        <TextInput
                          style={typography.regular}
                          className={`min-h-[50px] rounded-2xl border px-4 py-3 font-['Poppins_400Regular'] text-ink ${searchOptionsDisabled ? "border-line bg-soft/60" : "border-line bg-card"}`}
                          value={searchQuery}
                          onChangeText={(value) => {
                            setSearchQuery(value);
                            setSearchMenuVisible(Boolean(value.trim()));
                          }}
                          onFocus={() => setSearchMenuVisible(searchSuggestions.length > 0)}
                          placeholder="e.g. magnesium glycinate"
                          placeholderTextColor="#8B8F99"
                          editable={!loading && !searchOptionsDisabled}
                          returnKeyType="search"
                          onSubmitEditing={() => void searchSupplementByName()}
                        />
                        {searchMenuVisible && searchSuggestions.length > 0 ? (
                          <View className="absolute left-0 right-0 top-[56px] z-20 rounded-[18px] border border-line bg-card shadow-panel">
                            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="always">
                              {searchSuggestions.map((item) => (
                                <Pressable
                                  key={`supp-${item}`}
                                  className="border-b border-line px-4 py-3"
                                  onPress={() => {
                                    setSearchQuery(item);
                                    setSearchMenuVisible(false);
                                  }}
                                >
                                  <Text style={typography.regular} className="font-['Poppins_400Regular'] text-ink">{item}</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <View className="flex-row items-center gap-3">
                      <View className="h-px flex-1 bg-line" />
                      <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-xs text-muted">OR</Text>
                      <View className="h-px flex-1 bg-line" />
                    </View>

                    <View className="gap-2 rounded-[18px] border border-line bg-soft p-4">
                      <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-[13px] text-ink">Scan</Text>
                      <View className="flex-row flex-wrap gap-2">
                        <Pressable className={`flex-row items-center gap-2 rounded-2xl border border-line px-4 py-3 ${imageOptionsDisabled ? "bg-soft/60 opacity-50" : "bg-card"}`} onPress={captureImage} disabled={loading || imageOptionsDisabled}>
                          <MaterialCommunityIcons name="camera-outline" size={18} color={palette.primary} />
                          <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">{Platform.OS === "web" ? "Use webcam" : "Use camera"}</Text>
                        </Pressable>
                        <Pressable className={`flex-row items-center gap-2 rounded-2xl border border-line px-4 py-3 ${imageOptionsDisabled ? "bg-soft/60 opacity-50" : "bg-card"}`} onPress={pickImage} disabled={loading || imageOptionsDisabled}>
                          <MaterialCommunityIcons name="image-outline" size={18} color={palette.primary} />
                          <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">{selectedAsset?.uri ? "Replace image" : "Upload image"}</Text>
                        </Pressable>
                      </View>
                    </View>

                    <Pressable
                      className={`items-center rounded-2xl px-4 py-3 ${loading || (!trimmedSearchQuery && !selectedAsset?.uri) ? "bg-sage/50" : "bg-sage"}`}
                      onPress={() => void runSupplementAnalysisFromCurrentInput()}
                      disabled={loading || (!trimmedSearchQuery && !selectedAsset?.uri)}
                    >
                      <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-card">
                        {loading ? "Analysing..." : "Analyse nutraceutical"}
                      </Text>
                    </Pressable>
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
                    aspectRatio={aspectRatio}
                    conditions={conditions}
                    onChangeConditions={setConditions}
                    goals={goals}
                    onChangeGoals={setGoals}
                    loading={loading}
                    error={error}
                    showCameraButton={Platform.OS !== "web"}
                    showActionButtons={false}
                    showAnalyzeButton={false}
                    disableImageOptions={imageOptionsDisabled}
                    onClearImageSelection={clearImageSelection}
                    clearImageSelectionLabel="Clear image"
                    analyzeLabel="Analyse nutraceutical"
                    onAspectRatioChange={setAspectRatio}
                    onOpenCrop={() => setCropVisible(true)}
                    onCaptureImage={captureImage}
                    onPickImage={pickImage}
                    onAnalyze={analyzeSupplement}
                  />

                  <View className="flex-row items-center justify-between gap-3 rounded-[22px] border border-line bg-card px-5 py-4 shadow-panel">
                    <View className="flex-1">
                      <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Generate infographic</Text>
                      <Text style={typography.regular} className="font-['Poppins_400Regular'] leading-5 text-muted">Turn this off if you want a faster nutraceutical analysis without the infographic pass.</Text>
                    </View>
                    <Switch value={infographicEnabled} onValueChange={setInfographicEnabled} disabled={loading} />
                  </View>
                </>
              ) : (
                <View className="gap-4 rounded-[22px] border border-line bg-card p-5 shadow-panel">
                  <View className="gap-2">
                    <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Medicine / drug deep-dive</Text>
                    <Text style={typography.regular} className="font-['Poppins_400Regular'] leading-5 text-muted">Review one medicine, drug, or single ingredient with a more clinical breakdown focused on safety, usefulness, dosage, and your profile fit.</Text>
                  </View>
                  <View className="gap-2 rounded-[18px] border border-line bg-soft p-4">
                    <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-[13px] text-ink">Search by name</Text>
                    <View className="relative">
                      <TextInput
                        style={typography.regular}
                        className="min-h-[50px] rounded-2xl border border-line bg-card px-4 py-3 font-['Poppins_400Regular'] text-ink"
                        value={drugQuery}
                        onChangeText={(value) => {
                          setDrugQuery(value);
                          setDrugMenuVisible(Boolean(value.trim()));
                        }}
                        onFocus={() => setDrugMenuVisible(drugSuggestions.length > 0)}
                        placeholder="e.g. metformin or magnesium"
                        placeholderTextColor="#8B8F99"
                        editable={!loading}
                        returnKeyType="search"
                        onSubmitEditing={() => void searchDrugDeepDive()}
                      />
                      {drugMenuVisible && drugSuggestions.length > 0 ? (
                        <View className="absolute left-0 right-0 top-[56px] z-20 rounded-[18px] border border-line bg-card shadow-panel">
                          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="always">
                            {drugSuggestions.map((item) => (
                              <Pressable
                                key={`drug-${item}`}
                                className="border-b border-line px-4 py-3"
                                onPress={() => {
                                  setDrugQuery(item);
                                  setDrugMenuVisible(false);
                                }}
                              >
                                <Text style={typography.regular} className="font-['Poppins_400Regular'] text-ink">{item}</Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Pressable className={`rounded-2xl px-4 py-3 ${loading || !trimmedDrugQuery ? "bg-sage/50" : "bg-sage"}`} onPress={() => void searchDrugDeepDive()} disabled={loading || !trimmedDrugQuery}>
                      <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-card">{loading ? "Analysing..." : "Analyse medicine/drug"}</Text>
                    </Pressable>
                    {trimmedDrugQuery ? (
                      <Pressable className="rounded-2xl border border-line bg-soft px-4 py-3" onPress={clearSearchInput} disabled={loading}>
                        <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )}

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
                    {(analysisMode === "medicine"
                      ? [
                          { label: "Understanding Agent", body: "Turns the medicine name and your profile into a clean, structured clinical context.", active: progressValue >= 0.18, complete: progressValue >= 0.48 },
                          { label: "Analysis Agent", body: "Evaluates benefits, risks, dosage, contraindications, and interactions in one medical reasoning pass.", active: progressValue >= 0.48, complete: progressValue >= 0.72 },
                          { label: "Presentation Agent", body: "Formats the findings into practical sections with the most relevant warnings first.", active: progressValue >= 0.72, complete: progressValue >= 1 },
                        ]
                      : [
                          { label: "Understanding Agent", body: "Resolves the supplement, your intent, and the profile context that matters for analysis.", active: progressValue >= 0.18, complete: progressValue >= 0.48 },
                          { label: "Analysis Agent", body: "Checks evidence, safety, dosage, interactions, and realistic benefit versus hype.", active: progressValue >= 0.48, complete: progressValue >= 0.72 },
                          { label: "Presentation Agent", body: "Turns the structured findings into a calmer supplement report with clear takeaways.", active: progressValue >= 0.72, complete: progressValue >= 1 },
                        ]).map((step) => (
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

          {analysisMode === "medicine" ? (
            <DrugDeepDiveResult result={drugResult} />
          ) : (
            <AnalysisResult result={result} selectedImageUri={selectedAsset?.uri || ""} selectedImageAspectRatio={selectedImageAspectRatio} />
          )}
        </>
      </View>
      <View style={activeSubPage === "history" ? undefined : styles.hiddenSection}>
        <View className="gap-4 rounded-[22px] border border-line bg-card p-5 shadow-panel">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-[12px] bg-moss">
                <MaterialCommunityIcons name="history" size={18} color={palette.primary} />
              </View>
              <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Recent nutraceutical analyses</Text>
            </View>
            <Pressable className="rounded-full border border-line bg-soft px-3 py-2" onPress={() => void clearAllHistoryItems()}>
              <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Clear all</Text>
            </Pressable>
          </View>
          <TextInput
            style={typography.regular}
            className="min-h-[50px] rounded-2xl border border-line bg-soft px-4 py-3 font-['Poppins_400Regular'] text-ink"
            value={historySearch}
            onChangeText={setHistorySearch}
            placeholder="Search medicine and supplement history"
            placeholderTextColor="#8B8F99"
          />
          <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] leading-5 text-muted">Saved analyses open in a sheet first, then you can pull them back into the analyser if you want to rework them.</Text>
          {filteredHistory.length === 0 ? <Text style={typography.regular} className="font-['Poppins_400Regular'] text-muted">No searches yet.</Text> : null}
          {filteredHistory.map((entry) => {
            const pinned = pinnedHistoryIds.includes(entry.id);
            const isMedicine = entry.analysisType === "medicine";
            const entrySummary = (entry.result as { summary?: string } | null)?.summary || (entry.drugResult as { summary?: string } | null)?.summary || "";
            return (
              <Pressable key={entry.id} className={`gap-3 rounded-[18px] border px-4 py-4 ${pinned ? "border-[#E2C46C] bg-[#FFFBEF]" : "border-line bg-soft"}`} onPress={() => openHistoryEntry(entry)}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-ink">{entry.title || entry.query || "Unknown analysis"}</Text>
                    <Text style={typography.regular} className="font-['Poppins_400Regular'] text-muted">
                      {isMedicine ? "Medicine/Drug" : "Supplement"} • {entry.mode === "image" ? "Scan" : "Search"} • {formatDisplayDateTime(entry.searchedAt)}
                    </Text>
                    {entrySummary ? <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] leading-5 text-muted">{entrySummary}</Text> : null}
                  </View>
                  <View className="items-end gap-2">
                    <View className={`rounded-full px-3 py-1.5 ${isMedicine ? "bg-[#FDEFD5]" : "bg-moss"}`}>
                      <Text style={typography.semibold} className={`font-['Poppins_600SemiBold'] text-xs ${isMedicine ? "text-[#B8741A]" : "text-sage"}`}>
                        {isMedicine ? "Medicine/Drug" : "Supplement"}
                      </Text>
                    </View>
                    {pinned ? (
                      <View className="rounded-full bg-[#FFF7DB] px-3 py-1.5">
                        <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-xs text-[#B87A18]">Pinned</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View className="flex-row flex-wrap items-center justify-end gap-2">
                  <Pressable
                    className="rounded-full border border-line bg-card px-3 py-2"
                    onPress={(event) => {
                      event.stopPropagation();
                      toggleHistoryPin(entry.id);
                    }}
                  >
                    <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-[#B87A18]">{pinned ? "Unpin" : "Pin"}</Text>
                  </Pressable>
                  <Pressable
                    className="rounded-full border border-line bg-card px-3 py-2"
                    onPress={(event) => {
                      event.stopPropagation();
                      openHistoryEntry(entry, { openInAnalyzer: true });
                    }}
                  >
                    <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-sage">Open in analyser</Text>
                  </Pressable>
                  <Pressable
                    className="rounded-full border border-line bg-card px-3 py-2"
                    onPress={(event) => {
                      event.stopPropagation();
                      void clearOneHistoryItem(entry.id);
                    }}
                  >
                    <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-danger">Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={activeSubPage === "logs" ? undefined : styles.hiddenSection}>
        <View className="gap-4 rounded-[22px] border border-line bg-card p-5 shadow-panel">
          <View className="flex-row items-center gap-2">
            <View className="h-9 w-9 items-center justify-center rounded-[12px] bg-soft">
              <MaterialCommunityIcons name="text-box-outline" size={18} color={palette.primary} />
            </View>
            <Text style={typography.bold} className="font-['Poppins_700Bold'] text-base text-ink">Nutraceutical logs</Text>
          </View>
          <Text style={typography.regular} className="font-['Poppins_400Regular'] text-[13px] leading-5 text-muted">This is the running log of medicine and supplement analyses that have been saved so you can revisit what was checked and when.</Text>
          {groupedHistoryLogs.length === 0 ? <Text style={typography.regular} className="font-['Poppins_400Regular'] text-muted">No logs yet.</Text> : null}
          {groupedHistoryLogs.map(([group, entries]) => (
            <View key={group} className="gap-3 rounded-[18px] border border-line bg-soft p-4">
              <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-ink">{group}</Text>
              {entries.map((entry) => {
                const isMedicine = entry.analysisType === "medicine";
                return (
                  <Pressable key={entry.id} className="rounded-[16px] border border-line bg-card px-4 py-4" onPress={() => openHistoryEntry(entry)}>
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <Text style={typography.semibold} className="font-['Poppins_600SemiBold'] text-ink">{entry.title || entry.query || "Saved analysis"}</Text>
                        <Text style={typography.regular} className="font-['Poppins_400Regular'] text-muted">
                          {isMedicine ? "Medicine/Drug" : "Supplement"} • {entry.mode === "image" ? "Scan" : "Search"} • {formatDisplayTime(entry.searchedAt)}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name={isMedicine ? "medical-bag" : "pill"} size={18} color={isMedicine ? "#B8741A" : palette.primary} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <Modal visible={Boolean(historyModalEntry)} transparent animationType="slide" onRequestClose={closeHistoryModal}>
        <View style={styles.guideBackdrop}>
          <View style={[styles.guideCard, styles.historyModalCard]}>
            <View style={styles.sheetHandle} />
            <View style={styles.historyModalHeader}>
              <View style={styles.historyModalCopy}>
                <Text style={styles.guideTitle}>{historyModalEntry?.analysisType === "medicine" ? "Saved medicine analysis" : "Saved nutraceutical analysis"}</Text>
                <Text style={styles.historyModalMeta}>
                  {(historyModalEntry?.analysisType === "medicine" ? "Medicine deep-dive" : historyModalEntry?.mode === "image" ? "Image scan" : "Text search")} • {historyModalEntry ? formatDisplayDateTime(historyModalEntry.searchedAt) : ""}
                </Text>
              </View>
              <Pressable style={styles.guideCloseButton} onPress={closeHistoryModal}>
                <Text style={styles.guideCloseButtonText}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.historyModalScroller}>
              {historyModalEntry?.analysisType === "medicine" ? (
                <DrugDeepDiveResult result={historyModalEntry?.drugResult || null} />
              ) : (
                <AnalysisResult
                  result={historyModalEntry?.result || null}
                  selectedImageUri={historyModalEntry?.inputImage || ""}
                  selectedImageAspectRatio={selectedImageAspectRatio}
                />
              )}
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

      <Modal visible={cropVisible} transparent animationType="slide" onRequestClose={() => setCropVisible(false)}>
        <View style={styles.guideBackdrop}>
          <View style={[styles.guideCard, styles.cropModalCard]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.guideTitle}>Crop & framing</Text>
            <Text style={styles.cropModalText}>Choose the framing ratio you want, then re-open the crop flow if you want a tighter image before analysis.</Text>
            {selectedAsset?.uri ? (
              <View style={styles.cropPreviewWrap}>
                <View style={[styles.cropPreviewFrame, { aspectRatio: selectedImageAspectRatio || 1 }]}>
                  <Text style={styles.cropPreviewText}>Preview frame</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.cropChipRow}>
              {["1:1", "4:3", "3:4", "16:9"].map((ratio) => (
                <Pressable key={ratio} style={[styles.cropChip, aspectRatio === ratio && styles.cropChipActive]} onPress={() => setAspectRatio(ratio)}>
                  <Text style={[styles.cropChipText, aspectRatio === ratio && styles.cropChipTextActive]}>{ratio}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.historyModalActions}>
              <Pressable style={styles.historyModalPrimaryButton} onPress={() => void reopenCrop()}>
                <Text style={styles.historyModalPrimaryText}>Re-open crop</Text>
              </Pressable>
              <Pressable style={styles.historyModalSecondaryButton} onPress={() => setCropVisible(false)}>
                <Text style={styles.historyModalSecondaryText}>Use image</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <TutorialSheet visible={guideVisible} title="Nutraceutical tutorial" pages={SCANNER_GUIDE_PAGES} onClose={closeGuide} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hiddenSection: {
    display: "none",
  },
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
  cropModalCard: {
    maxWidth: 520,
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
  cropModalText: {
    ...typography.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  cropPreviewWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cropPreviewFrame: {
    width: "100%",
    maxWidth: 260,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  cropPreviewText: {
    ...typography.semibold,
    fontSize: 12,
    color: palette.primary,
    paddingVertical: 28,
  },
  cropChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cropChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cropChipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  cropChipText: {
    ...typography.semibold,
    fontSize: 12,
    color: palette.ink,
  },
  cropChipTextActive: {
    color: palette.primary,
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

