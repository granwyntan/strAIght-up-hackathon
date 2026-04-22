import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { palette } from "../data";
import WeeklyCalorieGraph from "../components/calories/WeeklyCalorieGraph";

function formatRange(start, end) {
  if (!start || !end) {
    return "";
  }
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return `${a.toLocaleDateString()} - ${b.toLocaleDateString()}`;
}

function formatDayLabel(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function CalorieHistoryPage({
  history,
  loading,
  onPrevWeek,
  onNextWeek,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onClearDayEntries,
  actionLoading,
  trackerLoading,
  trackerError
}) {
  const days = history?.days || [];
  const entries = history?.entries || [];
  const totalWeekCalories = days.reduce((sum, day) => sum + (day.totalCalories || 0), 0);

  const entriesByDate = useMemo(() => {
    const grouped = {};
    for (const entry of entries) {
      const date = entry?.date || "";
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    }
    return grouped;
  }, [entries]);

  const [selectedDate, setSelectedDate] = useState("");
  const [newMealName, setNewMealName] = useState("");
  const [newCalories, setNewCalories] = useState("");
  const [dayError, setDayError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editMealName, setEditMealName] = useState("");
  const [editCalories, setEditCalories] = useState("");

  const selectedDayEntries = selectedDate ? entriesByDate[selectedDate] || [] : [];
  const selectedDayTotal = selectedDayEntries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0);

  const openDayDetails = (dayDate) => {
    setSelectedDate(dayDate);
    setDayError("");
    setNewMealName("");
    setNewCalories("");
    setEditingId("");
    setEditMealName("");
    setEditCalories("");
  };

  const closeDayDetails = () => {
    setSelectedDate("");
    setDayError("");
    setEditingId("");
  };

  const addEntryForSelectedDay = async () => {
    if (!selectedDate) {
      return;
    }
    const parsedCalories = Number(newCalories);
    if (!Number.isFinite(parsedCalories) || parsedCalories <= 0) {
      setDayError("Enter valid calories before adding.");
      return;
    }
    setDayError("");
    const added = await onAddEntry?.({
      date: selectedDate,
      mealName: newMealName,
      calories: parsedCalories
    });
    if (added) {
      setNewMealName("");
      setNewCalories("");
    }
  };

  const beginEdit = (entry) => {
    setEditingId(entry.id);
    setEditMealName(entry.mealName || "");
    setEditCalories(String(entry.calories || ""));
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditMealName("");
    setEditCalories("");
  };

  const saveEdit = async (entryId) => {
    const parsedCalories = Number(editCalories);
    if (!Number.isFinite(parsedCalories) || parsedCalories <= 0) {
      setDayError("Enter valid calories before saving.");
      return;
    }
    setDayError("");
    await onEditEntry?.(entryId, { mealName: editMealName, calories: Math.round(parsedCalories) });
    cancelEdit();
  };

  const clearSelectedDay = async () => {
    if (!selectedDate) {
      return;
    }
    setDayError("");
    await onClearDayEntries?.(selectedDate);
  };

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Text style={styles.chip}>Calorie history</Text>
        <Text style={styles.heroTitle}>Weekly intake overview</Text>
        <Text style={styles.heroSubtitle}>Track daily totals, switch weeks, and open each day to manage entries.</Text>

        <View style={styles.weekNavRow}>
          <Pressable style={styles.arrowButton} onPress={onPrevWeek}>
            <Text style={styles.arrowText}>←</Text>
          </Pressable>
          <Text style={styles.weekRange}>{formatRange(history?.weekStart, history?.weekEnd)}</Text>
          <Pressable style={styles.arrowButton} onPress={onNextWeek}>
            <Text style={styles.arrowText}>→</Text>
          </Pressable>
        </View>
      </View>

      <WeeklyCalorieGraph days={days} />

      <View style={styles.statsCard}>
        <Text style={styles.statTitle}>Week total</Text>
        <Text style={styles.statValue}>{totalWeekCalories} kcal</Text>
      </View>

      <View style={styles.listCard}>
        <Text style={styles.listTitle}>Daily totals</Text>
        {days.map((day) => (
          <Pressable key={day.date} style={styles.dayRow} onPress={() => openDayDetails(day.date)}>
            <View style={styles.dayTextWrap}>
              <Text style={styles.dayDate}>{formatDayLabel(day.date)}</Text>
              <Text style={styles.entryMeta}>Tap to view day details</Text>
            </View>
            <View style={styles.dayRight}>
              <Text style={styles.dayCalories}>{day.totalCalories} kcal</Text>
              <Text style={styles.entryMeta}>{day.entryCount} entries</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Modal visible={Boolean(selectedDate)} transparent animationType="slide" onRequestClose={closeDayDetails}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedDate ? formatDayLabel(selectedDate) : "Day details"}</Text>
            <Text style={styles.modalSubtitle}>{selectedDayTotal} kcal · {selectedDayEntries.length} entries</Text>

            <View style={styles.addCard}>
              <Text style={styles.addTitle}>Add entry</Text>
              <TextInput
                style={styles.input}
                value={newMealName}
                onChangeText={setNewMealName}
                placeholder="Meal name (optional)"
                editable={!trackerLoading}
              />
              <TextInput
                style={styles.input}
                value={newCalories}
                onChangeText={setNewCalories}
                placeholder="Calories"
                keyboardType="numeric"
                editable={!trackerLoading}
              />
              <Pressable style={[styles.actionButton, trackerLoading && styles.buttonDisabled]} onPress={() => void addEntryForSelectedDay()} disabled={trackerLoading}>
                <Text style={styles.actionButtonText}>{trackerLoading ? "Adding..." : "Add entry"}</Text>
              </Pressable>
            </View>

            <View style={styles.modalHeaderActions}>
              <Pressable style={[styles.dangerButton, actionLoading && styles.buttonDisabled]} onPress={() => void clearSelectedDay()} disabled={actionLoading}>
                <Text style={styles.dangerButtonText}>Clear All Entries</Text>
              </Pressable>
              <Pressable style={styles.ghostButton} onPress={closeDayDetails}>
                <Text style={styles.ghostButtonText}>Close</Text>
              </Pressable>
            </View>

            {dayError ? <Text style={styles.errorText}>{dayError}</Text> : null}
            {trackerError ? <Text style={styles.errorText}>{trackerError}</Text> : null}

            <ScrollView style={styles.entryScroller} nestedScrollEnabled>
              {loading ? <Text style={styles.entryMeta}>Loading entries...</Text> : null}
              {!loading && selectedDayEntries.length === 0 ? <Text style={styles.entryMeta}>No entries for this day.</Text> : null}
              {!loading &&
                selectedDayEntries.map((entry) => (
                  <View key={entry.id} style={styles.entryRow}>
                    {editingId === entry.id ? (
                      <View style={styles.editRow}>
                        <TextInput style={styles.input} value={editMealName} onChangeText={setEditMealName} placeholder="Meal name" />
                        <TextInput style={styles.input} value={editCalories} onChangeText={setEditCalories} placeholder="Calories" keyboardType="numeric" />
                        <View style={styles.entryActionRow}>
                          <Pressable style={styles.actionButton} onPress={() => void saveEdit(entry.id)} disabled={actionLoading}>
                            <Text style={styles.actionButtonText}>Save</Text>
                          </Pressable>
                          <Pressable style={styles.ghostButton} onPress={cancelEdit} disabled={actionLoading}>
                            <Text style={styles.ghostButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={styles.entryMain}>
                          <Text style={styles.entryMeal}>{entry.mealName || "Meal"}</Text>
                          <Text style={styles.entryMeta}>{entry.calories} kcal</Text>
                        </View>
                        <View style={styles.entryActionRow}>
                          <Pressable style={styles.ghostButton} onPress={() => beginEdit(entry)} disabled={actionLoading}>
                            <Text style={styles.ghostButtonText}>Edit</Text>
                          </Pressable>
                          <Pressable style={styles.dangerButton} onPress={() => void onDeleteEntry?.(entry.id)} disabled={actionLoading}>
                            <Text style={styles.dangerButtonText}>Delete</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 14
  },
  heroPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    backgroundColor: palette.surface,
    gap: 8
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#eef8df",
    color: "#4c6f2b",
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "700"
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "700"
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20
  },
  weekNavRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  arrowText: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700"
  },
  weekRange: {
    flex: 1,
    textAlign: "center",
    color: palette.ink,
    fontWeight: "600"
  },
  statsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14
  },
  statTitle: {
    color: palette.muted,
    fontSize: 12
  },
  statValue: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 24
  },
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 8
  },
  listTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 14
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: 8,
    paddingTop: 2
  },
  dayTextWrap: {
    flex: 1
  },
  dayRight: {
    alignItems: "flex-end"
  },
  dayDate: {
    color: palette.ink,
    fontWeight: "600"
  },
  dayCalories: {
    color: palette.blue,
    fontWeight: "700"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10
  },
  modalTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  modalSubtitle: {
    color: palette.muted,
    fontSize: 13
  },
  addCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 10,
    gap: 8
  },
  addTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 13
  },
  input: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 10
  },
  modalHeaderActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  entryScroller: {
    maxHeight: 280
  },
  entryRow: {
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingVertical: 8,
    gap: 8
  },
  entryMain: {
    gap: 2
  },
  entryMeal: {
    color: palette.ink,
    fontWeight: "600"
  },
  entryMeta: {
    color: palette.muted,
    fontSize: 12
  },
  entryActionRow: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-end"
  },
  editRow: {
    gap: 8
  },
  actionButton: {
    borderRadius: 8,
    backgroundColor: palette.blue,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  actionButtonText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: "700"
  },
  ghostButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  ghostButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "600"
  },
  dangerButton: {
    borderRadius: 8,
    backgroundColor: "#d95a5a",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  dangerButtonText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: "700"
  },
  buttonDisabled: {
    opacity: 0.5
  },
  errorText: {
    color: palette.red,
    fontSize: 12
  }
});
