import React, { startTransition, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  NativeModules,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  defaultBootstrap,
  defaultHistory,
  palette,
  type AppTab,
  type BootstrapPayload,
  type FeaturedClaim,
  type InvestigationCollection,
  type InvestigationDetail,
  type InvestigationStatus,
  type InvestigationSummary
} from "./src/data";

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeTrim(value: unknown) {
  return safeText(value).trim();
}

function safeUpper(value: unknown) {
  return safeText(value).toUpperCase();
}

function safeLower(value: unknown) {
  return safeText(value).toLowerCase();
}

function metroHost(): string | null {
  const scriptURL = (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
  if (!scriptURL) {
    return null;
  }

  try {
    const normalized = scriptURL
      .replace(/^exp:\/\//, "http://")
      .replace(/^exps:\/\//, "https://");
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
    addCandidate("127.0.0.1:8000");
    addCandidate("localhost:8000");
  } else {
    addCandidate("127.0.0.1:8000");
    addCandidate("localhost:8000");
  }

  return candidates;
}

function resolveApiBaseUrl() {
  return buildApiBaseUrls()[0] || "http://127.0.0.1:8000";
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
    return `${fallback} (HTTP ${response.status})`;
  }

  return `${fallback} (HTTP ${response.status})`;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const displayFont = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: undefined
});
const androidStatusInset = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
const bottomBarOffset = Platform.OS === "android" ? 24 : 18;
const contentBottomPadding = Platform.OS === "android" ? 164 : 144;

const healthSnapshot = [
  { label: "Heart rate", value: "68 bpm", note: "Resting average", tone: "red" as Tone, icon: "heart" as IconKind },
  { label: "Sleep", value: "7h 42m", note: "Last night", tone: "blue" as Tone, icon: "sleep" as IconKind },
  { label: "Steps", value: "8,420", note: "Daily activity", tone: "lime" as Tone, icon: "steps" as IconKind },
  { label: "Hydration", value: "2.1 L", note: "Today", tone: "aqua" as Tone, icon: "water" as IconKind }
];

const mealLogs = [
  { title: "Breakfast", subtitle: "Greek yogurt, berries, chia, coffee", time: "08:10", tone: "blue" as Tone, icon: "meal" as IconKind },
  { title: "Lunch", subtitle: "Salmon bowl with rice, greens, avocado", time: "13:05", tone: "aqua" as Tone, icon: "meal" as IconKind },
  { title: "Snack", subtitle: "Apple and mixed nuts", time: "16:20", tone: "lime" as Tone, icon: "meal" as IconKind }
];

const medicationLogs = [
  { title: "Vitamin D3", subtitle: "1 capsule · with breakfast", time: "08:15", tone: "lime" as Tone, icon: "medicine" as IconKind },
  { title: "Omega-3", subtitle: "2 softgels · with lunch", time: "13:10", tone: "aqua" as Tone, icon: "medicine" as IconKind },
  { title: "Cetirizine", subtitle: "10 mg · evening as needed", time: "21:00", tone: "blue" as Tone, icon: "medicine" as IconKind }
];

const profileSections = [
  { title: "Health profile", body: "Aly Tan, 29. Female. 168 cm, 61 kg. Light exercise 4 times weekly. Focused on sleep quality, skin health, and energy stability." },
  { title: "Conditions and flags", body: "Mild seasonal allergies, occasional eczema flares, family history of hypertension. No diabetes, no known cardiovascular disease." },
  { title: "Current routine", body: "Breakfast around 8 AM, lunch around 1 PM, 2 cups of coffee daily, 7 to 8 hours sleep target, 10,000-step weekly average goal." },
  { title: "Medications and supplements", body: "Cetirizine as needed, Vitamin D3 daily, Omega-3 daily, magnesium glycinate occasionally for sleep." }
];

const pipelineStageMeta: Array<{ key: string; title: string; icon: IconKind }> = [
  { key: "claim", title: "Claim analysis", icon: "fact" },
  { key: "planner", title: "Query planning", icon: "search" },
  { key: "search", title: "Source discovery", icon: "insights" },
  { key: "validate", title: "Website validation", icon: "shield" },
  { key: "relevance", title: "Relevance filter", icon: "filter" },
  { key: "classify", title: "Evidence ranking", icon: "layers" },
  { key: "citations", title: "Citation audit", icon: "quote" },
  { key: "quotes", title: "Quote check", icon: "quote" },
  { key: "sentiment", title: "Dual stance review", icon: "consultant" },
  { key: "decision", title: "Decision engine", icon: "fact" },
  { key: "review", title: "Verdict review", icon: "shield" },
  { key: "consensus", title: "Consensus check", icon: "layers" },
  { key: "report", title: "Gemini summary", icon: "summary" }
];

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(resolveApiBaseUrl);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload>(defaultBootstrap);
  const [history, setHistory] = useState<InvestigationSummary[]>(defaultHistory);
  const [historyOrder, setHistoryOrder] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInvestigation, setSelectedInvestigation] = useState<InvestigationDetail | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySheetDetail, setHistorySheetDetail] = useState<InvestigationDetail | null>(null);
  const [historySheetVisible, setHistorySheetVisible] = useState(false);
  const [historySheetLoading, setHistorySheetLoading] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimDraft, setClaimDraft] = useState("Gut health supplements can fix eczema");
  const [contextDraft, setContextDraft] = useState("Focus on whether evidence supports the wording and whether blogs are overclaiming.");
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [depth, setDepth] = useState<"standard" | "deep">("deep");

  useEffect(() => {
    void warmApiConnection();
    void loadBootstrap();
    void loadHistory();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedInvestigation(null);
      return;
    }
    void loadInvestigation(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedInvestigation || !isRunning(selectedInvestigation.status)) {
      return;
    }

    const interval = setInterval(() => {
      void loadInvestigation(selectedInvestigation.id, false);
      void loadHistory(false);
    }, 2200);

    return () => clearInterval(interval);
  }, [selectedInvestigation]);

  const filteredHistory = useMemo(() => {
    const query = safeLower(safeTrim(historyQuery));
    const ordered = [
      ...history
        .slice()
        .sort((a, b) => {
          const aIndex = historyOrder.indexOf(a.id);
          const bIndex = historyOrder.indexOf(b.id);
          const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
          const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
          return safeA - safeB;
        }),
    ];
    if (!query) {
      return ordered;
    }
    return ordered.filter((item) => safeLower(`${safeText(item.claim)} ${safeText(item.summary)}`).includes(query));
  }, [history, historyOrder, historyQuery]);

  async function requestApi(path: string, init?: RequestInit) {
    const candidates = buildApiBaseUrls(apiBaseUrl);
    let lastError: Error | null = null;
    const timeoutMs = path === "/health" ? 1200 : 3500;

    for (const candidate of candidates) {
      try {
        const response = await fetchWithTimeout(`${candidate}${path}`, init, timeoutMs);
        if (candidate !== apiBaseUrl) {
          setApiBaseUrl(candidate);
        }
        setApiError(null);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Network request failed");
      }
    }

    console.warn("API request failed", { path, candidates, error: lastError?.message });
    const message = "Connection issue. The app couldn't reach the investigation service.";
    setApiError(message);
    throw lastError ?? new Error(message);
  }

  async function warmApiConnection() {
    try {
      await requestApi("/health");
    } catch {
      // The regular screen loaders already fall back gracefully.
    }
  }

  async function retryBackendConnection() {
    try {
      await requestApi("/health");
      await loadBootstrap();
      await loadHistory();
      Alert.alert("Connection restored", "The investigation service is reachable again.");
    } catch (error) {
      console.warn("Backend retry failed", error);
      Alert.alert("Still reconnecting", "The app still cannot reach the investigation service. Please try again in a moment.");
    }
  }

  async function loadBootstrap() {
    try {
      const response = await requestApi("/api/bootstrap");
      if (!response.ok) {
        throw new Error(`Bootstrap failed with ${response.status}`);
      }
      const payload = (await response.json()) as BootstrapPayload;
      setBootstrap(payload);
    } catch {
      setBootstrap(defaultBootstrap);
    } finally {
      setLoadingBootstrap(false);
    }
  }

  async function loadHistory(showSpinner = true) {
    if (showSpinner) {
      setLoadingHistory(true);
    }

    try {
      const response = await requestApi("/api/investigations");
      if (!response.ok) {
        throw new Error(`History failed with ${response.status}`);
      }
      const payload = (await response.json()) as InvestigationCollection;
      startTransition(() => {
        setHistory(payload.items);
        setHistoryOrder((current) => {
          const next = payload.items.map((item) => item.id);
          const preserved = current.filter((id) => next.includes(id));
          const additions = next.filter((id) => !preserved.includes(id));
          return [...preserved, ...additions];
        });
        if (!selectedId && payload.items[0]) {
          setSelectedId(payload.items[0].id);
        }
      });
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
      throw new Error(`Investigation failed with ${response.status}`);
    }
    return (await response.json()) as InvestigationDetail;
  }

  async function loadInvestigation(id: string, showSpinner = true) {
    if (showSpinner) {
      setLoadingSelected(true);
    }

    try {
      setSelectedInvestigation(await fetchInvestigation(id));
    } catch {
      if (showSpinner) {
        setSelectedInvestigation(null);
      }
    } finally {
      if (showSpinner) {
        setLoadingSelected(false);
      }
    }
  }

  async function submitInvestigation() {
    if (safeTrim(claimDraft).length < 5) {
      Alert.alert("Add a stronger prompt", "Enter a full claim so the agents have something meaningful to investigate.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await requestApi("/api/investigations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          claim: claimDraft,
          context: contextDraft,
          sourceUrls: sourceUrlDraft
            .split(/\s|,|\n/)
            .map((item) => safeTrim(item))
            .filter(Boolean),
          mode: "auto",
          desiredDepth: depth
        })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "The backend rejected the investigation request."));
      }

      const payload = (await response.json()) as InvestigationDetail;
      setSelectedId(payload.id);
      setSelectedInvestigation(payload);
      setActiveTab("consultant");
      await loadHistory(false);
    } catch (error) {
      console.warn("Could not start investigation", error);
      Alert.alert("Could not start investigation", "The app couldn't reach the investigation service. Tap retry and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openHistorySheet(id: string) {
    setHistorySheetVisible(true);
    setHistorySheetLoading(true);
    try {
      setHistorySheetDetail(await fetchInvestigation(id));
    } catch (error) {
      console.warn("Failed to open history item", error);
      setHistorySheetDetail(null);
      Alert.alert("Could not open result", "That saved investigation could not be loaded right now.");
    } finally {
      setHistorySheetLoading(false);
    }
  }

  function confirmDeleteHistory(id: string) {
    Alert.alert("Delete this investigation?", "This will remove the saved result from history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void deleteHistoryItem(id)
      }
    ]);
  }

  async function deleteHistoryItem(id: string) {
    try {
      const response = await requestApi(`/api/investigations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Delete failed"));
      }
      startTransition(() => {
        setHistory((current) => current.filter((item) => item.id !== id));
        setHistoryOrder((current) => current.filter((itemId) => itemId !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setSelectedInvestigation(null);
        }
      });
      if (historySheetDetail?.id === id) {
        setHistorySheetVisible(false);
        setHistorySheetDetail(null);
      }
    } catch (error) {
      console.warn("Failed to delete history item", error);
      Alert.alert("Delete failed", "The saved investigation could not be deleted.");
    }
  }

  function applyFeaturedClaim(item: FeaturedClaim) {
    setClaimDraft(item.claim);
    setContextDraft(item.whyItIsInteresting);
    setActiveTab("consultant");
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.background} />
      <View style={styles.appShell}>
        <ScrollView style={styles.screenScroller} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
          <TopBar brand={bootstrap.brand.name} tagline={bootstrap.brand.tagline} />

          {activeTab === "home" ? (
            <HomeScreen
              bootstrap={bootstrap}
              loadingBootstrap={loadingBootstrap}
              history={history}
              onUseClaim={applyFeaturedClaim}
              onOpenInvestigate={() => setActiveTab("consultant")}
            />
          ) : activeTab === "consultant" ? (
            <InvestigateScreen
              apiError={apiError}
              onRetryBackend={() => void retryBackendConnection()}
              claimDraft={claimDraft}
              setClaimDraft={setClaimDraft}
              contextDraft={contextDraft}
              setContextDraft={setContextDraft}
              sourceUrlDraft={sourceUrlDraft}
              setSourceUrlDraft={setSourceUrlDraft}
              depth={depth}
              setDepth={setDepth}
              submitting={submitting}
              onSubmit={() => void submitInvestigation()}
              investigation={selectedInvestigation}
              loadingSelected={loadingSelected}
              history={filteredHistory}
              loadingHistory={loadingHistory}
              historyQuery={historyQuery}
              setHistoryQuery={setHistoryQuery}
              onOpenHistory={(id) => void openHistorySheet(id)}
              onDeleteHistory={confirmDeleteHistory}
              onMoveHistoryUp={(id) => moveHistoryItem(id, -1)}
              onMoveHistoryDown={(id) => moveHistoryItem(id, 1)}
            />
          ) : activeTab === "nutrition" ? (
            <PlaceholderTab
              title="Diet / Nutrition Analyzer"
              subtitle="A clean placeholder for meal-quality scoring, nutrition pattern review, and food log insights."
              tone="lime"
            />
          ) : activeTab === "supplements" ? (
            <PlaceholderTab
              title="Medicine / Supplement Analyzer"
              subtitle="A focused placeholder for medication checks, supplement safety, and interaction-aware evidence reviews."
              tone="aqua"
            />
          ) : (
            <ProfileScreen history={history} />
          )}
        </ScrollView>

        <BottomTabBar activeTab={activeTab} onSelect={setActiveTab} />
        <HistorySheet
          visible={historySheetVisible}
          investigation={historySheetDetail}
          loading={historySheetLoading}
          onClose={() => {
            setHistorySheetVisible(false);
            setHistorySheetDetail(null);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function TopBar({ brand, tagline }: { brand: string; tagline: string }) {
  return (
    <View style={styles.topBar}>
      <View style={{ flex: 1 }}>
        <Text style={styles.topBarLabel}>EVIDENCE REVIEW</Text>
        <Text style={styles.topBarTitle}>{brand}</Text>
        <Text style={styles.topBarSubtitle}>{tagline}</Text>
      </View>

      <View style={styles.avatarShell}>
        <View style={styles.avatarGlow} />
        <Text style={styles.avatarText}>AI</Text>
      </View>
    </View>
  );
}

function HomeScreen({
  bootstrap,
  loadingBootstrap,
  history,
  onUseClaim,
  onOpenInvestigate
}: {
  bootstrap: BootstrapPayload;
  loadingBootstrap: boolean;
  history: InvestigationSummary[];
  onUseClaim: (item: FeaturedClaim) => void;
  onOpenInvestigate: () => void;
}) {
  const latest = history[0];

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Chip label="Daily health view" tone="lime" />
          <Chip label="Claim investigator" tone="aqua" />
        </View>

        <Text style={styles.heroTitle}>Daily health signals with claim-checking when you need it</Text>
        <Text style={styles.heroSubtitle}>
          GramWIN can track lightweight wellness context on the home screen, then switch into a stricter evidence-review flow whenever you want to investigate a new health claim.
        </Text>

        <View style={styles.heroActionRow}>
          <PrimaryButton label="Run investigation" onPress={onOpenInvestigate} icon={<AppIcon kind="play" color="#fffdfa" size={18} />} />
          <SecondaryButton
            label={latest ? `${statusLabel(latest.status)} latest run` : "No runs yet"}
            onPress={onOpenInvestigate}
            icon={<AppIcon kind="insights" color={palette.blue} size={18} />}
          />
        </View>

        <View style={styles.statsRow}>
          <MetricTile label="Saved Runs" value={String(history.length)} tone="blue" />
          <MetricTile label="Meals Logged" value={String(mealLogs.length)} tone="lime" />
          <MetricTile label="Medications" value={String(medicationLogs.length)} tone="aqua" />
        </View>
      </View>

      <SectionHeader title="Today’s health snapshot" body="A simple daily view for common wellness metrics while the deeper evidence workflow lives in the consultant tab." />

      <View style={styles.statsRow}>
        {healthSnapshot.map((item) => (
          <HealthMetricCard key={item.label} {...item} />
        ))}
      </View>

      <SectionHeader title="Meals log" body="A clean placeholder meal history with enough detail to make the home screen feel like a real health app." />

      <View style={styles.cardStack}>
        {mealLogs.map((item) => (
          <LogCard key={`${item.title}-${item.time}`} {...item} />
        ))}
      </View>

      <SectionHeader title="Medication log" body="Today’s routine medications and supplements can live here without crowding the evidence experience." />

      <View style={styles.cardStack}>
        {medicationLogs.map((item) => (
          <LogCard key={`${item.title}-${item.time}`} {...item} />
        ))}
      </View>

      <SectionHeader title="Claim ideas" body={loadingBootstrap ? "Loading starting prompts..." : "Tap one to seed the investigator immediately."} />

      <View style={styles.quickPromptGrid}>
        {bootstrap.featuredClaims.map((item, index) => (
          <Pressable
            key={item.id}
            style={[styles.quickPromptCard, index === 0 ? toneStyles.lime.soft : index === 1 ? toneStyles.aqua.soft : toneStyles.blue.soft]}
            onPress={() => onUseClaim(item)}
          >
            <Text style={styles.quickPromptText}>{item.claim}</Text>
            <Text style={styles.quickPromptSubtext}>{item.whyItIsInteresting}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Agent team" body="Each specialist has a clear role, and major AI reasoning stages now include a second checker before the result settles." />

      <View style={styles.cardStack}>
        {bootstrap.architecture.map((block, index) => (
          <View key={block.id} style={[styles.infoCard, index % 3 === 0 ? toneStyles.blue.soft : index % 3 === 1 ? toneStyles.lime.soft : toneStyles.aqua.soft]}>
            <Text style={styles.infoCardTitle}>{block.title}</Text>
            <Text style={styles.infoCardBody}>{block.summary}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InvestigateScreen({
  apiError,
  onRetryBackend,
  claimDraft,
  setClaimDraft,
  contextDraft,
  setContextDraft,
  sourceUrlDraft,
  setSourceUrlDraft,
  depth,
  setDepth,
  submitting,
  onSubmit,
  investigation,
  loadingSelected,
  history,
  loadingHistory,
  historyQuery,
  setHistoryQuery,
  onOpenHistory,
  onDeleteHistory,
  onMoveHistoryUp,
  onMoveHistoryDown
}: {
  apiError: string | null;
  onRetryBackend: () => void;
  claimDraft: string;
  setClaimDraft: (value: string) => void;
  contextDraft: string;
  setContextDraft: (value: string) => void;
  sourceUrlDraft: string;
  setSourceUrlDraft: (value: string) => void;
  depth: "standard" | "deep";
  setDepth: (value: "standard" | "deep") => void;
  submitting: boolean;
  onSubmit: () => void;
  investigation: InvestigationDetail | null;
  loadingSelected: boolean;
  history: InvestigationSummary[];
  loadingHistory: boolean;
  historyQuery: string;
  setHistoryQuery: (value: string) => void;
  onOpenHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onMoveHistoryUp: (id: string) => void;
  onMoveHistoryDown: (id: string) => void;
}) {
  return (
    <View style={styles.pageStack}>
      <View style={styles.panel}>
        <Text style={styles.sectionEyebrow}>START A RUN</Text>
        <Text style={styles.pageTitle}>Investigate a claim</Text>
        <Text style={styles.pageSubtitle}>Search a claim, run the full evidence pipeline, and reopen prior investigations from one place. The interface stays clean while the reasoning stays strict.</Text>
        {apiError ? (
          <View style={styles.connectionBanner}>
            <Text style={styles.connectionBannerTitle}>No connection</Text>
            <Text style={styles.connectionBannerBody}>{apiError}</Text>
            <SecondaryButton label="Reconnecting..." onPress={onRetryBackend} icon={<AppIcon kind="history" color={palette.blue} size={18} />} />
          </View>
        ) : null}

        <TextInput
          style={styles.primaryInput}
          value={claimDraft}
          onChangeText={setClaimDraft}
          placeholder="Enter a health or wellness claim"
          placeholderTextColor={palette.muted}
        />

        <TextInput
          style={styles.notesInput}
          multiline
          value={contextDraft}
          onChangeText={setContextDraft}
          placeholder="Optional context: audience, symptom, source suspicion, or what you want the agents to focus on"
          placeholderTextColor={palette.muted}
        />

        <TextInput
          style={styles.notesInput}
          multiline
          value={sourceUrlDraft}
          onChangeText={setSourceUrlDraft}
          placeholder="Optional source URLs, one per line or comma-separated"
          placeholderTextColor={palette.muted}
        />

        <View style={styles.segmentedRow}>
          <SegmentButton selected={depth === "standard"} label="Standard depth" onPress={() => setDepth("standard")} />
          <SegmentButton selected={depth === "deep"} label="Deep dive" onPress={() => setDepth("deep")} />
        </View>

        <Pressable style={[styles.primaryAction, submitting && styles.primaryActionDisabled]} onPress={onSubmit} disabled={submitting}>
          <Text style={styles.primaryActionText}>{submitting ? "Starting..." : "Launch investigation"}</Text>
        </Pressable>
      </View>

      <SectionHeader title="Current result" body="The report stays hidden until the full pipeline finishes, then only the verdict, evidence, and plain-language explanation are shown." />

      {loadingSelected ? (
        <LoadingCard text="Loading investigation..." />
      ) : investigation ? (
        <InvestigationResultView investigation={investigation} />
      ) : (
        <EmptyState
          title="No investigation selected"
          body="Start a run or choose one from History to inspect the full multi-agent output."
        />
      )}

      <SectionHeader title="History" body="Search previous investigations, tap to reopen, swipe left to delete, or drag to reorder." />
      <TextInput
        style={styles.primaryInput}
        value={historyQuery}
        onChangeText={setHistoryQuery}
        placeholder="Search past claims"
        placeholderTextColor={palette.muted}
      />

      {loadingHistory ? (
        <LoadingCard text="Loading investigation history..." />
      ) : history.length > 0 ? (
        <View style={styles.cardStack}>
          {history.map((item, index) => (
            <SwipeHistoryCard
              key={item.id}
              item={item}
              canMoveUp={index > 0}
              canMoveDown={index < history.length - 1}
              onOpen={onOpenHistory}
              onDelete={onDeleteHistory}
              onMoveUp={onMoveHistoryUp}
              onMoveDown={onMoveHistoryDown}
            />
          ))}
        </View>
      ) : (
        <EmptyState title="No saved runs found" body="Your completed investigations will appear here." />
      )}
    </View>
  );
}

function HistoryScreen({
  history,
  loadingHistory,
  historyQuery,
  setHistoryQuery,
  onOpen,
  onDelete,
  onMoveUp,
  onMoveDown
}: {
  history: InvestigationSummary[];
  loadingHistory: boolean;
  historyQuery: string;
  setHistoryQuery: (value: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  return (
    <View style={styles.pageStack}>
      <SectionHeader title="History" body="Search past claims, tap a card to reopen it, swipe left to delete, or drag vertically to reorder." />
      <TextInput
        style={styles.primaryInput}
        value={historyQuery}
        onChangeText={setHistoryQuery}
        placeholder="Search past claims"
        placeholderTextColor={palette.muted}
      />

      {loadingHistory ? (
        <LoadingCard text="Loading investigation history..." />
      ) : history.length > 0 ? (
        <View style={styles.cardStack}>
          {history.map((item, index) => (
            <SwipeHistoryCard
              key={item.id}
              item={item}
              canMoveUp={index > 0}
              canMoveDown={index < history.length - 1}
              onOpen={onOpen}
              onDelete={onDelete}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
            />
          ))}
        </View>
      ) : (
        <EmptyState title="No saved runs found" body="Launch your first investigation from the Investigate tab or adjust your search." />
      )}
    </View>
  );
}

function SwipeHistoryCard({
  item,
  canMoveUp,
  canMoveDown,
  onOpen,
  onDelete,
  onMoveUp,
  onMoveDown
}: {
  item: InvestigationSummary;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const translateX = useState(() => new Animated.Value(0))[0];
  const translateY = useState(() => new Animated.Value(0))[0];
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 12,
        onPanResponderMove: (_, gesture) => {
          if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            translateY.setValue(0);
            translateX.setValue(Math.min(0, gesture.dx));
            return;
          }
          translateX.setValue(0);
          translateY.setValue(Math.max(-30, Math.min(30, gesture.dy)));
        },
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            if (gesture.dx < -90) {
              Animated.timing(translateX, {
                toValue: -140,
                duration: 120,
                useNativeDriver: true
              }).start(() => onDelete(item.id));
              return;
            }
            Animated.parallel([
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true
              }),
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true
              })
            ]).start();
            return;
          }

          if (gesture.dy < -70 && canMoveUp) {
            onMoveUp(item.id);
          } else if (gesture.dy > 70 && canMoveDown) {
            onMoveDown(item.id);
          }

          Animated.parallel([
            Animated.timing(translateX, {
              toValue: 0,
              duration: 140,
              useNativeDriver: true
            }),
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true
            })
          ]).start();
        }
      }),
    [canMoveDown, canMoveUp, item.id, onDelete, onMoveDown, onMoveUp, translateX, translateY]
  );

  return (
    <View style={styles.historySwipeShell}>
      <View style={styles.historyDeleteRail}>
        <View style={styles.historyDeleteRailIcon}>
          <AppIcon kind="trash" color={palette.red} size={18} />
        </View>
      </View>
      <Animated.View style={{ transform: [{ translateX }, { translateY }] }} {...panResponder.panHandlers}>
        <Pressable style={styles.historyCard} onPress={() => onOpen(item.id)}>
          <View style={styles.agentCardTop}>
            <Text style={styles.historyClaim}>{item.claim}</Text>
            <View style={styles.historyCardHeaderSide}>
              <Chip label={item.verdict ? verdictLabel(item.verdict) : statusLabel(item.status)} tone={item.verdict ? verdictTone(item.verdict) : statusTone(item.status)} />
              <View style={styles.historyGrip}>
                <AppIcon kind="drag" color={palette.muted} size={16} />
              </View>
            </View>
          </View>
          <Text style={styles.historySummary}>{item.summary}</Text>
          <View style={styles.historyMetaRow}>
            <Text style={styles.historyMetaText}>{formatTimestamp(item.createdAt)}</Text>
            <Text style={styles.historyMetaDot}>•</Text>
            <Text style={styles.historyMetaText}>{item.desiredDepth === "deep" ? "Deep review" : "Standard review"}</Text>
            <Text style={styles.historyMetaDot}>•</Text>
            <Text style={styles.historyMetaText}>{item.overallScore !== null ? `${item.overallScore}/100` : "--"}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function InvestigationResultView({ investigation }: { investigation: InvestigationDetail }) {
  const resultLabel = investigation.verdict ? verdictLabel(investigation.verdict) : statusLabel(investigation.status);
  const resultTone = investigation.verdict ? verdictTone(investigation.verdict) : statusTone(investigation.status);
  const showProcessing = isRunning(investigation.status);
  const truthSignal = safeText(investigation.truthClassification || truthSignalLabel(investigation.verdict));

  if (showProcessing) {
    return (
      <ProcessingReport investigation={investigation} resultLabel={resultLabel} resultTone={resultTone} />
    );
  }

  return (
    <>
      <View style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Chip label={resultLabel} tone={resultTone} />
          <Chip label={investigation.confidenceLevel ? `${safeUpper(investigation.confidenceLevel)} CONFIDENCE` : "ANALYZING"} tone={confidenceTone(investigation.confidenceLevel)} />
          {truthSignal ? <Chip label={truthSignal} tone={truthSignalTone(investigation.verdict)} /> : null}
        </View>

        <Text style={styles.heroTitle}>{investigation.claim}</Text>
        <Text style={styles.heroSubtitle}>{investigation.verdictSummary || investigation.summary}</Text>
        {investigation.expertInsight && investigation.expertInsight !== investigation.verdictSummary ? (
          <Text style={styles.pageSubtitle}>{investigation.expertInsight}</Text>
        ) : null}

        <View style={styles.statsRow}>
          <MetricTile label="Credibility Score" value={investigation.overallScore !== null ? String(investigation.overallScore) : "--"} tone="blue" />
          <MetricTile label="Confidence" value={investigation.confidenceLevel ? safeUpper(investigation.confidenceLevel) : "--"} tone="aqua" />
          <MetricTile label="Verdict" value={resultLabel} tone={resultTone} />
        </View>
      </View>

      <AccordionCard title="AI Summary" summary="Gemini-generated closing summary checked by a second model before it reaches the app.">
        <Text style={styles.resultSummaryText}>{investigation.aiSummary || investigation.finalNarrative || investigation.expertInsight}</Text>
      </AccordionCard>

      <AccordionCard title="How It Checked This" summary="Major reasoning stages, filters, and verification steps that shaped the final result.">
        <View style={styles.cardStack}>
          {investigation.stepSummaries.map((step) => (
            <StepAccordion key={step.key} step={step} />
          ))}
        </View>
      </AccordionCard>

      <AccordionCard title="Evidence" summary={`${investigation.sources.length} visible sources grouped into strongest support, mixed context, and contradictions.`}>
        <View style={styles.groupStack}>
          {investigation.sourceGroups.map((group) => (
            <EvidenceGroupCard key={group.key} group={group} />
          ))}
        </View>
      </AccordionCard>

      <AccordionCard title="Key Findings" summary={`${investigation.keyFindings.length || investigation.strengths.length} concise takeaways extracted from the strongest evidence.`}>
        <View style={styles.cardStack}>
          {(investigation.keyFindings.length > 0 ? investigation.keyFindings : investigation.strengths).map((item) => (
            <BulletRow key={item} text={item} tone="lime" />
          ))}
        </View>
      </AccordionCard>

      <AccordionCard title="Contradictions" summary={`${investigation.contradictions.length || investigation.concerns.length} contradiction checks kept visible instead of hidden.`}>
        <View style={styles.cardStack}>
          {(investigation.contradictions.length > 0 ? investigation.contradictions : investigation.concerns).map((item) => (
            <BulletRow key={item} text={item} tone="red" />
          ))}
        </View>
      </AccordionCard>

      {investigation.discoveredDomains.length > 0 ? (
        <AccordionCard title="Source Network" summary="New source domains are learned over time so the system is not artificially restricted to a fixed list.">
          <View style={styles.domainChipRow}>
            {investigation.discoveredDomains.map((domain) => (
              <View key={domain} style={styles.domainChip}>
                <AppIcon kind="link" color={palette.blue} size={14} />
                <Text style={styles.domainChipText}>{domain}</Text>
              </View>
            ))}
          </View>
        </AccordionCard>
      ) : null}
    </>
  );
}

function ProcessingReport({
  investigation,
  resultLabel,
  resultTone
}: {
  investigation: InvestigationDetail;
  resultLabel: string;
  resultTone: Tone;
}) {
  const steps = processingStages(investigation);
  const progress = processingPercent(investigation, steps);
  const recentEvents = investigation.progressEvents.slice(-4);

  return (
    <>
      <View style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Chip label={resultLabel} tone={resultTone} />
          <Chip label="PIPELINE RUNNING" tone="aqua" />
        </View>

        <Text style={styles.heroTitle}>{investigation.claim}</Text>
        <Text style={styles.heroSubtitle}>GramWIN is still validating websites, filtering relevance, cross-checking evidence, and drafting the final claim judgment.</Text>
      </View>

      <View style={styles.processingCard}>
        <View style={styles.processingHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.processingTitle}>Processing report</Text>
            <Text style={styles.processingBody}>The report renders after the full pipeline completes, but you can still watch progress while the agents work.</Text>
          </View>
          <View style={styles.processingBadge}>
            <Text style={styles.processingBadgeText}>{progress}%</Text>
          </View>
        </View>

        <AnimatedProgressBar progress={progress} />

        <View style={styles.cardStack}>
          {steps.map((step) => (
            <ProcessingStepRow key={step.key} step={step} />
          ))}
        </View>

        {recentEvents.length > 0 ? (
          <View style={styles.processingEventStack}>
            <Text style={styles.processingSubheading}>Recent activity</Text>
            {recentEvents.map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <Text style={styles.eventText}>{event.message}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}

function AnimatedProgressBar({ progress }: { progress: number }) {
  const progressValue = useState(() => new Animated.Value(Math.max(0, Math.min(100, progress))))[0];
  const glowValue = useState(() => new Animated.Value(0.45))[0];

  useEffect(() => {
    Animated.timing(progressValue, {
      toValue: Math.max(0, Math.min(100, progress)),
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [progress, progressValue]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowValue, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(glowValue, { toValue: 0.45, duration: 700, useNativeDriver: false })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowValue]);

  const width = progressValue.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"]
  });

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width, opacity: glowValue }]} />
    </View>
  );
}

function ProcessingStepRow({ step }: { step: ReturnType<typeof processingStages>[number] }) {
  const active = step.status === "running" || step.status === "pending";
  const tone = step.status === "failed" ? "red" : step.status === "completed" ? "lime" : "aqua";

  return (
    <View style={styles.processingStepCard}>
      <View style={[styles.processingStepIconWrap, toneStyles[tone].soft]}>
        {active ? <ActivityIndicator size="small" color={palette.blue} /> : <AppIcon kind={step.icon} color={tone === "red" ? palette.red : palette.blue} size={16} />}
      </View>
      <View style={styles.processingStepCopy}>
        <Text style={styles.processingStepTitle}>{step.title}</Text>
        <Text style={styles.processingStepBody}>{step.summary}</Text>
      </View>
      <Chip label={statusLabelFromAgent(step.status)} tone={tone} />
    </View>
  );
}

function StepAccordion({ step }: { step: InvestigationDetail["stepSummaries"][number] }) {
  return (
    <AccordionCard
      title={step.title}
      summary={step.summary}
      leading={<StepStatusIndicator status={step.status as InvestigationStatus} />}
      compact
    >
      <View style={styles.cardStack}>
        {step.details.map((item) => (
          <BulletRow key={item} text={item} tone={step.status === "failed" ? "red" : "blue"} />
        ))}
      </View>
    </AccordionCard>
  );
}

function EvidenceGroupCard({ group }: { group: InvestigationDetail["sourceGroups"][number] }) {
  return (
    <View style={styles.groupCard}>
      <Text style={styles.groupTitle}>{group.title}</Text>
      <Text style={styles.groupSummary}>{group.summary}</Text>
      <View style={styles.cardStack}>
        {group.sources.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </View>
    </View>
  );
}

function HistorySheet({
  visible,
  investigation,
  loading,
  onClose
}: {
  visible: boolean;
  investigation: InvestigationDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const translateY = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
    }
  }, [translateY, visible]);

  const dismissSheet = () => {
    Animated.timing(translateY, {
      toValue: 420,
      duration: 180,
      useNativeDriver: true
    }).start(() => {
      translateY.setValue(0);
      onClose();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 120 || gesture.vy > 1.1) {
            dismissSheet();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true
          }).start();
        }
      }),
    [translateY]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetDismissArea} onPress={onClose} />
        <Animated.View style={[styles.sheetPanel, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Saved Result</Text>
            <Pressable onPress={dismissSheet}>
              <Text style={styles.sheetClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
            {loading ? <LoadingCard text="Opening saved result..." /> : investigation ? <InvestigationResultView investigation={investigation} /> : <EmptyState title="No result loaded" body="Select another saved investigation to continue." />}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function PlaceholderTab({
  title,
  subtitle,
  tone
}: {
  title: string;
  subtitle: string;
  tone: Tone;
}) {
  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Chip label="Coming next" tone={tone} />
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.cardStack}>
        <View style={[styles.infoCard, toneStyles[tone].soft]}>
          <Text style={styles.infoCardTitle}>Planned experience</Text>
          <Text style={styles.infoCardBody}>This section is scaffolded so we can expand it without disturbing the consultant workflow.</Text>
        </View>
      </View>
    </View>
  );
}

function ProfileScreen({ history }: { history: InvestigationSummary[] }) {
  const completedCount = history.filter((item) => item.status === "completed").length;
  const latestScore = history.find((item) => item.overallScore !== null)?.overallScore;

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Chip label="Profile" tone="blue" />
        <Text style={styles.heroTitle}>Personal health profile</Text>
        <Text style={styles.heroSubtitle}>Dummy profile data for the premium app shell: useful context, everyday routines, and the kind of health details that could guide future personalization.</Text>
        <View style={styles.statsRow}>
          <MetricTile label="Saved Runs" value={String(history.length)} tone="blue" />
          <MetricTile label="Completed" value={String(completedCount)} tone="lime" />
          <MetricTile label="Latest Score" value={latestScore !== undefined && latestScore !== null ? String(latestScore) : "--"} tone="aqua" />
        </View>
      </View>

      <View style={styles.cardStack}>
        {profileSections.map((section, index) => (
          <View key={section.title} style={[styles.infoCard, index % 3 === 0 ? toneStyles.blue.soft : index % 3 === 1 ? toneStyles.aqua.soft : toneStyles.lime.soft]}>
            <Text style={styles.infoCardTitle}>{section.title}</Text>
            <Text style={styles.infoCardBody}>{section.body}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StackScreen({ bootstrap }: { bootstrap: BootstrapPayload }) {
  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Text style={styles.heroTitle}>Backend shape</Text>
        <Text style={styles.heroSubtitle}>The codebase now maps to the multi-agent workflow you described: `agents`, `core`, `tools`, `knowledge`, `progress`, and `context`.</Text>
      </View>

      <SectionHeader title="Suggested libraries" body="These are the cleanest next upgrades for live search, academic retrieval, extraction, and LLM reasoning." />

      <View style={styles.cardStack}>
        {bootstrap.suggestedLibraries.map((item, index) => (
          <View key={item.id} style={[styles.libraryCard, index % 3 === 0 ? toneStyles.blue.soft : index % 3 === 1 ? toneStyles.aqua.soft : toneStyles.lime.soft]}>
            <Text style={styles.infoCardTitle}>{item.name}</Text>
            <Text style={styles.libraryMeta}>{item.category}</Text>
            <Text style={styles.infoCardBody}>{item.whyItHelps}</Text>
            <Text style={styles.libraryNote}>{item.adoptionNote}</Text>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <SectionHeader title="Persistence" body={bootstrap.storageNote} />
      </View>
    </View>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <View style={[styles.metricTile, toneStyles[tone].soft]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function HealthMetricCard({
  label,
  value,
  note,
  tone,
  icon
}: {
  label: string;
  value: string;
  note: string;
  tone: Tone;
  icon: IconKind;
}) {
  return (
    <View style={[styles.healthMetricCard, toneStyles[tone].soft]}>
      <View style={[styles.healthMetricIconWrap, toneStyles[tone].solid]}>
        <AppIcon kind={icon} color="#fffdfa" size={18} />
      </View>
      <Text style={styles.healthMetricLabel}>{label}</Text>
      <Text style={styles.healthMetricValue}>{value}</Text>
      <Text style={styles.healthMetricNote}>{note}</Text>
    </View>
  );
}

function LogCard({
  title,
  subtitle,
  time,
  tone,
  icon
}: {
  title: string;
  subtitle: string;
  time: string;
  tone: Tone;
  icon: IconKind;
}) {
  return (
    <View style={styles.logCard}>
      <View style={[styles.logIconWrap, toneStyles[tone].soft]}>
        <AppIcon kind={icon} color={palette.blue} size={18} />
      </View>
      <View style={styles.logCopyWrap}>
        <Text style={styles.logTitle}>{title}</Text>
        <Text style={styles.logSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.logTime}>{time}</Text>
    </View>
  );
}

function SourceCard({ source }: { source: InvestigationDetail["sources"][number] }) {
  const effectLabel = sentimentLabel(source.sentiment);
  const effectTone = sentimentTone(source.sentiment);
  const siteTitle = safeText(source.sourceName || source.domain || "Source");
  const explanation = safeText(source.evidence?.expertAnalysis || source.relevanceCheckSummary || source.sentimentSummary || source.relevanceSummary);
  const quotedText = safeText(source.evidence?.quoteVerified ? source.evidence?.quotedEvidence : "");
  const articleTitle = safeText(source.title);

  return (
    <View style={styles.sourceCard}>
      <View style={styles.agentCardTop}>
        <Pressable onPress={() => void Linking.openURL(source.url)} style={styles.sourceLinkWrap}>
          <View style={styles.sourceHeadingRow}>
            <View style={styles.sourceFaviconWrap}>
              <AppIcon kind="link" color={palette.blue} size={16} />
            </View>
            <Text style={styles.sourceTitle}>{siteTitle}</Text>
          </View>
        </Pressable>
        <Chip label={effectLabel} tone={effectTone} />
      </View>
      <Pressable onPress={() => void Linking.openURL(source.url)}>
        <Text style={styles.sourceUrl}>{source.url}</Text>
      </Pressable>
      {articleTitle && articleTitle !== siteTitle ? <Text style={styles.sourceMeta}>{articleTitle}</Text> : null}
      {quotedText ? <Text style={styles.sourceQuote}>"{quotedText}"</Text> : <Text style={styles.sourceSnippet}>{safeText(source.snippet)}</Text>}
      {explanation ? <Text style={styles.sourceMethodology}>{explanation}</Text> : null}
      <View style={styles.sourceEvidenceMeta}>
        <Text style={styles.sourceEvidenceMetaText}>Relevance {source.relevanceScore}/100</Text>
        <Text style={styles.sourceEvidenceMetaText}>{safeUpper(source.evidenceTier.replace(/_/g, " "))}</Text>
        <Text style={styles.sourceEvidenceMetaText}>{safeUpper(source.sourceBucket.replace(/_/g, " "))}</Text>
      </View>
    </View>
  );
}

function SentimentCard({ sentiment }: { sentiment: NonNullable<InvestigationDetail["sentiment"]> }) {
  return (
    <View style={styles.sentimentCard}>
      <Text style={styles.sentimentTitle}>Sentiment cross-check</Text>
      <Text style={styles.sentimentSummary}>{sentiment.summary}</Text>
      <View style={styles.sentimentRow}>
        <MiniMetric label="Positive" value={`${sentiment.positivePct}%`} tone="lime" />
        <MiniMetric label="Neutral" value={`${sentiment.neutralPct}%`} tone="aqua" />
        <MiniMetric label="Negative" value={`${sentiment.negativePct}%`} tone="red" />
      </View>
    </View>
  );
}

function ConsensusCard({
  consensus,
  llmAgreementScore
}: {
  consensus: NonNullable<InvestigationDetail["consensus"]>;
  llmAgreementScore: InvestigationDetail["llmAgreementScore"];
}) {
  return (
    <View style={styles.sentimentCard}>
      <Text style={styles.sentimentTitle}>Consensus breakdown</Text>
      <Text style={styles.sentimentSummary}>{consensus.summary}</Text>
      <View style={styles.sentimentRow}>
        <MiniMetric label="Support" value={String(consensus.supportingWeight)} tone="lime" />
        <MiniMetric label="Neutral" value={String(consensus.neutralWeight)} tone="aqua" />
        <MiniMetric label="Contradict" value={String(consensus.contradictingWeight)} tone="red" />
      </View>
      <Text style={styles.consensusFootnote}>
        Weighted evidence score: {consensus.credibilityScore}/100. Contradiction share: {Math.round(consensus.contradictionShare * 100)}%.
      </Text>
      {llmAgreementScore !== null ? <Text style={styles.consensusFootnote}>Verifier agreement: {llmAgreementScore}/100.</Text> : null}
    </View>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <View style={[styles.miniMetric, toneStyles[tone].soft]}>
      <Text style={styles.miniMetricValue}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  );
}

function AccordionCard({
  title,
  summary,
  children,
  leading,
  compact = false
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
  leading?: React.ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.accordionCard, compact && styles.accordionCardCompact]}>
      <Pressable style={styles.accordionHeader} onPress={() => setOpen((value) => !value)}>
        <View style={styles.accordionTitleRow}>
          {leading}
          <View style={styles.accordionHeadingWrap}>
            <View style={styles.accordionHeadingLine}>
              <Text style={styles.accordionTitle}>{title}</Text>
              <Text style={styles.accordionToggle}>{open ? "▴" : "▾"}</Text>
            </View>
            <Text style={styles.accordionSummary}>{summary}</Text>
          </View>
        </View>
      </Pressable>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function StepStatusIndicator({ status }: { status: InvestigationStatus | "pending" }) {
  return (
    <View style={[styles.stepIndicator, status === "completed" ? styles.stepIndicatorComplete : status === "failed" ? styles.stepIndicatorFailed : styles.stepIndicatorActive]}>
      {status === "running" || status === "queued" || status === "pending" ? <ActivityIndicator size="small" color={palette.blue} /> : <Text style={styles.stepIndicatorText}>{status === "failed" ? "!" : "✓"}</Text>}
    </View>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <View style={styles.loadingCard}>
      <ActivityIndicator size="large" color={palette.blue} />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function BulletRow({ text, tone }: { text: string; tone: Tone }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, toneStyles[tone].solid]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, icon }: { label: string; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Pressable style={styles.primaryButton} onPress={onPress}>
      {icon}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, icon }: { label: string; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      {icon}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SegmentButton({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, selected && styles.segmentButtonSelected]} onPress={onPress}>
      <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoPillText}>{label}</Text>
    </View>
  );
}

function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={[styles.chip, toneStyles[tone].soft]}>
      <Text style={[styles.chipText, toneStyles[tone].text]}>{label}</Text>
    </View>
  );
}

function BottomTabBar({ activeTab, onSelect }: { activeTab: AppTab; onSelect: (tab: AppTab) => void }) {
  const tabs: Array<{ key: AppTab; label: string }> = [
    { key: "home", label: "Home" },
    { key: "consultant", label: "Consultant" },
    { key: "nutrition", label: "Nutrition" },
    { key: "supplements", label: "Supplements" },
    { key: "profile", label: "Profile" }
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable key={tab.key} style={[styles.tabBarButton, activeTab === tab.key && styles.tabBarButtonSelected]} onPress={() => onSelect(tab.key)}>
          <View style={[styles.tabIconWrap, activeTab === tab.key && styles.tabIconWrapSelected]}>
            <TabIcon tab={tab.key} selected={activeTab === tab.key} />
          </View>
          <Text style={[styles.tabBarButtonText, activeTab === tab.key && styles.tabBarButtonTextSelected]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TabIcon({ tab, selected }: { tab: AppTab; selected: boolean }) {
  const color = selected ? palette.blue : "#8b8f99";
  if (tab === "home") {
    return <AppIcon kind="home" color={color} size={20} />;
  }
  if (tab === "consultant") {
    return <AppIcon kind="consultant" color={color} size={20} />;
  }
  if (tab === "nutrition") {
    return <AppIcon kind="nutrition" color={color} size={20} />;
  }
  if (tab === "supplements") {
    return <AppIcon kind="supplements" color={color} size={20} />;
  }
  if (tab === "profile") {
    return <AppIcon kind="profile" color={color} size={20} />;
  }
  return <AppIcon kind="home" color={color} size={20} />;
}

type IconKind =
  | "home"
  | "play"
  | "consultant"
  | "history"
  | "nutrition"
  | "supplements"
  | "profile"
  | "insights"
  | "trash"
  | "drag"
  | "heart"
  | "sleep"
  | "steps"
  | "water"
  | "meal"
  | "medicine"
  | "shield"
  | "summary"
  | "fact"
  | "filter"
  | "layers"
  | "quote"
  | "search"
  | "link";
type Tone = "lime" | "aqua" | "blue" | "red";

function AppIcon({ kind, color, size }: { kind: IconKind; color: string; size: number }) {
  const iconName: Record<IconKind, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
    home: "home-outline",
    play: "play-circle-outline",
    consultant: "stethoscope",
    history: "sync",
    nutrition: "food-apple-outline",
    supplements: "pill",
    profile: "account-outline",
    insights: "chart-box-outline",
    trash: "trash-can-outline",
    drag: "drag-vertical-variant",
    heart: "heart-pulse",
    sleep: "sleep",
    steps: "walk",
    water: "cup-water",
    meal: "silverware-fork-knife",
    medicine: "pill-multiple",
    shield: "shield-check-outline",
    summary: "text-box-outline",
    fact: "check-decagram-outline",
    filter: "filter-variant",
    layers: "layers-triple-outline",
    quote: "format-quote-close",
    search: "magnify",
    link: "link-variant"
  };

  return <MaterialCommunityIcons name={iconName[kind]} color={color} size={size} />;
}

function isRunning(status: InvestigationStatus) {
  return status === "queued" || status === "running";
}

function statusLabel(status: InvestigationStatus) {
  if (status === "queued") {
    return "QUEUED";
  }
  if (status === "running") {
    return "RUNNING";
  }
  if (status === "completed") {
    return "COMPLETED";
  }
  return "FAILED";
}

function statusTone(status: InvestigationStatus): Tone {
  if (status === "completed") {
    return "lime";
  }
  if (status === "failed") {
    return "red";
  }
  return "aqua";
}

function userFacingVerdict(verdict: InvestigationDetail["verdict"] | InvestigationSummary["verdict"]) {
  if (verdict === "trustworthy") {
    return "trustworthy";
  }
  if (verdict === "untrustworthy") {
    return "untrustworthy";
  }
  if (verdict === "mixed" || verdict === "overstated") {
    return "uncertain";
  }
  return "";
}

function verdictTone(verdict: InvestigationDetail["verdict"]): Tone {
  if (userFacingVerdict(verdict) === "trustworthy") {
    return "lime";
  }
  if (userFacingVerdict(verdict) === "untrustworthy") {
    return "red";
  }
  return "aqua";
}

function confidenceTone(confidence: InvestigationDetail["confidenceLevel"]): Tone {
  if (confidence === "high") {
    return "lime";
  }
  if (confidence === "medium") {
    return "aqua";
  }
  return "red";
}

function misinformationTone(risk: InvestigationDetail["misinformationRisk"]): Tone {
  if (risk === "low") {
    return "lime";
  }
  if (risk === "moderate") {
    return "blue";
  }
  return "red";
}

function verdictLabel(verdict: InvestigationDetail["verdict"]) {
  const simplified = userFacingVerdict(verdict);
  if (!simplified) {
    return "--";
  }
  return safeUpper(simplified.replace(/_/g, " "));
}

function sentimentTone(sentiment: InvestigationDetail["sources"][number]["sentiment"]): Tone {
  if (sentiment === "positive") {
    return "lime";
  }
  if (sentiment === "negative") {
    return "red";
  }
  return "aqua";
}

function sentimentLabel(sentiment: InvestigationDetail["sources"][number]["sentiment"]) {
  if (sentiment === "positive") {
    return "Supports";
  }
  if (sentiment === "negative") {
    return "Contradicts";
  }
  return "Uncertain";
}

function statusLabelFromAgent(status: InvestigationDetail["agentRuns"][number]["status"] | "pending") {
  if (status === "completed") {
    return "Done";
  }
  if (status === "failed") {
    return "Issue";
  }
  if (status === "running") {
    return "Working";
  }
  return "Queued";
}

function truthSignalLabel(verdict: InvestigationDetail["verdict"] | InvestigationSummary["verdict"]) {
  if (verdict === "trustworthy") {
    return "Likely fact pattern";
  }
  if (verdict === "untrustworthy") {
    return "Likely falsehood or hoax";
  }
  if (verdict) {
    return "Needs nuance";
  }
  return "";
}

function truthSignalTone(verdict: InvestigationDetail["verdict"]): Tone {
  if (verdict === "trustworthy") {
    return "lime";
  }
  if (verdict === "untrustworthy") {
    return "red";
  }
  return "blue";
}

function processingStages(investigation: InvestigationDetail) {
  const runMap = new Map(investigation.agentRuns.map((run) => [run.agentKey, run]));
  return pipelineStageMeta.map((stage) => {
    const run = runMap.get(stage.key);
    return {
      key: stage.key,
      title: stage.title,
      icon: stage.icon,
      status: run?.status ?? "pending",
      summary: run?.summary || fallbackProcessingSummary(stage.key, investigation)
    };
  });
}

function processingPercent(investigation: InvestigationDetail, steps: ReturnType<typeof processingStages>) {
  if (investigation.progressPercent > 0) {
    return investigation.progressPercent;
  }
  const completed = steps.filter((step) => step.status === "completed").length;
  return Math.round((completed / Math.max(1, steps.length)) * 100);
}

function fallbackProcessingSummary(key: string, investigation: InvestigationDetail) {
  const safeSummaries: Record<string, string> = {
    claim: investigation.claimAnalysis?.summary || "Claim language and semantics are being parsed.",
    planner: `${investigation.recommendedQueries.length || 1} semantic search routes are being prepared.`,
    search: `${investigation.sources.length} sources have been gathered so far.`,
    validate: "Website accessibility and readable text extraction are being checked.",
    relevance: "Weakly related pages are being filtered out before scoring.",
    classify: "Study strength and evidence quality are being ranked.",
    citations: "Citation chains and linked sources are being audited.",
    quotes: "Visible quotes are being checked against extracted source text.",
    sentiment: "Primary and checker models are comparing evidence direction.",
    decision: "Truth signal and hoax risk are being calibrated.",
    review: "A secondary model is checking the draft verdict.",
    consensus: "Cross-model disagreement is being used to adjust confidence.",
    report: "Gemini is drafting the user-facing summary and a second model is checking it."
  };
  return safeSummaries[key] || "This stage is in progress.";
}

function fallbackStepSummaries(investigation: InvestigationDetail): InvestigationDetail["stepSummaries"] {
  const safeSummaries: Record<string, string> = {
    claim: investigation.claimAnalysis?.summary || "Claim structure and wording are being assessed.",
    planner: `${investigation.recommendedQueries.length || 1} search paths prepared.`,
    query_generation: `${investigation.recommendedQueries.length || 1} search paths prepared.`,
    search: `${investigation.sources.length} sources collected so far.`,
    validate: `${investigation.sources.length} accessible sources survived validation so far.`,
    relevance: "Only claim-relevant sources are being kept for scoring.",
    classify: "Sources are being sorted by strength and evidence type.",
    citations: "Citation chains are being checked for strength and reliability.",
    quotes: "Only quotes that map directly to source text are kept.",
    sentiment: "Scientific and contradiction-focused sentiment reviews are being compared.",
    decision: investigation.verdictSummary || "The final verdict is being drafted.",
    review: "The draft verdict is being cross-checked for overreach.",
    consensus: investigation.consensus?.summary || "Consensus is being pressure-tested across stronger evidence.",
    report: "The final explanation is being polished."
  };

  return investigation.agentRuns.map((run) => ({
    key: run.agentKey,
    title: run.title,
    status: run.status,
    summary: safeSummaries[run.agentKey] || "This step is in progress.",
    details: []
  }));
}

const toneStyles = {
  lime: StyleSheet.create({
    solid: { backgroundColor: palette.lime },
    soft: { backgroundColor: "#eef9de" },
    text: { color: "#527b2f" }
  }),
  aqua: StyleSheet.create({
    solid: { backgroundColor: palette.aqua },
    soft: { backgroundColor: "#eafafd" },
    text: { color: "#1d8190" }
  }),
  blue: StyleSheet.create({
    solid: { backgroundColor: palette.blue },
    soft: { backgroundColor: "#eef3fb" },
    text: { color: palette.blue }
  }),
  red: StyleSheet.create({
    solid: { backgroundColor: palette.red },
    soft: { backgroundColor: "#fff0f0" },
    text: { color: palette.red }
  })
};

const shadow = {
  shadowColor: "#172a57",
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
    paddingTop: androidStatusInset
  },
  appShell: {
    flex: 1
  },
  screenScroller: {
    flex: 1
  },
  screenContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: contentBottomPadding,
    width: "100%",
    maxWidth: 960,
    alignSelf: "center"
  },
  pageStack: {
    gap: 22
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 22
  },
  topBarLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2
  },
  topBarTitle: {
    color: palette.ink,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 4
  },
  topBarSubtitle: {
    color: palette.muted,
    fontSize: 14,
    marginTop: 4
  },
  avatarShell: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: "#dff7b7",
    justifyContent: "center",
    alignItems: "center",
    ...shadow
  },
  avatarGlow: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: "#effad6"
  },
  avatarText: {
    color: palette.green,
    fontSize: 17,
    fontWeight: "900"
  },
  heroPanel: {
    backgroundColor: palette.surface,
    borderRadius: 34,
    padding: 22,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 18,
    ...shadow
  },
  heroTopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center"
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "700",
    fontFamily: displayFont
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 24
  },
  heroActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: palette.blue,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  primaryButtonText: {
    color: "#fffdfa",
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#f7f3ec",
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  secondaryButtonText: {
    color: palette.blue,
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 130,
    borderRadius: 22,
    padding: 14
  },
  metricValue: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  metricLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6
  },
  sectionHeader: {
    gap: 6
  },
  sectionEyebrow: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "700",
    fontFamily: displayFont
  },
  sectionBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  pageTitle: {
    color: palette.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    fontFamily: displayFont
  },
  pageSubtitle: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 23
  },
  connectionBanner: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "#fff6ec",
    borderWidth: 1,
    borderColor: "#f0d9b5",
    gap: 10
  },
  connectionBannerTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  connectionBannerBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21
  },
  backendHint: {
    color: palette.blue,
    fontSize: 13,
    fontWeight: "700"
  },
  backendWarning: {
    color: palette.red,
    fontSize: 13,
    lineHeight: 18
  },
  backendInput: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: palette.ink,
    backgroundColor: "#fffdf9"
  },
  panel: {
    backgroundColor: palette.surface,
    borderRadius: 30,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 14,
    ...shadow
  },
  quickPromptGrid: {
    gap: 12
  },
  quickPromptCard: {
    borderRadius: 24,
    padding: 18
  },
  quickPromptText: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "800"
  },
  quickPromptSubtext: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8
  },
  cardStack: {
    gap: 12
  },
  cardStackRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  infoCard: {
    borderRadius: 24,
    padding: 18
  },
  infoCardTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  infoCardBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    flexShrink: 1
  },
  healthMetricCard: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 145,
    borderRadius: 24,
    padding: 16,
    gap: 8
  },
  healthMetricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center"
  },
  healthMetricLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  healthMetricValue: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  healthMetricNote: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18
  },
  logCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    ...shadow
  },
  logIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center"
  },
  logCopyWrap: {
    flex: 1,
    gap: 4
  },
  logTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  logSubtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1
  },
  logTime: {
    color: palette.blue,
    fontSize: 13,
    fontWeight: "800"
  },
  primaryInput: {
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    fontSize: 16,
    color: palette.ink,
    backgroundColor: "#fffdf9"
  },
  notesInput: {
    minHeight: 108,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    fontSize: 16,
    color: palette.ink,
    backgroundColor: "#fffdf9",
    textAlignVertical: "top",
    lineHeight: 24
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 10
  },
  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#f8f4ed",
    alignItems: "center",
    justifyContent: "center"
  },
  segmentButtonSelected: {
    backgroundColor: palette.blue,
    borderColor: palette.blue
  },
  segmentButtonText: {
    color: palette.blue,
    fontWeight: "800"
  },
  segmentButtonTextSelected: {
    color: "#fffdfa"
  },
  primaryAction: {
    backgroundColor: palette.ink,
    minHeight: 58,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center"
  },
  primaryActionDisabled: {
    opacity: 0.6
  },
  primaryActionText: {
    color: "#fffdfa",
    fontSize: 18,
    fontWeight: "900"
  },
  infoPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#f3eee5",
    alignSelf: "flex-start"
  },
  infoPillText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800"
  },
  subSectionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6
  },
  queryCard: {
    borderRadius: 20,
    backgroundColor: "#f7f3ec",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14
  },
  queryCardText: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700"
  },
  bulletRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start"
  },
  bulletDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 7
  },
  bulletText: {
    flex: 1,
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  agentCard: {
    borderRadius: 22,
    backgroundColor: "#faf7f1",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10
  },
  agentCardTop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  agentCardTitle: {
    flex: 1,
    color: palette.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  agentCardBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  matrixCard: {
    borderRadius: 22,
    backgroundColor: "#faf7f1",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 8
  },
  matrixCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center"
  },
  matrixTitle: {
    flex: 1,
    color: palette.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  matrixScore: {
    color: palette.blue,
    fontSize: 26,
    fontWeight: "900"
  },
  matrixWeight: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  matrixBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  sourceCard: {
    borderRadius: 22,
    backgroundColor: "#faf7f1",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10
  },
  sourceLinkWrap: {
    flex: 1
  },
  sourceHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1
  },
  sourceFaviconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#edf3ff",
    alignItems: "center",
    justifyContent: "center"
  },
  sourceTitle: {
    flex: 1,
    color: palette.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    flexShrink: 1
  },
  sourceMeta: {
    color: palette.blue,
    fontSize: 13,
    fontWeight: "800"
  },
  sourceUrl: {
    color: palette.blue,
    fontSize: 13,
    lineHeight: 18,
    textDecorationLine: "underline",
    flexShrink: 1
  },
  sourceSnippet: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  sourceQuote: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: "#f4efe6",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border
  },
  sourceMethodology: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1
  },
  sourceEvidenceMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  sourceEvidenceMetaText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  sourceOutcome: {
    fontSize: 14,
    fontWeight: "900"
  },
  accordionCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
    ...shadow
  },
  accordionCardCompact: {
    borderRadius: 20,
    paddingVertical: 14
  },
  accordionHeader: {
    gap: 10
  },
  accordionTitleRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  accordionHeadingWrap: {
    flex: 1,
    gap: 4
  },
  accordionHeadingLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  accordionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  accordionSummary: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21
  },
  accordionToggle: {
    color: palette.blue,
    fontSize: 18,
    fontWeight: "800"
  },
  accordionBody: {
    gap: 14
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2
  },
  stepIndicatorActive: {
    borderColor: "#c9dcfb",
    backgroundColor: "#eff5ff"
  },
  stepIndicatorComplete: {
    borderColor: "#bfe595",
    backgroundColor: "#eef9de"
  },
  stepIndicatorFailed: {
    borderColor: "#f0b5b7",
    backgroundColor: "#fff0f0"
  },
  stepIndicatorText: {
    color: palette.ink,
    fontWeight: "900"
  },
  groupStack: {
    gap: 14
  },
  groupCard: {
    borderRadius: 20,
    backgroundColor: "#faf7f1",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 12
  },
  groupTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  groupSummary: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20
  },
  sentimentCard: {
    borderRadius: 20,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#d8e6fb",
    padding: 16,
    gap: 12
  },
  sentimentTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  sentimentSummary: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21
  },
  sentimentRow: {
    flexDirection: "row",
    gap: 10
  },
  consensusFootnote: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19
  },
  miniMetric: {
    flex: 1,
    borderRadius: 16,
    padding: 12
  },
  miniMetricValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  miniMetricLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  eventRow: {
    borderRadius: 20,
    backgroundColor: "#faf7f1",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 10
  },
  eventText: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  historyCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 10,
    ...shadow
  },
  historySwipeShell: {
    position: "relative"
  },
  historyDeleteRail: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 24,
    backgroundColor: "#fff0f0",
    borderWidth: 1,
    borderColor: "#f1c6c7",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 18
  },
  historyDeleteRailIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "#fff7f7",
    borderWidth: 1,
    borderColor: "#f1c6c7",
    justifyContent: "center",
    alignItems: "center"
  },
  historyCardSelected: {
    borderColor: palette.blue,
    backgroundColor: "#f8fbff"
  },
  historyCardHeaderSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  historyGrip: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "#f7f3ec",
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center",
    alignItems: "center"
  },
  historyActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    alignItems: "center"
  },
  historyClaim: {
    flex: 1,
    color: palette.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    flexShrink: 1
  },
  historySummary: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1
  },
  historyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  historyMetaText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  historyMetaDot: {
    color: palette.muted,
    fontSize: 13
  },
  deleteButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#fff2f2",
    borderWidth: 1,
    borderColor: "#f1c6c7",
    justifyContent: "center",
    alignItems: "center"
  },
  deleteButtonText: {
    color: palette.red,
    fontWeight: "800"
  },
  reorderButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdfa",
    justifyContent: "center",
    alignItems: "center"
  },
  reorderButtonDisabled: {
    opacity: 0.35
  },
  reorderButtonText: {
    color: palette.blue,
    fontSize: 20,
    fontWeight: "800"
  },
  libraryCard: {
    borderRadius: 24,
    padding: 18
  },
  libraryMeta: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 6
  },
  libraryNote: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    marginTop: 10
  },
  loadingCard: {
    minHeight: 180,
    borderRadius: 28,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    ...shadow
  },
  loadingText: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: "700"
  },
  processingCard: {
    borderRadius: 28,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 16,
    ...shadow
  },
  processingHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  processingTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "900"
  },
  processingBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6
  },
  processingBadge: {
    minWidth: 64,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#edf3ff",
    alignItems: "center"
  },
  processingBadgeText: {
    color: palette.blue,
    fontSize: 18,
    fontWeight: "900"
  },
  progressTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    backgroundColor: "#ebe5da",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.blue
  },
  processingStepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 20,
    backgroundColor: "#faf7f1",
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14
  },
  processingStepIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center"
  },
  processingStepCopy: {
    flex: 1,
    gap: 4
  },
  processingStepTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  processingStepBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1
  },
  processingEventStack: {
    gap: 10
  },
  processingSubheading: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  resultSummaryText: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 24
  },
  emptyState: {
    minHeight: 180,
    borderRadius: 28,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    ...shadow
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center"
  },
  emptyBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 8
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start"
  },
  chipText: {
    fontWeight: "800",
    fontSize: 12
  },
  domainChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  domainChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#edf3ff",
    borderWidth: 1,
    borderColor: "#dbe5f7",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  domainChipText: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: "800"
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23, 42, 87, 0.25)",
    justifyContent: "flex-end"
  },
  sheetDismissArea: {
    flex: 1
  },
  sheetPanel: {
    maxHeight: "88%",
    backgroundColor: palette.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 36
  },
  sheetHandle: {
    alignSelf: "center",
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#d5d9df",
    marginBottom: 12
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  sheetTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  sheetClose: {
    color: palette.blue,
    fontSize: 14,
    fontWeight: "800"
  },
  sheetContent: {
    gap: 22,
    paddingBottom: 32
  },
  tabBar: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: bottomBarOffset,
    backgroundColor: "rgba(255,253,250,0.98)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: Platform.OS === "android" ? 14 : 10,
    flexDirection: "row",
    justifyContent: "space-between",
    ...shadow
  },
  tabBarButton: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderRadius: 20
  },
  tabBarButtonSelected: {
    backgroundColor: "#f4efe6"
  },
  tabIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center"
  },
  tabIconWrapSelected: {
    backgroundColor: "#eaf1fb"
  },
  tabBarButtonText: {
    color: "#8b8f99",
    fontSize: 12,
    fontWeight: "800"
  },
  tabBarButtonTextSelected: {
    color: palette.blue
  }
});
