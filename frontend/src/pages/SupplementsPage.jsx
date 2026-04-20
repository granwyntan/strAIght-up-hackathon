import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { palette } from "../data";
import ImageUpload from "../components/supplements/ImageUpload";
import AnalysisResult from "../components/supplements/AnalysisResult";

const DEFAULT_CONDITIONS = "NIL";
const DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power";

async function readApiError(response, fallback) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
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

export default function SupplementsPage({ requestApi }) {
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const canCallApi = useMemo(() => typeof requestApi === "function", [requestApi]);
  const selectedImageAspectRatio = selectedAsset?.width && selectedAsset?.height ? selectedAsset.width / selectedAsset.height : 1.4;
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);

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
      quality: 0.95
    });
    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    setSelectedAsset(pickerResult.assets[0]);
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
      quality: 0.95
    });
    if (cameraResult.canceled || !cameraResult.assets?.length) {
      return;
    }

    setSelectedAsset(cameraResult.assets[0]);
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

    const blob = await new Promise((resolve) => {
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
      height
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
        formData.append("photo", {
          uri: selectedAsset.uri,
          name: selectedAsset.fileName || "supplement.jpg",
          type: selectedAsset.mimeType || "image/jpeg"
        });
      }

      formData.append("conditions", conditions || DEFAULT_CONDITIONS);
      formData.append("goals", goals || DEFAULT_GOALS);

      const response = await requestApi("/api/supplements/analyze", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Supplement analysis failed."));
      }

      const payload = await response.json();
      setResult(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to analyze the supplement right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Text style={styles.chip}>Supplement scanner</Text>
        <Text style={styles.heroTitle}>Medicine and supplement analyzer</Text>
        <Text style={styles.heroSubtitle}>Upload a supplement label to review key ingredients, expected benefits, contraindications, and goal fit in one guided report.</Text>
      </View>

      {Platform.OS === "web" ? (
        <View style={styles.webcamPanel}>
          <Text style={styles.webcamTitle}>Webcam capture</Text>
          <Text style={styles.webcamBody}>Use your browser webcam for instant supplement scanning.</Text>
          {webcamActive ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted style={StyleSheet.flatten(styles.webcamVideo)} />
              <View style={styles.webcamButtonRow}>
                <Pressable style={styles.webcamButton} onPress={captureWebcamFrame}>
                  <Text style={styles.webcamButtonText}>Capture frame</Text>
                </Pressable>
                <Pressable style={styles.webcamSecondaryButton} onPress={closeWebcam}>
                  <Text style={styles.webcamSecondaryButtonText}>Close webcam</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable style={styles.webcamButton} onPress={captureImage}>
              <Text style={styles.webcamButtonText}>Open webcam</Text>
            </Pressable>
          )}
          {webcamError ? <Text style={styles.webcamError}>{webcamError}</Text> : null}
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
  pageStack: {
    gap: 16
  },
  heroPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    backgroundColor: palette.surface,
    gap: 8
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#e6f7fd",
    color: "#0f5b69",
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "700"
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "700"
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21
  },
  webcamPanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10
  },
  webcamTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  webcamBody: {
    color: palette.muted,
    lineHeight: 20
  },
  webcamVideo: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#000"
  },
  webcamButtonRow: {
    flexDirection: "row",
    gap: 10
  },
  webcamButton: {
    borderRadius: 12,
    backgroundColor: "#0f5b69",
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  webcamButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  webcamSecondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  webcamSecondaryButtonText: {
    color: palette.ink,
    fontWeight: "600"
  },
  webcamError: {
    color: palette.red,
    fontSize: 13
  }
});
