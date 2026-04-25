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

function buildMonthCells(days) {
  const grouped = new Map();
  (Array.isArray(days) ? days : []).forEach((day) => {
    const key = `${day?.date || ""}`.slice(0, 7);
    if (!key) return;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" }),
        calories: 0,
        hydration: 0,
      });
    }
    const bucket = grouped.get(key);
    bucket.calories += Number(day?.totalCalories || 0);
    bucket.hydration += Number(day?.hydrationMl || 0);
  });
  return Array.from(grouped.values());
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
  const yearSquares = useMemo(() => buildMonthCells(safeDays), [safeDays]);

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
        <Text style={styles.subtitle}>Calories and hydration use the same paired bar layout so the week reads clearly at a glance.</Text>
        <View style={styles.legendRow}>
          <LegendSwatch color={palette.primary} label="Calories" />
          <LegendSwatch color={palette.secondary} label="Hydration" />
        </View>
        {safeDays.length === 0 ? (
          <EmptyChartBox body="No logs in this week yet. The chart frame stays here so the layout does not jump around." />
        ) : (
          <View style={styles.chartRow}>
            {safeDays.map((day, index) => {
              const calorieHeight = Math.max(6, Math.round(((day.totalCalories || 0) / maxCalories) * 86));
              const hydrationHeight = Math.max(6, Math.round(((day.hydrationMl || 0) / maxHydration) * 86));
              return (
                <View key={day.date} style={styles.dayColumn}>
                  <View style={styles.barLane}>
                    <View style={[styles.bar, styles.calorieBar, { height: calorieHeight }]} />
                    <View style={[styles.bar, styles.hydrationBar, { height: hydrationHeight }]} />
                  </View>
                  <Text style={styles.dayLabel}>{weekdayShort[index] || day.date.slice(5)}</Text>
                  <Text style={styles.dayMeta}>{day.totalCalories || 0} kcal</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  if (mode === "month" || mode === "year") {
    const gridItems = mode === "year" ? yearSquares : monthSquares;
    const gridCaloriesMax = Math.max(1, ...gridItems.map((item) => item.calories || 0));
    const gridHydrationMax = Math.max(1, ...gridItems.map((item) => item.hydration || 0));
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{mode === "month" ? "Month overview" : "Year overview"}</Text>
        <Text style={styles.subtitle}>Bar charts keep the monthly and yearly views consistent with the rest of the history experience.</Text>
        {gridItems.length === 0 ? (
          <EmptyChartBox body={`No logs in this ${mode} yet. This overview stays visible so the page structure stays consistent.`} />
        ) : (
          <View style={styles.chartRow}>
            {gridItems.map((item) => {
              const calorieHeight = Math.max(6, Math.round(((item.calories || 0) / gridCaloriesMax) * 86));
              const hydrationHeight = Math.max(6, Math.round(((item.hydration || 0) / gridHydrationMax) * 86));
              return (
                <View key={item.key} style={styles.dayColumn}>
                  <View style={styles.barLane}>
                    <View style={[styles.bar, styles.calorieBar, { height: calorieHeight }]} />
                    <View style={[styles.bar, styles.hydrationBar, { height: hydrationHeight }]} />
                  </View>
                  <Text style={styles.dayLabel}>{item.label}</Text>
                  <Text style={styles.dayMeta}>{item.calories || 0} kcal</Text>
                </View>
              );
            })}
          </View>
        )}
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
          safeDays.map((day) => (
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

function EmptyChartBox({ body }) {
  return (
    <View style={styles.emptyChartBox}>
      <View style={styles.emptyChartFrame} />
      <Text style={styles.emptyText}>{body}</Text>
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
  emptyChartBox: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
  },
  emptyChartFrame: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
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
