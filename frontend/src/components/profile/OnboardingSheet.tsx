// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Card, Chip, ProgressBar, Text, TextInput } from "react-native-paper";

import AuthGate from "../auth/AuthGate";
import { palette } from "../../data";
import {
  ACTIVITY_GOAL_GROUPS,
  ACTIVITY_LEVEL_OPTIONS,
  ALCOHOL_OPTIONS,
  ALLERGY_SEVERITY_OPTIONS,
  ALLERGY_GROUPS,
  CAFFEINE_OPTIONS,
  COMMON_MEDICATION_OPTIONS,
  COMMON_SUPPLEMENT_OPTIONS,
  DIET_GOAL_GROUPS,
  DIET_TYPE_GROUPS,
  EATING_PATTERN_GROUPS,
  FAMILY_HISTORY_GROUPS,
  FOOD_PREFERENCE_SUGGESTIONS,
  HEALTH_CONDITION_GROUPS,
  INSIGHT_DEPTH_OPTIONS,
  ONBOARDING_STEPS,
  PROFILE_AUTOCOMPLETE_SYNONYMS,
  PROFILE_GOOGLE_SEARCH_HINTS,
  RECOMMENDATION_STYLE_OPTIONS,
  RELIGIOUS_RESTRICTION_OPTIONS,
  SEX_OPTIONS,
  SLEEP_QUALITY_OPTIONS,
  SMOKING_OPTIONS,
  STRESS_LEVEL_OPTIONS,
} from "../../profile/options";
import { DRUG_OPTIONS } from "../../profile/drugOptions";
import {
  calculateBmiValue,
  calculateBmrValue,
  emptyProfile,
  loadProfile,
  normalizeProfile,
  profileCompletionSummary,
  saveProfile,
} from "../../storage/profileStorage";

function cleanTagValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeLower(value) {
  return cleanTagValue(value).toLowerCase();
}

function normalizeOptionList(values) {
  return (Array.isArray(values) ? values : []).map((item) => cleanTagValue(item)).filter(Boolean);
}

function toggleArrayItem(values, nextValue) {
  const cleaned = cleanTagValue(nextValue);
  if (!cleaned) {
    return values || [];
  }
  const current = Array.isArray(values) ? values : [];
  return current.includes(cleaned) ? current.filter((item) => item !== cleaned) : [...current, cleaned];
}

function normalizeFreeformTerm(rawValue, allowedOptions) {
  const cleaned = cleanTagValue(rawValue);
  if (!cleaned) {
    return "";
  }
  const lower = safeLower(cleaned);
  const mapped = PROFILE_AUTOCOMPLETE_SYNONYMS[lower];
  if (mapped) {
    return mapped;
  }
  const normalizedOptions = normalizeOptionList(allowedOptions);
  const direct = normalizedOptions.find((option) => safeLower(option) === lower);
  if (direct) {
    return direct;
  }
  const partial = normalizedOptions.find((option) => safeLower(option).includes(lower) || lower.includes(safeLower(option)));
  if (partial) {
    return partial;
  }
  return cleaned;
}

async function fetchGoogleAutocomplete(query, contextHint = "", requestApi) {
  const cleaned = cleanTagValue(query);
  if (typeof requestApi !== "function") {
    return [];
  }
  if (!cleaned || cleaned.length < 2) {
    return [];
  }
  try {
    if (typeof requestApi !== "function") {
      return [];
    }
    const response = await requestApi(
      `/api/search-suggestions?q=${encodeURIComponent(cleaned)}&hint=${encodeURIComponent(cleanTagValue(contextHint))}`,
      undefined,
      3500
    );
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.map((item) => cleanTagValue(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function searchHintForTitle(title) {
  return PROFILE_GOOGLE_SEARCH_HINTS[cleanTagValue(title)] || "";
}

function buildOverlayGroups(baseGroups, suggestionGroups) {
  return [...(Array.isArray(suggestionGroups) ? suggestionGroups : []), ...(Array.isArray(baseGroups) ? baseGroups : [])].filter(
    (group) => group && cleanTagValue(group.label) && Array.isArray(group.options) && group.options.length > 0
  );
}

function buildSuggestionGroups({ googleSuggestions, selectedValues }) {
  const selectedSet = new Set(normalizeOptionList(selectedValues));
  const groups = [];

  const googleOptions = normalizeOptionList(
    (Array.isArray(googleSuggestions) ? googleSuggestions : [])
      .filter((item) => item && !selectedSet.has(item))
  ).slice(0, 6);

  if (googleOptions.length > 0) {
    groups.push({ label: "Google suggestions", options: googleOptions });
  }

  return groups;
}

function clampGroupOptions(groups, limit = 24) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      ...group,
      options: normalizeOptionList(group.options).slice(0, limit),
    }))
    .filter((group) => group.options.length > 0);
}

const DRUG_LIBRARY_OPTIONS = normalizeOptionList(DRUG_OPTIONS as unknown as string[]);

type OnboardingSheetProps = {
  visible: boolean;
  mode?: "setup" | "edit";
  accountId?: string;
  accountEmail?: string;
  activeAccount?: { id: string; email: string; createdAt?: string } | null;
  authLoading?: boolean;
  requestApi?: (path: string, init?: RequestInit, timeoutMsOverride?: number) => Promise<Response>;
  onAuthenticate?: (email: string, password: string) => Promise<any>;
  onClose: () => void;
  onSaved?: (profile: any) => void;
};

export default function OnboardingSheet({
  visible,
  mode = "setup",
  accountId,
  accountEmail,
  activeAccount,
  authLoading = false,
  requestApi,
  onAuthenticate,
  onClose,
  onSaved,
}: OnboardingSheetProps) {
  const [draft, setDraft] = useState({ ...emptyProfile });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  async function refreshDraftForAccount(nextAccountId?: string, nextAccountEmail?: string) {
    const profile = await loadProfile(nextAccountId ?? accountId, nextAccountEmail ?? accountEmail);
    const normalized = normalizeProfile(profile);
    setDraft({
      ...normalized,
      storagePreference: nextAccountEmail || activeAccount ? "Sync if signed in" : "Local",
    });
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    let mounted = true;
    setLoading(true);
    void loadProfile(accountId, accountEmail)
      .then((profile) => {
        if (!mounted) {
          return;
        }
        const normalized = normalizeProfile(profile);
        setDraft({
          ...normalized,
          storagePreference: activeAccount ? "Sync if signed in" : "Local",
        });
        setStepIndex(0);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [visible, accountEmail, accountId, activeAccount]);

  const completion = useMemo(() => profileCompletionSummary(draft), [draft]);
  const bmiValue = useMemo(() => calculateBmiValue(draft), [draft]);
  const bmrValue = useMemo(() => calculateBmrValue(draft), [draft]);
  const currentStep = ONBOARDING_STEPS[stepIndex];
  const canGoBack = stepIndex > 0;
  const isFinalStep = stepIndex === ONBOARDING_STEPS.length - 1;

  function updateField(field, value) {
    setDraft((current) => normalizeProfile({ ...current, [field]: value }));
  }

  function toggleFieldItem(field, value, allowedOptions) {
    const normalizedValue = normalizeFreeformTerm(value, allowedOptions);
    if (!normalizedValue) {
      return;
    }
    setDraft((current) =>
      normalizeProfile({
        ...current,
        [field]: toggleArrayItem(current[field], normalizedValue),
      })
    );
  }

  async function persist(status) {
    setSaving(true);
    try {
      const payload = normalizeProfile({
        ...draft,
        storagePreference: activeAccount ? "Sync if signed in" : "Local",
        onboardingStatus: status,
        onboardingCompletedAt: status === "complete" ? new Date().toISOString() : draft.onboardingCompletedAt,
        onboardingSkippedAt: status === "skipped" ? new Date().toISOString() : draft.onboardingSkippedAt,
      });
      const saved = await saveProfile(payload, accountId, accountEmail);
      onSaved?.(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function continueStep() {
    // Always go to next page - don't close on first step
    if (isFinalStep) {
      void persist("complete");
      return;
    }
    setStepIndex((current) => Math.min(ONBOARDING_STEPS.length - 1, current + 1));
  }

  function goBack() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function skipForNow() {
    // Skip saves any entered data locally and closes modal
    // User can continue editing profile later
    void persist("skipped");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => (mode === "edit" ? onClose() : undefined)}>
      <View style={styles.backdrop}>
        {mode === "edit" ? <Pressable style={StyleSheet.absoluteFill} onPress={onClose} /> : null}
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.flexOne}>
              <Text variant="titleLarge" style={styles.titleText}>
                {mode === "setup" ? "Set up your GramWIN profile" : "Edit your health profile"}
              </Text>
            </View>
            {mode === "edit" ? (
              <Pressable style={styles.closeButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={20} color={palette.text} />
              </Pressable>
            ) : null}
          </View>

          <Card mode="contained" style={styles.progressCard}>
            <Card.Content style={styles.cardStack}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text variant="labelMedium" style={styles.stepEyebrow}>
                    Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
                  </Text>
                  <Text variant="titleMedium" style={styles.stepTitle}>
                    {currentStep.title}
                  </Text>
                </View>
                <Chip compact style={styles.progressChip}>
                  {Math.round(completion.progress * 100)}% ready
                </Chip>
              </View>
              <ProgressBar progress={(stepIndex + 1) / ONBOARDING_STEPS.length} color={palette.primary} style={styles.progressBar} />
            </Card.Content>
          </Card>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardArea}>
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            >
              {loading ? (
                <Card mode="contained" style={styles.sectionCard}>
                  <Card.Content>
                    <Text variant="bodyMedium" style={styles.bodyText}>
                      Loading your profile...
                    </Text>
                  </Card.Content>
                </Card>
              ) : (
                <>
                  {currentStep.key === "account" ? (
                    <>
                      <Card mode="contained" style={styles.sectionCard}>
                        <Card.Content style={styles.cardStack}>
                          <Text variant="titleMedium" style={styles.sectionTitle}>
                            Create an account or stay local
                          </Text>
                          <Text variant="bodySmall" style={styles.bodyText}>
                            Sign in with email and password if you want your profile and history restored across devices. If you continue without an account, GramWIN keeps everything local on this device.
                          </Text>
                          {activeAccount ? (
                            <View style={styles.accountPill}>
                              <MaterialCommunityIcons name="cloud-check-outline" size={18} color={palette.primary} />
                              <Text variant="bodyMedium" style={styles.accountText}>
                                Signed in as {activeAccount.email}
                              </Text>
                            </View>
                          ) : (
                            <AuthGate
                              onAuthenticate={async (email, password) => {
                                const account = await onAuthenticate?.(email, password);
                                await refreshDraftForAccount(account?.id, account?.email);
                              }}
                              loading={authLoading}
                              title="Create an account or sign in"
                              subtitle="Email and password only for now. You can also skip and keep everything local on this device."
                            />
                          )}
                          <View style={styles.storageInfoCard}>
                            <MaterialCommunityIcons
                              name={activeAccount ? "cloud-sync-outline" : "cellphone-lock"}
                              size={18}
                              color={activeAccount ? palette.primary : palette.text}
                            />
                            <Text variant="bodySmall" style={styles.bodyText}>
                              {activeAccount
                                ? "Your profile will sync to your account. If you sign out, local data clears from this device and reloads the next time you sign back in."
                                : "No account means local-only storage on this device. You can add an account later if you want cloud restore."}
                            </Text>
                          </View>
                        </Card.Content>
                      </Card>
                    </>
                  ) : null}

                  {currentStep.key === "basic" ? (
                    <Card mode="contained" style={styles.sectionCard}>
                      <Card.Content style={styles.cardStack}>
                        <Text variant="titleMedium" style={styles.sectionTitle}>
                          Basic information
                        </Text>
                        <Field label="Name (optional)" value={draft.name} onChangeText={(value) => updateField("name", value)} placeholder="Preferred name" />
                        <Field label="Age" value={draft.age} onChangeText={(value) => updateField("age", value)} placeholder="Age" keyboardType="numeric" />
                        <ChoiceChips label="Sex" value={draft.gender} options={SEX_OPTIONS} onSelect={(value) => updateField("gender", value)} />
                        <Field label="Country" value={draft.country} onChangeText={(value) => updateField("country", value)} placeholder="Country" />
                        <Field label="Region / city (optional)" value={draft.region} onChangeText={(value) => updateField("region", value)} placeholder="Region or city" />
                      </Card.Content>
                    </Card>
                  ) : null}

                  {currentStep.key === "body" ? (
                    <>
                      <Card mode="contained" style={styles.sectionCard}>
                        <Card.Content style={styles.cardStack}>
                          <Text variant="titleMedium" style={styles.sectionTitle}>
                            Body metrics
                          </Text>
                          <Field label="Height (cm)" value={draft.height} onChangeText={(value) => updateField("height", value)} placeholder="Height in cm" keyboardType="numeric" />
                          <Field label="Weight (kg)" value={draft.weight} onChangeText={(value) => updateField("weight", value)} placeholder="Weight in kg" keyboardType="numeric" />
                          <Field label="Body fat % (optional)" value={draft.bodyFatPercentage} onChangeText={(value) => updateField("bodyFatPercentage", value)} placeholder="Body fat percentage" keyboardType="numeric" />
                          <Field label="Muscle mass (optional)" value={draft.muscleMass} onChangeText={(value) => updateField("muscleMass", value)} placeholder="Muscle mass estimate" keyboardType="numeric" />
                          <Field label="Waist circumference (optional)" value={draft.waistCircumference} onChangeText={(value) => updateField("waistCircumference", value)} placeholder="Waist circumference" keyboardType="numeric" />
                        </Card.Content>
                      </Card>
                      <Card mode="contained" style={styles.sectionCard}>
                        <Card.Content style={styles.cardStack}>
                          <Text variant="titleMedium" style={styles.sectionTitle}>
                            Current snapshot
                          </Text>
                          <SummaryStat label="BMI" value={typeof bmiValue === "number" ? bmiValue.toFixed(1) : "Waiting for height and weight"} />
                          <SummaryStat label="Basal metabolic rate" value={typeof bmrValue === "number" ? `${Math.round(bmrValue)} kcal/day` : "Waiting for age, sex, height, and weight"} />
                        </Card.Content>
                      </Card>
                    </>
                  ) : null}

                  {currentStep.key === "health" ? (
                    <>
                      <SearchableTagSelectorCard
                        title="Health conditions"
                        label="Search, browse by category, or add a messy term and GramWIN will normalize it."
                        groups={HEALTH_CONDITION_GROUPS}
                        requestApi={requestApi}
                        values={draft.healthConditionTags}
                        onToggle={(value) => toggleFieldItem("healthConditionTags", value, HEALTH_CONDITION_GROUPS.flatMap((group) => group.options))}
                        noteLabel="Condition notes"
                        noteValue={draft.healthConditionNotes}
                        onNoteChange={(value) => updateField("healthConditionNotes", value)}
                        notePlaceholder="Add extra context such as severity, diagnosis, or current management."
                      />
                      <SearchableTagSelectorCard
                        title="Allergies"
                        groups={ALLERGY_GROUPS}
                        requestApi={requestApi}
                        values={draft.allergyTags}
                        onToggle={(value) => toggleFieldItem("allergyTags", value, ALLERGY_GROUPS.flatMap((group) => group.options))}
                        extraContent={
                          <ChoiceChips
                            label="Highest allergy severity"
                            value={draft.allergySeverity}
                            options={ALLERGY_SEVERITY_OPTIONS}
                            onSelect={(value) => updateField("allergySeverity", value)}
                          />
                        }
                        noteLabel="Allergy notes"
                        noteValue={draft.allergyNotes}
                        onNoteChange={(value) => updateField("allergyNotes", value)}
                        notePlaceholder="Add custom allergies or reactions."
                      />
                      <SearchableTagSelectorCard
                        title="Family history"
                        label="Track hereditary risks that could shape health, diet, or activity guidance."
                        groups={FAMILY_HISTORY_GROUPS}
                        requestApi={requestApi}
                        values={draft.familyHistoryTags}
                        onToggle={(value) => toggleFieldItem("familyHistoryTags", value, FAMILY_HISTORY_GROUPS.flatMap((group) => group.options))}
                        noteLabel="Family history notes"
                        noteValue={draft.familyHistoryNotes}
                        onNoteChange={(value) => updateField("familyHistoryNotes", value)}
                        notePlaceholder="Optional details like relation or age of onset."
                      />
                    </>
                  ) : null}

                  {currentStep.key === "lifestyle" ? (
                    <Card mode="contained" style={styles.sectionCard}>
                      <Card.Content style={styles.cardStack}>
                        <ChoiceChips label="Activity level" value={draft.activityLevel} options={ACTIVITY_LEVEL_OPTIONS} onSelect={(value) => updateField("activityLevel", value)} />
                        <Field label="Average steps / day (optional)" value={draft.averageStepsPerDay} onChangeText={(value) => updateField("averageStepsPerDay", value)} placeholder="Average steps per day" keyboardType="numeric" />
                        <Field label="Average sleep hours" value={draft.sleepHours} onChangeText={(value) => updateField("sleepHours", value)} placeholder="e.g. 7.5" keyboardType="numeric" />
                        <ChoiceChips label="Sleep quality" value={draft.sleepQuality} options={SLEEP_QUALITY_OPTIONS} onSelect={(value) => updateField("sleepQuality", value)} />
                        <ChoiceChips label="Stress level" value={draft.stressLevel} options={STRESS_LEVEL_OPTIONS} onSelect={(value) => updateField("stressLevel", value)} />
                        <ChoiceChips label="Smoking" value={draft.smoking} options={SMOKING_OPTIONS} onSelect={(value) => updateField("smoking", value)} />
                        <ChoiceChips label="Alcohol" value={draft.alcohol} options={ALCOHOL_OPTIONS} onSelect={(value) => updateField("alcohol", value)} />
                        <ChoiceChips label="Caffeine intake" value={draft.caffeineIntake} options={CAFFEINE_OPTIONS} onSelect={(value) => updateField("caffeineIntake", value)} />
                      </Card.Content>
                    </Card>
                  ) : null}

                  {currentStep.key === "diet" ? (
                    <Card mode="contained" style={styles.sectionCard}>
                      <Card.Content style={styles.cardStack}>
                        <SearchableSingleSelectCard
                          title="Diet type"
                          groups={DIET_TYPE_GROUPS}
                          requestApi={requestApi}
                          value={draft.dietType}
                          onSelect={(value) => updateField("dietType", value)}
                        />
                        <SearchableSingleSelectCard
                          title="Eating pattern"
                          groups={EATING_PATTERN_GROUPS}
                          requestApi={requestApi}
                          value={draft.eatingPattern}
                          onSelect={(value) => updateField("eatingPattern", value)}
                        />
                        <SearchableTagSelectorCard
                          title="Religious or cultural restrictions"
                          label="Add dietary rules that matter for food and supplement analysis."
                          groups={[{ label: "Common restrictions", options: RELIGIOUS_RESTRICTION_OPTIONS }]}
                          requestApi={requestApi}
                          values={draft.religiousRestrictionTags}
                          onToggle={(value) => toggleFieldItem("religiousRestrictionTags", value, RELIGIOUS_RESTRICTION_OPTIONS)}
                        />
                        <SearchableFreeformTagCard
                          title="Food dislikes or food rules"
                          values={draft.foodDislikeTags}
                          suggestions={FOOD_PREFERENCE_SUGGESTIONS}
                          requestApi={requestApi}
                          placeholder="Search food dislikes, restrictions, or preferences"
                          onAdd={(value) => toggleFieldItem("foodDislikeTags", value, FOOD_PREFERENCE_SUGGESTIONS)}
                          onRemove={(value) => toggleFieldItem("foodDislikeTags", value, FOOD_PREFERENCE_SUGGESTIONS)}
                        />
                      </Card.Content>
                    </Card>
                  ) : null}

                  {currentStep.key === "goals" ? (
                    <>
                      <SearchableTagSelectorCard
                        title="Diet goals"
                        label="Pick the main outcomes you want your food analysis to optimize for."
                        groups={DIET_GOAL_GROUPS}
                        requestApi={requestApi}
                        values={draft.goalTags}
                        onToggle={(value) => toggleFieldItem("goalTags", value, DIET_GOAL_GROUPS.flatMap((group) => group.options))}
                      />
                      <SearchableTagSelectorCard
                        title="Activity goals"
                        label="Pick the outcomes you want your activity planning to support."
                        groups={ACTIVITY_GOAL_GROUPS}
                        requestApi={requestApi}
                        values={draft.activityGoalTags}
                        onToggle={(value) => toggleFieldItem("activityGoalTags", value, ACTIVITY_GOAL_GROUPS.flatMap((group) => group.options))}
                      />
                      <Card mode="contained" style={styles.sectionCard}>
                        <Card.Content style={styles.cardStack}>
                          <Text variant="titleMedium" style={styles.sectionTitle}>
                            Target settings
                          </Text>
                          <Field label="Target weight (kg)" value={draft.targetWeight} onChangeText={(value) => updateField("targetWeight", value)} placeholder="kg" keyboardType="numeric" />
                          <Field label="Daily calorie goal (kcal/day)" value={draft.dailyCalorieTarget} onChangeText={(value) => updateField("dailyCalorieTarget", value)} placeholder="kcal/day" keyboardType="numeric" />
                          <Field label="Protein target (g/day)" value={draft.proteinTarget} onChangeText={(value) => updateField("proteinTarget", value)} placeholder="g/day" keyboardType="numeric" />
                          <Field label="Carb target (g/day)" value={draft.carbTarget} onChangeText={(value) => updateField("carbTarget", value)} placeholder="g/day" keyboardType="numeric" />
                          <Field label="Fat target (g/day)" value={draft.fatTarget} onChangeText={(value) => updateField("fatTarget", value)} placeholder="g/day" keyboardType="numeric" />
                          <Field label="Sodium limit (mg/day)" value={draft.sodiumLimit} onChangeText={(value) => updateField("sodiumLimit", value)} placeholder="mg/day" keyboardType="numeric" />
                          <Field label="Sugar limit (g/day)" value={draft.sugarLimit} onChangeText={(value) => updateField("sugarLimit", value)} placeholder="g/day" keyboardType="numeric" />
                        </Card.Content>
                      </Card>
                    </>
                  ) : null}

                  {currentStep.key === "medical" ? (
                    <>
                      <SearchableTagSelectorCard
                        title="Current medications"
                        label="Search common medications or add your own."
                        groups={[
                          { label: "Common medications", options: COMMON_MEDICATION_OPTIONS },
                          { label: "Drug library", options: DRUG_LIBRARY_OPTIONS },
                        ]}
                        requestApi={requestApi}
                        values={draft.medicationTags}
                        onToggle={(value) => toggleFieldItem("medicationTags", value, [...COMMON_MEDICATION_OPTIONS, ...DRUG_LIBRARY_OPTIONS])}
                        noteLabel="Medication details"
                        noteValue={draft.medicationDetails}
                        onNoteChange={(value) => updateField("medicationDetails", value)}
                        notePlaceholder="Name, dosage, frequency, purpose"
                      />
                      <SearchableTagSelectorCard
                        title="Supplements"
                        label="Search common supplements or add your current stack."
                        groups={[{ label: "Common supplements", options: COMMON_SUPPLEMENT_OPTIONS }]}
                        requestApi={requestApi}
                        values={draft.supplementTags}
                        onToggle={(value) => toggleFieldItem("supplementTags", value, COMMON_SUPPLEMENT_OPTIONS)}
                        noteLabel="Supplement details"
                        noteValue={draft.supplementDetails}
                        onNoteChange={(value) => updateField("supplementDetails", value)}
                        notePlaceholder="Form, dosage, frequency, reason"
                      />
                      <Card mode="contained" style={styles.sectionCard}>
                        <Card.Content style={styles.cardStack}>
                          <Field
                            label="Extra medical or supplement context"
                            value={draft.medicalHistory}
                            onChangeText={(value) => updateField("medicalHistory", value)}
                            placeholder="Extra context"
                            multiline
                          />
                        </Card.Content>
                      </Card>
                    </>
                  ) : null}

                  {currentStep.key === "privacy" ? (
                    <Card mode="contained" style={styles.sectionCard}>
                      <Card.Content style={styles.cardStack}>
                        <ChoiceChips label="Insight depth" value={draft.insightDepth} options={INSIGHT_DEPTH_OPTIONS} onSelect={(value) => updateField("insightDepth", value)} />
                        <ChoiceChips label="Recommendation style" value={draft.recommendationStyle} options={RECOMMENDATION_STYLE_OPTIONS} onSelect={(value) => updateField("recommendationStyle", value)} />
                        <ToggleRow label="Allow data sharing for synced analysis" value={draft.dataSharingConsent} onValueChange={(value) => updateField("dataSharingConsent", value)} />
                        <ToggleRow label="Share anonymised data" value={draft.shareAnonymisedData} onValueChange={(value) => updateField("shareAnonymisedData", value)} />
                        <ToggleRow label="Meal reminders" value={draft.notificationMealReminders} onValueChange={(value) => updateField("notificationMealReminders", value)} />
                        <ToggleRow label="Activity reminders" value={draft.notificationActivityReminders} onValueChange={(value) => updateField("notificationActivityReminders", value)} />
                        <ToggleRow label="Insight notifications" value={draft.notificationInsights} onValueChange={(value) => updateField("notificationInsights", value)} />
                        <ToggleRow label="Alerts" value={draft.notificationAlerts} onValueChange={(value) => updateField("notificationAlerts", value)} />
                        <ToggleRow label="Investigation results" value={draft.notificationInvestigationResults} onValueChange={(value) => updateField("notificationInvestigationResults", value)} />
                      </Card.Content>
                    </Card>
                  ) : null}
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          <View style={styles.footer}>
            <Button mode="text" onPress={canGoBack ? goBack : onClose} disabled={saving || loading}>
              {canGoBack ? "Back" : mode === "edit" ? "Cancel" : "Close"}
            </Button>
            <View style={styles.footerActions}>
              {mode === "setup" ? (
                <Button mode="text" onPress={skipForNow} disabled={saving || loading} textColor={palette.muted}>
                  Skip for now
                </Button>
              ) : null}
              <Button mode="contained" onPress={continueStep} loading={saving} disabled={loading} buttonColor={palette.primary}>
                {isFinalStep ? "Finish setup" : "Continue"}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, multiline = false, ...props }) {
  return (
    <View style={styles.fieldStack}>
      <Text variant="labelMedium" style={styles.fieldLabel}>
        {label}
      </Text>
      <TextInput mode="outlined" dense={false} multiline={multiline} outlineStyle={styles.inputOutline} style={[styles.input, multiline ? styles.inputMultiline : null]} {...props} />
    </View>
  );
}

function ChoiceChips({ label, value, options, onSelect }) {
  return (
    <View style={styles.fieldStack}>
      <Text variant="labelMedium" style={styles.fieldLabel}>
        {label}
      </Text>
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const selected = cleanTagValue(value) === option;
          return (
            <Chip key={option} selected={selected} onPress={() => onSelect(option)} style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}>
              {option}
            </Chip>
          );
        })}
      </View>
    </View>
  );
}

function SearchableSingleSelectCard({ title, groups, value, onSelect, requestApi }) {
  const [query, setQuery] = useState("");
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const allOptions = useMemo(() => normalizeOptionList(groups.flatMap((group) => group.options)), [groups]);
  const contextHint = useMemo(() => searchHintForTitle(title), [title]);

  useEffect(() => {
    let active = true;
    if (cleanTagValue(query).length < 2) {
      setGoogleSuggestions([]);
      return;
    }
    void fetchGoogleAutocomplete(query, contextHint, requestApi).then((items) => {
      if (active) {
        setGoogleSuggestions(items);
      }
    });
    return () => {
      active = false;
    };
  }, [contextHint, query, requestApi]);

  const filteredOptions = useMemo(() => {
    const cleaned = safeLower(query);
    if (!cleaned) {
      return clampGroupOptions(groups);
    }
    return groups
      .map((group) => ({
        ...group,
        options: normalizeOptionList(group.options).filter((option) => safeLower(option).includes(cleaned)),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  const suggestionGroups = useMemo(
    () => buildSuggestionGroups({ googleSuggestions, selectedValues: value ? [value] : [] }),
    [googleSuggestions, value]
  );
  const overlayGroups = useMemo(() => buildOverlayGroups(filteredOptions, suggestionGroups), [filteredOptions, suggestionGroups]);

  return (
    <View style={styles.fieldStack}>
      <Text variant="titleMedium" style={styles.sectionTitle}>
        {title}
      </Text>
      <Pressable onPress={() => setOverlayVisible(true)}>
        <View pointerEvents="none">
          <TextInput mode="outlined" value={value || query} placeholder={`Search ${cleanTagValue(title).toLowerCase() || "options"}`} outlineStyle={styles.inputOutline} style={styles.input} />
        </View>
      </Pressable>
      {value ? <Chip style={styles.activeValueChip}>{value}</Chip> : null}
      <SelectionOverlay
        visible={overlayVisible}
        title={title}
        query={query}
        onQueryChange={setQuery}
        onClose={() => setOverlayVisible(false)}
        groups={overlayGroups}
        renderOption={(option) => (
          <Chip
            key={option}
            selected={value === option}
            onPress={() => {
              onSelect(option);
              setOverlayVisible(false);
            }}
            style={[styles.choiceChip, value === option ? styles.choiceChipSelected : null]}
          >
            {option}
          </Chip>
        )}
      />
    </View>
  );
}

function SearchableTagSelectorCard({ title, label, groups, values, onToggle, noteLabel, noteValue, onNoteChange, notePlaceholder, extraContent, requestApi }) {
  const [query, setQuery] = useState("");
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const allOptions = useMemo(() => normalizeOptionList(groups.flatMap((group) => group.options)), [groups]);
  const contextHint = useMemo(() => searchHintForTitle(title), [title]);

  useEffect(() => {
    let active = true;
    if (cleanTagValue(query).length < 2) {
      setGoogleSuggestions([]);
      return;
    }
    void fetchGoogleAutocomplete(query, contextHint, requestApi).then((items) => {
      if (active) {
        setGoogleSuggestions(items);
      }
    });
    return () => {
      active = false;
    };
  }, [contextHint, query, requestApi]);

  const filteredGroups = useMemo(() => {
    const cleaned = safeLower(query);
    if (!cleaned) {
      return clampGroupOptions(groups);
    }
    return groups
      .map((group) => ({
        ...group,
        options: normalizeOptionList(group.options).filter((option) => safeLower(option).includes(cleaned)),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  const suggestionGroups = useMemo(
    () => buildSuggestionGroups({ googleSuggestions, selectedValues: values }),
    [googleSuggestions, values]
  );
  const overlayGroups = useMemo(() => buildOverlayGroups(filteredGroups, suggestionGroups), [filteredGroups, suggestionGroups]);

  return (
    <Card mode="contained" style={styles.sectionCard}>
      <Card.Content style={styles.cardStack}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {title}
        </Text>
        {cleanTagValue(label) ? (
          <Text variant="bodySmall" style={styles.bodyText}>
            {label}
          </Text>
        ) : null}
        <Pressable onPress={() => setOverlayVisible(true)}>
          <View pointerEvents="none">
            <TextInput mode="outlined" value={query} placeholder={`Search ${cleanTagValue(title).toLowerCase() || "items"}`} outlineStyle={styles.inputOutline} style={styles.input} />
          </View>
        </Pressable>
        {(values || []).length ? (
          <View style={styles.tagRow}>
            {values.map((value) => (
              <Chip key={value} onClose={() => onToggle(value)} style={styles.choiceChipSelected}>
                {value}
              </Chip>
            ))}
          </View>
        ) : null}
        <SelectionOverlay
          visible={overlayVisible}
          title={title}
          query={query}
          onQueryChange={setQuery}
          onClose={() => setOverlayVisible(false)}
          groups={overlayGroups}
          renderOption={(option) => {
            const selected = values.includes(option);
            return (
              <Chip
                key={option}
                selected={selected}
                onPress={() => onToggle(option)}
                style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
              >
                {option}
              </Chip>
            );
          }}
        />
        {extraContent ? extraContent : null}
        {noteLabel ? <Field label={noteLabel} value={noteValue} onChangeText={onNoteChange} placeholder={notePlaceholder} multiline /> : null}
      </Card.Content>
    </Card>
  );
}

function SelectionOverlay({ visible, title, query, onQueryChange, onClose, groups, renderOption }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlayBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlaySheetWrap}>
          <View style={styles.overlaySheet}>
            <View style={styles.handle} />
            <View style={styles.overlayHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                {title}
              </Text>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={20} color={palette.text} />
              </Pressable>
            </View>
            <TextInput
              mode="outlined"
              value={query}
              onChangeText={onQueryChange}
              placeholder={`Search ${cleanTagValue(title).toLowerCase() || "items"}`}
              outlineStyle={styles.inputOutline}
              style={styles.input}
            />
            <ScrollView
              contentContainerStyle={styles.overlayContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            >
              {groups.map((group) => (
                <View key={group.label} style={styles.groupStack}>
                  <Text variant="labelMedium" style={styles.groupLabel}>
                    {group.label}
                  </Text>
                  <View style={styles.chipWrap}>
                    {group.options.map((option) => renderOption(option))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ToggleRow({ label, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <Text variant="bodyMedium" style={styles.toggleLabel}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: palette.primarySoft, false: "#D7DFE8" }} thumbColor={value ? palette.primary : "#FFFFFF"} />
    </View>
  );
}

function SummaryStat({ label, value }) {
  return (
    <View style={styles.summaryStat}>
      <Text variant="labelMedium" style={styles.fieldLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

function TagInput({ label, values, placeholder, onAdd, onRemove }) {
  const [draft, setDraft] = useState("");
  function commit() {
    const cleaned = cleanTagValue(draft);
    if (!cleaned) {
      return;
    }
    onAdd(cleaned);
    setDraft("");
  }

  return (
    <View style={styles.fieldStack}>
      <Text variant="labelMedium" style={styles.fieldLabel}>
        {label}
      </Text>
      <View style={styles.tagRow}>
        {(values || []).map((value) => (
          <Chip key={value} onClose={() => onRemove(value)} style={styles.choiceChip}>
            {value}
          </Chip>
        ))}
      </View>
      <TextInput mode="outlined" value={draft} onChangeText={setDraft} onSubmitEditing={commit} onBlur={commit} placeholder={placeholder} outlineStyle={styles.inputOutline} style={styles.input} />
    </View>
  );
}

function SearchableFreeformTagCard({ title, values, suggestions, placeholder, onAdd, onRemove, requestApi }) {
  const [query, setQuery] = useState("");
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const normalizedSuggestions = useMemo(() => normalizeOptionList(suggestions), [suggestions]);
  const contextHint = useMemo(() => searchHintForTitle(title), [title]);

  useEffect(() => {
    let active = true;
    if (cleanTagValue(query).length < 2) {
      setGoogleSuggestions([]);
      return;
    }
    void fetchGoogleAutocomplete(query, contextHint, requestApi).then((items) => {
      if (active) {
        setGoogleSuggestions(items);
      }
    });
    return () => {
      active = false;
    };
  }, [contextHint, query, requestApi]);

  const filteredGroups = useMemo(() => {
    const cleaned = safeLower(query);
    const pool = !cleaned
      ? normalizedSuggestions
      : normalizedSuggestions.filter((option) => safeLower(option).includes(cleaned));
    return pool.length > 0 ? [{ label: "Suggestions", options: pool }] : [];
  }, [normalizedSuggestions, query]);

  const suggestionGroups = useMemo(
    () => buildSuggestionGroups({ googleSuggestions, selectedValues: values }),
    [googleSuggestions, values]
  );
  const overlayGroups = useMemo(() => buildOverlayGroups(filteredGroups, suggestionGroups), [filteredGroups, suggestionGroups]);

  return (
    <Card mode="contained" style={styles.sectionCard}>
      <Card.Content style={styles.cardStack}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {title}
        </Text>
        <Pressable onPress={() => setOverlayVisible(true)}>
          <View pointerEvents="none">
            <TextInput mode="outlined" value={query} placeholder={placeholder} outlineStyle={styles.inputOutline} style={styles.input} />
          </View>
        </Pressable>
        {values.length ? (
          <View style={styles.tagRow}>
            {values.map((value) => (
              <Chip key={value} onClose={() => onRemove(value)} style={styles.choiceChipSelected}>
                {value}
              </Chip>
            ))}
          </View>
        ) : null}
        <SelectionOverlay
          visible={overlayVisible}
          title={title}
          query={query}
          onQueryChange={setQuery}
          onClose={() => setOverlayVisible(false)}
          groups={overlayGroups}
          renderOption={(option) => {
            const selected = values.includes(option);
            return (
              <Chip
                key={option}
                selected={selected}
                onPress={() => {
                  if (selected) {
                    onRemove(option);
                  } else {
                    onAdd(option);
                  }
                }}
                style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
              >
                {option}
              </Chip>
            );
          }}
        />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 21, 28, 0.3)",
    justifyContent: "flex-end",
  },
  sheet: {
    minHeight: "91%",
    maxHeight: "99%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 14,
  },
  handle: {
    alignSelf: "center",
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  headerRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceSoft,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  keyboardArea: {
    flex: 1,
    minHeight: 0,
  },
  titleText: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  subtitleText: {
    color: palette.muted,
    lineHeight: 22,
  },
  progressCard: {
    borderRadius: 18,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardStack: {
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  stepEyebrow: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  stepTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  progressChip: {
    backgroundColor: palette.primarySoft,
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E3E8EE",
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  sectionCard: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: "Poppins_700Bold",
  },
  bodyText: {
    color: palette.muted,
    lineHeight: 20,
    fontSize: 14,
  },
  fieldStack: {
    gap: 6,
  },
  fieldLabel: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  input: {
    backgroundColor: "#FFFFFF",
    fontSize: 14,
  },
  inputOutline: {
    borderRadius: 14,
    borderColor: palette.border,
  },
  inputMultiline: {
    minHeight: 92,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceChip: {
    backgroundColor: palette.surfaceSoft,
  },
  choiceChipSelected: {
    backgroundColor: palette.primarySoft,
  },
  groupStack: {
    gap: 8,
  },
  groupLabel: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  suggestionStack: {
    gap: 2,
  },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 21, 28, 0.34)",
    justifyContent: "flex-end",
  },
  overlaySheetWrap: {
    justifyContent: "flex-end",
  },
  overlaySheet: {
    minHeight: "64%",
    maxHeight: "90%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  overlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  overlayContent: {
    gap: 12,
    paddingBottom: 24,
  },
  activeValueChip: {
    alignSelf: "flex-start",
    backgroundColor: palette.primarySoft,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  toggleLabel: {
    flex: 1,
    color: palette.text,
  },
  summaryStat: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: palette.surfaceSoft,
    gap: 4,
  },
  summaryValue: {
    color: palette.text,
    fontFamily: "Poppins_600SemiBold",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: palette.primarySoft,
  },
  accountText: {
    color: palette.primary,
    fontFamily: "Poppins_600SemiBold",
    flex: 1,
  },
  storageInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: palette.surfaceSoft,
  },
});
