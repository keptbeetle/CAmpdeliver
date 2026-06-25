import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { supabase } from "~/utils/auth";

export default function OrderChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: messages, isLoading } = useQuery(trpc.chat.getMessages.queryOptions({ orderId: id }));

  const { broadcastChatEvent } = useOrderRealtime(id, {
    onChatUpdate: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.chat.getMessages.queryKey({ orderId: id }) });
    },
  });

  const sendMessageMutation = useMutation(
    trpc.chat.sendMessage.mutationOptions({
      onSuccess: async () => {
        setMessage("");
        await queryClient.invalidateQueries({ queryKey: trpc.chat.getMessages.queryKey({ orderId: id }) });
        await broadcastChatEvent();
      },
    })
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
      <Stack.Screen options={{ title: "Order Chat", headerTintColor: "#fff", headerStyle: { backgroundColor: "#09090b" } }} />

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const isMe = item.senderId === profile.id;
          return (
            <View className={`mb-4 max-w-[80%] rounded-2xl p-4 ${isMe ? "self-end bg-purple-600 rounded-br-none" : "self-start bg-zinc-800 rounded-bl-none"}`}>
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

      <View className="border-t border-zinc-800 bg-zinc-900/90 p-4 pb-8 flex-row items-center">
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
