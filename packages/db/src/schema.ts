import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type UserRole = "STUDENT" | "ADMIN";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().notNull(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phoneNumber: text("phone_number").unique(),
    rollNumber: text("roll_number"),
    hostelName: text("hostel_name"),
    avatarUrl: text("avatar_url"),
    role: text("role").$type<UserRole>().default("STUDENT").notNull(),
    // Deprecated pilot-wallet columns. They are retained only so the payment
    // branch can roll out without destructively migrating the live database.
    walletBalance: integer("wallet_balance").default(0).notNull(),
    frozenBalance: integer("frozen_balance").default(0).notNull(),
    pushToken: text("push_token"),
    deliveryNotificationsEnabled: boolean("delivery_notifications_enabled")
      .default(false)
      .notNull(),
    deliveryCanteenIds: jsonb("delivery_canteen_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    nearbyQuestAlertsEnabled: boolean("nearby_quest_alerts_enabled")
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("profiles_role_check", sql`${table.role} in ('STUDENT', 'ADMIN')`),
    check(
      "profiles_wallet_balance_nonnegative",
      sql`${table.walletBalance} >= 0`,
    ),
    check(
      "profiles_frozen_balance_nonnegative",
      sql`${table.frozenBalance} >= 0`,
    ),
  ],
);

export type OrderStatus =
  | "BROADCASTED"
  | "ACCEPTED"
  | "ITEM_AVAILABLE"
  | "PURCHASED"
  | "ON_THE_WAY"
  | "NEAR_YOU"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED"
  // Legacy values retained for safe rollout of old rows only.
  | "PREPARING"
  | "COMPLETED";

export type PaymentMethod = "ADVANCE" | "PAY_AT_DELIVERY";
export type PaymentStatus =
  | "NOT_STARTED"
  | "AWAITING_SELECTION"
  | "AWAITING_PAYMENT"
  | "PENDING_VERIFICATION"
  | "PAID"
  | "REJECTED"
  | "REFUND_REQUIRED"
  | "REFUNDED";
export type SettlementStatus =
  | "AVAILABLE"
  | "PENDING"
  | "PAID"
  | "ON_HOLD"
  | "FAILED";
export type OrderCancelledBy = "BUYER" | "DELIVERER" | "SYSTEM" | "ADMIN";

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
}

export const canteens = pgTable(
  "canteens",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radius: integer("radius").default(50).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("canteens_latitude_check", sql`${table.latitude} between -90 and 90`),
    check(
      "canteens_longitude_check",
      sql`${table.longitude} between -180 and 180`,
    ),
    check("canteens_radius_positive", sql`${table.radius} > 0`),
  ],
);

export const landmarks = pgTable(
  "landmarks",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radius: integer("radius").default(50).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "landmarks_latitude_check",
      sql`${table.latitude} between -90 and 90`,
    ),
    check(
      "landmarks_longitude_check",
      sql`${table.longitude} between -180 and 180`,
    ),
    check("landmarks_radius_positive", sql`${table.radius} > 0`),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    canteenId: uuid("canteen_id")
      .references(() => canteens.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("menu_items_price_nonnegative", sql`${table.price} >= 0`),
    index("idx_menu_items_canteen_available").on(
      table.canteenId,
      table.isAvailable,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
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
    status: text("status")
      .$type<OrderStatus>()
      .default("BROADCASTED")
      .notNull(),
    items: jsonb("items").$type<OrderItem[]>().notNull(),
    foodPrice: integer("food_price").notNull(),
    deliveryFee: integer("delivery_fee").default(500).notNull(),
    platformFee: integer("platform_fee").default(300).notNull(),
    delivererAllowsPayAtDelivery: boolean("deliverer_allows_pay_at_delivery")
      .default(false)
      .notNull(),
    otp: text("otp"),
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
    stateExpiresAt: timestamp("state_expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    itemsAvailableAt: timestamp("items_available_at", { withTimezone: true }),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryOtpFailedAttempts: integer("delivery_otp_failed_attempts")
      .default(0)
      .notNull(),
    deliveryOtpLockedUntil: timestamp("delivery_otp_locked_until", {
      withTimezone: true,
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by").$type<OrderCancelledBy>(),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "orders_status_check",
      sql`${table.status} in ('BROADCASTED','ACCEPTED','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU','DELIVERED','CANCELLED','FAILED','PREPARING','COMPLETED')`,
    ),
    check("orders_food_price_nonnegative", sql`${table.foodPrice} >= 0`),
    check("orders_delivery_fee_nonnegative", sql`${table.deliveryFee} >= 0`),
    check("orders_platform_fee_nonnegative", sql`${table.platformFee} >= 0`),
    check(
      "orders_delivery_otp_failed_attempts_nonnegative",
      sql`${table.deliveryOtpFailedAttempts} >= 0`,
    ),
    check(
      "orders_buyer_deliverer_distinct",
      sql`${table.delivererId} is null or ${table.delivererId} <> ${table.buyerId}`,
    ),
    check(
      "orders_canteen_latitude_check",
      sql`${table.canteenLatitude} between -90 and 90`,
    ),
    check(
      "orders_canteen_longitude_check",
      sql`${table.canteenLongitude} between -180 and 180`,
    ),
    check(
      "orders_delivery_latitude_check",
      sql`${table.deliveryLatitude} between -90 and 90`,
    ),
    check(
      "orders_delivery_longitude_check",
      sql`${table.deliveryLongitude} between -180 and 180`,
    ),
    index("idx_orders_buyer_created").on(table.buyerId, table.createdAt),
    index("idx_orders_deliverer_created").on(
      table.delivererId,
      table.createdAt,
    ),
    index("idx_orders_status_expires").on(table.status, table.stateExpiresAt),
    uniqueIndex("orders_one_active_buyer_unique")
      .on(table.buyerId)
      .where(
        sql`${table.status} in ('BROADCASTED','ACCEPTED','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU')`,
      ),
    uniqueIndex("orders_one_active_deliverer_unique")
      .on(table.delivererId)
      .where(
        sql`${table.delivererId} is not null and ${table.status} in ('ACCEPTED','ITEM_AVAILABLE','PURCHASED','ON_THE_WAY','NEAR_YOU')`,
      ),
  ],
);

export const orderPayments = pgTable(
  "order_payments",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    method: text("method").$type<PaymentMethod>(),
    status: text("status")
      .$type<PaymentStatus>()
      .default("NOT_STARTED")
      .notNull(),
    expectedAmount: integer("expected_amount").notNull(),
    submittedUtr: text("submitted_utr"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => profiles.id,
      {
        onDelete: "set null",
      },
    ),
    rejectionReason: text("rejection_reason"),
    refundReference: text("refund_reference"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedByAdminId: uuid("refunded_by_admin_id").references(
      () => profiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("order_payments_order_unique").on(table.orderId),
    uniqueIndex("order_payments_utr_unique").on(table.submittedUtr),
    uniqueIndex("order_payments_refund_reference_unique").on(
      table.refundReference,
    ),
    index("idx_order_payments_buyer_created").on(
      table.buyerId,
      table.createdAt,
    ),
    index("idx_order_payments_status_created").on(
      table.status,
      table.createdAt,
    ),
    check("order_payments_amount_positive", sql`${table.expectedAmount} > 0`),
    check(
      "order_payments_method_check",
      sql`${table.method} is null or ${table.method} in ('ADVANCE','PAY_AT_DELIVERY')`,
    ),
    check(
      "order_payments_status_check",
      sql`${table.status} in ('NOT_STARTED','AWAITING_SELECTION','AWAITING_PAYMENT','PENDING_VERIFICATION','PAID','REJECTED','REFUND_REQUIRED','REFUNDED')`,
    ),
  ],
);

export const orderSettlements = pgTable(
  "order_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    delivererId: uuid("deliverer_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    foodReimbursement: integer("food_reimbursement").notNull(),
    deliveryEarning: integer("delivery_earning").notNull(),
    amountDue: integer("amount_due").notNull(),
    status: text("status")
      .$type<SettlementStatus>()
      .default("AVAILABLE")
      .notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    payoutReference: text("payout_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidByAdminId: uuid("paid_by_admin_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    holdReason: text("hold_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("order_settlements_order_unique").on(table.orderId),
    uniqueIndex("order_settlements_payout_reference_unique").on(
      table.payoutReference,
    ),
    index("idx_order_settlements_deliverer_created").on(
      table.delivererId,
      table.createdAt,
    ),
    index("idx_order_settlements_status_created").on(
      table.status,
      table.createdAt,
    ),
    check(
      "order_settlements_food_nonnegative",
      sql`${table.foodReimbursement} >= 0`,
    ),
    check(
      "order_settlements_earning_nonnegative",
      sql`${table.deliveryEarning} >= 0`,
    ),
    check("order_settlements_amount_positive", sql`${table.amountDue} > 0`),
    check(
      "order_settlements_amount_matches",
      sql`${table.amountDue} = ${table.foodReimbursement} + ${table.deliveryEarning}`,
    ),
    check(
      "order_settlements_status_check",
      sql`${table.status} in ('AVAILABLE','PENDING','PAID','ON_HOLD','FAILED')`,
    ),
  ],
);

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
  payment: one(orderPayments, {
    fields: [orders.id],
    references: [orderPayments.orderId],
  }),
  settlement: one(orderSettlements, {
    fields: [orders.id],
    references: [orderSettlements.orderId],
  }),
}));

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, {
    fields: [orderPayments.orderId],
    references: [orders.id],
  }),
  buyer: one(profiles, {
    fields: [orderPayments.buyerId],
    references: [profiles.id],
  }),
}));

export const orderSettlementsRelations = relations(
  orderSettlements,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderSettlements.orderId],
      references: [orders.id],
    }),
    deliverer: one(profiles, {
      fields: [orderSettlements.delivererId],
      references: [profiles.id],
    }),
  }),
);

// Legacy wallet ledger retained only for backwards-compatible database rollout.
export type TransactionType =
  | "TOP_UP"
  | "ORDER_FREEZE"
  | "ORDER_UNFREEZE"
  | "DELIVERY_PAYOUT"
  | "ADMIN_COMMISSION"
  | "REFUND";
export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED";

export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  userId: uuid("user_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  amount: integer("amount").notNull(),
  type: text("type").$type<TransactionType>().notNull(),
  referenceId: uuid("reference_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  status: text("status")
    .$type<TransactionStatus>()
    .default("PENDING")
    .notNull(),
  utrNumber: text("utr_number").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_chat_messages_order_created").on(table.orderId, table.createdAt),
  ],
);

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

export const phoneVerifications = pgTable(
  "phone_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    phoneNumber: text("phone_number").notNull(),
    otpCode: text("otp_code").notNull(),
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "phone_verifications_failed_attempts_nonnegative",
      sql`${table.failedAttempts} >= 0`,
    ),
    index("idx_phone_verifications_lookup").on(
      table.phoneNumber,
      table.createdAt.desc(),
    ),
  ],
);
