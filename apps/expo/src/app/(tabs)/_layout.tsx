import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { colors } from "~/components/app/theme";
import { LoadingState } from "~/components/app/ui";
import { useAuthSession } from "~/providers/AuthSessionProvider";

export default function TabsLayout() {
  const { isLoading: loading, session } = useAuthSession();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={styles.loading}>
        <LoadingState
          title="Restoring your session"
          copy="Getting your campus orders and account ready."
        />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/auth" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 64 + insets.bottom,
            paddingBottom: Math.max(6, insets.bottom),
          },
        ],
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="home" size={focused ? 22 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: "Quests",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="navigation" size={focused ? 22 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history_tab"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="package" size={focused ? 22 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color, focused }) => (
            <Feather
              name="trending-up"
              size={focused ? 22 : 21}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  loading: {
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  tabBar: {
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    elevation: 14,
    paddingTop: 7,
    shadowColor: colors.shadow,
    shadowOffset: { height: -5, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  tabItem: {
    borderRadius: 16,
  },
});
