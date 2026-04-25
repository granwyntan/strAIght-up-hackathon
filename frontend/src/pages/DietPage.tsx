// @ts-nocheck
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import { palette } from "../data";
import CaloriesPage from "./CaloriesPage";
import SupplementsPage from "./SupplementsPage";

const DIET_TUTORIAL_PAGES = [
  {
    title: "One workspace, two analysis modes",
    body: "Use Diet for meals and drinks, then switch to Supplements for deeper reviews of supplements, medications, or label scans.",
  },
  {
    title: "Start broad, then open detail",
    body: "Summary cards give you the fast read first. Open the detailed sections only when you want the nutrient, ingredient, and evidence breakdown.",
  },
  {
    title: "History stays inside each tool",
    body: "Food and supplement history stay tied to their own analysis flow so saved entries keep the right context, visuals, and recommendations.",
  },
];

type DietPageProps = {
  requestApi: (path: string, init?: RequestInit, timeoutMsOverride?: number) => Promise<Response>;
  accountId?: string;
  accountEmail?: string;
  guideSignal?: number;
};

export default function DietPage({ requestApi, accountId, accountEmail, guideSignal = 0 }: DietPageProps) {
  const [activeMode, setActiveMode] = useState<"food" | "supplements">("food");
  const [guideVisible, setGuideVisible] = useState(false);
  const [foodGuideSignal, setFoodGuideSignal] = useState(0);
  const [supplementGuideSignal, setSupplementGuideSignal] = useState(0);

  useEffect(() => {
    if (guideSignal > 0) {
      setGuideVisible(true);
    }
  }, [guideSignal]);

  return (
    <View style={styles.pageStack}>
      <SectionTabs
        value={activeMode}
        onValueChange={(value) => setActiveMode(value as "food" | "supplements")}
        tabs={[
          { value: "food", label: "Diet", icon: "silverware-fork-knife" },
          { value: "supplements", label: "Nutraceuticals", icon: "pill-multiple" },
        ]}
      />

      <View style={activeMode === "food" ? undefined : styles.hiddenSection}>
        <CaloriesPage
          requestApi={requestApi}
          accountId={accountId}
          accountEmail={accountEmail}
          guideSignal={foodGuideSignal}
        />
      </View>

      <View style={activeMode === "supplements" ? undefined : styles.hiddenSection}>
        <SupplementsPage
          requestApi={requestApi}
          accountId={accountId}
          accountEmail={accountEmail}
          guideSignal={supplementGuideSignal}
        />
      </View>

      <TutorialSheet
        visible={guideVisible}
        title="Scanner tutorial"
        pages={DIET_TUTORIAL_PAGES}
        onClose={() => setGuideVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 16,
  },
  hiddenSection: {
    display: "none",
  },
});
