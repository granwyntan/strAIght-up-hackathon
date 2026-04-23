import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

function ensureFirebaseConfig() {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((field) => Boolean(firebaseConfig[field]));
}

const firebaseAvailable = ensureFirebaseConfig();
const firebaseApp = firebaseAvailable ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) : null;

let firebaseAuth = null;

if (firebaseApp) {
  if (Platform.OS === "web") {
    firebaseAuth = getAuth(firebaseApp);
  } else {
    try {
      // eslint-disable-next-line global-require
      const { getReactNativePersistence } = require("firebase/auth/react-native");
      firebaseAuth = initializeAuth(firebaseApp, {
        persistence: getReactNativePersistence(AsyncStorage)
      });
    } catch {
      firebaseAuth = getAuth(firebaseApp);
    }
  }
}

export { firebaseApp, firebaseAuth, firebaseAvailable };
