import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { palette } from "../data";
import ImageUpload from "../components/supplements/ImageUpload";
import AnalysisResult from "../components/supplements/AnalysisResult";
import { loadProfile } from "../storage/profileStorage";
import {
  addSupplementHistoryEntry,
  clearSupplementHistory,
  loadSupplementHistory,
  removeSupplementHistoryEntry
} from "../storage/supplementSearchStorage";

const DEFAULT_CONDITIONS = "NIL";
const DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power";

function composeConditionsFromProfile(profile) {
  const lines = [];
  if (profile.medicalConditions.trim()) {
    lines.push(`Medical conditions: ${profile.medicalConditions.trim()}`);
  }
  if (profile.medicalHistory.trim()) {
    lines.push(`Medical history: ${profile.medicalHistory.trim()}`);
  }
  if (profile.medicationsOrSupplements.trim()) {
    lines.push(`Current medications/supplements: ${profile.medicationsOrSupplements.trim()}`);
  }
  return lines.join("\n");
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSubPage, setActiveSubPage] = useState("analyzer");
  const [searchHistory, setSearchHistory] = useState([]);
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
  const trimmedSearchQuery = searchQuery.trim();
  const hasImageInput = Boolean(selectedAsset) || webcamActive;
  const hasSearchInput = Boolean(trimmedSearchQuery);
  const selectedMode = hasSearchInput ? "search" : hasImageInput ? "image" : "none";
  const imageOptionsDisabled = selectedMode === "search";
  const searchOptionsDisabled = selectedMode === "image";

  const hydrateHistory = async () => {
    try {
      const entries = await loadSupplementHistory();
      setSearchHistory(entries);
    } catch (storageError) {
      console.warn("Unable to load supplement history", storageError);
    }
  };

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

  useEffect(() => {
    let mounted = true;
    const hydrateFromProfile = async () => {
      try {
        const profile = await loadProfile();
        if (!mounted) {
          return;
        }
        const profileConditions = composeConditionsFromProfile(profile);
        if (profileConditions) {
          setConditions(profileConditions);
        }
        if (profile.goals.trim()) {
          setGoals(profile.goals.trim());
        }
      } catch (error) {
        console.warn("Unable to prefill supplement inputs from profile", error);
      }
    };
    void hydrateFromProfile();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void hydrateHistory();
  }, []);

  const pickImage = async () => {
    if (imageOptionsDisabled) {
      return;
    }
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
    if (imageOptionsDisabled) {
      return;
    }
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

  const clearImageSelection = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    closeWebcam();
    setSelectedAsset(null);
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
      const queryLabel =
        (selectedAsset?.fileName && selectedAsset.fileName.trim()) ||
        (selectedAsset?.uri ? "Uploaded supplement image" : "Supplement image");
      const updatedHistory = await addSupplementHistoryEntry({
        id: `image-${Date.now()}`,
        query: queryLabel,
        mode: "image",
        searchedAt: new Date().toISOString()
      });
      setSearchHistory(updatedHistory);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to analyze the supplement right now.");
    } finally {
      setLoading(false);
    }
  };

  const searchSupplementByName = async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setError("Please enter a supplement name to search.");
      return;
    }
    if (searchOptionsDisabled) {
      return;
    }
    if (!canCallApi) {
      setError("Supplements API is not configured in this screen.");
      return;
    }

    setLoading(true);
    setError("");
    setSelectedAsset(null);
    setWebcamActive(false);

    try {
      const response = await requestApi("/api/supplements/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplementName: trimmedQuery,
          conditions: conditions || DEFAULT_CONDITIONS,
          goals: goals || DEFAULT_GOALS
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Supplement search failed."));
      }
      const payload = await response.json();
      setResult(payload);
      const updatedHistory = await addSupplementHistoryEntry({
        id: `text-${Date.now()}`,
        query: trimmedQuery,
        mode: "text",
        searchedAt: new Date().toISOString()
      });
      setSearchHistory(updatedHistory);
      if (activeSubPage !== "analyzer") {
        setActiveSubPage("analyzer");
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to search supplement right now.");
    } finally {
      setLoading(false);
    }
  };

  const clearOneHistoryItem = async (entryId) => {
    const updated = await removeSupplementHistoryEntry(entryId);
    setSearchHistory(updated);
  };

  const clearAllHistoryItems = async () => {
    const updated = await clearSupplementHistory();
    setSearchHistory(updated);
  };

  const clearSearchInput = () => {
    setSearchQuery("");
  };

  const formatDateTime = (isoValue) => {
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) {
      return isoValue;
    }
    return date.toLocaleString();
  };

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Text style={styles.chip}>Supplement scanner</Text>
        <Text style={styles.heroTitle}>Medicine and supplement analyzer</Text>
        <Text style={styles.heroSubtitle}>Upload a supplement label to review key ingredients, expected benefits, contraindications, and goal fit in one guided report.</Text>
      </View>

      <View style={styles.segmentRow}>
        <Pressable style={[styles.segmentButton, activeSubPage === "analyzer" && styles.segmentButtonSelected]} onPress={() => setActiveSubPage("analyzer")}>
          <Text style={[styles.segmentText, activeSubPage === "analyzer" && styles.segmentTextSelected]}>Analyzer</Text>
        </Pressable>
        <Pressable style={[styles.segmentButton, activeSubPage === "history" && styles.segmentButtonSelected]} onPress={() => setActiveSubPage("history")}>
          <Text style={[styles.segmentText, activeSubPage === "history" && styles.segmentTextSelected]}>History</Text>
        </Pressable>
      </View>

      {activeSubPage === "analyzer" ? (
        <>
          <View style={styles.searchCard}>
            <Text style={styles.searchTitle}>Search supplement by name</Text>
            <TextInput
              style={[styles.searchInput, searchOptionsDisabled && styles.searchInputDisabled]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="e.g. magnesium glycinate"
              editable={!loading && !searchOptionsDisabled}
              returnKeyType="search"
              onSubmitEditing={() => void searchSupplementByName()}
            />
            {hasSearchInput ? (
              <Pressable style={styles.clearMiniButton} onPress={clearSearchInput} disabled={loading}>
                <Text style={styles.clearMiniButtonText}>Clear search</Text>
              </Pressable>
            ) : null}
          </View>

          {Platform.OS === "web" ? (
            <View style={styles.webcamPanel}>
              <Text style={styles.webcamTitle}>Webcam capture</Text>
              <Text style={styles.webcamBody}>Use your browser webcam for instant supplement scanning.</Text>
              {webcamActive ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted style={StyleSheet.flatten(styles.webcamVideo)} />
                  <View style={styles.webcamButtonRow}>
                    <Pressable style={styles.webcamButton} onPress={captureWebcamFrame} disabled={loading}>
                      <Text style={styles.webcamButtonText}>Capture frame</Text>
                    </Pressable>
                    <Pressable style={styles.webcamSecondaryButton} onPress={closeWebcam} disabled={loading}>
                      <Text style={styles.webcamSecondaryButtonText}>Close webcam</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable style={[styles.webcamButton, imageOptionsDisabled && styles.webcamButtonDisabled]} onPress={captureImage} disabled={loading || imageOptionsDisabled}>
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
            disableImageOptions={imageOptionsDisabled}
            onClearImageSelection={clearImageSelection}
            clearImageSelectionLabel="Clear image"
            onCaptureImage={captureImage}
            onPickImage={pickImage}
          />

          <Pressable
            style={[styles.searchButton, (loading || selectedMode === "none") && styles.searchButtonDisabled]}
            onPress={() => void (selectedMode === "search" ? searchSupplementByName() : analyzeSupplement())}
            disabled={loading || selectedMode === "none"}
          >
            <Text style={styles.searchButtonText}>
              {loading ? "Analyzing..." : selectedMode === "search" ? "Search and analyze supplement" : "Analyze supplement"}
            </Text>
          </Pressable>

          <AnalysisResult result={result} selectedImageUri={selectedAsset?.uri || ""} selectedImageAspectRatio={selectedImageAspectRatio} />
        </>
      ) : (
        <View style={styles.historyCard}>
          <View style={styles.historyHeaderRow}>
            <Text style={styles.historyTitle}>Recent supplement searches</Text>
            <Pressable style={styles.clearAllButton} onPress={() => void clearAllHistoryItems()}>
              <Text style={styles.clearAllButtonText}>Clear all</Text>
            </Pressable>
          </View>
          {searchHistory.length === 0 ? <Text style={styles.emptyHistoryText}>No searches yet.</Text> : null}
          {searchHistory.map((entry) => (
            <View key={entry.id} style={styles.historyItem}>
              <View style={styles.historyTextWrap}>
                <Text style={styles.historyQuery}>{entry.query || "Unknown supplement"}</Text>
                <Text style={styles.historyMeta}>
                  {entry.mode === "image" ? "Image scan" : "Text search"} · {formatDateTime(entry.searchedAt)}
                </Text>
              </View>
              <Pressable style={styles.clearOneButton} onPress={() => void clearOneHistoryItem(entry.id)}>
                <Text style={styles.clearOneButtonText}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
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
  segmentRow: {
    flexDirection: "row",
    gap: 10
  },
  segmentButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  segmentButtonSelected: {
    borderColor: palette.blue,
    backgroundColor: "#e8effb"
  },
  segmentText: {
    color: palette.ink,
    fontWeight: "600"
  },
  segmentTextSelected: {
    color: palette.blue
  },
  searchCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10
  },
  searchTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 15
  },
  searchInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdf9",
    paddingHorizontal: 12,
    color: palette.ink
  },
  searchInputDisabled: {
    opacity: 0.5
  },
  searchButton: {
    borderRadius: 12,
    backgroundColor: palette.blue,
    paddingVertical: 11,
    alignItems: "center"
  },
  searchButtonDisabled: {
    opacity: 0.55
  },
  searchButtonText: {
    color: "#ffffff",
    fontWeight: "700"
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
  webcamButtonDisabled: {
    opacity: 0.5
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
  },
  historyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10
  },
  historyHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  historyTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  clearAllButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  clearAllButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  emptyHistoryText: {
    color: palette.muted,
    fontSize: 13
  },
  historyItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#faf7f1",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  historyTextWrap: {
    flex: 1,
    gap: 3
  },
  historyQuery: {
    color: palette.ink,
    fontWeight: "700"
  },
  historyMeta: {
    color: palette.muted,
    fontSize: 12
  },
  clearOneButton: {
    borderRadius: 10,
    backgroundColor: "#d95a5a",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  clearOneButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  }
});
