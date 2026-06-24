import { sql } from "drizzle-orm";
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Roles enum: STUDENT, DELIVERER, ADMIN
export type UserRole = "STUDENT" | "DELIVERER" | "ADMIN";

// Profiles table: Maps to Supabase auth.users.id
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(), // Linked to auth.users.id
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  role: text("role").$type<UserRole>().default("STUDENT").notNull(),
  walletBalance: integer("wallet_balance").default(0).notNull(), // In paise (e.g. 10000 = ₹100.00)
  frozenBalance: integer("frozen_balance").default(0).notNull(), // In paise
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Order Status enum: BROADCASTED, ACCEPTED, PREPARING, DELIVERED, COMPLETED, CANCELLED
export type OrderStatus =
  | "BROADCASTED"
  | "ACCEPTED"
  | "PREPARING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

export interface OrderItem {
  name: string;
  quantity: number;
  price: number; // In paise
}

// Orders table
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  buyerId: uuid("buyer_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  delivererId: uuid("deliverer_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  status: text("status").$type<OrderStatus>().default("BROADCASTED").notNull(),
  items: jsonb("items").$type<OrderItem[]>().notNull(),
  foodPrice: integer("food_price").notNull(), // In paise
  deliveryFee: integer("delivery_fee").default(500).notNull(), // In paise, default ₹5
  otp: text("otp"), // OTP for delivery confirmation
  canteenName: text("canteen_name").notNull(),
  canteenLatitude: doublePrecision("canteen_latitude").notNull(),
  canteenLongitude: doublePrecision("canteen_longitude").notNull(),
  deliveryLocationName: text("delivery_location_name").notNull(),
  deliveryLatitude: doublePrecision("delivery_latitude").notNull(),
  deliveryLongitude: doublePrecision("delivery_longitude").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Wallet Transaction types: TOP_UP, ORDER_FREEZE, ORDER_UNFREEZE, DELIVERY_PAYOUT, ADMIN_COMMISSION, REFUND
export type TransactionType =
  | "TOP_UP"
  | "ORDER_FREEZE"
  | "ORDER_UNFREEZE"
  | "DELIVERY_PAYOUT"
  | "ADMIN_COMMISSION"
  | "REFUND";

// Wallet Transaction status: PENDING, SUCCESS, FAILED
export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED";

// Wallet Transactions table
export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  userId: uuid("user_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  amount: integer("amount").notNull(), // In paise, positive for credit, negative for debit
  type: text("type").$type<TransactionType>().notNull(),
  referenceId: uuid("reference_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  status: text("status")
    .$type<TransactionStatus>()
    .default("PENDING")
    .notNull(),
  utrNumber: text("utr_number").unique(), // Unique UTR for top-ups
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chat Messages table
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  senderId: uuid("sender_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
