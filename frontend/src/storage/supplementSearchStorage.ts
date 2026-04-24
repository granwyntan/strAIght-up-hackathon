// @ts-nocheck
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";

import { db } from "../lib/firebaseClient";
import { compactIsoId } from "../utils/dateTime";

const SUPPLEMENT_HISTORY_KEY = "gramwin.supplement.history.v1";
const MAX_HISTORY_ITEMS = 10;
const firestore = db;

function resolveSupplementHistoryKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${SUPPLEMENT_HISTORY_KEY}.${suffix}`;
}

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function normalizeEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: typeof source.id === "string" ? source.id : String(Date.now()),
    query: typeof source.query === "string" ? source.query : "",
    title: typeof source.title === "string" ? source.title : typeof source.query === "string" ? source.query : "",
    mode: source.mode === "image" ? "image" : "text",
    searchedAt: typeof source.searchedAt === "string" ? source.searchedAt : new Date().toISOString(),
    result: source.result && typeof source.result === "object" ? source.result : null,
    inputImage: typeof source.inputImage === "string" ? source.inputImage : "",
    infographic: typeof source.infographic === "string" ? source.infographic : ""
  };
}

function makeScannerDocId(isoString = new Date().toISOString()) {
  return compactIsoId(isoString);
}

function toFirestoreRecord(entry) {
  return {
    name: entry.title || entry.query || "Supplement search",
    type: entry.mode,
    input_image: entry.mode === "image" ? entry.inputImage || entry.query || "" : "",
    infographic: entry.infographic || "",
    searched_at: entry.searchedAt,
    query: entry.query,
    title: entry.title,
    result: entry.result || null
  };
}

function fromFirestoreRecord(docId, source) {
  return normalizeEntry({
    id: docId,
    query: typeof source?.query === "string" ? source.query : typeof source?.name === "string" ? source.name : "",
    title: typeof source?.title === "string" ? source.title : typeof source?.name === "string" ? source.name : "",
    mode: source?.type === "image" ? "image" : "text",
    searchedAt: typeof source?.searched_at === "string" ? source.searched_at : new Date().toISOString(),
    result: source?.result && typeof source.result === "object" ? source.result : null,
    inputImage: typeof source?.input_image === "string" ? source.input_image : "",
    infographic: typeof source?.infographic === "string" ? source.infographic : ""
  });
}

async function loadLocalHistory(accountId) {
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

async function saveLocalHistory(entries, accountId) {
  await AsyncStorage.setItem(resolveSupplementHistoryKey(accountId), JSON.stringify(entries.slice(0, MAX_HISTORY_ITEMS)));
}

export async function loadSupplementHistory(accountId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return loadLocalHistory(accountId);
  }
  try {
    const snapshot = await getDocs(collection(firestore, "users", userId, "scanner_history"));
    const entries = snapshot.docs
      .filter((historyDoc) => !historyDoc.data()?.deleted)
      .map((historyDoc) => fromFirestoreRecord(historyDoc.id, historyDoc.data()))
      .sort((a, b) => Date.parse(b.searchedAt || "") - Date.parse(a.searchedAt || ""))
      .slice(0, MAX_HISTORY_ITEMS);
    await saveLocalHistory(entries, accountId);
    return entries;
  } catch (error) {
    console.warn("Unable to load scanner history from Firestore; falling back to local", error);
    return loadLocalHistory(accountId);
  }
}

export async function addSupplementHistoryEntry(entry, accountId, accountEmail) {
  const next = normalizeEntry({
    ...entry,
    id: typeof entry?.id === "string" && entry.id ? entry.id : makeScannerDocId(entry?.searchedAt)
  });
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const existing = await loadLocalHistory(accountId);
    const filtered = existing.filter((item) => item.id !== next.id);
    const updated = [next, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    await saveLocalHistory(updated, accountId);
    return updated;
  }

  try {
    await setDoc(doc(firestore, "users", userId, "scanner_history", next.id), toFirestoreRecord(next), { merge: true });
    return loadSupplementHistory(accountId, accountEmail);
  } catch (error) {
    console.warn("Unable to save scanner history to Firestore; falling back to local", error);
    const existing = await loadLocalHistory(accountId);
    const filtered = existing.filter((item) => item.id !== next.id);
    const updated = [next, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    await saveLocalHistory(updated, accountId);
    return updated;
  }
}

export async function removeSupplementHistoryEntry(entryId, accountId, accountEmail) {
  const existing = await loadSupplementHistory(accountId, accountEmail);
  const updated = existing.filter((item) => item.id !== entryId);
  const userId = toFirestoreUserId(accountEmail);
  if (userId && firestore) {
    try {
      await deleteDoc(doc(firestore, "users", userId, "scanner_history", entryId));
    } catch (error) {
      console.warn("Unable to delete scanner history entry from Firestore; continuing with local update", error);
    }
  }
  await saveLocalHistory(updated, accountId);
  return updated;
}

export async function clearSupplementHistory(accountId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (userId && firestore) {
    try {
      const snapshot = await getDocs(collection(firestore, "users", userId, "scanner_history"));
      await Promise.all(snapshot.docs.map((historyDoc) => deleteDoc(historyDoc.ref)));
    } catch (error) {
      console.warn("Unable to clear scanner history from Firestore; continuing with local clear", error);
    }
  }
  await AsyncStorage.removeItem(resolveSupplementHistoryKey(accountId));
  return [];
}
