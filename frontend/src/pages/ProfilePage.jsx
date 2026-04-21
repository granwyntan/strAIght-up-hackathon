import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { palette } from "../data";
import { emptyProfile, loadProfile, saveProfile } from "../storage/profileStorage";

const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];

export default function ProfilePage({ history: _history }) {
  const [profile, setProfile] = useState(emptyProfile);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const saved = await loadProfile();
        if (mounted) {
          setProfile(saved);
        }
      } catch (error) {
        console.warn("Unable to load profile from local storage", error);
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
  }, []);

  const updateField = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const onSave = async () => {
    if (savingProfile || loadingProfile) {
      return;
    }
    setSavingProfile(true);
    setSaveSuccess(false);
    try {
      const saved = await saveProfile(profile);
      setProfile(saved);
      setSaveSuccess(true);
      Alert.alert("Saved", "Your profile has been saved on this device.");
      setTimeout(() => {
        setSaveSuccess(false);
      }, 1500);
    } catch (error) {
      console.warn("Unable to save profile locally", error);
      Alert.alert("Save failed", "Could not save your profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.pageStack} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.heroPanel}>
        <Text style={styles.heroTitle}>Personal health profile</Text>
        <Text style={styles.heroSubtitle}>Add and save your profile details locally so your health context is available whenever you reopen the app.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.cardTitle}>Your details</Text>
        <View style={styles.fieldStack}>
          <LabeledInput label="Name" value={profile.name} onChangeText={(value) => updateField("name", value)} placeholder="Enter your name" />

          <LabeledInput
            label="Age"
            value={profile.age}
            onChangeText={(value) => updateField("age", value)}
            placeholder="Enter your age"
            keyboardType="numeric"
          />

          <View style={styles.field}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((option) => {
                const selected = profile.gender === option;
                return (
                  <Pressable key={option} style={[styles.genderButton, selected && styles.genderButtonSelected]} onPress={() => updateField("gender", option)}>
                    <Text style={[styles.genderText, selected && styles.genderTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <LabeledInput
            label="Height (cm)"
            value={profile.height}
            onChangeText={(value) => updateField("height", value)}
            placeholder="Enter your height in cm"
            keyboardType="numeric"
          />

          <LabeledInput
            label="Weight (kg)"
            value={profile.weight}
            onChangeText={(value) => updateField("weight", value)}
            placeholder="Enter your weight in kg"
            keyboardType="numeric"
          />

          <LabeledInput
            label="Goals"
            value={profile.goals}
            onChangeText={(value) => updateField("goals", value)}
            placeholder="Describe your health goals"
            multiline
          />

          <LabeledInput
            label="Current medications or supplements"
            value={profile.medicationsOrSupplements}
            onChangeText={(value) => updateField("medicationsOrSupplements", value)}
            placeholder="List current medications or supplements"
            multiline
          />

          <LabeledInput
            label="Medical conditions"
            value={profile.medicalConditions}
            onChangeText={(value) => updateField("medicalConditions", value)}
            placeholder="List current medical conditions"
            multiline
          />

          <LabeledInput
            label="Medical history"
            value={profile.medicalHistory}
            onChangeText={(value) => updateField("medicalHistory", value)}
            placeholder="Add relevant medical history"
            multiline
          />
        </View>

        <Pressable
          style={[styles.saveButton, saveSuccess && styles.saveButtonSuccess, (loadingProfile || savingProfile) && styles.saveButtonDisabled]}
          onPress={() => void onSave()}
          disabled={loadingProfile || savingProfile}
        >
          {savingProfile ? <ActivityIndicator color="#fffdfa" size="small" /> : null}
          <Text style={styles.saveButtonText}>
            {loadingProfile ? "Loading profile..." : saveSuccess ? "Saved ✓" : "Save"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({ label, multiline = false, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} multiline={multiline} style={[styles.input, multiline && styles.multilineInput]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pageStack: {
    gap: 22
  },
  heroPanel: {
    backgroundColor: palette.surface,
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "700"
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  panel: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 14
  },
  cardTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  fieldStack: {
    gap: 12
  },
  field: {
    gap: 8
  },
  label: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.ink,
    backgroundColor: "#fffdf9"
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: "top"
  },
  genderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  genderButton: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#f8f4ed",
    borderRadius: 14,
    minHeight: 40,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  genderButtonSelected: {
    backgroundColor: palette.blue,
    borderColor: palette.blue
  },
  genderText: {
    color: palette.blue,
    fontSize: 13,
    fontWeight: "700"
  },
  genderTextSelected: {
    color: "#fffdfa"
  },
  saveButton: {
    backgroundColor: palette.ink,
    minHeight: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  saveButtonSuccess: {
    backgroundColor: "#2e8b57"
  },
  saveButtonDisabled: {
    opacity: 0.6
  },
  saveButtonText: {
    color: "#fffdfa",
    fontSize: 17,
    fontWeight: "800"
  }
});
