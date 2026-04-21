import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPPLEMENT_HISTORY_KEY = "gramwin.supplement.history.v1";
const MAX_HISTORY_ITEMS = 10;

function normalizeEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: typeof source.id === "string" ? source.id : String(Date.now()),
    query: typeof source.query === "string" ? source.query : "",
    mode: source.mode === "image" ? "image" : "text",
    searchedAt: typeof source.searchedAt === "string" ? source.searchedAt : new Date().toISOString()
  };
}

export async function loadSupplementHistory() {
  const raw = await AsyncStorage.getItem(SUPPLEMENT_HISTORY_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeEntry).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

async function saveHistory(entries) {
  await AsyncStorage.setItem(SUPPLEMENT_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ITEMS)));
}

export async function addSupplementHistoryEntry(entry) {
  const next = normalizeEntry(entry);
  const existing = await loadSupplementHistory();
  const filtered = existing.filter((item) => item.id !== next.id);
  const updated = [next, ...filtered].slice(0, MAX_HISTORY_ITEMS);
  await saveHistory(updated);
  return updated;
}

export async function removeSupplementHistoryEntry(entryId) {
  const existing = await loadSupplementHistory();
  const updated = existing.filter((item) => item.id !== entryId);
  await saveHistory(updated);
  return updated;
}

export async function clearSupplementHistory() {
  await AsyncStorage.removeItem(SUPPLEMENT_HISTORY_KEY);
  return [];
}
