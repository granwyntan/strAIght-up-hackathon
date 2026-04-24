// @ts-nocheck
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

import { db } from "../lib/firebaseClient";

const BASE_TRACKER_KEY = "gramwin.calorie.tracker.v1";
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

function normalizeEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  const caloriesNumber = Number(source.calories);
  return {
    id: typeof source.id === "string" && source.id ? source.id : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mealName: typeof source.mealName === "string" ? source.mealName.trim() : "",
    calories: Number.isFinite(caloriesNumber) ? Math.max(0, Math.round(caloriesNumber)) : 0,
    date: toIsoDate(source.date),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString()
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

function buildWeekPayload(entries, weekStart) {
  const start = weekStartIso(weekStart || new Date());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const dayEntries = entries.filter((entry) => entry.date === date);
    return {
      date,
      totalCalories: dayEntries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0),
      entryCount: dayEntries.length
    };
  });
  const inWeek = entries
    .filter((entry) => entry.date >= start && entry.date <= addDays(start, 6))
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt || "");
      const bTime = Date.parse(b.createdAt || "");
      return Number.isFinite(aTime) && Number.isFinite(bTime) ? bTime - aTime : 0;
    });
  return {
    weekStart: start,
    weekEnd: addDays(start, 6),
    days,
    entries: inWeek
  };
}

function toFirestoreFood(entry) {
  return {
    id: entry.id,
    food_name: entry.mealName,
    calories: entry.calories,
    created_at: entry.createdAt
  };
}

function fromFirestoreFood(food, date) {
  return normalizeEntry({
    id: food?.id,
    mealName: typeof food?.food_name === "string" ? food.food_name : "",
    calories: food?.calories,
    createdAt: typeof food?.created_at === "string" ? food.created_at : new Date().toISOString(),
    date
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
    const foods = Array.isArray(snapshot.data()?.foods) ? snapshot.data().foods : [];
    foods.forEach((food) => {
      entries.push(fromFirestoreFood(food, date));
    });
  });
  return entries;
}

export async function loadCalorieWeek(accountId, weekStart, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    return buildWeekPayload(entries, weekStart);
  }

  try {
    const firestoreEntries = (await loadFirestoreWeekEntries(accountEmail, weekStart)) || [];
    return buildWeekPayload(firestoreEntries, weekStart);
  } catch (error) {
    console.warn("Unable to load calorie week from Firestore; falling back to local storage", error);
    const entries = await loadAllEntries(accountId);
    return buildWeekPayload(entries, weekStart);
  }
}

export async function addCalorieEntry(accountId, entry, accountEmail) {
  const next = normalizeEntry(entry);
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = [next, ...entries];
    await saveAllEntries(accountId, updated);
    return next;
  }

  const dayRef = doc(firestore, "users", userId, "daily_calories", next.date);
  const daySnapshot = await getDoc(dayRef);
  const existingFoods = daySnapshot.exists() && Array.isArray(daySnapshot.data()?.foods) ? daySnapshot.data().foods : [];
  const filtered = existingFoods.filter((food) => food?.id !== next.id);
  const updatedFoods = [toFirestoreFood(next), ...filtered];
  await setDoc(dayRef, { foods: updatedFoods }, { merge: true });
  return next;
}

export async function updateCalorieEntry(accountId, entryId, updates, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = entries.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }
      return normalizeEntry({
        ...entry,
        mealName: typeof updates?.mealName === "string" ? updates.mealName : entry.mealName,
        calories: updates?.calories,
        date: updates?.date || entry.date,
        createdAt: entry.createdAt
      });
    });
    await saveAllEntries(accountId, updated);
    return;
  }

  const daysSnapshot = await getDocs(collection(firestore, "users", userId, "daily_calories"));
  for (const dayDoc of daysSnapshot.docs) {
    const foods = Array.isArray(dayDoc.data()?.foods) ? dayDoc.data().foods : [];
    let changed = false;
    const nextFoods = foods.map((food) => {
      if (food?.id !== entryId) {
        return food;
      }
      changed = true;
      return {
        ...food,
        food_name: typeof updates?.mealName === "string" ? updates.mealName : food.food_name,
        calories: Math.max(0, Math.round(Number(updates?.calories ?? food.calories) || 0))
      };
    });
    if (changed) {
      await setDoc(dayDoc.ref, { foods: nextFoods }, { merge: true });
      return;
    }
  }
}

export async function deleteCalorieEntry(accountId, entryId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = entries.filter((entry) => entry.id !== entryId);
    await saveAllEntries(accountId, updated);
    return;
  }

  const daysSnapshot = await getDocs(collection(firestore, "users", userId, "daily_calories"));
  for (const dayDoc of daysSnapshot.docs) {
    const foods = Array.isArray(dayDoc.data()?.foods) ? dayDoc.data().foods : [];
    if (!foods.some((food) => food?.id === entryId)) {
      continue;
    }
    const nextFoods = foods.filter((food) => food?.id !== entryId);
    await setDoc(dayDoc.ref, { foods: nextFoods }, { merge: true });
    return;
  }
}

export async function clearCalorieDay(accountId, isoDate, accountEmail) {
  const targetDate = toIsoDate(isoDate);
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    const entries = await loadAllEntries(accountId);
    const updated = entries.filter((entry) => entry.date !== targetDate);
    await saveAllEntries(accountId, updated);
    return;
  }

  const dayRef = doc(firestore, "users", userId, "daily_calories", targetDate);
  await setDoc(dayRef, { foods: [] }, { merge: true });
}
