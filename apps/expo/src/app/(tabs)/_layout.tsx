import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { colors } from "~/components/app/theme";
import { useAuthSession } from "~/providers/AuthSessionProvider";

export default function TabsLayout() {
  const { isLoading: loading, session } = useAuthSession();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.purple} size="large" />
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
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="home" size={focused ? 23 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: "Quests",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="compass" size={focused ? 23 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history_tab"
        options={{
          title: "Your Orders",
          tabBarIcon: ({ color, focused }) => (
            <Feather
              name="shopping-bag"
              size={focused ? 23 : 21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, focused }) => (
            <Feather
              name="credit-card"
              size={focused ? 23 : 21}
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
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
  },
  tabBar: {
    backgroundColor: "rgba(18,18,22,0.98)",
    borderColor: colors.border,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    bottom: 0,
    elevation: 20,
    height: 74,
    paddingBottom: 10,
    paddingTop: 8,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: -8, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  tabItem: {
    borderRadius: 18,
    marginHorizontal: 6,
  },
});
