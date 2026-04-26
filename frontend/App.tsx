import React, { useEffect, useMemo, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeModules,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
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
  type SourceQualityLabel,
  type SingaporeAuthorityReview,
} from "./src/data";
import AppBootScreen, { AppStartupCard } from "./src/components/shared/AppBootScreen";
import { addNotificationResponseListener, getLastNotificationResponseUrl, notificationsSupportedInCurrentShell, parseInvestigationUrl, registerForPushNotificationsAsync } from "./src/notifications";
import DietPage from "./src/pages/DietPage";
import ActivityPage from "./src/pages/ActivityPage";
import ProfilePage from "./src/pages/ProfilePage";
import HomeDashboardPage from "./src/pages/HomeDashboardPage";
import ConsultantPage from "./src/pages/ConsultantPage";
import TutorialSheet from "./src/components/shared/TutorialSheet";
import OnboardingSheet from "./src/components/profile/OnboardingSheet";
import { BottomTabs, Header, ToolHeader } from "./src/components/app/AppChrome";
import HistorySheet from "./src/components/consultant/HistorySheet";
import type { ClaimSuggestionCollection, ConsultantView, HistoryFilter, HistorySort, InvestigationComparison, LocalHealthGuard, MaterialIconName, ProfileView, ReviewDepth, SnackbarAction } from "./src/components/consultant/types";
import { getActiveSessionAccount, loginOrRegisterAccount, logoutActiveSession, signInWithGoogleAccount, subscribeToActiveSession } from "./src/storage/accountStorage";
import { loadProfile, profileNeedsOnboarding } from "./src/storage/profileStorage";
import { formatDisplayDateTime } from "./src/utils/dateTime";

const BASE_SCREEN_WIDTH = 390;
const CONSULTANT_TUTORIAL_PAGES = [
  {
    title: "Start with the claim",
    body: "Enter the health claim you want checked. Keep it close to the wording you actually saw so the review can test the wording risk properly.",
  },
  {
    title: "Add context only when needed",
    body: "Optional context helps when the claim depends on a population, source, or scope. If it does not change what counts as relevant evidence, you can leave it blank.",
  },
  {
    title: "Choose the depth",
    body: "Quick gives you a fast pass, standard gives you a fuller review, and deep aims for the broadest source sweep with stronger cross-checking.",
  },
  {
    title: "Read in layers",
    body: "Start with the conclusion and key details, then open the evidence, workflow, and full source log only when you want the deeper trail.",
  },
];

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createPaperTheme(typeScale: number) {
  const scaled = (fontSize: number, lineHeight?: number) => ({
    fontSize: Math.round(fontSize * typeScale),
    lineHeight: Math.round((lineHeight ?? fontSize * 1.35) * typeScale),
  });

  return {
    ...MD3LightTheme,
    roundness: 18,
    colors: {
      ...MD3LightTheme.colors,
      primary: palette.primary,
      onPrimary: "#FFFFFF",
      primaryContainer: palette.primarySoft,
      onPrimaryContainer: palette.primary,
      secondary: palette.secondary,
      onSecondary: "#FFFFFF",
      secondaryContainer: palette.surfaceSoft,
      onSecondaryContainer: palette.primary,
      tertiary: palette.primary,
      onTertiary: "#FFFFFF",
      tertiaryContainer: palette.primarySoft,
      onTertiaryContainer: palette.primary,
      background: palette.background,
      surface: palette.surface,
      surfaceVariant: palette.surfaceSoft,
      outline: palette.border,
      outlineVariant: "rgba(16, 24, 40, 0.04)",
      error: palette.danger,
      onSurface: palette.text,
      onSurfaceVariant: palette.muted,
      surfaceDisabled: "#F1F3EE",
      onSurfaceDisabled: "#98A2B3",
      backdrop: "rgba(16, 24, 40, 0.12)",
      elevation: {
        ...MD3LightTheme.colors.elevation,
        level1: "#FCFCFA",
        level2: "#FAFBF8",
        level3: "#F7F8F5",
        level4: "#F3F5F1",
        level5: "#EFF2ED",
      },
    },
    fonts: {
      ...MD3LightTheme.fonts,
      headlineSmall: { ...MD3LightTheme.fonts.headlineSmall, ...scaled(28, 36), fontFamily: "Poppins_700Bold", letterSpacing: -0.4 },
      headlineMedium: { ...MD3LightTheme.fonts.headlineMedium, ...scaled(32, 40), fontFamily: "Poppins_700Bold", letterSpacing: -0.5 },
      titleLarge: { ...MD3LightTheme.fonts.titleLarge, ...scaled(21, 29), fontFamily: "Poppins_600SemiBold", letterSpacing: -0.15 },
      titleMedium: { ...MD3LightTheme.fonts.titleMedium, ...scaled(17, 24), fontFamily: "Poppins_600SemiBold", letterSpacing: -0.1 },
      titleSmall: { ...MD3LightTheme.fonts.titleSmall, ...scaled(15, 22), fontFamily: "Poppins_600SemiBold" },
      bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, ...scaled(16, 24), fontFamily: "Poppins_400Regular" },
      bodyMedium: { ...MD3LightTheme.fonts.bodyMedium, ...scaled(15, 22), fontFamily: "Poppins_400Regular" },
      bodySmall: { ...MD3LightTheme.fonts.bodySmall, ...scaled(13, 19), fontFamily: "Poppins_400Regular" },
      labelLarge: { ...MD3LightTheme.fonts.labelLarge, ...scaled(14, 18), fontFamily: "Poppins_600SemiBold" },
      labelMedium: { ...MD3LightTheme.fonts.labelMedium, ...scaled(12, 16), fontFamily: "Poppins_500Medium" },
    },
  };
}

const dashboardMetrics = [
  { label: "Heart rate", value: "68 bpm", detail: "Resting average", icon: "heart-pulse" },
  { label: "Sleep", value: "7h 42m", detail: "Last night", icon: "sleep" },
  { label: "Activity", value: "8,420", detail: "Steps today", icon: "walk" },
  { label: "Hydration", value: "2.1 L", detail: "Water intake", icon: "cup-water" },
];

const consultantChecks = [
  "Frame the exact claim first, including wording risk, entities, and whether it behaves like a causal promise.",
  "Search for support, contradiction, authority guidance, and hoax-style mismatch instead of only supportive material.",
  "Drop dead links, off-topic pages, fragile citations, and quotes that do not match accessible source text.",
  "Have multiple models challenge the evidence set, then audit those model opinions before writing the final explanation.",
];

const profileSections = [
  {
    title: "Current health focus",
    body: "Sleep quality, steady daytime energy, skin stability, hydration, and realistic routines that can hold up during busy weeks.",
  },
  {
    title: "Conditions and background",
    body: "Mild seasonal allergies, intermittent eczema flares, and a family history of hypertension, with no known diabetes or established cardiovascular disease.",
  },
  {
    title: "Medications and supplements",
    body: "Cetirizine as needed, Vitamin D3 daily, Omega-3 daily, and magnesium glycinate occasionally before bed.",
  },
  {
    title: "Nutrition rhythm",
    body: "Protein-forward breakfast, balanced lunch, fruit or nuts in the afternoon, and a hydration goal of about 2.2 liters on most days.",
  },
  {
    title: "Sleep and recovery",
    body: "Bedtime target around 11 PM, wind-down routine from 10:15 PM, and one lighter recovery day after higher-activity sessions.",
  },
  {
    title: "Movement routine",
    body: "Walking most days, Pilates twice weekly, and light strength work twice weekly to support energy and recovery.",
  },
  {
    title: "Care preferences",
    body: "Prefers evidence-based guidance, low-friction routines, lower caffeine after lunch, and plans that fit a busy weekday schedule.",
  },
  {
    title: "Alerts and support",
    body: "No known drug allergies. Seasonal allergy tracking is on, and eczema flare notes are logged during higher-stress weeks.",
  },
];

const NON_ENGLISH_BLOCK_RE = /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

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

function formatTimestamp(value: string) {
  return formatDisplayDateTime(value);
}

function depthLabel(depth: ReviewDepth) {
  if (depth === "quick") {
    return "Quick";
  }
  if (depth === "deep") {
    return "Deep";
  }
  return "Standard";
}

function depthDescription(depth: ReviewDepth) {
  if (depth === "quick") {
    return "Fast pass with tighter source calibration, usually landing around 30 to 50 analyzed sources while still keeping contradiction coverage visible.";
  }
  if (depth === "deep") {
    return "Most thorough pass with wider retrieval, more contradiction hunting, and the deepest AI cross-checking, usually keeping 100+ analyzed sources.";
  }
  return "Balanced coverage with broader retrieval plus fuller AI checking, usually landing around 70 to 84 analyzed sources.";
}

function depthTargetWindow(depth: ReviewDepth) {
  if (depth === "quick") {
    return "30 to 50";
  }
  if (depth === "deep") {
    return "100+";
  }
  return "70 to 84";
}

function scoreBandLabel(score: number | null | undefined, verdict?: InvestigationSummary["verdict"] | InvestigationDetail["verdict"] | null) {
  if (verdict === "trustworthy") {
    return "Valid claim";
  }
  if (verdict === "untrustworthy") {
    return "Invalid claim";
  }
  if (verdict === "mixed" || verdict === "overstated") {
    return "Unsure claim";
  }
  if (typeof score !== "number") {
    return "Pending";
  }
  if (score >= 74) {
    return "Valid claim";
  }
  if (score <= 34) {
    return "Invalid claim";
  }
  return "Unsure claim";
}

function scoreTone(
  score: number | null | undefined,
  verdict?: InvestigationSummary["verdict"] | InvestigationDetail["verdict"] | null
) {
  if (verdict === "trustworthy") {
    return { color: palette.success, background: palette.successSoft };
  }
  if (verdict === "untrustworthy") {
    return { color: palette.danger, background: palette.dangerSoft };
  }
  if (verdict === "mixed" || verdict === "overstated") {
    return { color: palette.info, background: palette.infoSoft };
  }
  if (typeof score !== "number") {
    return { color: palette.muted, background: palette.surfaceSoft };
  }
  if (score >= 74) {
    return { color: palette.success, background: palette.successSoft };
  }
  if (score <= 34) {
    return { color: palette.danger, background: palette.dangerSoft };
  }
  return { color: palette.info, background: palette.infoSoft };
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

  const preferredScheme =
    process.env.NODE_ENV === "production" || (Platform.OS === "web" && globalThis.location?.protocol === "https:")
      ? "https"
      : "http";
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `${preferredScheme}://${trimmed}`;
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
  const isProduction = process.env.NODE_ENV === "production";
  const webHostname = Platform.OS === "web" ? globalThis.location?.hostname : null;
  const isLocalHostname =
    !webHostname ||
    webHostname === "localhost" ||
    webHostname === "127.0.0.1" ||
    webHostname.endsWith(".local");

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

  // In production, only use the explicitly configured base URL (Render, HTTPS).
  // Dev builds can fall back to Metro/localhost candidates.
  addCandidate(process.env.EXPO_PUBLIC_API_BASE_URL);

  if (!isProduction) {
    addCandidate(currentUrl);

    const host = metroHost();
    if (host) {
      addCandidate(`${host}:8000`);
    }

    for (const candidate of parseCandidateEnv(process.env.EXPO_PUBLIC_API_CANDIDATES)) {
      addCandidate(candidate);
    }

    if (Platform.OS === "web" && webHostname && isLocalHostname) {
      addCandidate(`${webHostname}:8000`);
    }

    if (Platform.OS === "android") {
      addCandidate("10.0.2.2:8000");
    }
    addCandidate("127.0.0.1:8000");
    addCandidate("localhost:8000");
  }
  return candidates;
}

function resolveApiBaseUrl() {
  const isProduction = process.env.NODE_ENV === "production";
  const fallback = isProduction ? "" : "http://127.0.0.1:8000";
  return buildApiBaseUrls()[0] || fallback;
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
    return { label: "Valid claim", icon: "check-circle", color: palette.success, background: palette.successSoft };
  }
  if (verdict === "untrustworthy") {
    return { label: "Invalid claim", icon: "close-circle", color: palette.danger, background: palette.dangerSoft };
  }
  if (verdict === "overstated") {
    return { label: "Needs nuance", icon: "alert-circle", color: palette.info, background: palette.infoSoft };
  }
  return { label: "Unsure", icon: "help-circle", color: palette.info, background: palette.infoSoft };
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
    return "Support";
  }
  if (source.sentiment === "negative") {
    return "Contradict";
  }
  return "Mixed";
}

function stageIcon(step: PipelineStepSummary) {
  const key = safeLower(step?.key);
  if (key.includes("brief")) return "shield-star-outline";
  if (key.includes("nlp")) return "brain";
  if (key.includes("claim")) return "stethoscope";
  if (key.includes("query")) return "graph-outline";
  if (key.includes("retriev") || key.includes("search")) return "magnify-scan";
  if (key.includes("link") || key.includes("valid")) return "shield-search";
  if (key.includes("credib")) return "shield-check-outline";
  if (key.includes("relevance")) return "filter-check-outline";
  if (key.includes("citation") || key.includes("study")) return "book-open-page-variant-outline";
  if (key.includes("quote") || key.includes("sentiment")) return "format-quote-close";
  if (key.includes("singapore")) return "map-marker-radius-outline";
  if (key.includes("hoax")) return "alert-decagram-outline";
  if (key.includes("decision")) return "scale-balance";
  if (key.includes("cross") || key.includes("panel") || key.includes("model")) return "account-group-outline";
  if (key.includes("final")) return "check-decagram";
  return "chart-timeline-variant";
}

function splitWorkflowTitle(title: string) {
  const parts = title.split("·").map((item) => safeTrim(item)).filter(Boolean);
  return {
    purpose: parts[0] || title,
    role: parts[1] || "",
  };
}

function sourceQualityMeta(label: SourceQualityLabel) {
  if (label === "verified") {
    return { label: "Verified", color: palette.success, background: palette.successSoft, icon: "shield-check" };
  }
  if (label === "established") {
    return { label: "Established", color: palette.warning, background: palette.warningSoft, icon: "domain" };
  }
  return { label: "General", color: palette.muted, background: palette.surfaceSoft, icon: "earth" };
}

function sourceAccessMeta(source: SourceAssessment) {
  if (source.directEvidenceEligible) {
    return { label: "Validated evidence", color: palette.success, background: palette.successSoft };
  }
  if (source.cacheStatus === "fallback") {
    return { label: "Limited access", color: palette.warning, background: palette.warningSoft };
  }
  if (source.cacheStatus === "cached") {
    return { label: "Cached live fetch", color: palette.primary, background: palette.primarySoft };
  }
  return { label: "Live page", color: palette.success, background: palette.successSoft };
}

function sourceDisplayUrl(source: SourceAssessment) {
  return safeTrim(source.evidenceUrl) || safeTrim(source.resolvedUrl) || safeTrim(source.discoveredUrl) || source.url;
}

function riskTone(level: "low" | "moderate" | "high" | null | undefined) {
  if (level === "high") {
    return { color: palette.danger, background: palette.dangerSoft, icon: "alert-circle" };
  }
  if (level === "moderate") {
    return { color: palette.warning, background: palette.warningSoft, icon: "alert" };
  }
  return { color: palette.success, background: palette.successSoft, icon: "shield-check" };
}

function singaporeAgreementMeta(label: SingaporeAuthorityReview["agreementLabel"] | null | undefined) {
  if (label === "supportive") {
    return { label: "Singapore sources support", color: palette.success, background: palette.successSoft, icon: "check-circle" };
  }
  if (label === "contradictory") {
    return { label: "Singapore sources push back", color: palette.danger, background: palette.dangerSoft, icon: "close-circle" };
  }
  if (label === "mixed") {
    return { label: "Singapore sources are mixed", color: palette.warning, background: palette.warningSoft, icon: "help-circle" };
  }
  return { label: "Singapore sources insufficient", color: palette.muted, background: palette.surfaceSoft, icon: "minus-circle-outline" };
}

function quoteStanceMeta(stance: SourceAssessment["quoteStance"]) {
  if (stance === "supportive") {
    return { label: "Quote supports", color: palette.success, background: palette.successSoft };
  }
  if (stance === "unsupportive") {
    return { label: "Quote weakens", color: palette.danger, background: palette.dangerSoft };
  }
  return { label: "Quote uncertain", color: palette.warning, background: palette.warningSoft };
}

function providerLabel(provider: "openai" | "claude" | "gemini" | "xai" | "deepseek") {
  if (provider === "openai") return "OpenAI";
  if (provider === "claude") return "Claude";
  if (provider === "gemini") return "Gemini";
  if (provider === "xai") return "Grok";
  return "DeepSeek";
}

function historySortLabel(sort: HistorySort) {
  if (sort === "manual") {
    return "Custom Order";
  }
  if (sort === "oldest") {
    return "Oldest First";
  }
  if (sort === "lowestScore") {
    return "Lowest Score";
  }
  if (sort === "score") {
    return "Highest Score";
  }
  return "Newest First";
}

const HEALTH_KEYWORDS = [
  "health",
  "healthy",
  "wellness",
  "wellbeing",
  "medical",
  "medicine",
  "doctor",
  "clinical",
  "hospital",
  "research",
  "study",
  "sleep",
  "insomnia",
  "eczema",
  "supplement",
  "nutrition",
  "diet",
  "mental",
  "anxiety",
  "depression",
  "virus",
  "vaccine",
  "disease",
  "symptom",
  "treatment",
  "therapy",
  "cancer",
  "clinic",
  "cholesterol",
  "diabetes",
  "blood",
  "heart",
  "brain",
  "skin",
  "weight",
];

const NON_HEALTH_KEYWORDS = [
  "movie",
  "movies",
  "film",
  "series",
  "tv",
  "anime",
  "stock",
  "crypto",
  "bitcoin",
  "restaurant",
  "travel",
  "vacation",
  "game",
  "games",
  "football",
  "soccer",
  "basketball",
  "song",
  "music",
  "celebrity",
];

function assessHealthClaimLocally(claim: string, context = ""): LocalHealthGuard {
  const haystack = safeLower(`${claim} ${context}`);
  if (!safeTrim(haystack)) {
    return { allowed: true, title: "", body: "" };
  }
  const englishProbe = `${claim} ${context}`;
  const asciiLetters = (englishProbe.match(/[A-Za-z]/g) || []).length;
  const blockedScriptChars = (englishProbe.match(NON_ENGLISH_BLOCK_RE) || []).length;
  if (blockedScriptChars >= 2 && asciiLetters < Math.max(8, blockedScriptChars * 3)) {
    return {
      allowed: false,
      title: "English claims only for now",
      body: "GramWIN is temporarily limited to English health claims while the multilingual pipeline is being tightened. The run is paused and no evidence APIs will be called for this query.",
    };
  }
  if (HEALTH_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return { allowed: true, title: "", body: "" };
  }
  if (NON_HEALTH_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return {
      allowed: false,
      title: "This looks outside GramWIN's scope",
      body: "GramWIN only runs health, medicine, wellness, clinical, and research-related investigations. The run is paused and no evidence APIs will be called for this query.",
    };
  }
  return { allowed: true, title: "", body: "" };
}

function formatClaimForDisplay(claim: string) {
  const trimmed = safeTrim(claim);
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed
    .replace(/\bcovid\b/gi, "COVID")
    .replace(/\badhd\b/gi, "ADHD")
    .replace(/\bptsd\b/gi, "PTSD")
    .replace(/\bssri\b/gi, "SSRI")
    .replace(/\bsg\b/g, "SG");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function recencyBucket(publishedAt: string | null | undefined) {
  if (!safeTrim(publishedAt)) {
    return "undated";
  }
  const timestamp = new Date(safeTrim(publishedAt)).getTime();
  if (Number.isNaN(timestamp)) {
    return "undated";
  }
  const ageDays = Math.round((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  return ageDays <= 730 ? "recent" : "established";
}

function evidenceTierLabel(source: SourceAssessment) {
  return source.evidenceTier.replace("_", " ");
}

function normalizedClaimKey(claim: string) {
  return safeLower(claim).replace(/\s+/g, " ").trim();
}

function claimComparisonSimilarity(left: string, right: string) {
  const leftKey = normalizedClaimKey(left);
  const rightKey = normalizedClaimKey(right);
  if (leftKey === rightKey) {
    return 100;
  }
  const tokenize = (value: string) =>
    new Set(
      normalizedClaimKey(value)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2 && !["the", "and", "for", "with", "from", "that"].includes(token))
    );
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  return Math.round((overlap / union) * 100);
}

function canCompareClaims(left: InvestigationSummary, right: InvestigationSummary) {
  const similarity = claimComparisonSimilarity(left.claim, right.claim);
  const leftDomain = safeLower(left.truthClassification);
  const rightDomain = safeLower(right.truthClassification);
  const sameNature = normalizedClaimKey(left.claim) === normalizedClaimKey(right.claim) || similarity >= 55 || leftDomain === rightDomain;
  return { allowed: sameNature, similarity };
}

function statusIcon(status: PipelineStepSummary["status"] | InvestigationStatus) {
  if (status === "completed") {
    return { icon: "check-circle", color: palette.success };
  }
  if (status === "cancelled") {
    return { icon: "stop-circle", color: palette.warning };
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
  if (status === "cancelled") return "Stopped";
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
  const { width } = useWindowDimensions();
  const typeScale = clampNumber(width / BASE_SCREEN_WIDTH, 0.94, 1.12);
  const theme = useMemo(() => createPaperTheme(typeScale), [typeScale]);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return <AppBootScreen subtitle="Loading your health workspace" detail="Syncing typography, theme, and app shell." />;
  }

  return (
    <PaperProvider theme={theme}>
      <GramwinApp />
    </PaperProvider>
  );
}

function GramwinApp() {
  const insets = useSafeAreaInsets();
  const [apiBaseUrl, setApiBaseUrl] = useState(resolveApiBaseUrl);
  const [activeAccount, setActiveAccount] = useState<{ id: string; email: string; createdAt?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; action?: SnackbarAction }>({
    visible: false,
    message: "",
  });
  const [reconnecting, setReconnecting] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [consultantView, setConsultantView] = useState<ConsultantView>("investigate");
  const [profileView, setProfileView] = useState<ProfileView>("overview");
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingCheckResolved, setOnboardingCheckResolved] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload>(defaultBootstrap);
  const [history, setHistory] = useState<InvestigationSummary[]>([]);
  const [historyOrder, setHistoryOrder] = useState<string[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<InvestigationComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [claimSuggestions, setClaimSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [cancellingIds, setCancellingIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [liveInvestigation, setLiveInvestigation] = useState<InvestigationDetail | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySort, setHistorySort] = useState<HistorySort>("recent");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historySheetDetail, setHistorySheetDetail] = useState<InvestigationDetail | null>(null);
  const [historySheetVisible, setHistorySheetVisible] = useState(false);
  const [historySheetLoading, setHistorySheetLoading] = useState(false);
  const [consultantTutorialVisible, setConsultantTutorialVisible] = useState(false);
  const [dietGuideSignal, setDietGuideSignal] = useState(0);
  const [activityGuideSignal, setActivityGuideSignal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimDraft, setClaimDraft] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [claimSourceDraft, setClaimSourceDraft] = useState("");
  const [populationDraft, setPopulationDraft] = useState("");
  const [focusDraft, setFocusDraft] = useState("");
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [depth, setDepth] = useState<ReviewDepth>("deep");
  const onboardingPromptedRef = useRef<string>("");
  const pendingDeleteRef = useRef<{
    item: InvestigationSummary;
    index: number;
    pinned: boolean;
    compared: boolean;
    liveInvestigation: InvestigationDetail | null;
    historySheetDetail: InvestigationDetail | null;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    void warmApiConnection();
    void loadBootstrap();
    void loadHistory();
    if (notificationsSupportedInCurrentShell()) {
      void registerNotifications();
    }
    void hydrateInitialNotificationTarget();

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void openInvestigationFromUrl(url);
    });
    const notificationSubscription = addNotificationResponseListener((url) => {
      void openInvestigationFromUrl(url);
    });

    return () => {
      linkSubscription.remove();
      notificationSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void getActiveSessionAccount()
      .then((account) => {
        if (mounted) {
          setActiveAccount(account);
        }
      })
      .catch(() => {
        if (mounted) {
          setActiveAccount(null);
        }
      });

    const unsubscribe = subscribeToActiveSession((account: { id: string; email: string; createdAt?: string } | null) => {
      setActiveAccount(account);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    setOnboardingCheckResolved(false);
    const key = activeAccount?.id || "guest";
    if (onboardingPromptedRef.current === key) {
      setOnboardingCheckResolved(true);
      return;
    }
    onboardingPromptedRef.current = key;
    void (async () => {
      try {
        const profile = await loadProfile(activeAccount?.id, activeAccount?.email);
        if (profileNeedsOnboarding(profile)) {
          setSnackbar({
            visible: true,
            message: "Set up your profile to personalise diet, supplements, and activity insights.",
            action: "setupProfile",
          });
        }
      } catch {
        // Ignore onboarding prompt failures.
      } finally {
        setOnboardingCheckResolved(true);
      }
    })();
  }, [activeAccount]);

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

  async function handleAuthenticate(email: string, password: string) {
    setAuthLoading(true);
    try {
      const account = await loginOrRegisterAccount(email, password);
      setActiveAccount(account);
      setSnackbar({ visible: true, message: "Account connected" });
      return account;
    } catch (error) {
      setSnackbar({ visible: true, message: error instanceof Error ? error.message : "Could not sign in" });
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleAuthenticate() {
    setAuthLoading(true);
    try {
      const account = await signInWithGoogleAccount();
      setActiveAccount(account);
      setSnackbar({ visible: true, message: "Google account connected" });
    } catch (error) {
      setSnackbar({ visible: true, message: error instanceof Error ? error.message : "Could not sign in with Google" });
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setAuthLoading(true);
    try {
      await logoutActiveSession();
      setActiveAccount(null);
      setSnackbar({ visible: true, message: "Signed out" });
    } catch (error) {
      setSnackbar({ visible: true, message: error instanceof Error ? error.message : "Could not sign out" });
    } finally {
      setAuthLoading(false);
    }
  }

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
        return item.verdict === "trustworthy";
      }
      if (historyFilter === "untrustworthy") {
        return item.verdict === "untrustworthy";
      }
      if (historyFilter === "uncertain") {
        return item.verdict !== "trustworthy" && item.verdict !== "untrustworthy";
      }
      if (historyFilter === "running") {
        return isRunning(item.status);
      }
      if (historyFilter === "completed") {
        return item.status === "completed";
      }
      if (historyFilter === "deep") {
        return item.desiredDepth === "deep";
      }
      if (historyFilter === "highConfidence") {
        return item.confidenceLevel === "high";
      }
      return true;
    });

    items = items.slice().sort((a, b) => {
      if (historySort !== "manual") {
        const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
        const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
        if (aPinned !== bPinned) {
          return bPinned - aPinned;
        }
      }
      if (historySort === "recent") {
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      }
      if (historySort === "oldest") {
        return new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime();
      }
      if (historySort === "score") {
        return (b.overallScore ?? -1) - (a.overallScore ?? -1);
      }
      if (historySort === "lowestScore") {
        return (a.overallScore ?? Number.MAX_SAFE_INTEGER) - (b.overallScore ?? Number.MAX_SAFE_INTEGER);
      }
      const aIndex = historyOrder.indexOf(a.id);
      const bIndex = historyOrder.indexOf(b.id);
      const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return safeA - safeB;
    });

    return items;
  }, [history, historyQuery, historySort, historyFilter, historyOrder, pinnedIds]);

  const comparisonItems = useMemo(
    () => comparisonIds.map((id) => history.find((item) => item.id === id)).filter(Boolean) as InvestigationSummary[],
    [comparisonIds, history]
  );
  const localHealthGuard = useMemo(
    () =>
      assessHealthClaimLocally(
        claimDraft,
        composeInvestigationContext({
          notes: contextDraft,
          sourceContext: claimSourceDraft,
          population: populationDraft,
          focus: focusDraft,
        })
      ),
    [claimDraft, claimSourceDraft, contextDraft, focusDraft, populationDraft]
  );

  useEffect(() => {
    setComparisonResult(null);
  }, [comparisonIds]);

  useEffect(() => {
    const query = safeTrim(claimDraft);
    if (query.length < 2 || !localHealthGuard.allowed) {
      setClaimSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      setSuggestionsLoading(true);
      void (async () => {
        try {
          const response = await requestApi(`/api/claim-suggestions?q=${encodeURIComponent(query)}`, undefined, 3500);
          if (!response.ok) {
            throw new Error("Suggestion request failed");
          }
          const payload = (await response.json()) as ClaimSuggestionCollection;
          setClaimSuggestions(payload.items ?? []);
        } catch {
          setClaimSuggestions([]);
        } finally {
          setSuggestionsLoading(false);
        }
      })();
    }, 280);

    return () => clearTimeout(handle);
  }, [claimDraft, localHealthGuard.allowed]);

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

  async function registerNotifications() {
    await registerForPushNotificationsAsync(requestApi);
  }

  async function openInvestigationFromUrl(url: string | null | undefined) {
    const investigationId = parseInvestigationUrl(url);
    if (!investigationId) {
      return;
    }
    setActiveTab("consultant");
    setConsultantView("history");
    await openHistorySheet(investigationId);
  }

  async function hydrateInitialNotificationTarget() {
    try {
      if (Platform.OS !== "web" && notificationsSupportedInCurrentShell()) {
        const notificationUrl = await getLastNotificationResponseUrl();
        if (notificationUrl) {
          await openInvestigationFromUrl(notificationUrl);
          return;
        }
      }
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await openInvestigationFromUrl(initialUrl);
      }
    } catch {
      // Ignore deep-link hydration failures so boot can continue quietly.
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
      setComparisonIds((current) => current.filter((id) => payload.items.some((item) => item.id === id)));
    } catch {
      if (showSpinner) {
        setHistory([]);
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
      setHistorySheetVisible(false);
      setHistorySheetDetail(null);
      setLiveInvestigation(null);
      setConsultantView("investigate");
      setActiveTab("consultant");
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
    if (!localHealthGuard.allowed) {
      setSnackbar({ visible: true, message: "This query is outside GramWIN's health scope." });
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
    setClaimDraft(safeTrim(investigation.claim));
    setContextDraft(safeTrim(investigation.context));
    setClaimSourceDraft("");
    setPopulationDraft("");
    setFocusDraft("");
    setSourceUrlDraft("");
    setDepth(investigation.desiredDepth);
    setConsultantView("investigate");
    setActiveTab("consultant");
    setHistorySheetVisible(false);
    setSnackbar({ visible: true, message: "Claim loaded into the investigation form" });
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

  async function commitPendingDeletion() {
    const pending = pendingDeleteRef.current;
    if (!pending) {
      return;
    }
    pendingDeleteRef.current = null;
    try {
      const response = await requestApi(`/api/investigations/${pending.item.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Delete failed."));
      }
    } catch {
      setHistory((current) => {
        const next = [...current];
        next.splice(Math.min(pending.index, next.length), 0, pending.item);
        return next;
      });
      setHistoryOrder((current) => {
        const next = current.filter((itemId) => itemId !== pending.item.id);
        next.splice(Math.min(pending.index, next.length), 0, pending.item.id);
        return next;
      });
      if (pending.pinned) {
        setPinnedIds((current) => (current.includes(pending.item.id) ? current : [pending.item.id, ...current]));
      }
      if (pending.compared) {
        setComparisonIds((current) => (current.includes(pending.item.id) ? current : [...current, pending.item.id].slice(-2)));
      }
      if (pending.liveInvestigation) {
        setLiveInvestigation(pending.liveInvestigation);
      }
      if (pending.historySheetDetail) {
        setHistorySheetDetail(pending.historySheetDetail);
        setHistorySheetVisible(true);
      }
      setSnackbar({ visible: true, message: "Delete failed" });
    }
  }

  function undoDeleteHistoryItem() {
    const pending = pendingDeleteRef.current;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setHistory((current) => {
      const next = [...current];
      next.splice(Math.min(pending.index, next.length), 0, pending.item);
      return next;
    });
    setHistoryOrder((current) => {
      const next = current.filter((itemId) => itemId !== pending.item.id);
      next.splice(Math.min(pending.index, next.length), 0, pending.item.id);
      return next;
    });
    if (pending.pinned) {
      setPinnedIds((current) => (current.includes(pending.item.id) ? current : [pending.item.id, ...current]));
    }
    if (pending.compared) {
      setComparisonIds((current) => (current.includes(pending.item.id) ? current : [...current, pending.item.id].slice(-2)));
    }
    if (pending.liveInvestigation) {
      setLiveInvestigation(pending.liveInvestigation);
    }
    if (pending.historySheetDetail) {
      setHistorySheetDetail(pending.historySheetDetail);
      setHistorySheetVisible(true);
    }
    setSnackbar({ visible: true, message: "Deletion undone" });
  }

  async function deleteHistoryItem(id: string) {
    const target = history.find((item) => item.id === id);
    if (!target) {
      return;
    }
    await commitPendingDeletion();
    const nextIndex = history.findIndex((item) => item.id === id);
    const pending = {
      item: target,
      index: nextIndex === -1 ? history.length : nextIndex,
      pinned: pinnedIds.includes(id),
      compared: comparisonIds.includes(id),
      liveInvestigation: liveInvestigation?.id === id ? liveInvestigation : null,
      historySheetDetail: historySheetDetail?.id === id ? historySheetDetail : null,
      timer: setTimeout(() => {
        void commitPendingDeletion();
      }, 4500),
    };
    pendingDeleteRef.current = pending;
    setHistory((current) => current.filter((item) => item.id !== id));
    setHistoryOrder((current) => current.filter((itemId) => itemId !== id));
    setPinnedIds((current) => current.filter((itemId) => itemId !== id));
    setComparisonIds((current) => current.filter((itemId) => itemId !== id));
    if (liveInvestigation?.id === id) {
      setLiveInvestigation(null);
    }
    if (historySheetDetail?.id === id) {
      setHistorySheetVisible(false);
      setHistorySheetDetail(null);
    }
    setSnackbar({ visible: true, message: "Investigation deleted", action: "undoDelete" });
  }

  async function cancelInvestigation(id: string) {
    setCancellingIds((current) => (current.includes(id) ? current : [...current, id]));
    try {
      const response = await requestApi(`/api/investigations/${id}/cancel`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not stop the investigation."));
      }
      setHistory((current) =>
        current.map((item) =>
          item.id === id
            ? {
              ...item,
              summary: "Stop requested. The current step will finish safely before the run closes.",
            }
            : item
        )
      );
      if (liveInvestigation?.id === id) {
        setLiveInvestigation({
          ...liveInvestigation,
          summary: "Stop requested. The current step will finish safely before the run closes.",
        });
      }
      if (historySheetDetail?.id === id) {
        setHistorySheetDetail({
          ...historySheetDetail,
          summary: "Stop requested. The current step will finish safely before the run closes.",
        });
      }
      setSnackbar({ visible: true, message: "Stopping the current investigation..." });
    } catch (error) {
      setSnackbar({ visible: true, message: error instanceof Error ? error.message : "Could not stop the investigation." });
    } finally {
      setCancellingIds((current) => current.filter((itemId) => itemId !== id));
    }
  }

  async function clearAllHistory() {
    try {
      const response = await requestApi("/api/investigations", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not clear history."));
      }
      setHistory([]);
      setHistoryOrder([]);
      setPinnedIds([]);
      setComparisonIds([]);
      setLiveInvestigation(null);
      setHistorySheetVisible(false);
      setHistorySheetDetail(null);
      setSnackbar({ visible: true, message: "History cleared" });
    } catch {
      setSnackbar({ visible: true, message: "Could not clear history" });
    }
  }

  function togglePinHistory(id: string) {
    setPinnedIds((current) => (current.includes(id) ? current.filter((itemId) => itemId !== id) : [id, ...current]));
  }

  function moveHistoryItem(id: string, direction: -1 | 1) {
    setHistorySort("manual");
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

  function toggleCompareHistory(id: string) {
    setComparisonIds((current) => {
      if (current.includes(id)) {
        return current.filter((itemId) => itemId !== id);
      }
      if (current.length === 1) {
        const existing = history.find((item) => item.id === current[0]);
        const incoming = history.find((item) => item.id === id);
        if (existing && incoming) {
          const comparisonCheck = canCompareClaims(existing, incoming);
          if (!comparisonCheck.allowed) {
            setSnackbar({ visible: true, message: "Pick two runs about the same claim or a closely related variation." });
            return current;
          }
        }
      }
      if (current.length >= 2) {
        const preserved = history.find((item) => item.id === current[1]);
        const incoming = history.find((item) => item.id === id);
        if (preserved && incoming) {
          const comparisonCheck = canCompareClaims(preserved, incoming);
          if (!comparisonCheck.allowed) {
            setSnackbar({ visible: true, message: "Those two runs are too different to compare fairly." });
            return current;
          }
        }
        return [current[1], id];
      }
      return [...current, id];
    });
  }

  async function runComparison() {
    if (comparisonItems.length !== 2) {
      return;
    }
    const localCheck = canCompareClaims(comparisonItems[0], comparisonItems[1]);
    if (!localCheck.allowed) {
      setSnackbar({ visible: true, message: "Choose two runs that cover the same claim or a very similar health question." });
      return;
    }
    setComparisonLoading(true);
    try {
      const response = await requestApi("/api/investigations/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investigationIds: comparisonItems.map((item) => item.id) }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not compare those saved investigations."));
      }
      const payload = (await response.json()) as InvestigationComparison;
      if (!payload.compatible) {
        setComparisonResult(payload);
        setSnackbar({ visible: true, message: "Those runs are not close enough in topic for a fair side-by-side comparison." });
        return;
      }
      setComparisonResult(payload);
    } catch (error) {
      setSnackbar({ visible: true, message: error instanceof Error ? error.message : "Could not compare those runs." });
    } finally {
      setComparisonLoading(false);
    }
  }

  function applyFeaturedClaim(item: FeaturedClaim) {
    setClaimDraft(formatClaimForDisplay(item.claim));
    setContextDraft(item.id.startsWith("recent-") ? "" : item.whyItIsInteresting);
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

  if (!onboardingCheckResolved) {
    return (
      <View style={styles.appShell}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.background} />
        <View style={styles.background} />
        <View style={styles.startupShell}>
          <AppStartupCard
            subtitle="Getting your dashboard ready"
            detail="Checking onboarding, saved profile details, and recent activity."
            loadingLabel="Syncing your workspace"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appShell}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.background} />
      <View style={styles.background} />
      <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12, paddingBottom: bottomInset + 104 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.pageContainer}>
            {activeTab === "home" ? (
              <Header brand={bootstrap.brand.name} tagline={bootstrap.brand.tagline} onRetry={retryBackendConnection} apiError={apiError} styles={styles} />
            ) : (
              <ToolHeader
                title={
                  activeTab === "consultant"
                    ? consultantView === "history"
                      ? "Saved investigations"
                      : "Claim consultant"
                    : activeTab === "diet"
                      ? "Scanner"
                      : activeTab === "activity"
                        ? "Activity monitor"
                        : "Profile and settings"
                }
                body={
                  activeTab === "consultant"
                    ? consultantView === "history"
                      ? "Review saved runs, compare reruns, and manage pinned history."
                      : "Run a claim check, then review the evidence, workflow, and saved history."
                    : activeTab === "diet"
                      ? "Food, drink, and supplement analysis now live in one calmer workspace with a shared visual language."
                      : activeTab === "activity"
                        ? "Log movement, recovery, and activity load with clearer balance and recovery insights."
                        : "Manage your health context, saved presets, and investigation preferences."
                }
                apiError={apiError}
                onRetry={retryBackendConnection}
                onPressHelp={
                  activeTab === "consultant" && consultantView !== "history"
                    ? () => setConsultantTutorialVisible(true)
                    : activeTab === "diet"
                      ? () => setDietGuideSignal((current) => current + 1)
                      : activeTab === "activity"
                        ? () => setActivityGuideSignal((current) => current + 1)
                        : undefined
                }
                styles={styles}
              />
            )}

            {activeTab === "home" && (
              <HomeDashboardPage
                history={history}
                accountId={activeAccount?.id}
                accountEmail={activeAccount?.email}
                onOpenInvestigate={() => {
                  setConsultantView("investigate");
                  setActiveTab("consultant");
                }}
                onOpenHistory={(id) => void openHistorySheet(id)}
                onOpenTab={setActiveTab}
                requestApi={(path: string, init?: RequestInit) => requestApi(path, init, 120000)}
              />
            )}

            {activeTab === "consultant" && (
              <ConsultantPage
                bootstrap={bootstrap}
                consultantView={consultantView}
                claimDraft={claimDraft}
                contextDraft={contextDraft}
                claimSourceDraft={claimSourceDraft}
                populationDraft={populationDraft}
                focusDraft={focusDraft}
                sourceUrlDraft={sourceUrlDraft}
                depth={depth}
                claimSuggestions={claimSuggestions}
                suggestionsLoading={suggestionsLoading}
                healthGuard={localHealthGuard}
                submitting={submitting}
                loadingHistory={loadingHistory}
                loadingSelected={loadingSelected}
                history={visibleHistory}
                pinnedIds={pinnedIds}
                historySort={historySort}
                historyFilter={historyFilter}
                historyQuery={historyQuery}
                comparisonIds={comparisonIds}
                comparisonItems={comparisonItems}
                comparisonResult={comparisonResult}
                comparisonLoading={comparisonLoading}
                cancellingIds={cancellingIds}
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
                onCancelInvestigation={(id) => void cancelInvestigation(id)}
                onTogglePin={togglePinHistory}
                onToggleCompare={toggleCompareHistory}
                onRunComparison={() => void runComparison()}
                onMoveUp={(id) => moveHistoryItem(id, -1)}
                onMoveDown={(id) => moveHistoryItem(id, 1)}
                onSortChange={setHistorySort}
                onFilterChange={setHistoryFilter}
                onHistoryQueryChange={setHistoryQuery}
                onConsultantViewChange={setConsultantView}
                onUseClaim={applyFeaturedClaim}
                onClearHistory={() => void clearAllHistory()}
                styles={styles}
                helpers={{
                  safeTrim,
                  safeLower,
                  safeUpper,
                  formatTimestamp,
                  depthLabel,
                  depthDescription,
                  depthTargetWindow,
                  scoreBandLabel,
                  scoreTone,
                  verdictMeta,
                  sourceTone,
                  sourceSentimentLabel,
                  stageIcon,
                  splitWorkflowTitle,
                  sourceQualityMeta,
                  sourceAccessMeta,
                  sourceDisplayUrl,
                  riskTone,
                  singaporeAgreementMeta,
                  quoteStanceMeta,
                  providerLabel,
                  historySortLabel,
                  formatClaimForDisplay,
                  recencyBucket,
                  evidenceTierLabel,
                  normalizedClaimKey,
                  canCompareClaims,
                  statusIcon,
                  statusLabel,
                  highlightedQuoteUrl,
                  isRunning,
                  palettePrimary: palette.primary,
                  paletteDanger: palette.danger,
                  paletteWarning: palette.warning,
                  paletteText: palette.text,
                }}
              />
            )}

            {activeTab === "diet" && <DietPage requestApi={(path: string, init?: RequestInit, timeoutMsOverride?: number) => requestApi(path, init, timeoutMsOverride ?? 180000)} accountId={activeAccount?.id} accountEmail={activeAccount?.email} guideSignal={dietGuideSignal} />}
            {activeTab === "activity" && <ActivityPage requestApi={(path: string, init?: RequestInit, timeoutMsOverride?: number) => requestApi(path, init, timeoutMsOverride ?? 180000)} accountId={activeAccount?.id} accountEmail={activeAccount?.email} guideSignal={activityGuideSignal} />}
            {activeTab === "profile" && (
              <ProfilePage
                accountId={activeAccount?.id}
                accountEmail={activeAccount?.email}
                activeAccount={activeAccount}
                authLoading={authLoading}
                requestApi={(path: string, init?: RequestInit, timeoutMsOverride?: number) => requestApi(path, init, timeoutMsOverride ?? 5000)}
                onAuthenticate={handleAuthenticate}
                onLogout={() => void handleLogout()}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomTabs activeTab={activeTab} onSelect={setActiveTab} bottomInset={bottomInset} styles={styles} />

      <HistorySheet
        visible={historySheetVisible}
        investigation={historySheetDetail}
        loading={historySheetLoading}
        onClose={() => setHistorySheetVisible(false)}
        onRestart={(investigation) => void restartInvestigation(investigation)}
        onDelete={(id) => void deleteHistoryItem(id)}
        onCancel={(id) => void cancelInvestigation(id)}
        cancellingIds={cancellingIds}
        styles={styles}
        helpers={{
          safeTrim,
          isRunning,
          palettePrimary: palette.primary,
          paletteDanger: palette.danger,
          paletteWarning: palette.warning,
          paletteText: palette.text,
          formatTimestamp,
          formatClaimForDisplay,
          depthLabel,
          depthTargetWindow,
          scoreBandLabel,
          scoreTone,
          verdictMeta,
          sourceTone,
          sourceSentimentLabel,
          stageIcon,
          splitWorkflowTitle,
          sourceQualityMeta,
          sourceAccessMeta,
          sourceDisplayUrl,
          riskTone,
          singaporeAgreementMeta,
          quoteStanceMeta,
          providerLabel,
          historySortLabel,
          recencyBucket,
          evidenceTierLabel,
          normalizedClaimKey,
          canCompareClaims,
          statusIcon,
          statusLabel,
          highlightedQuoteUrl,
          safeLower,
          safeUpper,
        }}
      />

      <OnboardingSheet
        visible={onboardingVisible}
        mode="setup"
        accountId={activeAccount?.id}
        accountEmail={activeAccount?.email}
        activeAccount={activeAccount}
        authLoading={authLoading}
        onAuthenticate={handleAuthenticate}
        onClose={() => setOnboardingVisible(false)}
        onSaved={() => {
          setOnboardingVisible(false);
          setActiveTab("profile");
          setProfileView("overview");
          setSnackbar({ visible: true, message: "Profile setup saved" });
        }}
      />

      <TutorialSheet visible={consultantTutorialVisible} title="Claim consultant tutorial" pages={CONSULTANT_TUTORIAL_PAGES} onClose={() => setConsultantTutorialVisible(false)} />

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((current) => ({ ...current, visible: false }))}
        action={
          snackbar.action === "retry"
            ? {
              label: reconnecting ? "Loading..." : "Reconnect",
              onPress: () => void retryBackendConnection(),
            }
            : snackbar.action === "undoDelete"
              ? {
                label: "Undo",
                onPress: undoDeleteHistoryItem,
              }
              : snackbar.action === "setupProfile"
                ? {
                  label: "Set up",
                  onPress: () => {
                    setActiveTab("profile");
                    setProfileView("overview");
                    setOnboardingVisible(true);
                  },
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
  const completedRuns = history.filter((item) => item.status === "completed").length;
  const runningRuns = history.filter((item) => isRunning(item.status)).length;
  const pinnedRuns = history.filter((item) => item.verdict && item.verdict !== "mixed").length;
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
          Use the Verify tab when you want to fact-check a claim, then come back here for regular health data, meals, and medication tracking.
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

      <SectionTitle eyebrow="Investigations" title="Review activity" body="A quicker read on what the claim-checking side of the app is doing right now." />
      <View style={styles.metricGrid}>
        {[
          { label: "Saved runs", value: String(history.length), detail: "Across quick, standard, and deep reviews", icon: "history" },
          { label: "Completed", value: String(completedRuns), detail: "Reports ready to reopen anytime", icon: "check-decagram" },
          { label: "Running", value: String(runningRuns), detail: "Live investigations still processing", icon: "progress-clock" },
          { label: "Scored", value: String(pinnedRuns), detail: "Runs with a settled verdict band", icon: "chart-box-outline" },
        ].map((metric) => (
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
    </View>
  );
}

function QuickLinks({ onOpenTab }: { onOpenTab: (tab: AppTab) => void }) {
  const links: Array<{ tab: AppTab; icon: string; label: string; body: string }> = [
    { tab: "consultant", icon: "stethoscope", label: "Verify", body: "Investigate claims and read evidence." },
    { tab: "diet", icon: "food-apple-outline", label: "Scanner", body: "Food analysis, diet intake, and supplement checks together." },
    { tab: "activity", icon: "run", label: "Activity", body: "Movement, recovery, routines, and energy balance." },
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
  bootstrap: BootstrapPayload;
  consultantView: ConsultantView;
  claimDraft: string;
  contextDraft: string;
  claimSourceDraft: string;
  populationDraft: string;
  focusDraft: string;
  sourceUrlDraft: string;
  depth: ReviewDepth;
  claimSuggestions: string[];
  suggestionsLoading: boolean;
  healthGuard: LocalHealthGuard;
  submitting: boolean;
  loadingHistory: boolean;
  loadingSelected: boolean;
  history: InvestigationSummary[];
  pinnedIds: string[];
  historySort: HistorySort;
  historyFilter: HistoryFilter;
  historyQuery: string;
  comparisonIds: string[];
  comparisonItems: InvestigationSummary[];
  comparisonResult: InvestigationComparison | null;
  comparisonLoading: boolean;
  cancellingIds: string[];
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
  onCancelInvestigation: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onRunComparison: () => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onSortChange: (value: HistorySort) => void;
  onFilterChange: (value: HistoryFilter) => void;
  onHistoryQueryChange: (value: string) => void;
  onConsultantViewChange: (value: ConsultantView) => void;
  onUseClaim: (item: FeaturedClaim) => void;
  onClearHistory: () => void;
};

function ProfileSettingsPanel({
  bootstrap,
}: {
  bootstrap: BootstrapPayload;
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

function ProcessingCard({
  investigation,
  onCancel,
  cancelling,
}: {
  investigation: InvestigationDetail;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const steps = investigation.stepSummaries.length > 0 ? investigation.stepSummaries : [];
  const recentEvents = investigation.progressEvents.slice(-5).reverse();
  return (
    <Card mode="contained" style={styles.processingCard}>
      <Card.Content style={styles.cardStack}>
        <View style={[styles.rowBetween, compact && styles.rowBetweenStacked]}>
          <View style={styles.flexOne}>
            <Text variant="titleLarge" style={styles.formTitle}>
              Review in progress
            </Text>
            <Text variant="bodyMedium" style={styles.sectionBody}>
              {formatClaimForDisplay(investigation.claim)}
            </Text>
          </View>
          <Chip style={styles.progressChip} textStyle={styles.progressChipText}>
            {investigation.progressPercent}%
          </Chip>
        </View>

        <ProgressBar progress={Math.max(0.04, investigation.progressPercent / 100)} color={palette.primary} style={styles.progressBar} />
        <View style={styles.resultActionRow}>
          <Button mode="outlined" icon="stop-circle-outline" onPress={onCancel} loading={cancelling} disabled={cancelling} textColor={palette.warning}>
            {cancelling ? "Stopping..." : "Stop current run"}
          </Button>
        </View>

        {steps.length > 0 ? (
          <View style={styles.cardStack}>
            {steps.map((step) => {
              const indicator = statusIcon(step.status);
              const stepTitle = splitWorkflowTitle(step.title);
              return (
                <View key={step.key} style={styles.stepRow}>
                  <Avatar.Icon size={40} icon={stageIcon(step)} color={palette.primary} style={styles.stepAvatar} />
                  <View style={styles.flexOne}>
                    <View style={[styles.rowBetween, compact && styles.stepHeaderCompact]}>
                      <View style={styles.flexOne}>
                        <Text variant="titleSmall" style={styles.stepTitle}>
                          {stepTitle.purpose}
                        </Text>
                        {stepTitle.role ? (
                          <Text variant="bodySmall" style={styles.stepRoleLine}>
                            {stepTitle.role}
                          </Text>
                        ) : null}
                      </View>
                      <Chip compact icon={indicator.icon} style={compact ? styles.statusChipCompact : undefined} textStyle={[styles.miniChipText, { color: indicator.color }]}>
                        {statusLabel(step.status)}
                      </Chip>
                    </View>
                    <View style={styles.stepDivider} />
                    <Text variant="bodySmall" style={styles.stepBody}>
                      {step.summary}
                    </Text>
                    {safeTrim(step.goal) ? (
                      <Text variant="bodySmall" style={styles.historyMetaLine}>
                        {safeTrim(step.goal)}
                      </Text>
                    ) : null}
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
  const { width } = useWindowDimensions();
  const compactSignals = width < 760;
  const compactLayout = width < 760;
  const verdict = verdictMeta(investigation.verdict);
  const scoreMeta = scoreTone(investigation.overallScore, investigation.verdict);
  const groupedSources = investigation.sourceGroups.filter((group) => group.sources.length > 0);
  const sourceDeckGroups = useMemo(() => {
    if (groupedSources.length > 0) {
      return groupedSources;
    }
    if (investigation.sources.length === 0) {
      return [];
    }
    const ranked = [...investigation.sources].sort((left, right) => {
      const leftScore =
        left.sourceWeight * 100 +
        left.confidenceFactor * 100 +
        left.citationIntegrity +
        left.evidenceScore * 16 +
        left.sourceScore * 20;
      const rightScore =
        right.sourceWeight * 100 +
        right.confidenceFactor * 100 +
        right.citationIntegrity +
        right.evidenceScore * 16 +
        right.sourceScore * 20;
      return rightScore - leftScore;
    });
    return [
      {
        key: "all_analyzed_sources",
        title: "Analyzed sources",
        summary: "The grouped evidence deck was unavailable for this run, so the app is showing the strongest analyzed sources directly.",
        sources: ranked.slice(0, 60),
      },
    ];
  }, [groupedSources, investigation.sources]);
  const riskMeta = riskTone(investigation.misinformationRisk);
  const [explanationMode, setExplanationMode] = useState<"summary" | "detailed">("summary");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | SourceQualityLabel>("all");
  const [sourceSentimentFilter, setSourceSentimentFilter] = useState<"all" | SourceAssessment["sentiment"]>("all");
  const [recencyFilter, setRecencyFilter] = useState<"all" | "recent" | "established" | "undated">("all");
  const [studyTypeFilter, setStudyTypeFilter] = useState<"all" | SourceAssessment["evidenceTier"]>("all");
  const explanationText =
    explanationMode === "detailed"
      ? investigation.expertInsight || investigation.finalNarrative || investigation.aiSummary
      : investigation.aiSummary || investigation.finalNarrative || investigation.summary;
  const agreementHighlights = [
    ...investigation.strengths,
    ...investigation.sources
      .filter((source) => source.sentiment === "positive")
      .slice(0, 4)
      .map((source) => source.sentimentSummary || source.relevanceSummary || source.title),
  ].filter(Boolean);
  const filteredGroups = useMemo(
    () =>
      sourceDeckGroups
        .map((group) => ({
          ...group,
          sources: group.sources.filter((source) => {
            if (sourceTypeFilter !== "all" && source.sourceQualityLabel !== sourceTypeFilter) {
              return false;
            }
            if (sourceSentimentFilter !== "all" && source.sentiment !== sourceSentimentFilter) {
              return false;
            }
            if (recencyFilter !== "all" && recencyBucket(source.publishedAt) !== recencyFilter) {
              return false;
            }
            if (studyTypeFilter !== "all" && source.evidenceTier !== studyTypeFilter) {
              return false;
            }
            return true;
          }),
        }))
        .filter((group) => group.sources.length > 0),
    [sourceDeckGroups, recencyFilter, sourceSentimentFilter, sourceTypeFilter, studyTypeFilter]
  );
  const filteredSourceCount = filteredGroups.reduce((total, group) => total + group.sources.length, 0);
  const effectiveVisibleCount = sourceDeckGroups.reduce((total, group) => total + group.sources.length, 0);
  const limitedAccessCount = investigation.sources.filter(
    (source) =>
      source.cacheStatus === "fallback" ||
      source.notes.some((note) => safeLower(note).includes("limited-access evidence"))
  ).length;
  const singaporeAuthoritySources = useMemo(
    () =>
      investigation.sources.filter((source) => {
        const domain = safeLower(source.domain);
        return domain.endsWith(".sg") || ["moh.gov.sg", "hsa.gov.sg", "healthhub.sg", "healthiersg.gov.sg", "ncid.sg"].some((item) => domain.includes(item));
      }),
    [investigation.sources]
  );
  const showSingaporeAuthoritySection =
    Boolean(investigation.singaporeAuthorityReview) || singaporeAuthoritySources.length > 0 || safeLower(investigation.claim).includes("singapore");
  const singaporeReviewMeta = singaporeAgreementMeta(investigation.singaporeAuthorityReview?.agreementLabel);
  const fullSourceLog = useMemo(
    () =>
      [...investigation.sources].sort((left, right) => {
        const leftScore =
          left.sourceWeight * 100 +
          left.confidenceFactor * 100 +
          left.citationIntegrity +
          left.evidenceScore * 16 +
          left.sourceScore * 20 +
          (left.directEvidenceEligible ? 12 : 0);
        const rightScore =
          right.sourceWeight * 100 +
          right.confidenceFactor * 100 +
          right.citationIntegrity +
          right.evidenceScore * 16 +
          right.sourceScore * 20 +
          (right.directEvidenceEligible ? 12 : 0);
        return rightScore - leftScore;
      }),
    [investigation.sources]
  );

  return (
    <View style={styles.cardStack}>
      <Card mode="contained" style={styles.resultHero}>
        <Card.Content style={styles.cardStack}>
          <View style={styles.resultHeroTopRow}>
            <VerdictPill verdict={investigation.verdict} />
            <Chip compact style={[styles.scoreChip, { backgroundColor: scoreMeta.background }]} textStyle={[styles.scoreChipText, { color: scoreMeta.color }]}>
              {investigation.overallScore ?? "--"}/100
            </Chip>
          </View>
          <Text variant="headlineSmall" style={styles.resultTitle}>
            {formatClaimForDisplay(investigation.claim)}
          </Text>
          <Text key={`hero-${explanationMode}`} variant="bodyMedium" style={styles.resultBody}>
            {explanationText}
          </Text>
          <View style={[styles.resultMetaRow, styles.resultMetaColumn]}>
            <MiniStat label="Assessment" value={investigation.truthClassification || scoreBandLabel(investigation.overallScore, investigation.verdict)} style={styles.miniStatFullWidth} />
            <MiniStat label="Confidence" value={safeUpper(investigation.confidenceLevel ?? "unknown")} style={styles.miniStatFullWidth} />
            <MiniStat label="Review Type" value={depthLabel(investigation.desiredDepth)} style={styles.miniStatFullWidth} />
          </View>
          <Text variant="bodySmall" style={styles.historyMetaLine}>
            Updated {formatTimestamp(investigation.updatedAt)}
          </Text>
          <View style={styles.historyMetaRow}>
            <Chip compact style={styles.segmentChip}>{`${investigation.sources.length} analyzed sources`}</Chip>
            {limitedAccessCount > 0 ? <Chip compact style={styles.segmentChip}>{`${limitedAccessCount} limited-access`}</Chip> : null}
          </View>
          {investigation.sentiment ? (
            <>
              <View style={[styles.resultSignalRow, compactSignals ? styles.resultSignalColumn : styles.resultSignalRowWide]}>
                <SignalPill label="Supports" value={`${investigation.sentiment.positivePct}%`} icon="check-circle" color={palette.success} background={palette.successSoft} />
                <SignalPill label="Mixed" value={`${investigation.sentiment.neutralPct}%`} icon="help-circle" color={palette.warning} background={palette.warningSoft} />
                <SignalPill label="Contradicts" value={`${investigation.sentiment.negativePct}%`} icon="close-circle" color={palette.danger} background={palette.dangerSoft} />
              </View>
              <ConfidenceBreakdownBar investigation={investigation} />
            </>
          ) : null}
        </Card.Content>
      </Card>

      <ExpandableResultSection
        title="Conclusion and findings"
        body={explanationText}
        icon="text-box-check-outline"
        bodyKey={explanationMode}
        defaultExpanded
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {([
            ["summary", "Summary"],
            ["detailed", "Detailed"],
          ] as const).map(([value, label]) => (
            <Chip key={value} selected={explanationMode === value} onPress={() => setExplanationMode(value)} style={styles.segmentChip}>
              {label}
            </Chip>
          ))}
        </ScrollView>
        <Text key={`detail-${explanationMode}`} variant="bodyMedium" style={styles.resultBody}>
          {explanationText}
        </Text>
        {limitedAccessCount > 0 ? (
          <Text variant="bodySmall" style={styles.sectionBody}>
            Some sources were kept from live search excerpts when the destination page blocked scraping or timed out. They still count as lower-confidence evidence and are shown clearly in the evidence deck.
          </Text>
        ) : null}
        {investigation.evidenceBreakdown.slice(0, 5).map((item) => (
          <Bullet key={item} text={item} />
        ))}
      </ExpandableResultSection>

      {investigation.keyFindings.length > 0 && (
        <ExpandableResultSection
          title="Key details"
          body={investigation.keyFindings[0]}
          icon="star-four-points-circle-outline"
          defaultExpanded={false}
        >
          {investigation.keyFindings.map((item) => (
            <Bullet key={item} text={item} />
          ))}
        </ExpandableResultSection>
      )}

      {investigation.profilePersonalizationReview && (
        <ExpandableResultSection
          title="Profile relevance"
          body={investigation.profilePersonalizationReview.summary || "This run included a profile-based relevance pass before the final verdict."}
          icon="account-heart-outline"
          defaultExpanded={false}
        >
          <View style={styles.historyMetaRow}>
            <Chip compact style={styles.segmentChip}>
              {`Profile relevance ${safeUpper(investigation.profilePersonalizationReview.relevanceLabel.replace("_", " "))}`}
            </Chip>
          </View>
          {investigation.profilePersonalizationReview.keyPoints.map((item) => (
            <Bullet key={`profile-point-${item}`} text={item} />
          ))}
          {investigation.profilePersonalizationReview.alerts.length > 0 ? (
            <>
              <Text variant="titleSmall" style={styles.formTitle}>
                Personal alerts
              </Text>
              {investigation.profilePersonalizationReview.alerts.map((item) => (
                <Bullet key={`profile-alert-${item}`} text={item} />
              ))}
            </>
          ) : null}
        </ExpandableResultSection>
      )}

      {showSingaporeAuthoritySection && (
        <ExpandableResultSection
          title="Singapore authority view"
          body={
            investigation.singaporeAuthorityReview?.summary ||
            (singaporeAuthoritySources.length > 0
              ? `${singaporeAuthoritySources.length} Singapore-linked health or research sources were found in this review.`
              : "No retained Singapore authority source made it into the final evidence set for this run.")
          }
          icon="map-marker-radius-outline"
        >
          <View style={styles.historyMetaRow}>
            <Chip compact icon={singaporeReviewMeta.icon} style={{ backgroundColor: singaporeReviewMeta.background }} textStyle={{ color: singaporeReviewMeta.color, fontFamily: "Poppins_600SemiBold" }}>
              {singaporeReviewMeta.label}
            </Chip>
            {investigation.singaporeAuthorityReview ? (
              <>
                <Chip compact style={styles.segmentChip}>{`${investigation.singaporeAuthorityReview.totalSources} sources`}</Chip>
                <Chip compact style={styles.segmentChip}>{`${investigation.singaporeAuthorityReview.supportiveCount} support`}</Chip>
                <Chip compact style={styles.segmentChip}>{`${investigation.singaporeAuthorityReview.neutralCount} mixed`}</Chip>
                <Chip compact style={styles.segmentChip}>{`${investigation.singaporeAuthorityReview.contradictoryCount} contradict`}</Chip>
              </>
            ) : null}
          </View>
          <Text variant="bodySmall" style={styles.sectionBody}>
            This section isolates what Singapore authorities, Singapore institutional research groups, and Singapore health-system sources suggest about the claim.
          </Text>
          {(investigation.singaporeAuthorityReview?.keyPoints || []).map((item) => (
            <Bullet key={`sg-point-${item}`} text={item} />
          ))}
          {singaporeAuthoritySources.slice(0, 10).map((source) => (
            <EvidenceBlock key={`sg-${source.id}`} source={source} />
          ))}
        </ExpandableResultSection>
      )}

      {(investigation.recommendedQueries.length > 0 || investigation.discoveredDomains.length > 0) && (
        <ExpandableResultSection
          title="Search coverage"
          body={`${investigation.recommendedQueries.length} search paths and ${investigation.discoveredDomains.length} remembered domains fed this review.`}
          icon="magnify-scan"
        >
          {investigation.recommendedQueries.length > 0 ? (
            <>
              <Text variant="titleSmall" style={styles.formTitle}>
                Search paths
              </Text>
              {investigation.recommendedQueries.slice(0, 8).map((item) => (
                <Bullet key={`query-${item}`} text={item} />
              ))}
            </>
          ) : null}
          {investigation.discoveredDomains.length > 0 ? (
            <>
              <Text variant="titleSmall" style={styles.formTitle}>
                Domains seen
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {investigation.discoveredDomains.slice(0, 16).map((domain) => (
                  <Chip key={`domain-${domain}`} compact style={styles.segmentChip}>
                    {domain}
                  </Chip>
                ))}
              </ScrollView>
            </>
          ) : null}
        </ExpandableResultSection>
      )}

      {sourceDeckGroups.length > 0 && (
        <ExpandableResultSection
          title="Evidence deck"
          body={`${filteredSourceCount || effectiveVisibleCount} evidence cards match the current filters out of ${investigation.sources.length} analyzed sources.`}
          icon="file-document-multiple-outline"
        >
          <Text variant="bodySmall" style={styles.sectionBody}>
            The app keeps the full analyzed source pool for scoring and history. This deck surfaces the strongest and most decision-relevant sources first so the result stays readable.
          </Text>
          {investigation.sourceRegistry.length > 0 ? (
            <Text variant="bodySmall" style={styles.sectionBody}>
              {investigation.sourceRegistry.filter((entry) => entry.directEvidenceEligible).length} sources cleared the strict direct-evidence gate with a validated live link, while {investigation.sourceRegistry.filter((entry) => !entry.directEvidenceEligible).length} remain context-only or limited-access sources.
            </Text>
          ) : null}
          {limitedAccessCount > 0 ? (
            <Text variant="bodySmall" style={styles.historyMetaLine}>
              {limitedAccessCount} sources in this run were kept as limited-access evidence because the live page blocked extraction but the search result excerpt was still useful.
            </Text>
          ) : null}
          {groupedSources.length === 0 ? (
            <Text variant="bodySmall" style={styles.historyMetaLine}>
              Grouped evidence cards were unavailable for this run, so a ranked fallback deck is being shown instead.
            </Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All sources"],
              ["verified", "Verified"],
              ["established", "Established"],
              ["general", "General"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={sourceTypeFilter === value} onPress={() => setSourceTypeFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All sentiment"],
              ["positive", "Supports"],
              ["neutral", "Mixed"],
              ["negative", "Contradicts"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={sourceSentimentFilter === value} onPress={() => setSourceSentimentFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "Any time"],
              ["recent", "Recent"],
              ["established", "Established"],
              ["undated", "Undated"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={recencyFilter === value} onPress={() => setRecencyFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ["all", "All study types"],
              ["review", "Review"],
              ["rct", "RCT"],
              ["observational", "Observational"],
              ["case_report", "Case report"],
              ["blog", "Article"],
            ] as const).map(([value, label]) => (
              <Chip key={value} selected={studyTypeFilter === value} onPress={() => setStudyTypeFilter(value)} style={styles.segmentChip}>
                {label}
              </Chip>
            ))}
          </ScrollView>
          {filteredGroups.length > 0 ? (
            filteredGroups.map((group) => (
              <View key={group.key} style={styles.cardStack}>
                <View style={[styles.rowBetween, compactLayout && styles.rowBetweenStacked]}>
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
            ))
          ) : (
            <Text variant="bodySmall" style={styles.sectionBody}>
              No sources match the current filter combination.
            </Text>
          )}
        </ExpandableResultSection>
      )}

      {(investigation.misinformationRisk || investigation.hoaxSignals.length > 0) && (
        <ExpandableResultSection
          title="Misinformation pattern scan"
          body={`Pattern risk is ${investigation.misinformationRisk ?? "unknown"} right now. This stage looks for overclaiming, weak citation habits, and mismatch between wording and real evidence strength.`}
          icon="alert-decagram-outline"
        >
          <View style={styles.historyMetaRow}>
            <Chip compact style={{ backgroundColor: riskMeta.background }} textStyle={{ color: riskMeta.color, fontFamily: "Poppins_600SemiBold" }}>
              {`Risk: ${safeUpper(investigation.misinformationRisk ?? "low")}`}
            </Chip>
            {investigation.claimAnalysis?.claimDomain ? <Chip compact style={styles.segmentChip}>{investigation.claimAnalysis.claimDomain}</Chip> : null}
            {typeof investigation.claimAnalysis?.languageRiskScore === "number" ? (
              <Chip compact style={styles.segmentChip}>{`Language risk ${investigation.claimAnalysis.languageRiskScore}/100`}</Chip>
            ) : null}
            {investigation.consensus ? <Chip compact style={styles.segmentChip}>{`Support share ${Math.round((investigation.consensus.supportShare ?? 0) * 100)}%`}</Chip> : null}
          </View>
          <Text variant="bodySmall" style={styles.sectionBody}>
            Lower risk here does not automatically make a claim true. It means the wording behaves more like a normal evidence question than a hoax-style health pitch.
          </Text>
          {investigation.hoaxSignals.length > 0 ? (
            investigation.hoaxSignals.map((signal) => {
              const tone = riskTone(signal.severity);
              return (
                <Card key={`${signal.label}-${signal.rationale}`} mode="contained" style={styles.evidenceCard}>
                  <Card.Content style={styles.cardStack}>
                    <View style={[styles.rowBetween, compactLayout && styles.rowBetweenStacked]}>
                      <Text variant="titleMedium" style={styles.evidenceTitle}>
                        {signal.label}
                      </Text>
                      <Chip compact style={{ backgroundColor: tone.background }} textStyle={{ color: tone.color, fontFamily: "Poppins_600SemiBold" }}>
                        {safeUpper(signal.severity)}
                      </Chip>
                    </View>
                    <Text variant="bodySmall" style={styles.evidenceBody}>
                      {signal.rationale}
                    </Text>
                  </Card.Content>
                </Card>
              );
            })
          ) : (
            <Text variant="bodySmall" style={styles.sectionBody}>
              No major hoax-style signals were surfaced in the final pass.
            </Text>
          )}
        </ExpandableResultSection>
      )}

      {agreementHighlights.length > 0 && (
        <ExpandableResultSection
          title="Supporting signals and reinforcing sources"
          body={agreementHighlights[0]}
          icon="check-decagram-outline"
        >
          {agreementHighlights.slice(0, 8).map((item) => (
            <Bullet key={`agreement-${item}`} text={item} />
          ))}
        </ExpandableResultSection>
      )}

      {investigation.contradictions.length > 0 && (
        <ExpandableResultSection
          title="Pushback and caution signals"
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

      {investigation.providerReviews.length > 0 && (
        <ExpandableResultSection
          title="Cross-model review"
          body={`${investigation.providerReviews.length} model reviewers checked the evidence set, and the panel landed around ${investigation.llmAgreementScore ?? 0}% agreement after audit.`}
          icon="account-group-outline"
        >
          <Text variant="bodySmall" style={styles.sectionBody}>
            These model reviewers act like challengers, not judges. Their job is to catch unsupported leaps, overconfident summaries, and mismatches between evidence and verdict.
          </Text>
          {investigation.providerReviews.map((review) => {
            const providerVerdict = verdictMeta(review.verdict);
            return (
              <Card key={`${review.provider}-${review.role}`} mode="contained" style={styles.evidenceCard}>
                <Card.Content style={styles.cardStack}>
                  <View style={[styles.rowBetween, compactLayout && styles.rowBetweenStacked]}>
                    <View style={styles.flexOne}>
                      <Text variant="titleMedium" style={styles.evidenceTitle}>
                        {providerLabel(review.provider)}
                      </Text>
                      <Text variant="bodySmall" style={styles.historyMetaLine}>
                        {review.role}
                        {safeTrim(review.model) ? ` · ${review.model}` : ""}
                      </Text>
                    </View>
                    <Chip compact style={{ backgroundColor: providerVerdict.background }} textStyle={{ color: providerVerdict.color, fontFamily: "Poppins_600SemiBold" }}>
                      {providerVerdict.label}
                    </Chip>
                  </View>
                  <View style={styles.historyMetaRow}>
                    <Chip compact style={styles.segmentChip}>{`Confidence ${review.confidence}/100`}</Chip>
                    <Chip compact style={styles.segmentChip}>
                      {review.scoreAdjustment >= 0 ? `+${review.scoreAdjustment}` : `${review.scoreAdjustment}`} score
                    </Chip>
                  </View>
                  <Text variant="bodySmall" style={styles.evidenceBody}>
                    {review.rationale}
                  </Text>
                  {review.strengths.slice(0, 2).map((item) => (
                    <Bullet key={`${review.provider}-strength-${item}`} text={item} />
                  ))}
                  {review.concerns.slice(0, 2).map((item) => (
                    <Bullet key={`${review.provider}-concern-${item}`} text={item} />
                  ))}
                  {review.hallucinationFlags.slice(0, 2).map((item) => (
                    <Bullet key={`${review.provider}-flag-${item}`} text={`Hallucination check: ${item}`} />
                  ))}
                </Card.Content>
              </Card>
            );
          })}
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
            const stepTitle = splitWorkflowTitle(step.title);
            return (
              <View key={step.key} style={styles.stepRow}>
                <Avatar.Icon size={38} icon={stageIcon(step)} color={palette.primary} style={styles.stepAvatar} />
                <View style={styles.flexOne}>
                  <View style={[styles.rowBetween, compactLayout && styles.stepHeaderCompact]}>
                    <View style={styles.flexOne}>
                      <Text variant="titleSmall" style={styles.stepTitle}>
                        {stepTitle.purpose}
                      </Text>
                      {stepTitle.role ? (
                        <Text variant="bodySmall" style={styles.stepRoleLine}>
                          {stepTitle.role}
                        </Text>
                      ) : null}
                    </View>
                    <Chip compact icon={indicator.icon} style={compactLayout ? styles.statusChipCompact : undefined} textStyle={[styles.miniChipText, { color: indicator.color }]}>
                      {statusLabel(step.status)}
                    </Chip>
                  </View>
                  <View style={styles.stepDivider} />
                  <Text variant="bodySmall" style={styles.stepBody}>
                    {step.summary}
                  </Text>
                  {safeTrim(step.goal) ? (
                    <Text variant="bodySmall" style={styles.historyMetaLine}>
                      {safeTrim(step.goal)}
                    </Text>
                  ) : null}
                  {step.details.slice(0, 3).map((detail) => (
                    <Bullet key={`${step.key}-${detail}`} text={detail} />
                  ))}
                </View>
              </View>
            );
          })}
        </ExpandableResultSection>
      )}

      {fullSourceLog.length > 0 && (
        <ExpandableResultSection
          title="Full source log"
          body={`All ${investigation.sources.length} analyzed sources are preserved for this saved investigation, not just the streamlined evidence deck.`}
          icon="database-outline"
        >
          <Text variant="bodySmall" style={styles.sectionBody}>
            Use this log when you want the complete analyzed source pool, including lower-visibility items that still influenced scoring, consensus, and saved history.
          </Text>
          {fullSourceLog.map((source) => (
            <EvidenceBlock key={`full-log-${source.id}`} source={source} />
          ))}
        </ExpandableResultSection>
      )}
    </View>
  );
}

function ConfidenceBreakdownBar({ investigation }: { investigation: InvestigationDetail }) {
  if (!investigation.sentiment) {
    return null;
  }

  return (
    <View style={styles.cardStack}>
      <View style={styles.confidenceBarTrack}>
        <View style={[styles.confidenceBarSegment, { flex: Math.max(1, investigation.sentiment.positivePct), backgroundColor: palette.success }]} />
        <View style={[styles.confidenceBarSegment, { flex: Math.max(1, investigation.sentiment.neutralPct), backgroundColor: palette.warning }]} />
        <View style={[styles.confidenceBarSegment, { flex: Math.max(1, investigation.sentiment.negativePct), backgroundColor: palette.danger }]} />
      </View>
    </View>
  );
}

function EvidenceBlock({ source }: { source: SourceAssessment }) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const tone = sourceTone(source);
  const quality = sourceQualityMeta(source.sourceQualityLabel);
  const quote = safeTrim(source.evidence?.quotedEvidence);
  const hasVerifiedQuote = Boolean(quote) && source.quoteVerified;
  const quoteMeta = quoteStanceMeta(source.quoteStance);
  const access = sourceAccessMeta(source);
  const displayUrl = sourceDisplayUrl(source);
  const quoteUrl = highlightedQuoteUrl(displayUrl, quote);

  return (
    <Card mode="contained" style={styles.evidenceCard}>
      <Card.Content style={styles.cardStack}>
        <View style={[styles.rowBetween, compact && styles.rowBetweenStacked]}>
          <View style={styles.flexOne}>
            <Text variant="titleMedium" style={styles.evidenceTitle}>
              {source.sourceName || source.domain}
            </Text>
            <Pressable onPress={() => void Linking.openURL(displayUrl)}>
              <Text variant="bodySmall" style={styles.evidenceUrl} numberOfLines={2} ellipsizeMode="middle">
                {displayUrl}
              </Text>
            </Pressable>
          </View>
          <Avatar.Icon size={34} icon={tone.icon} color={tone.color} style={{ backgroundColor: tone.background }} />
        </View>

        <View style={[styles.historyMetaRow, compact && styles.historyMetaColumn]}>
          <Chip compact style={{ backgroundColor: tone.background }} textStyle={{ color: tone.color, fontFamily: "Poppins_600SemiBold" }}>
            {sourceSentimentLabel(source)}
          </Chip>
          <Chip compact style={{ backgroundColor: quality.background }} textStyle={{ color: quality.color, fontFamily: "Poppins_600SemiBold" }}>
            {quality.label}
          </Chip>
          <Chip compact style={{ backgroundColor: access.background }} textStyle={{ color: access.color, fontFamily: "Poppins_600SemiBold" }}>
            {access.label}
          </Chip>
          <Chip compact style={styles.segmentChip}>{evidenceTierLabel(source)}</Chip>
          {source.httpStatusCode ? <Chip compact style={styles.segmentChip}>{`HTTP ${source.httpStatusCode}`}</Chip> : null}
          {source.semanticSimilarity > 0 ? <Chip compact style={styles.segmentChip}>{`Match ${source.semanticSimilarity}`}</Chip> : null}
          {source.evidence?.sampleSize ? <Chip compact style={styles.segmentChip}>{source.evidence.sampleSize}</Chip> : null}
          {hasVerifiedQuote ? (
            <Chip compact style={{ backgroundColor: quoteMeta.background }} textStyle={{ color: quoteMeta.color, fontFamily: "Poppins_600SemiBold" }}>
              {quoteMeta.label}
            </Chip>
          ) : (
            <Chip compact style={styles.segmentChip}>
              Excerpt only
            </Chip>
          )}
          {source.quoteVerified ? (
            <Chip compact style={{ backgroundColor: palette.primarySoft }} textStyle={{ color: palette.primary, fontFamily: "Poppins_600SemiBold" }}>
              Verified quote
            </Chip>
          ) : null}
        </View>

        <Text variant="bodySmall" style={styles.historyMetaLine}>
          {safeTrim(source.publishedAt) ? `Published ${formatTimestamp(source.publishedAt || "")}` : "Published date not available"}
        </Text>
        <Text variant="bodySmall" style={styles.historyMetaLine}>
          {source.linkValidationSummary || source.sourceQualityReason}
        </Text>

        {hasVerifiedQuote ? (
          <View style={styles.quoteBox}>
            <Text variant="labelSmall" style={styles.quoteLabel}>
              Verified quote
            </Text>
            <Text variant="bodyMedium" style={styles.quoteText}>
              "{quote}"
            </Text>
          </View>
        ) : null}

        <Text variant="bodySmall" style={styles.evidenceBody}>
          {source.sourceQualityReason || source.evidence?.expertAnalysis || source.sentimentSummary || source.relevanceSummary || "This source was included because it materially addresses the claim."}
        </Text>

        {[...(source.evidence?.limitations ?? []), ...source.credibilityNotes].slice(0, 2).map((item) => (
          <Bullet key={`${source.id}-${item}`} text={item} />
        ))}

        <View style={styles.resultActionRow}>
          <Button mode="outlined" compact icon="open-in-new" textColor={palette.primary} onPress={() => void Linking.openURL(displayUrl)}>
            Open source
          </Button>
          {hasVerifiedQuote ? (
            <Button mode="contained-tonal" compact icon="format-quote-close" buttonColor={palette.primarySoft} textColor={palette.primary} onPress={() => void Linking.openURL(quoteUrl)}>
              Highlight quote
            </Button>
          ) : null}
        </View>
      </Card.Content>
    </Card>
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
          <View style={styles.metricGrid}>
            {[
              { label: "Evidence style", value: "Balanced", detail: "Less skeptical when strong support is real", icon: "scale-balance" },
              { label: "Default depth", value: "Deep", detail: "100+ sources when the claim justifies it", icon: "layers-triple-outline" },
              { label: "Singapore view", value: "On", detail: "Regional authority pass included when relevant", icon: "map-marker-radius-outline" },
              { label: "Reconnect", value: "Auto", detail: "Toast appears when the backend drops offline", icon: "sync-circle" },
            ].map((metric) => (
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
          <Card mode="contained" style={styles.resultSectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.linkTitle}>
                Score guide
              </Text>
              <Text variant="bodyMedium" style={styles.sectionBody}>
                Scores below 40 usually point to strong pushback or weak evidence, 40 to 79 means the evidence is still mixed, and 80+ suggests consistently strong support from better sources.
              </Text>
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
        <ProfileSettingsPanel bootstrap={bootstrap} />
      )}
    </View>
  );
}

function VerdictPill({ verdict }: { verdict: InvestigationSummary["verdict"] | InvestigationDetail["verdict"] }) {
  const meta = verdictMeta(verdict);
  return (
    <View style={[styles.verdictPill, { backgroundColor: meta.background }]}>
      <MaterialCommunityIcons name={meta.icon as MaterialIconName} size={16} color={meta.color} />
      <Text variant="labelMedium" style={[styles.verdictPillText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
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
  bodyKey,
  icon,
  defaultExpanded = false,
  children,
}: {
  title: string;
  body: string;
  bodyKey?: string;
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
                <Text key={bodyKey} numberOfLines={expanded ? undefined : 2} variant="bodySmall" style={styles.sectionBody}>
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

function MiniStat({ label, value, style }: { label: string; value: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.miniStat, style]}>
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

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.05,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
};

const floatingShadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.08,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 12 },
  elevation: 4,
};

const softBorderWidth = StyleSheet.hairlineWidth;

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
  startupShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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
    paddingTop: 12,
    paddingBottom: 124,
    alignItems: "center",
  },
  pageContainer: {
    width: "100%",
    maxWidth: 1120,
    gap: 28,
  },
  screenStack: {
    gap: 24,
  },
  consultantWideGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  consultantPrimaryColumn: {
    flex: 1.05,
    minWidth: 0,
  },
  consultantSecondaryColumn: {
    flex: 0.95,
    minWidth: 0,
    gap: 16,
  },
  historyWideGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  historySidebarColumn: {
    flex: 0.95,
    minWidth: 0,
    gap: 16,
  },
  historyMainColumn: {
    flex: 1.05,
    minWidth: 0,
  },
  headerSurface: {
    ...cardShadow,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 22,
    backgroundColor: "#FCFDFC",
    borderWidth: softBorderWidth,
    borderColor: palette.border,
  },
  toolHeaderSurface: {
    ...cardShadow,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    backgroundColor: "#FCFDFC",
    borderWidth: softBorderWidth,
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
  headerHelpButton: {
    margin: 0,
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
    ...cardShadow,
    borderRadius: 16,
    padding: 24,
    gap: 16,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
  },
  tutorialModal: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 18,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    ...cardShadow,
  },
  tutorialList: {
    gap: 12,
  },
  tutorialItem: {
    color: palette.text,
    lineHeight: 22,
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
    gap: 8,
    paddingTop: 8,
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
    ...cardShadow,
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
    gap: 14,
  },
  logCard: {
    ...cardShadow,
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
    ...cardShadow,
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
    ...cardShadow,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: softBorderWidth,
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
    ...cardShadow,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    padding: 18,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  resultHeroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowBetweenStacked: {
    flexDirection: "column",
    alignItems: "stretch",
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
    ...cardShadow,
    backgroundColor: "#FCFDFC",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
  },
  segmentedCard: {
    ...cardShadow,
    backgroundColor: "#FCFDFC",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
  },
  segmentedButtons: {
    backgroundColor: palette.surfaceSoft,
  },
  formCardContent: {
    gap: 18,
  },
  optionalContextCard: {
    borderRadius: 18,
    borderWidth: softBorderWidth,
    borderColor: "rgba(40, 85, 74, 0.08)",
    backgroundColor: "#F7FBF9",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  formTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  paperInput: {
    backgroundColor: "#FFFFFF",
  },
  inputOutline: {
    borderRadius: 14,
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
  segmentButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  segmentText: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
  },
  verdictPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  verdictPillText: {
    fontFamily: "Poppins_600SemiBold",
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
    ...cardShadow,
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
    ...cardShadow,
    backgroundColor: "#FCFDFC",
    borderWidth: 1,
    borderColor: "rgba(40, 85, 74, 0.08)",
    borderRadius: 24,
  },
  progressChip: {
    backgroundColor: palette.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(40, 85, 74, 0.12)",
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
    alignItems: "center",
    gap: 12,
  },
  stepAvatar: {
    backgroundColor: palette.primarySoft,
  },
  stepHeaderCompact: {
    gap: 8,
  },
  stepTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
    flexShrink: 1,
  },
  stepRoleLine: {
    color: palette.primary,
    lineHeight: 19,
  },
  stepDivider: {
    height: 1,
    backgroundColor: "rgba(31, 111, 102, 0.12)",
    marginVertical: 8,
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
    ...cardShadow,
    backgroundColor: "#FEFFFE",
    borderWidth: 1,
    borderColor: "rgba(40, 85, 74, 0.08)",
    borderRadius: 28,
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
  resultMetaRowWide: {
    alignItems: "stretch"
  },
  resultMetaColumn: {
    flexDirection: "column",
  },
  resultSignalRow: {
    flexWrap: "wrap",
    gap: 10,
  },
  resultSignalRowWide: {
    flexDirection: "row",
  },
  resultSignalColumn: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  miniStat: {
    flexGrow: 1,
    flexBasis: 105,
    minWidth: 0,
    borderRadius: 18,
    backgroundColor: "#F6FBF8",
    borderWidth: 1,
    borderColor: "rgba(40, 85, 74, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  miniStatFullWidth: {
    width: "100%",
    flexBasis: "100%",
    flexGrow: 0,
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
    ...cardShadow,
    backgroundColor: "#FCFDFC",
    borderWidth: softBorderWidth,
    borderColor: "rgba(40, 85, 74, 0.08)",
    borderRadius: 24,
  },
  expandableHeader: {
    borderRadius: 12,
  },
  expandableIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  signalPill: {
    flexGrow: 1,
    flexBasis: 106,
    minWidth: 96,
    width: "100%",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    ...cardShadow,
    backgroundColor: "#FEFFFE",
    borderWidth: softBorderWidth,
    borderColor: "rgba(40, 85, 74, 0.08)",
    borderRadius: 18,
  },
  evidenceTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
    flexShrink: 1,
  },
  evidenceUrl: {
    color: palette.primary,
    textDecorationLine: "underline",
    lineHeight: 20,
    flexShrink: 1,
  },
  quoteBox: {
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: softBorderWidth,
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
    ...cardShadow,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchbar: {
    borderRadius: 18,
    backgroundColor: "#FCFDFC",
    borderWidth: 1,
    borderColor: "rgba(16, 24, 40, 0.08)",
  },
  floatingFieldWrap: {
    position: "relative",
    zIndex: 12,
  },
  searchbarInput: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  suggestionFlyout: {
    ...floatingShadow,
    position: "absolute",
    left: 0,
    right: 0,
    top: 66,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderRadius: 22,
  },
  suggestionFlyoutContent: {
    gap: 12,
    paddingVertical: 12,
  },
  suggestionGroup: {
    gap: 6,
  },
  suggestionDivider: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  suggestionLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chipRow: {
    gap: 10,
    paddingRight: 12,
    paddingBottom: 2,
  },
  statusChipCompact: {
    alignSelf: "flex-start",
  },
  historySwipeShell: {
    position: "relative",
  },
  historyRails: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    borderRadius: 20,
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
    ...cardShadow,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    padding: 20,
    position: "relative",
  },
  historyCardWebActions: {
    position: "absolute",
    right: 14,
    bottom: 12,
    flexDirection: "row",
    gap: 4,
  },
  webActionButton: {
    margin: 0,
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: palette.surfaceSoft,
  },
  webPinButton: {
    backgroundColor: palette.pinSoft,
  },
  webDeleteButton: {
    backgroundColor: palette.dangerSoft,
  },
  historyCardPinned: {
    borderColor: "#E2C46C",
    backgroundColor: "#FFFBEF",
  },
  historyCardDragging: {
    borderColor: palette.primary,
    backgroundColor: "#F7FCFA",
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
  historyMetaColumn: {
    alignItems: "flex-start",
  },
  historyMetaLine: {
    color: palette.muted,
    lineHeight: 18,
  },
  historyMetaDot: {
    color: palette.muted,
  },
  loadingCard: {
    ...cardShadow,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
  },
  loadingCardContent: {
    minHeight: 220,
    alignItems: "stretch",
    justifyContent: "center",
    gap: 12,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 21, 28, 0.28)",
    justifyContent: "flex-end",
  },
  sheetPanel: {
    ...floatingShadow,
    maxHeight: "86%",
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
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
    ...floatingShadow,
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(16, 24, 40, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bottomTabItem: {
    flex: 1,
    borderRadius: 18,
  },
  bottomTabContent: {
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
  },
  bottomTabBubble: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F7F4",
  },
  bottomTabBubbleSelected: {
    backgroundColor: palette.primarySoft,
  },
  bottomTabAvatar: {
    backgroundColor: "transparent",
  },
  bottomTabAvatarSelected: {
    backgroundColor: "transparent",
  },
  bottomTabLabel: {
    color: palette.primary,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  bottomTabLabelSelected: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
  },
  snackbar: {
    backgroundColor: palette.text,
    bottom: 116,
  },
  scoreChip: {
    borderRadius: 999,
    paddingHorizontal: 4,
  },
  scoreChipText: {
    fontFamily: "Poppins_700Bold",
  },
  loadingBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.primarySoft,
  },
  loadingBadgeText: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    textTransform: "uppercase",
  },
  loadingTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  loadingSkeleton: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "#E7EEE9",
  },
  loadingSkeletonShort: {
    width: "52%",
  },
  loadingSkeletonMedium: {
    width: "72%",
  },
  loadingSkeletonLong: {
    width: "100%",
  },
  comparisonCard: {
    ...cardShadow,
    width: clampNumber(Dimensions.get("window").width - 96, 220, 320),
    maxWidth: "100%",
    borderRadius: 14,
    backgroundColor: palette.surfaceSoft,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  comparisonCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  comparisonCardGridStacked: {
    flexDirection: "column",
  },
  comparisonCardStacked: {
    width: "100%",
  },
  comparisonInsightCard: {
    ...cardShadow,
    backgroundColor: palette.surfaceSoft,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    borderRadius: 16,
  },
  scopeWarningCard: {
    backgroundColor: palette.surfaceSoft,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    borderRadius: 14,
  },
  scopeWarningIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.warningSoft,
  },
  recentQueryCard: {
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  recentQueryRow: {
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  confidenceBarTrack: {
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
  },
  confidenceBarSegment: {
    height: "100%",
  },
});
