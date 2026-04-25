// @ts-nocheck
import React, { useMemo, useState } from "react";
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
          <Text style={[styles.triggerText, !displayValue && styles.placeholderText]}>{displayValue || placeholder}</Text>
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
                <Text style={styles.subtitle}>
                  {displayValue || (mode === "date" ? "No date selected yet" : "No time selected yet")}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>Done</Text>
              </Pressable>
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
                    }}
                  >
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
                    <Text style={[styles.optionValue, selected && styles.optionValueSelected]}>{option.value}</Text>
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
  triggerText: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
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
    maxHeight: "70%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 12,
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
    borderRadius: 18,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  optionRowSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
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
