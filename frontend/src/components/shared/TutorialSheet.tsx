import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { palette } from "../../data";

type TutorialPage = {
  title: string;
  body: string;
};

type TutorialSheetProps = {
  visible: boolean;
  title: string;
  pages: TutorialPage[];
  onClose: () => void;
};

export default function TutorialSheet({ visible, title, pages, onClose }: TutorialSheetProps) {
  const guideScrollRef = useRef<ScrollView | null>(null);
  const [pageWidth, setPageWidth] = useState(320);
  const [activePage, setActivePage] = useState(0);
  const translateY = useRef(new Animated.Value(360)).current;

  useEffect(() => {
    if (visible) {
      setActivePage(0);
      setTimeout(() => {
        guideScrollRef.current?.scrollTo?.({ x: 0, animated: false });
      }, 0);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 72,
        friction: 10,
      }).start();
    } else {
      translateY.setValue(360);
    }
  }, [translateY, visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 120 || gesture.vy > 1.2) {
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
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.card, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${title}`}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            ref={guideScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onLayout={(event) => {
              const width = Math.max(280, Math.floor(event.nativeEvent.layout.width));
              setPageWidth(width);
            }}
            onScroll={(event) => {
              const width = pageWidth || 1;
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
              if (nextIndex !== activePage) {
                setActivePage(nextIndex);
              }
            }}
            scrollEventThrottle={16}
          >
            {pages.map((page, index) => (
              <View key={`${page.title}-${index}`} style={[styles.page, { width: pageWidth }]}>
                <Text style={styles.stepLabel}>Page {index + 1}</Text>
                <Text style={styles.pageTitle}>{page.title}</Text>
                <Text style={styles.pageBody}>{page.body}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {activePage + 1} / {pages.length}
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    maxWidth: 860,
    maxHeight: "86%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: palette.surface,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 12,
  },
  handle: {
    alignSelf: "center",
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
  },
  closeButtonText: {
    color: palette.text,
    fontSize: 20,
    lineHeight: 22,
    fontFamily: "Poppins_700Bold",
  },
  title: {
    color: palette.text,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: "Poppins_700Bold",
  },
  page: {
    gap: 10,
    paddingVertical: 8,
  },
  stepLabel: {
    color: palette.primary,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  pageTitle: {
    color: palette.text,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Poppins_700Bold",
  },
  pageBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "Poppins_400Regular",
  },
  footer: {
    alignItems: "flex-end",
    paddingBottom: 2,
  },
  footerText: {
    color: palette.muted,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
});
