import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCOUNTS_KEY = "gramwin.accounts.v1";
const ACTIVE_SESSION_KEY = "gramwin.session.v1";

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

function normalizeAccount(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    id: typeof source.id === "string" && source.id ? source.id : `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: normalizeEmail(source.email),
    password: normalizePassword(source.password),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString()
  };
}

async function loadAccounts() {
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeAccount).filter((account) => account.email);
  } catch {
    return [];
  }
}

async function saveAccounts(accounts) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.map(normalizeAccount)));
}

export async function loginOrRegisterAccount(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);
  if (!normalizedEmail || !normalizedPassword) {
    throw new Error("Email and password are required.");
  }

  const accounts = await loadAccounts();
  const existing = accounts.find((account) => account.email === normalizedEmail);
  if (existing) {
    if (existing.password !== normalizedPassword) {
      throw new Error("Incorrect password for this email.");
    }
    await AsyncStorage.setItem(ACTIVE_SESSION_KEY, existing.id);
    return { id: existing.id, email: existing.email, createdAt: existing.createdAt };
  }

  const next = normalizeAccount({ email: normalizedEmail, password: normalizedPassword });
  const updated = [next, ...accounts];
  await saveAccounts(updated);
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY, next.id);
  return { id: next.id, email: next.email, createdAt: next.createdAt };
}

export async function getActiveSessionAccount() {
  const sessionAccountId = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
  if (!sessionAccountId) {
    return null;
  }
  const accounts = await loadAccounts();
  const match = accounts.find((account) => account.id === sessionAccountId);
  if (!match) {
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    return null;
  }
  return { id: match.id, email: match.email, createdAt: match.createdAt };
}

export async function logoutActiveSession() {
  await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
}
