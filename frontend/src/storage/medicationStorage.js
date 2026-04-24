import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";

import { db } from "../lib/firebaseClient";

const BASE_MEDICATION_KEY = "gramwin.medication.log.v1";
const firestore = db;

function toFirestoreUserId(email) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(/@gmail\.com$/i, "");
}

function medicationKey(accountId) {
  const suffix = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "guest";
  return `${BASE_MEDICATION_KEY}.${suffix}`;
}

function normalizeMedication(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof source.name === "string" ? source.name.trim() : "",
    dosage: typeof source.dosage === "string" ? source.dosage.trim() : "",
    frequency: typeof source.frequency === "string" ? source.frequency.trim() : "",
    timeOfDay: typeof source.timeOfDay === "string" ? source.timeOfDay.trim() : "",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
  };
}

function normalizeMedications(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map(normalizeMedication).sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));
}

async function loadLocalMedications(accountId) {
  const raw = await AsyncStorage.getItem(medicationKey(accountId));
  if (!raw) {
    return [];
  }
  try {
    return normalizeMedications(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function saveLocalMedications(accountId, medications) {
  const normalized = normalizeMedications(medications);
  await AsyncStorage.setItem(medicationKey(accountId), JSON.stringify(normalized));
  return normalized;
}

function toFirestoreRecord(item) {
  return {
    name: item.name,
    dosage: item.dosage,
    frequency: item.frequency,
    time_of_day: item.timeOfDay,
    created_at: item.createdAt,
  };
}

function fromFirestoreRecord(id, data) {
  return normalizeMedication({
    id,
    name: data?.name,
    dosage: data?.dosage,
    frequency: data?.frequency,
    timeOfDay: data?.time_of_day,
    createdAt: data?.created_at,
  });
}

export async function loadMedicationEntries(accountId, accountEmail) {
  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return loadLocalMedications(accountId);
  }
  try {
    const snapshot = await getDocs(collection(firestore, "users", userId, "medication_log"));
    const items = snapshot.docs.map((entry) => fromFirestoreRecord(entry.id, entry.data()));
    await saveLocalMedications(accountId, items);
    return items;
  } catch (error) {
    console.warn("Unable to load medication log from Firestore; falling back to local", error);
    return loadLocalMedications(accountId);
  }
}

export async function addMedicationEntry(accountId, entry, accountEmail) {
  const next = normalizeMedication(entry);
  const existing = await loadLocalMedications(accountId);
  await saveLocalMedications(accountId, [...existing, next]);

  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return next;
  }
  try {
    await setDoc(doc(firestore, "users", userId, "medication_log", next.id), toFirestoreRecord(next), { merge: true });
  } catch (error) {
    console.warn("Unable to save medication log entry to Firestore; local save kept", error);
  }
  return next;
}

export async function updateMedicationEntry(accountId, entryId, updates, accountEmail) {
  const existing = await loadLocalMedications(accountId);
  const updated = existing.map((item) =>
    item.id === entryId
      ? normalizeMedication({
          ...item,
          name: typeof updates?.name === "string" ? updates.name : item.name,
          dosage: typeof updates?.dosage === "string" ? updates.dosage : item.dosage,
          frequency: typeof updates?.frequency === "string" ? updates.frequency : item.frequency,
          timeOfDay: typeof updates?.timeOfDay === "string" ? updates.timeOfDay : item.timeOfDay,
          createdAt: item.createdAt,
        })
      : item
  );
  await saveLocalMedications(accountId, updated);

  const userId = toFirestoreUserId(accountEmail);
  const target = updated.find((item) => item.id === entryId);
  if (!userId || !target || !firestore) {
    return;
  }
  try {
    await setDoc(doc(firestore, "users", userId, "medication_log", entryId), toFirestoreRecord(target), { merge: true });
  } catch (error) {
    console.warn("Unable to update medication log entry in Firestore; local update kept", error);
  }
}

export async function deleteMedicationEntry(accountId, entryId, accountEmail) {
  const existing = await loadLocalMedications(accountId);
  const updated = existing.filter((item) => item.id !== entryId);
  await saveLocalMedications(accountId, updated);

  const userId = toFirestoreUserId(accountEmail);
  if (!userId || !firestore) {
    return;
  }
  try {
    await deleteDoc(doc(firestore, "users", userId, "medication_log", entryId));
  } catch (error) {
    console.warn("Unable to delete medication log entry in Firestore; local delete kept", error);
  }
}

