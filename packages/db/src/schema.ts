import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";

// Roles enum: STUDENT, DELIVERER, ADMIN
export type UserRole = "STUDENT" | "DELIVERER" | "ADMIN";

// Profiles table: Maps to Supabase auth.users.id
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(), // Linked to auth.users.id
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phoneNumber: text("phone_number").unique(),
  rollNumber: text("roll_number"),
  hostelName: text("hostel_name"),
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

// Order Status enum: BROADCASTED, ACCEPTED, PREPARING, ON_THE_WAY, NEAR_YOU, DELIVERED, COMPLETED, CANCELLED
export type OrderStatus =
  | "BROADCASTED"
  | "ACCEPTED"
  | "PREPARING"
  | "ON_THE_WAY"
  | "NEAR_YOU"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

export interface OrderItem {
  name: string;
  quantity: number;
  price: number; // In paise
}

// Canteens table
export const canteens = pgTable("canteens", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radius: integer("radius").default(50).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Landmarks table
export const landmarks = pgTable("landmarks", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radius: integer("radius").default(50).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Menu Items table
export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  canteenId: uuid("canteen_id")
    .references(() => canteens.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  price: integer("price").notNull(), // In paise
  isAvailable: boolean("is_available").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Orders table
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  buyerId: uuid("buyer_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  delivererId: uuid("deliverer_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  canteenId: uuid("canteen_id").references(() => canteens.id, {
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
  delivererLatitude: doublePrecision("deliverer_latitude"),
  delivererLongitude: doublePrecision("deliverer_longitude"),
  buyerLatitude: doublePrecision("buyer_latitude"),
  buyerLongitude: doublePrecision("buyer_longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const canteensRelations = relations(canteens, ({ many }) => ({
  menuItems: many(menuItems),
  orders: many(orders),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  canteen: one(canteens, {
    fields: [menuItems.canteenId],
    references: [canteens.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  canteen: one(canteens, {
    fields: [orders.canteenId],
    references: [canteens.id],
  }),
}));

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

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  sender: one(profiles, {
    fields: [chatMessages.senderId],
    references: [profiles.id],
  }),
  order: one(orders, {
    fields: [chatMessages.orderId],
    references: [orders.id],
  }),
}));

// Phone OTP Verifications table
export const phoneVerifications = pgTable("phone_verifications", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  phoneNumber: text("phone_number").notNull(),
  otpCode: text("otp_code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_phone_verifications_lookup").on(table.phoneNumber, table.createdAt.desc()),
]);