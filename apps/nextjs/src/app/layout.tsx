import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { eq } from "@acme/db";
import { db } from "@acme/db/client";
import { profiles } from "@acme/db/schema";
import { cn } from "@acme/ui";
import { ThemeProvider } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { getRegisteredUser } from "~/auth/server";
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
    "Order food from campus canteens and complete delivery quests for student peers with secure pilot payments and tracked reimbursements.",
  openGraph: {
    title: "CAmpDeliver - Digital Campus Delivery & Side Quests",
    description:
      "Order food from campus canteens and complete delivery quests for student peers with secure pilot payments and tracked reimbursements.",
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
    { media: "(prefers-color-scheme: light)", color: "#f4f9ff" },
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

export default async function RootLayout(props: { children: React.ReactNode }) {
  const user = await getRegisteredUser();
  const [profile] = user
    ? await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1)
    : [];
  const hasAppProfile = Boolean(user && profile);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={hasAppProfile ? "dark" : "light"}
    >
      <body
        className={cn(
          "min-h-screen font-sans antialiased selection:bg-blue-600 selection:text-white",
          hasAppProfile
            ? "bg-zinc-950 text-white"
            : "bg-[#f4f9ff] text-slate-900",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <TRPCReactProvider>
            <CartProvider>
              <div
                className={cn(
                  "relative mx-auto flex min-h-screen w-full flex-col",
                  hasAppProfile
                    ? "max-w-6xl bg-zinc-950 shadow-2xl"
                    : "max-w-none bg-[#f4f9ff]",
                )}
              >
                {hasAppProfile ? <Header /> : null}
                <main className={cn("flex-1", hasAppProfile && "pb-24")}>
                  {props.children}
                </main>
                {hasAppProfile ? <BottomNav /> : null}
                {hasAppProfile ? <GlobalTracker /> : null}
              </div>
              <Toaster />
            </CartProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
