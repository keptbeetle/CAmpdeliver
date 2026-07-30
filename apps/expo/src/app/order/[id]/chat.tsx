import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { trpc } from "~/utils/api";

export default function OrderChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: messages, isLoading } = useQuery(
    trpc.chat.getMessages.queryOptions({ orderId: id }),
  );
  const { data: orders } = useQuery(trpc.order.myOrders.queryOptions());

  const order = orders?.find((o) => o.id === id);

  const isCallShortcutVisible =
    order &&
    ["ACCEPTED", "PREPARING", "ON_THE_WAY", "NEAR_YOU"].includes(order.status);

  const [callLoading, setCallLoading] = useState(false);
  const { refetch: refetchContactPhone } = useQuery({
    ...trpc.order.getOrderContactPhoneNumber.queryOptions({ orderId: id }),
    enabled: false,
  });

  const handleCallPress = async () => {
    setCallLoading(true);
    try {
      const result = await refetchContactPhone();
      if (!result.data?.phoneNumber) {
        Alert.alert("Error", "Could not retrieve contact phone number.");
        return;
      }

      const phoneUrl = `tel:${result.data.phoneNumber}`;
      const supported = await Linking.canOpenURL(phoneUrl);

      if (supported) {
        await Linking.openURL(phoneUrl);
      } else {
        Alert.alert(
          "Dialer Error",
          "Cannot place call. This device does not support cellular dialing.",
        );
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to retrieve contact number.";
      Alert.alert("Error", msg);
    } finally {
      setCallLoading(false);
    }
  };

  const { broadcastChatEvent } = useOrderRealtime(id, {
    onChatUpdate: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.chat.getMessages.queryKey({ orderId: id }),
      });
    },
  });

  const sendMessageMutation = useMutation(
    trpc.chat.sendMessage.mutationOptions({
      onSuccess: async () => {
        setMessage("");
        await queryClient.invalidateQueries({
          queryKey: trpc.chat.getMessages.queryKey({ orderId: id }),
        });
        await broadcastChatEvent();
      },
    }),
  );

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate({ orderId: id, message: message.trim() });
  };

  if (isLoading || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-zinc-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Order Chat",
          headerTintColor: "#fff",
          headerStyle: { backgroundColor: "#09090b" },
          headerRight: () =>
            isCallShortcutVisible ? (
              <Pressable
                onPress={handleCallPress}
                disabled={callLoading}
                className="mr-2 p-2 active:opacity-75"
              >
                {callLoading ? (
                  <ActivityIndicator size="small" color="#a855f7" />
                ) : (
                  <Ionicons name="call" size={20} color="#a855f7" />
                )}
              </Pressable>
            ) : null,
        }}
      />

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const isMe = item.senderId === profile.id;
          return (
            <View
              className={`mb-4 max-w-[80%] rounded-2xl p-4 ${isMe ? "self-end rounded-br-none bg-purple-600" : "self-start rounded-bl-none bg-zinc-800"}`}
            >
              {!isMe && (
                <Text className="mb-1 text-[10px] font-bold text-zinc-400">
                  {item.sender.name || "User"}
                </Text>
              )}
              <Text className="text-sm text-white">{item.message}</Text>
            </View>
          );
        }}
      />

      <View className="flex-row items-center border-t border-zinc-800 bg-zinc-900/90 p-4 pb-8">
        <TextInput
          className="flex-1 rounded-xl bg-zinc-800 px-4 py-3 text-white"
          placeholder="Type a message..."
          placeholderTextColor="#71717a"
          value={message}
          onChangeText={setMessage}
          onSubmitEditing={handleSend}
        />
        <Pressable
          onPress={handleSend}
          disabled={sendMessageMutation.isPending || !message.trim()}
          className={`ml-3 items-center justify-center rounded-xl px-5 py-3 ${message.trim() ? "bg-purple-600" : "bg-zinc-800"}`}
        >
          {sendMessageMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="font-bold text-white">Send</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
