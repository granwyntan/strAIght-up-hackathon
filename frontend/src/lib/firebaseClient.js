import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID || process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

function ensureFirebaseConfig() {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((field) => Boolean(firebaseConfig[field]));
}

const firebaseAvailable = ensureFirebaseConfig();
const firebaseGlobal = globalThis;

if (firebaseAvailable && !firebaseGlobal.__GRAMWIN_FIREBASE_APP__) {
  firebaseGlobal.__GRAMWIN_FIREBASE_APP__ = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

const firebaseApp = firebaseAvailable ? firebaseGlobal.__GRAMWIN_FIREBASE_APP__ || null : null;

if (firebaseApp && !firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__) {
  firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__ = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

if (firebaseApp && !firebaseGlobal.__GRAMWIN_FIREBASE_DB__) {
  firebaseGlobal.__GRAMWIN_FIREBASE_DB__ = getFirestore(firebaseApp);
}

const auth = firebaseApp ? firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__ || null : null;
const db = firebaseApp ? firebaseGlobal.__GRAMWIN_FIREBASE_DB__ || null : null;

export { firebaseApp, auth, db, firebaseAvailable };
