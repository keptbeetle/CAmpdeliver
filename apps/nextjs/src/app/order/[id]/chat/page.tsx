"use client";

import { use, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useOrderRealtime } from "~/hooks/use-order-realtime";

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const orderId = id;
  const router = useRouter();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: messages, isLoading } = useQuery(trpc.chat.getMessages.queryOptions({ orderId }));

  const { broadcastChatEvent } = useOrderRealtime(orderId);

  const sendMessageMutation = useMutation(trpc.chat.sendMessage.mutationOptions({
    onSuccess: async () => {
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: trpc.chat.getMessages.queryKey({ orderId }) });
      await broadcastChatEvent();
    },
  }));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessageMutation.mutate({ orderId, message: message.trim() });
  };

  if (isLoading || !profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 p-4 shadow-md">
        <div>
          <h1 className="text-lg font-bold text-white">Order Chat</h1>
          <p className="text-xs text-zinc-400">Order ID: {orderId.slice(0, 8)}...</p>
        </div>
        <button
          onClick={() => router.push(`/order/${orderId}/tracker`)}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Back to Tracker
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="flex flex-col-reverse justify-end gap-4 min-h-full">
          {messages?.map((msg) => {
            const isMe = msg.senderId === profile.id;
            return (
              <div
                key={msg.id}
                className={`flex max-w-[80%] flex-col rounded-2xl p-4 ${
                  isMe ? "self-end rounded-br-none bg-purple-600" : "self-start rounded-bl-none bg-zinc-800"
                }`}
              >
                {!isMe && (
                  <span className="mb-1 text-[10px] font-bold text-zinc-400">
                    {msg.sender?.name || "User"}
                  </span>
                )}
                <span className="text-sm text-white">{msg.message}</span>
              </div>
            );
          })}
          {(!messages || messages.length === 0) && (
            <div className="flex items-center justify-center py-10">
              <span className="text-sm text-zinc-500">No messages yet. Say hello!</span>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-900 p-4"
      >
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-400 focus:border-purple-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sendMessageMutation.isPending || !message.trim()}
          className="rounded-xl bg-purple-600 px-6 py-3 font-bold text-white hover:bg-purple-500 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
