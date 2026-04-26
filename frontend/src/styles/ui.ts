import { palette } from "../data";
import { typography } from "./typography";

export const panelShadow = {
  shadowColor: "rgba(16, 24, 40, 0.08)",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 1,
  shadowRadius: 28,
  elevation: 6,
} as const;

export const ui = {
  surfaceCard: {
    ...panelShadow,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  softCard: {
    ...panelShadow,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FCFDFB",
  },
  inputShell: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(16, 24, 40, 0.1)",
    backgroundColor: "#FCFDFC",
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: palette.ink,
    ...typography.regular,
    fontSize: 14,
  },
  fieldLabel: {
    color: palette.muted,
    fontSize: 11,
    ...typography.semibold,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    ...typography.bold,
  },
  sectionBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    ...typography.regular,
  },
  primaryButton: {
    ...panelShadow,
    borderRadius: 18,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: palette.surface,
    fontSize: 15,
    ...typography.bold,
  },
  secondaryButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: palette.ink,
    fontSize: 13,
    ...typography.semibold,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: palette.primary,
    fontSize: 11,
    ...typography.semibold,
    textTransform: "uppercase",
  },
} as const;
