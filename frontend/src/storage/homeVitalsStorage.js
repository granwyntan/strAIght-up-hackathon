import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from "firebase/firestore";

import { firebaseApp } from "../lib/firebaseClient";

const BASE_HOME_VITALS_KEY = "gramwin.home.vitals.v1";
const MAX_LOCAL_DAYS = 180;
const firestore = getFirestore(firebaseApp);

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function homeVitalsKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${BASE_HOME_VITALS_KEY}.${suffix}`;
}

export function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeMetricValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeDayRecord(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    restingHeartRate: normalizeMetricValue(source.restingHeartRate),
    sleep: normalizeMetricValue(source.sleep),
    steps: normalizeMetricValue(source.steps),
    hydration: normalizeMetricValue(source.hydration),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString()
  };
}

function normalizeVitalsMap(input) {
  const source = input && typeof input === "object" ? input : {};
  const output = {};
  for (const [date, record] of Object.entries(source)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }
    output[date] = normalizeDayRecord(record);
  }
  return output;
}

async function loadLocalVitalsMap(accountId) {
  const raw = await AsyncStorage.getItem(homeVitalsKey(accountId));
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeVitalsMap(parsed);
  } catch {
    return {};
  }
}

function trimToRecentDays(vitalsMap) {
  const entries = Object.entries(normalizeVitalsMap(vitalsMap)).sort(([a], [b]) => (a > b ? -1 : 1));
  return Object.fromEntries(entries.slice(0, MAX_LOCAL_DAYS));
}

async function saveLocalVitalsMap(accountId, vitalsMap) {
  const trimmed = trimToRecentDays(vitalsMap);
  await AsyncStorage.setItem(homeVitalsKey(accountId), JSON.stringify(trimmed));
  return trimmed;
}

function toFirestoreDayRecord(record) {
  const normalized = normalizeDayRecord(record);
  return {
    resting_heart_rate: normalized.restingHeartRate,
    sleep: normalized.sleep,
    steps: normalized.steps,
    hydration: normalized.hydration,
    updated_at: normalized.updatedAt
  };
}

function fromFirestoreDayRecord(record) {
  return normalizeDayRecord({
    restingHeartRate: record?.resting_heart_rate,
    sleep: record?.sleep,
    steps: record?.steps,
    hydration: record?.hydration,
    updatedAt: record?.updated_at
  });
}

async function loadFirestoreVitalsMap(accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId) {
    return null;
  }
  const snapshot = await getDocs(collection(firestore, "users", userId, "daily_health"));
  const next = {};
  for (const dayDoc of snapshot.docs) {
    const dayId = dayDoc.id;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayId)) {
      continue;
    }
    next[dayId] = fromFirestoreDayRecord(dayDoc.data());
  }
  return trimToRecentDays(next);
}

export async function loadHomeVitals(accountId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId) {
    return loadLocalVitalsMap(accountId);
  }
  try {
    const firestoreMap = (await loadFirestoreVitalsMap(accountEmail)) || {};
    await saveLocalVitalsMap(accountId, firestoreMap);
    return firestoreMap;
  } catch (error) {
    console.warn("Unable to load home vitals from Firestore; falling back to local storage", error);
    return loadLocalVitalsMap(accountId);
  }
}

export async function saveHomeVitalForDate(accountId, accountEmail, date, metricKey, value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid date format.");
  }
  if (!["restingHeartRate", "sleep", "steps", "hydration"].includes(metricKey)) {
    throw new Error("Invalid metric key.");
  }

  const nextValue = normalizeMetricValue(value);
  const localMap = await loadLocalVitalsMap(accountId);
  const currentDay = normalizeDayRecord(localMap[date]);
  const nextDay = normalizeDayRecord({
    ...currentDay,
    [metricKey]: nextValue,
    updatedAt: new Date().toISOString()
  });
  const updatedMap = {
    ...localMap,
    [date]: nextDay
  };
  const savedLocal = await saveLocalVitalsMap(accountId, updatedMap);

  const userId = toFirestoreUserId(accountEmail);
  if (!userId) {
    return savedLocal;
  }

  try {
    const dayRef = doc(firestore, "users", userId, "daily_health", date);
    await setDoc(dayRef, toFirestoreDayRecord(nextDay), { merge: true });
  } catch (error) {
    console.warn("Unable to save home vitals to Firestore; local save kept", error);
  }
  return savedLocal;
}

export async function loadHomeVitalDay(accountId, accountEmail, date) {
  const map = await loadHomeVitals(accountId, accountEmail);
  return normalizeDayRecord(map[date]);
}

export async function loadTodayHomeVitals(accountId, accountEmail) {
  return loadHomeVitalDay(accountId, accountEmail, formatLocalIsoDate(new Date()));
}

