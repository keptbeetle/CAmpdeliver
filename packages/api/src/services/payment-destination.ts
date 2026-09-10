import { desc, eq } from "@acme/db";
import { db } from "@acme/db/client";
import {
  platformPaymentSettings,
  platformPaymentSettingsHistory,
} from "@acme/db/schema";

export const PAYMENT_SETTINGS_ID = "primary";
export const DEFAULT_UPI_PAYEE_NAME = "CAmpDeliver";

export async function getPaymentDestination() {
  const [settings] = await db
    .select({
      upiId: platformPaymentSettings.upiId,
      upiPayeeName: platformPaymentSettings.upiPayeeName,
      updatedAt: platformPaymentSettings.updatedAt,
    })
    .from(platformPaymentSettings)
    .where(eq(platformPaymentSettings.id, PAYMENT_SETTINGS_ID))
    .limit(1);

  return (
    settings ?? {
      upiId: null,
      upiPayeeName: DEFAULT_UPI_PAYEE_NAME,
      updatedAt: null,
    }
  );
}

export async function getPaymentDestinationHistory(limit = 10) {
  return db
    .select({
      id: platformPaymentSettingsHistory.id,
      previousUpiId: platformPaymentSettingsHistory.previousUpiId,
      previousUpiPayeeName: platformPaymentSettingsHistory.previousUpiPayeeName,
      newUpiId: platformPaymentSettingsHistory.newUpiId,
      newUpiPayeeName: platformPaymentSettingsHistory.newUpiPayeeName,
      changedByAdminId: platformPaymentSettingsHistory.changedByAdminId,
      createdAt: platformPaymentSettingsHistory.createdAt,
    })
    .from(platformPaymentSettingsHistory)
    .orderBy(desc(platformPaymentSettingsHistory.createdAt))
    .limit(limit);
}
