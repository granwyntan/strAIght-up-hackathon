import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

import { firebaseAuth } from "../lib/firebaseClient";

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

function mapAuthError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/missing-password" || code === "auth/invalid-password") {
    return "Please enter a valid password.";
  }
  if (code === "auth/weak-password") {
    return "Password should be at least 6 characters.";
  }
  if (code === "auth/email-already-in-use") {
    return "This email is already in use.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Incorrect email or password.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Check your internet connection and try again.";
  }
  return "Unable to continue with account authentication.";
}

function toSessionAccount(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.uid,
    email: normalizeEmail(user.email),
    createdAt: user.metadata?.creationTime || undefined
  };
}

export async function loginOrRegisterAccount(email, password) {
  if (!firebaseAuth) {
    throw new Error("Firebase authentication is not configured for this build.");
  }
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);
  if (!normalizedEmail || !normalizedPassword) {
    throw new Error("Email and password are required.");
  }

  try {
    const created = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, normalizedPassword);
    return toSessionAccount(created.user);
  } catch (createError) {
    const createCode = typeof createError?.code === "string" ? createError.code : "";
    if (createCode !== "auth/email-already-in-use") {
      throw new Error(mapAuthError(createError));
    }
  }

  try {
    const loggedIn = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, normalizedPassword);
    return toSessionAccount(loggedIn.user);
  } catch (signInError) {
    throw new Error(mapAuthError(signInError));
  }
}

export async function getActiveSessionAccount() {
  if (!firebaseAuth) {
    return null;
  }
  return toSessionAccount(firebaseAuth.currentUser);
}

export function subscribeToActiveSession(onChange) {
  if (!firebaseAuth) {
    onChange?.(null);
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth, (user) => {
    onChange?.(toSessionAccount(user));
  });
}

export async function logoutActiveSession() {
  if (!firebaseAuth) {
    return;
  }
  await signOut(firebaseAuth);
}
