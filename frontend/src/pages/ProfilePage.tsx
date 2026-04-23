// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { palette } from "../data";
import { emptyProfile, loadProfile, loadProfileLastSynced, saveProfile } from "../storage/profileStorage";
import AuthGate from "../components/auth/AuthGate";

const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];
const TABS = ["overview", "settings"];
const PROFILE_GUIDE_PAGES = [
  {
    title: "Welcome to GramWIN!",
    body: "Welcome to GramWIN!"
  },
  {
    title: "Why create an account",
    body:
      "Creating an account helps sync your data, including daily calorie intake, previous scanner searches, and your profile. This makes the app more convenient and easy to use without having to keep filling in information."
  },
  {
    title: "Your data privacy",
    body:
      "Our Google Firebase Firestore database is encrypted and protected. You are free to share medical data, and we promise not to share your information with anyone else and to keep it private."
  }
];

export default function ProfilePage({ history: _history, accountId, accountEmail, activeAccount, authLoading, onAuthenticate, onLogout }) {
  const [profile, setProfile] = useState(emptyProfile);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [webcamVisible, setWebcamVisible] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [webcamStream, setWebcamStream] = useState(null);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guidePageWidth, setGuidePageWidth] = useState(320);
  const [activeGuidePage, setActiveGuidePage] = useState(0);
  const guideScrollRef = useRef(null);
  const webcamVideoRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      if (mounted) {
        setLoadingProfile(true);
      }
      if (!accountId) {
        if (mounted) {
          setProfile({ ...emptyProfile });
          setLastSyncedAt("");
          setLoadingProfile(false);
        }
        return;
      }
      try {
        const saved = await loadProfile(accountId, accountEmail);
        const syncedAt = await loadProfileLastSynced(accountId, accountEmail);
        if (mounted) {
          setProfile(saved);
          setLastSyncedAt(syncedAt);
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
  }, [accountId, accountEmail]);

  const updateField = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const uploadProfileImage = async () => {
    if (savingProfile || loadingProfile) {
      return;
    }
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Media library access is required to choose a profile picture.");
        return;
      }
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1]
    });
    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return;
    }
    updateField("profilePicture", pickerResult.assets[0].uri || "");
  };

  const takeProfileImage = async () => {
    if (savingProfile || loadingProfile) {
      return;
    }
    if (Platform.OS === "web") {
      setWebcamError("");
      if (!navigator?.mediaDevices?.getUserMedia) {
        setWebcamError("Webcam is not available in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setWebcamStream(stream);
        setWebcamVisible(true);
      } catch {
        setWebcamError("Could not access webcam. Please allow camera permission.");
      }
      return;
    }
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Camera access is required to take a profile picture.");
        return;
      }
    }
    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1]
    });
    if (cameraResult.canceled || !cameraResult.assets?.length) {
      return;
    }
    updateField("profilePicture", cameraResult.assets[0].uri || "");
  };

  const closeWebcamModal = () => {
    if (webcamStream) {
      for (const track of webcamStream.getTracks()) {
        track.stop();
      }
    }
    setWebcamStream(null);
    setWebcamVisible(false);
  };

  const captureWebcamPhoto = async () => {
    const videoElement = webcamVideoRef.current;
    if (!videoElement) {
      setWebcamError("Unable to access webcam preview.");
      return;
    }
    const width = videoElement.videoWidth || 640;
    const height = videoElement.videoHeight || 640;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setWebcamError("Unable to capture webcam image.");
      return;
    }
    context.drawImage(videoElement, 0, 0, width, height);
    const blob = await new Promise((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), "image/jpeg", 0.9);
    });
    if (!blob) {
      setWebcamError("Unable to capture webcam image.");
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    updateField("profilePicture", objectUrl);
    closeWebcamModal();
  };

  const openPhotoSourcePicker = () => {
    Alert.alert("Profile picture", "Choose a photo source", [
      { text: "Use camera", onPress: () => void takeProfileImage() },
      { text: "Upload image", onPress: () => void uploadProfileImage() },
      { text: "Cancel", style: "cancel" }
    ]);
  };

  useEffect(() => {
    if (Platform.OS === "web" && webcamVisible && webcamVideoRef.current && webcamStream) {
      webcamVideoRef.current.srcObject = webcamStream;
    }
  }, [webcamVisible, webcamStream]);

  useEffect(() => {
    return () => {
      if (webcamStream) {
        for (const track of webcamStream.getTracks()) {
          track.stop();
        }
      }
    };
  }, [webcamStream]);

  const onSave = async () => {
    if (!accountId) {
      Alert.alert("Account required", "Please login or create an account to save your profile.");
      return;
    }
    if (savingProfile || loadingProfile) {
      return;
    }
    setSavingProfile(true);
    setSaveSuccess(false);
    try {
      const saved = await saveProfile(profile, accountId, accountEmail);
      const syncedAt = await loadProfileLastSynced(accountId, accountEmail);
      setProfile(saved);
      setLastSyncedAt(syncedAt);
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

  const displayName = profile.name.trim() || "Your name";
  const displayGoals = profile.goals.trim() || "Add your health goals in Settings so they appear here.";
  const lastSyncedLabel = lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Not synced yet";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const closeGuide = () => {
    setGuideVisible(false);
  };

  const openGuide = () => {
    setActiveGuidePage(0);
    setGuideVisible(true);
    setTimeout(() => {
      guideScrollRef.current?.scrollTo?.({ x: 0, animated: false });
    }, 0);
  };

  return (
    <KeyboardAvoidingView style={styles.pageStack} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.heroPanel}>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>Personal health profile</Text>
          <Pressable style={styles.guideButton} onPress={openGuide} accessibilityRole="button" accessibilityLabel="Open profile guide">
            <Text style={styles.guideButtonText}>?</Text>
          </Pressable>
        </View>
        <Text style={styles.heroSubtitle}>Add and save your profile details locally so your health context is available whenever you reopen the app.</Text>
      </View>

      <View style={styles.panel}>
        {activeAccount ? (
          <View style={styles.accountPanel}>
            <View style={styles.accountRow}>
              <View style={styles.accountBadge}>
                <Text style={styles.accountBadgeText}>Logged in</Text>
              </View>
              <Text style={styles.accountEmail}>{activeAccount.email}</Text>
              <Pressable style={styles.accountLogoutButton} onPress={onLogout}>
                <Text style={styles.accountLogoutText}>Logout</Text>
              </Pressable>
            </View>
            <View style={styles.syncMetaRow}>
              <Text style={styles.syncMetaLabel}>Last synced</Text>
              <Text style={styles.syncMetaValue}>{lastSyncedLabel}</Text>
            </View>
          </View>
        ) : null}

        {activeAccount ? (
          <>
            <View style={styles.tabRow}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                const label = tab === "overview" ? "Overview" : "Settings";
                return (
                  <Pressable key={tab} style={[styles.tabButton, isActive && styles.tabButtonActive]} onPress={() => setActiveTab(tab)}>
                    <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {activeTab === "overview" ? (
              <View style={styles.overviewStack}>
                <View style={styles.overviewHeader}>
                  {profile.profilePicture ? (
                    <Image source={{ uri: profile.profilePicture }} style={styles.profileImage} />
                  ) : (
                    <View style={styles.profileImageFallback}>
                      <Text style={styles.profileImageFallbackText}>{initials || "U"}</Text>
                    </View>
                  )}
                  <View style={styles.nameBlock}>
                    <Text style={styles.overviewLabel}>Name</Text>
                    <Text style={styles.overviewName}>{displayName}</Text>
                  </View>
                </View>

                <View style={styles.overviewGoalsCard}>
                  <Text style={styles.overviewLabel}>Goals</Text>
                  <Text style={styles.overviewGoalsText}>{displayGoals}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.fieldStack}>
                <View style={styles.field}>
                  <Text style={styles.label}>Profile picture</Text>
                  <View style={styles.photoRow}>
                    {profile.profilePicture ? (
                      <Image source={{ uri: profile.profilePicture }} style={styles.settingsPhoto} />
                    ) : (
                      <View style={styles.settingsPhotoFallback}>
                        <Text style={styles.profileImageFallbackText}>{initials || "U"}</Text>
                      </View>
                    )}
                    <View style={styles.photoActions}>
                      {Platform.OS === "web" ? (
                        <View style={styles.photoActionRow}>
                          <Pressable style={styles.photoActionButton} onPress={() => void takeProfileImage()}>
                            <Text style={styles.photoActionText}>Use webcam</Text>
                          </Pressable>
                          <Pressable style={styles.photoActionButton} onPress={() => void uploadProfileImage()}>
                            <Text style={styles.photoActionText}>Upload image</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable style={styles.photoActionButton} onPress={openPhotoSourcePicker}>
                          <Text style={styles.photoActionText}>{profile.profilePicture ? "Change photo" : "Add photo"}</Text>
                        </Pressable>
                      )}
                      {profile.profilePicture ? (
                        <Pressable style={styles.photoActionButtonAlt} onPress={() => updateField("profilePicture", "")}>
                          <Text style={styles.photoActionAltText}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>

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
            )}

            {activeTab === "settings" ? (
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
            ) : null}
          </>
        ) : (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedTitle}>Profile is locked</Text>
            <Text style={styles.lockedBody}>Login or create an account below to access Overview and Settings.</Text>
            <AuthGate onAuthenticate={onAuthenticate} loading={authLoading} />
          </View>
        )}
      </View>

      {Platform.OS === "web" ? (
        <Modal visible={webcamVisible} transparent animationType="fade" onRequestClose={closeWebcamModal}>
          <View style={styles.webcamBackdrop}>
            <View style={styles.webcamCard}>
              <Text style={styles.webcamTitle}>Webcam capture</Text>
              <video ref={webcamVideoRef} autoPlay playsInline muted style={StyleSheet.flatten(styles.webcamVideo)} />
              {webcamError ? <Text style={styles.webcamError}>{webcamError}</Text> : null}
              <View style={styles.webcamActions}>
                <Pressable style={styles.webcamPrimary} onPress={() => void captureWebcamPhoto()}>
                  <Text style={styles.webcamPrimaryText}>Capture</Text>
                </Pressable>
                <Pressable style={styles.webcamSecondary} onPress={closeWebcamModal}>
                  <Text style={styles.webcamSecondaryText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      <Modal visible={guideVisible} transparent animationType="fade" onRequestClose={closeGuide}>
        <View style={styles.guideBackdrop}>
          <View style={styles.guideCard}>
            <Pressable style={styles.guideCloseButton} onPress={closeGuide} accessibilityRole="button" accessibilityLabel="Close profile guide">
              <Text style={styles.guideCloseButtonText}>x</Text>
            </Pressable>
            <Text style={styles.guideTitle}>Profile guide</Text>
            <ScrollView
              ref={guideScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onLayout={(event) => {
                const width = Math.max(280, Math.floor(event.nativeEvent.layout.width));
                setGuidePageWidth(width);
              }}
              onScroll={(event) => {
                const width = guidePageWidth || 1;
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                if (nextIndex !== activeGuidePage) {
                  setActiveGuidePage(nextIndex);
                }
              }}
              scrollEventThrottle={16}
            >
              {PROFILE_GUIDE_PAGES.map((page, index) => (
                <View key={page.title} style={[styles.guidePage, { width: guidePageWidth }]}>
                  <Text style={styles.guideStepLabel}>Page {index + 1}</Text>
                  <Text style={styles.guidePageTitle}>{page.title}</Text>
                  <Text style={styles.guidePageBody}>{page.body}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.guideFooter}>
              <Text style={styles.guideFooterText}>
                {activeGuidePage + 1} / {PROFILE_GUIDE_PAGES.length}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
  flexGrow: 1,
  gap: 22,
  paddingBottom: 120
  },
  heroPanel: {
    backgroundColor: palette.surface,
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "700",
    flex: 1
  },
  guideButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#eef3fc",
    alignItems: "center",
    justifyContent: "center"
  },
  guideButtonText: {
    color: palette.blue,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "800"
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
  accountPanel: {
    gap: 8
  },
  accountRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fffdf9",
    gap: 6
  },
  accountBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#eef8df",
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  accountBadgeText: {
    color: "#4c6f2b",
    fontSize: 12,
    fontWeight: "700"
  },
  accountEmail: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  accountLogoutButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: "#f8f4ed",
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  accountLogoutText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  syncMetaRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fffdf9"
  },
  syncMetaLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.25
  },
  syncMetaValue: {
    marginTop: 2,
    color: palette.ink,
    fontSize: 13,
    fontWeight: "600"
  },
  lockedCard: {
    paddingTop: 2,
    gap: 4
  },
  lockedTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  lockedBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19
  },
  webcamBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  webcamCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10
  },
  webcamTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700"
  },
  webcamVideo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#111"
  },
  webcamError: {
    color: palette.red,
    fontSize: 13
  },
  webcamActions: {
    flexDirection: "row",
    gap: 10
  },
  webcamPrimary: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center"
  },
  webcamPrimaryText: {
    color: "#fffdfa",
    fontSize: 14,
    fontWeight: "700"
  },
  webcamSecondary: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#f8f4ed",
    alignItems: "center",
    justifyContent: "center"
  },
  webcamSecondaryText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  cardTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#f8f4ed",
    borderRadius: 14,
    padding: 4,
    gap: 8
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10
  },
  tabButtonActive: {
    backgroundColor: palette.blue
  },
  tabButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  tabButtonTextActive: {
    color: "#fffdfa"
  },
  overviewStack: {
    gap: 12
  },
  overviewHeader: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fffdf9",
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  profileImage: {
    width: 68,
    height: 68,
    borderRadius: 34
  },
  profileImageFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#dde8ff",
    alignItems: "center",
    justifyContent: "center"
  },
  profileImageFallbackText: {
    color: palette.blue,
    fontSize: 24,
    fontWeight: "800"
  },
  nameBlock: {
    flex: 1,
    gap: 2
  },
  overviewLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  overviewName: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "800"
  },
  overviewGoalsCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fffdf9",
    gap: 8
  },
  overviewGoalsText: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 21
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
  photoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  settingsPhoto: {
    width: 74,
    height: 74,
    borderRadius: 37
  },
  settingsPhotoFallback: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#dde8ff",
    alignItems: "center",
    justifyContent: "center"
  },
  photoActions: {
    gap: 8
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  photoActionButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: palette.blue,
    justifyContent: "center"
  },
  photoActionText: {
    color: "#fffdfa",
    fontSize: 13,
    fontWeight: "700"
  },
  photoActionButtonAlt: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f8f4ed",
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: "center"
  },
  photoActionAltText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700"
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
  },
  guideBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 20, 34, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  guideCard: {
    width: "86%",
    maxWidth: 420,
    minHeight: 380,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingTop: 16,
    paddingBottom: 12
  },
  guideCloseButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  },
  guideCloseButtonText: {
    color: palette.ink,
    fontWeight: "800",
    fontSize: 14
  },
  guideTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10
  },
  guidePage: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 280,
    gap: 10
  },
  guideStepLabel: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: "800"
  },
  guidePageTitle: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800"
  },
  guidePageBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21
  },
  guideFooter: {
    alignItems: "center",
    justifyContent: "center"
  },
  guideFooterText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700"
  }
});
