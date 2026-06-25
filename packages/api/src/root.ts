import { authRouter } from "./router/auth";
import { orderRouter } from "./router/order";
import { walletRouter } from "./router/wallet";
import { chatRouter } from "./router/chat";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  order: orderRouter,
  wallet: walletRouter,
  chat: chatRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
