import React, { useEffect, useMemo, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Animated,
  Linking,
  Modal,
  NativeModules,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Chip,
  IconButton,
  MD3LightTheme,
  PaperProvider,
  ProgressBar,
  Searchbar,
  SegmentedButtons,
  Snackbar,
  Surface,
  Text,
  TextInput,
  TouchableRipple,
} from "react-native-paper";
import "./global.css";

import {
  defaultBootstrap,
  defaultHistory,
  type AppTab,
  type BootstrapPayload,
  type FeaturedClaim,
  type InvestigationCollection,
  type InvestigationDetail,
  type InvestigationStatus,
  type InvestigationSummary,
  palette,
  type PipelineStepSummary,
  type SourceAssessment,
} from "./src/data";
import SupplementsPage from "./src/pages/SupplementsPage";

const paperTheme = {
  ...MD3LightTheme,
  roundness: 7,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: "#FFFFFF",
    primaryContainer: palette.primarySoft,
    onPrimaryContainer: palette.primary,
    secondary: palette.secondary,
    background: palette.background,
    surface: palette.surface,
    surfaceVariant: palette.surfaceSoft,
    outline: palette.border,
    outlineVariant: "#E7DFD3",
    error: palette.danger,
    onSurface: palette.text,
    onSurfaceVariant: palette.muted,
  },
  fonts: {
    ...MD3LightTheme.fonts,
    headlineSmall: { ...MD3LightTheme.fonts.headlineSmall, fontFamily: "Poppins_700Bold", letterSpacing: 0 },
    headlineMedium: { ...MD3LightTheme.fonts.headlineMedium, fontFamily: "Poppins_700Bold", letterSpacing: 0 },
    titleLarge: { ...MD3LightTheme.fonts.titleLarge, fontFamily: "Poppins_600SemiBold", letterSpacing: 0 },
    titleMedium: { ...MD3LightTheme.fonts.titleMedium, fontFamily: "Poppins_600SemiBold", letterSpacing: 0 },
    titleSmall: { ...MD3LightTheme.fonts.titleSmall, fontFamily: "Poppins_600SemiBold", letterSpacing: 0 },
    bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, fontFamily: "Poppins_400Regular" },
    bodyMedium: { ...MD3LightTheme.fonts.bodyMedium, fontFamily: "Poppins_400Regular" },
    bodySmall: { ...MD3LightTheme.fonts.bodySmall, fontFamily: "Poppins_400Regular" },
    labelLarge: { ...MD3LightTheme.fonts.labelLarge, fontFamily: "Poppins_600SemiBold" },
    labelMedium: { ...MD3LightTheme.fonts.labelMedium, fontFamily: "Poppins_500Medium" },
  },
};

const dashboardMetrics = [
  { label: "Heart rate", value: "68 bpm", detail: "Resting average", icon: "heart-pulse" },
  { label: "Sleep", value: "7h 42m", detail: "Last night", icon: "sleep" },
  { label: "Activity", value: "8,420", detail: "Steps today", icon: "walk" },
  { label: "Hydration", value: "2.1 L", detail: "Water intake", icon: "cup-water" },
];

const mealLogs = [
  { title: "Breakfast", time: "08:10", detail: "Greek yogurt, berries, chia, coffee", icon: "food-croissant" },
  { title: "Lunch", time: "13:05", detail: "Salmon bowl, greens, avocado, rice", icon: "food" },
  { title: "Snack", time: "16:20", detail: "Apple slices and mixed nuts", icon: "food-apple" },
];

const medicationLogs = [
  { title: "Vitamin D3", time: "08:15", detail: "1 capsule with breakfast", icon: "pill" },
  { title: "Omega-3", time: "13:10", detail: "2 softgels with lunch", icon: "pill-multiple" },
  { title: "Cetirizine", time: "21:00", detail: "10 mg in the evening", icon: "pill" },
];

const nutritionHighlights = [
  { title: "Protein target", body: "92 g planned today across meals and snacks.", icon: "chart-donut" },
  { title: "Fiber target", body: "26 g planned with oats, berries, greens, and legumes.", icon: "leaf" },
  { title: "Hydration rhythm", body: "Front-loaded before noon to avoid late-night wakeups.", icon: "cup-water" },
];

const consultantPromptTemplates = [
  {
    id: "t1",
    title: "Viral cure claim",
    claim: "A creator claims magnesium glycinate cures insomnia within a week for most adults.",
    context: "Check whether the evidence supports cure-level wording, whether benefits are only modest, and whether guideline evidence contradicts the claim.",
  },
  {
    id: "t2",
    title: "Mechanism versus outcome",
    claim: "A wellness creator says gut health supplements can fix eczema flare-ups in adults.",
    context: "Separate gut-skin mechanism plausibility from real clinical outcome evidence, and look for contradiction evidence from dermatology guidance.",
  },
  {
    id: "t3",
    title: "Fast-result promise",
    claim: "A short-form video says apple cider vinegar burns fat fast without changes to diet or exercise.",
    context: "Look for randomized trials, review-level evidence, null findings, and whether the wording overstates modest metabolic effects.",
  },
  {
    id: "t4",
    title: "General health claim",
    claim: "An article claims drinking plain water is healthy and leads to better overall health outcomes than sugary beverages.",
    context: "Judge whether the evidence genuinely supports the direction of the claim and whether the wording is reasonable rather than exaggerated.",
  },
];

const consultantChecks = [
  "Understand the actual claim wording before searching.",
  "Look for direct support, contradiction, and evidence gaps.",
  "Drop dead links, off-topic pages, and weak quote matches.",
  "Compare support and pushback before writing the final summary.",
];

const profileSections = [
  {
    title: "Health profile",
    body: "Aly Tan, 29. 168 cm, 61 kg. Light-to-moderate exercise 4 times weekly, with a focus on sleep quality, stable energy, and skin health.",
  },
  {
    title: "Conditions and flags",
    body: "Mild seasonal allergies, intermittent eczema flares, family history of hypertension. No diabetes and no known cardiovascular disease.",
  },
  {
    title: "Medications and supplements",
    body: "Cetirizine as needed, Vitamin D3 daily, Omega-3 daily, magnesium glycinate occasionally before bed.",
  },
  {
    title: "Nutrition and hydration",
    body: "Protein-forward breakfast, balanced lunch, afternoon fruit or nuts, and a hydration target of 2.2 liters on most days.",
  },
  {
    title: "Sleep and recovery",
    body: "Bedtime target 11 PM, wind-down routine from 10:15 PM, and one lighter recovery day after high-activity sessions.",
  },
  {
    title: "Movement routine",
    body: "Walking most days with Pilates twice weekly and light strength work twice weekly.",
  },
  {
    title: "Care preferences",
    body: "Prefers evidence-based guidance, lower-caffeine options after lunch, and plans that fit a busy weekday schedule.",
  },
  {
    title: "Alerts and support",
    body: "No known drug allergies. Seasonal allergy tracking is turned on, and eczema flare notes are logged during high-stress weeks.",
  },
];

type HistorySort = "manual" | "recent" | "score";
type HistoryFilter = "all" | "trustworthy" | "uncertain" | "untrustworthy" | "pinned";
type ConsultantView = "investigate" | "history";
type ProfileView = "overview" | "settings";
type MaterialIconName = string;
type ReviewDepth = "quick" | "standard" | "deep";

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeTrim(value: unknown) {
  return safeText(value).trim();
}

function safeUpper(value: unknown) {
  return typeof value === "string" ? value.toUpperCase() : "";
}

function safeLower(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function padTimestamp(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${padTimestamp(date.getDate())}/${padTimestamp(date.getMonth() + 1)}/${date.getFullYear()}, ${padTimestamp(date.getHours())}:${padTimestamp(date.getMinutes())}`;
}

function depthLabel(depth: ReviewDepth) {
  if (depth === "quick") {
    return "Quick review";
  }
  if (depth === "deep") {
    return "Deep review";
  }
  return "Standard review";
}

function depthDescription(depth: ReviewDepth) {
  if (depth === "quick") {
    return "Fast pass, usually around 20 to 30 relevant sources after retrieval and filtering.";
  }
  if (depth === "deep") {
    return "Highest coverage, usually 100+ sources before later filtering and evidence cleanup.";
  }
  return "Balanced coverage, usually around 50 to 70 sources before later filtering.";
}

function scoreBandLabel(score: number | null | undefined) {
  if (typeof score !== "number") {
    return "Pending";
  }
  if (score >= 70) {
    return "Agree";
  }
  if (score < 30) {
    return "Disagree";
  }
  return "Uncertain";
}

function composeInvestigationContext(parts: {
  notes: string;
  sourceContext: string;
  population: string;
  focus: string;
}) {
  return [
    safeTrim(parts.notes),
    safeTrim(parts.sourceContext) ? `Where the claim appeared: ${safeTrim(parts.sourceContext)}` : "",
    safeTrim(parts.population) ? `Population or scenario: ${safeTrim(parts.population)}` : "",
    safeTrim(parts.focus) ? `Priority question: ${safeTrim(parts.focus)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function metroHost(): string | null {
  const scriptURL = (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
  if (!scriptURL) {
    return null;
  }

  try {
    const normalized = scriptURL.replace(/^exp:\/\//, "http://").replace(/^exps:\/\//, "https://");
    return new URL(normalized).hostname || null;
  } catch {
    return null;
  }
}

function normalizeApiBaseUrl(rawValue?: string | null) {
  const trimmed = safeTrim(rawValue);
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "").replace("://20.0.2.2", "://10.0.2.2");
}

function parseCandidateEnv(value?: string) {
  if (!safeTrim(value)) {
    return [];
  }
  return safeText(value)
    .split(/[,\n]/)
    .map((item) => normalizeApiBaseUrl(item))
    .filter(Boolean);
}

function buildApiBaseUrls(currentUrl?: string | null) {
  const candidates: string[] = [];
  const addCandidate = (value?: string | null) => {
    if (!value) {
      return;
    }
    const normalized = normalizeApiBaseUrl(value);
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  addCandidate(currentUrl);
  const host = metroHost();
  if (host) {
    addCandidate(`${host}:8000`);
  }

  addCandidate(process.env.EXPO_PUBLIC_API_BASE_URL);
  for (const candidate of parseCandidateEnv(process.env.EXPO_PUBLIC_API_CANDIDATES)) {
    addCandidate(candidate);
  }

  if (Platform.OS === "web" && globalThis.location?.hostname) {
    addCandidate(`${globalThis.location.hostname}:8000`);
  }

  if (Platform.OS === "android") {
    addCandidate("10.0.2.2:8000");
  }
  addCandidate("127.0.0.1:8000");
  addCandidate("localhost:8000");
  return candidates;
}

function resolveApiBaseUrl() {
  return buildApiBaseUrls()[0] || "http://127.0.0.1:8000";
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readApiError(response: Response, fallback: string) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { detail?: unknown; message?: unknown };
      if (safeTrim(payload.detail)) {
        return safeTrim(payload.detail);
      }
      if (safeTrim(payload.message)) {
        return safeTrim(payload.message);
      }
    }
    const text = await response.text();
    if (safeTrim(text)) {
      return safeTrim(text);
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function isRunning(status: InvestigationStatus) {
  return status === "queued" || status === "running";
}

function verdictMeta(verdict: InvestigationSummary["verdict"] | InvestigationDetail["verdict"]) {
  if (verdict === "trustworthy") {
    return { label: "Agree", icon: "check-circle", color: palette.success, background: palette.successSoft };
  }
  if (verdict === "untrustworthy") {
    return { label: "Disagree", icon: "close-circle", color: palette.danger, background: palette.dangerSoft };
  }
  return { label: "Uncertain", icon: "help-circle", color: palette.warning, background: palette.warningSoft };
}

function sourceTone(source: SourceAssessment) {
  if (source.sentiment === "positive") {
    return { color: palette.success, icon: "check", background: palette.successSoft };
  }
  if (source.sentiment === "negative") {
    return { color: palette.danger, icon: "close", background: palette.dangerSoft };
  }
  return { color: palette.warning, icon: "help", background: palette.warningSoft };
}

function sourceSentimentLabel(source: SourceAssessment) {
  if (source.sentiment === "positive") {
    return "Supports claim";
  }
  if (source.sentiment === "negative") {
    return "Contradicts claim";
  }
  return "Needs nuance";
}

function stageIcon(step: PipelineStepSummary) {
  const key = step.key.toLowerCase();
  if (key.includes("claim")) return "stethoscope";
  if (key.includes("query")) return "magnify";
  if (key.includes("source")) return "web-check";
  if (key.includes("relevance")) return "tune";
  if (key.includes("quote")) return "format-quote-close";
  if (key.includes("consensus")) return "scale-balance";
  if (key.includes("verdict")) return "shield-check";
  return "chart-timeline-variant";
}

function statusIcon(status: PipelineStepSummary["status"] | InvestigationStatus) {
  if (status === "completed") {
    return { icon: "check-circle", color: palette.success };
  }
  if (status === "failed") {
    return { icon: "close-circle", color: palette.danger };
  }
  if (status === "running") {
    return { icon: "progress-clock", color: palette.primary };
  }
  if (status === "queued") {
    return { icon: "timer-sand", color: palette.secondary };
  }
  return { icon: "clock-outline", color: palette.muted };
}

function statusLabel(status: PipelineStepSummary["status"] | InvestigationStatus) {
  if (status === "completed") return "Done";
  if (status === "failed") return "Needs attention";
  if (status === "running") return "In progress";
  if (status === "queued") return "Queued";
  return "Waiting";
}

function highlightedQuoteUrl(url: string, quote: string) {
  const trimmed = safeTrim(quote);
  if (!trimmed) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hash) {
      return url;
    }
    return `${url}#:~:text=${encodeURIComponent(trimmed.slice(0, 140))}`;
  } catch {
    return url;
  }
}

function AppRoot() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.bootScreen}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <PaperProvider theme={paperTheme}>
      <GramwinApp />
    </PaperProvider>
  );
}

function GramwinApp() {
  const insets = useSafeAreaInsets();
  const [apiBaseUrl, setApiBaseUrl] = useState(resolveApiBaseUrl);
  const [apiError, setApiError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; action?: "retry" }>({
    visible: false,
    message: "",
  });
  const [reconnecting, setReconnecting] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [consultantView, setConsultantView] = useState<ConsultantView>("investigate");
  const [profileView, setProfileView] = useState<ProfileView>("overview");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload>(defaultBootstrap);
  const [history, setHistory] = useState<InvestigationSummary[]>(defaultHistory);
  const [historyOrder, setHistoryOrder] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [liveInvestigation, setLiveInvestigation] = useState<InvestigationDetail | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySort, setHistorySort] = useState<HistorySort>("manual");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historySheetDetail, setHistorySheetDetail] = useState<InvestigationDetail | null>(null);
  const [historySheetVisible, setHistorySheetVisible] = useState(false);
  const [historySheetLoading, setHistorySheetLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimDraft, setClaimDraft] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [claimSourceDraft, setClaimSourceDraft] = useState("");
  const [populationDraft, setPopulationDraft] = useState("");
  const [focusDraft, setFocusDraft] = useState("");
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [depth, setDepth] = useState<ReviewDepth>("standard");

  useEffect(() => {
    void warmApiConnection();
    void loadBootstrap();
    void loadHistory();
  }, []);

  useEffect(() => {
    if (!liveInvestigation || !isRunning(liveInvestigation.status)) {
      return;
    }
    const interval = setInterval(() => {
      void loadInvestigation(liveInvestigation.id, false);
      void loadHistory(false);
    }, 2000);
    return () => clearInterval(interval);
  }, [liveInvestigation]);

  useEffect(() => {
    if (!apiError) {
      return;
    }
    setSnackbar({ visible: true, message: reconnecting ? "Reconnecting..." : "No connection", action: "retry" });
  }, [apiError, reconnecting]);

  const visibleHistory = useMemo(() => {
    const query = safeLower(safeTrim(historyQuery));
    let items = history.filter((item) => {
      const verdictLabel = verdictMeta(item.verdict).label;
      const matchesQuery = !query || safeLower(`${item.claim} ${item.summary} ${verdictLabel}`).includes(query);
      if (!matchesQuery) {
        return false;
      }
      if (historyFilter === "pinned") {
        return pinnedIds.includes(item.id);
      }
      if (historyFilter === "trustworthy") {
        return verdictLabel === "Agree";
      }
      if (historyFilter === "untrustworthy") {
        return verdictLabel === "Disagree";
      }
      if (historyFilter === "uncertain") {
        return verdictLabel === "Uncertain";
      }
      return true;
    });

    items = items.slice().sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }
      if (historySort === "recent") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (historySort === "score") {
        return (b.overallScore ?? -1) - (a.overallScore ?? -1);
      }
      const aIndex = historyOrder.indexOf(a.id);
      const bIndex = historyOrder.indexOf(b.id);
      const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return safeA - safeB;
    });

    return items;
  }, [history, historyQuery, historySort, historyFilter, historyOrder, pinnedIds]);

  async function requestApi(path: string, init?: RequestInit, timeoutMsOverride?: number) {
    const candidates = buildApiBaseUrls(apiBaseUrl);
    let lastError: Error | null = null;
    const timeoutMs = timeoutMsOverride ?? (path === "/health" ? 1200 : 4500);
    for (const candidate of candidates) {
      try {
        const response = await fetchWithTimeout(`${candidate}${path}`, init, timeoutMs);
        if (candidate !== apiBaseUrl) {
          setApiBaseUrl(candidate);
        }
        setApiError(null);
        setReconnecting(false);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Network request failed");
      }
    }
    const message = "Connection issue. The app could not reach the investigation service.";
    setApiError(message);
    throw lastError ?? new Error(message);
  }

  async function warmApiConnection() {
    try {
      await requestApi("/health");
    } catch {
      // fallbacks already handled by loaders
    }
  }

  async function retryBackendConnection() {
    setReconnecting(true);
    setSnackbar({ visible: true, message: "Reconnecting..." });
    try {
      await requestApi("/health");
      await loadBootstrap();
      await loadHistory();
      setSnackbar({ visible: true, message: "Connection restored" });
    } catch {
      setSnackbar({ visible: true, message: "No connection", action: "retry" });
    } finally {
      setReconnecting(false);
    }
  }

  async function loadBootstrap() {
    try {
      const response = await requestApi("/api/bootstrap");
      if (!response.ok) {
        throw new Error("Bootstrap failed");
      }
      setBootstrap((await response.json()) as BootstrapPayload);
    } catch {
      setBootstrap(defaultBootstrap);
    }
  }

  async function loadHistory(showSpinner = true) {
    if (showSpinner) {
      setLoadingHistory(true);
    }
    try {
      const response = await requestApi("/api/investigations");
      if (!response.ok) {
        throw new Error("History failed");
      }
      const payload = (await response.json()) as InvestigationCollection;
      setHistory(payload.items);
      setHistoryOrder((current) => {
        const next = payload.items.map((item) => item.id);
        const preserved = current.filter((id) => next.includes(id));
        const additions = next.filter((id) => !preserved.includes(id));
        return [...preserved, ...additions];
      });
      setPinnedIds((current) => current.filter((id) => payload.items.some((item) => item.id === id)));
    } catch {
      if (showSpinner) {
        setHistory(defaultHistory);
      }
    } finally {
      if (showSpinner) {
        setLoadingHistory(false);
      }
    }
  }

  async function fetchInvestigation(id: string) {
    const response = await requestApi(`/api/investigations/${id}`);
    if (!response.ok) {
      throw new Error(`Could not load investigation ${id}`);
    }
    return (await response.json()) as InvestigationDetail;
  }

  async function loadInvestigation(id: string, showSpinner = true) {
    if (showSpinner) {
      setLoadingSelected(true);
    }
    try {
      const detail = await fetchInvestigation(id);
      setLiveInvestigation(detail);
      upsertHistoryItem(detail, false);
    } catch {
      if (showSpinner) {
        setLiveInvestigation(null);
      }
    } finally {
      if (showSpinner) {
        setLoadingSelected(false);
      }
    }
  }

  async function beginInvestigation(
    next: {
      claim: string;
      context: string;
      sourceUrls: string[];
      desiredDepth: ReviewDepth;
    },
    successMessage: string
  ) {
    try {
      const response = await requestApi("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim: next.claim,
          context: next.context,
          sourceUrls: next.sourceUrls,
          mode: "auto",
          desiredDepth: next.desiredDepth,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not start the investigation."));
      }
      const payload = (await response.json()) as InvestigationDetail;
      setLiveInvestigation(payload);
      upsertHistoryItem(payload, true);
      setClaimDraft(next.claim);
      setSourceUrlDraft(next.sourceUrls.join("\n"));
      setDepth(next.desiredDepth);
      setConsultantView("investigate");
      setActiveTab("consultant");
      await loadHistory(false);
      setSnackbar({ visible: true, message: successMessage });
      return payload;
    } catch (error) {
      setSnackbar({
        visible: true,
        message: error instanceof Error ? error.message : "Could not start the investigation.",
        action: "retry",
      });
      return null;
    }
  }

  async function submitInvestigation() {
    const cleanedClaim = safeTrim(claimDraft);
    if (cleanedClaim.length < 5) {
      setSnackbar({ visible: true, message: "Add a fuller claim before starting the review." });
      return;
    }

    setSubmitting(true);
    try {
      await beginInvestigation(
        {
          claim: cleanedClaim,
          context: composeInvestigationContext({
            notes: contextDraft,
            sourceContext: claimSourceDraft,
            population: populationDraft,
            focus: focusDraft,
          }),
          sourceUrls: sourceUrlDraft
            .split(/\s|,|\n/)
            .map((item) => safeTrim(item))
            .filter(Boolean),
          desiredDepth: depth,
        },
        "Investigation started"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function restartInvestigation(investigation: InvestigationDetail) {
    setSubmitting(true);
    try {
      const restarted = await beginInvestigation(
        {
          claim: safeTrim(investigation.claim),
          context: safeTrim(investigation.context),
          sourceUrls: [],
          desiredDepth: investigation.desiredDepth,
        },
        "Investigation started again"
      );
      if (restarted) {
        setHistorySheetVisible(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function openHistorySheet(id: string) {
    setHistorySheetVisible(true);
    setHistorySheetLoading(true);
    try {
      setHistorySheetDetail(await fetchInvestigation(id));
    } catch {
      setHistorySheetDetail(null);
      setSnackbar({ visible: true, message: "Could not open that saved investigation." });
    } finally {
      setHistorySheetLoading(false);
    }
  }

  async function deleteHistoryItem(id: string) {
    try {
      const response = await requestApi(`/api/investigations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Delete failed."));
      }
      setHistory((current) => current.filter((item) => item.id !== id));
      setHistoryOrder((current) => current.filter((itemId) => itemId !== id));
      setPinnedIds((current) => current.filter((itemId) => itemId !== id));
      if (liveInvestigation?.id === id) {
        setLiveInvestigation(null);
      }
      if (historySheetDetail?.id === id) {
        setHistorySheetVisible(false);
        setHistorySheetDetail(null);
      }
      setSnackbar({ visible: true, message: "Investigation deleted" });
    } catch {
      setSnackbar({ visible: true, message: "Delete failed" });
    }
  }

  function togglePinHistory(id: string) {
    setPinnedIds((current) => (current.includes(id) ? current.filter((itemId) => itemId !== id) : [id, ...current]));
  }

  function moveHistoryItem(id: string, direction: -1 | 1) {
    setHistoryOrder((current) => {
      const ordered = current.length > 0 ? [...current] : history.map((item) => item.id);
      const index = ordered.indexOf(id);
      if (index === -1) {
        return ordered;
      }
      const target = index + direction;
      if (target < 0 || target >= ordered.length) {
        return ordered;
      }
      const next = [...ordered];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function applyFeaturedClaim(item: FeaturedClaim) {
    setClaimDraft(item.claim);
    setContextDraft(item.whyItIsInteresting);
    setClaimSourceDraft("");
    setPopulationDraft("");
    setFocusDraft("");
    setConsultantView("investigate");
    setActiveTab("consultant");
  }

  function upsertHistoryItem(item: InvestigationSummary, appendToManualOrder: boolean) {
    setHistory((current) => {
      const index = current.findIndex((entry) => entry.id === item.id);
      if (index === -1) {
        return [...current, item];
      }
      const next = [...current];
      next[index] = { ...next[index], ...item };
      return next;
    });
    if (appendToManualOrder) {
      setHistoryOrder((current) => (current.includes(item.id) ? current : [...current, item.id]));
    }
  }

  const bottomInset = Math.max(insets.bottom, 16);

  return (
    <View style={styles.appShell}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.background} />
      <View style={styles.background} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12, paddingBottom: bottomInset + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <Header brand={bootstrap.brand.name} tagline={bootstrap.brand.tagline} onRetry={retryBackendConnection} apiError={apiError} />

        {activeTab === "home" && (
          <HomeScreen
            history={history}
            onOpenInvestigate={() => setActiveTab("consultant")}
            onOpenHistory={(id) => void openHistorySheet(id)}
            onOpenTab={setActiveTab}
          />
        )}

        {activeTab === "consultant" && (
          <ConsultantScreen
            consultantView={consultantView}
            claimDraft={claimDraft}
            contextDraft={contextDraft}
            claimSourceDraft={claimSourceDraft}
            populationDraft={populationDraft}
            focusDraft={focusDraft}
            sourceUrlDraft={sourceUrlDraft}
            depth={depth}
            submitting={submitting}
            loadingHistory={loadingHistory}
            loadingSelected={loadingSelected}
            history={visibleHistory}
            pinnedIds={pinnedIds}
            historySort={historySort}
            historyFilter={historyFilter}
            historyQuery={historyQuery}
            liveInvestigation={liveInvestigation}
            onClaimChange={setClaimDraft}
            onContextChange={setContextDraft}
            onClaimSourceChange={setClaimSourceDraft}
            onPopulationChange={setPopulationDraft}
            onFocusChange={setFocusDraft}
            onSourceUrlChange={setSourceUrlDraft}
            onDepthChange={setDepth}
            onSubmit={() => void submitInvestigation()}
            onOpenHistory={(id) => void openHistorySheet(id)}
            onDeleteHistory={(id) => void deleteHistoryItem(id)}
            onTogglePin={togglePinHistory}
            onMoveUp={(id) => moveHistoryItem(id, -1)}
            onMoveDown={(id) => moveHistoryItem(id, 1)}
            onSortChange={setHistorySort}
            onFilterChange={setHistoryFilter}
            onHistoryQueryChange={setHistoryQuery}
            onConsultantViewChange={setConsultantView}
          />
        )}

        {activeTab === "nutrition" && <NutritionScreen onOpenHome={() => setActiveTab("home")} />}
        {activeTab === "supplements" && <SupplementsScreen requestApi={requestApi} onOpenConsultant={() => setActiveTab("consultant")} />}
        {activeTab === "profile" && (
          <ProfileScreen
            bootstrap={bootstrap}
            history={history}
            profileView={profileView}
            onProfileViewChange={setProfileView}
            onOpenInvestigate={() => {
              setConsultantView("investigate");
              setActiveTab("consultant");
            }}
            onUseClaim={applyFeaturedClaim}
          />
        )}
      </ScrollView>

      <BottomTabs activeTab={activeTab} onSelect={setActiveTab} bottomInset={bottomInset} />

      <HistorySheet
        visible={historySheetVisible}
        investigation={historySheetDetail}
        loading={historySheetLoading}
        onClose={() => setHistorySheetVisible(false)}
        onRestart={(investigation) => void restartInvestigation(investigation)}
        onDelete={(id) => void deleteHistoryItem(id)}
      />

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((current) => ({ ...current, visible: false }))}
        action={
          snackbar.action === "retry"
            ? {
                label: "Retry",
                onPress: () => void retryBackendConnection(),
              }
            : undefined
        }
        style={styles.snackbar}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

function Header({
  brand,
  tagline,
  apiError,
  onRetry,
}: {
  brand: string;
  tagline: string;
  apiError: string | null;
  onRetry: () => void;
}) {
  return (
    <Surface style={styles.headerSurface} elevation={0}>
      <View style={styles.headerTop}>
        <View style={styles.headerBrandWrap}>
          <Text variant="headlineSmall" style={styles.headerTitle}>
            {brand}
          </Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            {tagline}
          </Text>
        </View>
        <Chip
          compact
          icon={apiError ? "wifi-strength-alert-outline" : "wifi-strength-4"}
          style={[styles.headerChip, apiError ? styles.headerChipError : styles.headerChipOkay]}
          textStyle={[styles.headerChipText, apiError ? styles.headerChipTextError : styles.headerChipTextOkay]}
          onPress={onRetry}
        >
          {apiError ? "Offline" : "Live"}
        </Chip>
      </View>
      <Text variant="bodySmall" style={styles.headerMicrocopy}>
        A calmer health dashboard with claim checking, medication support, and saved investigations in one place.
      </Text>
    </Surface>
  );
}

function HomeScreen({
  history,
  onOpenInvestigate,
  onOpenHistory,
  onOpenTab,
}: {
  history: InvestigationSummary[];
  onOpenInvestigate: () => void;
  onOpenHistory: (id: string) => void;
  onOpenTab: (tab: AppTab) => void;
}) {
  const latest = history
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return (
    <View style={styles.screenStack}>
      <LinearGradient colors={["#F8FCF9", "#E7F0EB", "#DDEBE3"]} style={styles.heroCard}>
        <Chip compact icon="heart-plus" style={styles.heroChip} textStyle={styles.heroChipText}>
          Daily overview
        </Chip>
        <Text variant="headlineMedium" style={styles.heroTitle}>
          A cleaner health dashboard with daily logs, quick actions, and fast access to evidence reviews.
        </Text>
        <Text variant="bodyMedium" style={styles.heroBody}>
          Use the Consultant tab when you want to fact-check a claim, then come back here for regular health data, meals, and medication tracking.
        </Text>
        <View style={styles.heroActions}>
          <Button mode="contained" icon="stethoscope" onPress={onOpenInvestigate} buttonColor={palette.primary}>
            New investigation
          </Button>
          <Button mode="outlined" icon="account-circle" onPress={() => onOpenTab("profile")} textColor={palette.primary}>
            Health profile
          </Button>
        </View>
      </LinearGradient>

      <SectionTitle eyebrow="Dashboard" title="Today at a glance" body="Regular health data for now, with cards that stay readable and tap-friendly." />
      <View style={styles.metricGrid}>
        {dashboardMetrics.map((metric) => (
          <Card key={metric.label} mode="contained" style={styles.metricCard}>
            <Card.Content style={styles.metricContent}>
              <Avatar.Icon size={42} icon={metric.icon} color={palette.primary} style={styles.metricAvatar} />
              <Text variant="titleLarge" style={styles.metricValue}>
                {metric.value}
              </Text>
              <Text variant="labelLarge" style={styles.metricLabel}>
                {metric.label}
              </Text>
              <Text variant="bodySmall" style={styles.metricDetail}>
                {metric.detail}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      <QuickLinks onOpenTab={onOpenTab} />

      <SectionTitle eyebrow="Meals" title="Meals log" body="A simple log view that feels like a real dashboard instead of placeholder filler." />
      <View style={styles.cardStack}>
        {mealLogs.map((log) => (
          <Card key={log.title} mode="contained" style={styles.logCard}>
            <Card.Content style={styles.logRow}>
              <Avatar.Icon icon={log.icon} size={40} color={palette.primary} style={styles.logAvatar} />
              <View style={styles.logCopy}>
                <Text variant="titleMedium" style={styles.logTitle}>
                  {log.title}
                </Text>
                <Text variant="bodyMedium" style={styles.logDetail}>
                  {log.detail}
                </Text>
              </View>
              <Text variant="labelMedium" style={styles.logTime}>
                {log.time}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      <SectionTitle eyebrow="Medication" title="Medication and supplement log" body="Low-clutter cards with room for the detail text to wrap naturally." />
      <View style={styles.cardStack}>
        {medicationLogs.map((log) => (
          <Card key={log.title} mode="contained" style={styles.logCard}>
            <Card.Content style={styles.logRow}>
              <Avatar.Icon icon={log.icon} size={40} color={palette.primary} style={styles.logAvatar} />
              <View style={styles.logCopy}>
                <Text variant="titleMedium" style={styles.logTitle}>
                  {log.title}
                </Text>
                <Text variant="bodyMedium" style={styles.logDetail}>
                  {log.detail}
                </Text>
              </View>
              <Text variant="labelMedium" style={styles.logTime}>
                {log.time}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      <SectionTitle eyebrow="Recent" title="Latest investigation" body="Tap back into the consultant view from your dashboard." />
      {latest ? (
        <TouchableRipple onPress={() => onOpenHistory(latest.id)} style={styles.recentCard}>
          <View>
            <View style={styles.rowBetween}>
              <Text variant="titleMedium" style={styles.historyClaim}>
                {latest.claim}
              </Text>
              <VerdictPill verdict={latest.verdict} />
            </View>
            <Text variant="bodyMedium" style={styles.historySummary}>
              {latest.summary}
            </Text>
            <Text variant="bodySmall" style={styles.historyMetaLine}>
              {formatTimestamp(latest.createdAt)}
            </Text>
          </View>
        </TouchableRipple>
      ) : (
        <EmptyState title="No investigations yet" body="Start one from the Consultant tab and it will show up here." />
      )}
    </View>
  );
}

function QuickLinks({ onOpenTab }: { onOpenTab: (tab: AppTab) => void }) {
  const links: Array<{ tab: AppTab; icon: string; label: string; body: string }> = [
    { tab: "consultant", icon: "doctor", label: "Consultant", body: "Investigate claims and read evidence." },
    { tab: "nutrition", icon: "silverware-fork-knife", label: "Nutrition", body: "Meals, hydration, and nutrient planning." },
    { tab: "supplements", icon: "pill", label: "Supplements", body: "Supplement notes and medication workflows." },
    { tab: "profile", icon: "account-circle-outline", label: "Profile", body: "Health profile, goals, and context." },
  ];

  return (
    <View style={styles.linkGrid}>
      {links.map((item) => (
        <TouchableRipple key={item.tab} style={styles.linkCard} onPress={() => onOpenTab(item.tab)}>
          <View>
            <Avatar.Icon size={42} icon={item.icon} color={palette.primary} style={styles.metricAvatar} />
            <Text variant="titleMedium" style={styles.linkTitle}>
              {item.label}
            </Text>
            <Text variant="bodySmall" style={styles.linkBody}>
              {item.body}
            </Text>
          </View>
        </TouchableRipple>
      ))}
    </View>
  );
}

type ConsultantScreenProps = {
  consultantView: ConsultantView;
  claimDraft: string;
  contextDraft: string;
  claimSourceDraft: string;
  populationDraft: string;
  focusDraft: string;
  sourceUrlDraft: string;
  depth: ReviewDepth;
  submitting: boolean;
  loadingHistory: boolean;
  loadingSelected: boolean;
  history: InvestigationSummary[];
  pinnedIds: string[];
  historySort: HistorySort;
  historyFilter: HistoryFilter;
  historyQuery: string;
  liveInvestigation: InvestigationDetail | null;
  onClaimChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onClaimSourceChange: (value: string) => void;
  onPopulationChange: (value: string) => void;
  onFocusChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onDepthChange: (value: ReviewDepth) => void;
  onSubmit: () => void;
  onOpenHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onTogglePin: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onSortChange: (value: HistorySort) => void;
  onFilterChange: (value: HistoryFilter) => void;
  onHistoryQueryChange: (value: string) => void;
  onConsultantViewChange: (value: ConsultantView) => void;
};

function ConsultantScreen(props: ConsultantScreenProps) {
  const {
    consultantView,
    claimDraft,
    contextDraft,
    claimSourceDraft,
    populationDraft,
    focusDraft,
    sourceUrlDraft,
    depth,
    submitting,
    loadingHistory,
    loadingSelected,
    history,
    pinnedIds,
    historySort,
    historyFilter,
    historyQuery,
    liveInvestigation,
    onClaimChange,
    onContextChange,
    onClaimSourceChange,
    onPopulationChange,
    onFocusChange,
    onSourceUrlChange,
    onDepthChange,
    onSubmit,
    onOpenHistory,
    onDeleteHistory,
    onTogglePin,
    onMoveUp,
    onMoveDown,
    onSortChange,
    onFilterChange,
    onHistoryQueryChange,
    onConsultantViewChange,
  } = props;

  return (
    <View style={styles.screenStack}>
      <SectionTitle
        eyebrow="Consultant"
        title="Investigate health claims without the clutter"
        body="Use Investigate for a fresh review and History for saved reports. Settings and workflow details now live on the Profile screen."
      />

      <Card mode="contained" style={styles.segmentedCard}>
        <Card.Content>
          <SegmentedButtons
            value={consultantView}
            onValueChange={(value) => onConsultantViewChange(value as ConsultantView)}
            density="small"
            style={styles.segmentedButtons}
            buttons={[
              { value: "investigate", label: "Investigate", icon: "stethoscope" },
              { value: "history", label: "History", icon: "history" },
            ]}
          />
        </Card.Content>
      </Card>

      {consultantView === "investigate" ? (
        <>
          <Card mode="contained" style={styles.formCard}>
            <Card.Content style={styles.formCardContent}>
              <Text variant="titleLarge" style={styles.formTitle}>
                New investigation
              </Text>
              <Text variant="bodyMedium" style={styles.sectionBody}>
                Paste the full claim wording you saw. We will handle claim strength, contradiction checks, source quality, and wording risk in the background.
              </Text>

              <View style={styles.cardStack}>
                <TextInput
                  mode="outlined"
                  label="Claim to investigate"
                  placeholder="Example: A reel says magnesium glycinate cures insomnia within one week for most adults."
                  value={claimDraft}
                  onChangeText={onClaimChange}
                  multiline
                  outlineStyle={styles.inputOutline}
                  style={styles.paperInput}
                  contentStyle={styles.inputContent}
                />
                <TextInput
                  mode="outlined"
                  label="What do you want checked?"
                  placeholder="Example: I want to know whether this wording overstates the evidence, hides contradictions, or confuses mechanism with real outcomes."
                  value={contextDraft}
                  onChangeText={onContextChange}
                  multiline
                  outlineStyle={styles.inputOutline}
                  style={styles.paperInput}
                  contentStyle={[styles.inputContent, styles.multilineInput]}
                />
                <TextInput
                  mode="outlined"
                  label="Where did you see this?"
                  placeholder="Example: Instagram reel, product page, TikTok video, podcast clip, clinic article, or a friend’s recommendation."
                  value={claimSourceDraft}
                  onChangeText={onClaimSourceChange}
                  multiline
                  outlineStyle={styles.inputOutline}
                  style={styles.paperInput}
                  contentStyle={styles.inputContent}
                />
                <TextInput
                  mode="outlined"
                  label="Population or scenario"
                  placeholder="Example: Adults with eczema, someone trying to lose weight, a supplement for sleep, or a claim aimed at children."
                  value={populationDraft}
                  onChangeText={onPopulationChange}
                  multiline
                  outlineStyle={styles.inputOutline}
                  style={styles.paperInput}
                  contentStyle={styles.inputContent}
                />
                <TextInput
                  mode="outlined"
                  label="Priority question"
                  placeholder="Example: Is it actually effective, is it safe, does it only show correlation, or is the wording misleading?"
                  value={focusDraft}
                  onChangeText={onFocusChange}
                  multiline
                  outlineStyle={styles.inputOutline}
                  style={styles.paperInput}
                  contentStyle={styles.inputContent}
                />
                <TextInput
                  mode="outlined"
                  label="Optional source URLs"
                  placeholder="Paste article, reel, product page, study, or transcript links here. Separate multiple URLs with commas or new lines."
                  value={sourceUrlDraft}
                  onChangeText={onSourceUrlChange}
                  multiline
                  outlineStyle={styles.inputOutline}
                  style={styles.paperInput}
                  contentStyle={styles.inputContent}
                />
              </View>

              <View style={styles.segmentRow}>
                <Chip selected={depth === "quick"} onPress={() => onDepthChange("quick")} style={styles.segmentChip}>
                  Quick review
                </Chip>
                <Chip selected={depth === "standard"} onPress={() => onDepthChange("standard")} style={styles.segmentChip}>
                  Standard review
                </Chip>
                <Chip selected={depth === "deep"} onPress={() => onDepthChange("deep")} style={styles.segmentChip}>
                  Deep review
                </Chip>
              </View>
              <Text variant="bodySmall" style={styles.depthHint}>
                {depthDescription(depth)}
              </Text>

              <Button mode="contained" icon="magnify" onPress={onSubmit} loading={submitting} disabled={submitting} buttonColor={palette.primary}>
                Start investigation
              </Button>
            </Card.Content>
          </Card>

          <SectionTitle eyebrow="Live report" title="Current review" body="Only investigations started in this session appear here. Saved history stays separate until you run it again." />
          {loadingSelected ? (
            <LoadingCard text="Loading investigation..." />
          ) : liveInvestigation ? (
            isRunning(liveInvestigation.status) ? (
              <ProcessingCard investigation={liveInvestigation} />
            ) : (
              <InvestigationResult investigation={liveInvestigation} />
            )
          ) : (
            <EmptyState
              title="No active investigation"
              body="Start a new review to populate the live report. Saved investigations stay in History until you choose to run them again."
            />
          )}
        </>
      ) : null}

      {consultantView === "history" ? (
        <HistoryPanel
          loadingHistory={loadingHistory}
          history={history}
          pinnedIds={pinnedIds}
          historySort={historySort}
          historyFilter={historyFilter}
          historyQuery={historyQuery}
          onOpenHistory={onOpenHistory}
          onDeleteHistory={onDeleteHistory}
          onTogglePin={onTogglePin}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onSortChange={onSortChange}
          onFilterChange={onFilterChange}
          onHistoryQueryChange={onHistoryQueryChange}
        />
      ) : null}
    </View>
  );
}

function HistoryPanel({
  loadingHistory,
  history,
  pinnedIds,
  historySort,
  historyFilter,
  historyQuery,
  onOpenHistory,
  onDeleteHistory,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  onSortChange,
  onFilterChange,
  onHistoryQueryChange,
}: {
  loadingHistory: boolean;
  history: InvestigationSummary[];
  pinnedIds: string[];
  historySort: HistorySort;
  historyFilter: HistoryFilter;
  historyQuery: string;
  onOpenHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onTogglePin: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onSortChange: (value: HistorySort) => void;
  onFilterChange: (value: HistoryFilter) => void;
  onHistoryQueryChange: (value: string) => void;
}) {
  const averageScore =
    history.filter((item) => item.overallScore !== null).reduce((sum, item) => sum + (item.overallScore ?? 0), 0) /
    Math.max(
      1,
      history.filter((item) => item.overallScore !== null).length
    );

  return (
    <View style={styles.cardStack}>
      <SectionTitle
        eyebrow="History"
        title="Saved investigations"
        body="A dedicated history page with cleaner cards, fast filters, and gesture actions that stay out of the live report."
      />

      <Card mode="contained" style={styles.resultSectionCard}>
        <Card.Content style={styles.resultMetaRow}>
          <MiniStat label="Saved" value={String(history.length)} />
          <MiniStat label="Pinned" value={String(pinnedIds.length)} />
          <MiniStat label="Avg. score" value={Number.isFinite(averageScore) ? `${Math.round(averageScore)}/100` : "--"} />
        </Card.Content>
      </Card>

      <Card mode="contained" style={styles.filterCard}>
        <Card.Content style={styles.cardStack}>
          <Searchbar
            placeholder="Search claim, verdict, or summary"
            value={historyQuery}
            onChangeText={onHistoryQueryChange}
            style={styles.searchbar}
            inputStyle={styles.searchbarInput}
            iconColor={palette.primary}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["manual", "Manual"],
              ["recent", "Newest"],
              ["score", "Highest score"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={historySort === value} onPress={() => onSortChange(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All"],
              ["pinned", "Pinned"],
              ["trustworthy", "Agree"],
              ["uncertain", "Uncertain"],
              ["untrustworthy", "Disagree"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={historyFilter === value} onPress={() => onFilterChange(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <Text variant="bodySmall" style={styles.sectionBody}>
            Swipe right to pin in yellow, swipe left to delete in red, and tap the three dots on a card to enter drag mode for reordering.
          </Text>
        </Card.Content>
      </Card>

      {loadingHistory ? (
        <LoadingCard text="Loading investigation history..." />
      ) : history.length > 0 ? (
        <View style={styles.cardStack}>
          {history.map((item, index) => (
            <HistoryItem
              key={item.id}
              item={item}
              isPinned={pinnedIds.includes(item.id)}
              canMoveUp={index > 0}
              canMoveDown={index < history.length - 1}
              onOpen={() => onOpenHistory(item.id)}
              onDelete={() => onDeleteHistory(item.id)}
              onPin={() => onTogglePin(item.id)}
              onMoveUp={() => onMoveUp(item.id)}
              onMoveDown={() => onMoveDown(item.id)}
            />
          ))}
        </View>
      ) : (
        <EmptyState title="No matching saved runs" body="Try another filter or start a new investigation." />
      )}
    </View>
  );
}

function ProfileSettingsPanel({
  bootstrap,
  onUseClaim,
}: {
  bootstrap: BootstrapPayload;
  onUseClaim: (item: FeaturedClaim) => void;
}) {
  return (
    <View style={styles.cardStack}>
      <SectionTitle
        eyebrow="Settings"
        title="Prompt ideas and workflow transparency"
        body="Prompt starters, workflow notes, and storage details live here so the Consultant screen can stay focused on investigation."
      />

      <Card mode="contained" style={styles.resultSectionCard}>
        <Card.Content style={styles.cardStack}>
          <Text variant="titleLarge" style={styles.formTitle}>
            What gets checked
          </Text>
          {consultantChecks.map((item) => (
            <Bullet key={item} text={item} />
          ))}
        </Card.Content>
      </Card>

      <View style={styles.cardStack}>
        {consultantPromptTemplates.map((item) => (
          <TouchableRipple
            key={item.id}
            style={styles.scenarioCard}
            onPress={() => onUseClaim({ id: item.id, claim: item.claim, whyItIsInteresting: item.context })}
          >
            <View>
              <Text variant="titleMedium" style={styles.scenarioTitle}>
                {item.title}
              </Text>
              <Text variant="bodyMedium" style={styles.scenarioBody}>
                {item.claim}
              </Text>
              <Text variant="bodySmall" style={styles.historyMetaLine}>
                {item.context}
              </Text>
            </View>
          </TouchableRipple>
        ))}
      </View>

      <View style={styles.agentGrid}>
        {bootstrap.architecture.map((item) => (
          <Card key={item.id} mode="contained" style={styles.agentCard}>
            <Card.Content style={styles.agentCardContent}>
              <Text variant="titleSmall" style={styles.agentTitle}>
                {item.title}
              </Text>
              <Text variant="bodySmall" style={styles.agentBody}>
                {item.summary}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      <Card mode="contained" style={styles.resultSectionCard}>
        <Card.Content style={styles.cardStack}>
          <Text variant="titleMedium" style={styles.linkTitle}>
            Data handling
          </Text>
          <Text variant="bodyMedium" style={styles.sectionBody}>
            {bootstrap.storageNote}
          </Text>
        </Card.Content>
      </Card>
    </View>
  );
}

function ProcessingCard({ investigation }: { investigation: InvestigationDetail }) {
  const steps = investigation.stepSummaries.length > 0 ? investigation.stepSummaries : [];
  const recentEvents = investigation.progressEvents.slice(-5).reverse();
  return (
    <Card mode="contained" style={styles.processingCard}>
      <Card.Content style={styles.cardStack}>
        <View style={styles.rowBetween}>
          <View style={styles.flexOne}>
            <Text variant="titleLarge" style={styles.formTitle}>
              Review in progress
            </Text>
            <Text variant="bodyMedium" style={styles.sectionBody}>
              {investigation.claim}
            </Text>
          </View>
          <Chip style={styles.progressChip} textStyle={styles.progressChipText}>
            {investigation.progressPercent}%
          </Chip>
        </View>

        <ProgressBar progress={Math.max(0.04, investigation.progressPercent / 100)} color={palette.primary} style={styles.progressBar} />

        {steps.length > 0 ? (
          <View style={styles.cardStack}>
            {steps.map((step) => {
              const indicator = statusIcon(step.status);
              return (
                <View key={step.key} style={styles.stepRow}>
                  <Avatar.Icon size={40} icon={stageIcon(step)} color={palette.primary} style={styles.stepAvatar} />
                  <View style={styles.flexOne}>
                    <View style={styles.rowBetween}>
                      <Text variant="titleSmall" style={styles.stepTitle}>
                        {step.title}
                      </Text>
                      <Chip compact icon={indicator.icon} textStyle={[styles.miniChipText, { color: indicator.color }]}>
                        {statusLabel(step.status)}
                      </Chip>
                    </View>
                    <Text variant="bodySmall" style={styles.stepBody}>
                      {step.summary}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text variant="bodyMedium" style={styles.sectionBody}>
            The report is being assembled. Progress events will appear as soon as the pipeline advances.
          </Text>
        )}

        {recentEvents.length > 0 && (
          <View style={styles.cardStack}>
            <Text variant="titleSmall" style={styles.formTitle}>
              Recent updates
            </Text>
            {recentEvents.map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <Text variant="bodySmall" style={styles.eventMeta}>
                  {formatTimestamp(event.createdAt)}
                </Text>
                <Text variant="bodyMedium" style={styles.eventBody}>
                  {event.message}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

function InvestigationResult({ investigation }: { investigation: InvestigationDetail }) {
  const verdict = verdictMeta(investigation.verdict);
  const groupedSources = investigation.sourceGroups.filter((group) => group.sources.length > 0);
  return (
    <View style={styles.cardStack}>
      <Card mode="contained" style={styles.resultHero}>
        <Card.Content style={styles.cardStack}>
          <View style={styles.rowBetween}>
            <VerdictPill verdict={investigation.verdict} />
            <Chip compact style={styles.scoreChip} textStyle={styles.scoreChipText}>
              {investigation.overallScore ?? "--"}/100
            </Chip>
          </View>
          <Text variant="headlineSmall" style={styles.resultTitle}>
            {investigation.claim}
          </Text>
          <Text variant="bodyMedium" style={styles.resultBody}>
            {investigation.aiSummary || investigation.finalNarrative || investigation.summary}
          </Text>
          <View style={styles.resultMetaRow}>
            <MiniStat label="Score band" value={scoreBandLabel(investigation.overallScore)} />
            <MiniStat label="Confidence" value={safeUpper(investigation.confidenceLevel ?? "unknown")} />
            <MiniStat label="Classification" value={investigation.truthClassification || verdict.label} />
            <MiniStat label="Review" value={depthLabel(investigation.desiredDepth)} />
            <MiniStat label="Sources" value={String(investigation.sources.length)} />
          </View>
          {investigation.sentiment ? (
            <View style={styles.resultSignalRow}>
              <SignalPill label="Support" value={`${investigation.sentiment.positivePct}%`} icon="check-circle" color={palette.success} background={palette.successSoft} />
              <SignalPill label="Mixed" value={`${investigation.sentiment.neutralPct}%`} icon="help-circle" color={palette.warning} background={palette.warningSoft} />
              <SignalPill label="Pushback" value={`${investigation.sentiment.negativePct}%`} icon="close-circle" color={palette.danger} background={palette.dangerSoft} />
            </View>
          ) : null}
          <Text variant="bodySmall" style={styles.scoreGuideText}>
            Standardized score guide: under 30 disagrees, 30 to 69 stays uncertain, and 70 or higher agrees.
          </Text>
        </Card.Content>
      </Card>

      <ExpandableResultSection
        title="Summary and conclusion"
        body={investigation.finalNarrative || investigation.aiSummary || investigation.summary}
        icon="text-box-check-outline"
        defaultExpanded
      >
        <Text variant="bodyMedium" style={styles.resultBody}>
          {investigation.expertInsight || investigation.verdictSummary || investigation.aiSummary}
        </Text>
        {investigation.evidenceBreakdown.slice(0, 5).map((item) => (
          <Bullet key={item} text={item} />
        ))}
      </ExpandableResultSection>

      {investigation.keyFindings.length > 0 && (
        <ExpandableResultSection
          title="Key findings"
          body={investigation.keyFindings[0]}
          icon="star-four-points-circle-outline"
          defaultExpanded={false}
        >
          {investigation.keyFindings.map((item) => (
            <Bullet key={item} text={item} />
          ))}
        </ExpandableResultSection>
      )}

      {groupedSources.length > 0 && (
        <ExpandableResultSection
          title="Evidence deck"
          body={`${investigation.sources.length} relevant sources were retained, grouped by strongest support, mixed evidence, and contradictions.`}
          icon="file-document-multiple-outline"
        >
          {groupedSources.map((group) => (
            <View key={group.key} style={styles.cardStack}>
              <View style={styles.rowBetween}>
                <Text variant="titleMedium" style={styles.evidenceTitle}>
                  {group.title}
                </Text>
                <Chip compact style={styles.segmentChip}>
                  {group.sources.length}
                </Chip>
              </View>
              <Text variant="bodySmall" style={styles.sectionBody}>
                {group.summary}
              </Text>
              {group.sources.map((source) => (
                <EvidenceBlock key={source.id} source={source} />
              ))}
            </View>
          ))}
        </ExpandableResultSection>
      )}

      {investigation.contradictions.length > 0 && (
        <ExpandableResultSection
          title="Contradictions and cautions"
          body={investigation.contradictions[0]}
          icon="alert-circle-outline"
        >
          {investigation.contradictions.map((item) => (
            <Bullet key={item} text={item} />
          ))}
          {investigation.concerns.slice(0, 4).map((item) => (
            <Bullet key={`concern-${item}`} text={item} />
          ))}
        </ExpandableResultSection>
      )}

      {investigation.stepSummaries.length > 0 && (
        <ExpandableResultSection
          title="Workflow behind the scenes"
          body="Open this when you want to see how the investigation was parsed, searched, checked, and reconciled."
          icon="timeline-outline"
        >
          {investigation.stepSummaries.map((step) => {
            const indicator = statusIcon(step.status);
            return (
              <View key={step.key} style={styles.stepRow}>
                <Avatar.Icon size={38} icon={stageIcon(step)} color={palette.primary} style={styles.stepAvatar} />
                <View style={styles.flexOne}>
                  <View style={styles.rowBetween}>
                    <Text variant="titleSmall" style={styles.stepTitle}>
                      {step.title}
                    </Text>
                    <Chip compact icon={indicator.icon} textStyle={[styles.miniChipText, { color: indicator.color }]}>
                      {statusLabel(step.status)}
                    </Chip>
                  </View>
                  <Text variant="bodySmall" style={styles.stepBody}>
                    {step.summary}
                  </Text>
                  {step.details.slice(0, 3).map((detail) => (
                    <Bullet key={`${step.key}-${detail}`} text={detail} />
                  ))}
                </View>
              </View>
            );
          })}
        </ExpandableResultSection>
      )}
    </View>
  );
}

function EvidenceBlock({ source }: { source: SourceAssessment }) {
  const tone = sourceTone(source);
  const quote = safeTrim(source.evidence?.quotedEvidence) || safeTrim(source.snippet);
  const quoteUrl = highlightedQuoteUrl(source.url, quote);

  return (
    <Card mode="contained" style={styles.evidenceCard}>
      <Card.Content style={styles.cardStack}>
        <View style={styles.rowBetween}>
          <View style={styles.flexOne}>
            <Text variant="titleMedium" style={styles.evidenceTitle}>
              {source.sourceName || source.domain}
            </Text>
            <Pressable onPress={() => void Linking.openURL(source.url)}>
              <Text variant="bodySmall" style={styles.evidenceUrl}>
                {source.url}
              </Text>
            </Pressable>
          </View>
          <Avatar.Icon size={34} icon={tone.icon} color={tone.color} style={{ backgroundColor: tone.background }} />
        </View>

        <View style={styles.historyMetaRow}>
          <Chip compact style={{ backgroundColor: tone.background }} textStyle={{ color: tone.color, fontFamily: "Poppins_600SemiBold" }}>
            {sourceSentimentLabel(source)}
          </Chip>
          {source.evidence?.studyType ? <Chip compact style={styles.segmentChip}>{source.evidence.studyType}</Chip> : null}
          {source.evidence?.sampleSize ? <Chip compact style={styles.segmentChip}>{source.evidence.sampleSize}</Chip> : null}
          {source.quoteVerified ? (
            <Chip compact style={{ backgroundColor: palette.primarySoft }} textStyle={{ color: palette.primary, fontFamily: "Poppins_600SemiBold" }}>
              Verified quote
            </Chip>
          ) : null}
        </View>

        <View style={styles.quoteBox}>
          <Text variant="labelSmall" style={styles.quoteLabel}>
            {source.quoteVerified ? "Exact quotation retained" : "Relevant excerpt"}
          </Text>
          <Text variant="bodyMedium" style={styles.quoteText}>
            {quote ? `"${quote}"` : "No verified quote was retained for this source."}
          </Text>
        </View>

        <Text variant="bodySmall" style={styles.evidenceBody}>
          {source.evidence?.expertAnalysis || source.sentimentSummary || source.relevanceSummary || "This source was included because it materially addresses the claim."}
        </Text>

        {source.evidence?.limitations?.slice(0, 2).map((item) => (
          <Bullet key={`${source.id}-${item}`} text={item} />
        ))}

        <View style={styles.resultActionRow}>
          <Button mode="outlined" compact icon="open-in-new" textColor={palette.primary} onPress={() => void Linking.openURL(source.url)}>
            Open source
          </Button>
          {quote && source.quoteVerified ? (
            <Button mode="contained-tonal" compact icon="format-quote-close" buttonColor={palette.primarySoft} textColor={palette.primary} onPress={() => void Linking.openURL(quoteUrl)}>
              Highlight quote
            </Button>
          ) : null}
        </View>
      </Card.Content>
    </Card>
  );
}

function NutritionScreen({ onOpenHome }: { onOpenHome: () => void }) {
  return (
    <View style={styles.screenStack}>
      <SectionTitle eyebrow="Nutrition" title="Diet and meal insights" body="This stays UI-focused for now, with lightweight planning cards and no backend workflow changes." />
      <View style={styles.linkGrid}>
        {nutritionHighlights.map((item) => (
          <Card key={item.title} mode="contained" style={styles.linkCard}>
            <Card.Content style={styles.cardStack}>
              <Avatar.Icon size={42} icon={item.icon} color={palette.primary} style={styles.metricAvatar} />
              <Text variant="titleMedium" style={styles.linkTitle}>
                {item.title}
              </Text>
              <Text variant="bodySmall" style={styles.linkBody}>
                {item.body}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>
      <Button mode="outlined" icon="home-variant-outline" onPress={onOpenHome} textColor={palette.primary}>
        Back to dashboard
      </Button>
    </View>
  );
}

function SupplementsScreen({
  requestApi,
  onOpenConsultant,
}: {
  requestApi: (path: string, init?: RequestInit, timeoutMsOverride?: number) => Promise<Response>;
  onOpenConsultant: () => void;
}) {
  return (
    <View style={styles.screenStack}>
      <SectionTitle
        eyebrow="Supplements"
        title="Medicine and supplement analyzer"
        body="Review supplement labels, ingredient fit, and medication context in the same calmer theme as the rest of the app."
      />
      <Card mode="contained" style={styles.resultSectionCard}>
        <Card.Content style={styles.cardStack}>
          <Text variant="bodyMedium" style={styles.sectionBody}>
            Upload a supplement label to review ingredient fit, risks, expected benefits, and practical cautions without affecting the claim-investigation workflow.
          </Text>
          <Button mode="outlined" icon="stethoscope" onPress={onOpenConsultant} textColor={palette.primary}>
            Open Consultant for evidence review
          </Button>
        </Card.Content>
      </Card>
      <SupplementsPage requestApi={requestApi} />
    </View>
  );
}

function ProfileScreen({
  bootstrap,
  history,
  profileView,
  onProfileViewChange,
  onOpenInvestigate,
  onUseClaim,
}: {
  bootstrap: BootstrapPayload;
  history: InvestigationSummary[];
  profileView: ProfileView;
  onProfileViewChange: (value: ProfileView) => void;
  onOpenInvestigate: () => void;
  onUseClaim: (item: FeaturedClaim) => void;
}) {
  const completedCount = history.filter((item) => item.status === "completed").length;
  const latestScore = history.find((item) => item.overallScore !== null)?.overallScore;
  return (
    <View style={styles.screenStack}>
      <SectionTitle eyebrow="Profile" title="Health profile and app settings" body="Your health context stays here, alongside prompt presets and workflow details for the investigation engine." />
      <Card mode="contained" style={styles.segmentedCard}>
        <Card.Content>
          <SegmentedButtons
            value={profileView}
            onValueChange={(value) => onProfileViewChange(value as ProfileView)}
            density="small"
            style={styles.segmentedButtons}
            buttons={[
              { value: "overview", label: "Overview", icon: "account-heart-outline" },
              { value: "settings", label: "Settings", icon: "cog-outline" },
            ]}
          />
        </Card.Content>
      </Card>

      {profileView === "overview" ? (
        <>
          <Card mode="contained" style={styles.resultHero}>
            <Card.Content style={styles.cardStack}>
              <View style={styles.rowBetween}>
                <View style={styles.rowGap}>
                  <Avatar.Text size={52} label="AT" style={{ backgroundColor: palette.primarySoft }} labelStyle={{ color: palette.primary, fontFamily: "Poppins_700Bold" }} />
                  <View style={styles.flexOne}>
                    <Text variant="titleLarge" style={styles.formTitle}>
                      Aly Tan
                    </Text>
                    <Text variant="bodyMedium" style={styles.sectionBody}>
                      Sleep, energy, skin health, hydration, and steady day-to-day routines
                    </Text>
                  </View>
                </View>
                <Button mode="outlined" icon="stethoscope" onPress={onOpenInvestigate} textColor={palette.primary}>
                  Investigate
                </Button>
              </View>
              <View style={styles.resultMetaRow}>
                <MiniStat label="Saved runs" value={String(history.length)} />
                <MiniStat label="Completed" value={String(completedCount)} />
                <MiniStat label="Latest score" value={latestScore !== undefined ? `${latestScore}/100` : "--"} />
                <MiniStat label="Care plan" value="Active" />
                <MiniStat label="Hydration goal" value="2.2 L" />
                <MiniStat label="Sleep target" value="8 h" />
              </View>
            </Card.Content>
          </Card>
          <View style={styles.cardStack}>
            {profileSections.map((section) => (
              <Card key={section.title} mode="contained" style={styles.resultSectionCard}>
                <Card.Content style={styles.cardStack}>
                  <Text variant="titleMedium" style={styles.linkTitle}>
                    {section.title}
                  </Text>
                  <Text variant="bodyMedium" style={styles.sectionBody}>
                    {section.body}
                  </Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        </>
      ) : (
        <ProfileSettingsPanel bootstrap={bootstrap} onUseClaim={onUseClaim} />
      )}
    </View>
  );
}

function HistoryItem({
  item,
  isPinned,
  canMoveUp,
  canMoveDown,
  onOpen,
  onDelete,
  onPin,
  onMoveUp,
  onMoveDown,
}: {
  item: InvestigationSummary;
  isPinned: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onPin: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const status = statusIcon(item.status);
  const [dragMode, setDragMode] = useState(false);

  const resetCard = () => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (dragMode) {
            return Math.abs(gesture.dy) > 6 || Math.abs(gesture.dx) > 10;
          }
          return Math.abs(gesture.dx) > 8;
        },
        onPanResponderMove: (_, gesture) => {
          const nextX = Math.max(-96, Math.min(96, gesture.dx));
          const nextY = Math.max(-72, Math.min(72, gesture.dy));
          if (dragMode) {
            pan.setValue({ x: Math.max(-36, Math.min(36, gesture.dx)), y: nextY });
            return;
          }
          pan.setValue({ x: nextX, y: 0 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 72) {
            onPin();
          } else if (gesture.dx < -72) {
            onDelete();
          } else if (dragMode && gesture.dy < -48 && canMoveUp) {
            onMoveUp();
          } else if (dragMode && gesture.dy > 48 && canMoveDown) {
            onMoveDown();
          } else if (!dragMode) {
            onOpen();
          } else {
            setDragMode(false);
          }
          setDragMode(false);
          resetCard();
        },
        onPanResponderTerminate: () => {
          setDragMode(false);
          resetCard();
        },
      }),
    [canMoveDown, canMoveUp, dragMode, onDelete, onMoveDown, onMoveUp, onOpen, onPin, pan]
  );

  return (
    <View style={styles.historySwipeShell}>
      <View style={styles.historyRails}>
        <View style={styles.pinRail}>
          <Avatar.Icon size={36} icon={isPinned ? "pin-off-outline" : "pin-outline"} color={palette.pin} style={styles.pinRailAvatar} />
        </View>
        <View style={styles.deleteRail}>
          <Avatar.Icon size={36} icon="delete-outline" color={palette.danger} style={styles.deleteRailAvatar} />
        </View>
      </View>

      <Animated.View style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }] }} {...panResponder.panHandlers}>
        <TouchableRipple onPress={onOpen} style={[styles.historyCard, isPinned && styles.historyCardPinned]}>
          <View style={styles.cardStack}>
            <View style={styles.rowBetween}>
              <View style={styles.rowGap}>
                <HistoryVerdictMark verdict={item.verdict} />
                <Text variant="titleMedium" style={styles.historyClaim}>
                  {item.claim}
                </Text>
              </View>
              <View style={styles.historyHeaderActions}>
                <Chip compact style={styles.scoreChip} textStyle={styles.scoreChipText}>
                  {item.overallScore !== null ? `${item.overallScore}/100` : "--"}
                </Chip>
                <IconButton
                  icon="dots-vertical"
                  size={18}
                  iconColor={dragMode ? palette.primary : palette.muted}
                  style={[styles.dragButton, dragMode && styles.dragButtonActive]}
                  onPress={() => setDragMode((current) => !current)}
                />
              </View>
            </View>
            <View style={styles.historyMetaRow}>
              <Text variant="bodySmall" style={styles.historyMetaLine}>
                Updated {formatTimestamp(item.updatedAt)}
              </Text>
              {item.sourceCount > 0 ? (
                <>
                  <Text variant="bodySmall" style={styles.historyMetaDot}>
                    •
                  </Text>
                  <Text variant="bodySmall" style={styles.historyMetaLine}>
                    {item.sourceCount} sources
                  </Text>
                </>
              ) : null}
              {item.confidenceLevel ? (
                <>
                  <Text variant="bodySmall" style={styles.historyMetaDot}>
                    •
                  </Text>
                  <Text variant="bodySmall" style={styles.historyMetaLine}>
                    {safeUpper(item.confidenceLevel)}
                  </Text>
                </>
              ) : null}
            </View>
            <Text variant="bodyMedium" style={styles.historySummary}>
              {item.summary}
            </Text>
            {dragMode ? (
              <Text variant="bodySmall" style={styles.dragModeHint}>
                Drag mode is on. Move the card up or down, or tap the dots again to cancel.
              </Text>
            ) : null}
            {(item.positiveCount > 0 || item.neutralCount > 0 || item.negativeCount > 0) && (
              <View style={styles.resultSignalRow}>
                <SignalPill label="Support" value={String(item.positiveCount)} icon="check-circle" color={palette.success} background={palette.successSoft} />
                <SignalPill label="Mixed" value={String(item.neutralCount)} icon="help-circle" color={palette.warning} background={palette.warningSoft} />
                <SignalPill label="Pushback" value={String(item.negativeCount)} icon="close-circle" color={palette.danger} background={palette.dangerSoft} />
              </View>
            )}
            <View style={styles.historyMetaRow}>
              <Text variant="bodySmall" style={styles.historyMetaLine}>
                {formatTimestamp(item.createdAt)}
              </Text>
              <Text variant="bodySmall" style={styles.historyMetaDot}>
                •
              </Text>
                  <Text variant="bodySmall" style={styles.historyMetaLine}>
                    {depthLabel(item.desiredDepth)}
                  </Text>
              {isPinned && (
                <>
                  <Text variant="bodySmall" style={styles.historyMetaDot}>
                    •
                  </Text>
                  <Text variant="bodySmall" style={[styles.historyMetaLine, { color: palette.pin }]}>
                    Pinned
                  </Text>
                </>
              )}
              {item.status !== "completed" && (
                <>
                  <Text variant="bodySmall" style={styles.historyMetaDot}>
                    •
                  </Text>
                  <Text variant="bodySmall" style={[styles.historyMetaLine, { color: status.color }]}>
                    {statusLabel(item.status)}
                  </Text>
                </>
              )}
            </View>
          </View>
        </TouchableRipple>
      </Animated.View>
    </View>
  );
}

function HistorySheet({
  visible,
  investigation,
  loading,
  onClose,
  onRestart,
  onDelete,
}: {
  visible: boolean;
  investigation: InvestigationDetail | null;
  loading: boolean;
  onClose: () => void;
  onRestart: (investigation: InvestigationDetail) => void;
  onDelete: (id: string) => void;
}) {
  const translateY = useRef(new Animated.Value(360)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : 360,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 120) {
            onClose();
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [onClose, translateY]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheetPanel, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text variant="titleLarge" style={styles.formTitle}>
              Saved investigation
            </Text>
            <IconButton icon="close" onPress={onClose} iconColor={palette.primary} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardStack}>
            {loading ? (
              <LoadingCard text="Loading saved investigation..." />
            ) : investigation ? (
              <>
                {safeTrim(investigation.context) ? (
                  <Card mode="contained" style={styles.resultSectionCard}>
                    <Card.Content style={styles.cardStack}>
                      <Text variant="titleMedium" style={styles.linkTitle}>
                        Saved context
                      </Text>
                      <Text variant="bodyMedium" style={styles.sectionBody}>
                        {investigation.context}
                      </Text>
                    </Card.Content>
                  </Card>
                ) : null}
                <InvestigationResult investigation={investigation} />
                <View style={styles.resultActionRow}>
                  <Button mode="contained" icon="play-circle-outline" buttonColor={palette.primary} onPress={() => onRestart(investigation)}>
                    Start investigation again
                  </Button>
                  <Button mode="outlined" icon="delete-outline" textColor={palette.danger} onPress={() => onDelete(investigation.id)}>
                    Delete this investigation
                  </Button>
                </View>
              </>
            ) : (
              <EmptyState title="Nothing to show" body="That saved investigation could not be loaded right now." />
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function BottomTabs({
  activeTab,
  onSelect,
  bottomInset,
}: {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
  bottomInset: number;
}) {
  const tabs: Array<{ key: AppTab; label: string; icon: string }> = [
    { key: "home", label: "Home", icon: "home-heart" },
    { key: "consultant", label: "Consultant", icon: "doctor" },
    { key: "nutrition", label: "Nutrition", icon: "silverware-fork-knife" },
    { key: "supplements", label: "Supplements", icon: "pill" },
    { key: "profile", label: "Profile", icon: "account-circle-outline" },
  ];

  return (
    <Surface style={[styles.bottomTabs, { bottom: bottomInset }]} elevation={2}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.key;
        return (
          <TouchableRipple key={tab.key} style={[styles.bottomTabItem, selected && styles.bottomTabItemSelected]} onPress={() => onSelect(tab.key)}>
            <View style={styles.bottomTabContent}>
              <View style={[styles.bottomTabBubble, selected && styles.bottomTabBubbleSelected]}>
                <MaterialCommunityIcons name={tab.icon as MaterialIconName} size={20} color={selected ? "#FFFFFF" : palette.primary} />
              </View>
              <Text variant="labelSmall" style={[styles.bottomTabLabel, selected && styles.bottomTabLabelSelected]}>
                {tab.label}
              </Text>
            </View>
          </TouchableRipple>
        );
      })}
    </Surface>
  );
}

function VerdictPill({ verdict }: { verdict: InvestigationSummary["verdict"] | InvestigationDetail["verdict"] }) {
  const meta = verdictMeta(verdict);
  return (
    <Chip compact icon={meta.icon} style={{ backgroundColor: meta.background }} textStyle={{ color: meta.color, fontFamily: "Poppins_600SemiBold" }}>
      {meta.label}
    </Chip>
  );
}

function HistoryVerdictMark({ verdict }: { verdict: InvestigationSummary["verdict"] | InvestigationDetail["verdict"] }) {
  const meta = verdictMeta(verdict);
  return (
    <View style={[styles.historyVerdictMark, { backgroundColor: meta.background }]}>
      <MaterialCommunityIcons name={meta.icon as MaterialIconName} size={18} color={meta.color} />
    </View>
  );
}

function SignalPill({
  label,
  value,
  icon,
  color,
  background,
}: {
  label: string;
  value: string;
  icon: MaterialIconName;
  color: string;
  background: string;
}) {
  return (
    <View style={[styles.signalPill, { backgroundColor: background }]}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <View style={styles.signalPillCopy}>
        <Text variant="labelSmall" style={[styles.signalPillLabel, { color }]}>
          {label}
        </Text>
        <Text variant="titleSmall" style={styles.signalPillValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ExpandableResultSection({
  title,
  body,
  icon,
  defaultExpanded = false,
  children,
}: {
  title: string;
  body: string;
  icon: MaterialIconName;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <Card mode="contained" style={styles.resultSectionCard}>
      <Card.Content style={styles.cardStack}>
        <TouchableRipple onPress={() => setExpanded((current) => !current)} style={styles.expandableHeader}>
          <View style={styles.rowBetween}>
            <View style={styles.rowGapTop}>
              <View style={styles.expandableIconWrap}>
                <MaterialCommunityIcons name={icon} size={20} color={palette.primary} />
              </View>
              <View style={styles.flexOne}>
                <Text variant="titleMedium" style={styles.linkTitle}>
                  {title}
                </Text>
                <Text numberOfLines={expanded ? undefined : 2} variant="bodySmall" style={styles.sectionBody}>
                  {body}
                </Text>
              </View>
            </View>
            <IconButton icon={expanded ? "chevron-up" : "chevron-down"} iconColor={palette.primary} size={18} style={styles.dragButton} />
          </View>
        </TouchableRipple>
        {expanded ? <View style={styles.cardStack}>{children}</View> : null}
      </Card.Content>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text variant="labelMedium" style={styles.miniStatLabel}>
        {label}
      </Text>
      <Text variant="titleSmall" style={styles.miniStatValue}>
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="labelLarge" style={styles.eyebrow}>
        {safeUpper(eyebrow)}
      </Text>
      <Text variant="headlineSmall" style={styles.sectionTitle}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.sectionBody}>
        {body}
      </Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text variant="bodyMedium" style={styles.bulletText}>
        {text}
      </Text>
    </View>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <Card mode="contained" style={styles.loadingCard}>
      <Card.Content style={styles.loadingCardContent}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text variant="bodyMedium" style={styles.sectionBody}>
          {text}
        </Text>
      </Card.Content>
    </Card>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card mode="contained" style={styles.loadingCard}>
      <Card.Content style={styles.loadingCardContent}>
        <Avatar.Icon size={44} icon="folder-search-outline" color={palette.primary} style={styles.metricAvatar} />
        <Text variant="titleLarge" style={styles.formTitle}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={[styles.sectionBody, { textAlign: "center" }]}>
          {body}
        </Text>
      </Card.Content>
    </Card>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: palette.background,
  },
  bootScreen: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 24,
  },
  screenStack: {
    gap: 20,
  },
  headerSurface: {
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingVertical: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerTop: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerBrandWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  headerTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  headerSubtitle: {
    color: palette.muted,
    lineHeight: 22,
  },
  headerMicrocopy: {
    marginTop: 12,
    color: palette.muted,
    lineHeight: 21,
  },
  headerChip: {
    borderRadius: 999,
  },
  headerChipOkay: {
    backgroundColor: palette.successSoft,
  },
  headerChipError: {
    backgroundColor: palette.dangerSoft,
  },
  headerChipText: {
    fontFamily: "Poppins_600SemiBold",
  },
  headerChipTextOkay: {
    color: palette.success,
  },
  headerChipTextError: {
    color: palette.danger,
  },
  heroCard: {
    borderRadius: 30,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: palette.primarySoft,
  },
  heroChip: {
    alignSelf: "flex-start",
    backgroundColor: palette.surface,
  },
  heroChipText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  heroTitle: {
    color: palette.text,
    lineHeight: 40,
    fontFamily: "Poppins_700Bold",
  },
  heroBody: {
    color: palette.muted,
    lineHeight: 24,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionHeader: {
    gap: 6,
  },
  eyebrow: {
    color: palette.primary,
    letterSpacing: 0.8,
    fontFamily: "Poppins_600SemiBold",
  },
  sectionTitle: {
    color: palette.text,
    lineHeight: 34,
    fontFamily: "Poppins_700Bold",
  },
  sectionBody: {
    color: palette.muted,
    lineHeight: 23,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    width: "48%",
    minWidth: 150,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricContent: {
    gap: 8,
  },
  metricAvatar: {
    backgroundColor: palette.primarySoft,
  },
  metricValue: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  metricLabel: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  metricDetail: {
    color: palette.muted,
    lineHeight: 19,
  },
  cardStack: {
    gap: 12,
  },
  logCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logAvatar: {
    backgroundColor: palette.primarySoft,
  },
  logCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  logTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  logDetail: {
    color: palette.muted,
    lineHeight: 21,
  },
  logTime: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  linkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  linkCard: {
    flexGrow: 1,
    flexBasis: 160,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  linkTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  linkBody: {
    color: palette.muted,
    lineHeight: 20,
  },
  scenarioCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
  },
  scenarioTitle: {
    color: palette.text,
    lineHeight: 25,
    fontFamily: "Poppins_600SemiBold",
  },
  scenarioBody: {
    color: palette.muted,
    marginTop: 8,
    lineHeight: 22,
  },
  recentCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  rowGap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  rowGapTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  formCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentedCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentedButtons: {
    backgroundColor: palette.surfaceSoft,
  },
  formCardContent: {
    gap: 16,
  },
  formTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  paperInput: {
    backgroundColor: "#FFFFFF",
  },
  inputOutline: {
    borderRadius: 18,
  },
  inputContent: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: palette.text,
    lineHeight: 22,
  },
  multilineInput: {
    minHeight: 110,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  segmentChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.border,
  },
  depthHint: {
    color: palette.muted,
    lineHeight: 20,
  },
  agentGrid: {
    gap: 12,
  },
  agentCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  agentCardContent: {
    gap: 8,
  },
  agentTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  agentBody: {
    color: palette.muted,
    lineHeight: 20,
  },
  processingCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  progressChip: {
    backgroundColor: palette.primarySoft,
  },
  progressChipText: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepAvatar: {
    backgroundColor: palette.primarySoft,
  },
  stepTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  stepBody: {
    color: palette.muted,
    lineHeight: 20,
  },
  miniChipText: {
    fontFamily: "Poppins_600SemiBold",
  },
  eventRow: {
    borderRadius: 18,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
    gap: 6,
  },
  eventMeta: {
    color: palette.primary,
    fontFamily: "Poppins_500Medium",
  },
  eventBody: {
    color: palette.muted,
    lineHeight: 21,
  },
  resultHero: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  resultTitle: {
    color: palette.text,
    lineHeight: 34,
    fontFamily: "Poppins_700Bold",
  },
  resultBody: {
    color: palette.muted,
    lineHeight: 23,
  },
  resultMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  resultSignalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  scoreGuideText: {
    color: palette.muted,
    lineHeight: 20,
  },
  miniStat: {
    flexGrow: 1,
    flexBasis: 105,
    borderRadius: 18,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  miniStatLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
  },
  miniStatValue: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  resultSectionCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  expandableHeader: {
    borderRadius: 18,
  },
  expandableIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  signalPill: {
    flexGrow: 1,
    flexBasis: 106,
    minWidth: 96,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  signalPillCopy: {
    minWidth: 0,
    flex: 1,
  },
  signalPillLabel: {
    fontFamily: "Poppins_600SemiBold",
  },
  signalPillValue: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  evidenceCard: {
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  evidenceTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  evidenceUrl: {
    color: palette.primary,
    textDecorationLine: "underline",
    lineHeight: 20,
  },
  quoteBox: {
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quoteText: {
    color: palette.text,
    lineHeight: 22,
  },
  quoteLabel: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 8,
  },
  evidenceBody: {
    color: palette.muted,
    lineHeight: 20,
  },
  resultActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    color: palette.muted,
    lineHeight: 22,
  },
  filterCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchbar: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchbarInput: {
    fontFamily: "Poppins_400Regular",
  },
  chipRow: {
    gap: 10,
    paddingRight: 12,
    paddingBottom: 2,
  },
  historySwipeShell: {
    position: "relative",
  },
  historyRails: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    borderRadius: 24,
    overflow: "hidden",
  },
  pinRail: {
    flex: 1,
    backgroundColor: palette.pinSoft,
    justifyContent: "center",
    paddingLeft: 18,
  },
  deleteRail: {
    flex: 1,
    backgroundColor: palette.dangerSoft,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 18,
  },
  pinRailAvatar: {
    backgroundColor: "#FFF7DB",
  },
  deleteRailAvatar: {
    backgroundColor: "#FFF6F6",
  },
  historyCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
  },
  historyCardPinned: {
    borderColor: "#E2C46C",
    backgroundColor: "#FFFBEF",
  },
  dragButton: {
    margin: 0,
  },
  dragButtonActive: {
    backgroundColor: palette.primarySoft,
  },
  historyHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  historyVerdictMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  historyClaim: {
    flex: 1,
    minWidth: 0,
    color: palette.text,
    lineHeight: 25,
    fontFamily: "Poppins_600SemiBold",
  },
  historySummary: {
    color: palette.muted,
    lineHeight: 22,
  },
  dragModeHint: {
    color: palette.primary,
    lineHeight: 19,
    fontFamily: "Poppins_500Medium",
  },
  historyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  historyMetaLine: {
    color: palette.muted,
    lineHeight: 18,
  },
  historyMetaDot: {
    color: palette.muted,
  },
  loadingCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  loadingCardContent: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 21, 28, 0.28)",
    justifyContent: "flex-end",
  },
  sheetPanel: {
    maxHeight: "86%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  bottomTabs: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bottomTabItem: {
    flex: 1,
    borderRadius: 20,
  },
  bottomTabItemSelected: {
    backgroundColor: palette.primarySoft,
  },
  bottomTabContent: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  bottomTabBubble: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
  },
  bottomTabBubbleSelected: {
    backgroundColor: palette.primary,
  },
  bottomTabAvatar: {
    backgroundColor: "transparent",
  },
  bottomTabAvatarSelected: {
    backgroundColor: "transparent",
  },
  bottomTabLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
  },
  bottomTabLabelSelected: {
    color: palette.primary,
  },
  snackbar: {
    backgroundColor: palette.text,
    bottom: 116,
  },
  scoreChip: {
    backgroundColor: palette.primarySoft,
  },
  scoreChipText: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
  },
});
