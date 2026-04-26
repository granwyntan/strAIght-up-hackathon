// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Avatar, Button, Card, Chip, IconButton, SegmentedButtons, Text, TextInput, TouchableRipple } from "react-native-paper";

import { palette, type AppTab, type InvestigationSummary } from "../data";
import TutorialSheet from "../components/shared/TutorialSheet";
import { loadProfile, saveProfile } from "../storage/profileStorage";
import { formatLocalIsoDate, loadHomeVitals, refreshHomeVitalsFromFirestore, saveHomeVitalForDate } from "../storage/homeVitalsStorage";
import { loadCalorieWeek } from "../storage/calorieTrackerStorage";
import { addExerciseEntry, clearExerciseEntriesExceptDate, deleteExerciseEntry, loadExerciseEntries, updateExerciseEntry } from "../storage/exerciseStorage";
import { loadWorkoutTasks, replaceWorkoutTasks, resetWorkoutTaskCompletion, setWorkoutTaskCompleted } from "../storage/workoutRoutineStorage";
import { addMedicationEntry, deleteMedicationEntry, loadMedicationEntries, updateMedicationEntry } from "../storage/medicationStorage";

const metricDefinitions = [
  { key: "restingHeartRate", label: "Heart rate", icon: "heart-pulse", placeholder: "e.g. 68 bpm" },
  { key: "sleep", label: "Sleep", icon: "sleep", placeholder: "e.g. 7h 30m" },
  { key: "steps", label: "Steps", icon: "walk", placeholder: "e.g. 8500" },
  { key: "hydration", label: "Hydration", icon: "cup-water", placeholder: "e.g. 2.1 L" },
] as const;

const intensityOptions = [
  { value: "easy", label: "Easy" },
  { value: "mid", label: "Mid" },
  { value: "hard", label: "Hard" },
  { value: "max", label: "Max" },
] as const;
const EXERCISE_GUIDE_PAGES = [
  {
    title: "Welcome to the exercise tracker",
    body: "Track your completed exercises each day and keep your records organized.",
  },
  {
    title: "Use + to add completed exercises",
    body: "Tap the + button to add an exercise that you have completed for today.",
  },
  {
    title: "Use * to suggest routines",
    body: "Tap the * button to generate exercise routines tailored to your profile and goals.",
  },
  {
    title: "Manage your current routine",
    body: "Your active routine appears below. Edit it anytime, and completed routine items can be checked off and added into today’s exercise tracker.",
  },
];

type WorkoutTask = {
  id: string;
  routineTitle: string;
  type: string;
  duration: string;
  intensity: string;
  description: string;
  completed: boolean;
  completedAt: string;
  createdAt: string;
};

type WorkoutSuggestion = {
  routineTitle: string;
  exercises: Array<{
    type: string;
    duration: string;
    intensity: string;
    description: string;
  }>;
};

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function capitalizeWorkoutType(value: string) {
  const trimmed = safeTrim(value);
  if (!trimmed) {
    return "Workout";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function normalizeIntensity(value: string) {
  const v = safeTrim(value).toLowerCase();
  if (v === "easy") return "easy";
  if (v === "mid" || v === "medium") return "mid";
  if (v === "hard") return "hard";
  if (v === "max" || v === "max effort") return "max";
  return "mid";
}

function formatIntensity(value: string) {
  const v = normalizeIntensity(value);
  if (v === "easy") return "Easy";
  if (v === "hard") return "Hard";
  if (v === "max") return "Max";
  return "Mid";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatTime(isoText: string) {
  const parsed = new Date(isoText || "");
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function formatTimestamp(isoText: string) {
  const parsed = new Date(isoText || "");
  if (Number.isNaN(parsed.getTime())) {
    return isoText;
  }
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function classifyMealWindow(isoText: string) {
  const parsed = new Date(isoText || "");
  const hour = Number.isNaN(parsed.getTime()) ? 12 : parsed.getHours();
  if (hour >= 4 && hour < 11) {
    return "Breakfast";
  }
  if (hour >= 11 && hour < 15) {
    return "Lunch";
  }
  if (hour >= 15 && hour < 24) {
    return "Dinner";
  }
  return "Night snack";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultRoutineForm() {
  return {
    age: "",
    heightCm: "",
    weightKg: "",
    goals: "",
  };
}

function parseMedicationLines(value: string) {
  return value
    .split(/[\n;,]+/)
    .map((item) => safeTrim(item).replace(/^[-*•\d.)\s]+/, ""))
    .filter(Boolean)
    .slice(0, 8)
    .map((name, index) => ({
      id: `fallback-med-${index + 1}`,
      name,
      dosage: "",
      frequency: "",
      timeOfDay: "",
      createdAt: new Date().toISOString(),
    }));
}

function normalizeSuggestion(payload: any): WorkoutSuggestion {
  return {
    routineTitle: typeof payload?.routineTitle === "string" ? payload.routineTitle : "Personal routine",
    exercises: Array.isArray(payload?.exercises)
      ? payload.exercises.map((item: any) => ({
          type: typeof item?.type === "string" ? item.type : "Workout",
          duration: typeof item?.duration === "string" ? item.duration : "30 min",
          intensity: typeof item?.intensity === "string" ? item.intensity : "medium",
          description: typeof item?.description === "string" ? item.description : "",
        }))
      : [],
  };
}

function normalizeMedicationName(value: string) {
  return safeTrim(value).toLowerCase();
}

function buildMedicationProfileText(
  medications: Array<{ name: string }>
) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of medications) {
    const name = safeTrim(item?.name);
    if (!name) {
      continue;
    }
    const key = normalizeMedicationName(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names.join(", ");
}

export default function HomeDashboardPage({
  history,
  accountId,
  accountEmail,
  onOpenInvestigate,
  onOpenHistory,
  onOpenTab,
  requestApi,
}: {
  history: InvestigationSummary[];
  accountId?: string;
  accountEmail?: string;
  onOpenInvestigate?: () => void;
  onOpenHistory: (id: string) => void;
  onOpenTab: (tab: AppTab) => void;
  requestApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const todayDate = formatLocalIsoDate(new Date());
  const latest = useMemo(
    () =>
      history
        .slice()
        .sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime())[0] || null,
    [history]
  );
  const completedRuns = useMemo(() => history.filter((item) => item.status === "completed").length, [history]);
  const runningRuns = useMemo(() => history.filter((item) => item.status === "running" || item.status === "queued").length, [history]);
  const scoredRuns = useMemo(() => history.filter((item) => item.verdict !== "mixed").length, [history]);

  const [welcomeName, setWelcomeName] = useState("");
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState<number | null>(null);
  const [medications, setMedications] = useState<Array<{ id: string; name: string; dosage: string; frequency: string; timeOfDay: string; createdAt: string }>>([]);
  const [medicationModalVisible, setMedicationModalVisible] = useState(false);
  const [medicationSaving, setMedicationSaving] = useState(false);
  const [medicationError, setMedicationError] = useState("");
  const [editingMedicationId, setEditingMedicationId] = useState("");
  const [medicationNameDraft, setMedicationNameDraft] = useState("");
  const [medicationDosageDraft, setMedicationDosageDraft] = useState("");
  const [medicationFrequencyDraft, setMedicationFrequencyDraft] = useState("");
  const [medicationTimeDraft, setMedicationTimeDraft] = useState("");

  const [vitalsMap, setVitalsMap] = useState<Record<string, Record<string, string>>>({});
  const [loadingVitals, setLoadingVitals] = useState(true);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [metricModalVisible, setMetricModalVisible] = useState(false);
  const [metricDraft, setMetricDraft] = useState("");
  const [metricSaving, setMetricSaving] = useState(false);
  const [metricError, setMetricError] = useState("");
  const [activeMetricKey, setActiveMetricKey] = useState<(typeof metricDefinitions)[number]["key"]>("restingHeartRate");

  const [mealEntries, setMealEntries] = useState<Array<{ id: string; mealName: string; calories: number; date: string; createdAt: string }>>([]);
  const [loadingMeals, setLoadingMeals] = useState(true);

  const [exerciseEntries, setExerciseEntries] = useState<Array<{ id: string; title: string; duration: string; intensity: string; notes: string; sourceRoutineTaskId?: string; createdAt: string; date: string }>>(
    []
  );
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [exerciseSaving, setExerciseSaving] = useState(false);
  const [exerciseError, setExerciseError] = useState("");
  const [editingExerciseId, setEditingExerciseId] = useState("");
  const [exerciseTitle, setExerciseTitle] = useState("");
  const [exerciseDuration, setExerciseDuration] = useState("");
  const [exerciseIntensity, setExerciseIntensity] = useState("");
  const [exerciseNotes, setExerciseNotes] = useState("");
  const [expandedExerciseId, setExpandedExerciseId] = useState("");

  const [routineTasks, setRoutineTasks] = useState<WorkoutTask[]>([]);
  const [loadingRoutineTasks, setLoadingRoutineTasks] = useState(true);
  const [routineError, setRoutineError] = useState("");
  const [routineModalVisible, setRoutineModalVisible] = useState(false);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [routineForm, setRoutineForm] = useState(defaultRoutineForm);
  const [suggestedRoutine, setSuggestedRoutine] = useState<WorkoutSuggestion | null>(null);
  const [selectedRoutineIndices, setSelectedRoutineIndices] = useState<number[]>([]);
  const [routineEditModalVisible, setRoutineEditModalVisible] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState("");
  const [routineTypeDraft, setRoutineTypeDraft] = useState("");
  const [routineDurationDraft, setRoutineDurationDraft] = useState("");
  const [routineIntensityDraft, setRoutineIntensityDraft] = useState("");
  const [routineDescriptionDraft, setRoutineDescriptionDraft] = useState("");
  const [routineSaving, setRoutineSaving] = useState(false);
  const [expandedRoutineId, setExpandedRoutineId] = useState("");
  const [exerciseGuideVisible, setExerciseGuideVisible] = useState(false);
  const [manualRoutineModalVisible, setManualRoutineModalVisible] = useState(false);
  const [manualRoutineTitle, setManualRoutineTitle] = useState("");
  const [manualRoutineError, setManualRoutineError] = useState("");
  const [routineExerciseModalVisible, setRoutineExerciseModalVisible] = useState(false);
  const [targetRoutineTitle, setTargetRoutineTitle] = useState("");
  const [routineExerciseTitle, setRoutineExerciseTitle] = useState("");
  const [routineExerciseDuration, setRoutineExerciseDuration] = useState("");
  const [routineExerciseIntensity, setRoutineExerciseIntensity] = useState("");
  const [routineExerciseNotes, setRoutineExerciseNotes] = useState("");
  const [routineTitleEditVisible, setRoutineTitleEditVisible] = useState(false);
  const [editingRoutineTitle, setEditingRoutineTitle] = useState("");
  const [routineTitleDraft, setRoutineTitleDraft] = useState("");

  const syncProfileMedicationNames = async (
    medicationsToSync: Array<{ name: string }>
  ) => {
    try {
      const profile = await loadProfile(accountId, accountEmail);
      const nextMedicationText = buildMedicationProfileText(medicationsToSync);
      if (safeTrim((profile as any)?.medicationsOrSupplements) === nextMedicationText) {
        return;
      }
      await saveProfile(
        {
          ...(profile as any),
          medicationsOrSupplements: nextMedicationText,
        },
        accountId,
        accountEmail
      );
    } catch (error) {
      console.warn("Unable to sync medication names back to profile", error);
    }
  };

  useEffect(() => {
    let mounted = true;

    const buildMedicationLog = async (
      profile: any,
      loadedMedications: Array<{ id: string; name: string; dosage: string; frequency: string; timeOfDay: string; createdAt: string }>,
      persistMissingFromProfile: boolean
    ) => {
      const profileMedicationSeeds = parseMedicationLines(safeTrim((profile as any)?.medicationsOrSupplements));
      const normalizedLoaded = Array.isArray(loadedMedications) ? loadedMedications : [];
      const existingNames = new Set(normalizedLoaded.map((item) => normalizeMedicationName(item.name)));
      const missingFromProfile = profileMedicationSeeds.filter((item) => !existingNames.has(normalizeMedicationName(item.name)));

      let nextMedicationLog = normalizedLoaded;
      if (persistMissingFromProfile && missingFromProfile.length > 0) {
        const created = await Promise.all(
          missingFromProfile.map((item) =>
            addMedicationEntry(
              accountId,
              {
                name: item.name,
                dosage: "",
                frequency: "",
                timeOfDay: "",
                createdAt: new Date().toISOString(),
              },
              accountEmail
            )
          )
        );
        nextMedicationLog = [...normalizedLoaded, ...created];
      } else if (missingFromProfile.length > 0) {
        nextMedicationLog = [...normalizedLoaded, ...missingFromProfile];
      }

      if (nextMedicationLog.length === 0 && profileMedicationSeeds.length > 0) {
        nextMedicationLog = profileMedicationSeeds;
      }
      return nextMedicationLog;
    };

    const applyHydrated = (
      vitals: any,
      weekPayload: any,
      exercises: any,
      workoutTasks: any,
      profile: any,
      medicationLog: any
    ) => {
      if (!mounted) {
        return;
      }
      setVitalsMap((vitals || {}) as Record<string, Record<string, string>>);
      const allMeals = Array.isArray(weekPayload?.entries) ? weekPayload.entries : [];
      setMealEntries(
        allMeals
          .filter((entry) => entry?.date === todayDate)
          .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
      );
      setExerciseEntries(Array.isArray(exercises) ? exercises : []);
      setRoutineTasks(Array.isArray(workoutTasks) ? workoutTasks : []);
      const profileName = safeTrim((profile as any)?.name);
      const fallbackName = safeTrim(accountEmail ? accountEmail.split("@")[0] : "");
      setWelcomeName(profileName || fallbackName);
      setDailyCalorieTarget(toNumber((profile as any)?.dailyCalorieTarget));
      setMedications(medicationLog);
    };

    const hydrate = async () => {
      setLoadingVitals(true);
      setLoadingMeals(true);
      setLoadingExercises(true);
      setLoadingRoutineTasks(true);

      try {
        await clearExerciseEntriesExceptDate(accountId, todayDate, "");
        const [localVitals, localWeekPayload, localExercises, localWorkoutTasks, localProfile, localMedications] = await Promise.all([
          loadHomeVitals(accountId, ""),
          loadCalorieWeek(accountId, new Date(), ""),
          loadExerciseEntries(accountId, ""),
          loadWorkoutTasks(accountId, ""),
          loadProfile(accountId, ""),
          loadMedicationEntries(accountId, ""),
        ]);
        const localResetTasks = await resetWorkoutTaskCompletion(accountId, "");
        const localMedicationLog = await buildMedicationLog(localProfile, localMedications, false);
        applyHydrated(localVitals, localWeekPayload, localExercises, localResetTasks || localWorkoutTasks, localProfile, localMedicationLog);
        if (mounted) {
          setLoadingVitals(false);
          setLoadingMeals(false);
          setLoadingExercises(false);
          setLoadingRoutineTasks(false);
        }

        if (safeTrim(accountEmail)) {
          void (async () => {
            try {
              await clearExerciseEntriesExceptDate(accountId, todayDate, accountEmail);
              const [remoteVitals, remoteWeekPayload, remoteExercises, remoteWorkoutTasks, remoteProfile, remoteMedications] = await Promise.all([
                refreshHomeVitalsFromFirestore(accountId, accountEmail),
                loadCalorieWeek(accountId, new Date(), accountEmail),
                loadExerciseEntries(accountId, accountEmail),
                loadWorkoutTasks(accountId, accountEmail),
                loadProfile(accountId, accountEmail),
                loadMedicationEntries(accountId, accountEmail),
              ]);
              const remoteResetTasks = await resetWorkoutTaskCompletion(accountId, accountEmail);
              const remoteMedicationLog = await buildMedicationLog(remoteProfile, remoteMedications, true);
              applyHydrated(remoteVitals, remoteWeekPayload, remoteExercises, remoteResetTasks || remoteWorkoutTasks, remoteProfile, remoteMedicationLog);
            } catch {
              // Best effort cloud refresh only.
            }
          })();
        }
      } catch (error) {
        if (mounted) {
          setRoutineError(error instanceof Error ? error.message : "Unable to load dashboard data.");
        }
      } finally {
        if (mounted) {
          setLoadingVitals(false);
          setLoadingMeals(false);
          setLoadingExercises(false);
          setLoadingRoutineTasks(false);
        }
      }
    };
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [accountId, accountEmail, todayDate]);

  const todaysVitals = vitalsMap[todayDate] || {};
  const vitalsHistoryDates = Object.keys(vitalsMap).sort((a, b) => (a > b ? -1 : 1));
  const todaysCalories = useMemo(() => mealEntries.reduce((sum, item) => sum + Number(item.calories || 0), 0), [mealEntries]);
  const todaysExercises = useMemo(
    () =>
      exerciseEntries
        .filter((entry) => entry?.date === todayDate)
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")),
    [exerciseEntries, todayDate]
  );
  const sortedRoutineTasks = useMemo(
    () =>
      routineTasks.slice().sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
      }),
    [routineTasks]
  );
  const groupedRoutineTasks = useMemo(() => {
    const groups = new Map<string, WorkoutTask[]>();
    for (const task of sortedRoutineTasks) {
      const title = safeTrim(task.routineTitle) || "Personal routine";
      if (!groups.has(title)) {
        groups.set(title, []);
      }
      groups.get(title)?.push(task);
    }
    return Array.from(groups.entries()).map(([title, tasks]) => ({ title, tasks }));
  }, [sortedRoutineTasks]);

  const openMetricEditor = (metricKey: (typeof metricDefinitions)[number]["key"]) => {
    setActiveMetricKey(metricKey);
    setMetricDraft(typeof todaysVitals?.[metricKey] === "string" ? todaysVitals[metricKey] : "");
    setMetricError("");
    setMetricModalVisible(true);
  };

  const saveMetric = async () => {
    setMetricSaving(true);
    setMetricError("");
    try {
      const next = await saveHomeVitalForDate(accountId, accountEmail, todayDate, activeMetricKey, metricDraft);
      setVitalsMap(next || {});
      setMetricModalVisible(false);
    } catch (error) {
      setMetricError(error instanceof Error ? error.message : "Unable to save metric.");
    } finally {
      setMetricSaving(false);
    }
  };

  const openExerciseCreate = () => {
    setEditingExerciseId("");
    setExerciseTitle("");
    setExerciseDuration("");
    setExerciseIntensity("mid");
    setExerciseNotes("");
    setExerciseError("");
    setExerciseModalVisible(true);
  };

  const openExerciseEdit = (entry: { id: string; title: string; duration: string; intensity: string; notes: string }) => {
    setEditingExerciseId(entry.id);
    setExerciseTitle(capitalizeWorkoutType(entry.title || ""));
    setExerciseDuration(entry.duration || "");
    setExerciseIntensity(normalizeIntensity(entry.intensity || ""));
    setExerciseNotes(entry.notes || "");
    setExerciseError("");
    setExerciseModalVisible(true);
  };

  const saveExercise = async () => {
    const title = capitalizeWorkoutType(exerciseTitle);
    const duration = safeTrim(exerciseDuration);
    const intensity = normalizeIntensity(exerciseIntensity);
    const notes = safeTrim(exerciseNotes);
    if (!title || !duration || !intensity) {
      setExerciseError("Please fill title, duration, and intensity.");
      return;
    }
    setExerciseSaving(true);
    setExerciseError("");
    try {
      if (editingExerciseId) {
        await updateExerciseEntry(
          accountId,
          editingExerciseId,
          {
            title,
            duration,
            intensity,
            notes,
          },
          accountEmail
        );
        setExerciseEntries((current) =>
          current.map((item) => (item.id === editingExerciseId ? { ...item, title, duration, intensity, notes } : item))
        );
      } else {
        const created = await addExerciseEntry(
          accountId,
          {
            title,
            duration,
            intensity,
            notes,
            createdAt: new Date().toISOString(),
            date: todayDate,
          },
          accountEmail
        );
        setExerciseEntries((current) => [created, ...current]);
      }
      setExerciseModalVisible(false);
      setEditingExerciseId("");
    } catch (error) {
      setExerciseError(error instanceof Error ? error.message : "Unable to save exercise.");
    } finally {
      setExerciseSaving(false);
    }
  };

  const removeExercise = async (entryId: string) => {
    try {
      await deleteExerciseEntry(accountId, entryId, accountEmail);
      setExerciseEntries((current) => current.filter((entry) => entry.id !== entryId));
      if (expandedExerciseId === entryId) {
        setExpandedExerciseId("");
      }
    } catch (error) {
      setExerciseError(error instanceof Error ? error.message : "Unable to delete exercise.");
    }
  };

  const openRoutineModal = async () => {
    setRoutineError("");
    setRoutineLoading(false);
    setSuggestedRoutine(null);
    setSelectedRoutineIndices([]);
    const profile = await loadProfile(accountId, accountEmail);
    setRoutineForm({
      age: safeTrim((profile as any)?.age),
      heightCm: safeTrim((profile as any)?.height),
      weightKg: safeTrim((profile as any)?.weight),
      goals: safeTrim((profile as any)?.goals),
    });
    setRoutineModalVisible(true);
  };

  const openManualRoutineModal = () => {
    setManualRoutineTitle("");
    setManualRoutineError("");
    setManualRoutineModalVisible(true);
  };

  const openRoutineExerciseCreate = (routineTitle: string) => {
    setTargetRoutineTitle(safeTrim(routineTitle) || "Personal routine");
    setRoutineExerciseTitle("");
    setRoutineExerciseDuration("");
    setRoutineExerciseIntensity("mid");
    setRoutineExerciseNotes("");
    setRoutineError("");
    setRoutineExerciseModalVisible(true);
  };

  const generateRoutine = async () => {
    setRoutineLoading(true);
    setRoutineError("");
    try {
      const response = await requestApi("/api/workout-routine/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routineForm),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Unable to generate routine.");
      }
      const payload = await response.json();
      const normalized = normalizeSuggestion(payload);
      setSuggestedRoutine(normalized);
      setSelectedRoutineIndices(normalized.exercises.map((_, index) => index));
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to generate routine.");
    } finally {
      setRoutineLoading(false);
    }
  };

  const toggleSuggestedExercise = (index: number) => {
    setSelectedRoutineIndices((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]));
  };

  const saveSelectedRoutine = async () => {
    if (!suggestedRoutine || suggestedRoutine.exercises.length === 0) {
      setRoutineError("Generate a routine first.");
      return;
    }
    if (selectedRoutineIndices.length === 0) {
      setRoutineError("Select at least one exercise to save.");
      return;
    }
    setRoutineSaving(true);
    setRoutineError("");
    try {
      const selectedExercises = suggestedRoutine.exercises.filter((_, index) => selectedRoutineIndices.includes(index));
      const createdAt = new Date().toISOString();
      const nextTasks: WorkoutTask[] = selectedExercises.map((exercise, index) => ({
        id: `routine-${Date.now()}-${index + 1}`,
        routineTitle: suggestedRoutine.routineTitle,
        type: capitalizeWorkoutType(exercise.type),
        duration: safeTrim(exercise.duration) || "30 min",
        intensity: normalizeIntensity(exercise.intensity),
        description: safeTrim(exercise.description),
        completed: false,
        completedAt: "",
        createdAt,
      }));
      const merged = [...nextTasks, ...routineTasks];
      const saved = await replaceWorkoutTasks(accountId, merged, accountEmail);
      setRoutineTasks(saved);
      setRoutineModalVisible(false);
      setSuggestedRoutine(null);
      setSelectedRoutineIndices([]);
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to save routine.");
    } finally {
      setRoutineSaving(false);
    }
  };

  const toggleRoutineCompleted = async (task: WorkoutTask) => {
    try {
      const completed = !task.completed;
      const updated = await setWorkoutTaskCompleted(accountId, task.id, completed, accountEmail);
      setRoutineTasks(updated as WorkoutTask[]);
      if (completed) {
        const alreadyLoggedToday = exerciseEntries.some((entry) => safeTrim(entry.sourceRoutineTaskId) === task.id && entry.date === todayDate);
        if (alreadyLoggedToday) {
          return;
        }
        const created = await addExerciseEntry(
          accountId,
          {
            id: `routine-complete-${task.id}-${todayDate}`,
            title: task.type,
            duration: task.duration,
            intensity: task.intensity,
            notes: task.description,
            sourceRoutineTaskId: task.id,
            date: todayDate,
            createdAt: new Date().toISOString(),
          },
          accountEmail
        );
        setExerciseEntries((current) => [created, ...current]);
      }
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to update routine task.");
    }
  };

  const openRoutineEdit = (task: WorkoutTask) => {
    setEditingRoutineId(task.id);
    setRoutineTypeDraft(task.type || "");
    setRoutineDurationDraft(task.duration || "");
    setRoutineIntensityDraft(normalizeIntensity(task.intensity || ""));
    setRoutineDescriptionDraft(task.description || "");
    setRoutineError("");
    setRoutineEditModalVisible(true);
  };

  const saveRoutineEdit = async () => {
    const type = capitalizeWorkoutType(routineTypeDraft);
    const duration = safeTrim(routineDurationDraft);
    const intensity = normalizeIntensity(routineIntensityDraft);
    const description = safeTrim(routineDescriptionDraft);
    if (!editingRoutineId || !type || !duration || !intensity) {
      setRoutineError("Please fill title, duration, and intensity.");
      return;
    }
    setRoutineSaving(true);
    setRoutineError("");
    try {
      const updatedTasks = routineTasks.map((task) =>
        task.id === editingRoutineId
          ? {
              ...task,
              type,
              duration,
              intensity,
              description,
            }
          : task
      );
      const saved = await replaceWorkoutTasks(accountId, updatedTasks, accountEmail);
      setRoutineTasks(saved);
      setRoutineEditModalVisible(false);
      setEditingRoutineId("");
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to save routine change.");
    } finally {
      setRoutineSaving(false);
    }
  };

  const deleteRoutineTask = async (taskId: string) => {
    try {
      const updatedTasks = routineTasks.filter((task) => task.id !== taskId);
      const saved = await replaceWorkoutTasks(accountId, updatedTasks, accountEmail);
      setRoutineTasks(saved);
      if (expandedRoutineId === taskId) {
        setExpandedRoutineId("");
      }
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to delete routine item.");
    }
  };

  const openRoutineTitleEdit = (title: string) => {
    setEditingRoutineTitle(title);
    setRoutineTitleDraft(title);
    setRoutineError("");
    setRoutineTitleEditVisible(true);
  };

  const saveRoutineTitleEdit = async () => {
    const currentTitle = safeTrim(editingRoutineTitle);
    const nextTitle = safeTrim(routineTitleDraft);
    if (!currentTitle || !nextTitle) {
      setRoutineError("Routine title is required.");
      return;
    }
    setRoutineSaving(true);
    setRoutineError("");
    try {
      const updatedTasks = routineTasks.map((task) =>
        safeTrim(task.routineTitle) === currentTitle
          ? {
              ...task,
              routineTitle: nextTitle,
            }
          : task
      );
      const saved = await replaceWorkoutTasks(accountId, updatedTasks, accountEmail);
      setRoutineTasks(saved);
      setRoutineTitleEditVisible(false);
      setEditingRoutineTitle("");
      setRoutineTitleDraft("");
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to rename routine.");
    } finally {
      setRoutineSaving(false);
    }
  };

  const deleteRoutineGroup = async (title: string) => {
    try {
      const nextTasks = routineTasks.filter((task) => safeTrim(task.routineTitle) !== safeTrim(title));
      const saved = await replaceWorkoutTasks(accountId, nextTasks, accountEmail);
      setRoutineTasks(saved);
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to delete routine.");
    }
  };

  const saveManualRoutineExercise = async () => {
    const routineTitle = safeTrim(manualRoutineTitle) || "Personal routine";
    if (!routineTitle) {
      setManualRoutineError("Routine title is required.");
      return;
    }
    setManualRoutineModalVisible(false);
    openRoutineExerciseCreate(routineTitle);
  };

  const saveRoutineExercise = async () => {
    const routineTitle = safeTrim(targetRoutineTitle) || "Personal routine";
    const type = capitalizeWorkoutType(routineExerciseTitle);
    const duration = safeTrim(routineExerciseDuration);
    const intensity = normalizeIntensity(routineExerciseIntensity);
    const description = safeTrim(routineExerciseNotes);
    if (!type || !duration || !intensity) {
      setRoutineError("Please fill exercise, duration, and intensity.");
      return;
    }
    setRoutineSaving(true);
    setRoutineError("");
    try {
      const nextTask: WorkoutTask = {
        id: `routine-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        routineTitle,
        type,
        duration,
        intensity,
        description,
        completed: false,
        completedAt: "",
        createdAt: new Date().toISOString(),
      };
      const saved = await replaceWorkoutTasks(accountId, [nextTask, ...routineTasks], accountEmail);
      setRoutineTasks(saved);
      setRoutineExerciseModalVisible(false);
    } catch (error) {
      setRoutineError(error instanceof Error ? error.message : "Unable to add routine exercise.");
    } finally {
      setRoutineSaving(false);
    }
  };

  const openMedicationCreate = () => {
    setEditingMedicationId("");
    setMedicationNameDraft("");
    setMedicationDosageDraft("");
    setMedicationFrequencyDraft("");
    setMedicationTimeDraft("");
    setMedicationError("");
    setMedicationModalVisible(true);
  };

  const openMedicationEdit = (entry: { id: string; name: string; dosage: string; frequency: string; timeOfDay: string }) => {
    setEditingMedicationId(entry.id);
    setMedicationNameDraft(entry.name || "");
    setMedicationDosageDraft(entry.dosage || "");
    setMedicationFrequencyDraft(entry.frequency || "");
    setMedicationTimeDraft(entry.timeOfDay || "");
    setMedicationError("");
    setMedicationModalVisible(true);
  };

  const saveMedication = async () => {
    const name = safeTrim(medicationNameDraft);
    const dosage = safeTrim(medicationDosageDraft);
    const frequency = safeTrim(medicationFrequencyDraft);
    const timeOfDay = safeTrim(medicationTimeDraft);
    if (!name) {
      setMedicationError("Medication name is required.");
      return;
    }
    setMedicationSaving(true);
    setMedicationError("");
    try {
      if (editingMedicationId) {
        const nextMedications = medications.map((item) => (item.id === editingMedicationId ? { ...item, name, dosage, frequency, timeOfDay } : item));
        await updateMedicationEntry(
          accountId,
          editingMedicationId,
          {
            name,
            dosage,
            frequency,
            timeOfDay,
          },
          accountEmail
        );
        setMedications(nextMedications);
        await syncProfileMedicationNames(nextMedications);
      } else {
        const created = await addMedicationEntry(
          accountId,
          {
            name,
            dosage,
            frequency,
            timeOfDay,
            createdAt: new Date().toISOString(),
          },
          accountEmail
        );
        const nextMedications = [...medications, created];
        setMedications(nextMedications);
        await syncProfileMedicationNames(nextMedications);
      }
      setMedicationModalVisible(false);
      setEditingMedicationId("");
    } catch (error) {
      setMedicationError(error instanceof Error ? error.message : "Unable to save medication.");
    } finally {
      setMedicationSaving(false);
    }
  };

  const removeMedication = async (entryId: string) => {
    try {
      await deleteMedicationEntry(accountId, entryId, accountEmail);
      const nextMedications = medications.filter((item) => item.id !== entryId);
      setMedications(nextMedications);
      await syncProfileMedicationNames(nextMedications);
    } catch (error) {
      setMedicationError(error instanceof Error ? error.message : "Unable to delete medication.");
    }
  };

  return (
    <View style={styles.screenStack}>
      <Card mode="contained" style={styles.heroCard}>
        <Card.Content style={styles.heroContent}>
          <View style={styles.rowBetween}>
            <View style={styles.flexOne}>
              <Text variant="headlineSmall" style={styles.heroTitle}>
                {safeTrim(welcomeName) ? `Welcome, ${safeTrim(welcomeName)}` : "Today"}
              </Text>
              <Text variant="bodyMedium" style={styles.heroSubtitle}>
                Log meals, medications, exercise, and vitals — then run a new evidence check when you need it.
              </Text>
            </View>
            <Avatar.Icon size={46} icon="home-heart" color={palette.primary} style={styles.heroAvatar} />
          </View>
          <View style={styles.heroActions}>
            <Button mode="contained" icon="stethoscope" onPress={onOpenInvestigate} buttonColor={palette.primary}>
              New investigation
            </Button>
            <Button mode="outlined" icon="history" onPress={() => setHistoryModalVisible(true)} textColor={palette.primary}>
              History
            </Button>
          </View>
        </Card.Content>
      </Card>

      <SectionHeader
        eyebrow="Dashboard"
        title="Today at a glance"
        body="Tap any card to update today's value. Missing values prompt you to fill them."
        trailing={null}
      />
      <View style={styles.todayMetricsRow}>
        {metricDefinitions.map((metric) => {
          const currentValue = safeTrim((todaysVitals as any)?.[metric.key]);
          return (
            <TouchableRipple key={metric.key} onPress={() => openMetricEditor(metric.key)} style={[styles.metricTouchable, styles.todayMetricTouchable]}>
              <Card mode="contained" style={[styles.metricCard, styles.todayMetricCard]}>
                <Card.Content style={[styles.metricContent, styles.todayMetricContent]}>
                  <Avatar.Icon size={42} icon={metric.icon} color={palette.primary} style={styles.metricAvatar} />
                  <View style={styles.flexOne}>
                    <Text variant="labelLarge" style={styles.metricLabel}>
                      {metric.label}
                    </Text>
                    <Text
                      variant="titleLarge"
                      style={[styles.metricValue, !currentValue && styles.metricValueMissing]}
                      numberOfLines={1}
                    >
                      {currentValue || "Missing"}
                    </Text>
                    <Text variant="bodySmall" style={styles.metricDetail}>
                      {currentValue ? "Tap to update" : "Tap to add"}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            </TouchableRipple>
          );
        })}
      </View>

      <SectionHeader
        eyebrow="Meals"
        title="Meals log"
        body="Synced with your daily calorie entries."
        trailing={
          <View style={styles.headerActionRow}>
            <IconButton
              icon="plus"
              containerColor={palette.primarySoft}
              iconColor={palette.primary}
              onPress={() => onOpenTab("nutrition")}
              accessibilityLabel="Open nutrition page"
            />
            {accountId && accountEmail ? (
              <Chip compact icon="fire" style={styles.summaryChip}>
                {todaysCalories}/{dailyCalorieTarget ?? "--"} kcal
              </Chip>
            ) : (
              <Chip compact icon="fire" style={styles.summaryChip}>
                {todaysCalories} kcal
              </Chip>
            )}
          </View>
        }
      />
      <Card mode="contained" style={styles.sectionCard}>
        <Card.Content style={styles.cardStack}>
          {loadingMeals ? (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              Loading meal entries...
            </Text>
          ) : mealEntries.length > 0 ? (
            mealEntries.map((entry) => (
              <View key={entry.id} style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text variant="titleMedium" style={styles.linkTitle}>
                    {classifyMealWindow(entry.createdAt)} • {entry.calories} kcal
                  </Text>
                  <Text variant="bodySmall" style={styles.sectionBody}>
                    {safeTrim(entry.mealName) || "Meal entry"}
                  </Text>
                </View>
                <Text variant="labelMedium" style={styles.logTime}>
                  {formatTime(entry.createdAt)}
                </Text>
              </View>
            ))
          ) : (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              No meal entries for today yet.
            </Text>
          )}
        </Card.Content>
      </Card>

      <SectionHeader eyebrow="Medication" title="Medication and supplement log" body="Separate medications with dosage, frequency, and time of day." />
      <View style={styles.medicationActionRow}>
        <IconButton
          icon="plus"
          containerColor={palette.primarySoft}
          iconColor={palette.primary}
          onPress={openMedicationCreate}
          accessibilityLabel="Add medication"
        />
        <Button compact icon="account-circle" onPress={() => onOpenTab("profile")}>
          Edit in Profile
        </Button>
      </View>
      <Card mode="contained" style={styles.sectionCard}>
        <Card.Content style={styles.cardStack}>
          {medicationError ? (
            <Text variant="bodySmall" style={styles.errorText}>
              {medicationError}
            </Text>
          ) : null}
          {medications.length > 0 ? (
            medications.map((item) => (
              <Card key={item.id} mode="contained" style={styles.logItemCard}>
                <Card.Content style={styles.cardStack}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flexOne}>
                      <Text variant="titleMedium" style={styles.linkTitle}>
                        {item.name || "Medication"}
                      </Text>
                      <Text variant="bodySmall" style={styles.sectionBody}>
                        Dosage: {item.dosage || "--"}
                      </Text>
                      <Text variant="bodySmall" style={styles.sectionBody}>
                        Frequency: {item.frequency || "--"}
                      </Text>
                      <Text variant="bodySmall" style={styles.sectionBody}>
                        Time: {item.timeOfDay || "--"}
                      </Text>
                    </View>
                    <View style={styles.actionRow}>
                      <IconButton icon="pencil-outline" size={18} onPress={() => openMedicationEdit(item)} />
                      <IconButton icon="delete-outline" size={18} onPress={() => void removeMedication(item.id)} />
                    </View>
                  </View>
                </Card.Content>
              </Card>
            ))
          ) : (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              No medications or supplements saved yet.
            </Text>
          )}
        </Card.Content>
      </Card>

      <SectionHeader
        eyebrow="Exercise"
        title="Exercise tracker"
        body="Manual daily log with edit and delete."
        trailing={
          <View style={styles.headerActionRow}>
            <IconButton
              icon="plus"
              containerColor={palette.primarySoft}
              iconColor={palette.primary}
              onPress={openExerciseCreate}
              accessibilityLabel="Add exercise"
            />
            <IconButton
              icon="asterisk"
              containerColor={palette.primarySoft}
              iconColor={palette.primary}
              onPress={() => void openRoutineModal()}
              accessibilityLabel="Generate routine with star button"
            />
            <IconButton
              icon="help-circle-outline"
              containerColor={palette.primarySoft}
              iconColor={palette.primary}
              onPress={() => setExerciseGuideVisible(true)}
              accessibilityLabel="Exercise tracker guide"
            />
          </View>
        }
      />
      <Card mode="contained" style={styles.sectionCard}>
        <Card.Content style={styles.cardStack}>
          {exerciseError ? (
            <Text variant="bodySmall" style={styles.errorText}>
              {exerciseError}
            </Text>
          ) : null}
          {loadingExercises ? (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              Loading exercise entries...
            </Text>
          ) : todaysExercises.length > 0 ? (
            todaysExercises.map((entry) => {
              const expanded = expandedExerciseId === entry.id;
              return (
                <Card key={entry.id} mode="contained" style={styles.logItemCard}>
                  <Card.Content style={styles.cardStack}>
                    <Pressable style={styles.rowBetween} onPress={() => setExpandedExerciseId(expanded ? "" : entry.id)}>
                      <View style={styles.flexOne}>
                        <Text variant="titleMedium" style={styles.linkTitle}>
                          {capitalizeWorkoutType(entry.title) || "Exercise"}
                        </Text>
                        <Text variant="bodySmall" style={styles.sectionBody}>
                          Duration: {entry.duration || "--"} • Intensity: {formatIntensity(entry.intensity)} • {formatTime(entry.createdAt)}
                        </Text>
                      </View>
                    </Pressable>
                    {expanded ? (
                      <View style={styles.cardStack}>
                        <Text variant="bodySmall" style={styles.sectionBody}>
                          {entry.notes || "No personal notes."}
                        </Text>
                        <View style={styles.routineChecklistRow}>
                          <IconButton icon="pencil-outline" size={18} onPress={() => openExerciseEdit(entry)} />
                          <IconButton icon="delete-outline" size={18} onPress={() => void removeExercise(entry.id)} />
                        </View>
                      </View>
                    ) : null}
                  </Card.Content>
                </Card>
              );
            })
          ) : (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              No exercise logged for today yet.
            </Text>
          )}
        </Card.Content>
      </Card>

      <SectionHeader
        eyebrow="Routine"
        title="Routine tracker"
        body="Generated routines are listed here and can be edited or deleted."
        trailing={
          <IconButton
            icon="plus"
            containerColor={palette.primarySoft}
            iconColor={palette.primary}
            onPress={openManualRoutineModal}
            accessibilityLabel="Create routine manually"
          />
        }
      />
      <Card mode="contained" style={styles.sectionCard}>
        <Card.Content style={styles.cardStack}>
          {routineError ? (
            <Text variant="bodySmall" style={styles.errorText}>
              {routineError}
            </Text>
          ) : null}
          {loadingRoutineTasks ? (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              Loading routine tasks...
            </Text>
          ) : groupedRoutineTasks.length > 0 ? (
            groupedRoutineTasks.map((group) => (
              <Card key={group.title} mode="contained" style={styles.logItemCard}>
                <Card.Content style={styles.cardStack}>
                  <View style={styles.rowBetween}>
                    <Text variant="titleMedium" style={[styles.linkTitle, styles.groupTitleWrap]}>
                      {group.title}
                    </Text>
                    <View style={styles.actionRow}>
                      <IconButton icon="pencil-outline" size={18} onPress={() => openRoutineTitleEdit(group.title)} />
                      <IconButton icon="delete-outline" size={18} onPress={() => void deleteRoutineGroup(group.title)} />
                    </View>
                  </View>
                  {group.tasks.map((task) => {
                    const expanded = expandedRoutineId === task.id;
                    return (
                      <Card key={task.id} mode="contained" style={styles.logItemCard}>
                        <Card.Content style={styles.cardStack}>
                          <View style={styles.rowBetween}>
                            <Pressable style={styles.flexOne} onPress={() => setExpandedRoutineId(expanded ? "" : task.id)}>
                              <Text variant="titleMedium" style={[styles.linkTitle, (task.completed || !!safeTrim(task.completedAt)) && styles.completedText]}>
                                {capitalizeWorkoutType(task.type)}
                              </Text>
                              <Text variant="bodySmall" style={styles.sectionBody}>
                                {task.duration || "--"} • {formatIntensity(task.intensity)}
                              </Text>
                            </Pressable>
                          </View>
                          {expanded ? (
                            <View style={styles.cardStack}>
                              <Text variant="bodySmall" style={styles.sectionBody}>
                                {safeTrim(task.description) || "No routine notes."}
                              </Text>
                              <View style={styles.routineChecklistRow}>
                                <IconButton
                                  icon={task.completed ? "checkbox-marked-circle-outline" : "checkbox-blank-circle-outline"}
                                  size={20}
                                  onPress={() => void toggleRoutineCompleted(task)}
                                />
                                <IconButton icon="pencil-outline" size={18} onPress={() => openRoutineEdit(task)} />
                                <IconButton icon="delete-outline" size={18} onPress={() => void deleteRoutineTask(task.id)} />
                              </View>
                            </View>
                          ) : null}
                        </Card.Content>
                      </Card>
                    );
                  })}
                  <Button
                    mode="outlined"
                    icon="plus"
                    onPress={() => openRoutineExerciseCreate(group.title)}
                    accessibilityLabel={`Add exercise to ${group.title}`}
                  >
                    Add Exercise
                  </Button>
                </Card.Content>
              </Card>
            ))
          ) : (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              No routine saved yet. Tap the * button to generate one.
            </Text>
          )}
        </Card.Content>
      </Card>

      <Modal visible={metricModalVisible} transparent animationType="fade" onRequestClose={() => setMetricModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    Update {metricDefinitions.find((item) => item.key === activeMetricKey)?.label}
                  </Text>
                  <IconButton icon="close" onPress={() => setMetricModalVisible(false)} />
                </View>
                <TextInput
                  mode="outlined"
                  value={metricDraft}
                  onChangeText={setMetricDraft}
                  placeholder={metricDefinitions.find((item) => item.key === activeMetricKey)?.placeholder}
                />
                {metricError ? (
                  <Text variant="bodySmall" style={styles.errorText}>
                    {metricError}
                  </Text>
                ) : null}
                <Button mode="contained" onPress={() => void saveMetric()} loading={metricSaving} disabled={metricSaving}>
                  Save
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={historyModalVisible} transparent animationType="fade" onRequestClose={() => setHistoryModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Card mode="contained" style={styles.historyModalCard}>
            <Card.Content style={styles.cardStack}>
              <View style={styles.rowBetween}>
                <Text variant="titleLarge" style={styles.formTitle}>
                  Health history
                </Text>
                <IconButton icon="close" onPress={() => setHistoryModalVisible(false)} />
              </View>
              <ScrollView style={styles.scrollBlock} contentContainerStyle={styles.cardStack}>
                {vitalsHistoryDates.length > 0 ? (
                  vitalsHistoryDates.map((date) => {
                    const values = vitalsMap[date] || {};
                    return (
                      <Card key={date} mode="contained" style={styles.logItemCard}>
                        <Card.Content style={styles.cardStack}>
                          <Text variant="titleMedium" style={styles.linkTitle}>
                            {date}
                          </Text>
                          {metricDefinitions.map((metric) => (
                            <Text key={`${date}-${metric.key}`} variant="bodySmall" style={styles.sectionBody}>
                              {metric.label}: {safeTrim((values as any)?.[metric.key]) || "Missing"}
                            </Text>
                          ))}
                        </Card.Content>
                      </Card>
                    );
                  })
                ) : (
                  <Text variant="bodyMedium" style={styles.sectionBody}>
                    No history yet.
                  </Text>
                )}
              </ScrollView>
            </Card.Content>
          </Card>
        </View>
      </Modal>

      <Modal visible={exerciseModalVisible} transparent animationType="fade" onRequestClose={() => setExerciseModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    {editingExerciseId ? "Edit exercise" : "Add exercise"}
                  </Text>
                  <IconButton icon="close" onPress={() => setExerciseModalVisible(false)} />
                </View>
                <TextInput mode="outlined" label="Title" value={exerciseTitle} onChangeText={setExerciseTitle} />
                <TextInput mode="outlined" label="Duration" value={exerciseDuration} onChangeText={setExerciseDuration} />
                <Text variant="bodySmall" style={styles.sectionBody}>
                  Intensity
                </Text>
                <SegmentedButtons
                  value={exerciseIntensity}
                  onValueChange={setExerciseIntensity}
                  buttons={intensityOptions.map((item) => ({ value: item.value, label: item.label }))}
                />
                <TextInput mode="outlined" label="Personal notes (optional)" value={exerciseNotes} onChangeText={setExerciseNotes} multiline />
                {exerciseError ? (
                  <Text variant="bodySmall" style={styles.errorText}>
                    {exerciseError}
                  </Text>
                ) : null}
                <Button mode="contained" onPress={() => void saveExercise()} loading={exerciseSaving} disabled={exerciseSaving}>
                  {editingExerciseId ? "Save changes" : "Add exercise"}
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={routineModalVisible} transparent animationType="fade" onRequestClose={() => setRoutineModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.routineModalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    Generate routine
                  </Text>
                  <IconButton icon="close" onPress={() => setRoutineModalVisible(false)} />
                </View>
                <ScrollView
                  style={[styles.routineScrollBlock, suggestedRoutine ? styles.routineScrollBlockWithResults : null]}
                  contentContainerStyle={[styles.cardStack, styles.routineScrollContent]}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.rowGapTop}>
                    <TextInput mode="outlined" label="Age" value={routineForm.age} onChangeText={(value) => setRoutineForm((current) => ({ ...current, age: value }))} style={styles.compactInput} />
                    <TextInput
                      mode="outlined"
                      label="Height (cm)"
                      value={routineForm.heightCm}
                      onChangeText={(value) => setRoutineForm((current) => ({ ...current, heightCm: value }))}
                      style={styles.compactInput}
                    />
                    <TextInput
                      mode="outlined"
                      label="Weight (kg)"
                      value={routineForm.weightKg}
                      onChangeText={(value) => setRoutineForm((current) => ({ ...current, weightKg: value }))}
                      style={styles.compactInput}
                    />
                  </View>
                  <TextInput mode="outlined" label="Goals" value={routineForm.goals} onChangeText={(value) => setRoutineForm((current) => ({ ...current, goals: value }))} multiline />
                  <Button mode="contained" onPress={() => void generateRoutine()} loading={routineLoading} disabled={routineLoading}>
                    Generate routine
                  </Button>

                  {suggestedRoutine ? (
                    <Card mode="contained" style={styles.sectionCard}>
                      <Card.Content style={styles.cardStack}>
                        <Text variant="titleMedium" style={styles.linkTitle}>
                          {suggestedRoutine.routineTitle}
                        </Text>
                        {suggestedRoutine.exercises.map((exercise, index) => {
                          const selected = selectedRoutineIndices.includes(index);
                          return (
                            <Pressable key={`${exercise.type}-${index}`} onPress={() => toggleSuggestedExercise(index)} style={styles.rowBetween}>
                              <View style={styles.flexOne}>
                                <Text variant="titleSmall" style={styles.linkTitle}>
                                  {capitalizeWorkoutType(exercise.type)} • {exercise.duration}
                                </Text>
                                <Text variant="bodySmall" style={styles.sectionBody}>
                                  {formatIntensity(exercise.intensity)} • {exercise.description || "No notes"}
                                </Text>
                              </View>
                              <MaterialCommunityIcons
                                name={selected ? "checkbox-marked-circle-outline" : "checkbox-blank-circle-outline"}
                                size={22}
                                color={selected ? palette.primary : palette.muted}
                              />
                            </Pressable>
                          );
                        })}
                        <Button mode="contained" onPress={() => void saveSelectedRoutine()} loading={routineSaving} disabled={routineSaving}>
                          Save selected routine
                        </Button>
                      </Card.Content>
                    </Card>
                  ) : null}
                </ScrollView>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={medicationModalVisible} transparent animationType="fade" onRequestClose={() => setMedicationModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    {editingMedicationId ? "Edit medication" : "Add medication"}
                  </Text>
                  <IconButton icon="close" onPress={() => setMedicationModalVisible(false)} />
                </View>
                <TextInput mode="outlined" label="Medication name" value={medicationNameDraft} onChangeText={setMedicationNameDraft} />
                <TextInput mode="outlined" label="Dosage" value={medicationDosageDraft} onChangeText={setMedicationDosageDraft} placeholder="e.g. 500 mg" />
                <TextInput mode="outlined" label="Frequency per day" value={medicationFrequencyDraft} onChangeText={setMedicationFrequencyDraft} placeholder="e.g. 2 times per day" />
                <TextInput mode="outlined" label="Time of day" value={medicationTimeDraft} onChangeText={setMedicationTimeDraft} placeholder="e.g. Morning, after lunch" />
                {medicationError ? (
                  <Text variant="bodySmall" style={styles.errorText}>
                    {medicationError}
                  </Text>
                ) : null}
                <Button mode="contained" onPress={() => void saveMedication()} loading={medicationSaving} disabled={medicationSaving}>
                  {editingMedicationId ? "Save changes" : "Add medication"}
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={routineEditModalVisible} transparent animationType="fade" onRequestClose={() => setRoutineEditModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    Edit routine item
                  </Text>
                  <IconButton icon="close" onPress={() => setRoutineEditModalVisible(false)} />
                </View>
                <TextInput mode="outlined" label="Exercise" value={routineTypeDraft} onChangeText={setRoutineTypeDraft} />
                <TextInput mode="outlined" label="Duration" value={routineDurationDraft} onChangeText={setRoutineDurationDraft} />
                <Text variant="bodySmall" style={styles.sectionBody}>
                  Intensity
                </Text>
                <SegmentedButtons
                  value={routineIntensityDraft}
                  onValueChange={setRoutineIntensityDraft}
                  buttons={intensityOptions.map((item) => ({ value: item.value, label: item.label }))}
                />
                <TextInput mode="outlined" label="Description" value={routineDescriptionDraft} onChangeText={setRoutineDescriptionDraft} multiline />
                <Button mode="contained" onPress={() => void saveRoutineEdit()} loading={routineSaving} disabled={routineSaving}>
                  Save changes
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={routineTitleEditVisible} transparent animationType="fade" onRequestClose={() => setRoutineTitleEditVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    Edit routine name
                  </Text>
                  <IconButton icon="close" onPress={() => setRoutineTitleEditVisible(false)} />
                </View>
                <TextInput mode="outlined" label="Routine title" value={routineTitleDraft} onChangeText={setRoutineTitleDraft} />
                <Button mode="contained" onPress={() => void saveRoutineTitleEdit()} loading={routineSaving} disabled={routineSaving}>
                  Save routine name
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={manualRoutineModalVisible} transparent animationType="fade" onRequestClose={() => setManualRoutineModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    Create routine
                  </Text>
                  <IconButton icon="close" onPress={() => setManualRoutineModalVisible(false)} />
                </View>
                <TextInput mode="outlined" label="Routine title" value={manualRoutineTitle} onChangeText={setManualRoutineTitle} placeholder="e.g. Fat loss plan" />
                {manualRoutineError ? (
                  <Text variant="bodySmall" style={styles.errorText}>
                    {manualRoutineError}
                  </Text>
                ) : null}
                <Button mode="contained" onPress={() => void saveManualRoutineExercise()} loading={routineSaving} disabled={routineSaving}>
                  Continue
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={routineExerciseModalVisible} transparent animationType="fade" onRequestClose={() => setRoutineExerciseModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.formTitle}>
                    Add routine exercise
                  </Text>
                  <IconButton icon="close" onPress={() => setRoutineExerciseModalVisible(false)} />
                </View>
                <TextInput mode="outlined" label="Exercise" value={routineExerciseTitle} onChangeText={setRoutineExerciseTitle} />
                <TextInput mode="outlined" label="Duration" value={routineExerciseDuration} onChangeText={setRoutineExerciseDuration} />
                <Text variant="bodySmall" style={styles.sectionBody}>
                  Intensity
                </Text>
                <SegmentedButtons
                  value={routineExerciseIntensity}
                  onValueChange={setRoutineExerciseIntensity}
                  buttons={intensityOptions.map((item) => ({ value: item.value, label: item.label }))}
                />
                <TextInput mode="outlined" label="Description (optional)" value={routineExerciseNotes} onChangeText={setRoutineExerciseNotes} multiline />
                {routineError ? (
                  <Text variant="bodySmall" style={styles.errorText}>
                    {routineError}
                  </Text>
                ) : null}
                <Button mode="contained" onPress={() => void saveRoutineExercise()} loading={routineSaving} disabled={routineSaving}>
                  Add to routine
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <TutorialSheet visible={exerciseGuideVisible} title="Exercise tracker guide" pages={EXERCISE_GUIDE_PAGES} onClose={() => setExerciseGuideVisible(false)} />
    </View>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flexOne}>
        {eyebrow ? (
          <Text variant="labelSmall" style={styles.eyebrow}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="headlineSmall" style={styles.sectionTitle}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={styles.sectionBody}>
          {body}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

const softBorderWidth = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  screenStack: {
    gap: 22,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
  },
  heroContent: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 14,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  heroSubtitle: {
    color: palette.muted,
    lineHeight: 20,
  },
  heroAvatar: {
    backgroundColor: palette.primarySoft,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  segmentButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  segmentText: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
  },
  cardStack: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  eyebrow: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  sectionBody: {
    color: palette.muted,
    lineHeight: 20,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricTouchable: {
    flexGrow: 1,
    flexBasis: "48%",
    maxWidth: "49%",
    borderRadius: 14,
  },
  todayMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  todayMetricTouchable: {
    flexBasis: "48%",
    maxWidth: "48%",
  },
  metricCard: {
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  todayMetricCard: {
    width: "100%",
  },
  metricContent: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    gap: 8,
  },
  todayMetricContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 86,
  },
  metricAvatar: {
    backgroundColor: palette.primarySoft,
  },
  metricValue: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  metricValueMissing: {
    fontSize: 22,
    lineHeight: 28,
  },
  metricLabel: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  metricDetail: {
    color: palette.muted,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  logAvatar: {
    backgroundColor: palette.primarySoft,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowBetweenStart: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  rowGapTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 2,
    marginLeft: 4,
  },
  routineChecklistRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 2,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  logTime: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  summaryChip: {
    backgroundColor: palette.primarySoft,
  },
  headerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  medicationActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: -10,
  },
  linkTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  groupTitleWrap: {
    flex: 1,
    flexShrink: 1,
    paddingRight: 6,
  },
  historyMetaLine: {
    color: palette.muted,
  },
  recentCard: {
    borderRadius: 14,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
  },
  logItemCard: {
    borderRadius: 12,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  completedText: {
    textDecorationLine: "line-through",
    color: palette.muted,
  },
  errorText: {
    color: palette.danger,
    fontFamily: "Poppins_600SemiBold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 16,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  modalKeyboardWrap: {
    width: "100%",
    maxWidth: 640,
  },
  historyModalCard: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "86%",
    borderRadius: 16,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  routineModalCard: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "96%",
    borderRadius: 16,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  formTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  scrollBlock: {
    maxHeight: 480,
  },
  routineScrollBlock: {
    maxHeight: 700,
  },
  routineScrollBlockWithResults: {
    maxHeight: 420,
  },
  routineScrollContent: {
    paddingBottom: 12,
  },
  compactInput: {
    flex: 1,
    minWidth: 96,
  },
});
