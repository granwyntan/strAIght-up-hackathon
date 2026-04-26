// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";
import { formatDisplayDate, formatDisplayTime, maskDisplayDateInput, maskDisplayTimeInput, parseDisplayDate, parseDisplayTime } from "../../utils/dateTime";
import { ui } from "../../styles/ui";

function formatNativeValue(mode, value) {
  if (mode === "date") {
    const iso = parseDisplayDate(value);
    return iso ? new Date(`${iso}T00:00:00`) : new Date();
  }
  const isoTime = parseDisplayTime(value);
  return isoTime ? new Date(`1970-01-01T${isoTime}`) : new Date();
}

function toDisplayValue(mode, value) {
  if (!value) {
    return "";
  }
  return mode === "date" ? formatDisplayDate(value) : formatDisplayTime(value);
}

function normalizeSelectedValue(mode, value) {
  const next = new Date(value);
  if (mode === "date") {
    next.setHours(0, 0, 0, 0);
    return next;
  }
  next.setSeconds(0, 0);
  return next;
}

function maskWebValue(mode, value) {
  return mode === "date" ? maskDisplayDateInput(value) : maskDisplayTimeInput(value);
}

export default function DateTimePickerField({ mode, value, onChange, placeholder, style, editable = true }) {
  const [open, setOpen] = useState(false);
  const nativeValue = useMemo(() => formatNativeValue(mode, value || ""), [mode, value]);
  const modeLabel = mode === "date" ? "Date" : "Time";
  const effectivePlaceholder = placeholder || (mode === "date" ? "DD/MM/YYYY" : "HH:MM:SS");
  const webValue = useMemo(() => maskWebValue(mode, value || ""), [mode, value]);
  const expectedLength = mode === "date" ? 10 : 8;
  const parsedValue = mode === "date" ? parseDisplayDate(webValue) : parseDisplayTime(webValue);
  const invalidCompleteValue = Boolean(webValue) && webValue.length === expectedLength && !parsedValue;

  const commitValue = (selected) => {
    if (!selected) {
      return;
    }
    onChange(toDisplayValue(mode, normalizeSelectedValue(mode, selected)));
  };

  const openPicker = () => {
    if (!editable) {
      return;
    }
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: nativeValue,
        mode,
        is24Hour: true,
        display: mode === "date" ? "calendar" : "clock",
        onChange: (event, selected) => {
          if (event?.type !== "set" || !selected) {
            return;
          }
          commitValue(selected);
        },
      });
      return;
    }
    setOpen((current) => !current);
  };

  if (Platform.OS === "web") {
    return (
      <View style={styles.wrapper}>
        <View style={[style, styles.webShell, invalidCompleteValue && styles.webShellInvalid, !editable && styles.disabled]}>
          <View style={styles.triggerRow}>
            <View style={styles.triggerCopy}>
              <View style={styles.triggerIconWrap}>
                <MaterialCommunityIcons name={mode === "date" ? "calendar-month-outline" : "clock-time-four-outline"} size={18} color={palette.primary} />
              </View>
              <View style={styles.triggerTextWrap}>
                <Text style={styles.triggerMeta}>{modeLabel}</Text>
                <TextInput
                  style={styles.webInput}
                  value={webValue}
                  onChangeText={(nextValue) => onChange(maskWebValue(mode, nextValue))}
                  placeholder={effectivePlaceholder}
                  placeholderTextColor={palette.muted}
                  editable={editable}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={expectedLength}
                />
              </View>
            </View>
            <View style={styles.webMetaWrap}>
              <Text style={styles.webFormatHint}>{mode === "date" ? "DD/MM/YYYY" : "HH:MM:SS"}</Text>
            </View>
          </View>
        </View>
        <View style={styles.webActionRow}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => onChange(mode === "date" ? formatDisplayDate(new Date()) : formatDisplayTime(new Date()))}
            disabled={!editable}
          >
            <Text style={ui.secondaryButtonText}>{mode === "date" ? "Today" : "Now"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => onChange("")} disabled={!editable}>
            <Text style={ui.secondaryButtonText}>Clear</Text>
          </Pressable>
        </View>
        {invalidCompleteValue ? (
          <Text style={styles.validationText}>
            {mode === "date" ? "Enter a valid calendar date." : "Enter a valid 24-hour time."}
          </Text>
        ) : null}
      </View>
    );
  }

  const showInlinePicker = Platform.OS === "ios" && open;

  return (
    <View style={styles.wrapper}>
      <Pressable style={[style, styles.trigger, !editable && styles.disabled]} onPress={openPicker}>
        <View style={styles.triggerRow}>
          <View style={styles.triggerCopy}>
            <View style={styles.triggerIconWrap}>
              <MaterialCommunityIcons name={mode === "date" ? "calendar-month-outline" : "clock-time-four-outline"} size={18} color={palette.primary} />
            </View>
            <View style={styles.triggerTextWrap}>
              <Text style={styles.triggerMeta}>{modeLabel}</Text>
              <Text style={[styles.triggerValue, !value && styles.placeholderText]}>{value || effectivePlaceholder}</Text>
            </View>
          </View>
          <MaterialCommunityIcons name={showInlinePicker ? "chevron-up" : "chevron-down"} size={20} color={palette.primary} />
        </View>
      </Pressable>

      {showInlinePicker ? (
        <View style={styles.inlinePanel}>
          <DateTimePicker
            value={nativeValue}
            mode={mode}
            display={mode === "date" ? "inline" : "spinner"}
            minuteInterval={mode === "time" ? 5 : undefined}
            is24Hour
            onChange={(_, selected) => commitValue(selected)}
          />
          <View style={styles.actionRow}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <Text style={ui.secondaryButtonText}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => commitValue(new Date())}
            >
              <Text style={ui.secondaryButtonText}>{mode === "date" ? "Today" : "Now"}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => setOpen(false)}>
              <Text style={ui.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = {
  wrapper: {
    gap: 10,
  },
  trigger: {
    justifyContent: "center",
  },
  webShell: {
    justifyContent: "center",
    paddingRight: 12,
  },
  webShellInvalid: {
    borderColor: palette.danger,
    backgroundColor: "#FFF9F8",
  },
  triggerRow: {
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
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  triggerTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  triggerMeta: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    textTransform: "uppercase",
  },
  triggerValue: {
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    flexShrink: 1,
  },
  placeholderText: {
    color: palette.muted,
  },
  disabled: {
    opacity: 0.6,
  },
  webInput: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    minHeight: 30,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  webMetaWrap: {
    borderRadius: 999,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: palette.border,
    flexShrink: 0,
  },
  webFormatHint: {
    color: palette.muted,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  webActionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  validationText: {
    color: palette.danger,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    lineHeight: 18,
  },
  inlinePanel: {
    ...ui.softCard,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    ...ui.primaryButton,
    flex: 1,
  },
  secondaryButton: {
    ...ui.secondaryButton,
    minWidth: 84,
  },
} as const;
