import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPPLEMENT_HISTORY_KEY = "gramwin.supplement.history.v1";
const MAX_HISTORY_ITEMS = 10;

function resolveSupplementHistoryKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${SUPPLEMENT_HISTORY_KEY}.${suffix}`;
}

function normalizeEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: typeof source.id === "string" ? source.id : String(Date.now()),
    query: typeof source.query === "string" ? source.query : "",
    title: typeof source.title === "string" ? source.title : typeof source.query === "string" ? source.query : "",
    mode: source.mode === "image" ? "image" : "text",
    searchedAt: typeof source.searchedAt === "string" ? source.searchedAt : new Date().toISOString(),
    result: source.result && typeof source.result === "object" ? source.result : null
  };
}

export async function loadSupplementHistory(accountId) {
  const raw = await AsyncStorage.getItem(resolveSupplementHistoryKey(accountId));
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

async function saveHistory(entries, accountId) {
  await AsyncStorage.setItem(resolveSupplementHistoryKey(accountId), JSON.stringify(entries.slice(0, MAX_HISTORY_ITEMS)));
}

export async function addSupplementHistoryEntry(entry, accountId) {
  const next = normalizeEntry(entry);
  const existing = await loadSupplementHistory(accountId);
  const filtered = existing.filter((item) => item.id !== next.id);
  const updated = [next, ...filtered].slice(0, MAX_HISTORY_ITEMS);
  await saveHistory(updated, accountId);
  return updated;
}

export async function removeSupplementHistoryEntry(entryId, accountId) {
  const existing = await loadSupplementHistory(accountId);
  const updated = existing.filter((item) => item.id !== entryId);
  await saveHistory(updated, accountId);
  return updated;
}

export async function clearSupplementHistory(accountId) {
  await AsyncStorage.removeItem(resolveSupplementHistoryKey(accountId));
  return [];
}
