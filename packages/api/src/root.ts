import { authRouter } from "./router/auth";
import { orderRouter } from "./router/order";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  order: orderRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
