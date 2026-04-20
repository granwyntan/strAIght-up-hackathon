import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import ImageUpload from "../components/supplements/ImageUpload";
import AnalysisResult from "../components/supplements/AnalysisResult";
import type { PickedSupplementAsset, RequestApi, SupplementAnalysisResult } from "../types/supplements";

const DEFAULT_CONDITIONS = "NIL";
const DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power";

type SupplementsPageProps = {
  requestApi: RequestApi;
};

async function readApiError(response: Response, fallback: string) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { detail?: unknown };
      const detail = typeof payload?.detail === "string" ? payload.detail.trim() : "";
      if (detail) {
        return detail;
      }
    }
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export default function SupplementsPage({ requestApi }: SupplementsPageProps) {
  const [selectedAsset, setSelectedAsset] = useState<PickedSupplementAsset | null>(null);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [result, setResult] = useState<SupplementAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const canCallApi = useMemo(() => typeof requestApi === "function", [requestApi]);
  const selectedImageAspectRatio = selectedAsset?.width && selectedAsset?.height ? selectedAsset.width / selectedAsset.height : 1.4;
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && webcamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [webcamActive]);

  const pickImage = async () => {
    setError("");

    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Media library access is required to pick an image.");
        return;
      }
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.95,
    });
    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    const asset = pickerResult.assets[0];
    setSelectedAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setResult(null);
  };

  const captureImage = async () => {
    setError("");
    setWebcamError("");

    if (Platform.OS === "web") {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setWebcamError("Webcam is not available in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        setWebcamActive(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }, 0);
      } catch {
        setWebcamError("Could not access webcam. Please allow camera permission.");
      }
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera access is required to take a photo.");
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.95,
    });
    if (cameraResult.canceled || !cameraResult.assets?.length) {
      return;
    }

    const asset = cameraResult.assets[0];
    setSelectedAsset({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setResult(null);
  };

  const closeWebcam = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setWebcamActive(false);
  };

  const captureWebcamFrame = async () => {
    if (Platform.OS !== "web" || !videoRef.current) {
      return;
    }
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setWebcamError("Unable to capture webcam frame.");
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), "image/jpeg", 0.95);
    });
    if (!blob) {
      setWebcamError("Unable to capture webcam image.");
      return;
    }
    const filename = `webcam-${Date.now()}.jpg`;
    const file = new File([blob], filename, { type: "image/jpeg" });

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = URL.createObjectURL(blob);
    setSelectedAsset({
      uri: objectUrlRef.current,
      file,
      fileName: filename,
      mimeType: "image/jpeg",
      width,
      height,
    });
    setResult(null);
    closeWebcam();
  };

  const analyzeSupplement = async () => {
    if (!canCallApi) {
      setError("Supplements API is not configured in this screen.");
      return;
    }
    if (!selectedAsset) {
      setError("Please select an image before analysis.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      if (Platform.OS === "web" && selectedAsset.file) {
        formData.append("photo", selectedAsset.file);
      } else {
        formData.append(
          "photo",
          {
            uri: selectedAsset.uri,
            name: selectedAsset.fileName || "supplement.jpg",
            type: selectedAsset.mimeType || "image/jpeg",
          } as never
        );
      }

      formData.append("conditions", conditions || DEFAULT_CONDITIONS);
      formData.append("goals", goals || DEFAULT_GOALS);

      const response = await requestApi("/api/supplements/analyze", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Supplement analysis failed."));
      }

      const payload = (await response.json()) as SupplementAnalysisResult;
      setResult(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to analyze the supplement right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="gap-4">
      <View className="gap-2.5 rounded-[28px] border border-line bg-card p-6 shadow-panel">
        <Text className="self-start rounded-full bg-moss px-3 py-1.5 font-['Poppins_600SemiBold'] text-xs text-sage">Supplement scanner</Text>
        <Text className="font-['Poppins_700Bold'] text-[23px] leading-8 text-ink">Medicine and supplement analyzer</Text>
        <Text className="font-['Poppins_400Regular'] text-[14px] leading-6 text-muted">
          Upload a supplement label to review key ingredients, expected benefits, contraindications, and goal fit in one guided report.
        </Text>
      </View>

      {Platform.OS === "web" ? (
        <View className="gap-2.5 rounded-3xl border border-line bg-card p-4 shadow-panel">
          <Text className="font-['Poppins_700Bold'] text-base text-ink">Webcam capture</Text>
          <Text className="font-['Poppins_400Regular'] leading-5 text-muted">Use your browser webcam for instant supplement scanning.</Text>
          {webcamActive ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted style={styles.webcamVideo} />
              <View className="flex-row gap-2.5">
                <Pressable className="items-center rounded-2xl bg-sage px-4 py-3" onPress={captureWebcamFrame}>
                  <Text className="font-['Poppins_600SemiBold'] text-card">Capture frame</Text>
                </Pressable>
                <Pressable className="items-center rounded-2xl border border-line bg-soft px-4 py-3" onPress={closeWebcam}>
                  <Text className="font-['Poppins_600SemiBold'] text-ink">Close webcam</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable className="items-center rounded-2xl bg-sage px-4 py-3" onPress={captureImage}>
              <Text className="font-['Poppins_600SemiBold'] text-card">Open webcam</Text>
            </Pressable>
          )}
          {webcamError ? <Text className="font-['Poppins_400Regular'] text-[13px] text-danger">{webcamError}</Text> : null}
        </View>
      ) : null}

      <ImageUpload
        selectedImageUri={selectedAsset?.uri || ""}
        selectedImageAspectRatio={selectedImageAspectRatio}
        conditions={conditions}
        onChangeConditions={setConditions}
        goals={goals}
        onChangeGoals={setGoals}
        loading={loading}
        error={error}
        showCameraButton={Platform.OS !== "web"}
        onCaptureImage={captureImage}
        onPickImage={pickImage}
        onAnalyze={analyzeSupplement}
      />

      <AnalysisResult result={result} selectedImageUri={selectedAsset?.uri || ""} selectedImageAspectRatio={selectedImageAspectRatio} />
    </View>
  );
}

const styles = StyleSheet.create({
  webcamVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D5E1D0",
    backgroundColor: "#000",
  },
});
