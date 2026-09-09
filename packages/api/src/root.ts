import { authRouter } from "./router/auth";
import { canteenRouter } from "./router/canteen";
import { chatRouter } from "./router/chat";
import { landmarkRouter } from "./router/landmark";
import { menuRouter } from "./router/menu";
import { orderRouter } from "./router/order";
import { otpRouter } from "./router/otp";
import { paymentRouter } from "./router/payment";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  order: orderRouter,
  payment: paymentRouter,
  chat: chatRouter,
  otp: otpRouter,
  canteen: canteenRouter,
  menu: menuRouter,
  landmark: landmarkRouter,
});

export type AppRouter = typeof appRouter;
