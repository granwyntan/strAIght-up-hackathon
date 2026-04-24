// @ts-nocheck
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";

import { db } from "../lib/firebaseClient";

const INVESTIGATION_HISTORY_KEY = "gramwin.investigation.history.v1";
const MAX_HISTORY_ITEMS = 500;
const firestore = db;

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function historyKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${INVESTIGATION_HISTORY_KEY}.${suffix}`;
}

function normalizeSummary(input) {
  const source = input && typeof input === "object" ? input : {};
  const status = typeof source.status === "string" ? source.status : "pending";
  const mode = typeof source.mode === "string" ? source.mode : "auto";
  const desiredDepth = typeof source.desiredDepth === "string" ? source.desiredDepth : "standard";
  return {
    id: typeof source.id === "string" ? source.id : `investigation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    claim: typeof source.claim === "string" ? source.claim : "",
    context: typeof source.context === "string" ? source.context : "",
    status: ["pending", "running", "completed", "failed", "cancelled", "queued"].includes(status) ? status : "pending",
    mode: ["auto", "offline", "live"].includes(mode) ? mode : "auto",
    desiredDepth: ["quick", "standard", "deep"].includes(desiredDepth) ? desiredDepth : "standard",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
    overallScore: typeof source.overallScore === "number" ? source.overallScore : null,
    verdict: typeof source.verdict === "string" ? source.verdict : null,
    confidenceLevel: typeof source.confidenceLevel === "string" ? source.confidenceLevel : null,
    truthClassification: typeof source.truthClassification === "string" ? source.truthClassification : "",
    sourceCount: Number.isFinite(source.sourceCount) ? Number(source.sourceCount) : 0,
    positiveCount: Number.isFinite(source.positiveCount) ? Number(source.positiveCount) : 0,
    neutralCount: Number.isFinite(source.neutralCount) ? Number(source.neutralCount) : 0,
    negativeCount: Number.isFinite(source.negativeCount) ? Number(source.negativeCount) : 0,
    summary: typeof source.summary === "string" ? source.summary : "",
  };
}

function normalizeList(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map(normalizeSummary)
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, MAX_HISTORY_ITEMS);
}

async function loadLocalHistory(accountId) {
  const raw = await AsyncStorage.getItem(historyKey(accountId));
  if (!raw) {
    return [];
  }
  try {
    return normalizeList(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function saveLocalHistory(accountId, items) {
  const normalized = normalizeList(items);
  await AsyncStorage.setItem(historyKey(accountId), JSON.stringify(normalized));
  return normalized;
}

function toFirestoreRecord(item) {
  return {
    claim: item.claim,
    context: item.context,
    status: item.status,
    mode: item.mode,
    desired_depth: item.desiredDepth,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    overall_score: item.overallScore,
    verdict: item.verdict,
    confidence_level: item.confidenceLevel,
    truth_classification: item.truthClassification,
    source_count: item.sourceCount,
    positive_count: item.positiveCount,
    neutral_count: item.neutralCount,
    negative_count: item.negativeCount,
    summary: item.summary,
  };
}

function fromFirestoreRecord(docId, source) {
  return normalizeSummary({
    id: docId,
    claim: source?.claim,
    context: source?.context,
    status: source?.status,
    mode: source?.mode,
    desiredDepth: source?.desired_depth,
    createdAt: source?.created_at,
    updatedAt: source?.updated_at,
    overallScore: source?.overall_score,
    verdict: source?.verdict,
    confidenceLevel: source?.confidence_level,
    truthClassification: source?.truth_classification,
    sourceCount: source?.source_count,
    positiveCount: source?.positive_count,
    neutralCount: source?.neutral_count,
    negativeCount: source?.negative_count,
    summary: source?.summary,
  });
}

export async function loadInvestigationHistory(accountId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return loadLocalHistory(accountId);
  }
  try {
    const snapshot = await getDocs(collection(firestore, "users", userId, "investigation_history"));
    const items = normalizeList(snapshot.docs.map((item) => fromFirestoreRecord(item.id, item.data())));
    await saveLocalHistory(accountId, items);
    return items;
  } catch (error) {
    console.warn("Unable to load investigation history from Firestore; falling back to local", error);
    return loadLocalHistory(accountId);
  }
}

export async function replaceInvestigationHistory(accountId, items, accountEmail) {
  const normalized = await saveLocalHistory(accountId, items);
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return normalized;
  }
  try {
    const snapshot = await getDocs(collection(firestore, "users", userId, "investigation_history"));
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
    await Promise.all(
      normalized.map((item) => setDoc(doc(firestore, "users", userId, "investigation_history", item.id), toFirestoreRecord(item), { merge: true }))
    );
  } catch (error) {
    console.warn("Unable to sync investigation history replacement to Firestore; local data kept", error);
  }
  return normalized;
}

export async function upsertInvestigationHistoryItem(item, accountId, accountEmail) {
  const next = normalizeSummary(item);
  const existing = await loadLocalHistory(accountId);
  const filtered = existing.filter((entry) => entry.id !== next.id);
  const saved = await saveLocalHistory(accountId, [next, ...filtered]);
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return saved;
  }
  try {
    await setDoc(doc(firestore, "users", userId, "investigation_history", next.id), toFirestoreRecord(next), { merge: true });
  } catch (error) {
    console.warn("Unable to upsert investigation history in Firestore; local data kept", error);
  }
  return saved;
}

export async function removeInvestigationHistoryItem(entryId, accountId, accountEmail) {
  const existing = await loadLocalHistory(accountId);
  const saved = await saveLocalHistory(
    accountId,
    existing.filter((entry) => entry.id !== entryId)
  );
  const userId = toFirestoreUserId(accountEmail);
  if (userId && firestore) {
    try {
      await deleteDoc(doc(firestore, "users", userId, "investigation_history", entryId));
    } catch (error) {
      console.warn("Unable to delete investigation history entry in Firestore; local data kept", error);
    }
  }
  return saved;
}

export async function clearInvestigationHistory(accountId, accountEmail) {
  await AsyncStorage.removeItem(historyKey(accountId));
  const userId = toFirestoreUserId(accountEmail);
  if (userId && firestore) {
    try {
      const snapshot = await getDocs(collection(firestore, "users", userId, "investigation_history"));
      await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
    } catch (error) {
      console.warn("Unable to clear investigation history in Firestore; local clear kept", error);
    }
  }
  return [];
}
