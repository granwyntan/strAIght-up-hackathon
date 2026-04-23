// @ts-nocheck
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { palette } from "../../data";

export default function AuthGate({ onAuthenticate, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    setError("");
    try {
      await onAuthenticate?.(trimmedEmail, password);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to continue.");
    }
  };

  return (
    <View style={styles.shell}>
      <View style={styles.card}>
        <Text style={styles.title}>Optional account sync</Text>
        <Text style={styles.subtitle}>Stay local-only if you want. Sign in here only when you want your profile and history synced across devices.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={() => void submit()} disabled={loading}>
          {loading ? <ActivityIndicator color="#fffdfa" size="small" /> : null}
          <Text style={styles.buttonText}>{loading ? "Signing in..." : "Login / Create account"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 0,
    padding: 0
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 12
  },
  title: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "800"
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20
  },
  field: {
    gap: 6
  },
  label: {
    color: palette.ink,
    fontWeight: "700",
    fontSize: 13
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdf9",
    paddingHorizontal: 12,
    color: palette.ink
  },
  error: {
    color: palette.red,
    fontSize: 13
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: "#fffdfa",
    fontWeight: "800",
    fontSize: 15
  }
});
