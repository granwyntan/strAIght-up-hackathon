// @ts-nocheck
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "../../data";
import { panelShadow, ui } from "../../styles/ui";

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

function intensityColor(value, max, kind) {
  const ratio = max > 0 ? value / max : 0;
  if (kind === "hydration") {
    if (ratio >= 0.8) return palette.secondary;
    if (ratio >= 0.45) return "#7EC6E8";
    return "#DDF2FB";
  }
  if (ratio >= 0.8) return palette.primary;
  if (ratio >= 0.45) return "#88A96A";
  return "#E7F0E8";
}

function buildMonthCells(days) {
  return (Array.isArray(days) ? days : []).map((day) => ({
    key: day.date,
    label: day.date.slice(-2),
    calories: Number(day.totalCalories || 0),
    hydration: Number(day.hydrationMl || 0),
  }));
}

function buildYearCells(days) {
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

export default function WeeklyCalorieGraph({ days, entries, mode = "timeline", timeframeLabel = "Timeline" }) {
  const safeDays = Array.isArray(days) ? days : [];
  const safeEntries = Array.isArray(entries) ? entries : [];
  const maxCalories = Math.max(1, ...safeDays.map((day) => Number(day.totalCalories || 0)));
  const maxHydration = Math.max(1, ...safeDays.map((day) => Number(day.hydrationMl || 0)));

  const mealMoments = useMemo(
    () =>
      safeEntries
        .slice()
        .sort((a, b) => `${a.loggedAt || ""}`.localeCompare(`${b.loggedAt || ""}`))
        .map((entry) => ({
          id: entry.id,
          label: dayPartLabel(entry),
          title: entry.name || "Log item",
          calories: Number(entry.calories || 0),
          hydration: entry.kind === "hydration" ? Number(entry.amount || 0) : 0,
          kind: entry.kind,
        })),
    [safeEntries]
  );

  const monthSquares = useMemo(() => buildMonthCells(safeDays), [safeDays]);
  const yearSquares = useMemo(() => buildYearCells(safeDays), [safeDays]);

  if (mode === "day") {
    const maxEntryValue = Math.max(
      1,
      ...mealMoments.map((item) => (item.hydration > 0 ? item.hydration : item.calories))
    );
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Day view</Text>
        <Text style={styles.subtitle}>Meals and drinks are shown as bars so you can spot the heaviest items immediately.</Text>
        {mealMoments.length === 0 ? (
          <EmptyChartBox body="No meals or drinks logged in the current day yet." />
        ) : (
          <View style={styles.dayBarStack}>
            {mealMoments.map((item) => {
              const value = item.hydration > 0 ? item.hydration : item.calories;
              const width = `${Math.max(12, Math.round((value / maxEntryValue) * 100))}%`;
              const barColor = item.hydration > 0 ? palette.secondary : palette.primary;
              return (
                <View key={item.id} style={styles.dayBarRow}>
                  <View style={styles.dayBarTop}>
                    <Text style={styles.dayBarLabel}>{item.label}</Text>
                    <Text style={styles.dayBarValue}>{item.hydration > 0 ? `${item.hydration} ml` : `${item.calories} kcal`}</Text>
                  </View>
                  <Text style={styles.dayBarTitle}>{item.title}</Text>
                  <View style={styles.dayBarTrack}>
                    <View style={[styles.dayBarFill, { width, backgroundColor: barColor }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  if (mode === "week") {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Week trends</Text>
        <Text style={styles.subtitle}>Calories and hydration share the same paired bar layout for quick scanning.</Text>
        <View style={styles.legendRow}>
          <LegendSwatch color={palette.primary} label="Calories" />
          <LegendSwatch color={palette.secondary} label="Hydration" />
        </View>
        {safeDays.length === 0 ? (
          <EmptyChartBox body="No logs in this week yet." />
        ) : (
          <View style={styles.chartRow}>
            {safeDays.map((day, index) => {
              const calorieHeight = Math.max(8, Math.round(((day.totalCalories || 0) / maxCalories) * 92));
              const hydrationHeight = Math.max(8, Math.round(((day.hydrationMl || 0) / maxHydration) * 92));
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
    const gridItems = mode === "month" ? monthSquares : yearSquares;
    const calorieMax = Math.max(1, ...gridItems.map((item) => item.calories || 0));
    const hydrationMax = Math.max(1, ...gridItems.map((item) => item.hydration || 0));
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{mode === "month" ? "Month overview" : "Year overview"}</Text>
        <Text style={styles.subtitle}>Square cells show daily or monthly intensity without forcing everything into another bar chart.</Text>
        <View style={styles.legendRow}>
          <LegendSwatch color={palette.primary} label="Calories" />
          <LegendSwatch color={palette.secondary} label="Hydration" />
        </View>
        {gridItems.length === 0 ? (
          <EmptyChartBox body={`No logs in this ${mode} yet.`} />
        ) : (
          <View style={styles.squareGrid}>
            {gridItems.map((item) => (
              <View key={item.key} style={styles.squareCell}>
                <View style={styles.squarePair}>
                  <View style={[styles.squareSwatch, { backgroundColor: intensityColor(item.calories, calorieMax, "calories") }]} />
                  <View style={[styles.squareSwatch, { backgroundColor: intensityColor(item.hydration, hydrationMax, "hydration") }]} />
                </View>
                <Text style={styles.squareLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  const timelineMax = Math.max(
    1,
    ...safeDays.map((day) => Math.max(Number(day.totalCalories || 0), Number(day.hydrationMl || 0)))
  );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{timeframeLabel} intake timeline</Text>
      <Text style={styles.subtitle}>The full range uses a vertical activity rail so long timelines stay readable.</Text>
      {safeDays.length === 0 ? (
        <EmptyChartBox body="No saved intake logs in this range yet." />
      ) : (
        <View style={styles.timelineRail}>
          {safeDays.map((day, index) => {
            const markerSize = 14 + Math.round((Math.max(day.totalCalories || 0, day.hydrationMl || 0) / timelineMax) * 12);
            return (
              <View key={day.date} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineMarker, { width: markerSize, height: markerSize }]} />
                  {index < safeDays.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineCard}>
                  <View style={styles.timelineTop}>
                    <Text style={styles.timelineTitle}>{day.date}</Text>
                    <Text style={styles.timelineMetricPrimary}>{day.totalCalories || 0} kcal</Text>
                  </View>
                  <Text style={styles.timelineBody}>{day.mealCount || 0} meals • {day.hydrationCount || 0} drinks • {day.otherCount || 0} other</Text>
                  <View style={styles.timelineBars}>
                    <View style={styles.timelineBarTrack}>
                      <View style={[styles.timelineBarFill, { width: `${Math.max(10, Math.round(((day.totalCalories || 0) / maxCalories) * 100))}%`, backgroundColor: palette.primary }]} />
                    </View>
                    <View style={styles.timelineBarTrack}>
                      <View style={[styles.timelineBarFill, { width: `${Math.max(10, Math.round(((day.hydrationMl || 0) / maxHydration) * 100))}%`, backgroundColor: palette.secondary }]} />
                    </View>
                  </View>
                  <Text style={styles.timelineMetricSecondary}>{day.hydrationMl || 0} ml hydration</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...panelShadow,
    ...ui.surfaceCard,
    padding: 18,
    gap: 12,
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
  dayBarStack: {
    gap: 12,
  },
  dayBarRow: {
    ...ui.softCard,
    padding: 12,
    gap: 6,
  },
  dayBarTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  dayBarLabel: {
    color: palette.primary,
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    textTransform: "uppercase",
  },
  dayBarTitle: {
    color: palette.ink,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  dayBarValue: {
    color: palette.ink,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  dayBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E6EEE8",
    overflow: "hidden",
  },
  dayBarFill: {
    height: "100%",
    borderRadius: 999,
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
    minHeight: 132,
    width: "100%",
    maxWidth: 44,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#F8FBF9",
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
  squareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  squareCell: {
    width: 54,
    alignItems: "center",
    gap: 6,
  },
  squarePair: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: palette.surfaceSoft,
  },
  squareSwatch: {
    flex: 1,
  },
  squareLabel: {
    color: palette.ink,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  timelineRail: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
  },
  timelineLeft: {
    width: 20,
    alignItems: "center",
  },
  timelineMarker: {
    borderRadius: 999,
    backgroundColor: palette.primary,
    marginTop: 6,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#DCE7E1",
    marginVertical: 4,
  },
  timelineCard: {
    flex: 1,
    ...ui.softCard,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  timelineTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineTitle: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
  },
  timelineBody: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  timelineBars: {
    gap: 8,
  },
  timelineBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E8EFEB",
    overflow: "hidden",
  },
  timelineBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  timelineMetricPrimary: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  timelineMetricSecondary: {
    color: palette.secondary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  emptyChartBox: {
    ...ui.softCard,
    padding: 16,
    gap: 12,
  },
  emptyChartFrame: {
    height: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    borderStyle: "dashed",
    backgroundColor: "#F8FBF9",
  },
  emptyText: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
});
