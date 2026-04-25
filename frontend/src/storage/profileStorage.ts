// @ts-nocheck
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../lib/firebaseClient";

export const PROFILE_STORAGE_KEY = "gramwin.profile.v2";
const PROFILE_SYNC_META_KEY = "gramwin.profile.lastSync.v2";
const firestore = db;
const profileMemoryCache = new Map();

function normalizeString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item).trim())
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index);
  }
  return [];
}

function resolveProfileStorageKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${PROFILE_STORAGE_KEY}.${suffix}`;
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

function resolveProfileSyncMetaKey(accountId, accountEmail) {
  return `${PROFILE_SYNC_META_KEY}.${resolveCacheKey(accountId, accountEmail)}`;
}

function joinLines(values) {
  return normalizeArray(values).join(", ");
}

function joinGoalSummary(goalTags, activityGoalTags) {
  return [...normalizeArray(goalTags), ...normalizeArray(activityGoalTags)].join(", ");
}

function joinMedicalSummary(healthConditionTags, healthConditionNotes) {
  const tags = normalizeArray(healthConditionTags);
  const notes = normalizeString(healthConditionNotes).trim();
  return [tags.join(", "), notes].filter(Boolean).join(notes && tags.length ? " | " : "");
}

function joinMedicationSummary(medicationTags, supplementTags) {
  return [...normalizeArray(medicationTags), ...normalizeArray(supplementTags)].join(", ");
}

export const emptyProfile = {
  version: 2,
  onboardingStatus: "pending",
  onboardingCompletedAt: "",
  onboardingSkippedAt: "",
  profilePicture: "",
  name: "",
  age: "",
  gender: "",
  sex: "",
  country: "",
  region: "",
  height: "",
  weight: "",
  bodyFatPercentage: "",
  muscleMass: "",
  waistCircumference: "",
  averageStepsPerDay: "",
  goals: "",
  goalTags: [],
  activityGoalTags: [],
  medicationsOrSupplements: "",
  medicationTags: [],
  medicationDetails: "",
  supplementTags: [],
  supplementDetails: "",
  medicalConditions: "",
  healthConditionTags: [],
  healthConditionNotes: "",
  allergies: "",
  allergyTags: [],
  allergyNotes: "",
  allergySeverity: "",
  familyHistoryTags: [],
  familyHistoryNotes: "",
  medicalHistory: "",
  activityLevel: "",
  sleepHours: "",
  sleepQuality: "",
  stressLevel: "",
  smoking: "",
  alcohol: "",
  caffeineIntake: "",
  dietType: "",
  religiousRestrictionTags: [],
  foodDislikeTags: [],
  eatingPattern: "",
  targetWeight: "",
  dailyCalorieTarget: "",
  proteinTarget: "",
  carbTarget: "",
  fatTarget: "",
  sodiumLimit: "",
  sugarLimit: "",
  insightDepth: "Balanced",
  recommendationStyle: "Moderate",
  dataSharingConsent: false,
  shareAnonymisedData: false,
  storagePreference: "Local",
  notificationMealReminders: false,
  notificationActivityReminders: false,
  notificationInsights: true,
  notificationAlerts: true,
  notificationInvestigationResults: true,
  dailyCalorieUpdatedAt: "",
};

function deriveLegacyFields(profile) {
  return {
    ...profile,
    sex: normalizeString(profile.sex || profile.gender),
    gender: normalizeString(profile.gender || profile.sex),
    goals: normalizeString(profile.goals).trim() || joinGoalSummary(profile.goalTags, profile.activityGoalTags),
    medicalConditions:
      normalizeString(profile.medicalConditions).trim() || joinMedicalSummary(profile.healthConditionTags, profile.healthConditionNotes),
    medicationsOrSupplements:
      normalizeString(profile.medicationsOrSupplements).trim() || joinMedicationSummary(profile.medicationTags, profile.supplementTags),
    allergies: normalizeString(profile.allergies).trim() || joinLines(profile.allergyTags),
    dailyCalorieTarget: normalizeString(profile.dailyCalorieTarget),
  };
}

export function normalizeProfile(input) {
  const source = input && typeof input === "object" ? input : {};
  const normalized = {
    version: 2,
    onboardingStatus: ["pending", "skipped", "complete"].includes(normalizeString(source.onboardingStatus)) ? normalizeString(source.onboardingStatus) : "pending",
    onboardingCompletedAt: normalizeString(source.onboardingCompletedAt),
    onboardingSkippedAt: normalizeString(source.onboardingSkippedAt),
    profilePicture: normalizeString(source.profilePicture || source.profile_picture),
    name: normalizeString(source.name),
    age: normalizeString(source.age),
    gender: normalizeString(source.gender || source.sex),
    sex: normalizeString(source.sex || source.gender),
    country: normalizeString(source.country),
    region: normalizeString(source.region),
    height: normalizeString(source.height || source.heightCm || source.height_cm),
    weight: normalizeString(source.weight || source.weightKg || source.weight_kg),
    bodyFatPercentage: normalizeString(source.bodyFatPercentage || source.body_fat_percentage || source.body_fat_pct),
    muscleMass: normalizeString(source.muscleMass || source.muscle_mass),
    waistCircumference: normalizeString(source.waistCircumference || source.waist_circumference),
    averageStepsPerDay: normalizeString(source.averageStepsPerDay || source.average_steps_per_day),
    goals: normalizeString(source.goals),
    goalTags: normalizeArray(source.goalTags || source.goal_tags),
    activityGoalTags: normalizeArray(source.activityGoalTags || source.activity_goal_tags),
    medicationsOrSupplements: normalizeString(source.medicationsOrSupplements || source.current_medication),
    medicationTags: normalizeArray(source.medicationTags || source.medication_tags),
    medicationDetails: normalizeString(source.medicationDetails || source.medication_details),
    supplementTags: normalizeArray(source.supplementTags || source.supplement_tags),
    supplementDetails: normalizeString(source.supplementDetails || source.supplement_details),
    medicalConditions: normalizeString(source.medicalConditions || source.conditions),
    healthConditionTags: normalizeArray(source.healthConditionTags || source.health_condition_tags),
    healthConditionNotes: normalizeString(source.healthConditionNotes || source.health_condition_notes),
    allergies: normalizeString(source.allergies),
    allergyTags: normalizeArray(source.allergyTags || source.allergy_tags),
    allergyNotes: normalizeString(source.allergyNotes || source.allergy_notes),
    allergySeverity: normalizeString(source.allergySeverity || source.allergy_severity),
    familyHistoryTags: normalizeArray(source.familyHistoryTags || source.family_history_tags),
    familyHistoryNotes: normalizeString(source.familyHistoryNotes || source.family_history_notes),
    medicalHistory: normalizeString(source.medicalHistory || source.medical_history),
    activityLevel: normalizeString(source.activityLevel || source.activity_level),
    sleepHours: normalizeString(source.sleepHours || source.sleep_hours),
    sleepQuality: normalizeString(source.sleepQuality || source.sleep_quality),
    stressLevel: normalizeString(source.stressLevel || source.stress_level),
    smoking: normalizeString(source.smoking),
    alcohol: normalizeString(source.alcohol),
    caffeineIntake: normalizeString(source.caffeineIntake || source.caffeine_intake),
    dietType: normalizeString(source.dietType || source.diet_type),
    religiousRestrictionTags: normalizeArray(source.religiousRestrictionTags || source.religious_restriction_tags),
    foodDislikeTags: normalizeArray(source.foodDislikeTags || source.food_dislike_tags),
    eatingPattern: normalizeString(source.eatingPattern || source.eating_pattern),
    targetWeight: normalizeString(source.targetWeight || source.target_weight),
    dailyCalorieTarget: normalizeString(source.dailyCalorieTarget || source.daily_calorie_target),
    proteinTarget: normalizeString(source.proteinTarget || source.protein_target),
    carbTarget: normalizeString(source.carbTarget || source.carb_target),
    fatTarget: normalizeString(source.fatTarget || source.fat_target),
    sodiumLimit: normalizeString(source.sodiumLimit || source.sodium_limit),
    sugarLimit: normalizeString(source.sugarLimit || source.sugar_limit),
    insightDepth: normalizeString(source.insightDepth || source.insight_depth) || "Balanced",
    recommendationStyle: normalizeString(source.recommendationStyle || source.recommendation_style) || "Moderate",
    dataSharingConsent: normalizeBoolean(source.dataSharingConsent ?? source.data_sharing_consent),
    shareAnonymisedData: normalizeBoolean(source.shareAnonymisedData ?? source.share_anonymised_data),
    storagePreference: normalizeString(source.storagePreference || source.storage_preference) || "Local",
    notificationMealReminders: normalizeBoolean(source.notificationMealReminders ?? source.notification_meal_reminders),
    notificationActivityReminders: normalizeBoolean(source.notificationActivityReminders ?? source.notification_activity_reminders),
    notificationInsights: source.notificationInsights === undefined ? true : normalizeBoolean(source.notificationInsights),
    notificationAlerts: source.notificationAlerts === undefined ? true : normalizeBoolean(source.notificationAlerts),
    notificationInvestigationResults:
      source.notificationInvestigationResults === undefined
        ? true
        : normalizeBoolean(source.notificationInvestigationResults ?? source.notification_investigation_results),
    dailyCalorieUpdatedAt: normalizeString(source.dailyCalorieUpdatedAt || source.daily_calorie_updated_at),
  };
  return deriveLegacyFields(normalized);
}

function toFirestoreProfile(profile) {
  const normalized = normalizeProfile(profile);
  return {
    ...normalized,
    region: normalized.region,
    profile_picture: normalized.profilePicture,
    height_cm: normalized.height,
    weight_kg: normalized.weight,
    body_fat_percentage: normalized.bodyFatPercentage,
    muscle_mass: normalized.muscleMass,
    waist_circumference: normalized.waistCircumference,
    average_steps_per_day: normalized.averageStepsPerDay,
    goal_tags: normalized.goalTags,
    activity_goal_tags: normalized.activityGoalTags,
    current_medication: normalized.medicationsOrSupplements,
    medication_tags: normalized.medicationTags,
    medication_details: normalized.medicationDetails,
    supplement_tags: normalized.supplementTags,
    supplement_details: normalized.supplementDetails,
    conditions: normalized.medicalConditions,
    health_condition_tags: normalized.healthConditionTags,
    health_condition_notes: normalized.healthConditionNotes,
    allergy_tags: normalized.allergyTags,
    allergy_notes: normalized.allergyNotes,
    allergy_severity: normalized.allergySeverity,
    family_history_tags: normalized.familyHistoryTags,
    family_history_notes: normalized.familyHistoryNotes,
    medical_history: normalized.medicalHistory,
    activity_level: normalized.activityLevel,
    sleep_hours: normalized.sleepHours,
    sleep_quality: normalized.sleepQuality,
    stress_level: normalized.stressLevel,
    caffeine_intake: normalized.caffeineIntake,
    diet_type: normalized.dietType,
    religious_restriction_tags: normalized.religiousRestrictionTags,
    food_dislike_tags: normalized.foodDislikeTags,
    eating_pattern: normalized.eatingPattern,
    target_weight: normalized.targetWeight,
    daily_calorie_target: normalized.dailyCalorieTarget,
    protein_target: normalized.proteinTarget,
    carb_target: normalized.carbTarget,
    fat_target: normalized.fatTarget,
    sodium_limit: normalized.sodiumLimit,
    sugar_limit: normalized.sugarLimit,
    insight_depth: normalized.insightDepth,
    recommendation_style: normalized.recommendationStyle,
    data_sharing_consent: normalized.dataSharingConsent,
    share_anonymised_data: normalized.shareAnonymisedData,
    storage_preference: normalized.storagePreference,
    notification_meal_reminders: normalized.notificationMealReminders,
    notification_activity_reminders: normalized.notificationActivityReminders,
    notification_insights: normalized.notificationInsights,
    notification_alerts: normalized.notificationAlerts,
    notification_investigation_results: normalized.notificationInvestigationResults,
    daily_calorie_updated_at: normalized.dailyCalorieUpdatedAt,
  };
}

function fromFirestoreProfile(source) {
  return normalizeProfile(source);
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
  if (!firestoreUserId || !firestore) {
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

  if (!firestoreUserId || !firestore) {
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

export function calculateBmiValue(profile) {
  const weight = Number(normalizeString(profile?.weight).replace(/[^\d.]/g, ""));
  const heightCm = Number(normalizeString(profile?.height).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(weight) || !Number.isFinite(heightCm) || weight <= 0 || heightCm <= 0) {
    return null;
  }
  const heightM = heightCm / 100;
  return weight / (heightM * heightM);
}

export function calculateBmrValue(profile) {
  const weight = Number(normalizeString(profile?.weight).replace(/[^\d.]/g, ""));
  const heightCm = Number(normalizeString(profile?.height).replace(/[^\d.]/g, ""));
  const age = Number(normalizeString(profile?.age).replace(/[^\d.]/g, ""));
  const sex = normalizeString(profile?.gender || profile?.sex).toLowerCase();
  if (!Number.isFinite(weight) || !Number.isFinite(heightCm) || !Number.isFinite(age) || weight <= 0 || heightCm <= 0 || age <= 0) {
    return null;
  }
  if (sex === "male") {
    return 10 * weight + 6.25 * heightCm - 5 * age + 5;
  }
  if (sex === "female") {
    return 10 * weight + 6.25 * heightCm - 5 * age - 161;
  }
  return 10 * weight + 6.25 * heightCm - 5 * age - 78;
}

export function profileCompletionSummary(profile) {
  const normalized = normalizeProfile(profile);
  const checks = [
    Boolean(normalized.age),
    Boolean(normalized.gender),
    Boolean(normalized.height),
    Boolean(normalized.weight),
    Boolean(normalized.country),
    normalized.healthConditionTags.length > 0 || Boolean(normalized.healthConditionNotes),
    normalized.goalTags.length > 0 || normalized.activityGoalTags.length > 0,
    Boolean(normalized.activityLevel),
    Boolean(normalized.dietType),
    normalized.medicationTags.length > 0 || normalized.supplementTags.length > 0,
  ];
  const completed = checks.filter(Boolean).length;
  return {
    completed,
    total: checks.length,
    progress: completed / checks.length,
  };
}

export function profileHasMeaningfulSetup(profile) {
  const normalized = normalizeProfile(profile);
  return [
    normalized.name,
    normalized.age,
    normalized.gender,
    normalized.height,
    normalized.weight,
    normalized.country,
    normalized.goals,
    normalized.medicalConditions,
    normalized.activityLevel,
    normalized.dietType,
  ].some((value) => normalizeString(value).trim());
}

export function profileNeedsOnboarding(profile) {
  const normalized = normalizeProfile(profile);
  if (normalized.onboardingStatus === "complete") {
    return false;
  }
  const hasMeaningfulSetup = profileHasMeaningfulSetup(normalized);
  if (!hasMeaningfulSetup) {
    return true;
  }
  if (normalized.onboardingStatus === "skipped") {
    return false;
  }
  return normalized.onboardingStatus === "pending";
}

export function buildDietProfileContext(profile) {
  const normalized = normalizeProfile(profile);
  return [
    normalized.goalTags.length ? `Diet goals: ${normalized.goalTags.join(", ")}` : "",
    normalized.activityGoalTags.length ? `Activity goals: ${normalized.activityGoalTags.join(", ")}` : "",
    normalized.healthConditionTags.length ? `Conditions: ${normalized.healthConditionTags.join(", ")}` : "",
    normalized.allergyTags.length ? `Allergies: ${normalized.allergyTags.join(", ")}` : "",
    normalized.dietType ? `Diet style: ${normalized.dietType}` : "",
    normalized.religiousRestrictionTags.length ? `Religious or cultural restrictions: ${normalized.religiousRestrictionTags.join(", ")}` : "",
    normalized.eatingPattern ? `Eating pattern: ${normalized.eatingPattern}` : "",
    normalized.foodDislikeTags.length ? `Food dislikes: ${normalized.foodDislikeTags.join(", ")}` : "",
    normalized.sodiumLimit ? `Sodium limit: ${normalized.sodiumLimit}` : "",
    normalized.sugarLimit ? `Sugar limit: ${normalized.sugarLimit}` : "",
    normalized.dailyCalorieTarget ? `Daily calorie target: ${normalized.dailyCalorieTarget}` : "",
    normalized.proteinTarget ? `Protein target: ${normalized.proteinTarget}` : "",
    normalized.carbTarget ? `Carb target: ${normalized.carbTarget}` : "",
    normalized.fatTarget ? `Fat target: ${normalized.fatTarget}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSupplementProfileContext(profile) {
  const normalized = normalizeProfile(profile);
  return [
    normalized.name ? `Name: ${normalized.name}` : "",
    normalized.age ? `Age: ${normalized.age}` : "",
    normalized.gender ? `Sex: ${normalized.gender}` : "",
    normalized.country ? `Country or region: ${normalized.country}${normalized.region ? `, ${normalized.region}` : ""}` : normalized.region ? `Country or region: ${normalized.region}` : "",
    normalized.height ? `Height: ${normalized.height} cm` : "",
    normalized.weight ? `Weight: ${normalized.weight} kg` : "",
    normalized.bodyFatPercentage ? `Body fat: ${normalized.bodyFatPercentage}%` : "",
    normalized.muscleMass ? `Muscle mass: ${normalized.muscleMass}` : "",
    normalized.waistCircumference ? `Waist circumference: ${normalized.waistCircumference}` : "",
    normalized.healthConditionTags.length ? `Health conditions: ${normalized.healthConditionTags.join(", ")}` : "",
    normalized.medicalConditions ? `Medical conditions notes: ${normalized.medicalConditions}` : "",
    normalized.medicalHistory ? `Medical history: ${normalized.medicalHistory}` : "",
    normalized.allergyTags.length ? `Allergies: ${normalized.allergyTags.join(", ")}` : "",
    normalized.allergies ? `Allergy notes: ${normalized.allergies}` : "",
    normalized.allergySeverity ? `Allergy severity: ${normalized.allergySeverity}` : "",
    normalized.familyHistoryTags.length ? `Family history: ${normalized.familyHistoryTags.join(", ")}` : "",
    normalized.familyHistoryNotes ? `Family history notes: ${normalized.familyHistoryNotes}` : "",
    normalized.goalTags.length ? `Diet goals: ${normalized.goalTags.join(", ")}` : "",
    normalized.activityGoalTags.length ? `Activity goals: ${normalized.activityGoalTags.join(", ")}` : "",
    normalized.goals ? `Goal notes: ${normalized.goals}` : "",
    normalized.dietType ? `Diet type: ${normalized.dietType}` : "",
    normalized.eatingPattern ? `Eating pattern: ${normalized.eatingPattern}` : "",
    normalized.foodDislikeTags.length ? `Food dislikes or rules: ${normalized.foodDislikeTags.join(", ")}` : "",
    normalized.religiousRestrictionTags.length ? `Religious or cultural practices: ${normalized.religiousRestrictionTags.join(", ")}` : "",
    normalized.medicationTags.length ? `Current medications: ${normalized.medicationTags.join(", ")}` : "",
    normalized.supplementTags.length ? `Current supplements: ${normalized.supplementTags.join(", ")}` : "",
    normalized.medicationsOrSupplements ? `Current medications and supplements notes: ${normalized.medicationsOrSupplements}` : "",
    normalized.medicationDetails ? `Medication details: ${normalized.medicationDetails}` : "",
    normalized.supplementDetails ? `Supplement details: ${normalized.supplementDetails}` : "",
    normalized.targetWeight ? `Target weight: ${normalized.targetWeight} kg` : "",
    normalized.dailyCalorieTarget ? `Daily calorie target: ${normalized.dailyCalorieTarget} kcal/day` : "",
    normalized.proteinTarget ? `Protein target: ${normalized.proteinTarget} g/day` : "",
    normalized.carbTarget ? `Carb target: ${normalized.carbTarget} g/day` : "",
    normalized.fatTarget ? `Fat target: ${normalized.fatTarget} g/day` : "",
    normalized.sodiumLimit ? `Sodium limit: ${normalized.sodiumLimit} mg/day` : "",
    normalized.sugarLimit ? `Sugar limit: ${normalized.sugarLimit} g/day` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildActivityProfileContext(profile) {
  const normalized = normalizeProfile(profile);
  return [
    normalized.activityLevel ? `Activity level: ${normalized.activityLevel}` : "",
    normalized.averageStepsPerDay ? `Average daily steps: ${normalized.averageStepsPerDay}` : "",
    normalized.goalTags.length ? `Diet goals: ${normalized.goalTags.join(", ")}` : "",
    normalized.activityGoalTags.length ? `Activity goals: ${normalized.activityGoalTags.join(", ")}` : "",
    normalized.sleepHours ? `Sleep hours: ${normalized.sleepHours}` : "",
    normalized.sleepQuality ? `Sleep quality: ${normalized.sleepQuality}` : "",
    normalized.stressLevel ? `Stress level: ${normalized.stressLevel}` : "",
    normalized.medicalConditions ? `Conditions: ${normalized.medicalConditions}` : "",
    normalized.medicationsOrSupplements ? `Medications or supplements: ${normalized.medicationsOrSupplements}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildVerificationProfileContext(profile) {
  const normalized = normalizeProfile(profile);
  return [
    normalized.healthConditionTags.length ? `Conditions: ${normalized.healthConditionTags.join(", ")}` : "",
    normalized.allergyTags.length ? `Allergies: ${normalized.allergyTags.join(", ")}` : "",
    normalized.medicationTags.length ? `Medications: ${normalized.medicationTags.join(", ")}` : "",
    normalized.supplementTags.length ? `Supplements: ${normalized.supplementTags.join(", ")}` : "",
    normalized.goalTags.length ? `Diet goals: ${normalized.goalTags.join(", ")}` : "",
    normalized.activityGoalTags.length ? `Activity goals: ${normalized.activityGoalTags.join(", ")}` : "",
    normalized.dietType ? `Diet type: ${normalized.dietType}` : "",
    normalized.eatingPattern ? `Eating pattern: ${normalized.eatingPattern}` : "",
    normalized.foodDislikeTags.length ? `Food dislikes or rules: ${normalized.foodDislikeTags.join(", ")}` : "",
    normalized.religiousRestrictionTags.length ? `Religious or cultural practices: ${normalized.religiousRestrictionTags.join(", ")}` : "",
    normalized.medicalHistory ? `Medical history: ${normalized.medicalHistory}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
