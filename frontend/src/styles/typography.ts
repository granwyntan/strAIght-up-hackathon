import type { TextStyle } from "react-native";

export const typography: {
  regular: TextStyle;
  medium: TextStyle;
  semibold: TextStyle;
  bold: TextStyle;
} = {
  regular: { fontFamily: "Poppins_400Regular" },
  medium: { fontFamily: "Poppins_500Medium" },
  semibold: { fontFamily: "Poppins_600SemiBold" },
  bold: { fontFamily: "Poppins_700Bold" },
};
