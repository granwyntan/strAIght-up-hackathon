import React from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { IconButton, Surface, Text, TouchableRipple } from "react-native-paper";

import { palette, type AppTab } from "../../data";
import type { MaterialIconName } from "../consultant/types";

export function Header({
  brand,
  tagline,
  apiError: _apiError,
  onRetry: _onRetry,
  styles,
}: {
  brand: string;
  tagline: string;
  apiError?: string | null;
  onRetry?: () => void;
  styles: any;
}) {
  return (
    <Surface style={styles.headerSurface} elevation={0}>
      <View style={styles.headerTop}>
        <View style={styles.headerBrandWrap}>
          <Text variant="headlineSmall" style={styles.headerTitle}>
            {brand}
          </Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            {tagline}
          </Text>
        </View>
      </View>
      <Text variant="bodySmall" style={styles.headerMicrocopy}>
        A calmer health dashboard with claim checking, medication support, and saved investigations in one place.
      </Text>
    </Surface>
  );
}

export function ToolHeader({
  title,
  body,
  apiError: _apiError,
  onRetry: _onRetry,
  onPressHelp,
  styles,
}: {
  title: string;
  body: string;
  apiError?: string | null;
  onRetry?: () => void;
  onPressHelp?: () => void;
  styles: any;
}) {
  return (
    <Surface style={styles.toolHeaderSurface} elevation={0}>
      <View style={styles.headerTop}>
        <View style={styles.headerBrandWrap}>
          <Text variant="headlineSmall" style={styles.headerTitle}>
            {title}
          </Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            {body}
          </Text>
        </View>
        {onPressHelp ? (
          <IconButton
            icon="help-circle-outline"
            onPress={onPressHelp}
            iconColor={palette.primary}
            style={styles.headerHelpButton}
          />
        ) : null}
      </View>
    </Surface>
  );
}

export function BottomTabs({
  activeTab,
  onSelect,
  bottomInset,
  styles,
}: {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
  bottomInset: number;
  styles: any;
}) {
  const tabs: Array<{ key: AppTab; label: string; icon: string; iconInactive?: string }> = [
    { key: "home", label: "Home", icon: "home-heart" },
    { key: "consultant", label: "Verify", icon: "stethoscope" },
    { key: "diet", label: "Scanner", icon: "food-apple-outline" },
    { key: "activity", label: "Activity", icon: "run" },
    { key: "profile", label: "Profile", icon: "account-circle-outline" },
  ];

  return (
    <Surface style={[styles.bottomTabs, { bottom: bottomInset }]} elevation={2}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.key;
        return (
          <TouchableRipple key={tab.key} style={styles.bottomTabItem} onPress={() => onSelect(tab.key)}>
            <View style={styles.bottomTabContent}>
              <View style={[styles.bottomTabBubble, selected && styles.bottomTabBubbleSelected]}>
                <MaterialCommunityIcons
                  name={(selected ? tab.icon : tab.iconInactive || tab.icon) as MaterialIconName}
                  size={20}
                  color={palette.primary}
                />
              </View>
              <Text variant="labelSmall" style={[styles.bottomTabLabel, selected && styles.bottomTabLabelSelected]}>
                {tab.label}
              </Text>
            </View>
          </TouchableRipple>
        );
      })}
    </Surface>
  );
}
