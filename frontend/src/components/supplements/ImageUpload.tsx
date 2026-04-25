import React from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";

type ImageUploadProps = {
  selectedImageUri: string;
  selectedImageAspectRatio: number;
  aspectRatio: string;
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
  showActionButtons?: boolean;
  showAnalyzeButton?: boolean;
  onAspectRatioChange: (value: string) => void;
  onOpenCrop: () => void;
  onCaptureImage: () => void;
  onPickImage: () => void;
  onAnalyze: () => void;
};

export default function ImageUpload({
  selectedImageUri,
  selectedImageAspectRatio,
  aspectRatio,
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
  showActionButtons = true,
  showAnalyzeButton = true,
  onAspectRatioChange,
  onOpenCrop,
  onCaptureImage,
  onPickImage,
  onAnalyze,
}: ImageUploadProps) {
  return (
    <View className="gap-3 rounded-[22px] border border-line bg-card p-5 shadow-panel">
      {showActionButtons && showCameraButton ? (
        <Pressable className={`flex-row items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 ${disableImageOptions ? "bg-soft/60 opacity-50" : "bg-soft"}`} onPress={onCaptureImage} disabled={loading || disableImageOptions}>
          <MaterialCommunityIcons name="camera-outline" size={18} color={palette.primary} />
          <Text className="font-['Poppins_600SemiBold'] text-sage">Use camera</Text>
        </Pressable>
      ) : null}

      {showActionButtons ? (
        <Pressable className={`flex-row items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3 ${disableImageOptions ? "bg-soft/60 opacity-50" : "bg-soft"}`} onPress={onPickImage} disabled={loading || disableImageOptions}>
          <MaterialCommunityIcons name="image-outline" size={18} color={palette.primary} />
          <Text className="font-['Poppins_600SemiBold'] text-sage">{selectedImageUri ? "Replace image" : "Upload image"}</Text>
        </Pressable>
      ) : null}

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
          <View className="flex-row flex-wrap items-center gap-2">
            {["1:1", "4:3", "3:4", "16:9"].map((ratio) => (
              <Pressable
                key={ratio}
                className={`rounded-full border px-3 py-2 ${aspectRatio === ratio ? "border-sage bg-moss" : "border-line bg-soft"}`}
                onPress={() => onAspectRatioChange(ratio)}
                disabled={loading}
              >
                <Text className={`font-['Poppins_600SemiBold'] text-xs ${aspectRatio === ratio ? "text-sage" : "text-ink"}`}>{ratio}</Text>
              </Pressable>
            ))}
            <Pressable className="flex-row items-center gap-1 rounded-full bg-moss px-3 py-2" onPress={onOpenCrop} disabled={loading}>
              <Text className="font-['Poppins_600SemiBold'] text-xs text-sage">Adjust crop</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showAnalyzeButton ? (
        <Pressable
          className={`mt-1 items-center rounded-2xl px-4 py-3 ${loading || !selectedImageUri ? "bg-sage/50" : "bg-sage"}`}
          onPress={onAnalyze}
          disabled={loading || !selectedImageUri}
        >
          {loading ? <ActivityIndicator color={palette.surface} size="small" /> : <Text className="font-['Poppins_600SemiBold'] text-card">{analyzeLabel}</Text>}
        </Pressable>
      ) : null}

      {error ? <Text className="font-['Poppins_400Regular'] text-[13px] leading-5 text-danger">{error}</Text> : null}
    </View>
  );
}
