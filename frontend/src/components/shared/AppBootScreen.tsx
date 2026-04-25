import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator } from "react-native-paper";

import { palette } from "../../data";

const APP_ICON = require("../../../assets/app-icons/app-icon.png");

type AppBootScreenProps = {
  title?: string;
  subtitle?: string;
  detail?: string;
};

export default function AppBootScreen({
  title = "GramWIN",
  subtitle = "Loading your health workspace",
  detail = "Preparing the latest data, analysis tools, and saved context.",
}: AppBootScreenProps) {
  return (
    <View style={styles.screen}>
      <LinearGradient colors={["#F7FBF8", "#EEF5FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.glowCard}>
        <View style={styles.iconHalo}>
          <Image source={APP_ICON} style={styles.icon} resizeMode="cover" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Health intelligence</Text>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {title}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
        <View style={styles.loaderRow}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.loaderText}>Starting up</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  glowCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DCE7E0",
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "center",
    gap: 18,
    shadowColor: "#173122",
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  iconHalo: {
    width: 102,
    height: 102,
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    shadowColor: palette.primary,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  icon: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  copy: {
    width: "100%",
    alignItems: "center",
    gap: 6,
  },
  eyebrow: {
    color: palette.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: palette.ink,
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    color: palette.ink,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    textAlign: "center",
  },
  detail: {
    color: palette.muted,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  loaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.border,
  },
  loaderText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
});
