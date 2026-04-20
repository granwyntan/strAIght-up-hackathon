import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "../../data";

const weekdayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeeklyCalorieGraph({ days }) {
  const safeDays = Array.isArray(days) ? days : [];
  const maxValue = Math.max(1, ...safeDays.map((day) => day.totalCalories || 0));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Weekly calorie graph</Text>
      <View style={styles.graphRow}>
        {safeDays.map((day, index) => {
          const value = day.totalCalories || 0;
          const heightPercent = Math.max(4, Math.round((value / maxValue) * 100));
          return (
            <View key={day.date} style={styles.barWrap}>
              <Text style={styles.barValue}>{value}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${heightPercent}%` }]} />
              </View>
              <Text style={styles.barLabel}>{weekdayShort[index] || day.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10
  },
  title: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 15
  },
  graphRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8
  },
  barWrap: {
    flex: 1,
    alignItems: "center",
    minWidth: 34,
    gap: 4
  },
  barValue: {
    color: palette.muted,
    fontSize: 10
  },
  barTrack: {
    width: "100%",
    maxWidth: 34,
    height: 130,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    justifyContent: "flex-end",
    overflow: "hidden"
  },
  barFill: {
    width: "100%",
    backgroundColor: "#93cf62",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8
  },
  barLabel: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: "600"
  }
});

