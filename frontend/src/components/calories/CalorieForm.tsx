// @ts-nocheck
import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { palette } from "../../data";

const activityOptions = [
  { label: "Sedentary", value: "sedentary" },
  { label: "Light", value: "light" },
  { label: "Moderate", value: "moderate" },
  { label: "Active", value: "active" },
  { label: "Very active", value: "very_active" }
];

const sexOptions = [
  { label: "Female", value: "female" },
  { label: "Male", value: "male" }
];

export default function CalorieForm({
  values,
  onChange,
  bmiCategory,
  loading,
  error,
  webcamEnabled,
  webcamActive,
  webcamError,
  onOpenWebcam,
  onCaptureWebcam,
  onCloseWebcam,
  webcamVideoRef,
  selectedImageUri,
  selectedImageAspectRatio,
  onPickImage,
  onSubmit
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Calorie calculator inputs</Text>
      <Text style={styles.cardBody}>Add profile inputs and meal image to generate an estimated calorie breakdown with practical daily intake context.</Text>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={values.age}
            onChangeText={(value) => onChange("age", value)}
            placeholder="25"
            keyboardType="numeric"
            editable={!loading}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>BMI</Text>
          <View style={styles.readOnlyValue}>
            <Text style={styles.readOnlyValueText}>{values.bmi || "--"}</Text>
            <Text style={styles.readOnlyHint}>Auto-calculated</Text>
          </View>
        </View>
      </View>
      <Text style={styles.hintText}>BMI Category: {bmiCategory}</Text>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Weight (kg)</Text>
          <TextInput
            style={styles.input}
            value={values.weightKg}
            onChangeText={(value) => onChange("weightKg", value)}
            placeholder="65"
            keyboardType="decimal-pad"
            editable={!loading}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Height (cm)</Text>
          <TextInput
            style={styles.input}
            value={values.heightCm}
            onChangeText={(value) => onChange("heightCm", value)}
            placeholder="170"
            keyboardType="decimal-pad"
            editable={!loading}
          />
        </View>
      </View>

      <Text style={styles.label}>Sex</Text>
      <View style={styles.segmentRow}>
        {sexOptions.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.segmentButton, values.sex === option.value && styles.segmentButtonSelected]}
            onPress={() => onChange("sex", option.value)}
            disabled={loading}
          >
            <Text style={[styles.segmentButtonText, values.sex === option.value && styles.segmentButtonTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Activity level</Text>
      <View style={styles.segmentRow}>
        {activityOptions.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.segmentButton, values.activityLevel === option.value && styles.segmentButtonSelected]}
            onPress={() => onChange("activityLevel", option.value)}
            disabled={loading}
          >
            <Text style={[styles.segmentButtonText, values.activityLevel === option.value && styles.segmentButtonTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
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

      <Pressable style={styles.pickButton} onPress={onPickImage} disabled={loading}>
        <Text style={styles.pickButtonText}>{selectedImageUri ? "Replace meal image" : "Choose meal image"}</Text>
      </Pressable>

      {selectedImageUri ? <Image source={{ uri: selectedImageUri }} style={[styles.previewImage, { aspectRatio: selectedImageAspectRatio || 1.4 }]} resizeMode="contain" /> : null}

      <Pressable style={[styles.submitButton, (loading || !selectedImageUri) && styles.submitButtonDisabled]} onPress={onSubmit} disabled={loading || !selectedImageUri}>
        {loading ? <ActivityIndicator color={palette.surface} size="small" /> : <Text style={styles.submitButtonText}>Calculate calories</Text>}
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 12
  },
  cardTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  cardBody: {
    color: palette.muted,
    lineHeight: 20
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  half: {
    flex: 1,
    gap: 8
  },
  label: {
    color: palette.ink,
    fontWeight: "600",
    fontSize: 13
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  hintText: {
    color: palette.muted,
    fontSize: 12
  },
  readOnlyValue: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center"
  },
  readOnlyValueText: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  readOnlyHint: {
    color: palette.muted,
    fontSize: 11
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  segmentButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: palette.surfaceSoft
  },
  segmentButtonSelected: {
    borderColor: palette.blue,
    backgroundColor: "#e8effb"
  },
  segmentButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "600"
  },
  segmentButtonTextSelected: {
    color: palette.blue
  },
  pickButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  webcamPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 10,
    gap: 8
  },
  webcamVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#000"
  },
  webcamButtons: {
    flexDirection: "row",
    gap: 8
  },
  webcamPrimaryButton: {
    borderRadius: 10,
    backgroundColor: palette.blue,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  webcamPrimaryText: {
    color: palette.surface,
    fontWeight: "700",
    fontSize: 12
  },
  webcamSecondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  webcamSecondaryText: {
    color: palette.ink,
    fontWeight: "600",
    fontSize: 12
  },
  pickButtonText: {
    color: palette.blue,
    fontWeight: "700"
  },
  previewImage: {
    width: "100%",
    maxHeight: 260,
    borderRadius: 14,
    backgroundColor: "#f8f4ee",
    borderWidth: 1,
    borderColor: palette.border
  },
  submitButton: {
    borderRadius: 12,
    backgroundColor: palette.blue,
    paddingVertical: 12,
    alignItems: "center"
  },
  submitButtonDisabled: {
    opacity: 0.55
  },
  submitButtonText: {
    color: palette.surface,
    fontWeight: "700"
  },
  errorText: {
    color: palette.red,
    fontSize: 13,
    lineHeight: 18
  }
});
