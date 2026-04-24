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
            <MaterialCommunityIcons name={tab.icon as never} size={16} color={selected ? palette.surface : palette.primary} />
            <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    padding: 4,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  pill: {
    flex: 1,
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pillSelected: {
    backgroundColor: palette.surface,
    borderColor: "#DDE7E0",
  },
  label: {
    color: palette.muted,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  labelSelected: {
    color: palette.primary,
  },
});
