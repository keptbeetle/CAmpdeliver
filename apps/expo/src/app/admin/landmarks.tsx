import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { colors } from "~/app/_components/theme";

export default function ManageLandmarksScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Manage Landmarks</Text>
      </View>
      <View style={styles.card}>
        <Feather name="map-pin" size={36} color="#fcd34d" />
        <Text style={styles.cardTitle}>Use the web admin map</Text>
        <Text style={styles.cardCopy}>
          Landmark creation and radius editing stays in the web dashboard so the
          mobile app can remain focused on ordering, quests, tracking, and chat.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    margin: 18,
    padding: 24,
  },
  cardCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 14,
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
});
