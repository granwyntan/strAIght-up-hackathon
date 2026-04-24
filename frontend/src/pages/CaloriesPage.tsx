// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { palette } from "../data";
import CalorieForm from "../components/calories/CalorieForm";
import CalorieResult from "../components/calories/CalorieResult";
import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import CalorieHistoryPage from "./CalorieHistoryPage";
import { loadProfile, saveProfile } from "../storage/profileStorage";
import { formatDisplayTime } from "../utils/dateTime";
import {
  addCalorieEntry,
  clearCalorieDay,
  deleteCalorieEntry,
  loadCalorieWeek,
  updateCalorieEntry
} from "../storage/calorieTrackerStorage";

const DEFAULT_VALUES = {
  age: "25",
  bmi: "22.0",
  weightKg: "",
  heightCm: "",
  activityLevel: "moderate",
  sex: "female",
  medicalHistory: ""
};
const CALORIE_GUIDE_PAGES = [
  {
    title: "Welcome to Calorie Calculator",
    body: "Welcome to Calorie Calculator."
  },
  {
    title: "Add your details",
    body: "Add your age, height, weight, sex, and activity level to determine your suggested daily intake."
  },
  {
    title: "Select a search option",
    body: "Choose how you want to scan your meal: upload image or camera."
  },
  {
    title: "How calories are calculated",
    body: "The app analyzes your meal photo, estimates foods and portions, then calculates calories using nutrition references and your personal profile context."
  },
  {
    title: "Add to daily intake",
    body: "After calculation, add the food into your daily calorie intake tracker."
  },
  {
    title: "Use history tab",
    body: "In the History tab, you can view your weekly and daily calorie intake."
  },
  {
    title: "Manage day details",
    body: "Click a day detail to add, edit, or delete entries."
  }
];

function mapProfileGenderToSex(gender) {
  const normalized = (gender || "").trim().toLowerCase();
  if (normalized === "male") {
    return "male";
  }
  if (normalized === "female") {
    return "female";
  }
  return "";
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

function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CaloriesPage({ requestApi, accountId, accountEmail, guideSignal = 0 }) {
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [calcStartedAt, setCalcStartedAt] = useState(null);
  const [calcElapsedMs, setCalcElapsedMs] = useState(null);
  const [error, setError] = useState("");
  const [activeSubPage, setActiveSubPage] = useState("calculator");
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [trackerError, setTrackerError] = useState("");
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [entryActionLoading, setEntryActionLoading] = useState(false);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [historyPayload, setHistoryPayload] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [suggestedMealName, setSuggestedMealName] = useState("");
  const [suggestedCalories, setSuggestedCalories] = useState("");
  const [guideVisible, setGuideVisible] = useState(false);
  const [guidePageWidth, setGuidePageWidth] = useState(320);
  const [activeGuidePage, setActiveGuidePage] = useState(0);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);
  const guideScrollRef = useRef(null);

  const selectedImageAspectRatio = selectedAsset?.width && selectedAsset?.height ? selectedAsset.width / selectedAsset.height : 1.4;
  const canUseWebcam = Platform.OS === "web";
  const progressWidth = loading ? Math.min(92, 26 + Math.floor((calcElapsedMs || 0) / 900) * 12) : 100;
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

  const normalizedEntryKey = (mealName, calories) => `${(mealName || "").trim().toLowerCase()}|${Math.round(Number(calories) || 0)}`;

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
    let mounted = true;
    const hydrateFromProfile = async () => {
      try {
        const profile = await loadProfile(accountId, accountEmail);
        if (!mounted) {
          return;
        }
        setValues((previous) => ({
          ...previous,
          age: profile.age || previous.age,
          weightKg: profile.weight || previous.weightKg,
          heightCm: profile.height || previous.heightCm,
          sex: mapProfileGenderToSex(profile.gender) || previous.sex,
          medicalHistory: profile.medicalHistory || profile.medicalConditions || previous.medicalHistory
        }));
      } catch (error) {
        console.warn("Unable to prefill calorie inputs from profile", error);
      }
    };
    void hydrateFromProfile();
    return () => {
      mounted = false;
    };
  }, [accountId, accountEmail]);

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
    return formatLocalIsoDate(normalized);
  }

  async function loadHistory(anchorDate = weekAnchor) {
    setHistoryLoading(true);
    try {
      const payload = await loadCalorieWeek(accountId, weekStartIso(anchorDate), accountEmail);
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
  }, [activeSubPage, weekAnchor, accountId]);

  useEffect(() => {
    if (guideSignal > 0) {
      openGuide();
    }
  }, [guideSignal]);

  useEffect(() => {
    if (!loading || !calcStartedAt) {
      return;
    }
    const timer = setInterval(() => {
      setCalcElapsedMs(Date.now() - calcStartedAt);
    }, 120);
    return () => clearInterval(timer);
  }, [loading, calcStartedAt]);

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
    if (typeof nextResult?.totalEstimatedCalories === "number" && Number.isFinite(nextResult.totalEstimatedCalories)) {
      return String(Math.max(0, Math.round(nextResult.totalEstimatedCalories)));
    }
    const raw = typeof nextResult?.analysisText === "string" ? nextResult.analysisText : "";
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const finalLine = lines.length > 0 ? lines[lines.length - 1] : "";
    if (/total estimated calories/i.test(finalLine)) {
      const finalMatch = finalLine.match(/-?\d[\d,]*/);
      if (finalMatch) {
        const normalized = finalMatch[0].replace(/,/g, "");
        return String(Math.max(0, Number(normalized) || 0));
      }
    }
    return "";
  }

  function inferFoodNameFromResult(nextResult) {
    const analysisText = typeof nextResult?.analysisText === "string" ? nextResult.analysisText : "";
    const firstAnalysisLine = analysisText.split("\n").find((line) => line.trim());
    const cleanedFirstLine = (firstAnalysisLine || "")
      .replace(/^[-*]\s*/, "")
      .replace(/^food\s*name[:\s-]*/i, "")
      .trim();
    if (cleanedFirstLine) {
      return cleanedFirstLine.slice(0, 80);
    }

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
    const startedAt = Date.now();
    setCalcStartedAt(startedAt);
    setCalcElapsedMs(null);

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
      formData.append("medicalHistory", values.medicalHistory);

      const response = await requestApi("/api/calories/calculate", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Calorie calculation failed."));
      }

      const payload = await response.json();
      setResult(payload);
      if (accountId && accountEmail) {
        const dailyTarget = Number(payload?.calorieContext?.dailyTarget);
        if (Number.isFinite(dailyTarget) && dailyTarget > 0) {
          try {
            const existingProfile = await loadProfile(accountId, accountEmail);
            await saveProfile(
              {
                ...existingProfile,
                dailyCalorieTarget: String(Math.round(dailyTarget)),
                dailyCalorieUpdatedAt: new Date().toISOString()
              },
              accountId,
              accountEmail
            );
          } catch (profileError) {
            console.warn("Unable to save calculated daily calorie target to profile", profileError);
          }
        }
      }
      const inferred = inferCaloriesFromResult(payload);
      const inferredMealName = inferFoodNameFromResult(payload);
      if (inferred) {
        setSuggestedMealName(inferredMealName);
        setSuggestedCalories(inferred);
        setConfirmVisible(true);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to calculate calories right now.");
    } finally {
      setCalcElapsedMs(Date.now() - startedAt);
      setLoading(false);
    }
  };

  const addTrackerEntry = async ({ mealName, calories, entryDate, switchToHistory }) => {
    const parsedCalories = Number(calories);
    if (!Number.isFinite(parsedCalories) || parsedCalories <= 0) {
      setTrackerError("Enter valid calories before adding to tracker.");
      return false;
    }
    const normalizedMealName = (mealName || "").trim() || inferFoodNameFromResult(result);
    const nextEntryKey = normalizedEntryKey(normalizedMealName, parsedCalories);
    const existingEntries = Array.isArray(historyPayload?.entries) ? historyPayload.entries : [];
    const duplicateRecent = existingEntries.some((entry) => {
      const existingEntryKey = normalizedEntryKey(entry.mealName, entry.calories);
      if (existingEntryKey !== nextEntryKey) {
        return false;
      }
      const createdAtMs = Date.parse(entry.createdAt || "");
      if (Number.isNaN(createdAtMs)) {
        return false;
      }
      return Date.now() - createdAtMs <= 5000;
    });
    if (duplicateRecent) {
      setTrackerError("This meal was just added. Duplicate entry prevented.");
      return false;
    }

    setTrackerLoading(true);
    setTrackerError("");
    try {
      await addCalorieEntry(accountId, {
        mealName: normalizedMealName,
        calories: Math.round(parsedCalories),
        date: entryDate || formatLocalIsoDate(new Date())
      }, accountEmail);
      await loadHistory(weekAnchor);
      if (switchToHistory && activeSubPage !== "history") {
        setActiveSubPage("history");
      }
      return true;
    } catch (submitError) {
      setTrackerError(submitError instanceof Error ? submitError.message : "Unable to add entry.");
      return false;
    } finally {
      setTrackerLoading(false);
    }
  };

  const confirmAddSuggested = async () => {
    const added = await addTrackerEntry({
      mealName: suggestedMealName,
      calories: suggestedCalories,
      entryDate: formatLocalIsoDate(new Date()),
      switchToHistory: false
    });
    if (added) {
      setConfirmVisible(false);
    }
  };

  const addTrackerEntryFromHistory = async ({ date, mealName, calories }) => {
    const added = await addTrackerEntry({
      mealName,
      calories,
      entryDate: date,
      switchToHistory: false
    });
    if (added) {
      await loadHistory(weekAnchor);
    }
    return added;
  };

  const editTrackerEntry = async (entryId, updates) => {
    setEntryActionLoading(true);
    try {
      await updateCalorieEntry(accountId, entryId, {
        mealName: updates.mealName || "",
        calories: Math.round(Number(updates.calories))
      }, accountEmail);
      await loadHistory(weekAnchor);
    } catch (actionError) {
      setTrackerError(actionError instanceof Error ? actionError.message : "Unable to update entry.");
    } finally {
      setEntryActionLoading(false);
    }
  };

  const deleteTrackerEntry = async (entryId) => {
    setEntryActionLoading(true);
    try {
      await deleteCalorieEntry(accountId, entryId, accountEmail);
      await loadHistory(weekAnchor);
    } catch (actionError) {
      setTrackerError(actionError instanceof Error ? actionError.message : "Unable to delete entry.");
    } finally {
      setEntryActionLoading(false);
    }
  };

  const clearTrackerDay = async (entryDate) => {
    setEntryActionLoading(true);
    try {
      await clearCalorieDay(accountId, entryDate, accountEmail);
      await loadHistory(weekAnchor);
      return true;
    } catch (actionError) {
      setTrackerError(actionError instanceof Error ? actionError.message : "Unable to clear this day.");
      return false;
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

  const closeGuide = () => {
    setGuideVisible(false);
  };

  const openGuide = () => {
    setActiveGuidePage(0);
    setGuideVisible(true);
    setTimeout(() => {
      guideScrollRef.current?.scrollTo?.({ x: 0, animated: false });
    }, 0);
  };

  return (
    <View style={styles.pageStack}>
      <SectionTabs
        value={activeSubPage}
        onValueChange={setActiveSubPage}
        tabs={[
          { value: "calculator", label: "Estimate", icon: "food-apple-outline" },
          { value: "history", label: "History", icon: "history" },
        ]}
      />

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

          {calcStartedAt && calcElapsedMs !== null ? (
            <View style={styles.calcMetaCard}>
              <View style={styles.calcMetaHeader}>
                <View style={styles.calcMetaCopy}>
                  <Text style={styles.calcMetaTitle}>{loading ? "Analyzing meal" : "Latest calculation"}</Text>
                  <Text style={styles.calcMetaText}>Started: {formatDisplayTime(calcStartedAt)}</Text>
                </View>
                <Text style={styles.calcMetaBadge}>{loading ? "In progress" : "Done"}</Text>
              </View>
              <View style={styles.calcMetaTrack}>
                <View style={[styles.calcMetaProgress, { width: `${progressWidth}%` }]} />
              </View>
              <Text style={styles.calcMetaText}>
                {loading ? "Time elapsed: " : "Time taken: "}
                {(calcElapsedMs / 1000).toFixed(1)} seconds
              </Text>
            </View>
          ) : null}
          <CalorieResult result={result} />
        </>
      ) : (
        <CalorieHistoryPage
          history={historyPayload}
          loading={historyLoading}
          onPrevWeek={openPrevWeek}
          onNextWeek={openNextWeek}
          onAddEntry={addTrackerEntryFromHistory}
          onEditEntry={editTrackerEntry}
          onDeleteEntry={deleteTrackerEntry}
          onClearDayEntries={clearTrackerDay}
          actionLoading={entryActionLoading}
          trackerLoading={trackerLoading}
          trackerError={trackerError}
        />
      )}

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add to daily tracker?</Text>
            <Text style={styles.modalBody}>Food: {suggestedMealName || "Meal"}</Text>
            <Text style={styles.modalBody}>Calories: {suggestedCalories || "--"} kcal</Text>
            <Text style={styles.modalPrompt}>Do you want to add this to your daily calorie tracker?</Text>
            {trackerError ? <Text style={styles.modalError}>{trackerError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalPrimary, trackerLoading && styles.modalButtonDisabled]} onPress={() => void confirmAddSuggested()} disabled={trackerLoading}>
                <Text style={styles.modalPrimaryText}>Yes</Text>
              </Pressable>
              <Pressable style={[styles.modalSecondary, trackerLoading && styles.modalButtonDisabled]} onPress={() => setConfirmVisible(false)} disabled={trackerLoading}>
                <Text style={styles.modalSecondaryText}>No</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <TutorialSheet visible={guideVisible} title="Nutrition tutorial" pages={CALORIE_GUIDE_PAGES} onClose={closeGuide} />
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
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    color: palette.primary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold"
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 23,
    lineHeight: 30,
    fontFamily: "Poppins_700Bold",
    flex: 1
  },
  guideButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  guideButtonText: {
    color: palette.primary,
    fontSize: 18,
    lineHeight: 20,
    fontFamily: "Poppins_700Bold"
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Poppins_400Regular"
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
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft
  },
  segmentText: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold"
  },
  segmentTextSelected: {
    color: palette.primary
  },
  calcMetaCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8
  },
  calcMetaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  calcMetaCopy: {
    flex: 1,
    gap: 4
  },
  calcMetaTitle: {
    color: palette.ink,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold"
  },
  calcMetaBadge: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    color: palette.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold"
  },
  calcMetaTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: palette.primarySoft
  },
  calcMetaProgress: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.primary
  },
  calcMetaText: {
    color: palette.ink,
    fontSize: 12,
    fontFamily: "Poppins_400Regular"
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
    fontFamily: "Poppins_700Bold",
    fontSize: 16
  },
  modalBody: {
    color: palette.ink,
    fontSize: 14,
    fontFamily: "Poppins_400Regular"
  },
  modalPrompt: {
    color: palette.muted,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular"
  },
  modalError: {
    color: palette.red,
    fontSize: 12
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6
  },
  modalPrimary: {
    borderRadius: 10,
    backgroundColor: palette.primary,
    paddingVertical: 10,
    paddingHorizontal: 16
  },
  modalPrimaryText: {
    color: palette.surface,
    fontFamily: "Poppins_600SemiBold"
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
    fontFamily: "Poppins_600SemiBold"
  },
  modalButtonDisabled: {
    opacity: 0.5
  },
  guideBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 20, 34, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  guideCard: {
    width: "86%",
    maxWidth: 420,
    minHeight: 400,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingTop: 16,
    paddingBottom: 12
  },
  guideCloseButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  },
  guideCloseButtonText: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 14
  },
  guideTitle: {
    color: palette.ink,
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    marginBottom: 10
  },
  guidePage: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 300,
    gap: 10
  },
  guideStepLabel: {
    color: palette.primary,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold"
  },
  guidePageTitle: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Poppins_700Bold"
  },
  guidePageBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Poppins_400Regular"
  },
  guideFooter: {
    alignItems: "center",
    justifyContent: "center"
  },
  guideFooterText: {
    color: palette.muted,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold"
  }
});
