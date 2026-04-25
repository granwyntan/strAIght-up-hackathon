// @ts-nocheck
import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";

const TYPE_OPTIONS = ["Auto", "Food", "Drink", "Food and Drink"];
const BOOLEAN_OPTIONS = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];
const HUNGER_OPTIONS = ["1", "2", "3", "4", "5"];

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
  onOpenCrop
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
          placeholder="Describe your meal or drink..."
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
          <Text style={styles.formLabel}>Hunger out of 5</Text>
          <View style={styles.optionChipRow}>
            {HUNGER_OPTIONS.map((option) => {
              const selected = `${values.hungerLevel || ""}` === option;
              return (
                <Pressable key={option} style={[styles.optionChip, styles.optionChipTight, selected && styles.optionChipActive]} onPress={() => onChange("hungerLevel", option)}>
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.formGrid}>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Date</Text>
            <TextInput
              style={styles.optionInput}
              value={values.mealDate || ""}
              onChangeText={(value) => onChange("mealDate", value)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muted}
            />
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Time</Text>
            <TextInput
              style={styles.optionInput}
              value={values.mealTime || ""}
              onChangeText={(value) => onChange("mealTime", value)}
              placeholder="HH:MM"
              placeholderTextColor={palette.muted}
            />
          </View>
        </View>
        <View style={styles.formGrid}>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Add to logs</Text>
            <View style={styles.inlineBooleanRow}>
              {BOOLEAN_OPTIONS.map((option) => {
                const selected = (values.addToLogs || "").toLowerCase() === option.value;
                return (
                  <Pressable key={option.value} style={[styles.optionChip, styles.optionChipHalf, selected && styles.optionChipActive]} onPress={() => onChange("addToLogs", option.value)}>
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Load from profile</Text>
            <View style={styles.inlineBooleanRow}>
              {BOOLEAN_OPTIONS.map((option) => {
                const selected = (values.includeProfile || "").toLowerCase() === option.value;
                return (
                  <Pressable key={option.value} style={[styles.optionChip, styles.optionChipHalf, selected && styles.optionChipActive]} onPress={() => onChange("includeProfile", option.value)}>
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <Text style={styles.hintText}>Goal fit and profile context are loaded automatically from your saved profile unless you switch profile off.</Text>
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

      <Pressable style={[styles.submitButton, (loading || !selectedImageUri) && styles.submitButtonDisabled]} onPress={onSubmit} disabled={loading || !selectedImageUri}>
        {loading ? <ActivityIndicator color={palette.surface} size="small" /> : <Text style={styles.submitButtonText}>Analyse diet</Text>}
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
  inlineBooleanRow: {
    flexDirection: "row",
    gap: 8,
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
