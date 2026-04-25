// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../data";
import CalorieForm from "../components/calories/CalorieForm";
import CalorieResult from "../components/calories/CalorieResult";
import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import DateTimePickerField from "../components/shared/DateTimePickerField";
import CalorieHistoryPage from "./CalorieHistoryPage";
import { buildDietProfileContext, loadProfile, saveProfile } from "../storage/profileStorage";
import { formatDisplayDate, formatDisplayTime, formatInputDate, formatInputTime, parseDisplayDate, parseDisplayTime } from "../utils/dateTime";
import {
  addCalorieEntry,
  loadCalorieEntries,
  addConsumableRunHistoryEntry,
  clearCalorieDay,
  deleteCalorieEntry,
  loadCalorieWeek,
  loadConsumableRunHistory,
  removeConsumableRunHistoryEntry,
  updateCalorieEntry
} from "../storage/calorieTrackerStorage";

const DEFAULT_VALUES = {
  age: "25",
  bmi: "22.0",
  weightKg: "",
  heightCm: "",
  activityLevel: "moderate",
  sex: "female",
  medicalHistory: "",
  mealDescription: "",
  mealType: "food",
  mealDate: formatDisplayDate(new Date()),
  mealTime: formatDisplayTime(new Date()),
  hungerLevel: "3",
  goalContext: "energy",
  addToLogs: "no",
  includeProfile: "yes"
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

function aspectRatioTuple(value) {
  if (value === "1:1") {
    return [1, 1];
  }
  if (value === "3:4") {
    return [3, 4];
  }
  if (value === "16:9") {
    return [16, 9];
  }
  return [4, 3];
}

function firstProfileGoal(profile) {
  const raw = typeof profile?.goals === "string" ? profile.goals : "";
  const first = raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .find(Boolean);
  return first || "energy";
}

export default function CaloriesPage({ requestApi, accountId, accountEmail, guideSignal = 0 }) {
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedAssetSource, setSelectedAssetSource] = useState("library");
  const [aspectRatio, setAspectRatio] = useState("4:3");
  const [cropVisible, setCropVisible] = useState(false);
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
  const [allHistoryEntries, setAllHistoryEntries] = useState([]);
  const [runHistory, setRunHistory] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [logType, setLogType] = useState("meal");
  const [logName, setLogName] = useState("");
  const [logCalories, setLogCalories] = useState("");
  const [logAmount, setLogAmount] = useState("");
  const [logUnit, setLogUnit] = useState("serving");
  const [logServings, setLogServings] = useState("1");
  const [logContext, setLogContext] = useState("");
  const [logDate, setLogDate] = useState(formatDisplayDate(new Date()));
  const [logTime, setLogTime] = useState(formatDisplayTime(new Date()));
  const [logFeedback, setLogFeedback] = useState("");
  const [guideVisible, setGuideVisible] = useState(false);
  const [guidePageWidth, setGuidePageWidth] = useState(320);
  const [activeGuidePage, setActiveGuidePage] = useState(0);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);
  const guideScrollRef = useRef(null);

  const selectedImageAspectRatio = selectedAsset?.width && selectedAsset?.height ? selectedAsset.width / selectedAsset.height : aspectRatio === "1:1" ? 1 : aspectRatio === "3:4" ? 0.75 : aspectRatio === "16:9" ? 16 / 9 : 4 / 3;
  const canUseWebcam = Platform.OS === "web";
  const progressWidth = loading ? Math.min(92, 26 + Math.floor((calcElapsedMs || 0) / 900) * 12) : 100;
  const dietAnalysisSteps = [
    {
      label: "Nutrition parser",
      icon: "food-apple-outline",
      body: "Identifying the meal or drink, portion size, and core nutrient signals.",
      active: progressWidth >= 24,
      complete: progressWidth >= 46,
    },
    {
      label: "Profile fit analyst",
      icon: "account-heart-outline",
      body: "Comparing it with your conditions, allergies, food rules, and eating pattern.",
      active: progressWidth >= 46,
      complete: progressWidth >= 72,
    },
    {
      label: "Impact reviewer",
      icon: "shield-check-outline",
      body: "Scoring body impact, benefits, drawbacks, and claim realism.",
      active: progressWidth >= 72,
      complete: progressWidth >= 100,
    },
  ];
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

  const canSubmitAnalysis = Boolean(selectedAsset?.uri || values.mealDescription.trim());

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
          activityLevel: (profile.activityLevel || previous.activityLevel || "moderate").toLowerCase(),
          sex: mapProfileGenderToSex(profile.gender) || previous.sex,
          medicalHistory: buildDietProfileContext(profile) || profile.medicalHistory || profile.medicalConditions || previous.medicalHistory,
          goalContext: firstProfileGoal(profile),
          mealDate: previous.mealDate || formatDisplayDate(new Date()),
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
      const [payload, allEntries] = await Promise.all([
        loadCalorieWeek(accountId, weekStartIso(anchorDate), accountEmail),
        loadCalorieEntries(accountId, accountEmail),
      ]);
      setHistoryPayload(payload);
      setAllHistoryEntries(Array.isArray(allEntries) ? allEntries : []);
    } catch (loadError) {
      setTrackerError(loadError instanceof Error ? loadError.message : "Unable to load calorie history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory(weekAnchor);
  }, [weekAnchor, accountId]);

  useEffect(() => {
    let mounted = true;
    const hydrateRuns = async () => {
      try {
        const entries = await loadConsumableRunHistory(accountId);
        if (mounted) {
          setRunHistory(entries);
        }
      } catch {
        if (mounted) {
          setRunHistory([]);
        }
      }
    };
    void hydrateRuns();
    return () => {
      mounted = false;
    };
  }, [accountId]);

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
      mediaTypes: "images",
      quality: 0.95,
      allowsEditing: Platform.OS !== "web",
      aspect: aspectRatioTuple(aspectRatio)
    });
    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }

    setSelectedAssetSource("library");
    setSelectedAsset(pickerResult.assets[0]);
    setCropVisible(true);
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

  const captureImage = async () => {
    setError("");

    if (Platform.OS === "web") {
      await openWebcam();
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera access is required to take a photo.");
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.95,
      allowsEditing: true,
      aspect: aspectRatioTuple(aspectRatio)
    });
    if (cameraResult.canceled || !cameraResult.assets?.length) {
      return;
    }

    setSelectedAssetSource("camera");
    setSelectedAsset(cameraResult.assets[0]);
    setCropVisible(true);
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
    setSelectedAssetSource("camera");
    setCropVisible(true);
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
    const summarySection = sections.find((section) => /(top summary|meal summary)/i.test(section.heading || ""));
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

  function looksLikeHydrationResult(nextResult) {
    const raw = `${nextResult?.analysisText || ""}\n${Array.isArray(nextResult?.sections) ? nextResult.sections.map((section) => section?.content || "").join("\n") : ""}`.toLowerCase();
    return /(water|hydration|hydrating|coffee|tea|juice|smoothie|soda|drink|alcohol|beer|wine|cocktail|latte)/.test(raw);
  }

  function defaultContextForLog(kind) {
    if (kind === "hydration") {
      return "Hydration";
    }
    if (kind === "other") {
      return "Consumable";
    }
    return "Meal";
  }

function inferMealContextFromTime(value, kind) {
  if (kind === "hydration") {
    return "Hydration";
  }
  const match = typeof value === "string" ? value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/) : null;
    if (!match) {
      return kind === "other" ? "Consumable" : "Meal";
    }
    const hour = Number(match[1]);
    if (hour < 10) {
      return "Breakfast";
    }
    if (hour < 15) {
      return "Lunch";
    }
    if (hour < 19) {
      return "Dinner";
    }
    return kind === "other" ? "Consumable" : "Snack";
  }

  function seedLogDraft(nextResult) {
    const hydration = looksLikeHydrationResult(nextResult);
    const nextType = hydration ? "hydration" : "meal";
    const nextCalories = inferCaloriesFromResult(nextResult);
    const nextName = inferFoodNameFromResult(nextResult);
    setLogType(nextType);
    setLogName(nextName);
    setLogCalories(nextCalories);
    setLogAmount(hydration ? "350" : "1");
    setLogUnit(hydration ? "ml" : "serving");
    setLogServings("1");
    setLogContext(defaultContextForLog(nextType));
    setLogDate(formatDisplayDate(new Date()));
    setLogTime(formatDisplayTime(new Date()));
    setLogFeedback("");
  }

  function shouldAutoSaveToLog() {
    const toggleEnabled = (values.addToLogs || "").toLowerCase() === "yes";
    const requestedInNote = /\badd\s+(this\s+)?to\s+(my\s+)?log\b/i.test(values.mealDescription || "");
    return toggleEnabled || requestedInNote;
  }

  const submit = async () => {
    if (!selectedAsset && !values.mealDescription.trim()) {
      setError("Add a meal description or select a meal image before calculation.");
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
      if (Platform.OS === "web" && selectedAsset?.file) {
        formData.append("photo", selectedAsset.file);
      } else if (selectedAsset?.uri) {
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
      formData.append("medicalHistory", values.includeProfile === "no" ? "" : values.medicalHistory);
      formData.append("mealDescription", values.mealDescription);
      formData.append("mealType", values.mealType);
      formData.append("mealDate", parseDisplayDate(values.mealDate) || formatLocalIsoDate(new Date()));
      formData.append("mealTime", parseDisplayTime(values.mealTime) || formatDisplayTime(new Date()));
      formData.append("hungerLevel", values.hungerLevel);
      formData.append("goalContext", values.goalContext);

      const response = await requestApi("/api/calories/calculate", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Calorie calculation failed."));
      }

      const payload = await response.json();
      setResult(payload);
      const title = inferFoodNameFromResult(payload);
      const searchedAt = new Date().toISOString();
      const updatedRuns = await addConsumableRunHistoryEntry(accountId, {
        id: `diet-run-${searchedAt.replace(/\D/g, "").slice(0, 17)}`,
        title,
        kind: looksLikeHydrationResult(payload) ? "hydration" : "meal",
        searchedAt,
        result: payload,
        summary: payload?.analysisText?.split("\n").find((line) => line.trim()) || "",
        tags: Array.isArray(payload?.topHighlights) ? payload.topHighlights.slice(0, 3) : [],
      });
      setRunHistory(updatedRuns);
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
      seedLogDraft(payload);
      if (!inferred) {
        setLogCalories("");
      }
      if (shouldAutoSaveToLog()) {
        const autoSaved = await addTrackerEntry({
          kind: looksLikeHydrationResult(payload) ? "hydration" : "meal",
          mealName: inferFoodNameFromResult(payload),
          calories: inferred || "0",
          amount: looksLikeHydrationResult(payload) ? "350" : "1",
          unit: looksLikeHydrationResult(payload) ? "ml" : "serving",
          servings: "1",
          context: inferMealContextFromTime(parseDisplayTime(values.mealTime) || formatDisplayTime(new Date()), looksLikeHydrationResult(payload) ? "hydration" : "meal"),
          entryDate: values.mealDate,
          entryTime: values.mealTime,
          switchToHistory: false,
          quickNotes: [],
        });
        if (autoSaved) {
          setLogFeedback("Saved to your log automatically from this analysis.");
        }
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to calculate calories right now.");
    } finally {
      setCalcElapsedMs(Date.now() - startedAt);
      setLoading(false);
    }
  };

  const addTrackerEntry = async ({ kind, mealName, calories, entryDate, entryTime, switchToHistory, amount, unit, servings, context, quickNotes }) => {
    const parsedCalories = Number(calories);
    const normalizedKind = kind === "hydration" ? "hydration" : kind === "other" ? "other" : "meal";
    if (normalizedKind !== "hydration" && (!Number.isFinite(parsedCalories) || parsedCalories < 0)) {
      setTrackerError("Enter valid calories before adding to your scanner log.");
      return false;
    }
    const normalizedMealName = (mealName || "").trim() || inferFoodNameFromResult(result);
    const nextEntryKey = `${normalizedKind}|${normalizedEntryKey(normalizedMealName, parsedCalories)}`;
    const existingEntries = Array.isArray(historyPayload?.entries) ? historyPayload.entries : [];
    const duplicateRecent = existingEntries.some((entry) => {
      const existingEntryKey = `${entry.kind || "meal"}|${normalizedEntryKey(entry.name || entry.mealName, entry.calories)}`;
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
      setTrackerError("This item was just added. Duplicate entry prevented.");
      return false;
    }

    setTrackerLoading(true);
    setTrackerError("");
    setLogFeedback("");
    try {
      const safeDate = parseDisplayDate(entryDate) || entryDate || formatLocalIsoDate(new Date());
      const safeTime = parseDisplayTime(entryTime) || "12:00:00";
      await addCalorieEntry(accountId, {
        kind: normalizedKind,
        name: normalizedMealName,
        calories: Math.max(0, Math.round(parsedCalories || 0)),
        amount: amount,
        unit: unit,
        servings: servings,
        context: (context || "").trim() || inferMealContextFromTime(safeTime, normalizedKind),
        quickNotes: quickNotes,
        loggedAt: `${safeDate}T${safeTime}`,
        date: safeDate,
        sourceType: "analysis"
      }, accountEmail);
      await loadHistory(weekAnchor);
      setLogFeedback(normalizedKind === "hydration" ? "Added to hydration log." : "Added to scanner log.");
      if (switchToHistory && activeSubPage !== "logs") {
        setActiveSubPage("logs");
      }
      return true;
    } catch (submitError) {
      setTrackerError(submitError instanceof Error ? submitError.message : "Unable to add entry.");
      return false;
    } finally {
      setTrackerLoading(false);
    }
  };

  const addTrackerEntryFromHistory = async ({ date, mealName, calories, kind, amount, unit, servings, context }) => {
    const added = await addTrackerEntry({
      kind: kind || "meal",
      mealName,
      calories,
      entryDate: date,
      entryTime: "12:00",
      amount: amount ?? (kind === "hydration" ? 250 : 1),
      unit: unit || (kind === "hydration" ? "ml" : "serving"),
      servings: servings ?? 1,
      context: context || defaultContextForLog(kind || "meal"),
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

  const deleteRunHistoryEntry = async (entryId) => {
    const updated = await removeConsumableRunHistoryEntry(accountId, entryId);
    setRunHistory(updated);
    if (selectedRun?.id === entryId) {
      setSelectedRun(null);
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

  const reopenCrop = async () => {
    if (selectedAssetSource === "camera") {
      await captureImage();
      return;
    }
    await pickImage();
  };

  return (
    <View style={styles.pageStack}>
      <SectionTabs
        value={activeSubPage}
        onValueChange={setActiveSubPage}
        tabs={[
          { value: "calculator", label: "Analyse", icon: "flask-outline" },
          { value: "history", label: "History", icon: "history" },
          { value: "logs", label: "Logs", icon: "chart-box-outline" },
        ]}
      />

      <View style={activeSubPage === "calculator" ? undefined : styles.hiddenSection}>
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
            onCaptureImage={captureImage}
            webcamVideoRef={videoRef}
            selectedImageUri={selectedAsset?.uri || ""}
            selectedImageAspectRatio={selectedImageAspectRatio}
            onPickImage={pickImage}
            onSubmit={submit}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            onOpenCrop={() => setCropVisible(true)}
            canSubmit={canSubmitAnalysis}
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
              <View style={styles.calcStepStack}>
                {dietAnalysisSteps.map((step) => (
                  <View key={step.label} style={styles.calcStepRow}>
                    <View style={[styles.calcStepIconWrap, step.complete ? styles.calcStepIconWrapComplete : step.active ? styles.calcStepIconWrapActive : null]}>
                      <MaterialCommunityIcons name={step.icon} size={16} color={step.complete ? palette.primary : step.active ? palette.warning : palette.muted} />
                    </View>
                    <View style={styles.calcStepCopy}>
                      <Text style={styles.calcStepTitle}>{step.label}</Text>
                      <Text style={styles.calcStepBody}>{step.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.calcMetaText}>
                {loading ? "Time elapsed: " : "Time taken: "}
                {(calcElapsedMs / 1000).toFixed(1)} seconds
              </Text>
            </View>
          ) : null}
          <CalorieResult result={result} />
          {result ? (
            <View style={styles.logCard}>
              <View style={styles.logHeaderRow}>
                <View style={styles.flexOne}>
                  <Text style={styles.logTitle}>Add to your log</Text>
                  <Text style={styles.logSubtitle}>Save this analysis as a meal, hydration entry, or another consumable so future advice can use the full day context.</Text>
                </View>
                <View style={styles.logTypeRow}>
                  {[
                    ["meal", "Meal"],
                    ["hydration", "Hydration"],
                    ["other", "Other"],
                  ].map(([value, label]) => (
                    <Pressable
                      key={value}
                      style={[styles.logTypeChip, logType === value && styles.logTypeChipActive]}
                      onPress={() => {
                        setLogType(value);
                        setLogUnit(value === "hydration" ? "ml" : "serving");
                        setLogContext(defaultContextForLog(value));
                        if (value === "hydration" && !logAmount) {
                          setLogAmount("350");
                        }
                      }}
                    >
                      <Text style={[styles.logTypeChipText, logType === value && styles.logTypeChipTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.logGrid}>
                <TextInput style={styles.logInput} value={logName} onChangeText={setLogName} placeholder="Name" placeholderTextColor={palette.muted} />
                <TextInput style={styles.logInput} value={logContext} onChangeText={setLogContext} placeholder="Context" placeholderTextColor={palette.muted} />
                <DateTimePickerField mode="date" style={styles.logInput} value={logDate} onChange={setLogDate} placeholder="DD/MM/YYYY" editable={!trackerLoading} />
                <DateTimePickerField mode="time" style={styles.logInput} value={logTime} onChange={setLogTime} placeholder="HH:MM" editable={!trackerLoading} />
                <TextInput style={styles.logInput} value={logCalories} onChangeText={setLogCalories} placeholder={logType === "hydration" ? "Calories (optional)" : "Calories"} placeholderTextColor={palette.muted} keyboardType="numeric" />
                <TextInput style={styles.logInput} value={logServings} onChangeText={setLogServings} placeholder="Servings" placeholderTextColor={palette.muted} keyboardType="decimal-pad" />
                <TextInput style={styles.logInput} value={logAmount} onChangeText={setLogAmount} placeholder={logType === "hydration" ? "Amount" : "Quantity"} placeholderTextColor={palette.muted} keyboardType="numeric" />
                <TextInput style={styles.logInput} value={logUnit} onChangeText={setLogUnit} placeholder="Unit" placeholderTextColor={palette.muted} />
              </View>
              {trackerError ? <Text style={styles.logError}>{trackerError}</Text> : null}
              {logFeedback ? <Text style={styles.logFeedback}>{logFeedback}</Text> : null}
              <View style={styles.logActionRow}>
                <Pressable
                  style={[styles.logPrimaryButton, trackerLoading && styles.modalButtonDisabled]}
                  disabled={trackerLoading}
                  onPress={() =>
                    void addTrackerEntry({
                      kind: logType,
                      mealName: logName,
                      calories: logCalories,
                      amount: logAmount,
                      unit: logUnit,
                      servings: logServings,
                      context: logContext,
                      entryDate: logDate,
                      entryTime: logTime,
                      switchToHistory: false,
                      quickNotes: Array.isArray(result?.topHighlights) ? result.topHighlights.slice(0, 3) : [],
                    })
                  }
                >
                  <Text style={styles.logPrimaryButtonText}>{trackerLoading ? "Saving..." : logFeedback ? "Save another copy" : "Add to log"}</Text>
                </Pressable>
                <Pressable style={styles.logSecondaryButton} onPress={() => setActiveSubPage("logs")}>
                  <Text style={styles.logSecondaryButtonText}>Open logs</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      </View>
      <View style={activeSubPage === "history" ? undefined : styles.hiddenSection}>
        <CalorieHistoryPage
        history={historyPayload}
        allEntries={allHistoryEntries}
        runHistory={runHistory}
          initialMode="runs"
          loading={historyLoading}
          onPrevWeek={openPrevWeek}
          onNextWeek={openNextWeek}
          onAddEntry={addTrackerEntryFromHistory}
          onEditEntry={editTrackerEntry}
          onDeleteEntry={deleteTrackerEntry}
          onClearDayEntries={clearTrackerDay}
          onOpenRun={setSelectedRun}
          onDeleteRun={deleteRunHistoryEntry}
          actionLoading={entryActionLoading}
          trackerLoading={trackerLoading}
          trackerError={trackerError}
        />
      </View>
      <View style={activeSubPage === "logs" ? undefined : styles.hiddenSection}>
        <CalorieHistoryPage
          history={historyPayload}
          runHistory={runHistory}
          initialMode="logs"
          loading={historyLoading}
          onPrevWeek={openPrevWeek}
          onNextWeek={openNextWeek}
          onAddEntry={addTrackerEntryFromHistory}
          onEditEntry={editTrackerEntry}
          onDeleteEntry={deleteTrackerEntry}
          onClearDayEntries={clearTrackerDay}
          onOpenRun={setSelectedRun}
          onDeleteRun={deleteRunHistoryEntry}
          actionLoading={entryActionLoading}
          trackerLoading={trackerLoading}
          trackerError={trackerError}
        />
      </View>

      <Modal visible={Boolean(selectedRun)} transparent animationType="slide" onRequestClose={() => setSelectedRun(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.runModalCard}>
            <View style={styles.runModalHeader}>
              <View style={styles.flexOne}>
                <Text style={styles.modalTitle}>{selectedRun?.title || "Saved analysis"}</Text>
                <Text style={styles.modalPrompt}>{selectedRun ? formatDisplayTime(selectedRun.searchedAt) : ""}</Text>
              </View>
              <Pressable style={styles.modalSecondary} onPress={() => setSelectedRun(null)}>
                <Text style={styles.modalSecondaryText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.runModalScroller}>
              <CalorieResult result={selectedRun?.result || null} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={cropVisible} transparent animationType="slide" onRequestClose={() => setCropVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.cropModalCard}>
            <Text style={styles.modalTitle}>Crop & framing</Text>
            <Text style={styles.modalPrompt}>Choose an aspect ratio before continuing. On mobile, re-open crop will let you refine the image with the selected frame.</Text>
            {selectedAsset?.uri ? <View style={styles.cropPreviewWrap}><View style={[styles.cropPreviewFrame, { aspectRatio: selectedImageAspectRatio || 1 }]}><Text style={styles.cropPreviewText}>Preview frame</Text></View></View> : null}
            <View style={styles.logTypeRow}>
              {["1:1", "4:3", "3:4", "16:9"].map((ratio) => (
                <Pressable key={ratio} style={[styles.logTypeChip, aspectRatio === ratio && styles.logTypeChipActive]} onPress={() => setAspectRatio(ratio)}>
                  <Text style={[styles.logTypeChipText, aspectRatio === ratio && styles.logTypeChipTextActive]}>{ratio}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.logActionRow}>
              <Pressable style={styles.logPrimaryButton} onPress={() => void reopenCrop()}>
                <Text style={styles.logPrimaryButtonText}>Re-open crop</Text>
              </Pressable>
              <Pressable style={styles.logSecondaryButton} onPress={() => setCropVisible(false)}>
                <Text style={styles.logSecondaryButtonText}>Use image</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <TutorialSheet visible={guideVisible} title="Diet tutorial" pages={CALORIE_GUIDE_PAGES} onClose={closeGuide} />
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 24
  },
  flexOne: {
    flex: 1
  },
  hiddenSection: {
    display: "none"
  },
  heroPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    backgroundColor: palette.surface,
    gap: 12
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14
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
    lineHeight: 24,
    fontFamily: "Poppins_400Regular"
  },
  calcMetaCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10
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
  calcStepStack: {
    gap: 10
  },
  calcStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10
  },
  calcStepIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    marginTop: 1,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  calcStepIconWrapActive: {
    backgroundColor: `${palette.warning}18`
  },
  calcStepIconWrapComplete: {
    backgroundColor: palette.primarySoft
  },
  calcStepCopy: {
    flex: 1,
    gap: 2
  },
  calcStepTitle: {
    color: palette.ink,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold"
  },
  calcStepBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular"
  },
  logCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 14
  },
  logHeaderRow: {
    gap: 10
  },
  logTitle: {
    color: palette.ink,
    fontSize: 16,
    fontFamily: "Poppins_700Bold"
  },
  logSubtitle: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular"
  },
  logTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  logTypeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  logTypeChipActive: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary
  },
  logTypeChipText: {
    color: palette.ink,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold"
  },
  logTypeChipTextActive: {
    color: palette.primary
  },
  logGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  logInput: {
    minHeight: 46,
    minWidth: 138,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    color: palette.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular"
  },
  logActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  logPrimaryButton: {
    borderRadius: 14,
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  logPrimaryButtonText: {
    color: palette.surface,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold"
  },
  logSecondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  logSecondaryButtonText: {
    color: palette.ink,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold"
  },
  logError: {
    color: palette.red,
    fontSize: 12,
    fontFamily: "Poppins_400Regular"
  },
  logFeedback: {
    color: palette.primary,
    fontSize: 12,
    fontFamily: "Poppins_500Medium"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  runModalCard: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "90%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 12
  },
  cropModalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 14
  },
  runModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  runModalScroller: {
    gap: 12,
    paddingBottom: 6
  },
  cropPreviewWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  cropPreviewFrame: {
    width: "100%",
    maxWidth: 260,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  cropPreviewText: {
    color: palette.primary,
    fontSize: 12,
    paddingVertical: 28,
    fontFamily: "Poppins_600SemiBold"
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 18,
    gap: 10
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
