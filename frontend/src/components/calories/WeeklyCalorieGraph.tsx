// @ts-nocheck
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "../../data";

const weekdayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayPartLabel(entry) {
  const context = `${entry?.context || ""}`.toLowerCase();
  if (context.includes("breakfast")) return "Breakfast";
  if (context.includes("lunch")) return "Lunch";
  if (context.includes("dinner")) return "Dinner";
  if (context.includes("snack")) return "Snack";
  if (entry?.kind === "hydration") return "Drink";
  return "Other";
}

function toneForCalories(value, max) {
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.75) return palette.primary;
  if (ratio >= 0.4) return "#A5B87B";
  return "#D8E2DC";
}

function toneForHydration(value, max) {
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.75) return palette.secondary;
  if (ratio >= 0.4) return "#78B8D8";
  return "#DCEEF7";
}

export default function WeeklyCalorieGraph({ days, entries, mode = "timeline", timeframeLabel = "Timeline" }) {
  const safeDays = Array.isArray(days) ? days : [];
  const safeEntries = Array.isArray(entries) ? entries : [];
  const maxCalories = Math.max(1, ...safeDays.map((day) => day.totalCalories || 0));
  const maxHydration = Math.max(1, ...safeDays.map((day) => day.hydrationMl || 0));

  const mealMoments = useMemo(() => {
    return safeEntries
      .slice()
      .sort((a, b) => `${a.loggedAt || ""}`.localeCompare(`${b.loggedAt || ""}`))
      .map((entry) => ({
        id: entry.id,
        label: dayPartLabel(entry),
        title: entry.name || "Log item",
        calories: Number(entry.calories || 0),
        hydration: entry.kind === "hydration" ? Number(entry.amount || 0) : 0,
      }));
  }, [safeEntries]);

  const monthSquares = (safeDays.length ? safeDays : []).map((day) => ({
    key: day.date,
    label: day.date.slice(-2),
    calories: day.totalCalories || 0,
    hydration: day.hydrationMl || 0,
  }));

  if (mode === "day") {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Day view</Text>
        <Text style={styles.subtitle}>See how each meal or drink contributed across the day without needing to open the full log first.</Text>
        <View style={styles.dayStack}>
          {mealMoments.length === 0 ? (
            <Text style={styles.emptyText}>No meals or drinks logged in the current range yet.</Text>
          ) : (
            mealMoments.map((item) => (
              <View key={item.id} style={styles.mealCard}>
                <View style={styles.mealTopRow}>
                  <Text style={styles.mealLabel}>{item.label}</Text>
                  <Text style={styles.mealMetric}>{item.hydration > 0 ? `${item.hydration} ml` : `${item.calories} kcal`}</Text>
                </View>
                <Text style={styles.mealTitle}>{item.title}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    );
  }

  if (mode === "week") {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Week trends</Text>
        <Text style={styles.subtitle}>Calories run as a simple weekly trend line, while hydration stays visible as supporting intake bars.</Text>
        <View style={styles.legendRow}>
          <LegendSwatch color={palette.primary} label="Calories trend" />
          <LegendSwatch color={palette.secondary} label="Hydration bars" />
        </View>
        <View style={styles.weekChartRow}>
          {safeDays.map((day, index) => {
            const dotOffset = 10 + Math.round(((day.totalCalories || 0) / maxCalories) * 74);
            const hydrationHeight = Math.max(6, Math.round(((day.hydrationMl || 0) / maxHydration) * 48));
            return (
              <View key={day.date} style={styles.weekColumn}>
                <View style={styles.weekPlot}>
                  <View style={[styles.hydrationMiniBar, { height: hydrationHeight }]} />
                  <View style={[styles.weekDot, { bottom: dotOffset }]} />
                  {index < safeDays.length - 1 ? <View style={[styles.weekLine, { bottom: dotOffset + 5 }]} /> : null}
                </View>
                <Text style={styles.dayLabel}>{weekdayShort[index] || day.date.slice(5)}</Text>
                <Text style={styles.dayMeta}>{day.totalCalories || 0} kcal</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  if (mode === "month" || mode === "year") {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{mode === "month" ? "Month overview" : "Year overview"}</Text>
        <Text style={styles.subtitle}>Squares make it easier to spot heavier intake periods and hydration gaps without overloading the screen.</Text>
        <Text style={styles.gridLabel}>Calories</Text>
        <View style={styles.squareGrid}>
          {monthSquares.map((item) => (
            <View key={`cal-${item.key}`} style={[styles.squareCell, { backgroundColor: toneForCalories(item.calories, maxCalories) }]}>
              <Text style={styles.squareText}>{item.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.gridLabel}>Hydration</Text>
        <View style={styles.squareGrid}>
          {monthSquares.map((item) => (
            <View key={`hyd-${item.key}`} style={[styles.squareCell, { backgroundColor: toneForHydration(item.hydration, maxHydration) }]}>
              <Text style={styles.squareText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{timeframeLabel} intake timeline</Text>
      <Text style={styles.subtitle}>Timeline keeps things lighter. Use it to skim logged days quickly before drilling into a day, week, month, or year view.</Text>
      <View style={styles.timelineStack}>
        {safeDays.length === 0 ? (
          <Text style={styles.emptyText}>No saved intake logs in this range yet.</Text>
        ) : (
          safeDays
            .filter((day) => (day.entryCount || 0) > 0)
            .map((day) => (
              <View key={day.date} style={styles.timelineRow}>
                <View style={styles.timelineDateBadge}>
                  <Text style={styles.timelineDateText}>{day.date.slice(-2)}</Text>
                </View>
                <View style={styles.timelineCopy}>
                  <Text style={styles.timelineTitle}>{day.date}</Text>
                  <Text style={styles.timelineBody}>{day.mealCount || 0} meals • {day.hydrationCount || 0} drinks • {day.otherCount || 0} other</Text>
                </View>
                <View style={styles.timelineMetrics}>
                  <Text style={styles.timelineMetricPrimary}>{day.totalCalories || 0} kcal</Text>
                  <Text style={styles.timelineMetricSecondary}>{day.hydrationMl || 0} ml</Text>
                </View>
              </View>
            ))
        )}
      </View>
    </View>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10,
  },
  title: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
  subtitle: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  legendRow: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  dayColumn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  barLane: {
    minHeight: 126,
    width: "100%",
    maxWidth: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 7,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  bar: {
    flex: 1,
    borderRadius: 999,
    minHeight: 6,
  },
  calorieBar: {
    backgroundColor: palette.primary,
  },
  hydrationBar: {
    backgroundColor: palette.secondary,
  },
  dayLabel: {
    color: palette.ink,
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
  },
  dayMeta: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  dayStack: {
    gap: 10,
  },
  mealCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 12,
    gap: 6,
  },
  mealTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  mealLabel: {
    color: palette.primary,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
  },
  mealMetric: {
    color: palette.muted,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  mealTitle: {
    color: palette.ink,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  emptyText: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  weekChartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "flex-end",
  },
  weekColumn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  weekPlot: {
    width: "100%",
    minHeight: 110,
    maxWidth: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    position: "relative",
    paddingHorizontal: 6,
    paddingBottom: 8,
    justifyContent: "flex-end",
  },
  hydrationMiniBar: {
    width: 10,
    borderRadius: 999,
    backgroundColor: palette.secondary,
    alignSelf: "center",
  },
  weekDot: {
    position: "absolute",
    alignSelf: "center",
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  weekLine: {
    position: "absolute",
    left: "55%",
    width: 22,
    height: 2,
    backgroundColor: palette.primary,
  },
  gridLabel: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    marginTop: 4,
  },
  squareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  squareCell: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  squareText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
  },
  timelineStack: {
    gap: 10,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 12,
  },
  timelineDateBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  timelineDateText: {
    color: palette.primary,
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
  },
  timelineCopy: {
    flex: 1,
    gap: 2,
  },
  timelineTitle: {
    color: palette.ink,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  timelineBody: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Poppins_400Regular",
  },
  timelineMetrics: {
    alignItems: "flex-end",
    gap: 2,
  },
  timelineMetricPrimary: {
    color: palette.primary,
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
  },
  timelineMetricSecondary: {
    color: palette.secondary,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
});
