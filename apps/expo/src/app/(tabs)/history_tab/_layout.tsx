import { Stack } from "expo-router";

import { colors } from "~/components/app/theme";

export default function OrdersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
