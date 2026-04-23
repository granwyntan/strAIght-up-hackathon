import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";

type ToolHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: string;
  onPressHelp?: () => void;
};

export default function ToolHeader({ eyebrow, title, subtitle, icon, onPressHelp }: ToolHeaderProps) {
  return (
    <View style={styles.headerCard}>
      <View style={styles.headerTop}>
        <View style={styles.titleWrap}>
          <View style={styles.eyebrowRow}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name={icon} size={16} color={palette.primary} />
            </View>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        {onPressHelp ? (
          <Pressable style={styles.helpButton} onPress={onPressHelp} accessibilityRole="button" accessibilityLabel={`Open ${title} tutorial`}>
            <Text style={styles.helpButtonText}>?</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 10,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  titleWrap: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
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
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  helpButtonText: {
    color: palette.primary,
    fontSize: 18,
    lineHeight: 20,
    fontFamily: "Poppins_700Bold",
  },
});
