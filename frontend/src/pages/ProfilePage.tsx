// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Card, Chip, Text } from "react-native-paper";

import AuthGate from "../components/auth/AuthGate";
import OnboardingSheet from "../components/profile/OnboardingSheet";
import SectionTabs from "../components/shared/SectionTabs";
import TutorialSheet from "../components/shared/TutorialSheet";
import { palette } from "../data";
import {
  buildActivityProfileContext,
  buildDietProfileContext,
  buildSupplementProfileContext,
  calculateBmiValue,
  emptyProfile,
  loadProfile,
  loadProfileLastSynced,
  profileCompletionSummary,
} from "../storage/profileStorage";
import { formatDisplayDateTime } from "../utils/dateTime";

const PROFILE_GUIDE_PAGES = [
  {
    title: "One health profile for the whole app",
    body: "Your profile now powers diet, supplements, and activity together so you do not have to repeat the same medical or goal context in every tool.",
  },
  {
    title: "Guided setup beats long forms",
    body: "Use the guided setup when you want to add or update your profile. It keeps the experience step-based, faster to scan, and easier to finish.",
  },
  {
    title: "Local first, account optional",
    body: "GramWIN still works without an account. Sign in only when you want your profile and history synced across devices.",
  },
];

export default function ProfilePage({ accountId, accountEmail, activeAccount, authLoading, requestApi, onAuthenticate, onLogout }) {
  const [profile, setProfile] = useState(emptyProfile);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [guideVisible, setGuideVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      setLoadingProfile(true);
      try {
        const saved = await loadProfile(accountId, accountEmail);
        const syncedAt = await loadProfileLastSynced(accountId, accountEmail);
        if (!mounted) {
          return;
        }
        setProfile(saved);
        setLastSyncedAt(syncedAt);
      } finally {
        if (mounted) {
          setLoadingProfile(false);
        }
      }
    };
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [accountEmail, accountId]);

  const completion = useMemo(() => profileCompletionSummary(profile), [profile]);
  const bmiValue = useMemo(() => calculateBmiValue(profile), [profile]);
  const lastSyncedLabel = lastSyncedAt ? formatDisplayDateTime(lastSyncedAt) : "Saved locally";
  const summaryCards = [
    { label: "Profile readiness", value: `${Math.round(completion.progress * 100)}%`, detail: `${completion.completed}/${completion.total} sections in place`, icon: "account-check-outline" },
    { label: "BMI", value: typeof bmiValue === "number" ? bmiValue.toFixed(1) : "Pending", detail: "Auto-derived from height and weight", icon: "human" },
    { label: "Goals", value: profile.goals || "Pending", detail: "Diet and activity focus", icon: "target" },
    { label: "Sync", value: activeAccount ? "Connected" : "Local", detail: lastSyncedLabel, icon: activeAccount ? "cloud-check-outline" : "cellphone-lock" },
  ];

  const overviewSections = [
    { title: "Basic info", body: [profile.name || "Name not set", profile.age ? `Age ${profile.age}` : "", profile.gender || "", profile.country || ""].filter(Boolean).join(" • ") || "Finish setup to add your basic details." },
    { title: "Health context", body: profile.medicalConditions || profile.allergies || profile.medicalHistory || "No health conditions, allergies, or notes added yet." },
    { title: "Lifestyle", body: [profile.activityLevel, profile.sleepHours ? `${profile.sleepHours}h sleep` : "", profile.sleepQuality, profile.caffeineIntake].filter(Boolean).join(" • ") || "Lifestyle details are still empty." },
    { title: "Diet preferences", body: [profile.dietType, profile.eatingPattern, (profile.foodDislikeTags || []).slice(0, 3).join(", ")].filter(Boolean).join(" • ") || "Add diet style, eating pattern, and food dislikes." },
    { title: "Medications and supplements", body: profile.medicationsOrSupplements || "No medications or supplements added yet." },
    { title: "AI preferences", body: [profile.insightDepth, profile.recommendationStyle, profile.storagePreference].filter(Boolean).join(" • ") || "Using default AI settings." },
  ];

  return (
    <View style={styles.pageStack}>
      <SectionTabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "overview" | "settings")}
        tabs={[
          { value: "overview", label: "Overview", icon: "account-heart-outline" },
          { value: "settings", label: "Settings", icon: "tune-variant" },
        ]}
      />

      {activeTab === "overview" ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Card mode="contained" style={styles.heroCard}>
            <Card.Content style={styles.heroContent}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text variant="titleLarge" style={styles.heroTitle}>
                    {profile.name || "Your profile"}
                  </Text>
                  <Text variant="bodyMedium" style={styles.heroBody}>
                    The app uses this profile to personalise food, supplement, and activity analysis across GramWIN.
                  </Text>
                </View>
                <Button mode="contained" onPress={() => setEditorVisible(true)} buttonColor={palette.primary}>
                  Guided setup
                </Button>
              </View>
              <View style={styles.statusRow}>
                <Chip style={styles.statusChip}>{activeAccount ? "Sync enabled" : "Local-only"}</Chip>
                <Chip style={styles.statusChip}>{lastSyncedLabel}</Chip>
              </View>
            </Card.Content>
          </Card>

          <View style={styles.metricGrid}>
            {summaryCards.map((item) => (
              <Card key={item.label} mode="contained" style={styles.metricCard}>
                <Card.Content style={styles.metricContent}>
                  <View style={styles.metricIconWrap}>
                    <MaterialCommunityIcons name={item.icon} size={18} color={palette.primary} />
                  </View>
                  <Text variant="labelMedium" style={styles.metricLabel}>
                    {item.label}
                  </Text>
                  <Text variant="titleMedium" style={styles.metricValue}>
                    {item.value}
                  </Text>
                  <Text variant="bodySmall" style={styles.metricDetail}>
                    {item.detail}
                  </Text>
                </Card.Content>
              </Card>
            ))}
          </View>

          {overviewSections.map((section) => (
            <Card key={section.title} mode="contained" style={styles.sectionCard}>
              <Card.Content style={styles.cardStack}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  {section.title}
                </Text>
                <Text variant="bodyMedium" style={styles.bodyText}>
                  {section.body}
                </Text>
              </Card.Content>
            </Card>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Guided editing
              </Text>
              <Text variant="bodyMedium" style={styles.bodyText}>
                Use the same step-based flow from onboarding to update your profile without digging through long forms.
              </Text>
              <Button mode="contained" onPress={() => setEditorVisible(true)} buttonColor={palette.primary}>
                Open guided setup
              </Button>
            </Card.Content>
          </Card>

          <Card mode="contained" style={styles.sectionCard}>
            <Card.Content style={styles.cardStack}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                How the profile is used
              </Text>
              <ContextBlock title="Diet workspace" body={buildDietProfileContext(profile) || "Add goals, conditions, and preferences to help food analysis become more personal."} />
              <ContextBlock title="Supplements" body={buildSupplementProfileContext(profile) || "Add conditions, medications, and current supplements to sharpen supplement safety checks."} />
              <ContextBlock title="Activity" body={buildActivityProfileContext(profile) || "Add goals, activity level, recovery, and medical context to improve routine suggestions."} />
            </Card.Content>
          </Card>

          {!activeAccount ? (
            <Card mode="contained" style={styles.sectionCard}>
              <Card.Content style={styles.cardStack}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Optional account sync
                </Text>
                <Text variant="bodyMedium" style={styles.bodyText}>
                  Local saving is already active. Create or sign in to an account only when you want the same profile and history across devices.
                </Text>
                <AuthGate onAuthenticate={onAuthenticate} loading={authLoading} />
              </Card.Content>
            </Card>
          ) : (
            <Card mode="contained" style={styles.sectionCard}>
              <Card.Content style={styles.cardStack}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Account
                </Text>
                <Text variant="bodyMedium" style={styles.bodyText}>
                  Signed in as {activeAccount.email}
                </Text>
                <Button mode="outlined" onPress={onLogout} textColor={palette.primary}>
                  Log out
                </Button>
              </Card.Content>
            </Card>
          )}

          <Button mode="text" onPress={() => setGuideVisible(true)} textColor={palette.primary}>
            Open profile tutorial
          </Button>
        </ScrollView>
      )}

      <OnboardingSheet
        visible={editorVisible}
        mode="edit"
        accountId={accountId}
        accountEmail={accountEmail}
        activeAccount={activeAccount}
        authLoading={authLoading}
        requestApi={requestApi}
        onAuthenticate={onAuthenticate}
        onClose={() => setEditorVisible(false)}
        onSaved={(nextProfile) => {
          setProfile(nextProfile);
          setLastSyncedAt(new Date().toISOString());
          setEditorVisible(false);
        }}
      />

      <TutorialSheet visible={guideVisible} title="Profile tutorial" pages={PROFILE_GUIDE_PAGES} onClose={() => setGuideVisible(false)} />
    </View>
  );
}

function ContextBlock({ title, body }) {
  return (
    <View style={styles.contextCard}>
      <Text variant="labelMedium" style={styles.contextLabel}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.bodyText}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 16,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 140,
  },
  heroCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroContent: {
    gap: 14,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  heroBody: {
    color: palette.muted,
    lineHeight: 22,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    backgroundColor: palette.surfaceSoft,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricContent: {
    gap: 8,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  metricLabel: {
    color: palette.muted,
    fontFamily: "Poppins_500Medium",
  },
  metricValue: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  metricDetail: {
    color: palette.muted,
    lineHeight: 18,
  },
  sectionCard: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardStack: {
    gap: 10,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  bodyText: {
    color: palette.muted,
    lineHeight: 21,
  },
  contextCard: {
    borderRadius: 14,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  contextLabel: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
});
