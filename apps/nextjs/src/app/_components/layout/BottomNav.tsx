"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, ShoppingBag, TrendingUp } from "lucide-react";

import { useCart } from "~/app/_components/cart/CartContext";

export function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useCart();

  const navItems = [
    {
      label: "Home",
      href: "/",
      icon: Home,
      exact: true,
    },
    {
      label: "Quests",
      href: "/quests",
      icon: Compass,
      exact: false,
    },
    {
      label: "My Orders",
      href: "/orders",
      icon: ShoppingBag,
      exact: false,
      badge: totalItems > 0 ? null : null, // orders badge if needed
    },
    {
      label: "Earnings",
      href: "/earnings",
      icon: TrendingUp,
      exact: false,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-6xl -translate-x-1/2 border-t border-zinc-800/80 bg-zinc-950/95 p-2 backdrop-blur-lg">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 transition-all ${
                isActive
                  ? "font-semibold text-purple-400"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "scale-110" : ""}`} />
              <span className="text-[11px] tracking-tight">{item.label}</span>
              {isActive && (
                <span className="absolute -bottom-1 h-1 w-5 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
