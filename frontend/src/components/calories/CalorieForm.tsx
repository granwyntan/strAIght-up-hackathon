// @ts-nocheck
import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";
import DateTimePickerField from "../shared/DateTimePickerField";

const TYPE_OPTIONS = ["Auto", "Food", "Drink", "Food and Drink"];
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

export default function CalorieForm({
  values,
  onChange,
  bmiCategory,
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
  canSubmit
}) {
  return (
    <View style={styles.card}>
      <View style={styles.heroHeader}>
        <Text style={styles.heroEyebrow}>Analyse</Text>
        <Text style={styles.heroTitle}>Food and drink intake</Text>
      </View>

      <View style={styles.inputBox}>
        <Text style={styles.inputBoxTitle}>Describe</Text>
        <TextInput
          style={styles.descriptionInput}
          value={values.mealDescription}
          onChangeText={(value) => onChange("mealDescription", value)}
          placeholder="Describe your meal or drink."
          placeholderTextColor={palette.muted}
          multiline
        />
      </View>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.orLine} />
      </View>

      <View style={styles.inputBox}>
        <Text style={styles.inputBoxTitle}>Scan</Text>
        {webcamEnabled ? (
          <View style={styles.scanActionRow}>
            <Pressable style={styles.scanButton} onPress={onCaptureImage} disabled={loading}>
              <MaterialCommunityIcons name="camera-outline" size={18} color={palette.primary} />
              <Text style={styles.scanButtonText}>Camera</Text>
            </Pressable>
            <Pressable style={styles.scanButton} onPress={onPickImage} disabled={loading}>
              <MaterialCommunityIcons name="image-outline" size={18} color={palette.primary} />
              <Text style={styles.scanButtonText}>{selectedImageUri ? "Replace image" : "Upload image"}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.scanActionRow}>
            <Pressable style={styles.scanButton} onPress={onCaptureImage} disabled={loading}>
              <MaterialCommunityIcons name="camera-outline" size={18} color={palette.primary} />
              <Text style={styles.scanButtonText}>Use camera</Text>
            </Pressable>
            <Pressable style={styles.scanButton} onPress={onPickImage} disabled={loading}>
              <MaterialCommunityIcons name="image-outline" size={18} color={palette.primary} />
              <Text style={styles.scanButtonText}>{selectedImageUri ? "Replace image" : "Upload image"}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.profileCard}>
        <Text style={styles.label}>Options</Text>
        <View style={styles.optionSection}>
          <Text style={styles.formLabel}>Type</Text>
          <View style={styles.optionChipRow}>
            {TYPE_OPTIONS.map((option) => {
              const optionValue = option.toLowerCase();
              const selected = (values.mealType || "").toLowerCase() === optionValue;
              return (
                <Pressable key={option} style={[styles.optionChip, selected && styles.optionChipActive]} onPress={() => onChange("mealType", optionValue)}>
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.optionSection}>
          <Text style={styles.formLabel}>Hunger Level</Text>
          <View style={styles.scaleRow}>
            {HUNGER_OPTIONS.map((option) => {
              const selected = `${values.hungerLevel || ""}` === String(option);
              return (
                <Pressable key={option} style={styles.scaleStep} onPress={() => onChange("hungerLevel", String(option))}>
                  <View style={[styles.scaleDot, selected && styles.scaleDotActive]} />
                  <Text style={[styles.scaleLabel, selected && styles.scaleLabelActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.formGrid}>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Date</Text>
            <DateTimePickerField mode="date" style={styles.optionInput} value={values.mealDate || ""} onChange={(value) => onChange("mealDate", value)} placeholder="DD/MM/YYYY" editable={!loading} />
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Time</Text>
            <DateTimePickerField mode="time" style={styles.optionInput} value={values.mealTime || ""} onChange={(value) => onChange("mealTime", value)} placeholder="HH:MM" editable={!loading} />
          </View>
        </View>
        <View style={styles.toggleStack}>
          <ToggleRow
            label="Auto-save to log"
            body="Save the finished analysis to your food log right after the scan."
            value={(values.addToLogs || "").toLowerCase() === "yes"}
            onValueChange={(nextValue) => onChange("addToLogs", nextValue ? "yes" : "no")}
            disabled={loading}
          />
          <ToggleRow
            label="Load from profile"
            body="Use your saved conditions, goals, and diet context during analysis."
            value={(values.includeProfile || "").toLowerCase() === "yes"}
            onValueChange={(nextValue) => onChange("includeProfile", nextValue ? "yes" : "no")}
            disabled={loading}
          />
        </View>
        <Text style={styles.hintText}>Goal fit and profile context are loaded automatically from your saved profile unless you switch profile off. If your note includes "add to log", the finished result will also auto-save.</Text>
      </View>

      {webcamEnabled ? (
        <View style={styles.webcamPanel}>
          <Text style={styles.label}>Camera</Text>
          {webcamActive ? (
            <>
              <video ref={webcamVideoRef} autoPlay playsInline muted style={StyleSheet.flatten(styles.webcamVideo)} />
              <View style={styles.webcamButtons}>
                <Pressable style={styles.webcamPrimaryButton} onPress={onCaptureWebcam} disabled={loading}>
                  <Text style={styles.webcamPrimaryText}>Capture</Text>
                </Pressable>
                <Pressable style={styles.webcamSecondaryButton} onPress={onCloseWebcam} disabled={loading}>
                  <Text style={styles.webcamSecondaryText}>Close</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable style={styles.webcamPrimaryButton} onPress={onOpenWebcam} disabled={loading}>
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

      <Pressable style={[styles.submitButton, (loading || !canSubmit) && styles.submitButtonDisabled]} onPress={onSubmit} disabled={loading || !canSubmit}>
        {loading ? (
          <ActivityIndicator color={palette.surface} size="small" />
        ) : (
          <View style={styles.submitButtonInner}>
            <MaterialCommunityIcons name="magnify-scan" size={18} color={palette.surface} />
            <Text style={styles.submitButtonText}>Analyse food</Text>
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
    padding: 18,
    gap: 12
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
    gap: 10
  },
  heroHeader: {
    gap: 4
  },
  inputBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 14,
    gap: 10
  },
  inputBoxTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 16
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.border
  },
  orText: {
    color: palette.muted,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12
  },
  scanActionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
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
    paddingVertical: 12
  },
  scanButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold"
  },
  heroEyebrow: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 18
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
    textAlignVertical: "top"
  },
  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 12,
    gap: 10
  },
  label: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  optionSection: {
    gap: 6,
  },
  optionChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scaleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  scaleStep: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  scaleDot: {
    width: "100%",
    minHeight: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  scaleDotActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  scaleLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  scaleLabelActive: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
  },
  inlineBooleanRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggleStack: {
    gap: 10,
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
  formField: {
    width: "48%",
    gap: 4
  },
  formLabel: {
    color: palette.muted,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold"
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
    fontSize: 14
  },
  optionChip: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  optionChipTight: {
    minWidth: 52,
    alignItems: "center",
  },
  optionChipHalf: {
    flex: 1,
    alignItems: "center",
  },
  optionChipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  optionChipText: {
    color: palette.ink,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  optionChipTextActive: {
    color: palette.primary,
  },
  hintText: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular"
  },
  pickButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  pickButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold"
  },
  webcamPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 10,
    gap: 8
  },
  webcamVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#000"
  },
  webcamButtons: {
    flexDirection: "row",
    gap: 8
  },
  webcamPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11
  },
  webcamSecondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11
  },
  webcamPrimaryText: {
    color: palette.surface,
    fontFamily: "Poppins_600SemiBold"
  },
  webcamSecondaryText: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold"
  },
  previewImage: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    maxHeight: 280
  },
  cropRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center"
  },
  aspectChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  aspectChipActive: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary
  },
  aspectChipText: {
    color: palette.ink,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold"
  },
  aspectChipTextActive: {
    color: palette.primary
  },
  cropAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.primarySoft
  },
  cropActionText: {
    color: palette.primary,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold"
  },
  submitButton: {
    borderRadius: 16,
    backgroundColor: palette.primary,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center"
  },
  submitButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5
  },
  submitButtonText: {
    color: palette.surface,
    fontFamily: "Poppins_700Bold",
    fontSize: 15
  },
  errorText: {
    color: palette.danger,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20
  }
});
