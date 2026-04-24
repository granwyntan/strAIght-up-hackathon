// @ts-nocheck
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";

import { db } from "../lib/firebaseClient";

const BASE_WORKOUT_TASK_KEY = "gramwin.workout.tasks.v1";
const firestore = db;

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function workoutTaskKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${BASE_WORKOUT_TASK_KEY}.${suffix}`;
}

function normalizeTask(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    routineTitle: typeof source.routineTitle === "string" ? source.routineTitle.trim() : "",
    type: typeof source.type === "string" ? source.type.trim() : "Workout",
    duration: typeof source.duration === "string" ? source.duration.trim() : "",
    intensity: typeof source.intensity === "string" ? source.intensity.trim() : "",
    description: typeof source.description === "string" ? source.description.trim() : "",
    dueDate: typeof source.dueDate === "string" ? source.dueDate.trim() : "",
    completed: Boolean(source.completed),
    completedAt: typeof source.completedAt === "string" ? source.completedAt : "",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString()
  };
}

function normalizeTasks(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map(normalizeTask).sort((a, b) => Date.parse(a.dueDate || "") - Date.parse(b.dueDate || ""));
}

async function loadLocalTasks(accountId) {
  const raw = await AsyncStorage.getItem(workoutTaskKey(accountId));
  if (!raw) {
    return [];
  }
  try {
    return normalizeTasks(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function saveLocalTasks(accountId, tasks) {
  const normalized = normalizeTasks(tasks);
  await AsyncStorage.setItem(workoutTaskKey(accountId), JSON.stringify(normalized));
  return normalized;
}

function toFirestoreRecord(task) {
  return {
    routine_title: task.routineTitle,
    type: task.type,
    duration: task.duration,
    intensity: task.intensity,
    description: task.description,
    due_date: task.dueDate,
    completed: task.completed,
    completed_at: task.completedAt,
    created_at: task.createdAt
  };
}

function fromFirestoreRecord(id, data) {
  return normalizeTask({
    id,
    routineTitle: data?.routine_title,
    type: data?.type,
    duration: data?.duration,
    intensity: data?.intensity,
    description: data?.description,
    dueDate: data?.due_date,
    completed: data?.completed,
    completedAt: data?.completed_at,
    createdAt: data?.created_at
  });
}

export async function loadWorkoutTasks(accountId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return loadLocalTasks(accountId);
  }
  try {
    const snapshot = await getDocs(collection(firestore, "users", userId, "workout_plan"));
    const tasks = snapshot.docs.map((item) => fromFirestoreRecord(item.id, item.data()));
    await saveLocalTasks(accountId, tasks);
    return normalizeTasks(tasks);
  } catch (error) {
    console.warn("Unable to load workout plan from Firestore; falling back to local", error);
    return loadLocalTasks(accountId);
  }
}

export async function replaceWorkoutTasks(accountId, tasks, accountEmail) {
  const normalized = await saveLocalTasks(accountId, tasks);
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return normalized;
  }
  try {
    const snapshot = await getDocs(collection(firestore, "users", userId, "workout_plan"));
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
    await Promise.all(
      normalized.map((task) => setDoc(doc(firestore, "users", userId, "workout_plan", task.id), toFirestoreRecord(task), { merge: true }))
    );
  } catch (error) {
    console.warn("Unable to sync workout plan replacement to Firestore; local data kept", error);
  }
  return normalized;
}

export async function setWorkoutTaskCompleted(accountId, taskId, completed, accountEmail) {
  const existing = await loadLocalTasks(accountId);
  const updated = existing.map((task) => {
    if (task.id !== taskId) {
      return task;
    }
    return normalizeTask({
      ...task,
      completed: Boolean(completed),
      completedAt: completed ? new Date().toISOString() : ""
    });
  });
  const saved = await saveLocalTasks(accountId, updated);
  const target = saved.find((item) => item.id === taskId);
  const userId = toFirestoreUserId(accountEmail);
  if (userId && target) {
    try {
      await setDoc(doc(firestore, "users", userId, "workout_plan", taskId), toFirestoreRecord(target), { merge: true });
    } catch (error) {
      console.warn("Unable to sync workout task completion to Firestore; local update kept", error);
    }
  }
  return saved;
}
