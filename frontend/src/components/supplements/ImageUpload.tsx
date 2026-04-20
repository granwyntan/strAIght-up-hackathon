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
  onCaptureImage,
  onPickImage,
  onAnalyze,
}: ImageUploadProps) {
  return (
    <View className="gap-3 rounded-[28px] border border-line bg-card p-5 shadow-panel">
      <Text className="font-['Poppins_700Bold'] text-base text-ink">Upload supplement image</Text>
      <Text className="font-['Poppins_400Regular'] leading-6 text-muted">
        Pick a product label photo and we will evaluate ingredient fit, risks, and whether it matches your goals.
      </Text>

      {showCameraButton ? (
        <Pressable className="items-center rounded-2xl border border-moss bg-moss/50 px-4 py-3" onPress={onCaptureImage} disabled={loading}>
          <Text className="font-['Poppins_600SemiBold'] text-sage">Use webcam / camera</Text>
        </Pressable>
      ) : null}

      <Pressable className="items-center rounded-2xl border border-line bg-soft px-4 py-3" onPress={onPickImage} disabled={loading}>
        <Text className="font-['Poppins_600SemiBold'] text-sage">{selectedImageUri ? "Replace image" : "Choose image"}</Text>
      </Pressable>

      {selectedImageUri ? (
        <Image
          source={{ uri: selectedImageUri }}
          className="w-full rounded-2xl border border-line bg-soft"
          style={{ aspectRatio: selectedImageAspectRatio || 1.4, maxHeight: 260 }}
          resizeMode="contain"
        />
      ) : null}

      <View className="gap-2">
        <Text className="font-['Poppins_600SemiBold'] text-[13px] text-ink">Medical history</Text>
        <TextInput
          className="min-h-[58px] rounded-2xl border border-line bg-card px-3 py-3 font-['Poppins_400Regular'] leading-6 text-ink"
          value={conditions}
          onChangeText={onChangeConditions}
          placeholder="NIL"
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
          placeholder="Reduce belly fat, improve cognitive power"
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
        {loading ? <ActivityIndicator color={palette.surface} size="small" /> : <Text className="font-['Poppins_600SemiBold'] text-card">Analyze supplement</Text>}
      </Pressable>

      {error ? <Text className="font-['Poppins_400Regular'] text-[13px] leading-5 text-danger">{error}</Text> : null}
    </View>
  );
}
