// @ts-nocheck
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

import { db } from "../lib/firebaseClient";

const BASE_TRACKER_KEY = "gramwin.calorie.tracker.v2";
const BASE_RUN_HISTORY_KEY = "gramwin.consumables.runs.v1";
const firestore = db;

function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function trackerKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${BASE_TRACKER_KEY}.${suffix}`;
}

function runHistoryKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${BASE_RUN_HISTORY_KEY}.${suffix}`;
}

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function toIsoDate(value) {
  const raw = typeof value === "string" && value ? value : formatLocalIsoDate(new Date());
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return formatLocalIsoDate(new Date());
  }
  return formatLocalIsoDate(parsed);
}

function toLoggedAt(value, date) {
  const raw = typeof value === "string" && value ? value : "";
  const parsed = raw ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return `${toIsoDate(date)}T12:00:00.000Z`;
}

function normalizeKind(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "hydration") {
    return "hydration";
  }
  if (normalized === "other") {
    return "other";
  }
  return "meal";
}

function defaultUnitForKind(kind) {
  if (kind === "hydration") {
    return "ml";
  }
  return "serving";
}

function defaultLabelForKind(kind) {
  if (kind === "hydration") {
    return "Hydration";
  }
  if (kind === "other") {
    return "Consumable";
  }
  return "Meal";
}

function normalizeEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  const kind = normalizeKind(source.kind);
  const caloriesNumber = Number(source.calories);
  const amountNumber = Number(source.amount);
  const servingsNumber = Number(source.servings);
  const date = toIsoDate(source.date);
  return {
    id: typeof source.id === "string" && source.id ? source.id : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : typeof source.mealName === "string" ? source.mealName.trim() : defaultLabelForKind(kind),
    calories: Number.isFinite(caloriesNumber) ? Math.max(0, Math.round(caloriesNumber)) : 0,
    amount: Number.isFinite(amountNumber) ? Math.max(0, Math.round(amountNumber)) : kind === "hydration" ? 250 : 1,
    unit: typeof source.unit === "string" && source.unit.trim() ? source.unit.trim() : defaultUnitForKind(kind),
    servings: Number.isFinite(servingsNumber) ? Math.max(0.25, Number(servingsNumber.toFixed(2))) : 1,
    context: typeof source.context === "string" ? source.context.trim() : "",
    date,
    loggedAt: toLoggedAt(source.loggedAt || source.createdAt, date),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
    sourceType: typeof source.sourceType === "string" ? source.sourceType : "manual",
    quickNotes: Array.isArray(source.quickNotes) ? source.quickNotes.filter((item) => typeof item === "string" && item.trim()).slice(0, 4) : [],
  };
}

function weekStartIso(anchorDate) {
  const normalized = new Date(anchorDate);
  const jsDay = normalized.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  normalized.setDate(normalized.getDate() + mondayOffset);
  return formatLocalIsoDate(normalized);
}

function addDays(isoDate, offset) {
  const day = new Date(`${isoDate}T00:00:00`);
  day.setDate(day.getDate() + offset);
  return formatLocalIsoDate(day);
}

function compareLoggedAtDesc(a, b) {
  const aTime = Date.parse(a.loggedAt || a.createdAt || "");
  const bTime = Date.parse(b.loggedAt || b.createdAt || "");
  return Number.isFinite(aTime) && Number.isFinite(bTime) ? bTime - aTime : 0;
}

function buildWeekPayload(entries, weekStart) {
  const start = weekStartIso(weekStart || new Date());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const dayEntries = entries.filter((entry) => entry.date === date);
    const hydrationEntries = dayEntries.filter((entry) => entry.kind === "hydration");
    const mealEntries = dayEntries.filter((entry) => entry.kind === "meal");
    const otherEntries = dayEntries.filter((entry) => entry.kind === "other");
    return {
      date,
      totalCalories: dayEntries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0),
      hydrationMl: hydrationEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
      mealCount: mealEntries.length,
      hydrationCount: hydrationEntries.length,
      otherCount: otherEntries.length,
      entryCount: dayEntries.length,
    };
  });
  const inWeek = entries
    .filter((entry) => entry.date >= start && entry.date <= addDays(start, 6))
    .sort(compareLoggedAtDesc);
  return {
    weekStart: start,
    weekEnd: addDays(start, 6),
    days,
    entries: inWeek,
  };
}

function toFirestoreConsumable(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    calories: entry.calories,
    amount: entry.amount,
    unit: entry.unit,
    servings: entry.servings,
    context: entry.context,
    logged_at: entry.loggedAt,
    created_at: entry.createdAt,
    source_type: entry.sourceType,
    quick_notes: entry.quickNotes,
  };
}

function fromFirestoreConsumable(source, date) {
  return normalizeEntry({
    id: source?.id,
    kind: source?.kind,
    name: source?.name,
    calories: source?.calories,
    amount: source?.amount,
    unit: source?.unit,
    servings: source?.servings,
    context: source?.context,
    loggedAt: source?.logged_at,
    createdAt: source?.created_at,
    sourceType: source?.source_type,
    quickNotes: source?.quick_notes,
    date,
  });
}

function fromFirestoreFood(food, date) {
  return normalizeEntry({
    id: food?.id,
    name: typeof food?.food_name === "string" ? food.food_name : "",
    calories: food?.calories,
    createdAt: typeof food?.created_at === "string" ? food.created_at : new Date().toISOString(),
    date,
    kind: "meal",
    servings: 1,
    amount: 1,
    unit: "serving",
    sourceType: "legacy",
  });
}

async function loadAllEntries(accountId) {
  const raw = await AsyncStorage.getItem(trackerKey(accountId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeEntry);
  } catch {
    return [];
  }
}

async function saveAllEntries(accountId, entries) {
  await AsyncStorage.setItem(trackerKey(accountId), JSON.stringify(entries.map(normalizeEntry)));
}

function normalizeRunEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: typeof source.id === "string" && source.id ? source.id : `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : "Consumable analysis",
    kind: normalizeKind(source.kind),
    searchedAt: typeof source.searchedAt === "string" ? source.searchedAt : new Date().toISOString(),
    result: source.result && typeof source.result === "object" ? source.result : null,
    summary: typeof source.summary === "string" ? source.summary : "",
    tags: Array.isArray(source.tags) ? source.tags.filter((item) => typeof item === "string" && item.trim()).slice(0, 4) : [],
  };
}

async function loadLocalRunHistory(accountId) {
  const raw = await AsyncStorage.getItem(runHistoryKey(accountId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeRunEntry);
  } catch {
    return [];
  }
}

async function saveLocalRunHistory(accountId, entries) {
  await AsyncStorage.setItem(runHistoryKey(accountId), JSON.stringify(entries.map(normalizeRunEntry).slice(0, 40)));
}

async function loadFirestoreWeekEntries(accountEmail, weekStart) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return null;
  }
  const start = weekStartIso(weekStart || new Date());
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const docs = await Promise.all(dates.map((date) => getDoc(doc(firestore, "users", userId, "daily_calories", date))));
  const entries = [];
  docs.forEach((snapshot, index) => {
    if (!snapshot.exists()) {
      return;
    }
    const date = dates[index];
    const data = snapshot.data() || {};
    const logs = Array.isArray(data.logs) ? data.logs : [];
    if (logs.length > 0) {
      logs.forEach((log) => entries.push(fromFirestoreConsumable(log, date)));
      return;
    }
    const foods = Array.isArray(data.foods) ? data.foods : [];
    foods.forEach((food) => entries.push(fromFirestoreFood(food, date)));
  });
  return entries;
}

async function loadFirestoreAllEntries(accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return [];
  }
  const snapshot = await getDocs(collection(firestore, "users", userId, "daily_calories"));
  const entries = [];
  snapshot.docs.forEach((dayDoc) => {
    const date = dayDoc.id;
    const data = dayDoc.data() || {};
    const logs = Array.isArray(data.logs) ? data.logs : [];
    if (logs.length > 0) {
      logs.forEach((log) => entries.push(fromFirestoreConsumable(log, date)));
      return;
    }
    const foods = Array.isArray(data.foods) ? data.foods : [];
    foods.forEach((food) => entries.push(fromFirestoreFood(food, date)));
  });
  return entries;
}

export async function loadConsumableWeek(accountId, weekStart, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    return buildWeekPayload(entries, weekStart);
  }
  try {
    const firestoreEntries = (await loadFirestoreWeekEntries(accountEmail, weekStart)) || [];
    return buildWeekPayload(firestoreEntries, weekStart);
  } catch (error) {
    console.warn("Unable to load consumables week from Firestore; falling back to local storage", error);
    const entries = await loadAllEntries(accountId);
    return buildWeekPayload(entries, weekStart);
  }
}

export async function addConsumableEntry(accountId, entry, accountEmail) {
  const next = normalizeEntry(entry);
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = [next, ...entries.filter((item) => item.id !== next.id)];
    await saveAllEntries(accountId, updated);
    return next;
  }

  const dayRef = doc(firestore, "users", userId, "daily_calories", next.date);
  const daySnapshot = await getDoc(dayRef);
  const data = daySnapshot.exists() ? daySnapshot.data() || {} : {};
  const existingLogs = Array.isArray(data.logs)
    ? data.logs
    : Array.isArray(data.foods)
      ? data.foods.map((food) => toFirestoreConsumable(fromFirestoreFood(food, next.date)))
      : [];
  const filtered = existingLogs.filter((item) => item?.id !== next.id);
  const updatedLogs = [toFirestoreConsumable(next), ...filtered];
  await setDoc(dayRef, { logs: updatedLogs, foods: [] }, { merge: true });
  return next;
}

export async function updateConsumableEntry(accountId, entryId, updates, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = entries.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }
      return normalizeEntry({
        ...entry,
        ...updates,
        createdAt: entry.createdAt,
      });
    });
    await saveAllEntries(accountId, updated);
    return;
  }

  const entries = await loadFirestoreAllEntries(accountEmail);
  const updatedEntry = entries.find((entry) => entry.id === entryId);
  if (!updatedEntry) {
    return;
  }
  const merged = normalizeEntry({
    ...updatedEntry,
    ...updates,
    createdAt: updatedEntry.createdAt,
  });
  const previousDate = updatedEntry.date;
  if (previousDate !== merged.date) {
    await deleteConsumableEntry(accountId, entryId, accountEmail);
    await addConsumableEntry(accountId, merged, accountEmail);
    return;
  }
  const dayRef = doc(firestore, "users", userId, "daily_calories", merged.date);
  const daySnapshot = await getDoc(dayRef);
  const existingLogs = daySnapshot.exists() && Array.isArray(daySnapshot.data()?.logs) ? daySnapshot.data().logs : [];
  const nextLogs = existingLogs.map((item) => (item?.id === entryId ? toFirestoreConsumable(merged) : item));
  await setDoc(dayRef, { logs: nextLogs }, { merge: true });
}

export async function deleteConsumableEntry(accountId, entryId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = entries.filter((entry) => entry.id !== entryId);
    await saveAllEntries(accountId, updated);
    return;
  }

  const daysSnapshot = await getDocs(collection(firestore, "users", userId, "daily_calories"));
  for (const dayDoc of daysSnapshot.docs) {
    const logs = Array.isArray(dayDoc.data()?.logs) ? dayDoc.data().logs : [];
    if (!logs.some((log) => log?.id === entryId)) {
      continue;
    }
    const nextLogs = logs.filter((log) => log?.id !== entryId);
    await setDoc(dayDoc.ref, { logs: nextLogs }, { merge: true });
    return;
  }
}

export async function clearConsumableDay(accountId, isoDate, accountEmail) {
  const targetDate = toIsoDate(isoDate);
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = entries.filter((entry) => entry.date !== targetDate);
    await saveAllEntries(accountId, updated);
    return;
  }

  const dayRef = doc(firestore, "users", userId, "daily_calories", targetDate);
  await setDoc(dayRef, { logs: [], foods: [] }, { merge: true });
}

export async function loadCalorieWeek(accountId, weekStart, accountEmail) {
  return loadConsumableWeek(accountId, weekStart, accountEmail);
}

export async function addCalorieEntry(accountId, entry, accountEmail) {
  return addConsumableEntry(accountId, entry, accountEmail);
}

export async function updateCalorieEntry(accountId, entryId, updates, accountEmail) {
  return updateConsumableEntry(accountId, entryId, updates, accountEmail);
}

export async function deleteCalorieEntry(accountId, entryId, accountEmail) {
  return deleteConsumableEntry(accountId, entryId, accountEmail);
}

export async function clearCalorieDay(accountId, isoDate, accountEmail) {
  return clearConsumableDay(accountId, isoDate, accountEmail);
}

export async function loadConsumableRunHistory(accountId) {
  return loadLocalRunHistory(accountId);
}

export async function addConsumableRunHistoryEntry(accountId, entry) {
  const next = normalizeRunEntry(entry);
  const existing = await loadLocalRunHistory(accountId);
  const updated = [next, ...existing.filter((item) => item.id !== next.id)].slice(0, 40);
  await saveLocalRunHistory(accountId, updated);
  return updated;
}

export async function removeConsumableRunHistoryEntry(accountId, entryId) {
  const existing = await loadLocalRunHistory(accountId);
  const updated = existing.filter((item) => item.id !== entryId);
  await saveLocalRunHistory(accountId, updated);
  return updated;
}
