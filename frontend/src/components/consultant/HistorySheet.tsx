import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, View } from "react-native";
import { IconButton, Text, Button } from "react-native-paper";

import type { InvestigationDetail } from "../../data";
import { EmptyState, InvestigationResult, LoadingCard } from "./InvestigationResult";

export default function HistorySheet({
  visible,
  investigation,
  loading,
  onClose,
  onRestart,
  onDelete,
  onCancel,
  cancellingIds,
  styles,
  helpers,
}: {
  visible: boolean;
  investigation: InvestigationDetail | null;
  loading: boolean;
  onClose: () => void;
  onRestart: (investigation: InvestigationDetail) => void;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
  cancellingIds: string[];
  styles: any;
  helpers: any;
}) {
  const translateY = useRef(new Animated.Value(360)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : 360,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 120) {
            onClose();
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [onClose, translateY]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheetPanel, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.flexOne}>
              <Text variant="titleLarge" style={styles.formTitle}>
                Saved investigation
              </Text>
              <Text variant="bodySmall" style={styles.historyMetaLine}>
                Review the saved report, reopen the evidence, or run the claim again.
              </Text>
            </View>
            <IconButton icon="close" onPress={onClose} iconColor={helpers.paletteText ?? "#111827"} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardStack}>
            {loading ? (
              <LoadingCard text="Loading saved investigation..." styles={styles} />
            ) : investigation ? (
              <>
                {helpers.safeTrim(investigation.context) ? (
                  <View style={styles.resultSectionCard}>
                    <View style={styles.cardStack}>
                      <Text variant="titleMedium" style={styles.linkTitle}>
                        Saved context
                      </Text>
                      <Text variant="bodyMedium" style={styles.sectionBody}>
                        {investigation.context}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <InvestigationResult investigation={investigation} styles={styles} helpers={helpers} />
                <View style={styles.resultActionRow}>
                  {helpers.isRunning(investigation.status) ? (
                    <Button
                      mode="outlined"
                      icon="stop-circle-outline"
                      textColor={helpers.paletteWarning ?? "#D97706"}
                      onPress={() => onCancel(investigation.id)}
                      loading={cancellingIds.includes(investigation.id)}
                      disabled={cancellingIds.includes(investigation.id)}
                    >
                      {cancellingIds.includes(investigation.id) ? "Stopping..." : "Stop run"}
                    </Button>
                  ) : (
                    <Button mode="contained" icon="playlist-edit" buttonColor={helpers.palettePrimary} onPress={() => onRestart(investigation)}>
                      Edit and rerun
                    </Button>
                  )}
                  <Button mode="outlined" icon="delete-outline" textColor={helpers.paletteDanger} onPress={() => onDelete(investigation.id)}>
                    Delete this investigation
                  </Button>
                </View>
              </>
            ) : (
              <EmptyState title="Nothing to show" body="That saved investigation could not be loaded right now." styles={styles} />
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
