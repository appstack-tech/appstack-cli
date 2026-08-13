import { version } from "../package.json";

export const VERSION = version;
export const APPSTACK_SKILL = "appstack-sdk";

export type FrameworkId =
  | "swift"
  | "kotlin"
  | "react-native"
  | "flutter"
  | "unity";

export const FRAMEWORK_LABEL: Record<FrameworkId, string> = {
  swift: "Swift (iOS)",
  kotlin: "Kotlin (Android)",
  "react-native": "React Native",
  flutter: "Flutter",
  unity: "Unity",
};
