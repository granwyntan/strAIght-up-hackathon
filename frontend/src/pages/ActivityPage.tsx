// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Card, Chip, IconButton, SegmentedButtons, Text } from "react-native-paper";

import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import { palette } from "../data";
import { buildActivityProfileContext, loadProfile } from "../storage/profileStorage";
import { addExerciseEntry, deleteExerciseEntry, loadExerciseEntries, updateExerciseEntry } from "../storage/exerciseStorage";
import { loadWorkoutTasks, replaceWorkoutTasks, setWorkoutTaskCompleted } from "../storage/workoutRoutineStorage";
import { loadCalorieWeek } from "../storage/calorieTrackerStorage";

const ACTIVITY_TUTORIAL_PAGES = [
  {
    title: "Track effort and recovery together",
    body: "Log workouts, daily movement, or sleep-related recovery notes in one place, then compare that activity against your current goals and intake.",
  },
  {
    title: "Use the smart input when you are in a rush",
    body: "Type a quick note like 'ran 5km fast' and GramWIN will prefill the structured fields before you save the activity entry.",
  },
  {
    title: "Let the planner suggest the next block",
    body: "The AI routine planner turns your profile, goals, and medical context into a simple weekly plan you can mark complete as you go.",
  },
];

const INTENSITY_OPTIONS = ["Easy", "Mid", "Hard", "Max"];

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value) {
  const parsed = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function estimateCalories(entry) {
  const duration = toNumber(entry.duration);
  const intensity = safeTrim(entry.intensity).toLowerCase();
  const multiplier = intensity === "max" ? 10 : intensity === "hard" ? 8 : intensity === "mid" ? 6 : 3;
  return duration > 0 ? Math.round(duration * multiplier) : 0;
}

function parseSmartInput(text) {
  const lowered = safeTrim(text).toLowerCase();
  if (!lowered) {
    return null;
  }
  const activity = lowered.includes("sleep") ? "Sleep" : lowered.includes("walk") ? "Walking" : lowered.includes("run") ? "Running" : "Activity";
  const durationMatch = lowered.match(/(\d+)\s*(min|mins|minutes|hr|hrs|hours|km)/);
  let duration = "";
  if (durationMatch) {
    const value = durationMatch[1];
    const unit = durationMatch[2];
    duration = unit.startsWith("km") ? `${Math.max(20, Math.round(Number(value) * 8))} min` : `${value} ${unit}`;
  }
  const intensity = lowered.includes("max")
    ? "Max"
    : lowered.includes("fast") || lowered.includes("hard")
      ? "Hard"
      : lowered.includes("easy") || lowered.includes("light")
        ? "Easy"
        : "Mid";
  return {
    title: activity,
    duration,
    intensity,
    notes: text,
  };
}

function buildRoutineTasksFromSuggestion(suggestion) {
  return (suggestion?.exercises || []).map((exercise, index) => {
    const normalizedIntensity = safeTrim(exercise.intensity).toLowerCase();
    const intensity =
      normalizedIntensity === "easy" ? "easy" : normalizedIntensity === "hard" ? "hard" : normalizedIntensity === "max" ? "max" : "mid";
    const type = safeTrim(exercise.type);
    return {
      id: `task-${Date.now()}-${index}`,
      routineTitle: suggestion.routineTitle || "Suggested activity block",
      type: type ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : "Activity",
      duration: exercise.duration || "30 min",
      intensity,
      description: exercise.description || "",
      completed: false,
      completedAt: "",
      createdAt: new Date().toISOString(),
    };
  });
}

function defaultRoutineForm() {
  return {
    age: "",
    heightCm: "",
    weightKg: "",
    goals: "",
  };
}

function capitalizeTitle(value: string) {
  const cleaned = safeTrim(value);
  if (!cleaned) {
    return "Exercise";
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

type ActivityPageProps = {
  requestApi: (path: string, init?: RequestInit, timeoutMsOverride?: number) => Promise<Response>;
  accountId?: string;
  accountEmail?: string;
  guideSignal?: number;
};

export default function ActivityPage({ requestApi, accountId, accountEmail, guideSignal = 0 }: ActivityPageProps) {
  const [activeView, setActiveView] = useState<"monitor" | "history">("monitor");
  const [guideVisible, setGuideVisible] = useState(false);
  const [entries, setEntries] = useState([]);
  const [routineTasks, setRoutineTasks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [weeklyCalories, setWeeklyCalories] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [error, setError] = useState("");
  const [smartInput, setSmartInput] = useState("");
  const [activityType, setActivityType] = useState("Walking");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("Mid");
  const [notes, setNotes] = useState("");
  const [expandedExerciseId, setExpandedExerciseId] = useState("");
  const [expandedRoutineId, setExpandedRoutineId] = useState("");
  const [editingExerciseId, setEditingExerciseId] = useState("");
  const [editingRoutineId, setEditingRoutineId] = useState("");
  const [editingRoutineTitle, setEditingRoutineTitle] = useState("");
  const [routineTitleDraft, setRoutineTitleDraft] = useState("");
  const [routineTitleEditVisible, setRoutineTitleEditVisible] = useState(false);
  const [routineExerciseModalVisible, setRoutineExerciseModalVisible] = useState(false);
  const [targetRoutineTitle, setTargetRoutineTitle] = useState("");
  const [routineExerciseTitle, setRoutineExerciseTitle] = useState("");
  const [routineExerciseDuration, setRoutineExerciseDuration] = useState("");
  const [routineExerciseIntensity, setRoutineExerciseIntensity] = useState("mid");
  const [routineExerciseNotes, setRoutineExerciseNotes] = useState("");
  const [routineBuilderModalVisible, setRoutineBuilderModalVisible] = useState(false);
  const [manualRoutineModalVisible, setManualRoutineModalVisible] = useState(false);
  const [manualRoutineTitle, setManualRoutineTitle] = useState("");
  const [manualRoutineDescription, setManualRoutineDescription] = useState("");
  const [manualRoutineError, setManualRoutineError] = useState("");
  const [routineForm, setRoutineForm] = useState(defaultRoutineForm);

  useEffect(() => {
    if (guideSignal > 0) {
      setGuideVisible(true);
    }
  }, [guideSignal]);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const [nextEntries, nextTasks, nextProfile, calorieWeek] = await Promise.all([
          loadExerciseEntries(accountId, accountEmail),
          loadWorkoutTasks(accountId, accountEmail),
          loadProfile(accountId, accountEmail),
          loadCalorieWeek(accountId, undefined, accountEmail),
        ]);
        if (!mounted) {
          return;
        }
        setEntries(Array.isArray(nextEntries) ? nextEntries : []);
        setRoutineTasks(Array.isArray(nextTasks) ? nextTasks : []);
        setProfile(nextProfile);
        const calorieTotal = Array.isArray(calorieWeek?.days) ? calorieWeek.days.reduce((sum, day) => sum + (day.totalCalories || 0), 0) : 0;
        setWeeklyCalories(calorieTotal);
      } catch (hydrateError) {
        if (mounted) {
          setError(hydrateError instanceof Error ? hydrateError.message : "Could not load activity data.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [accountEmail, accountId]);

  const weeklyCaloriesBurned = useMemo(() => entries.reduce((sum, entry) => sum + estimateCalories(entry), 0), [entries]);
  const highIntensityCount = useMemo(
    () => entries.filter((entry) => ["hard", "max"].includes(safeTrim(entry.intensity).toLowerCase())).length,
    [entries]
  );
  const groupedRoutineTasks = useMemo(() => {
    const grouped = new Map();
    routineTasks
      .slice()
      .sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime())
      .forEach((task) => {
        const title = safeTrim(task.routineTitle) || "Personal routine";
        if (!grouped.has(title)) {
          grouped.set(title, []);
        }
        grouped.get(title).push(task);
      });
    return Array.from(grouped.entries()).map(([title, tasks]) => ({ title, tasks }));
  }, [routineTasks]);
  const recoveryTone = highIntensityCount >= 3 ? "Recovery needs attention" : weeklyCaloriesBurned >= 1200 ? "Balanced training load" : "Room for more structured movement";
  const energyBalance = weeklyCalories - weeklyCaloriesBurned;
  const insightLine =
    energyBalance > 2500
      ? "Intake is outpacing logged activity this week."
      : energyBalance < -1200
        ? "Activity output is high relative to food intake."
        : "Diet and activity are landing in a steadier weekly range.";

  async function applySmartInput() {
    const fallback = parseSmartInput(smartInput);
    if (!fallback) {
      return;
    }
    setError("");
    try {
      const response = await requestApi("/api/workout-routine/parse-activity-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: smartInput }),
      });
      if (!response.ok) {
        throw new Error("Smart parsing unavailable.");
      }
      const parsed = await response.json();
      setActivityType(safeTrim(parsed?.title) || fallback.title);
      setDuration(safeTrim(parsed?.duration) || fallback.duration);
      setIntensity(safeTrim(parsed?.intensity) || fallback.intensity);
      setNotes(safeTrim(parsed?.notes) || fallback.notes);
    } catch {
      setActivityType(fallback.title);
      setDuration(fallback.duration);
      setIntensity(fallback.intensity);
      setNotes(fallback.notes);
    }
  }

  async function saveEntry() {
    if (!safeTrim(activityType)) {
      setError("Enter a title first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingExerciseId) {
        const updated = await updateExerciseEntry(
          accountId,
          editingExerciseId,
          {
            title: capitalizeTitle(activityType),
            duration: safeTrim(duration),
            intensity,
            notes: safeTrim(notes),
          },
          accountEmail
        );
        if (updated) {
          setEntries((current) => current.map((entry) => (entry.id === editingExerciseId ? updated : entry)));
        }
      } else if (editingRoutineId) {
        const updatedRoutine = routineTasks.map((task) =>
          task.id === editingRoutineId
            ? {
                ...task,
                type: safeTrim(activityType) || task.type,
                duration: safeTrim(duration),
                intensity: safeTrim(intensity) || task.intensity,
                description: safeTrim(notes),
              }
            : task
        );
        const savedRoutine = await replaceWorkoutTasks(accountId, updatedRoutine, accountEmail);
        setRoutineTasks(savedRoutine);
      } else {
        const next = await addExerciseEntry(
          accountId,
          {
            title: capitalizeTitle(activityType),
            duration: safeTrim(duration),
            intensity,
            notes: safeTrim(notes),
          },
          accountEmail
        );
        setEntries((current) => [next, ...current]);
      }
      setSmartInput("");
      setActivityType("");
      setDuration("");
      setIntensity("Mid");
      setNotes("");
      setEditingExerciseId("");
      setEditingRoutineId("");
      setActiveView("history");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save activity.");
    } finally {
      setSaving(false);
    }
  }

  async function suggestRoutine() {
    const ageValue = safeTrim(routineForm.age) || safeTrim(profile?.age);
    const heightValue = safeTrim(routineForm.heightCm) || safeTrim(profile?.height);
    const weightValue = safeTrim(routineForm.weightKg) || safeTrim(profile?.weight);
    const goalsValue = safeTrim(routineForm.goals) || safeTrim(profile?.goals);
    if (!goalsValue) {
      setError("Add at least one goal before generating a routine.");
      return;
    }
    setRoutineLoading(true);
    setError("");
    try {
      const response = await requestApi(
        "/api/workout-routine/suggest",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            age: ageValue,
            heightCm: heightValue,
            weightKg: weightValue,
            goals: goalsValue,
            activityLevel: safeTrim(profile?.activityLevel),
            sleepHours: safeTrim(profile?.sleepHours),
            sleepQuality: safeTrim(profile?.sleepQuality),
            stressLevel: safeTrim(profile?.stressLevel),
            activityGoals: Array.isArray(profile?.activityGoalTags) ? profile.activityGoalTags : [],
            dietGoals: Array.isArray(profile?.goalTags) ? profile.goalTags : [],
            profileContext: buildActivityProfileContext(profile),
            medicalHistory: [safeTrim(profile?.medicalConditions), safeTrim(profile?.medicalHistory)].filter(Boolean).join("; "),
          }),
        },
        120000
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Could not generate an activity plan.");
      }
      const payload = await response.json();
      const nextTasks = buildRoutineTasksFromSuggestion(payload);
      const saved = await replaceWorkoutTasks(accountId, nextTasks, accountEmail);
      setRoutineTasks(saved);
      setRoutineBuilderModalVisible(false);
      setActiveView("history");
    } catch (routineError) {
      setError(routineError instanceof Error ? routineError.message : "Could not build an activity plan.");
    } finally {
      setRoutineLoading(false);
    }
  }

  async function toggleTask(task, completed) {
    const saved = await setWorkoutTaskCompleted(accountId, task.id, completed, accountEmail);
    setRoutineTasks(saved);
    if (completed) {
      const exists = entries.some((entry) => safeTrim(entry.sourceRoutineTaskId) === task.id);
      if (!exists) {
        const nextEntry = await addExerciseEntry(
          accountId,
          {
            title: safeTrim(task.type) || "Exercise",
            duration: safeTrim(task.duration),
            intensity: safeTrim(task.intensity) || "Mid",
            notes: safeTrim(task.description),
            sourceRoutineTaskId: task.id,
          },
          accountEmail
        );
        setEntries((current) => [nextEntry, ...current]);
      }
    }
  }

  async function removeEntry(entryId) {
    await deleteExerciseEntry(accountId, entryId, accountEmail);
    setEntries((current) => current.filter((item) => item.id !== entryId));
  }

  function openExerciseEdit(entry) {
    setEditingExerciseId(entry.id);
    setEditingRoutineId("");
    setActivityType(capitalizeTitle(entry.title));
    setDuration(safeTrim(entry.duration));
    setIntensity(safeTrim(entry.intensity) || "Mid");
    setNotes(safeTrim(entry.notes));
    setActiveView("monitor");
  }

  function openRoutineEdit(task) {
    setEditingRoutineId(task.id);
    setEditingExerciseId("");
    setActivityType(capitalizeTitle(task.type));
    setDuration(safeTrim(task.duration));
    setIntensity(safeTrim(task.intensity) || "Mid");
    setNotes(safeTrim(task.description));
    setActiveView("monitor");
  }

  async function removeRoutineTask(taskId: string) {
    const updatedRoutine = routineTasks.filter((task) => task.id !== taskId);
    const savedRoutine = await replaceWorkoutTasks(accountId, updatedRoutine, accountEmail);
    setRoutineTasks(savedRoutine);
  }

  function openRoutineTitleEdit(title: string) {
    setEditingRoutineTitle(safeTrim(title));
    setRoutineTitleDraft(safeTrim(title));
    setRoutineTitleEditVisible(true);
  }

  async function saveRoutineTitleEdit() {
    const nextTitle = safeTrim(routineTitleDraft) || "Personal routine";
    const updatedRoutine = routineTasks.map((task) =>
      safeTrim(task.routineTitle) === safeTrim(editingRoutineTitle)
        ? {
            ...task,
            routineTitle: nextTitle,
          }
        : task
    );
    const savedRoutine = await replaceWorkoutTasks(accountId, updatedRoutine, accountEmail);
    setRoutineTasks(savedRoutine);
    setRoutineTitleEditVisible(false);
    setEditingRoutineTitle("");
    setRoutineTitleDraft("");
  }

  async function deleteRoutineGroup(title: string) {
    const updatedRoutine = routineTasks.filter((task) => safeTrim(task.routineTitle) !== safeTrim(title));
    const savedRoutine = await replaceWorkoutTasks(accountId, updatedRoutine, accountEmail);
    setRoutineTasks(savedRoutine);
  }

  function openRoutineExerciseCreate(routineTitle: string) {
    setTargetRoutineTitle(safeTrim(routineTitle) || "Personal routine");
    setRoutineExerciseTitle("");
    setRoutineExerciseDuration("");
    setRoutineExerciseIntensity("mid");
    setRoutineExerciseNotes("");
    setRoutineExerciseModalVisible(true);
  }

  async function saveRoutineExercise() {
    const nextTask = {
      id: `routine-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      routineTitle: safeTrim(targetRoutineTitle) || "Personal routine",
      type: safeTrim(routineExerciseTitle) || "Workout",
      duration: safeTrim(routineExerciseDuration),
      intensity: safeTrim(routineExerciseIntensity) || "mid",
      description: safeTrim(routineExerciseNotes),
      completed: false,
      completedAt: "",
      createdAt: new Date().toISOString(),
    };
    const savedRoutine = await replaceWorkoutTasks(accountId, [nextTask, ...routineTasks], accountEmail);
    setRoutineTasks(savedRoutine);
    setRoutineExerciseModalVisible(false);
  }

  async function createManualRoutine() {
    const title = safeTrim(manualRoutineTitle) || "Personal routine";
    const description = safeTrim(manualRoutineDescription);
    if (!title) {
      setManualRoutineError("Enter a routine title.");
      return;
    }
    const nextTask = {
      id: `routine-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      routineTitle: title,
      type: "Workout",
      duration: "",
      intensity: "mid",
      description: description || "Custom routine.",
      completed: false,
      completedAt: "",
      createdAt: new Date().toISOString(),
    };
    const savedRoutine = await replaceWorkoutTasks(accountId, [nextTask, ...routineTasks], accountEmail);
    setRoutineTasks(savedRoutine);
    setManualRoutineModalVisible(false);
    setManualRoutineTitle("");
    setManualRoutineDescription("");
    setManualRoutineError("");
    setActiveView("history");
  }

  function openRoutineBuilder() {
    setRoutineForm({
      age: safeTrim(profile?.age),
      heightCm: safeTrim(profile?.height),
      weightKg: safeTrim(profile?.weight),
      goals: safeTrim(profile?.goals),
    });
    setRoutineBuilderModalVisible(true);
  }

  return (
    <View style={styles.pageStack}>
      <SectionTabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as "monitor" | "history")}
        tabs={[
          { value: "monitor", label: "Monitor", icon: "run" },
          { value: "history", label: "History", icon: "history" },
        ]}
      />

      {activeView === "monitor" ? (
        <View style={styles.pageStack}>
          <View style={styles.metricGrid}>
            <MetricCard label="Burned" value={`${weeklyCaloriesBurned}`} detail="Estimated weekly kcal" icon="fire-circle" />
            <MetricCard label="Sessions" value={`${entries.length}`} detail="Logged this week" icon="run-fast" />
            <MetricCard label="Recovery" value={recoveryTone} detail="Training load signal" icon="sleep" />
            <MetricCard label="Balance" value={energyBalance > 0 ? "Surplus" : energyBalance < 0 ? "Deficit" : "Even"} detail={insightLine} icon="scale-balance" />
          </View>

          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.titleText}>
                Smart activity input
              </Text>
              <Text variant="bodySmall" style={styles.bodyText}>
                Type a natural note like “ran 5km fast” or “slept 6 hours badly” to prefill the structured form.
              </Text>
              <TextInput
                value={smartInput}
                onChangeText={setSmartInput}
                placeholder="e.g. ran 5km quite fast"
                placeholderTextColor={palette.muted}
                style={styles.input}
              />
              <Button mode="outlined" onPress={applySmartInput} textColor={palette.primary}>
                Apply smart input
              </Button>
            </Card.Content>
          </Card>

          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.titleText}>
                Log activity
              </Text>
              <TextInput
                value={activityType}
                onChangeText={setActivityType}
                placeholder="Title"
                placeholderTextColor={palette.muted}
                style={styles.input}
              />
              <View style={styles.inlineGrid}>
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="Duration"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, styles.flexOne]}
                />
              </View>
              <Text variant="bodySmall" style={styles.bodyText}>
                Intensity
              </Text>
              <View style={styles.segmentedWrap}>
                <SegmentedButtons
                  value={intensity}
                  onValueChange={setIntensity}
                  buttons={INTENSITY_OPTIONS.map((item) => ({ value: item, label: item }))}
                />
              </View>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Personal notes (optional)"
                placeholderTextColor={palette.muted}
                style={[styles.input, styles.notesInput]}
                multiline
              />
              {error ? <Text variant="bodySmall" style={styles.errorText}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Button mode="contained" onPress={saveEntry} loading={saving} buttonColor={palette.primary}>
                  {editingExerciseId ? "Save changes" : "Save activity"}
                </Button>
              </View>
            </Card.Content>
          </Card>

          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.titleText}>
                Routine builder
              </Text>
              <Text variant="bodySmall" style={styles.bodyText}>
                Create a routine manually, or ask AI to generate one.
              </Text>
              <View style={styles.actionRow}>
                <Button mode="contained" onPress={openRoutineBuilder} buttonColor={palette.primary}>
                  Ask AI to generate routine
                </Button>
                <Button mode="outlined" onPress={() => setManualRoutineModalVisible(true)} textColor={palette.primary}>
                  Manually create routine
                </Button>
              </View>
            </Card.Content>
          </Card>

          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.titleText}>
                Personalised insights
              </Text>
              <InsightRow icon="target" title="Goal match" body={safeTrim(profile?.goals) ? `Current goal focus: ${profile.goals}` : "Add goals in Profile to sharpen activity recommendations."} />
              <InsightRow icon="chart-line" title="Energy balance" body={insightLine} />
              <InsightRow icon="heart-pulse" title="Recovery read" body={`${recoveryTone}${safeTrim(profile?.sleepQuality) ? ` • Sleep quality: ${profile.sleepQuality}` : ""}`} />
            </Card.Content>
          </Card>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.pageStack} showsVerticalScrollIndicator={false}>
          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.titleText}>
                Activity history
              </Text>
              {loading ? (
                <Text variant="bodySmall" style={styles.bodyText}>
                  Loading activity history...
                </Text>
              ) : entries.length === 0 ? (
                <Text variant="bodySmall" style={styles.bodyText}>
                  No activity logs yet.
                </Text>
              ) : (
                entries.map((entry) => {
                  const expanded = expandedExerciseId === entry.id;
                  return (
                    <Card key={entry.id} mode="contained" style={styles.historyCard}>
                      <Card.Content style={styles.cardStack}>
                        <Pressable style={styles.rowBetween} onPress={() => setExpandedExerciseId(expanded ? "" : entry.id)}>
                          <View style={styles.flexOne}>
                            <Text variant="titleSmall" style={styles.historyTitle}>
                              {capitalizeTitle(entry.title)}
                            </Text>
                            <Text variant="bodySmall" style={styles.bodyText}>
                              {safeTrim(entry.duration) || "--"} • {safeTrim(entry.intensity) || "Mid"}
                            </Text>
                          </View>
                        </Pressable>
                        {expanded ? (
                          <View style={styles.cardStack}>
                            <Text variant="bodySmall" style={styles.bodyText}>
                              {safeTrim(entry.notes) || "No notes."}
                            </Text>
                            <View style={styles.routineChecklistRow}>
                              <IconButton icon="pencil-outline" size={18} onPress={() => openExerciseEdit(entry)} />
                              <IconButton icon="delete-outline" size={18} onPress={() => void removeEntry(entry.id)} />
                            </View>
                          </View>
                        ) : null}
                      </Card.Content>
                    </Card>
                  );
                })
              )}
            </Card.Content>
          </Card>

          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.titleText}>
                Planned routine
              </Text>
              {groupedRoutineTasks.length === 0 ? (
                <Text variant="bodySmall" style={styles.bodyText}>
                  No plan saved yet.
                </Text>
              ) : (
                groupedRoutineTasks.map((group) => (
                  <Card key={group.title} mode="contained" style={styles.historyCard}>
                    <Card.Content style={styles.cardStack}>
                      <View style={styles.rowBetween}>
                        <Text variant="titleSmall" style={[styles.historyTitle, styles.groupTitleWrap]}>
                          {group.title}
                        </Text>
                        <View style={styles.routineChecklistRow}>
                          <IconButton icon="pencil-outline" size={18} onPress={() => openRoutineTitleEdit(group.title)} />
                          <IconButton icon="delete-outline" size={18} onPress={() => void deleteRoutineGroup(group.title)} />
                        </View>
                      </View>
                      {group.tasks.map((task) => {
                        const expanded = expandedRoutineId === task.id;
                        return (
                          <Card key={task.id} mode="contained" style={styles.historyCard}>
                            <Card.Content style={styles.cardStack}>
                              <Pressable style={styles.rowBetween} onPress={() => setExpandedRoutineId(expanded ? "" : task.id)}>
                                <View style={styles.flexOne}>
                                  <Text variant="titleSmall" style={[styles.historyTitle, (task.completed || !!safeTrim(task.completedAt)) ? styles.completedText : null]}>
                                    {safeTrim(task.type) ? safeTrim(task.type).charAt(0).toUpperCase() + safeTrim(task.type).slice(1).toLowerCase() : "Activity"}
                                  </Text>
                                  <Text variant="bodySmall" style={styles.bodyText}>
                                    {task.duration || "--"} • {safeTrim(task.intensity) || "Mid"}
                                  </Text>
                                </View>
                              </Pressable>
                              {expanded ? (
                                <View style={styles.cardStack}>
                                  <Text variant="bodySmall" style={styles.bodyText}>
                                    {safeTrim(task.description) || "No routine notes."}
                                  </Text>
                                  <View style={styles.routineChecklistRow}>
                                    <IconButton
                                      icon={task.completed ? "checkbox-marked-circle-outline" : "checkbox-blank-circle-outline"}
                                      size={20}
                                      onPress={() => void toggleTask(task, !task.completed)}
                                    />
                                    <IconButton icon="pencil-outline" size={18} onPress={() => openRoutineEdit(task)} />
                                    <IconButton icon="delete-outline" size={18} onPress={() => void removeRoutineTask(task.id)} />
                                  </View>
                                </View>
                              ) : null}
                            </Card.Content>
                          </Card>
                        );
                      })}
                      <Button mode="outlined" icon="plus" onPress={() => openRoutineExerciseCreate(group.title)}>
                        Add exercise
                      </Button>
                    </Card.Content>
                  </Card>
                ))
              )}
            </Card.Content>
          </Card>
        </ScrollView>
      )}

      <TutorialSheet
        visible={guideVisible}
        title="Activity monitor tutorial"
        pages={ACTIVITY_TUTORIAL_PAGES}
        onClose={() => setGuideVisible(false)}
      />

      <Modal visible={routineBuilderModalVisible} transparent animationType="fade" onRequestClose={() => setRoutineBuilderModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardWrap}>
            <Card mode="contained" style={styles.modalCard}>
              <Card.Content style={styles.cardStack}>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={styles.titleText}>
                    Generate routine
                  </Text>
                  <IconButton icon="close" onPress={() => setRoutineBuilderModalVisible(false)} />
                </View>
                <View style={styles.inlineGrid}>
                  <TextInput
                    value={routineForm.age}
                    onChangeText={(value) => setRoutineForm((current) => ({ ...current, age: value }))}
                    placeholder="Age"
                    placeholderTextColor={palette.muted}
                    style={[styles.input, styles.flexOne]}
                  />
                  <TextInput
                    value={routineForm.heightCm}
                    onChangeText={(value) => setRoutineForm((current) => ({ ...current, heightCm: value }))}
                    placeholder="Height (cm)"
                    placeholderTextColor={palette.muted}
                    style={[styles.input, styles.flexOne]}
                  />
                  <TextInput
                    value={routineForm.weightKg}
                    onChangeText={(value) => setRoutineForm((current) => ({ ...current, weightKg: value }))}
                    placeholder="Weight (kg)"
                    placeholderTextColor={palette.muted}
                    style={[styles.input, styles.flexOne]}
                  />
                </View>
                <TextInput
                  value={routineForm.goals}
                  onChangeText={(value) => setRoutineForm((current) => ({ ...current, goals: value }))}
                  placeholder="Goals"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, styles.notesInput]}
                  multiline
                />
                <Button mode="contained" onPress={() => void suggestRoutine()} loading={routineLoading} disabled={routineLoading}>
                  Generate with AI
                </Button>
                <Text variant="bodySmall" style={styles.bodyText}>
                  Uses your profile and goals to create a routine.
                </Text>
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
                  <Text variant="titleLarge" style={styles.titleText}>
                    Create routine
                  </Text>
                  <IconButton icon="close" onPress={() => setManualRoutineModalVisible(false)} />
                </View>
                <TextInput
                  value={manualRoutineTitle}
                  onChangeText={setManualRoutineTitle}
                  placeholder="Routine title"
                  placeholderTextColor={palette.muted}
                  style={styles.input}
                />
                <TextInput
                  value={manualRoutineDescription}
                  onChangeText={setManualRoutineDescription}
                  placeholder="Description"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, styles.notesInput]}
                  multiline
                />
                {manualRoutineError ? (
                  <Text variant="bodySmall" style={styles.errorText}>
                    {manualRoutineError}
                  </Text>
                ) : null}
                <Button mode="contained" onPress={() => void createManualRoutine()} loading={saving} disabled={saving}>
                  Create routine
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
                  <Text variant="titleLarge" style={styles.titleText}>
                    Edit routine name
                  </Text>
                  <IconButton icon="close" onPress={() => setRoutineTitleEditVisible(false)} />
                </View>
                <TextInput value={routineTitleDraft} onChangeText={setRoutineTitleDraft} placeholder="Routine title" placeholderTextColor={palette.muted} style={styles.input} />
                <Button mode="contained" onPress={() => void saveRoutineTitleEdit()}>
                  Save routine name
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
                  <Text variant="titleLarge" style={styles.titleText}>
                    Add routine exercise
                  </Text>
                  <IconButton icon="close" onPress={() => setRoutineExerciseModalVisible(false)} />
                </View>
                <TextInput value={routineExerciseTitle} onChangeText={setRoutineExerciseTitle} placeholder="Exercise" placeholderTextColor={palette.muted} style={styles.input} />
                <TextInput value={routineExerciseDuration} onChangeText={setRoutineExerciseDuration} placeholder="Duration" placeholderTextColor={palette.muted} style={styles.input} />
                <Text variant="bodySmall" style={styles.bodyText}>
                  Intensity
                </Text>
                <View style={styles.segmentedWrap}>
                  <SegmentedButtons
                    value={routineExerciseIntensity}
                    onValueChange={setRoutineExerciseIntensity}
                    buttons={[
                      { value: "easy", label: "Easy" },
                      { value: "mid", label: "Mid" },
                      { value: "hard", label: "Hard" },
                      { value: "max", label: "Max" },
                    ]}
                  />
                </View>
                <TextInput
                  value={routineExerciseNotes}
                  onChangeText={setRoutineExerciseNotes}
                  placeholder="Description (optional)"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, styles.notesInput]}
                  multiline
                />
                <Button mode="contained" onPress={() => void saveRoutineExercise()}>
                  Add exercise
                </Button>
              </Card.Content>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function MetricCard({ label, value, detail, icon }) {
  return (
    <Card mode="contained" style={styles.metricCard}>
      <Card.Content style={styles.cardStackCompact}>
        <View style={styles.metricIconWrap}>
          <MaterialCommunityIcons name={icon} size={18} color={palette.primary} />
        </View>
        <Text variant="labelSmall" style={styles.metricLabel}>
          {label}
        </Text>
        <Text variant="titleMedium" style={styles.metricValue}>
          {value}
        </Text>
        <Text variant="bodySmall" style={styles.bodyText}>
          {detail}
        </Text>
      </Card.Content>
    </Card>
  );
}

function InsightRow({ icon, title, body }) {
  return (
    <View style={styles.insightRow}>
      <View style={styles.metricIconWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={palette.primary} />
      </View>
      <View style={styles.flexOne}>
        <Text variant="titleSmall" style={styles.historyTitle}>
          {title}
        </Text>
        <Text variant="bodySmall" style={styles.bodyText}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 16,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardStack: {
    gap: 12,
  },
  cardStackCompact: {
    gap: 8,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  metricLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
  },
  metricValue: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  titleText: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  bodyText: {
    color: palette.muted,
    lineHeight: 20,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: palette.text,
    fontFamily: "Poppins_400Regular",
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chipWrapCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  choiceChip: {
    backgroundColor: palette.surfaceSoft,
  },
  inlineGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  flexOne: {
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  segmentedWrap: {
    width: "105%",
    alignSelf: "center",
  },
  insightRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  historyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  historyTitle: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  groupTitleWrap: {
    flex: 1,
    flexShrink: 1,
    paddingRight: 6,
  },
  completedText: {
    textDecorationLine: "line-through",
    color: palette.muted,
  },
  routineChecklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
    marginLeft: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12, 17, 29, 0.55)",
    justifyContent: "center",
    padding: 18,
  },
  modalKeyboardWrap: {
    width: "100%",
  },
  modalCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    width: "100%",
  },
  completeChip: {
    backgroundColor: palette.primarySoft,
  },
  pendingChip: {
    backgroundColor: "#FFF3E2",
  },
  burnChip: {
    backgroundColor: "#EEF6EF",
  },
  errorText: {
    color: palette.danger,
    fontFamily: "Poppins_500Medium",
  },
});
