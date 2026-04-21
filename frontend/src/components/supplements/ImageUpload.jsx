import React from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { palette } from "../../data";

export default function ImageUpload({
  selectedImageUri,
  selectedImageAspectRatio,
  conditions,
  onChangeConditions,
  goals,
  onChangeGoals,
  loading,
  error,
  showCameraButton = true,
  disableImageOptions = false,
  clearImageSelectionLabel = "Clear image",
  onClearImageSelection,
  onCaptureImage,
  onPickImage,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Upload supplement image</Text>
      <Text style={styles.cardBody}>Pick a product label photo and we will evaluate ingredient fit, risks, and whether it matches your goals.</Text>

      {showCameraButton ? (
        <Pressable style={[styles.cameraButton, (loading || disableImageOptions) && styles.buttonDisabled]} onPress={onCaptureImage} disabled={loading || disableImageOptions}>
          <Text style={styles.cameraButtonText}>Use webcam / camera</Text>
        </Pressable>
      ) : null}

      <Pressable style={[styles.pickButton, (loading || disableImageOptions) && styles.buttonDisabled]} onPress={onPickImage} disabled={loading || disableImageOptions}>
        <Text style={styles.pickButtonText}>{selectedImageUri ? "Replace image" : "Choose image"}</Text>
      </Pressable>

      {selectedImageUri && typeof onClearImageSelection === "function" ? (
        <Pressable style={styles.clearMiniButton} onPress={onClearImageSelection} disabled={loading}>
          <Text style={styles.clearMiniButtonText}>{clearImageSelectionLabel}</Text>
        </Pressable>
      ) : null}

      {selectedImageUri ? <Image source={{ uri: selectedImageUri }} style={[styles.previewImage, { aspectRatio: selectedImageAspectRatio || 1.4 }]} resizeMode="contain" /> : null}

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Medical history</Text>
        <TextInput
          style={styles.input}
          value={conditions}
          onChangeText={onChangeConditions}
          placeholder="NIL"
          placeholderTextColor="#8b8f99"
          editable={!loading}
          multiline
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Goals</Text>
        <TextInput
          style={styles.input}
          value={goals}
          onChangeText={onChangeGoals}
          placeholder="Reduce belly fat, Improve cognitive power"
          placeholderTextColor="#8b8f99"
          editable={!loading}
          multiline
        />
      </View>

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
  pickButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  buttonDisabled: {
    opacity: 0.5
  },
  cameraButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c6e9f1",
    backgroundColor: "#ebf9fc",
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  cameraButtonText: {
    color: "#0f5b69",
    fontWeight: "700"
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
  fieldGroup: {
    gap: 8
  },
  label: {
    color: palette.ink,
    fontWeight: "600",
    fontSize: 13
  },
  input: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top"
  },
  clearMiniButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  clearMiniButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  errorText: {
    color: palette.red,
    fontSize: 13,
    lineHeight: 18
  }
});
