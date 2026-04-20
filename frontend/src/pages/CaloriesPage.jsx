import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { palette } from "../data";
import CalorieForm from "../components/calories/CalorieForm";
import CalorieResult from "../components/calories/CalorieResult";
import CalorieHistoryPage from "./CalorieHistoryPage";

const DEFAULT_VALUES = {
  age: "25",
  bmi: "22.0",
  weightKg: "",
  heightCm: "",
  activityLevel: "moderate",
  sex: "female"
};

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

export default function CaloriesPage({ requestApi }) {
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSubPage, setActiveSubPage] = useState("calculator");
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [trackerMealName, setTrackerMealName] = useState("");
  const [trackerCalories, setTrackerCalories] = useState("");
  const [trackerError, setTrackerError] = useState("");
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [entryActionLoading, setEntryActionLoading] = useState(false);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [historyPayload, setHistoryPayload] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [suggestedMealName, setSuggestedMealName] = useState("");
  const [suggestedCalories, setSuggestedCalories] = useState("");
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);

  const selectedImageAspectRatio = selectedAsset?.width && selectedAsset?.height ? selectedAsset.width / selectedAsset.height : 1.4;
  const canUseWebcam = Platform.OS === "web";
  const bmiCategory = useMemo(() => {
    const bmi = Number(values.bmi);
    if (!Number.isFinite(bmi) || bmi <= 0) {
      return "Unknown";
    }
    if (bmi < 18.5) {
      return "Underweight";
    }
    if (bmi < 25) {
      return "Normal";
    }
    if (bmi < 30) {
      return "Overweight";
    }
    return "Obese";
  }, [values.bmi]);

  const onChange = (key, value) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  useEffect(() => {
    const weight = Number(values.weightKg);
    const heightCm = Number(values.heightCm);
    if (!Number.isFinite(weight) || !Number.isFinite(heightCm) || weight <= 0 || heightCm <= 0) {
      return;
    }
    const heightMeters = heightCm / 100;
    const computedBmi = weight / (heightMeters * heightMeters);
    const nextBmi = computedBmi.toFixed(1);
    if (nextBmi !== values.bmi) {
      setValues((previous) => ({ ...previous, bmi: nextBmi }));
    }
  }, [values.weightKg, values.heightCm, values.bmi]);

  useEffect(() => {
    if (Platform.OS === "web" && webcamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [webcamActive]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function weekStartIso(anchorDate) {
    const normalized = new Date(anchorDate);
    const jsDay = normalized.getDay();
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    normalized.setDate(normalized.getDate() + mondayOffset);
    return normalized.toISOString().slice(0, 10);
  }

  async function loadHistory(anchorDate = weekAnchor) {
    if (typeof requestApi !== "function") {
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await requestApi(`/api/calories/tracker?weekStart=${weekStartIso(anchorDate)}`);
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to load calorie history."));
      }
      const payload = await response.json();
      setHistoryPayload(payload);
    } catch (loadError) {
      setTrackerError(loadError instanceof Error ? loadError.message : "Unable to load calorie history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (activeSubPage === "history") {
      void loadHistory(weekAnchor);
    }
  }, [activeSubPage, weekAnchor]);

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

  const openWebcam = async () => {
    setWebcamError("");
    if (!canUseWebcam) {
      return;
    }
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

  const captureWebcam = async () => {
    if (!videoRef.current) {
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
    const filename = `meal-webcam-${Date.now()}.jpg`;
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

  function inferCaloriesFromResult(nextResult) {
    const raw = typeof nextResult?.analysisText === "string" ? nextResult.analysisText : "";
    const directMatch = raw.match(/Total Estimated Calories[:\s]*([0-9]{2,5})/i);
    if (directMatch) {
      return directMatch[1];
    }
    const allMatches = [...raw.matchAll(/([0-9]{2,5})\s*kcal/gi)];
    if (allMatches.length > 0) {
      return allMatches[allMatches.length - 1][1];
    }
    return "";
  }

  function inferFoodNameFromResult(nextResult) {
    const sections = Array.isArray(nextResult?.sections) ? nextResult.sections : [];
    const summarySection = sections.find((section) => /meal summary/i.test(section.heading || ""));
    const raw = (summarySection?.content || nextResult?.analysisText || "").split("\n").find((line) => line.trim());
    if (!raw) {
      return "Meal";
    }
    const clean = raw
      .replace(/^[-*]\s*/, "")
      .replace(/^Meal Summary[:\s-]*/i, "")
      .replace(/^Dish[:\s-]*/i, "")
      .trim();
    return clean.slice(0, 80) || "Meal";
  }

  const submit = async () => {
    if (!selectedAsset) {
      setError("Please select a meal image before calculation.");
      return;
    }
    if (typeof requestApi !== "function") {
      setError("Calories API is not configured in this screen.");
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
          name: selectedAsset.fileName || "meal.jpg",
          type: selectedAsset.mimeType || "image/jpeg"
        });
      }

      formData.append("age", values.age);
      formData.append("bmi", values.bmi);
      formData.append("weightKg", values.weightKg);
      formData.append("heightCm", values.heightCm);
      formData.append("activityLevel", values.activityLevel);
      formData.append("sex", values.sex);

      const response = await requestApi("/api/calories/calculate", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Calorie calculation failed."));
      }

      const payload = await response.json();
      setResult(payload);
      const inferred = inferCaloriesFromResult(payload);
      const inferredMealName = inferFoodNameFromResult(payload);
      if (inferred && !trackerCalories) {
        setTrackerCalories(inferred);
      }
      if (inferred) {
        setSuggestedMealName(inferredMealName);
        setSuggestedCalories(inferred);
        setConfirmVisible(true);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to calculate calories right now.");
    } finally {
      setLoading(false);
    }
  };

  const addToDailyTracker = async () => {
    return addTrackerEntry({
      mealName: trackerMealName,
      calories: trackerCalories,
      setFields: true,
      switchToHistory: true
    });
  };

  const addTrackerEntry = async ({ mealName, calories, setFields, switchToHistory }) => {
    if (typeof requestApi !== "function") {
      setTrackerError("Calories API is not configured in this screen.");
      return;
    }
    const parsedCalories = Number(calories);
    if (!Number.isFinite(parsedCalories) || parsedCalories <= 0) {
      setTrackerError("Enter valid calories before adding to tracker.");
      return;
    }

    setTrackerLoading(true);
    setTrackerError("");
    try {
      const response = await requestApi("/api/calories/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealName: mealName || "",
          calories: Math.round(parsedCalories),
          date: new Date().toISOString().slice(0, 10)
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to add calorie tracker entry."));
      }
      const payload = await response.json();
      setHistoryPayload(payload.week);
      if (setFields) {
        setTrackerMealName("");
        setTrackerCalories("");
      }
      if (switchToHistory && activeSubPage !== "history") {
        setActiveSubPage("history");
      }
    } catch (submitError) {
      setTrackerError(submitError instanceof Error ? submitError.message : "Unable to add entry.");
    } finally {
      setTrackerLoading(false);
    }
  };

  const confirmAddSuggested = async () => {
    await addTrackerEntry({
      mealName: suggestedMealName,
      calories: suggestedCalories,
      setFields: false,
      switchToHistory: false
    });
    setConfirmVisible(false);
  };

  const editTrackerEntry = async (entryId, updates) => {
    if (typeof requestApi !== "function") {
      return;
    }
    setEntryActionLoading(true);
    try {
      const response = await requestApi(`/api/calories/entry/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealName: updates.mealName || "",
          calories: Math.round(Number(updates.calories))
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to update entry."));
      }
      await loadHistory(weekAnchor);
    } catch (actionError) {
      setTrackerError(actionError instanceof Error ? actionError.message : "Unable to update entry.");
    } finally {
      setEntryActionLoading(false);
    }
  };

  const deleteTrackerEntry = async (entryId) => {
    if (typeof requestApi !== "function") {
      return;
    }
    setEntryActionLoading(true);
    try {
      const response = await requestApi(`/api/calories/entry/${entryId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to delete entry."));
      }
      await loadHistory(weekAnchor);
    } catch (actionError) {
      setTrackerError(actionError instanceof Error ? actionError.message : "Unable to delete entry.");
    } finally {
      setEntryActionLoading(false);
    }
  };

  const openPrevWeek = () => {
    setWeekAnchor((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const openNextWeek = () => {
    setWeekAnchor((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  return (
    <View style={styles.pageStack}>
      <View style={styles.heroPanel}>
        <Text style={styles.chip}>Calorie calculator</Text>
        <Text style={styles.heroTitle}>Meal calorie estimator</Text>
        <Text style={styles.heroSubtitle}>Upload a meal photo and profile inputs to estimate per-item calories and compare against a personalized daily target.</Text>
      </View>

      <View style={styles.segmentRow}>
        <Pressable style={[styles.segmentButton, activeSubPage === "calculator" && styles.segmentButtonSelected]} onPress={() => setActiveSubPage("calculator")}>
          <Text style={[styles.segmentText, activeSubPage === "calculator" && styles.segmentTextSelected]}>Calculator</Text>
        </Pressable>
        <Pressable style={[styles.segmentButton, activeSubPage === "history" && styles.segmentButtonSelected]} onPress={() => setActiveSubPage("history")}>
          <Text style={[styles.segmentText, activeSubPage === "history" && styles.segmentTextSelected]}>History</Text>
        </Pressable>
      </View>

      {activeSubPage === "calculator" ? (
        <>
          <CalorieForm
            values={values}
            onChange={onChange}
            bmiCategory={bmiCategory}
            loading={loading}
            error={error}
            webcamEnabled={canUseWebcam}
            webcamActive={webcamActive}
            webcamError={webcamError}
            onOpenWebcam={openWebcam}
            onCaptureWebcam={captureWebcam}
            onCloseWebcam={closeWebcam}
            webcamVideoRef={videoRef}
            selectedImageUri={selectedAsset?.uri || ""}
            selectedImageAspectRatio={selectedImageAspectRatio}
            onPickImage={pickImage}
            onSubmit={submit}
          />

          <CalorieResult result={result} />

          <View style={styles.trackerCard}>
            <Text style={styles.trackerTitle}>Daily calorie tracker</Text>
            <Text style={styles.trackerBody}>Log meal calories to build your daily and weekly history.</Text>
            <TextInput
              style={styles.trackerInput}
              value={trackerMealName}
              onChangeText={setTrackerMealName}
              placeholder="Meal name (optional)"
              editable={!trackerLoading}
            />
            <TextInput
              style={styles.trackerInput}
              value={trackerCalories}
              onChangeText={setTrackerCalories}
              placeholder="Calories"
              keyboardType="numeric"
              editable={!trackerLoading}
            />
            <Pressable style={[styles.trackerButton, trackerLoading && styles.trackerButtonDisabled]} onPress={addToDailyTracker} disabled={trackerLoading}>
              <Text style={styles.trackerButtonText}>{trackerLoading ? "Adding..." : "Add to Daily Tracker"}</Text>
            </Pressable>
            {trackerError ? <Text style={styles.trackerError}>{trackerError}</Text> : null}
          </View>
        </>
      ) : (
        <CalorieHistoryPage
          history={historyPayload}
          loading={historyLoading}
          onPrevWeek={openPrevWeek}
          onNextWeek={openNextWeek}
          onEditEntry={editTrackerEntry}
          onDeleteEntry={deleteTrackerEntry}
          actionLoading={entryActionLoading}
        />
      )}

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add to daily tracker?</Text>
            <Text style={styles.modalBody}>Food: {suggestedMealName || "Meal"}</Text>
            <Text style={styles.modalBody}>Calories: {suggestedCalories || "--"} kcal</Text>
            <Text style={styles.modalPrompt}>Do you want to add this to your daily calorie tracker?</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalPrimary} onPress={() => void confirmAddSuggested()}>
                <Text style={styles.modalPrimaryText}>Yes</Text>
              </Pressable>
              <Pressable style={styles.modalSecondary} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.modalSecondaryText}>No</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: "#eef8df",
    color: "#4c6f2b",
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
  trackerCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10
  },
  trackerTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  trackerBody: {
    color: palette.muted,
    lineHeight: 20
  },
  trackerInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 12
  },
  trackerButton: {
    borderRadius: 12,
    backgroundColor: palette.blue,
    paddingVertical: 12,
    alignItems: "center"
  },
  trackerButtonDisabled: {
    opacity: 0.5
  },
  trackerButtonText: {
    color: palette.surface,
    fontWeight: "700"
  },
  trackerError: {
    color: palette.red,
    fontSize: 13
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 8
  },
  modalTitle: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 16
  },
  modalBody: {
    color: palette.ink,
    fontSize: 14
  },
  modalPrompt: {
    color: palette.muted,
    lineHeight: 20
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6
  },
  modalPrimary: {
    borderRadius: 10,
    backgroundColor: palette.blue,
    paddingVertical: 10,
    paddingHorizontal: 16
  },
  modalPrimaryText: {
    color: palette.surface,
    fontWeight: "700"
  },
  modalSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 10,
    paddingHorizontal: 16
  },
  modalSecondaryText: {
    color: palette.ink,
    fontWeight: "600"
  }
});
