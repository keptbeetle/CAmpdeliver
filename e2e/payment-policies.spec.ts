import type { Browser } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  LOCATIONS,
  readScenarioState,
  resetScenario,
  restorePaymentDestination,
  TEST_CANTEEN,
  TEST_USERS,
} from "./fixtures";
import { Actor, stubRouting } from "./support";

async function setupAssignedOrder(
  browser: Browser,
  baseURL: string,
  allowPayAtDelivery: boolean,
) {
  const users = await resetScenario();
  const buyerContext = await browser.newContext({
    baseURL,
    geolocation: LOCATIONS.buyer,
    permissions: ["geolocation"],
  });
  const delivererContext = await browser.newContext({
    baseURL,
    geolocation: LOCATIONS.canteen,
    permissions: ["geolocation"],
  });
  const adminContext = await browser.newContext({ baseURL });
  await Promise.all([
    stubRouting(buyerContext),
    stubRouting(delivererContext),
    stubRouting(adminContext),
  ]);

  const buyer = new Actor(
    buyerContext,
    await buyerContext.newPage(),
    TEST_USERS.buyer.phone,
  );
  const deliverer = new Actor(
    delivererContext,
    await delivererContext.newPage(),
    TEST_USERS.deliverer.phone,
  );
  const admin = new Actor(
    adminContext,
    await adminContext.newPage(),
    TEST_USERS.admin.phone,
  );

  await Promise.all([buyer.login(), deliverer.login(), admin.login()]);
  await buyer.page
    .getByRole("link", { name: new RegExp(TEST_CANTEEN.name) })
    .click();
  await buyer.page.getByRole("button", { name: "ADD" }).click();
  await buyer.page.getByRole("link", { name: "Checkout" }).click();
  await buyer.page.getByRole("button", { name: "Use my location" }).click();
  await expect(buyer.page.getByText(/GPS:/)).toBeVisible();
  await buyer.page.getByRole("button", { name: /Place Order/ }).click();
  await expect(buyer.page.getByTestId("order-status")).toContainText(
    "BROADCASTED",
    { timeout: 30_000 },
  );
  const orderId = buyer.page.url().match(/\/orders\/([^/]+)\/status/)?.[1];
  expect(orderId).toBeTruthy();

  await deliverer.page.goto("/quests");
  await expect(deliverer.page.getByText(TEST_CANTEEN.name)).toBeVisible({
    timeout: 20_000,
  });
  await deliverer.page
    .getByRole("button", {
      name: allowPayAtDelivery ? "Offer Pay at Delivery" : "Advance only",
    })
    .click();
  await expect(deliverer.page.getByTestId("order-status")).toContainText(
    "ACCEPTED",
  );
  await deliverer.page
    .getByRole("button", { name: "Items are available" })
    .click();
  await expect(deliverer.page.getByTestId("order-status")).toContainText(
    "ITEM_AVAILABLE",
  );

  return {
    users,
    buyer,
    deliverer,
    admin,
    buyerContext,
    delivererContext,
    adminContext,
    orderId: orderId!,
  };
}

async function cleanupScenario(
  scenario: Awaited<ReturnType<typeof setupAssignedOrder>>,
) {
  await Promise.allSettled([
    scenario.buyerContext.close(),
    scenario.delivererContext.close(),
    scenario.adminContext.close(),
  ]);
  await restorePaymentDestination(scenario.users);
}

test("Pay at Delivery fronts the canteen cost but requires verified payment before OTP", async ({
  browser,
}, testInfo) => {
  const scenario = await setupAssignedOrder(
    browser,
    testInfo.project.use.baseURL as string,
    true,
  );
  const { buyer, deliverer, admin, orderId, users } = scenario;
  try {
    await expect(
      buyer.page.getByRole("button", { name: "Pay at Delivery" }),
    ).toBeVisible({ timeout: 20_000 });
    await buyer.page.getByRole("button", { name: "Pay at Delivery" }).click();

    await expect(
      buyer.page.getByText(/Payment happens at handover/i),
    ).toBeVisible();
    await expect(
      buyer.page.getByPlaceholder("UPI transaction reference / UTR"),
    ).toHaveCount(0);

    deliverer.page.once("dialog", (dialog) => void dialog.accept());
    await deliverer.page
      .getByRole("button", { name: "I paid the canteen / Order placed" })
      .click();
    await deliverer.page
      .getByRole("button", { name: "Start delivery" })
      .click();
    await deliverer.page.getByRole("button", { name: "Mark Near You" }).click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "NEAR_YOU",
    );

    const paymentReference = `E2E-POD-${Date.now()}`;
    const utrInput = buyer.page.getByPlaceholder(
      "UPI transaction reference / UTR",
    );
    await expect(utrInput).toBeVisible({ timeout: 20_000 });
    await utrInput.fill(paymentReference);
    await buyer.page
      .getByRole("button", { name: "Submit for admin verification" })
      .click();

    await admin.page.goto("/admin/payments");
    const verification = admin.page
      .locator("article")
      .filter({ hasText: paymentReference });
    await expect(verification).toBeVisible({ timeout: 20_000 });
    await verification
      .getByRole("button", { name: "Verify bank credit" })
      .click();
    await expect(admin.page.getByText("Payment verified.")).toBeVisible();

    const otp = (
      await buyer.page
        .getByTestId("delivery-otp")
        .textContent({ timeout: 20_000 })
    )?.trim();
    expect(otp).toMatch(/^\d{4}$/);
    await deliverer.page.getByPlaceholder("0000").fill(otp!);
    await deliverer.page.getByRole("button", { name: "Verify OTP" }).click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "DELIVERED",
    );

    const state = await readScenarioState(orderId, users);
    expect(state.order?.status).toBe("DELIVERED");
    expect(state.payment).toMatchObject({
      method: "PAY_AT_DELIVERY",
      status: "PAID",
      submittedUtr: paymentReference,
    });
    expect(state.settlement?.status).toBe("AVAILABLE");
  } finally {
    await cleanupScenario(scenario);
  }
});

test("verified advance payment cancelled before purchase enters and completes the refund queue", async ({
  browser,
}, testInfo) => {
  const scenario = await setupAssignedOrder(
    browser,
    testInfo.project.use.baseURL as string,
    false,
  );
  const { buyer, deliverer, admin, orderId, users } = scenario;
  try {
    await expect(
      buyer.page.getByRole("button", { name: /Pay Now.*Advance/ }),
    ).toBeVisible({ timeout: 20_000 });
    await buyer.page.getByRole("button", { name: /Pay Now.*Advance/ }).click();
    const paymentReference = `E2E-REFUND-IN-${Date.now()}`;
    await buyer.page
      .getByPlaceholder("UPI transaction reference / UTR")
      .fill(paymentReference);
    await buyer.page
      .getByRole("button", { name: "Submit for admin verification" })
      .click();

    await admin.page.goto("/admin/payments");
    const verification = admin.page
      .locator("article")
      .filter({ hasText: paymentReference });
    await expect(verification).toBeVisible({ timeout: 20_000 });
    await verification
      .getByRole("button", { name: "Verify bank credit" })
      .click();
    await expect(admin.page.getByText("Payment verified.")).toBeVisible();

    await expect(
      deliverer.page.getByRole("button", { name: "Cancel & queue refund" }),
    ).toBeVisible({ timeout: 20_000 });
    deliverer.page.once("dialog", (dialog) => void dialog.accept());
    await deliverer.page
      .getByRole("button", { name: "Cancel & queue refund" })
      .click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "CANCELLED",
    );

    await admin.page.goto("/admin/payments");
    const refundCard = admin.page
      .locator("article")
      .filter({ hasText: orderId.slice(0, 8).toUpperCase() })
      .filter({ hasText: "Refund" });
    await expect(refundCard).toBeVisible({ timeout: 20_000 });
    const refundReference = `E2E-REFUND-OUT-${Date.now()}`;
    await refundCard
      .getByPlaceholder("Outgoing refund UTR / reference")
      .fill(refundReference);
    await refundCard.getByRole("button", { name: "Mark refund sent" }).click();
    await expect(admin.page.getByText("Refund recorded.")).toBeVisible();

    const state = await readScenarioState(orderId, users);
    expect(state.order?.status).toBe("CANCELLED");
    expect(state.payment).toMatchObject({
      method: "ADVANCE",
      status: "REFUNDED",
      submittedUtr: paymentReference,
    });
    expect(state.settlement).toBeUndefined();
  } finally {
    await cleanupScenario(scenario);
  }
});
