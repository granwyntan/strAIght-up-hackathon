// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Card, Chip, Text, TextInput } from "react-native-paper";

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
  saveProfile,
} from "../storage/profileStorage";
import { formatDisplayDateTime } from "../utils/dateTime";

const PROFILE_GUIDE_PAGES = [
  {
    title: "One health profile for the whole app",
    body: "Your profile now powers diet, supplements, and activity together so you do not have to repeat the same medical or goal context in every tool.",
  },
  {
    title: "Use the guide anytime",
    body: "Use the Guide button whenever you want help updating your profile fields.",
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
  const [guideVisible, setGuideVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [savingInline, setSavingInline] = useState(false);
  const [editingSectionKey, setEditingSectionKey] = useState("");
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});

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
    {
      key: "basic",
      title: "Basic info",
      fields: [
        { key: "name", label: "Name", multiline: false },
        { key: "age", label: "Age", multiline: false },
        { key: "gender", label: "Gender", multiline: false },
        { key: "country", label: "Country", multiline: false },
      ],
      body: [profile.name || "Name not set", profile.age ? `Age ${profile.age}` : "", profile.gender || "", profile.country || ""].filter(Boolean).join(" • ") || "Finish setup to add your basic details.",
    },
    {
      key: "health",
      title: "Health context",
      fields: [
        { key: "medicalConditions", label: "Medical conditions", multiline: true },
        { key: "allergies", label: "Allergies", multiline: true },
        { key: "medicalHistory", label: "Medical history", multiline: true },
      ],
      body: profile.medicalConditions || profile.allergies || profile.medicalHistory || "No health conditions, allergies, or notes added yet.",
    },
    {
      key: "lifestyle",
      title: "Lifestyle",
      fields: [
        { key: "activityLevel", label: "Activity level", multiline: false },
        { key: "sleepHours", label: "Sleep hours", multiline: false },
        { key: "sleepQuality", label: "Sleep quality", multiline: false },
        { key: "caffeineIntake", label: "Caffeine intake", multiline: false },
      ],
      body: [profile.activityLevel, profile.sleepHours ? `${profile.sleepHours}h sleep` : "", profile.sleepQuality, profile.caffeineIntake].filter(Boolean).join(" • ") || "Lifestyle details are still empty.",
    },
    {
      key: "diet",
      title: "Diet preferences",
      fields: [
        { key: "dietType", label: "Diet type", multiline: false },
        { key: "eatingPattern", label: "Eating pattern", multiline: false },
        { key: "goals", label: "Goals", multiline: true },
      ],
      body: [profile.dietType, profile.eatingPattern, (profile.foodDislikeTags || []).slice(0, 3).join(", "), profile.goals].filter(Boolean).join(" • ") || "Add diet style, eating pattern, and food dislikes.",
    },
    {
      key: "medications",
      title: "Medications and supplements",
      fields: [{ key: "medicationsOrSupplements", label: "Medications and supplements", multiline: true }],
      body: profile.medicationsOrSupplements || "No medications or supplements added yet.",
    },
    {
      key: "ai",
      title: "AI preferences",
      fields: [
        { key: "insightDepth", label: "Insight depth", multiline: false },
        { key: "recommendationStyle", label: "Recommendation style", multiline: false },
        { key: "storagePreference", label: "Storage preference", multiline: false },
      ],
      body: [profile.insightDepth, profile.recommendationStyle, profile.storagePreference].filter(Boolean).join(" • ") || "Using default AI settings.",
    },
  ];

  useEffect(() => {
    if (loadingProfile) {
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setSavingInline(true);
          await saveProfile(profile, accountId, accountEmail);
          setLastSyncedAt(new Date().toISOString());
        } finally {
          setSavingInline(false);
        }
      })();
    }, 450);
    return () => clearTimeout(timer);
  }, [profile, accountEmail, accountId, loadingProfile]);

  const updateField = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  function startSectionEdit(section) {
    const nextDrafts: Record<string, string> = {};
    section.fields.forEach((field) => {
      nextDrafts[field.key] = profile[field.key] || "";
    });
    setSectionDrafts(nextDrafts);
    setEditingSectionKey(section.key);
  }

  function saveSectionEdit(section) {
    setProfile((current) => {
      const updated = { ...current };
      section.fields.forEach((field) => {
        updated[field.key] = sectionDrafts[field.key] || "";
      });
      return updated;
    });
    setEditingSectionKey("");
    setSectionDrafts({});
  }

  return (
    <View style={styles.pageStack}>
      <SectionTabs
        value={"overview"}
        onValueChange={() => {}}
        tabs={[{ value: "overview", label: "Overview", icon: "account-heart-outline" }]}
      />

      {
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Card mode="contained" style={styles.heroCard}>
            <Card.Content style={styles.heroContent}>
              <View style={styles.flexOne}>
                <Text variant="titleLarge" style={styles.heroTitle}>
                  {profile.name || "Your profile"}
                </Text>
                <Text variant="bodyMedium" style={styles.heroBody}>
                  The app uses this profile to personalise food, supplement, and activity analysis across GramWIN.
                </Text>
              </View>
              <View style={styles.heroActionRow}>
                <Button mode="outlined" onPress={() => setEditorVisible(true)} textColor={palette.primary}>
                  Guided setup
                </Button>
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
                <View style={styles.rowBetween}>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    {section.title}
                  </Text>
                  {editingSectionKey === section.key ? (
                    <Button compact mode="contained" onPress={() => saveSectionEdit(section)} buttonColor={palette.primary}>
                      Save
                    </Button>
                  ) : (
                    <Button compact mode="outlined" onPress={() => startSectionEdit(section)} textColor={palette.primary}>
                      Edit
                    </Button>
                  )}
                </View>
                {editingSectionKey === section.key ? (
                  <View style={styles.cardStack}>
                    {section.fields.map((field) => (
                      <TextInput
                        key={field.key}
                        mode="outlined"
                        label={field.label}
                        value={sectionDrafts[field.key] || ""}
                        onChangeText={(value) => setSectionDrafts((current) => ({ ...current, [field.key]: value }))}
                        multiline={field.multiline}
                      />
                    ))}
                  </View>
                ) : (
                  <Text variant="bodyMedium" style={styles.bodyText}>
                    {section.body}
                  </Text>
                )}
              </Card.Content>
            </Card>
          ))}

          {!activeAccount ? (
            <Card mode="contained" style={styles.sectionCard}>
              <Card.Content style={styles.cardStack}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Optional account sync
                </Text>
                <Text variant="bodyMedium" style={styles.bodyText}>
                  Local saving is already active. Create or sign in only when you want synced profile/history across devices.
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
        </ScrollView>
      }

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
  heroActionRow: {
    marginTop: 4,
    alignItems: "flex-start",
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
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 4,
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
