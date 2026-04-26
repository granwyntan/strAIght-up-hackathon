// @ts-nocheck
import React from "react";
import { ActivityIndicator, Image, PanResponder, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";
import { ui } from "../../styles/ui";
import DateTimePickerField from "../shared/DateTimePickerField";

const HUNGER_OPTIONS = [1, 2, 3, 4, 5];

function ToggleRow({ label, body, value, onValueChange, disabled = false }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.formLabel}>{label}</Text>
        {body ? <Text style={styles.toggleBody}>{body}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: palette.border, true: palette.primary }}
        thumbColor={palette.surface}
      />
    </View>
  );
}

function HungerSlider({ value, onChange, disabled = false }) {
  const trackWidthRef = React.useRef(0);
  const numericValue = Math.min(5, Math.max(1, Number(value) || 3));

  const updateFromPosition = React.useCallback(
    (positionX) => {
      if (disabled || trackWidthRef.current <= 0) {
        return;
      }
      const clamped = Math.max(0, Math.min(trackWidthRef.current, positionX));
      const ratio = clamped / trackWidthRef.current;
      const nextValue = Math.min(5, Math.max(1, Math.round(ratio * 4) + 1));
      onChange(String(nextValue));
    },
    [disabled, onChange]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => updateFromPosition(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateFromPosition(event.nativeEvent.locationX),
      }),
    [disabled, updateFromPosition]
  );

  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderTitle}>Hunger level</Text>
        <Text style={styles.sliderValue}>{numericValue}/5</Text>
      </View>
      <Text style={styles.sliderBody}>Slide to describe how hungry you were before this intake.</Text>
      <View
        style={styles.sliderTrackWrap}
        onLayout={(event) => {
          trackWidthRef.current = event.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
      >
        <Pressable style={styles.sliderTrack} onPress={(event) => updateFromPosition(event.nativeEvent.locationX)} disabled={disabled}>
          <View style={[styles.sliderFill, { width: `${((numericValue - 1) / 4) * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${((numericValue - 1) / 4) * 100}%` }]} />
          <View style={styles.sliderTicksRow} pointerEvents="none">
            {HUNGER_OPTIONS.map((option) => (
              <View key={option} style={[styles.sliderTick, option <= numericValue && styles.sliderTickActive]} />
            ))}
          </View>
        </Pressable>
      </View>
      <View style={styles.sliderLabelsRow}>
        <Text style={styles.sliderHintLabel}>1 Light</Text>
        <Text style={styles.sliderHintLabel}>5 Very hungry</Text>
      </View>
      <View style={styles.sliderNumberRow}>
        {HUNGER_OPTIONS.map((option) => (
          <Pressable key={option} style={styles.sliderNumberButton} onPress={() => onChange(String(option))} disabled={disabled}>
            <Text style={[styles.sliderNumberText, numericValue === option && styles.sliderNumberTextActive]}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function CalorieForm({
  values,
  onChange,
  loading,
  error,
  webcamEnabled,
  webcamActive,
  webcamError,
  onCaptureImage,
  onOpenWebcam,
  onCaptureWebcam,
  onCloseWebcam,
  webcamVideoRef,
  selectedImageUri,
  selectedImageAspectRatio,
  onPickImage,
  onSubmit,
  aspectRatio,
  onAspectRatioChange,
  onOpenCrop,
  canSubmit,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.heroHeader}>
        <Text style={styles.heroEyebrow}>Analyse</Text>
        <Text style={styles.heroTitle}>Food and drink intake</Text>
        <Text style={styles.heroBody}>Describe it or scan it.</Text>
      </View>
      <View style={[ui.softCard, styles.autoDetectCard]}>
        <MaterialCommunityIcons name="creation-outline" size={18} color={palette.primary} />
        <View style={styles.autoDetectCopy}>
          <Text style={styles.autoDetectTitle}>Auto-detection for food or drinks</Text>
        </View>
      </View>

      <View style={[ui.softCard, styles.inputBox]}>
        <Text style={styles.inputBoxTitle}>Describe</Text>
        <TextInput
          style={[ui.inputShell, styles.descriptionInput]}
          value={values.mealDescription}
          onChangeText={(value) => onChange("mealDescription", value)}
          placeholder="Describe your food or drink."
          placeholderTextColor={palette.muted}
          multiline
        />
      </View>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.orLine} />
      </View>

      <View style={[ui.softCard, styles.inputBox]}>
        <Text style={styles.inputBoxTitle}>Scan</Text>
        <View style={styles.scanActionRow}>
          <Pressable style={[ui.secondaryButton, styles.scanButton]} onPress={onCaptureImage} disabled={loading}>
            <MaterialCommunityIcons name="camera-outline" size={18} color={palette.primary} />
            <Text style={styles.scanButtonText}>{webcamEnabled ? "Camera" : "Use camera"}</Text>
          </Pressable>
          <Pressable style={[ui.secondaryButton, styles.scanButton]} onPress={onPickImage} disabled={loading}>
            <MaterialCommunityIcons name="image-outline" size={18} color={palette.primary} />
            <Text style={styles.scanButtonText}>{selectedImageUri ? "Replace image" : "Upload image"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[ui.softCard, styles.profileCard]}>
        <Text style={styles.label}>Intake details</Text>
        <HungerSlider value={values.hungerLevel || "3"} onChange={(nextValue) => onChange("hungerLevel", nextValue)} disabled={loading} />
        <View style={[ui.surfaceCard, styles.timingPanel]}>
          <View style={styles.timingHeader}>
            <Text style={styles.timingTitle}>Date and time</Text>
            <Text style={styles.timingBody}>These start at now. Change them with the date-time picker only if this intake happened at a different time.</Text>
          </View>
          <View style={styles.formGrid}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Date</Text>
              <DateTimePickerField mode="date" style={styles.optionInput} value={values.mealDate || ""} onChange={(value) => onChange("mealDate", value)} placeholder="DD/MM/YYYY" editable={!loading} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Time</Text>
              <DateTimePickerField mode="time" style={styles.optionInput} value={values.mealTime || ""} onChange={(value) => onChange("mealTime", value)} placeholder="HH:MM:SS" editable={!loading} />
            </View>
          </View>
        </View>
        <View style={styles.toggleStack}>
          <ToggleRow
            label="Auto-save to log"
            body="On by default. Turn off if you do not want the finished analysis added automatically."
            value={(values.addToLogs || "").toLowerCase() === "yes"}
            onValueChange={(nextValue) => onChange("addToLogs", nextValue ? "yes" : "no")}
            disabled={loading}
          />
          <ToggleRow
            label="Load from profile"
            body="On by default. Turn off if you want analysis without your saved profile context."
            value={(values.includeProfile || "").toLowerCase() === "yes"}
            onValueChange={(nextValue) => onChange("includeProfile", nextValue ? "yes" : "no")}
            disabled={loading}
          />
        </View>
      </View>

      {webcamEnabled ? (
        <View style={[ui.softCard, styles.webcamPanel]}>
          <Text style={styles.label}>Camera</Text>
          {webcamActive ? (
            <>
              <video ref={webcamVideoRef} autoPlay playsInline muted style={StyleSheet.flatten(styles.webcamVideo)} />
              <View style={styles.webcamButtons}>
                <Pressable style={[ui.primaryButton, styles.webcamPrimaryButton]} onPress={onCaptureWebcam} disabled={loading}>
                  <Text style={styles.webcamPrimaryText}>Capture</Text>
                </Pressable>
                <Pressable style={[ui.secondaryButton, styles.webcamSecondaryButton]} onPress={onCloseWebcam} disabled={loading}>
                  <Text style={styles.webcamSecondaryText}>Close</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable style={[ui.primaryButton, styles.webcamPrimaryButton]} onPress={onOpenWebcam} disabled={loading}>
              <Text style={styles.webcamPrimaryText}>Open webcam</Text>
            </Pressable>
          )}
          {webcamError ? <Text style={styles.errorText}>{webcamError}</Text> : null}
        </View>
      ) : null}

      {selectedImageUri ? (
        <>
          <Image source={{ uri: selectedImageUri }} style={[styles.previewImage, { aspectRatio: selectedImageAspectRatio || 1.4 }]} resizeMode="contain" />
          <View style={styles.cropRow}>
            {["1:1", "4:3", "3:4", "16:9"].map((ratio) => (
              <Pressable key={ratio} style={[styles.aspectChip, aspectRatio === ratio && styles.aspectChipActive]} onPress={() => onAspectRatioChange(ratio)}>
                <Text style={[styles.aspectChipText, aspectRatio === ratio && styles.aspectChipTextActive]}>{ratio}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.cropAction} onPress={onOpenCrop}>
              <MaterialCommunityIcons name="crop" size={16} color={palette.primary} />
              <Text style={styles.cropActionText}>Adjust crop</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <Pressable style={[ui.primaryButton, styles.submitButton, (loading || !canSubmit) && styles.submitButtonDisabled]} onPress={onSubmit} disabled={loading || !canSubmit}>
        {loading ? (
          <ActivityIndicator color={palette.surface} size="small" />
        ) : (
          <View style={styles.submitButtonInner}>
            <MaterialCommunityIcons name="food-apple" size={18} color={palette.surface} />
            <Text style={styles.submitButtonText}>Analyse intake</Text>
          </View>
        )}
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 22,
    gap: 16,
  },
  heroHeader: {
    gap: 8,
  },
  heroEyebrow: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  heroBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
  },
  autoDetectCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  autoDetectCopy: {
    flex: 1,
    gap: 2,
  },
  autoDetectTitle: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  autoDetectBody: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  inputBox: {
    padding: 16,
    gap: 12,
  },
  inputBoxTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
  descriptionInput: {
    minHeight: 80,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    textAlignVertical: "top",
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.border,
  },
  orText: {
    color: palette.muted,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  scanActionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scanButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  profileCard: {
    padding: 16,
    gap: 14,
  },
  label: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  sliderBlock: {
    gap: 10,
  },
  sliderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sliderTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
  sliderValue: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  sliderBody: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  sliderTrackWrap: {
    paddingVertical: 6,
  },
  sliderTrack: {
    position: "relative",
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    justifyContent: "center",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  sliderThumb: {
    position: "absolute",
    top: "50%",
    width: 24,
    height: 24,
    marginTop: -12,
    marginLeft: -12,
    borderRadius: 999,
    backgroundColor: palette.surface,
    borderWidth: 3,
    borderColor: palette.primary,
  },
  sliderTicksRow: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sliderTick: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sliderTickActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  sliderLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  sliderHintLabel: {
    color: palette.muted,
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
  },
  sliderNumberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  sliderNumberButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 2,
  },
  sliderNumberText: {
    color: palette.muted,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  sliderNumberTextActive: {
    color: palette.primary,
  },
  timingPanel: {
    padding: 14,
    gap: 12,
  },
  timingHeader: {
    gap: 4,
  },
  timingTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
  timingBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  formField: {
    width: "48%",
    gap: 6,
  },
  formLabel: {
    color: palette.muted,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  optionInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    color: palette.ink,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  toggleStack: {
    gap: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleCopy: {
    flex: 1,
    gap: 3,
  },
  toggleBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  webcamPanel: {
    padding: 12,
    gap: 10,
  },
  webcamVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#000",
  },
  webcamButtons: {
    flexDirection: "row",
    gap: 8,
  },
  webcamPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  webcamSecondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  webcamPrimaryText: {
    color: palette.surface,
    fontFamily: "Poppins_600SemiBold",
  },
  webcamSecondaryText: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
  },
  previewImage: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    maxHeight: 280,
  },
  cropRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  aspectChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  aspectChipActive: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary,
  },
  aspectChipText: {
    color: palette.ink,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  aspectChipTextActive: {
    color: palette.primary,
  },
  cropAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.primarySoft,
  },
  cropActionText: {
    color: palette.primary,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  submitButton: {
    borderRadius: 16,
    backgroundColor: palette.primary,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: palette.surface,
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
  errorText: {
    color: palette.danger,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
  },
});
