import React from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";

import { palette } from "../../data";

type ImageUploadProps = {
  selectedImageUri: string;
  selectedImageAspectRatio: number;
  conditions: string;
  onChangeConditions: (value: string) => void;
  goals: string;
  onChangeGoals: (value: string) => void;
  loading: boolean;
  error: string;
  showCameraButton?: boolean;
  disableImageOptions?: boolean;
  onClearImageSelection?: () => void;
  clearImageSelectionLabel?: string;
  analyzeLabel?: string;
  onCaptureImage: () => void;
  onPickImage: () => void;
  onAnalyze: () => void;
};

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
  onClearImageSelection,
  clearImageSelectionLabel = "Clear image",
  analyzeLabel = "Analyze supplement",
  onCaptureImage,
  onPickImage,
  onAnalyze,
}: ImageUploadProps) {
  return (
    <View className="gap-3 rounded-[28px] border border-line bg-card p-5 shadow-panel">
      <Text className="font-['Poppins_700Bold'] text-base text-ink">Upload supplement image</Text>
      <Text className="font-['Poppins_400Regular'] leading-6 text-muted">
        Pick a product label photo and GramWIN will review ingredient fit, likely benefits, cautions, and whether the product matches your goals.
      </Text>

      {showCameraButton ? (
        <Pressable className={`items-center rounded-2xl border border-line px-4 py-3 ${disableImageOptions ? "bg-soft/60 opacity-50" : "bg-soft"}`} onPress={onCaptureImage} disabled={loading || disableImageOptions}>
          <Text className="font-['Poppins_600SemiBold'] text-sage">Use webcam / camera</Text>
        </Pressable>
      ) : null}

      <Pressable className={`items-center rounded-2xl border border-line px-4 py-3 ${disableImageOptions ? "bg-soft/60 opacity-50" : "bg-soft"}`} onPress={onPickImage} disabled={loading || disableImageOptions}>
        <Text className="font-['Poppins_600SemiBold'] text-sage">{selectedImageUri ? "Replace image" : "Choose image"}</Text>
      </Pressable>

      {selectedImageUri ? (
        <View className="gap-2">
          <Image
            source={{ uri: selectedImageUri }}
            className="w-full rounded-2xl border border-line bg-soft"
            style={{ aspectRatio: selectedImageAspectRatio || 1.4, maxHeight: 260 }}
            resizeMode="contain"
          />
          {onClearImageSelection ? (
            <Pressable className="self-start rounded-full border border-line bg-soft px-3 py-2" onPress={onClearImageSelection} disabled={loading}>
              <Text className="font-['Poppins_600SemiBold'] text-sage">{clearImageSelectionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="font-['Poppins_600SemiBold'] text-[13px] text-ink">Medical history</Text>
        <TextInput
          className="min-h-[58px] rounded-2xl border border-line bg-card px-3 py-3 font-['Poppins_400Regular'] leading-6 text-ink"
          value={conditions}
          onChangeText={onChangeConditions}
          placeholder="Example: NIL, seasonal allergies, eczema, high blood pressure"
          placeholderTextColor="#8B8F99"
          editable={!loading}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View className="gap-2">
        <Text className="font-['Poppins_600SemiBold'] text-[13px] text-ink">Goals</Text>
        <TextInput
          className="min-h-[58px] rounded-2xl border border-line bg-card px-3 py-3 font-['Poppins_400Regular'] leading-6 text-ink"
          value={goals}
          onChangeText={onChangeGoals}
          placeholder="Example: better sleep, energy, gym recovery, focus, or general wellness"
          placeholderTextColor="#8B8F99"
          editable={!loading}
          multiline
          textAlignVertical="top"
        />
      </View>

      <Pressable
        className={`mt-1 items-center rounded-2xl px-4 py-3 ${loading || !selectedImageUri ? "bg-sage/50" : "bg-sage"}`}
        onPress={onAnalyze}
        disabled={loading || !selectedImageUri}
      >
        {loading ? <ActivityIndicator color={palette.surface} size="small" /> : <Text className="font-['Poppins_600SemiBold'] text-card">{analyzeLabel}</Text>}
      </Pressable>

      {error ? <Text className="font-['Poppins_400Regular'] text-[13px] leading-5 text-danger">{error}</Text> : null}
    </View>
  );
}
