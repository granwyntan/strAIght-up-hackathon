import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_TRACKER_KEY = "gramwin.calorie.tracker.v1";

function trackerKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${BASE_TRACKER_KEY}.${suffix}`;
}

function toIsoDate(value) {
  const raw = typeof value === "string" && value ? value : new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
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
  return normalized.toISOString().slice(0, 10);
}

function addDays(isoDate, offset) {
  const day = new Date(`${isoDate}T00:00:00`);
  day.setDate(day.getDate() + offset);
  return day.toISOString().slice(0, 10);
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

export async function loadCalorieWeek(accountId, weekStart) {
  const entries = await loadAllEntries(accountId);
  return buildWeekPayload(entries, weekStart);
}

export async function addCalorieEntry(accountId, entry) {
  const next = normalizeEntry(entry);
  const entries = await loadAllEntries(accountId);
  const updated = [next, ...entries];
  await saveAllEntries(accountId, updated);
  return next;
}

export async function updateCalorieEntry(accountId, entryId, updates) {
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
}

export async function deleteCalorieEntry(accountId, entryId) {
  const entries = await loadAllEntries(accountId);
  const updated = entries.filter((entry) => entry.id !== entryId);
  await saveAllEntries(accountId, updated);
}

export async function clearCalorieDay(accountId, isoDate) {
  const targetDate = toIsoDate(isoDate);
  const entries = await loadAllEntries(accountId);
  const updated = entries.filter((entry) => entry.date !== targetDate);
  await saveAllEntries(accountId, updated);
}
