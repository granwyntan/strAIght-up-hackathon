import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Avatar, Button, Card, Chip, IconButton, SegmentedButtons, Text, TextInput, TouchableRipple } from "react-native-paper";

import { palette, type AppTab, type InvestigationSummary } from "../data";
import { loadProfile, saveProfile } from "../storage/profileStorage";
import { formatLocalIsoDate, loadHomeVitals, saveHomeVitalForDate } from "../storage/homeVitalsStorage";
import { loadCalorieWeek } from "../storage/calorieTrackerStorage";
import { addExerciseEntry, deleteExerciseEntry, loadExerciseEntries, updateExerciseEntry } from "../storage/exerciseStorage";
import { loadWorkoutTasks, replaceWorkoutTasks, setWorkoutTaskCompleted } from "../storage/workoutRoutineStorage";
import { addMedicationEntry, deleteMedicationEntry, loadMedicationEntries, updateMedicationEntry } from "../storage/medicationStorage";

const metricDefinitions = [
  { key: "restingHeartRate", label: "Heart rate", icon: "heart-pulse", placeholder: "e.g. 68 bpm" },
  { key: "sleep", label: "Sleep", icon: "sleep", placeholder: "e.g. 7h 30m" },
  { key: "steps", label: "Steps", icon: "walk", placeholder: "e.g. 8500" },
  { key: "hydration", label: "Hydration", icon: "cup-water", placeholder: "e.g. 2.1 L" },
] as const;

const intensityOptions = ["Easy", "Medium", "Hard", "Max effort"] as const;

type WorkoutTask = {
  id: string;
  routineTitle: string;
  type: string;
  duration: string;
  intensity: string;
  description: string;
  dueDate: string;
  completed: boolean;
  completedAt: string;
  createdAt: string;
};

type WorkoutSuggestion = {
  routineTitle: string;
  continuous: string;
  trialWeeks: number;
  exercises: Array<{
    type: string;
    duration: string;
    intensity: string;
    description: string;
    frequency: string;
    daysOfWeek: string[];
  }>;
};

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    continuous: typeof payload?.continuous === "string" ? payload.continuous : "daily",
    trialWeeks: Number(payload?.trialWeeks) || 2,
    exercises: Array.isArray(payload?.exercises)
      ? payload.exercises.map((item: any) => ({
          type: typeof item?.type === "string" ? item.type : "Workout",
          duration: typeof item?.duration === "string" ? item.duration : "30 min",
          intensity: typeof item?.intensity === "string" ? item.intensity : "medium",
          description: typeof item?.description === "string" ? item.description : "",
          frequency: typeof item?.frequency === "string" ? item.frequency : "daily",
          daysOfWeek: Array.isArray(item?.daysOfWeek) ? item.daysOfWeek.map((day: any) => String(day).toLowerCase()) : [],
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
  onOpenInvestigate: () => void;
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

  const [exerciseEntries, setExerciseEntries] = useState<Array<{ id: string; title: string; duration: string; intensity: string; notes: string; createdAt: string; date: string }>>(
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
    const hydrate = async () => {
      setLoadingVitals(true);
      setLoadingMeals(true);
      setLoadingExercises(true);
      setLoadingRoutineTasks(true);
      try {
        const [vitals, weekPayload, exercises, workoutTasks, profile] = await Promise.all([
          loadHomeVitals(accountId, accountEmail),
          loadCalorieWeek(accountId, new Date(), accountEmail),
          loadExerciseEntries(accountId, accountEmail),
          loadWorkoutTasks(accountId, accountEmail),
          loadProfile(accountId, accountEmail),
        ]);
        const loadedMedications = await loadMedicationEntries(accountId, accountEmail);

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
        const profileMedicationSeeds = parseMedicationLines(safeTrim((profile as any)?.medicationsOrSupplements));
        const normalizedLoaded = Array.isArray(loadedMedications) ? loadedMedications : [];
        const existingNames = new Set(normalizedLoaded.map((item) => normalizeMedicationName(item.name)));
        const missingFromProfile = profileMedicationSeeds.filter((item) => !existingNames.has(normalizeMedicationName(item.name)));

        let nextMedicationLog = normalizedLoaded;
        if (missingFromProfile.length > 0) {
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
        }

        if (nextMedicationLog.length === 0 && profileMedicationSeeds.length > 0) {
          nextMedicationLog = profileMedicationSeeds;
        }
        setMedications(nextMedicationLog);
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
    setExerciseIntensity("");
    setExerciseNotes("");
    setExerciseError("");
    setExerciseModalVisible(true);
  };

  const openExerciseEdit = (entry: { id: string; title: string; duration: string; intensity: string; notes: string }) => {
    setEditingExerciseId(entry.id);
    setExerciseTitle(entry.title || "");
    setExerciseDuration(entry.duration || "");
    setExerciseIntensity(entry.intensity || "");
    setExerciseNotes(entry.notes || "");
    setExerciseError("");
    setExerciseModalVisible(true);
  };

  const saveExercise = async () => {
    const title = safeTrim(exerciseTitle);
    const duration = safeTrim(exerciseDuration);
    const intensity = safeTrim(exerciseIntensity);
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
        type: safeTrim(exercise.type) || "Workout",
        duration: safeTrim(exercise.duration) || "30 min",
        intensity: safeTrim(exercise.intensity) || "medium",
        description: safeTrim(exercise.description),
        dueDate: todayDate,
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
        const created = await addExerciseEntry(
          accountId,
          {
            title: task.type,
            duration: task.duration,
            intensity: task.intensity,
            notes: task.description,
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
    setRoutineIntensityDraft(task.intensity || "");
    setRoutineDescriptionDraft(task.description || "");
    setRoutineError("");
    setRoutineEditModalVisible(true);
  };

  const saveRoutineEdit = async () => {
    const type = safeTrim(routineTypeDraft);
    const duration = safeTrim(routineDurationDraft);
    const intensity = safeTrim(routineIntensityDraft);
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
        <Card.Content style={styles.cardStack}>
          <Chip compact icon="heart-plus" style={styles.heroChip} textStyle={styles.heroChipText}>
            Daily overview
          </Chip>
          <Text variant="headlineMedium" style={styles.heroTitle}>
            {safeTrim(welcomeName) ? `Welcome ${welcomeName}` : "A cleaner health dashboard with daily logs"}
          </Text>
          <Text variant="bodyMedium" style={styles.heroBody}>
            Keep health data, meals, medications, exercise, routines, and investigations in one place.
          </Text>
          <View style={styles.heroActions}>
            <Button mode="contained" icon="stethoscope" onPress={onOpenInvestigate} buttonColor={palette.primary}>
              New investigation
            </Button>
            <Button mode="outlined" icon="account-circle" onPress={() => onOpenTab("profile")} textColor={palette.primary}>
              Health profile
            </Button>
          </View>
        </Card.Content>
      </Card>

      <SectionHeader
        eyebrow="Dashboard"
        title="Today at a glance"
        body="Tap any card to update today's value. Missing values prompt you to fill them."
        trailing={
          <Button compact icon="history" onPress={() => setHistoryModalVisible(true)}>
            History
          </Button>
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.todayMetricsRow}>
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
                    <Text variant="titleLarge" style={styles.metricValue}>
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
      </ScrollView>

      <SectionHeader
        eyebrow="Investigations"
        title="Review activity"
        body="A quicker read on what the claim-checking side of the app is doing right now."
      />
      <View style={styles.metricGrid}>
        {[
          { label: "Saved runs", value: String(history.length), detail: "Across quick, standard, and deep reviews", icon: "history" },
          { label: "Completed", value: String(completedRuns), detail: "Reports ready to reopen", icon: "check-decagram" },
          { label: "Running", value: String(runningRuns), detail: "Live investigations in progress", icon: "progress-clock" },
          { label: "Scored", value: String(scoredRuns), detail: "Runs with settled verdicts", icon: "chart-box-outline" },
        ].map((metric) => (
          <Card key={metric.label} mode="contained" style={styles.metricCard}>
            <Card.Content style={styles.metricContent}>
              <Avatar.Icon size={42} icon={metric.icon} color={palette.primary} style={styles.metricAvatar} />
              <Text variant="titleLarge" style={styles.metricValue}>
                {metric.value}
              </Text>
              <Text variant="labelLarge" style={styles.metricLabel}>
                {metric.label}
              </Text>
              <Text variant="bodySmall" style={styles.metricDetail}>
                {metric.detail}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      <SectionHeader
        eyebrow="Meals"
        title="Meals log"
        body="Synced with your daily calorie entries."
        trailing={
          accountId && accountEmail ? (
            <Chip compact icon="fire" style={styles.summaryChip}>
              {todaysCalories}/{dailyCalorieTarget ?? "--"} kcal
            </Chip>
          ) : (
            <Chip compact icon="fire" style={styles.summaryChip}>
              {todaysCalories} kcal
            </Chip>
          )
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

      <SectionHeader
        eyebrow="Medication"
        title="Medication and supplement log"
        body="Separate medications with dosage, frequency, and time of day."
        trailing={
          <View style={styles.headerActionRow}>
            <Button compact icon="account-circle" onPress={() => onOpenTab("profile")}>
              Edit in Profile
            </Button>
            <IconButton
              icon="plus"
              containerColor={palette.primarySoft}
              iconColor={palette.primary}
              onPress={openMedicationCreate}
              accessibilityLabel="Add medication"
            />
          </View>
        }
      />
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
                          {entry.title || "Exercise"}
                        </Text>
                        <Text variant="bodySmall" style={styles.sectionBody}>
                          Duration: {entry.duration || "--"} • Intensity: {entry.intensity || "--"} • {formatTime(entry.createdAt)}
                        </Text>
                      </View>
                      <View style={styles.actionRow}>
                        <IconButton icon="pencil-outline" size={18} onPress={() => openExerciseEdit(entry)} />
                        <IconButton icon="delete-outline" size={18} onPress={() => void removeExercise(entry.id)} />
                      </View>
                    </Pressable>
                    {expanded ? (
                      <Text variant="bodySmall" style={styles.sectionBody}>
                        {entry.notes || "No personal notes."}
                      </Text>
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
          ) : sortedRoutineTasks.length > 0 ? (
            sortedRoutineTasks.map((task) => {
              const expanded = expandedRoutineId === task.id;
              return (
                <Card key={task.id} mode="contained" style={styles.logItemCard}>
                  <Card.Content style={styles.cardStack}>
                    <View style={styles.rowBetween}>
                      <Pressable style={styles.flexOne} onPress={() => setExpandedRoutineId(expanded ? "" : task.id)}>
                        <Text variant="titleMedium" style={[styles.linkTitle, task.completed && styles.completedText]}>
                          {task.type || "Workout"}
                        </Text>
                        <Text variant="bodySmall" style={styles.sectionBody}>
                          {task.duration || "--"} • {task.intensity || "medium"} • due {task.dueDate || todayDate}
                        </Text>
                      </Pressable>
                      <View style={styles.actionRow}>
                        <IconButton
                          icon={task.completed ? "checkbox-marked-circle-outline" : "checkbox-blank-circle-outline"}
                          size={20}
                          onPress={() => void toggleRoutineCompleted(task)}
                        />
                        <IconButton icon="pencil-outline" size={18} onPress={() => openRoutineEdit(task)} />
                        <IconButton icon="delete-outline" size={18} onPress={() => void deleteRoutineTask(task.id)} />
                      </View>
                    </View>
                    {expanded ? (
                      <Text variant="bodySmall" style={styles.sectionBody}>
                        {safeTrim(task.description) || "No routine notes."}
                      </Text>
                    ) : null}
                  </Card.Content>
                </Card>
              );
            })
          ) : (
            <Text variant="bodyMedium" style={styles.sectionBody}>
              No routine saved yet. Tap the * button to generate one.
            </Text>
          )}
        </Card.Content>
      </Card>

      <SectionHeader eyebrow="Recent" title="Latest investigation" body="Tap back into the consultant view from your dashboard." />
      {latest ? (
        <TouchableRipple onPress={() => onOpenHistory(latest.id)} style={styles.recentCard}>
          <View style={styles.cardStack}>
            <View style={styles.rowBetween}>
              <Text variant="titleMedium" style={styles.linkTitle}>
                {safeTrim(latest.claim) || "Untitled claim"}
              </Text>
              <Chip compact>{safeTrim(latest.verdict) || "mixed"}</Chip>
            </View>
            <Text variant="bodySmall" style={styles.sectionBody}>
              {safeTrim(latest.summary) || "No summary available."}
            </Text>
            <Text variant="bodySmall" style={styles.historyMetaLine}>
              {formatTimestamp(latest.createdAt)}
            </Text>
          </View>
        </TouchableRipple>
      ) : (
        <Card mode="contained" style={styles.sectionCard}>
          <Card.Content>
            <Text variant="bodyMedium" style={styles.sectionBody}>
              No investigations yet. Start one from Consultant.
            </Text>
          </Card.Content>
        </Card>
      )}

      <Modal visible={metricModalVisible} transparent animationType="fade" onRequestClose={() => setMetricModalVisible(false)}>
        <View style={styles.modalBackdrop}>
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
              <SegmentedButtons
                value={exerciseIntensity}
                onValueChange={setExerciseIntensity}
                buttons={intensityOptions.map((item) => ({ value: item, label: item }))}
              />
              <TextInput mode="outlined" label="Personal notes" value={exerciseNotes} onChangeText={setExerciseNotes} multiline />
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
        </View>
      </Modal>

      <Modal visible={routineModalVisible} transparent animationType="fade" onRequestClose={() => setRoutineModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Card mode="contained" style={styles.historyModalCard}>
            <Card.Content style={styles.cardStack}>
              <View style={styles.rowBetween}>
                <Text variant="titleLarge" style={styles.formTitle}>
                  Generate routine
                </Text>
                <IconButton icon="close" onPress={() => setRoutineModalVisible(false)} />
              </View>
              <ScrollView style={styles.scrollBlock} contentContainerStyle={styles.cardStack}>
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
                      <Text variant="bodySmall" style={styles.sectionBody}>
                        Continuous: {suggestedRoutine.continuous} • Trial: {suggestedRoutine.trialWeeks} weeks
                      </Text>
                      {suggestedRoutine.exercises.map((exercise, index) => {
                        const selected = selectedRoutineIndices.includes(index);
                        return (
                          <Pressable key={`${exercise.type}-${index}`} onPress={() => toggleSuggestedExercise(index)} style={styles.rowBetween}>
                            <View style={styles.flexOne}>
                              <Text variant="titleSmall" style={styles.linkTitle}>
                                {exercise.type} • {exercise.duration}
                              </Text>
                              <Text variant="bodySmall" style={styles.sectionBody}>
                                {exercise.intensity} • {exercise.description || "No notes"}
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
        </View>
      </Modal>

      <Modal visible={medicationModalVisible} transparent animationType="fade" onRequestClose={() => setMedicationModalVisible(false)}>
        <View style={styles.modalBackdrop}>
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
        </View>
      </Modal>

      <Modal visible={routineEditModalVisible} transparent animationType="fade" onRequestClose={() => setRoutineEditModalVisible(false)}>
        <View style={styles.modalBackdrop}>
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
              <SegmentedButtons
                value={routineIntensityDraft}
                onValueChange={setRoutineIntensityDraft}
                buttons={intensityOptions.map((item) => ({ value: item, label: item }))}
              />
              <TextInput mode="outlined" label="Description" value={routineDescriptionDraft} onChangeText={setRoutineDescriptionDraft} multiline />
              <Button mode="contained" onPress={() => void saveRoutineEdit()} loading={routineSaving} disabled={routineSaving}>
                Save changes
              </Button>
            </Card.Content>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
  trailing,
}: {
  eyebrow: string;
  title: string;
  body: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flexOne}>
        <Text variant="labelLarge" style={styles.eyebrow}>
          {eyebrow.toUpperCase()}
        </Text>
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
  cardStack: {
    gap: 12,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  heroChip: {
    alignSelf: "flex-start",
    backgroundColor: palette.primarySoft,
  },
  heroChipText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  heroTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  heroBody: {
    color: palette.muted,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
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
    width: "48.4%",
    borderRadius: 14,
  },
  todayMetricsRow: {
    gap: 10,
    paddingRight: 2,
  },
  todayMetricTouchable: {
    width: 240,
  },
  metricCard: {
    width: "48.4%",
    borderRadius: 14,
    borderWidth: softBorderWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  todayMetricCard: {
    width: 240,
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
  rowGapTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
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
  linkTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
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
  historyModalCard: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "86%",
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
  compactInput: {
    flex: 1,
    minWidth: 96,
  },
});
