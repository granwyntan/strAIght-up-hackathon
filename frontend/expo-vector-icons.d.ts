declare module "@expo/vector-icons" {
  import * as React from "react";

  export interface ExpoVectorIconProps {
    name: string;
    color?: string;
    size?: number;
    style?: unknown;
  }

  export const MaterialCommunityIcons: React.ComponentType<ExpoVectorIconProps>;
}
