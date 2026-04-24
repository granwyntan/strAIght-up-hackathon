import React from "react";
import { StyleSheet, View } from "react-native";
import { SegmentedButtons } from "react-native-paper";

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
      <SegmentedButtons
        value={value}
        onValueChange={onValueChange}
        density="small"
        style={styles.buttons}
        buttons={tabs}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 6,
  },
  buttons: {
    backgroundColor: "transparent",
  },
});
