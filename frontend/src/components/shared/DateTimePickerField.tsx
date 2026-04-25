// @ts-nocheck
import React, { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { palette } from "../../data";
import { formatDisplayDate, formatDisplayTime, formatInputDate, formatInputTime, parseDisplayDate, parseDisplayTime } from "../../utils/dateTime";

function buildDateOptions(currentValue) {
  const isoValue = parseDisplayDate(currentValue) || parseDisplayDate(formatDisplayDate(new Date())) || "";
  const base = isoValue ? new Date(`${isoValue}T00:00:00`) : new Date();
  return Array.from({ length: 61 }, (_, index) => {
    const offset = index - 30;
    const next = new Date(base);
    next.setDate(base.getDate() + offset);
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    return {
      key: iso,
      value: formatDisplayDate(`${iso}T00:00:00`),
      label: next.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }),
    };
  });
}

function buildTimeOptions() {
  return Array.from({ length: 96 }, (_, index) => {
    const hours = String(Math.floor(index / 4)).padStart(2, "0");
    const minutes = String((index % 4) * 15).padStart(2, "0");
    const iso = `${hours}:${minutes}:00`;
    return {
      key: iso,
      value: formatDisplayTime(`1970-01-01T${iso}`),
      label: `${hours}:${minutes}`,
    };
  });
}

function findNearestIndex(options, displayValue) {
  const index = options.findIndex((option) => option.value === displayValue);
  return index >= 0 ? index : Math.max(0, Math.floor(options.length / 2));
}

function buildQuickActions(mode) {
  const now = new Date();
  if (mode === "date") {
    const makeDate = (offset, label) => {
      const next = new Date(now);
      next.setDate(next.getDate() + offset);
      const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      return { label, value: formatDisplayDate(`${iso}T00:00:00`) };
    };
    return [makeDate(0, "Today"), makeDate(1, "Tomorrow"), makeDate(-1, "Yesterday")];
  }

  const makeTime = (hours, minutes, label) => ({
    label,
    value: formatDisplayTime(`1970-01-01T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`),
  });
  return [makeTime(now.getHours(), Math.floor(now.getMinutes() / 15) * 15, "Now"), makeTime(8, 0, "Morning"), makeTime(19, 0, "Evening")];
}

export default function DateTimePickerField({
  mode,
  value,
  onChange,
  placeholder,
  style,
  editable = true,
}) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => (mode === "date" ? buildDateOptions(value) : buildTimeOptions()), [mode, value]);
  const quickActions = useMemo(() => buildQuickActions(mode), [mode]);
  const displayValue = value || "";
  const selectedIndex = useMemo(() => findNearestIndex(options, displayValue), [options, displayValue]);
  const previewOptions = useMemo(() => {
    const start = Math.max(0, selectedIndex - 2);
    return options.slice(start, Math.min(options.length, start + 5));
  }, [options, selectedIndex]);

  if (Platform.OS === "web") {
    return (
      <TextInput
        style={style}
        value={mode === "date" ? formatInputDate(displayValue) : formatInputTime(displayValue)}
        onChangeText={(nextValue) =>
          onChange(
            mode === "date"
              ? nextValue
                ? formatDisplayDate(nextValue)
                : ""
              : nextValue
                ? formatDisplayTime(`1970-01-01T${nextValue}:00`)
                : ""
          )
        }
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        editable={editable}
        type={mode}
      />
    );
  }

  return (
    <>
      <Pressable style={[style, styles.trigger, !editable && styles.disabled]} onPress={() => editable && setOpen(true)}>
        <View style={styles.triggerInner}>
          <View style={styles.triggerCopy}>
            <View style={styles.triggerIconWrap}>
              <MaterialCommunityIcons name={mode === "date" ? "calendar-month-outline" : "clock-time-four-outline"} size={18} color={palette.primary} />
            </View>
            <Text style={[styles.triggerText, !displayValue && styles.placeholderText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {displayValue || placeholder}
            </Text>
          </View>
          <View style={styles.triggerMeta}>
            <Text style={styles.triggerMetaText}>{mode === "date" ? "Date" : "Time"}</Text>
          </View>
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{mode === "date" ? "Calendar" : "Clock"}</Text>
                <Text style={styles.title}>{mode === "date" ? "Choose date" : "Choose time"}</Text>
                <Text style={styles.subtitle}>{displayValue || (mode === "date" ? "No date selected yet" : "No time selected yet")}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>Done</Text>
              </Pressable>
            </View>
            <View style={styles.selectedCard}>
              <Text style={styles.selectedLabel}>{mode === "date" ? "Selected date" : "Selected time"}</Text>
              <Text style={styles.selectedValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {displayValue || (mode === "date" ? "Pick a date" : "Pick a time")}
              </Text>
            </View>
            <View style={styles.quickActionRow}>
              {quickActions.map((action) => {
                const active = action.value === displayValue;
                return (
                  <Pressable
                    key={`${mode}-${action.label}`}
                    style={[styles.quickAction, active && styles.quickActionActive]}
                    onPress={() => {
                      onChange(action.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.quickActionText, active && styles.quickActionTextActive]}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.previewWheel}>
              {previewOptions.map((option) => {
                const selected = option.value === displayValue;
                return (
                  <View key={`preview-${option.key}`} style={[styles.previewRow, selected && styles.previewRowSelected]}>
                    <Text style={[styles.previewLabel, selected && styles.previewLabelSelected]}>{option.label}</Text>
                    <Text style={[styles.previewValue, selected && styles.previewValueSelected]}>{option.value}</Text>
                  </View>
                );
              })}
            </View>
            <ScrollView contentContainerStyle={styles.optionStack} showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const selected = option.value === displayValue;
                return (
                  <Pressable
                    key={option.key}
                    style={[styles.optionRow, selected && styles.optionRowSelected]}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
                      <Text style={[styles.optionValue, selected && styles.optionValueSelected]}>{option.value}</Text>
                    </View>
                    <MaterialCommunityIcons name={selected ? "check-circle" : "chevron-right"} size={18} color={selected ? palette.primary : palette.muted} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    justifyContent: "center",
  },
  triggerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  triggerCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  triggerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  triggerText: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    flexShrink: 1,
  },
  triggerMeta: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  triggerMetaText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  placeholderText: {
    color: palette.muted,
  },
  disabled: {
    opacity: 0.6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 14,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: palette.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  subtitle: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  selectedCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#F7FBF8",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  selectedLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedValue: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    lineHeight: 26,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickAction: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  quickActionText: {
    color: palette.muted,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  quickActionTextActive: {
    color: palette.primary,
  },
  closeButton: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  previewWheel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  previewRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    opacity: 0.45,
  },
  previewRowSelected: {
    backgroundColor: palette.primarySoft,
    opacity: 1,
  },
  previewLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  previewLabelSelected: {
    color: palette.primary,
  },
  previewValue: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  previewValueSelected: {
    color: palette.primary,
  },
  optionStack: {
    gap: 8,
    paddingBottom: 6,
  },
  optionRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionRowSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  optionCopy: {
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  optionLabelSelected: {
    color: palette.primary,
  },
  optionValue: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  optionValueSelected: {
    color: palette.primary,
  },
});
