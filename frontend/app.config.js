// Dynamic Expo config so web + native builds can access non-EXPO_PUBLIC env vars.
// We keep the variable names (FIREBASE_*) and expose them to the app via `expo.extra`.
const fs = require("fs");
const path = require("path");
const staticConfig = require("./app.json");

function parseDotenvFile(contents) {
  const out = {};
  for (const rawLine of String(contents || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadDotenvIntoProcessEnv(projectRootDir) {
  const candidates = [".env", ".env.local"];
  for (const filename of candidates) {
    const filePath = path.join(projectRootDir, filename);
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = parseDotenvFile(fs.readFileSync(filePath, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] == null) {
          process.env[key] = value;
        }
      }
    } catch {
      // Ignore dotenv read/parse errors; CI env vars still work.
    }
  }
}

module.exports = ({ config }) => {
  // Ensure local `expo start` / Expo Go can pick up FIREBASE_* without requiring EXPO_PUBLIC_.
  loadDotenvIntoProcessEnv(__dirname);

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
