import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseApp } from "../lib/firebaseClient";
import { getFirestore } from "firebase/firestore";

export const PROFILE_STORAGE_KEY = "gramwin.profile.v1";
const PROFILE_SYNC_META_KEY = "gramwin.profile.lastSync.v1";
const firestore = getFirestore(firebaseApp);
const profileMemoryCache = new Map();

function resolveProfileStorageKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${PROFILE_STORAGE_KEY}.${suffix}`;
}

function resolveProfileSyncMetaKey(accountId, accountEmail) {
  const suffix = resolveCacheKey(accountId, accountEmail);
  return `${PROFILE_SYNC_META_KEY}.${suffix}`;
}

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function resolveCacheKey(accountId, accountEmail) {
  return toFirestoreUserId(accountEmail) || (typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest");
}

function toFirestoreProfile(profile) {
  return {
    profile_picture: profile.profilePicture,
    name: profile.name,
    gender: profile.gender,
    height: profile.height,
    weight: profile.weight,
    goals: profile.goals,
    current_medication: profile.medicationsOrSupplements,
    conditions: profile.medicalConditions,
    medical_history: profile.medicalHistory,
    daily_calorie_target: profile.dailyCalorieTarget,
    daily_calorie_updated_at: profile.dailyCalorieUpdatedAt
  };
}

function fromFirestoreProfile(source) {
  return normalizeProfile({
    profilePicture: normalizeString(source?.profile_picture),
    name: normalizeString(source?.name),
    gender: normalizeString(source?.gender),
    height: normalizeString(source?.height),
    weight: normalizeString(source?.weight),
    goals: normalizeString(source?.goals),
    medicationsOrSupplements: normalizeString(source?.current_medication),
    medicalConditions: normalizeString(source?.conditions),
    medicalHistory: normalizeString(source?.medical_history),
    dailyCalorieTarget: normalizeString(source?.daily_calorie_target),
    dailyCalorieUpdatedAt: normalizeString(source?.daily_calorie_updated_at)
  });
}

export const emptyProfile = {
  profilePicture: "",
  name: "",
  age: "",
  gender: "",
  height: "",
  weight: "",
  goals: "",
  medicationsOrSupplements: "",
  medicalConditions: "",
  medicalHistory: "",
  dailyCalorieTarget: "",
  dailyCalorieUpdatedAt: ""
};

function normalizeString(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeProfile(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    profilePicture: normalizeString(source.profilePicture),
    name: normalizeString(source.name),
    age: normalizeString(source.age),
    gender: normalizeString(source.gender),
    height: normalizeString(source.height),
    weight: normalizeString(source.weight),
    goals: normalizeString(source.goals),
    medicationsOrSupplements: normalizeString(source.medicationsOrSupplements),
    medicalConditions: normalizeString(source.medicalConditions),
    medicalHistory: normalizeString(source.medicalHistory),
    dailyCalorieTarget: normalizeString(source.dailyCalorieTarget),
    dailyCalorieUpdatedAt: normalizeString(source.dailyCalorieUpdatedAt)
  };
}

async function loadLocalProfile(accountId) {
  const raw = await AsyncStorage.getItem(resolveProfileStorageKey(accountId));
  if (!raw) {
    return { ...emptyProfile };
  }
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return { ...emptyProfile };
  }
}

async function saveLocalProfile(profile, accountId) {
  const normalized = normalizeProfile(profile);
  await AsyncStorage.setItem(resolveProfileStorageKey(accountId), JSON.stringify(normalized));
  return normalized;
}

async function writeLastSynced(accountId, accountEmail, isoTimestamp) {
  await AsyncStorage.setItem(resolveProfileSyncMetaKey(accountId, accountEmail), isoTimestamp);
}

export async function loadProfileLastSynced(accountId, accountEmail) {
  const raw = await AsyncStorage.getItem(resolveProfileSyncMetaKey(accountId, accountEmail));
  if (!raw) {
    return "";
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return raw;
}

export async function loadProfile(accountId, accountEmail) {
  const cacheKey = resolveCacheKey(accountId, accountEmail);
  if (profileMemoryCache.has(cacheKey)) {
    return { ...profileMemoryCache.get(cacheKey) };
  }

  const firestoreUserId = toFirestoreUserId(accountEmail);
  if (!firestoreUserId) {
    const localProfile = await loadLocalProfile(accountId);
    profileMemoryCache.set(cacheKey, localProfile);
    return { ...localProfile };
  }

  try {
    const userRef = doc(firestore, "users", firestoreUserId);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      const normalized = fromFirestoreProfile(snapshot.data()?.profile);
      await saveLocalProfile(normalized, accountId);
      profileMemoryCache.set(cacheKey, normalized);
      return { ...normalized };
    }
  } catch (error) {
    console.warn("Unable to load profile from Firestore; falling back to local storage", error);
  }

  const localProfile = await loadLocalProfile(accountId);
  profileMemoryCache.set(cacheKey, localProfile);
  return { ...localProfile };
}

export async function saveProfile(profile, accountId, accountEmail) {
  const normalized = normalizeProfile(profile);
  const firestoreUserId = toFirestoreUserId(accountEmail);
  const cacheKey = resolveCacheKey(accountId, accountEmail);
  const syncedAt = new Date().toISOString();

  if (!firestoreUserId) {
    const localSaved = await saveLocalProfile(normalized, accountId);
    await writeLastSynced(accountId, accountEmail, syncedAt);
    profileMemoryCache.set(cacheKey, localSaved);
    return localSaved;
  }

  const userRef = doc(firestore, "users", firestoreUserId);
  await setDoc(userRef, { profile: toFirestoreProfile(normalized) }, { merge: true });
  const localSaved = await saveLocalProfile(normalized, accountId);
  await writeLastSynced(accountId, accountEmail, syncedAt);
  profileMemoryCache.set(cacheKey, localSaved);
  return localSaved;
}
