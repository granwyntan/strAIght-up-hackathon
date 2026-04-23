// @ts-nocheck
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "../../data";

const weekdayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeeklyCalorieGraph({ days }) {
  const safeDays = Array.isArray(days) ? days : [];
  const maxValue = Math.max(1, ...safeDays.map((day) => day.totalCalories || 0));
  const chartWidth = 280;
  const chartHeight = 150;
  const denominator = Math.max(1, safeDays.length - 1);
  const points = safeDays.map((day, index) => {
    const value = day.totalCalories || 0;
    const x = (index / denominator) * chartWidth;
    const y = chartHeight - (value / maxValue) * chartHeight;
    return { x, y, value, date: day.date };
  });

  const segments = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return {
      key: `${point.date}-${next.date}`,
      point,
      next
    };
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Weekly calorie line graph</Text>
      <View style={styles.chartShell}>
        <View style={[styles.chartArea, { width: chartWidth, height: chartHeight }]}>
          {segments.map((segment) => (
            <React.Fragment key={segment.key}>
              <View
                style={[
                  styles.lineSegmentHorizontal,
                  {
                    width: Math.max(1, segment.next.x - segment.point.x),
                    left: segment.point.x,
                    top: segment.point.y
                  }
                ]}
              />
              <View
                style={[
                  styles.lineSegmentVertical,
                  {
                    height: Math.max(1, Math.abs(segment.next.y - segment.point.y)),
                    left: segment.next.x,
                    top: Math.min(segment.point.y, segment.next.y)
                  }
                ]}
              />
            </React.Fragment>
          ))}
          {points.map((point) => (
            <View key={`point-${point.date}`} style={[styles.pointDot, { left: point.x - 4, top: point.y - 4 }]} />
          ))}
        </View>
      </View>
      <View style={styles.labelsRow}>
        {safeDays.map((day, index) => (
          <View key={`label-${day.date}`} style={styles.labelWrap}>
            <Text style={styles.dayLabel}>{weekdayShort[index] || day.date.slice(5)}</Text>
            <Text style={styles.dayValue}>{day.totalCalories || 0}</Text>
          </View>
        ))}
      </View>
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
    gap: 10
  },
  title: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 15
  },
  chartShell: {
    alignItems: "center",
    paddingVertical: 4
  },
  chartArea: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    overflow: "hidden",
    position: "relative"
  },
  lineSegmentHorizontal: {
    position: "absolute",
    height: 2,
    backgroundColor: palette.primary
  },
  lineSegmentVertical: {
    position: "absolute",
    width: 2,
    backgroundColor: palette.primary
  },
  pointDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.primary
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6
  },
  labelWrap: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  dayLabel: {
    color: palette.ink,
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold"
  },
  dayValue: {
    color: palette.muted,
    fontSize: 10,
    fontFamily: "Poppins_400Regular"
  }
});
