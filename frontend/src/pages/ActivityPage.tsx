// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Card, Chip, Text } from "react-native-paper";

import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import { palette } from "../data";
import { buildActivityProfileContext, loadProfile } from "../storage/profileStorage";
import { addExerciseEntry, deleteExerciseEntry, loadExerciseEntries } from "../storage/exerciseStorage";
import { loadWorkoutTasks, replaceWorkoutTasks, setWorkoutTaskCompleted } from "../storage/workoutRoutineStorage";
import { loadCalorieWeek } from "../storage/calorieTrackerStorage";
import { formatDisplayDateTime } from "../utils/dateTime";

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

const ACTIVITY_TYPES = [
  "Running",
  "Walking",
  "Cycling",
  "Swimming",
  "Strength training",
  "HIIT",
  "Yoga",
  "Stretching",
  "Sports",
  "Sleep",
  "Rest day",
];

const INTENSITY_OPTIONS = ["Low", "Moderate", "High"];

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
  const multiplier = intensity === "high" ? 9 : intensity === "moderate" ? 6 : 3;
  return duration > 0 ? Math.round(duration * multiplier) : 0;
}

function parseSmartInput(text) {
  const lowered = safeTrim(text).toLowerCase();
  if (!lowered) {
    return null;
  }
  const activity =
    ACTIVITY_TYPES.find((item) => lowered.includes(item.toLowerCase().split(" ")[0])) ||
    (lowered.includes("sleep") ? "Sleep" : lowered.includes("walk") ? "Walking" : lowered.includes("run") ? "Running" : "Activity");
  const durationMatch = lowered.match(/(\d+)\s*(min|mins|minutes|hr|hrs|hours|km)/);
  let duration = "";
  if (durationMatch) {
    const value = durationMatch[1];
    const unit = durationMatch[2];
    duration = unit.startsWith("km") ? `${Math.max(20, Math.round(Number(value) * 8))} min` : `${value} ${unit}`;
  }
  const intensity = lowered.includes("fast") || lowered.includes("hard") ? "High" : lowered.includes("easy") || lowered.includes("light") ? "Low" : "Moderate";
  return {
    title: activity,
    duration,
    intensity,
    notes: text,
  };
}

function buildRoutineTasksFromSuggestion(suggestion) {
  const today = new Date();
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return (suggestion?.exercises || []).map((exercise, index) => {
    const due = new Date(today);
    const targetDay = Array.isArray(exercise.daysOfWeek) && exercise.daysOfWeek.length > 0 ? days.indexOf(String(exercise.daysOfWeek[0]).slice(0, 3).toLowerCase()) : -1;
    if (targetDay >= 0) {
      const delta = (targetDay - due.getDay() + 7) % 7;
      due.setDate(due.getDate() + delta);
    } else {
      due.setDate(due.getDate() + index);
    }
    return {
      id: `task-${Date.now()}-${index}`,
      routineTitle: suggestion.routineTitle || "Suggested activity block",
      type: exercise.type || "Activity",
      duration: exercise.duration || "30 min",
      intensity: exercise.intensity || "medium",
      description: exercise.description || "",
      dueDate: due.toISOString(),
      completed: false,
      completedAt: "",
      createdAt: new Date().toISOString(),
    };
  });
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
  const [intensity, setIntensity] = useState("Moderate");
  const [notes, setNotes] = useState("");

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
    () => entries.filter((entry) => safeTrim(entry.intensity).toLowerCase() === "high").length,
    [entries]
  );
  const recoveryTone = highIntensityCount >= 3 ? "Recovery needs attention" : weeklyCaloriesBurned >= 1200 ? "Balanced training load" : "Room for more structured movement";
  const energyBalance = weeklyCalories - weeklyCaloriesBurned;
  const insightLine =
    energyBalance > 2500
      ? "Intake is outpacing logged activity this week."
      : energyBalance < -1200
        ? "Activity output is high relative to food intake."
        : "Diet and activity are landing in a steadier weekly range.";

  function applySmartInput() {
    const parsed = parseSmartInput(smartInput);
    if (!parsed) {
      return;
    }
    setActivityType(parsed.title);
    setDuration(parsed.duration);
    setIntensity(parsed.intensity);
    setNotes(parsed.notes);
  }

  async function saveEntry() {
    if (!safeTrim(activityType)) {
      setError("Choose an activity type first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = await addExerciseEntry(
        accountId,
        {
          title: activityType,
          duration: safeTrim(duration),
          intensity: intensity,
          notes: safeTrim(notes),
        },
        accountEmail
      );
      setEntries((current) => [next, ...current]);
      setSmartInput("");
      setDuration("");
      setNotes("");
      setActiveView("history");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save activity.");
    } finally {
      setSaving(false);
    }
  }

  async function suggestRoutine() {
    setRoutineLoading(true);
    setError("");
    try {
      const response = await requestApi(
        "/api/workout-routine/suggest",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            age: safeTrim(profile?.age),
            heightCm: safeTrim(profile?.height),
            weightKg: safeTrim(profile?.weight),
            goals: safeTrim(profile?.goals),
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
      setActiveView("history");
    } catch (routineError) {
      setError(routineError instanceof Error ? routineError.message : "Could not build an activity plan.");
    } finally {
      setRoutineLoading(false);
    }
  }

  async function toggleTask(taskId, completed) {
    const saved = await setWorkoutTaskCompleted(accountId, taskId, completed, accountEmail);
    setRoutineTasks(saved);
  }

  async function removeEntry(entryId) {
    await deleteExerciseEntry(accountId, entryId, accountEmail);
    setEntries((current) => current.filter((item) => item.id !== entryId));
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
              <View style={styles.chipWrap}>
                {ACTIVITY_TYPES.map((item) => (
                  <Chip key={item} selected={activityType === item} onPress={() => setActivityType(item)} style={styles.choiceChip}>
                    {item}
                  </Chip>
                ))}
              </View>
              <View style={styles.inlineGrid}>
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="Duration, e.g. 45 min"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, styles.flexOne]}
                />
                <View style={styles.chipWrapCompact}>
                  {INTENSITY_OPTIONS.map((item) => (
                    <Chip key={item} selected={intensity === item} onPress={() => setIntensity(item)} style={styles.choiceChip}>
                      {item}
                    </Chip>
                  ))}
                </View>
              </View>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes, recovery feel, heart rate, or sleep impact"
                placeholderTextColor={palette.muted}
                style={[styles.input, styles.notesInput]}
                multiline
              />
              {error ? <Text variant="bodySmall" style={styles.errorText}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Button mode="contained" onPress={saveEntry} loading={saving} buttonColor={palette.primary}>
                  Save activity
                </Button>
                <Button mode="outlined" onPress={suggestRoutine} loading={routineLoading} textColor={palette.primary}>
                  Build AI plan
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
                Planned routine
              </Text>
              {routineTasks.length === 0 ? (
                <Text variant="bodySmall" style={styles.bodyText}>
                  No plan saved yet. Use “Build AI plan” to generate a routine matched to your profile.
                </Text>
              ) : (
                routineTasks.map((task) => (
                  <Pressable key={task.id} onPress={() => void toggleTask(task.id, !task.completed)} style={styles.historyCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flexOne}>
                        <Text variant="titleSmall" style={styles.historyTitle}>
                          {task.type}
                        </Text>
                        <Text variant="bodySmall" style={styles.bodyText}>
                          {task.duration} • {task.intensity} • {formatDisplayDateTime(task.dueDate)}
                        </Text>
                      </View>
                      <Chip compact style={task.completed ? styles.completeChip : styles.pendingChip}>
                        {task.completed ? "Done" : "Pending"}
                      </Chip>
                    </View>
                    {!!safeTrim(task.description) && (
                      <Text variant="bodySmall" style={styles.bodyText}>
                        {task.description}
                      </Text>
                    )}
                  </Pressable>
                ))
              )}
            </Card.Content>
          </Card>

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
                entries.map((entry) => (
                  <View key={entry.id} style={styles.historyCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flexOne}>
                        <Text variant="titleSmall" style={styles.historyTitle}>
                          {entry.title}
                        </Text>
                        <Text variant="bodySmall" style={styles.bodyText}>
                          {safeTrim(entry.duration) || "Duration not set"} • {safeTrim(entry.intensity) || "Moderate"} • {formatDisplayDateTime(entry.createdAt)}
                        </Text>
                      </View>
                      <Chip compact style={styles.burnChip}>
                        {estimateCalories(entry)} kcal
                      </Chip>
                    </View>
                    {!!safeTrim(entry.notes) && (
                      <Text variant="bodySmall" style={styles.bodyText}>
                        {entry.notes}
                      </Text>
                    )}
                    <Button mode="text" onPress={() => void removeEntry(entry.id)} textColor={palette.danger}>
                      Delete
                    </Button>
                  </View>
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
