import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";

type ToolHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  icon?: string;
  onPressHelp?: () => void;
};

export default function ToolHeader({ eyebrow, title, subtitle, icon, onPressHelp }: ToolHeaderProps) {
  const showEyebrowRow = Boolean(icon || (eyebrow && eyebrow.trim()));

  return (
    <View style={styles.headerCard}>
      <View style={styles.accentOrb} />
      <View style={styles.headerTop}>
        <View style={styles.titleWrap}>
          {showEyebrowRow ? (
            <View style={styles.eyebrowRow}>
              {icon ? (
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons name={icon} size={16} color={palette.primary} />
                </View>
              ) : null}
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            </View>
          ) : null}
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {title}
            </Text>
            {onPressHelp ? (
              <Pressable style={styles.helpButton} onPress={onPressHelp} accessibilityRole="button" accessibilityLabel={`Open ${title} tutorial`}>
                <Text style={styles.helpButtonText}>?</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      <Text style={styles.subtitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.88}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FBFCFA",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 10,
    overflow: "hidden",
    shadowColor: "#173122",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  accentOrb: {
    position: "absolute",
    top: -24,
    right: -10,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: "rgba(124, 179, 66, 0.08)",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleWrap: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  eyebrow: {
    color: palette.primary,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  title: {
    color: palette.text,
    fontSize: 25,
    lineHeight: 31,
    fontFamily: "Poppins_700Bold",
    flexShrink: 1,
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "Poppins_400Regular",
  },
  helpButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.border,
    flexShrink: 0,
  },
  helpButtonText: {
    color: palette.primary,
    fontSize: 18,
    lineHeight: 20,
    fontFamily: "Poppins_700Bold",
  },
});
