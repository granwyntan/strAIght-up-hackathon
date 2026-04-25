import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { palette } from "../../data";

type SectionTab = {
  value: string;
  label: string;
  icon: string;
};

type SectionTabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  tabs: SectionTab[];
};

export default function SectionTabs({ value, onValueChange, tabs }: SectionTabsProps) {
  return (
    <View style={styles.card}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable key={tab.value} style={[styles.pill, selected && styles.pillSelected]} onPress={() => onValueChange(tab.value)}>
            <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
              <MaterialCommunityIcons name={tab.icon as never} size={16} color={selected ? palette.primary : palette.muted} />
            </View>
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 6,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    shadowColor: "#173122",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  pill: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  },
  pillSelected: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    shadowColor: palette.primary,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
    flexShrink: 0,
  },
  iconWrapSelected: {
    backgroundColor: palette.primarySoft,
  },
  label: {
    color: palette.muted,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    flexShrink: 1,
  },
  labelSelected: {
    color: palette.primary,
  },
});
