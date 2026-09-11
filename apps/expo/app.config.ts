import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "CAmpDeliver",
  slug: "campdeliver",
  scheme: "campdeliver",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon-light.png",
  userInterfaceStyle: "light",
  updates: {
    fallbackToCacheTimeout: 0,
  },
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "com.campdeliver.app",
    supportsTablet: true,
    icon: {
      light: "./assets/icon-light.png",
      dark: "./assets/icon-dark.png",
    },
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/icon-light.png",
  },
  android: {
    package: "com.campdeliver.app",
    googleServicesFile: "./google-services.json",
    permissions: ["android.permission.POST_NOTIFICATIONS"],
    adaptiveIcon: {
      foregroundImage: "./assets/icon-light.png",
      backgroundColor: "#DDF0EF",
    },
    edgeToEdgeEnabled: true,
  },
  extra: {
    eas: {
      projectId: "b658b0d5-1c62-4f07-8329-38563db9dfa3",
    },
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ||
      "https://c-ampdeliver-nextjs.vercel.app",
  },
  experiments: {
    tsconfigPaths: true,
    typedRoutes: true,
    reactCanary: true,
    reactCompiler: true,
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    [
      "@maplibre/maplibre-react-native",
      {
        android: {
          locationEngine: "default",
        },
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F4F8F8",
        image: "./assets/icon-light.png",
        dark: {
          backgroundColor: "#18181B",
          image: "./assets/icon-dark.png",
        },
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow CAmpDeliver to use your location for nearby quests, pickup eligibility, and live delivery tracking.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/icon-light.png",
        color: "#2E7B80",
        defaultChannel: "default",
        enableBackgroundRemoteNotifications: true,
      },
    ],
  ],
});
