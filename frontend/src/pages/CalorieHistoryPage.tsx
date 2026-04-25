// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { palette } from "../data";
import WeeklyCalorieGraph from "../components/calories/WeeklyCalorieGraph";
import SectionTabs from "../components/shared/SectionTabs";
import DateTimePickerField from "../components/shared/DateTimePickerField";
import { formatDisplayDate, formatDisplayDateLabel, formatDisplayDateTime, formatDisplayTime, parseDisplayDate, parseDisplayTime } from "../utils/dateTime";

function formatRange(start, end) {
  if (!start || !end) {
    return "";
  }
  return `${formatDisplayDate(`${start}T00:00:00`)} - ${formatDisplayDate(`${end}T00:00:00`)}`;
}

function formatDayLabel(isoDate) {
  return formatDisplayDateLabel(`${isoDate}T00:00:00`) || isoDate;
}

function relativeDayLabel(isoDate) {
  if (!isoDate) return "";
  const today = new Date();
  const base = new Date(`${isoDate}T00:00:00`);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetMidnight = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
  const diffDays = Math.round((targetMidnight - todayMidnight) / 86400000);
  if (diffDays === 0) return `Today • ${formatDayLabel(isoDate)}`;
  if (diffDays === -1) return `Yesterday • ${formatDayLabel(isoDate)}`;
  if (diffDays === 1) return `Tomorrow • ${formatDayLabel(isoDate)}`;
  return formatDayLabel(isoDate);
}

function monthLabelFromKey(key) {
  if (!key) return "";
  const date = new Date(`${key}-01T00:00:00`);
  return date.toLocaleDateString("en-GB", { month: "long" });
}

function entryTone(kind) {
  if (kind === "hydration") {
    return { background: `${palette.secondary}16`, color: palette.secondary, label: "Hydration" };
  }
  if (kind === "other") {
    return { background: `${palette.warning}18`, color: palette.warning, label: "Other" };
  }
  return { background: palette.primarySoft, color: palette.primary, label: "Meal" };
}

function groupDaysIntoMonths(days) {
  const grouped = new Map();
  (Array.isArray(days) ? days : []).forEach((day) => {
    const key = (day.date || "").slice(0, 7);
    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        label: key,
        totalCalories: 0,
        hydrationMl: 0,
        mealCount: 0,
        hydrationCount: 0,
        otherCount: 0,
        entryCount: 0,
      });
    }
    const target = grouped.get(key);
    target.totalCalories += day.totalCalories || 0;
    target.hydrationMl += day.hydrationMl || 0;
    target.mealCount += day.mealCount || 0;
    target.hydrationCount += day.hydrationCount || 0;
    target.otherCount += day.otherCount || 0;
    target.entryCount += day.entryCount || 0;
  });
  return Array.from(grouped.values());
}

function groupDaysIntoYears(days) {
  const grouped = new Map();
  (Array.isArray(days) ? days : []).forEach((day) => {
    const key = (day.date || "").slice(0, 4);
    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        label: key,
        totalCalories: 0,
        hydrationMl: 0,
        mealCount: 0,
        hydrationCount: 0,
        otherCount: 0,
        entryCount: 0,
      });
    }
    const target = grouped.get(key);
    target.totalCalories += day.totalCalories || 0;
    target.hydrationMl += day.hydrationMl || 0;
    target.mealCount += day.mealCount || 0;
    target.hydrationCount += day.hydrationCount || 0;
    target.otherCount += day.otherCount || 0;
    target.entryCount += day.entryCount || 0;
  });
  return Array.from(grouped.values());
}

function toIsoDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function addDaysToIso(isoDate, offset) {
  const base = new Date(`${isoDate}T00:00:00`);
  base.setDate(base.getDate() + offset);
  return toIsoDate(base);
}

function addMonthsToIso(isoDate, offset) {
  const base = new Date(`${isoDate}T00:00:00`);
  base.setMonth(base.getMonth() + offset);
  return toIsoDate(base);
}

function addYearsToIso(isoDate, offset) {
  const base = new Date(`${isoDate}T00:00:00`);
  base.setFullYear(base.getFullYear() + offset);
  return toIsoDate(base);
}

function startOfWeekIso(isoDate) {
  const base = new Date(`${isoDate}T00:00:00`);
  const jsDay = base.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  base.setDate(base.getDate() + mondayOffset);
  return toIsoDate(base);
}

function buildDaySummary(date, dayEntries) {
  const hydrationEntries = dayEntries.filter((entry) => entry.kind === "hydration");
  const mealEntries = dayEntries.filter((entry) => entry.kind === "meal");
  const otherEntries = dayEntries.filter((entry) => entry.kind === "other");
  return {
    date,
    totalCalories: dayEntries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0),
    hydrationMl: hydrationEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    mealCount: mealEntries.length,
    hydrationCount: hydrationEntries.length,
    otherCount: otherEntries.length,
    entryCount: dayEntries.length,
  };
}

export default function CalorieHistoryPage({
  history,
  allEntries = [],
  runHistory,
  initialMode = "logs",
  loading,
  onPrevWeek,
  onNextWeek,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onClearDayEntries,
  onOpenRun,
  onDeleteRun,
  actionLoading,
  trackerLoading,
  trackerError,
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [historyView, setHistoryView] = useState("timeline");
  const [historyAnchor, setHistoryAnchor] = useState("");

  const entries = useMemo(
    () =>
      (Array.isArray(allEntries) && allEntries.length ? allEntries : history?.entries || [])
        .slice()
        .sort((a, b) => `${a.loggedAt || a.createdAt || ""}`.localeCompare(`${b.loggedAt || b.createdAt || ""}`)),
    [allEntries, history?.entries]
  );

  useEffect(() => {
    const latest = entries[entries.length - 1];
    const nextAnchor = toIsoDate(latest?.date || latest?.loggedAt || new Date());
    setHistoryAnchor((current) => current || nextAnchor);
  }, [entries]);

  const rangeMeta = useMemo(() => {
    const anchor = historyAnchor || toIsoDate(new Date());
    if (historyView === "day") {
      return { start: anchor, end: anchor };
    }
    if (historyView === "week") {
      const start = startOfWeekIso(anchor);
      return { start, end: addDaysToIso(start, 6) };
    }
    if (historyView === "month") {
      const parsed = new Date(`${anchor}T00:00:00`);
      const start = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-01`;
      const endDate = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
      return { start, end: toIsoDate(endDate) };
    }
    if (historyView === "year") {
      const parsed = new Date(`${anchor}T00:00:00`);
      return { start: `${parsed.getFullYear()}-01-01`, end: `${parsed.getFullYear()}-12-31` };
    }
    return {
      start: entries[0]?.date || "",
      end: entries[entries.length - 1]?.date || "",
    };
  }, [entries, historyAnchor, historyView]);

  const visibleEntries = useMemo(() => {
    if (historyView === "timeline") {
      return entries.filter((entry) => Boolean(entry?.date || entry?.loggedAt));
    }
    return entries.filter((entry) => {
      const date = entry?.date || toIsoDate(entry?.loggedAt);
      return date >= rangeMeta.start && date <= rangeMeta.end;
    });
  }, [entries, historyView, rangeMeta.end, rangeMeta.start]);

  const days = useMemo(() => {
    const grouped = {};
    for (const entry of visibleEntries) {
      const date = entry?.date || "";
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    }
    if (historyView === "timeline") {
      return Object.keys(grouped)
        .sort((a, b) => a.localeCompare(b))
        .map((date) => buildDaySummary(date, grouped[date]));
    }
    if (!rangeMeta.start || !rangeMeta.end) {
      return [];
    }
    const builtDays = [];
    let cursor = rangeMeta.start;
    while (cursor <= rangeMeta.end) {
      builtDays.push(buildDaySummary(cursor, grouped[cursor] || []));
      cursor = addDaysToIso(cursor, 1);
    }
    return builtDays;
  }, [historyView, rangeMeta.end, rangeMeta.start, visibleEntries]);

  const totalWeekCalories = days.reduce((sum, day) => sum + (day.totalCalories || 0), 0);
  const totalWeekHydration = days.reduce((sum, day) => sum + (day.hydrationMl || 0), 0);

  const entriesByDate = useMemo(() => {
    const grouped = {};
    for (const entry of visibleEntries) {
      const date = entry?.date || "";
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    }
    return grouped;
  }, [visibleEntries]);

  const [newKind, setNewKind] = useState("meal");
  const [newName, setNewName] = useState("");
  const [newCalories, setNewCalories] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newDate, setNewDate] = useState(formatDisplayDate(new Date()));
  const [newTime, setNewTime] = useState(formatDisplayTime(new Date()));
  const [dayError, setDayError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCalories, setEditCalories] = useState("");
  const [runSearch, setRunSearch] = useState("");
  const [pinnedRunIds, setPinnedRunIds] = useState([]);
  const historyKind = initialMode === "runs" ? "runs" : "logs";
  const timeFrameLabel =
    historyView === "timeline"
      ? "Timeline"
      : historyView === "day"
        ? "Day"
        : historyView === "week"
          ? "Week"
          : historyView === "month"
            ? "Month"
            : "Year";
  const sortedTimelineDays = useMemo(() => [...days].sort((a, b) => `${a.date || ""}`.localeCompare(`${b.date || ""}`)), [days]);
  const monthGroups = useMemo(() => groupDaysIntoMonths(days), [days]);
  const yearGroups = useMemo(() => groupDaysIntoYears(days), [days]);
  const visibleDayLabel = useMemo(() => {
    if (historyView === "day") {
      return relativeDayLabel(rangeMeta.start);
    }
    if (historyView === "week") {
      return formatRange(rangeMeta.start, rangeMeta.end);
    }
    if (historyView === "month") {
      return monthLabelFromKey(rangeMeta.start.slice(0, 7));
    }
    if (historyView === "year") {
      return rangeMeta.start.slice(0, 4);
    }
    if (sortedTimelineDays.length > 0) {
      return `${formatDayLabel(sortedTimelineDays[0].date)} → ${formatDayLabel(sortedTimelineDays[sortedTimelineDays.length - 1].date)}`;
    }
    return "No saved logs yet";
  }, [historyView, monthGroups, rangeMeta.end, rangeMeta.start, sortedTimelineDays, yearGroups]);
  const intakeHeading =
    historyView === "timeline"
      ? "Intake in range"
      : historyView === "day"
        ? "Intake today"
        : historyView === "week"
          ? "Intake this week"
          : historyView === "month"
            ? "Intake this month"
            : "Intake this year";
  const hydrationHeading =
    historyView === "timeline"
      ? "Hydration in range"
      : historyView === "day"
        ? "Hydration today"
        : historyView === "week"
          ? "Hydration this week"
          : historyView === "month"
            ? "Hydration this month"
            : "Hydration this year";
  const showSummaryCards = historyView === "day" || historyView === "week";

  const shiftRange = (direction) => {
    if (!historyAnchor) return;
    setHistoryAnchor((current) => {
      const base = current || toIsoDate(new Date());
      if (historyView === "day") return addDaysToIso(base, direction);
      if (historyView === "week") return addDaysToIso(base, direction * 7);
      if (historyView === "month") return addMonthsToIso(base, direction);
      if (historyView === "year") return addYearsToIso(base, direction);
      return base;
    });
  };
  const filteredRuns = useMemo(() => {
    const query = (runSearch || "").trim().toLowerCase();
    const items = Array.isArray(runHistory) ? [...runHistory] : [];
    const visible = !query
      ? items
      : items.filter((run) =>
          `${run.title || ""} ${run.summary || ""} ${run.kind || ""}`.toLowerCase().includes(query)
        );
    return visible.sort((a, b) => {
      const aPinned = pinnedRunIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedRunIds.includes(b.id) ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }
      return `${b.searchedAt || ""}`.localeCompare(`${a.searchedAt || ""}`);
    });
  }, [pinnedRunIds, runHistory, runSearch]);

  const selectedDayEntries = selectedDate ? entriesByDate[selectedDate] || [] : [];
  const selectedDayTotal = selectedDayEntries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0);
  const selectedHydrationTotal = selectedDayEntries
    .filter((entry) => entry.kind === "hydration")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const openDayDetails = (dayDate) => {
    setSelectedDate(dayDate);
    setDayError("");
    setNewKind("meal");
    setNewName("");
    setNewCalories("");
    setNewAmount("");
    setNewContext("");
    setNewDate(formatDisplayDate(`${dayDate}T00:00:00`));
    setNewTime(formatDisplayTime(new Date()));
    setEditingId("");
    setEditName("");
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
    const parsedCalories = Number(newCalories || 0);
    const parsedAmount = Number(newAmount || (newKind === "hydration" ? 250 : 1));
    if (newKind !== "hydration" && (!Number.isFinite(parsedCalories) || parsedCalories < 0)) {
      setDayError("Enter valid calories before adding.");
      return;
    }
    setDayError("");
    const added = await onAddEntry?.({
      date: parseDisplayDate(newDate) || selectedDate,
      mealName: newName,
      calories: parsedCalories,
      kind: newKind,
      amount: parsedAmount,
      unit: newKind === "hydration" ? "ml" : "serving",
      servings: 1,
      context: newContext || (newKind === "hydration" ? "Hydration" : "Meal"),
      entryTime: parseDisplayTime(newTime) || newTime,
    });
    if (added) {
      setNewName("");
      setNewCalories("");
      setNewAmount("");
      setNewContext("");
    }
  };

  const beginEdit = (entry) => {
    setEditingId(entry.id);
    setEditName(entry.name || entry.mealName || "");
    setEditCalories(String(entry.calories || ""));
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditName("");
    setEditCalories("");
  };

  const saveEdit = async (entryId) => {
    const parsedCalories = Number(editCalories);
    if (!Number.isFinite(parsedCalories) || parsedCalories < 0) {
      setDayError("Enter valid calories before saving.");
      return;
    }
    setDayError("");
    await onEditEntry?.(entryId, { mealName: editName, calories: Math.round(parsedCalories) });
    cancelEdit();
  };

  const clearSelectedDay = async () => {
    if (!selectedDate) {
      return;
    }
    setDayError("");
    await onClearDayEntries?.(selectedDate);
  };

  const togglePinnedRun = (runId) => {
    setPinnedRunIds((current) => (current.includes(runId) ? current.filter((id) => id !== runId) : [runId, ...current]));
  };

  return (
    <View style={styles.pageStack}>
      {historyKind === "logs" ? (
        <SectionTabs
          value={historyView}
          onValueChange={setHistoryView}
          tabs={[
            { value: "timeline", label: "Timeline", icon: "timeline-outline" },
            { value: "day", label: "Day", icon: "calendar-today" },
            { value: "week", label: "Week", icon: "chart-line" },
            { value: "month", label: "Month", icon: "calendar-month" },
            { value: "year", label: "Year", icon: "calendar-range" },
          ]}
        />
      ) : null}

      <View style={styles.heroPanel}>
        <Text style={styles.chip}>{historyKind === "runs" ? "Previous runs" : "Consumable logs"}</Text>
        <Text style={styles.heroTitle}>{historyKind === "runs" ? "Saved food and drink analyses" : "Meals, hydration, and other intake"}</Text>
        <Text style={styles.heroSubtitle}>
          {historyKind === "runs"
            ? "Open a past AI analysis to review the full breakdown, score, and tailored recommendations again."
            : "Track what you consumed, when you logged it, and how those entries connect back to your personalized diet advice."}
        </Text>

        {historyKind === "logs" ? null : null}
      </View>

      {historyKind === "logs" ? <WeeklyCalorieGraph days={days} entries={entries} mode={historyView} timeframeLabel={timeFrameLabel} /> : null}

      {historyKind === "logs" ? (
          <View style={styles.weekNavRow}>
            <Pressable style={styles.arrowButton} onPress={() => shiftRange(-1)} disabled={historyView === "timeline"}>
              <Text style={styles.arrowText}>←</Text>
            </Pressable>
            <Text style={styles.weekRange}>{visibleDayLabel}</Text>
            <Pressable style={styles.arrowButton} onPress={() => shiftRange(1)} disabled={historyView === "timeline"}>
              <Text style={styles.arrowText}>→</Text>
            </Pressable>
          </View>
        ) : null}

      {historyKind === "logs" && showSummaryCards ? (
        <View style={styles.summaryRow}>
        <View style={styles.statsCard}>
          <Text style={styles.statTitle}>{intakeHeading}</Text>
          <Text style={styles.statValue}>{totalWeekCalories} kcal</Text>
        </View>
        <View style={styles.statsCard}>
          <Text style={styles.statTitle}>{hydrationHeading}</Text>
          <Text style={styles.statValue}>{totalWeekHydration} ml</Text>
        </View>
      </View>
        ) : null}

      {historyKind === "logs" ? (
      <View style={styles.listCard}>
        <Text style={styles.listTitle}>
          {historyView === "timeline"
            ? "Timeline log"
            : historyView === "day"
              ? "Day breakdown"
              : historyView === "week"
                ? "Week breakdown"
                : historyView === "month"
                  ? "Month overview"
                  : "Year overview"}
        </Text>
        {(historyView === "month"
          ? monthGroups
          : historyView === "year"
            ? yearGroups
            : historyView === "timeline"
              ? sortedTimelineDays
              : days).map((day) => (
          <Pressable
            key={day.date}
            style={styles.dayCard}
            onPress={() => {
              if (historyView === "month" || historyView === "year") {
                return;
              }
              openDayDetails(day.date);
            }}
          >
            <View style={styles.dayHeader}>
              <View style={styles.dayTextWrap}>
                <Text style={styles.dayDate}>
                  {historyView === "month"
                    ? monthLabelFromKey(day.date)
                    : historyView === "year"
                      ? day.label
                      : historyView === "day"
                        ? relativeDayLabel(day.date)
                        : formatDayLabel(day.date)}
                </Text>
                <Text style={styles.entryMeta}>
                  {historyView === "timeline"
                    ? "Sorted from oldest to newest."
                    : historyView === "month" || historyView === "year"
                      ? "Range summary for the selected period."
                      : "Tap to open the full log for this period"}
                </Text>
              </View>
              <View style={styles.dayRight}>
                <Text style={styles.dayCalories}>{day.totalCalories} kcal</Text>
                <Text style={styles.dayHydration}>{day.hydrationMl || 0} ml</Text>
              </View>
            </View>
              <View style={styles.dayMetricsRow}>
                <MiniPill label={`${day.mealCount || 0} meals`} tone="primary" />
                <MiniPill label={`${day.hydrationCount || 0} drinks`} tone="secondary" />
                <MiniPill label={`${day.otherCount || 0} other`} tone="warning" />
                {(historyView === "day" || historyView === "week") ? <MiniPill label={`${day.entryCount || 0} logs`} tone="neutral" /> : null}
              </View>
          </Pressable>
        ))}
      </View>
      ) : (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Previous consumable analyses</Text>
          <Text style={styles.entryMeta}>These are your saved food and drink analysis runs with the full breakdown preserved.</Text>
          <TextInput
            style={styles.input}
            value={runSearch}
            onChangeText={setRunSearch}
            placeholder="Search previous runs"
            placeholderTextColor={palette.muted}
          />
          {filteredRuns.length === 0 ? <Text style={styles.entryMeta}>No saved runs yet.</Text> : null}
          {filteredRuns.map((run) => {
            const tone = entryTone(run.kind);
            const pinned = pinnedRunIds.includes(run.id);
            return (
              <Pressable key={run.id} style={styles.dayCard} onPress={() => onOpenRun?.(run)}>
                <View style={styles.rowBetween}>
                  <View style={styles.entryMain}>
                    <Text style={styles.entryMeal}>{run.title || "Consumable analysis"}</Text>
                    <Text style={styles.entryMeta}>{formatDisplayDateTime(run.searchedAt)}</Text>
                    {run.summary ? <Text style={styles.entryMeta}>{run.summary}</Text> : null}
                  </View>
                  <View style={[styles.kindBadge, { backgroundColor: tone.background }]}>
                    <Text style={[styles.kindBadgeText, { color: tone.color }]}>{tone.label}</Text>
                  </View>
                </View>
                <View style={styles.entryActionRow}>
                  <Pressable style={styles.ghostButton} onPress={() => togglePinnedRun(run.id)}>
                    <Text style={styles.ghostButtonText}>{pinned ? "Unpin" : "Pin"}</Text>
                  </Pressable>
                  <Pressable style={styles.ghostButton} onPress={() => onOpenRun?.(run)}>
                    <Text style={styles.ghostButtonText}>Open</Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={() => onDeleteRun?.(run.id)}>
                    <Text style={styles.dangerButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal visible={Boolean(selectedDate)} transparent animationType="slide" onRequestClose={closeDayDetails}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedDate ? formatDayLabel(selectedDate) : "Day details"}</Text>
            <Text style={styles.modalSubtitle}>{selectedDayTotal} kcal · {selectedHydrationTotal} ml · {selectedDayEntries.length} logs</Text>

            <View style={styles.addCard}>
              <Text style={styles.addTitle}>Quick add</Text>
              <View style={styles.kindRow}>
                {[
                  ["meal", "Meal"],
                  ["hydration", "Hydration"],
                  ["other", "Other"],
                ].map(([value, label]) => (
                  <Pressable key={value} style={[styles.kindChip, newKind === value && styles.kindChipActive]} onPress={() => setNewKind(value)}>
                    <Text style={[styles.kindChipText, newKind === value && styles.kindChipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.formGrid}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Name</Text>
                  <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Meal or drink" editable={!trackerLoading} placeholderTextColor={palette.muted} />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Context</Text>
                  <TextInput style={styles.input} value={newContext} onChangeText={setNewContext} placeholder="Breakfast, lunch..." editable={!trackerLoading} placeholderTextColor={palette.muted} />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Date</Text>
                  <DateTimePickerField mode="date" style={styles.input} value={newDate} onChange={setNewDate} placeholder="DD/MM/YYYY" editable={!trackerLoading} />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Time</Text>
                  <DateTimePickerField mode="time" style={styles.input} value={newTime} onChange={setNewTime} placeholder="HH:MM" editable={!trackerLoading} />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{newKind === "hydration" ? "Calories (optional)" : "Calories"}</Text>
                  <TextInput
                    style={styles.input}
                    value={newCalories}
                    onChangeText={setNewCalories}
                    placeholder={newKind === "hydration" ? "0" : "420"}
                    keyboardType="numeric"
                    editable={!trackerLoading}
                    placeholderTextColor={palette.muted}
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{newKind === "hydration" ? "Amount (ml)" : "Quantity"}</Text>
                  <TextInput
                    style={styles.input}
                    value={newAmount}
                    onChangeText={setNewAmount}
                    placeholder={newKind === "hydration" ? "350" : "1"}
                    keyboardType="numeric"
                    editable={!trackerLoading}
                    placeholderTextColor={palette.muted}
                  />
                </View>
              </View>
              <Pressable style={[styles.actionButton, trackerLoading && styles.buttonDisabled]} onPress={() => void addEntryForSelectedDay()} disabled={trackerLoading}>
                <Text style={styles.actionButtonText}>{trackerLoading ? "Adding..." : "Add log item"}</Text>
              </Pressable>
            </View>

            <View style={styles.modalHeaderActions}>
              <Pressable style={[styles.dangerButton, actionLoading && styles.buttonDisabled]} onPress={() => void clearSelectedDay()} disabled={actionLoading}>
                <Text style={styles.dangerButtonText}>Clear day</Text>
              </Pressable>
              <Pressable style={styles.ghostButton} onPress={closeDayDetails}>
                <Text style={styles.ghostButtonText}>Close</Text>
              </Pressable>
            </View>

            {dayError ? <Text style={styles.errorText}>{dayError}</Text> : null}
            {trackerError ? <Text style={styles.errorText}>{trackerError}</Text> : null}

            <ScrollView style={styles.entryScroller} nestedScrollEnabled contentContainerStyle={styles.entryScrollerContent}>
              {loading ? <Text style={styles.entryMeta}>Loading entries...</Text> : null}
              {!loading && selectedDayEntries.length === 0 ? <Text style={styles.entryMeta}>No logs for this day.</Text> : null}
              {!loading &&
                selectedDayEntries.map((entry) => {
                  const tone = entryTone(entry.kind);
                  return (
                    <View key={entry.id} style={styles.entryRow}>
                      {editingId === entry.id ? (
                        <View style={styles.editRow}>
                          <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Name" />
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
                          <View style={styles.rowBetween}>
                            <View style={styles.entryMain}>
                              <Text style={styles.entryMeal}>{entry.name || "Log item"}</Text>
                              <Text style={styles.entryMeta}>
                                {(entry.context || tone.label)}
                                {entry.kind === "hydration" ? ` · ${entry.amount || 0} ${entry.unit || "ml"}` : ` · ${entry.calories || 0} kcal`}
                              </Text>
                              <Text style={styles.entryMeta}>{formatDisplayTime(entry.loggedAt || entry.createdAt)}</Text>
                            </View>
                            <View style={[styles.kindBadge, { backgroundColor: tone.background }]}>
                              <Text style={[styles.kindBadgeText, { color: tone.color }]}>{tone.label}</Text>
                            </View>
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
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MiniPill({ label, tone }) {
  const paletteMap = {
    primary: { backgroundColor: palette.primarySoft, color: palette.primary },
    secondary: { backgroundColor: `${palette.secondary}18`, color: palette.secondary },
    warning: { backgroundColor: `${palette.warning}18`, color: palette.warning },
    neutral: { backgroundColor: palette.surfaceSoft, color: palette.ink },
  };
  const colors = paletteMap[tone] || paletteMap.neutral;
  return (
    <View style={[styles.miniPill, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[styles.miniPillText, { color: colors.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 14,
  },
  heroPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    backgroundColor: palette.surface,
    gap: 8,
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    color: palette.primary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 21,
    lineHeight: 28,
    fontFamily: "Poppins_700Bold",
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
  },
  weekNavRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: {
    color: palette.ink,
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
  },
  weekRange: {
    flex: 1,
    textAlign: "center",
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statsCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
  },
  statTitle: {
    color: palette.muted,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  statValue: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
  },
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10,
  },
  listTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  dayCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 12,
    gap: 10,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  dayTextWrap: {
    flex: 1,
  },
  dayRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  dayDate: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
  },
  dayCalories: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
  },
  dayHydration: {
    color: palette.secondary,
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  dayMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  miniPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  miniPillText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    maxHeight: "90%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
  modalSubtitle: {
    color: palette.muted,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  addCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 10,
    gap: 8,
  },
  addTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  kindRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kindChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  kindChipActive: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary,
  },
  kindChipText: {
    color: palette.ink,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  kindChipTextActive: {
    color: palette.primary,
  },
  inlineInputs: {
    flexDirection: "row",
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  formField: {
    width: "48%",
    gap: 4,
  },
  formLabel: {
    color: palette.muted,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  input: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 10,
    fontFamily: "Poppins_400Regular",
  },
  modalHeaderActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  entryScroller: {
    maxHeight: 320,
  },
  entryScrollerContent: {
    gap: 8,
  },
  entryRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 10,
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  entryMain: {
    flex: 1,
    gap: 2,
  },
  entryMeal: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
  },
  entryMeta: {
    color: palette.muted,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  kindBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  kindBadgeText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  entryActionRow: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-end",
  },
  editRow: {
    gap: 8,
  },
  actionButton: {
    borderRadius: 8,
    backgroundColor: palette.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionButtonText: {
    color: palette.surface,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  ghostButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  ghostButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  dangerButton: {
    borderRadius: 8,
    backgroundColor: "#d95a5a",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dangerButtonText: {
    color: palette.surface,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: palette.red,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
});
