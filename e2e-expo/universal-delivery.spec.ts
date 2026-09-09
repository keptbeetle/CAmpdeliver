import { expect, test } from "@playwright/test";

import {
  LOCATIONS,
  readScenarioState,
  resetScenario,
  TEST_CANTEEN,
  TEST_PASSWORD,
  TEST_USERS,
} from "../e2e/fixtures";
import { displayedDistance, stubRouting } from "../e2e/support";

async function login(
  page: import("@playwright/test").Page,
  phone: string,
): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel("Phone Number").fill(phone);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByText("Sign In", { exact: true }).click();
  await expect(
    page.getByText("Campus Canteens", { exact: true }),
  ).toBeVisible();
}

function orderReference(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

test("universal Expo buyer, deliverer, and admin complete payment, delivery, and settlement", async ({
  browser,
}, testInfo) => {
  const users = await resetScenario();
  const baseURL = testInfo.project.use.baseURL as string;

  const buyerContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    geolocation: LOCATIONS.buyer,
    permissions: ["geolocation"],
  });
  const delivererContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    geolocation: LOCATIONS.outsideCanteen,
    permissions: ["geolocation"],
  });
  const adminContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  await Promise.all([
    stubRouting(buyerContext),
    stubRouting(delivererContext),
    stubRouting(adminContext),
  ]);

  const buyer = await buyerContext.newPage();
  const deliverer = await delivererContext.newPage();
  const admin = await adminContext.newPage();

  try {
    await Promise.all([
      login(buyer, TEST_USERS.buyer.phone),
      login(deliverer, TEST_USERS.deliverer.phone),
      login(admin, TEST_USERS.admin.phone),
    ]);

    await buyer.getByText(TEST_CANTEEN.name, { exact: true }).first().click();
    await expect(
      buyer.getByText(TEST_CANTEEN.itemName, { exact: true }),
    ).toBeVisible();
    await buyer.getByText("ADD", { exact: true }).click();
    await buyer.getByText("View Cart", { exact: true }).click();
    await expect(buyer.getByText("Checkout", { exact: true })).toBeVisible();
    await expect(
      buyer.getByText("Auto GPS Location", { exact: true }),
    ).toBeVisible();
    await buyer.getByText("Place Order", { exact: true }).click();

    await expect(buyer).toHaveURL(/\/orders\/[^/]+\/status/);
    const orderId = buyer.url().match(/\/orders\/([^/]+)\/status/)?.[1];
    expect(orderId).toBeTruthy();
    const shortOrderId = orderReference(orderId!);
    await expect(buyer.getByTestId("order-status")).toHaveText("BROADCASTED");

    await deliverer.goto("/quests");
    await expect(
      deliverer.getByText("No active quests nearby", { exact: true }),
    ).toBeVisible();

    await delivererContext.setGeolocation(LOCATIONS.canteen);
    await deliverer.reload();
    await expect(
      deliverer.getByText(TEST_CANTEEN.name, { exact: true }),
    ).toBeVisible();
    await deliverer.getByText("Advance only", { exact: true }).click();
    await expect(deliverer).toHaveURL(new RegExp(`/orders/${orderId}/status`));
    await expect(deliverer.getByTestId("order-status")).toHaveText("ACCEPTED");

    await deliverer.getByText("Items Are Available", { exact: true }).click();
    await expect(deliverer.getByTestId("order-status")).toHaveText(
      "ITEM_AVAILABLE",
    );

    await expect(
      buyer.getByText("Pay Now - Advance", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await buyer.getByText("Pay Now - Advance", { exact: true }).click();
    const paymentReference = `EXPO-PAY-${Date.now()}`;
    await buyer
      .getByPlaceholder("UPI transaction reference / UTR")
      .fill(paymentReference);
    await buyer
      .getByText("Submit for Admin Verification", { exact: true })
      .click();
    await expect(
      buyer.getByText("Payment submitted for verification", { exact: true }),
    ).toBeVisible();

    await admin.goto("/admin/payments");
    const paymentCard = admin
      .getByText(`Order #${shortOrderId}`, { exact: true })
      .locator("..")
      .locator("..");
    await expect(
      admin.getByText(paymentReference, { exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await paymentCard.getByText("Verify bank credit", { exact: true }).click();

    await expect(
      buyer.getByText("Payment verified", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      deliverer.getByText("Buyer payment secured", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    deliverer.once("dialog", (dialog) => void dialog.accept());
    await deliverer
      .getByText("I Paid the Canteen / Order Placed", { exact: true })
      .click();
    await expect(deliverer.getByTestId("order-status")).toHaveText("PURCHASED");

    await buyer.goto(`/order/${orderId}/chat`);
    await deliverer.goto(`/order/${orderId}/chat`);
    await buyer
      .getByPlaceholder("Type a message...")
      .fill("Buyer test message");
    await buyer.getByText("Send", { exact: true }).click();
    await expect(
      deliverer.getByText("Buyer test message", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await deliverer
      .getByPlaceholder("Type a message...")
      .fill("Deliverer test reply");
    await deliverer.getByText("Send", { exact: true }).click();
    await expect(
      buyer.getByText("Deliverer test reply", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    await buyer.goto(`/order/${orderId}/tracker`);
    await deliverer.goto(`/orders/${orderId}/status`);
    const distanceLabel = buyer.getByTestId("tracking-distance");
    await expect(distanceLabel).toBeVisible({ timeout: 20_000 });
    const initialDistance = displayedDistance(
      await distanceLabel.textContent(),
    );
    expect(initialDistance).toBeGreaterThan(0);

    await deliverer.getByText("Start Delivery", { exact: true }).click();
    await expect(deliverer.getByTestId("order-status")).toHaveText(
      "ON_THE_WAY",
    );
    await delivererContext.setGeolocation(LOCATIONS.midway);
    await expect
      .poll(async () => displayedDistance(await distanceLabel.textContent()), {
        timeout: 30_000,
      })
      .toBeLessThan(initialDistance);

    await delivererContext.setGeolocation(LOCATIONS.nearBuyer);
    await deliverer.getByText("Mark Near You", { exact: true }).click();
    await expect(deliverer.getByTestId("order-status")).toHaveText("NEAR_YOU");
    await buyer.goto(`/orders/${orderId}/status`);
    const otp = (await buyer.getByTestId("delivery-otp").textContent())?.trim();
    expect(otp).toMatch(/^\d{4}$/);

    await deliverer.getByLabel("Delivery OTP").fill(otp!);
    await deliverer.getByText("Verify", { exact: true }).click();
    await expect(deliverer.getByTestId("order-status")).toHaveText("DELIVERED");

    await deliverer.goto("/earnings");
    await expect(
      deliverer.getByText("Request Reimbursement", { exact: true }),
    ).toBeVisible();
    await deliverer.getByText("Request Reimbursement", { exact: true }).click();
    await expect(
      deliverer.getByText("Settlement requested", { exact: true }),
    ).toBeVisible();

    await admin.goto("/admin/payments");
    await expect(
      admin.getByText(`Settlement #${shortOrderId}`, { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    const payoutReference = `EXPO-PAYOUT-${Date.now()}`;
    await admin
      .getByPlaceholder("Outgoing payout UTR / reference")
      .fill(payoutReference);
    await admin.getByText("Mark Settlement Paid", { exact: true }).click();

    const state = await readScenarioState(orderId!, users);
    expect(state.order).toMatchObject({
      status: "DELIVERED",
      foodPrice: TEST_CANTEEN.itemPrice,
      deliveryFee: 500,
      platformFee: 300,
    });
    expect(state.order?.delivererLatitude).not.toBeNull();
    expect(state.payment).toMatchObject({
      method: "ADVANCE",
      status: "PAID",
      expectedAmount: TEST_CANTEEN.itemPrice + 500 + 300,
      submittedUtr: paymentReference,
      verifiedByAdminId: users.adminId,
    });
    expect(state.settlement).toMatchObject({
      status: "PAID",
      foodReimbursement: TEST_CANTEEN.itemPrice,
      deliveryEarning: 500,
      amountDue: TEST_CANTEEN.itemPrice + 500,
      payoutReference,
    });

    await buyer.goto("/history_tab");
    await expect(
      buyer.getByText(TEST_CANTEEN.name, { exact: true }).first(),
    ).toBeVisible();
    await expect(buyer.getByText(/Delivered/i).first()).toBeVisible();
  } finally {
    await Promise.all([
      buyerContext.close(),
      delivererContext.close(),
      adminContext.close(),
    ]);
  }
});

test("universal Expo authentication exposes sign-in and account creation", async ({
  page,
}) => {
  await page.goto("/auth");
  await expect(page.getByLabel("Phone Number")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByText("Create Account", { exact: true }).click();
  await expect(
    page.getByText("Create your campus delivery account", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Hostel Name")).toBeVisible();
});
