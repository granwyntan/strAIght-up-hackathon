// @ts-nocheck
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
    getAuth,
    getReactNativePersistence,
    initializeAuth,
} from "firebase/auth";

function readExpoExtraFirebase() {
    const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
    return extra?.firebase || {};
}

const extraFirebase = readExpoExtraFirebase();

const firebaseConfig = {
    // In Expo web (including Vercel builds), runtime env vars without EXPO_PUBLIC_ are not exposed
    // to the browser bundle. We inject FIREBASE_* into `expo.extra.firebase` via `app.config.js`.
    apiKey: extraFirebase.apiKey || process.env.FIREBASE_API_KEY,
    authDomain: extraFirebase.authDomain || process.env.FIREBASE_AUTH_DOMAIN,
    projectId: extraFirebase.projectId || process.env.FIREBASE_PROJECT_ID,
    storageBucket: extraFirebase.storageBucket || process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: extraFirebase.messagingSenderId || process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: extraFirebase.appId || process.env.FIREBASE_APP_ID,
};

function ensureFirebaseConfig() {
    const required = ["apiKey", "authDomain", "projectId", "appId"];
    return required.every((field) => Boolean(firebaseConfig[field]));
}

const firebaseAvailable = ensureFirebaseConfig();
const firebaseGlobal = globalThis;

if (firebaseAvailable && !firebaseGlobal.__GRAMWIN_FIREBASE_APP__) {
    firebaseGlobal.__GRAMWIN_FIREBASE_APP__ =
        getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

const firebaseApp = firebaseAvailable
    ? firebaseGlobal.__GRAMWIN_FIREBASE_APP__ || null
    : null;

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
                const message =
                    typeof error?.message === "string"
                        ? error.message.toLowerCase()
                        : "";
                if (message.includes("already")) {
                    auth = getAuth(firebaseApp);
                } else {
                    console.warn(
                        "Firebase Auth fell back to default React Native initialization.",
                        error,
                    );
                    auth = initializeAuth(firebaseApp);
                }
            }

            firebaseGlobal.__GRAMWIN_FIREBASE_AUTH__ = auth;
        }
    }
}

export { firebaseApp, auth, db, firebaseAvailable };
