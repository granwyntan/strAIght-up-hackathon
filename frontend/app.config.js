// Dynamic Expo config so Vercel/CI can inject non-EXPO_PUBLIC env vars at build time.
// This keeps your desired variable names (FIREBASE_*) while still making them available
// to the client bundle via `expo.extra`.
const staticConfig = require("./app.json");

module.exports = ({ config }) => {
  const base = staticConfig.expo || config || {};

  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY || "",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
        projectId: process.env.FIREBASE_PROJECT_ID || "",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
        appId: process.env.FIREBASE_APP_ID || "",
      },
    },
  };
};

