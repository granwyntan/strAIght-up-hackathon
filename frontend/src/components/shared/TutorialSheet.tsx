import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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

  useEffect(() => {
    if (!visible) {
      return;
    }
    setActivePage(0);
    setTimeout(() => {
      guideScrollRef.current?.scrollTo?.({ x: 0, animated: false });
    }, 0);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${title}`}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
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
        </View>
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
    paddingTop: 20,
    paddingBottom: 0,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: palette.surface,
    padding: 20,
    gap: 12,
  },
  closeButton: {
    alignSelf: "flex-end",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
  },
  closeButtonText: {
    color: palette.primary,
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
    paddingVertical: 6,
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
  },
  footerText: {
    color: palette.muted,
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
});
