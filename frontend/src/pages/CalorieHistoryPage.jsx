import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

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

export default function CalorieHistoryPage({ history, loading, onPrevWeek, onNextWeek, onEditEntry, onDeleteEntry, actionLoading }) {
  const days = history?.days || [];
  const entries = history?.entries || [];
  const totalWeekCalories = days.reduce((sum, day) => sum + (day.totalCalories || 0), 0);
  const [editingId, setEditingId] = useState("");
  const [editMealName, setEditMealName] = useState("");
  const [editCalories, setEditCalories] = useState("");

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
    const calories = Number(editCalories);
    if (!Number.isFinite(calories) || calories <= 0) {
      return;
    }
    if (typeof onEditEntry === "function") {
      await onEditEntry(entryId, { mealName: editMealName, calories: Math.round(calories) });
    }
    cancelEdit();
  };

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Text style={styles.chip}>Calorie history</Text>
        <Text style={styles.heroTitle}>Weekly intake overview</Text>
        <Text style={styles.heroSubtitle}>Track daily totals, switch weeks, and monitor your calorie trend.</Text>

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
          <View key={day.date} style={styles.dayRow}>
            <Text style={styles.dayDate}>{day.date}</Text>
            <Text style={styles.dayCalories}>{day.totalCalories} kcal</Text>
          </View>
        ))}
      </View>

      <View style={styles.listCard}>
        <Text style={styles.listTitle}>Meal entries</Text>
        <ScrollView style={styles.entryScroller} nestedScrollEnabled>
          {loading ? <Text style={styles.entryMeta}>Loading entries...</Text> : null}
          {!loading && entries.length === 0 ? <Text style={styles.entryMeta}>No entries for this week.</Text> : null}
          {!loading &&
            entries.map((entry) => (
              <View key={entry.id} style={styles.entryRow}>
                {editingId === entry.id ? (
                  <View style={styles.editRow}>
                    <TextInput style={styles.editInput} value={editMealName} onChangeText={setEditMealName} placeholder="Meal name" />
                    <TextInput style={styles.editInput} value={editCalories} onChangeText={setEditCalories} placeholder="Calories" keyboardType="numeric" />
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
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryMeal}>{entry.mealName || "Meal"}</Text>
                      <Text style={styles.entryMeta}>{entry.date}</Text>
                    </View>
                    <Text style={styles.entryCalories}>{entry.calories} kcal</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: 6
  },
  dayDate: {
    color: palette.muted
  },
  dayCalories: {
    color: palette.ink,
    fontWeight: "600"
  },
  entryScroller: {
    maxHeight: 220
  },
  entryRow: {
    flexDirection: "column",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingVertical: 7,
    gap: 8
  },
  entryMeal: {
    color: palette.ink,
    fontWeight: "600"
  },
  entryMeta: {
    color: palette.muted,
    fontSize: 12
  },
  entryCalories: {
    color: palette.blue,
    fontWeight: "700"
  },
  entryActionRow: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-end"
  },
  ghostButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  ghostButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "600"
  },
  actionButton: {
    borderRadius: 8,
    backgroundColor: palette.blue,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  actionButtonText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: "700"
  },
  dangerButton: {
    borderRadius: 8,
    backgroundColor: "#d95a5a",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  dangerButtonText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: "700"
  },
  editRow: {
    gap: 8
  },
  editInput: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 10
  }
});
