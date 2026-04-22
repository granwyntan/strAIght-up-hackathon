import AsyncStorage from "@react-native-async-storage/async-storage";

export const PROFILE_STORAGE_KEY = "gramwin.profile.v1";

function resolveProfileStorageKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${PROFILE_STORAGE_KEY}.${suffix}`;
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
  medicalHistory: ""
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
    medicalHistory: normalizeString(source.medicalHistory)
  };
}

export async function loadProfile(accountId) {
  const raw = await AsyncStorage.getItem(resolveProfileStorageKey(accountId));
  if (!raw) {
    return { ...emptyProfile };
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeProfile(parsed);
  } catch {
    return { ...emptyProfile };
  }
}

export async function saveProfile(profile, accountId) {
  const normalized = normalizeProfile(profile);
  await AsyncStorage.setItem(resolveProfileStorageKey(accountId), JSON.stringify(normalized));
  return normalized;
}
