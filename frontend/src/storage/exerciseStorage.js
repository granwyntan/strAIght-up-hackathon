import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";

import { firebaseApp } from "../lib/firebaseClient";

const BASE_EXERCISE_KEY = "gramwin.exercise.history.v1";
const MAX_EXERCISE_ITEMS = 500;
const firestore = getFirestore(firebaseApp);

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function exerciseKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${BASE_EXERCISE_KEY}.${suffix}`;
}

function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeExerciseEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  const createdAtRaw = typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString();
  const createdAt = Number.isNaN(Date.parse(createdAtRaw)) ? new Date().toISOString() : createdAtRaw;
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: typeof source.title === "string" ? source.title.trim() : "",
    duration: typeof source.duration === "string" ? source.duration.trim() : "",
    intensity: typeof source.intensity === "string" ? source.intensity.trim() : "",
    notes: typeof source.notes === "string" ? source.notes.trim() : "",
    createdAt,
    date: typeof source.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? source.date : formatLocalIsoDate(new Date(createdAt))
  };
}

function normalizeEntries(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map(normalizeExerciseEntry);
}

async function loadLocalEntries(accountId) {
  const raw = await AsyncStorage.getItem(exerciseKey(accountId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeEntries(parsed).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    return [];
  }
}

async function saveLocalEntries(accountId, entries) {
  const normalized = normalizeEntries(entries)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_EXERCISE_ITEMS);
  await AsyncStorage.setItem(exerciseKey(accountId), JSON.stringify(normalized));
  return normalized;
}

function toFirestoreRecord(entry) {
  return {
    title: entry.title,
    duration: entry.duration,
    intensity: entry.intensity,
    notes: entry.notes,
    created_at: entry.createdAt,
    date: entry.date
  };
}

function fromFirestoreRecord(id, data) {
  return normalizeExerciseEntry({
    id,
    title: data?.title,
    duration: data?.duration,
    intensity: data?.intensity,
    notes: data?.notes,
    createdAt: data?.created_at,
    date: data?.date
  });
}

export async function loadExerciseEntries(accountId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId) {
    return loadLocalEntries(accountId);
  }
  try {
    const snapshot = await getDocs(collection(firestore, "users", userId, "exercise_history"));
    const entries = snapshot.docs.map((item) => fromFirestoreRecord(item.id, item.data())).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    await saveLocalEntries(accountId, entries);
    return entries;
  } catch (error) {
    console.warn("Unable to load exercise history from Firestore; falling back to local", error);
    return loadLocalEntries(accountId);
  }
}

export async function addExerciseEntry(accountId, entry, accountEmail) {
  const next = normalizeExerciseEntry(entry);
  const existing = await loadLocalEntries(accountId);
  await saveLocalEntries(accountId, [next, ...existing]);

  const userId = toFirestoreUserId(accountEmail);
  if (!userId) {
    return next;
  }
  try {
    await setDoc(doc(firestore, "users", userId, "exercise_history", next.id), toFirestoreRecord(next), { merge: true });
  } catch (error) {
    console.warn("Unable to save exercise entry to Firestore; local save kept", error);
  }
  return next;
}

export async function updateExerciseEntry(accountId, entryId, updates, accountEmail) {
  const existing = await loadLocalEntries(accountId);
  const updated = existing.map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }
    return normalizeExerciseEntry({
      ...entry,
      title: typeof updates?.title === "string" ? updates.title : entry.title,
      duration: typeof updates?.duration === "string" ? updates.duration : entry.duration,
      intensity: typeof updates?.intensity === "string" ? updates.intensity : entry.intensity,
      notes: typeof updates?.notes === "string" ? updates.notes : entry.notes,
      date: typeof updates?.date === "string" ? updates.date : entry.date,
      createdAt: entry.createdAt
    });
  });
  await saveLocalEntries(accountId, updated);

  const userId = toFirestoreUserId(accountEmail);
  if (!userId) {
    return;
  }
  const target = updated.find((entry) => entry.id === entryId);
  if (!target) {
    return;
  }
  try {
    await setDoc(doc(firestore, "users", userId, "exercise_history", entryId), toFirestoreRecord(target), { merge: true });
  } catch (error) {
    console.warn("Unable to update exercise entry in Firestore; local update kept", error);
  }
}

export async function deleteExerciseEntry(accountId, entryId, accountEmail) {
  const existing = await loadLocalEntries(accountId);
  const updated = existing.filter((entry) => entry.id !== entryId);
  await saveLocalEntries(accountId, updated);

  const userId = toFirestoreUserId(accountEmail);
  if (!userId) {
    return;
  }
  try {
    await deleteDoc(doc(firestore, "users", userId, "exercise_history", entryId));
  } catch (error) {
    console.warn("Unable to delete exercise entry in Firestore; local deletion kept", error);
  }
}

export { formatLocalIsoDate as formatExerciseDate };
