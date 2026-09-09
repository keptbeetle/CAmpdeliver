import { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { colors, radius, shadow, shortId } from "~/components/app/theme";
import { EmptyState, InlineNotice, LoadingState } from "~/components/app/ui";
import { useOrderRealtime } from "~/hooks/use-order-realtime";
import { trpc } from "~/utils/api";
import { showAppAlert } from "~/utils/dialog";

const ACTIVE_CHAT_STATUSES = [
  "ACCEPTED",
  "ITEM_AVAILABLE",
  "PURCHASED",
  "ON_THE_WAY",
  "NEAR_YOU",
];

export default function OrderChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery(trpc.chat.getMessages.queryOptions({ orderId: id }));
  const { data: orders, isLoading: ordersLoading } = useQuery(
    trpc.order.myOrders.queryOptions(),
  );
  const order = orders?.find((candidate) => candidate.id === id);

  const isAssigned = Boolean(order?.delivererId);
  const chatActive = Boolean(
    order && isAssigned && ACTIVE_CHAT_STATUSES.includes(order.status),
  );
  const isDeliverer = Boolean(order && order.delivererId === profile?.id);
  const counterpartLabel = isDeliverer ? "Buyer" : "Deliverer";

  const { refetch: refetchContactPhone } = useQuery({
    ...trpc.order.getOrderContactPhoneNumber.queryOptions({ orderId: id }),
    enabled: false,
  });

  const { broadcastChatEvent } = useOrderRealtime(id, {
    onChatUpdate: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.chat.getMessages.queryKey({ orderId: id }),
      });
    },
  });

  const sendMessageMutation = useMutation(
    trpc.chat.sendMessage.mutationOptions(),
  );

  const handleCallPress = async () => {
    if (!chatActive || callLoading) return;
    setCallLoading(true);
    try {
      const result = await refetchContactPhone();
      if (!result.data?.phoneNumber) {
        showAppAlert(
          "Phone unavailable",
          "A contact number is not available for this order.",
        );
        return;
      }

      const phoneUrl = `tel:${result.data.phoneNumber}`;
      if (!(await Linking.canOpenURL(phoneUrl))) {
        showAppAlert(
          "Dialer unavailable",
          "This device cannot open a phone call.",
        );
        return;
      }
      await Linking.openURL(phoneUrl);
    } catch (error) {
      showAppAlert(
        "Call could not start",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setCallLoading(false);
    }
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || !chatActive || sendMessageMutation.isPending) return;
    setSendError(null);
    try {
      await sendMessageMutation.mutateAsync({ orderId: id, message: trimmed });
      setMessage("");
      await queryClient.invalidateQueries({
        queryKey: trpc.chat.getMessages.queryKey({ orderId: id }),
      });
      await broadcastChatEvent();
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Message was not sent.",
      );
    }
  };

  if (messagesLoading || ordersLoading || !profile) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <LoadingState
            title="Opening order chat"
            copy="Loading the secure conversation for this delivery."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centerState}>
          <EmptyState
            icon="message-square"
            title="Chat is unavailable"
            copy="This order is not available in your recent history."
            actionLabel="Back to orders"
            onAction={() => router.replace("/history_tab" as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardRoot}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Order chat</Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>
              {counterpartLabel} · #{shortId(order.id)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${counterpartLabel}`}
            disabled={!chatActive || callLoading}
            onPress={() => void handleCallPress()}
            style={({ pressed }) => [
              styles.callButton,
              !chatActive && styles.disabled,
              pressed && chatActive && styles.pressed,
            ]}
          >
            <Feather
              name={callLoading ? "loader" : "phone"}
              size={17}
              color={chatActive ? colors.primary : colors.faint}
            />
          </Pressable>
        </View>

        {!isAssigned ? (
          <View style={styles.noticeWrap}>
            <InlineNotice
              icon="user-plus"
              title="Chat opens after assignment"
              copy="A buyer and deliverer conversation starts only after another student accepts this order."
            />
          </View>
        ) : !chatActive ? (
          <View style={styles.noticeWrap}>
            <InlineNotice
              icon="archive"
              title="Conversation is read-only"
              copy="This delivery is no longer active. Previous messages remain visible for context."
            />
          </View>
        ) : null}

        <FlatList
          data={messages ?? []}
          keyExtractor={(item) => item.id}
          inverted
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            messagesError ? (
              <View style={styles.emptyMessageWrap}>
                <EmptyState
                  icon="wifi-off"
                  title="Messages could not be loaded"
                  copy="Check your connection and retry."
                  actionLabel="Retry"
                  onAction={() => void refetchMessages()}
                />
              </View>
            ) : (
              <View style={styles.emptyMessageWrap}>
                <EmptyState
                  icon="message-circle"
                  title={
                    chatActive
                      ? `Message the ${counterpartLabel.toLowerCase()}`
                      : "No messages"
                  }
                  copy={
                    chatActive
                      ? "Use chat for pickup details, meeting points, or delivery coordination."
                      : "There are no messages stored for this order."
                  }
                />
              </View>
            )
          }
          renderItem={({ item }) => {
            const isMe = item.senderId === profile.id;
            return (
              <View
                style={[
                  styles.messageRow,
                  isMe ? styles.messageRowMine : styles.messageRowOther,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isMe ? styles.messageMine : styles.messageOther,
                  ]}
                >
                  {!isMe ? (
                    <Text style={styles.senderName}>
                      {item.sender.name || counterpartLabel}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.messageText, isMe && styles.messageTextMine]}
                  >
                    {item.message}
                  </Text>
                  <Text
                    style={[styles.messageTime, isMe && styles.messageTimeMine]}
                  >
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View
          style={[
            styles.composerWrap,
            { paddingBottom: Math.max(10, insets.bottom + 6) },
          ]}
        >
          {sendError ? (
            <View style={styles.sendErrorWrap}>
              <InlineNotice
                tone="warning"
                icon="alert-circle"
                title="Message not sent"
                copy={sendError}
              />
            </View>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Order chat message"
              editable={chatActive && !sendMessageMutation.isPending}
              style={styles.input}
              placeholder={
                chatActive ? "Type a message..." : "Chat unavailable"
              }
              placeholderTextColor={colors.faint}
              value={message}
              onChangeText={setMessage}
              onSubmitEditing={() => void handleSend()}
              returnKeyType="send"
              multiline
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={
                !chatActive || sendMessageMutation.isPending || !message.trim()
              }
              onPress={() => void handleSend()}
              style={({ pressed }) => [
                styles.sendButton,
                (!chatActive || !message.trim()) && styles.sendButtonDisabled,
                pressed && chatActive && message.trim() && styles.pressed,
              ]}
            >
              <Feather name="send" size={16} color={colors.white} />
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  callButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BAD9D7",
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  composer: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 9,
  },
  composerWrap: {
    backgroundColor: colors.panel,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  disabled: {
    opacity: 0.45,
  },
  emptyMessageWrap: {
    transform: [{ scaleY: -1 }],
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.bg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  headerCopy: {
    flex: 1,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    maxHeight: 112,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 11,
    textAlignVertical: "center",
  },
  keyboardRoot: {
    flex: 1,
  },
  messageBubble: {
    borderRadius: radius.lg,
    maxWidth: "82%",
    minWidth: 92,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  messageMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 5,
  },
  messageOther: {
    backgroundColor: colors.panel,
    borderBottomLeftRadius: 5,
    borderColor: colors.border,
    borderWidth: 1,
    ...shadow,
  },
  messageRow: {
    marginBottom: 10,
    width: "100%",
  },
  messageRowMine: {
    alignItems: "flex-end",
  },
  messageRowOther: {
    alignItems: "flex-start",
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextMine: {
    color: colors.white,
  },
  messageTime: {
    color: colors.faint,
    fontSize: 8,
    marginTop: 5,
    textAlign: "right",
  },
  messageTimeMine: {
    color: "#D5EBE9",
  },
  noticeWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: 6,
    height: 48,
    justifyContent: "center",
    minWidth: 78,
    paddingHorizontal: 14,
  },
  sendButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  sendButtonDisabled: {
    backgroundColor: colors.borderStrong,
  },
  sendErrorWrap: {
    marginBottom: 8,
  },
  senderName: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    marginBottom: 4,
  },
});
