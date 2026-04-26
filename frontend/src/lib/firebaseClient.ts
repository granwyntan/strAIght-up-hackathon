// @ts-nocheck
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

function ensureFirebaseConfig() {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((field) => Boolean(firebaseConfig[field]));
}

const firebaseAvailable = ensureFirebaseConfig();
const firebaseGlobal = globalThis;

if (firebaseAvailable && !firebaseGlobal.__GRAMWIN_FIREBASE_APP__) {
  firebaseGlobal.__GRAMWIN_FIREBASE_APP__ = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

const firebaseApp = firebaseAvailable ? firebaseGlobal.__GRAMWIN_FIREBASE_APP__ || null : null;

let auth = null;
let db = null;

if (firebaseApp) {
  db = firebaseGlobal.__GRAMWIN_FIREBASE_DB__ || getFirestore(firebaseApp);
  firebaseGlobal.__GRAMWIN_FIREBASE_DB__ = db;

  if (Platform.OS === "web") {
    auth = firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__ || getAuth(firebaseApp);
    firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__ = auth;
  } else {
    auth = firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__ || null;

    if (!auth) {
      try {
        auth = initializeAuth(firebaseApp, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      } catch (error) {
        const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
        if (message.includes("already")) {
          auth = getAuth(firebaseApp);
        } else {
          console.warn("Firebase Auth fell back to default React Native initialization.", error);
          auth = initializeAuth(firebaseApp);
        }
      }

      firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__ = auth;
    }
  }
}

export { firebaseApp, auth, db, firebaseAvailable };
