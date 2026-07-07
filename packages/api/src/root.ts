import { authRouter } from "./router/auth";
import { orderRouter } from "./router/order";
import { walletRouter } from "./router/wallet";
import { chatRouter } from "./router/chat";
import { otpRouter } from "./router/otp";
import { canteenRouter } from "./router/canteen";
import { menuRouter } from "./router/menu";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  order: orderRouter,
  wallet: walletRouter,
  chat: chatRouter,
  otp: otpRouter,
  canteen: canteenRouter,
  menu: menuRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
