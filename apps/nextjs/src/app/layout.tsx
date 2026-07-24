import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@acme/ui";
import { ThemeProvider } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";

import "~/app/styles.css";
import { CartProvider } from "~/app/_components/cart/CartContext";
import { GlobalTracker } from "~/app/_components/GlobalTracker";
import { BottomNav } from "~/app/_components/layout/BottomNav";
import { Header } from "~/app/_components/layout/Header";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://turbo.t3.gg"
      : "http://localhost:3000",
  ),
  title: "CAmpDeliver - Digital Campus Delivery & Side Quests",
  description:
    "Order food from campus canteens, top up your wallet, and complete delivery side quests to earn payouts.",
  openGraph: {
    title: "CAmpDeliver - Digital Campus Delivery & Side Quests",
    description:
      "Order food from campus canteens, top up your wallet, and complete delivery side quests to earn payouts.",
    url: "https://campdeliver.vercel.app",
    siteName: "CAmpDeliver",
  },
  twitter: {
    card: "summary_large_image",
    site: "@campdeliver",
    creator: "@campdeliver",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#09090b" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={cn(
          "min-h-screen bg-zinc-950 font-sans text-white antialiased selection:bg-purple-500 selection:text-white",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <TRPCReactProvider>
            <CartProvider>
              <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-zinc-950 shadow-2xl">
                <Header />
                <main className="flex-1 pb-24">{props.children}</main>
                <BottomNav />
                <GlobalTracker />
              </div>
              <Toaster />
            </CartProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
