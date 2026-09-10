import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import {
  LOCATIONS,
  readScenarioState,
  resetScenario,
  restorePaymentDestination,
  TEST_CANTEEN,
  TEST_UPI,
  TEST_USERS,
} from "./fixtures";
import {
  Actor,
  demoPause,
  displayedDistance,
  installDemoOverlay,
  setDemoStep,
  stubRouting,
} from "./support";

const demoMode = process.env.E2E_DEMO === "1";

function orderReference(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

test("buyer, deliverer, and admin complete a paid tracked delivery and settlement", async ({
  browser,
}, testInfo) => {
  const users = await resetScenario();
  const baseURL = testInfo.project.use.baseURL as string;
  const demoDirectory = path.resolve("artifacts/demo");

  if (demoMode)
    await mkdir(path.join(demoDirectory, "capture"), { recursive: true });

  const recordingOptions = demoMode
    ? {
        viewport: { width: 720, height: 900 },
        recordVideo: {
          dir: path.join(demoDirectory, "capture"),
          size: { width: 720, height: 900 },
        },
      }
    : {};

  const buyerContext = await browser.newContext({
    baseURL,
    geolocation: LOCATIONS.buyer,
    permissions: ["geolocation"],
    ...recordingOptions,
  });
  const delivererContext = await browser.newContext({
    baseURL,
    geolocation: LOCATIONS.outsideCanteen,
    permissions: ["geolocation"],
    ...recordingOptions,
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
  const buyerVideo = buyer.page.video();
  const delivererVideo = deliverer.page.video();

  await Promise.all([
    installDemoOverlay(buyer.page, "BUYER"),
    installDemoOverlay(deliverer.page, "DELIVERER"),
  ]);

  try {
    await Promise.all([buyer.login(), deliverer.login(), admin.login()]);

    await admin.page.goto("/admin/payments");
    await admin.page.getByLabel("UPI ID").fill(TEST_UPI.id);
    await admin.page.getByLabel("Payee name").fill(TEST_UPI.payeeName);
    await admin.page
      .getByRole("button", { name: "Save UPI destination" })
      .click();
    await expect(
      admin.page.getByText("Payment destination updated."),
    ).toBeVisible();

    await Promise.all([
      setDemoStep(buyer.page, "Place a food order"),
      setDemoStep(deliverer.page, "Signed in outside the canteen geofence"),
    ]);
    await demoPause(1_200);

    await buyer.page
      .getByRole("link", { name: new RegExp(TEST_CANTEEN.name) })
      .click();
    await buyer.page.getByRole("button", { name: "ADD" }).click();
    await buyer.page.getByRole("link", { name: "Checkout" }).click();
    await buyer.page.getByRole("button", { name: "Use my location" }).click();
    await expect(buyer.page.getByText(/GPS:/)).toBeVisible();
    await setDemoStep(
      buyer.page,
      "Checkout uses the buyer's live GPS location",
    );
    await demoPause();

    await buyer.page.getByRole("button", { name: /Place Order/ }).click();
    await expect(buyer.page.getByTestId("order-status")).toContainText(
      "BROADCASTED",
      { timeout: 30_000 },
    );
    await setDemoStep(buyer.page, "Order broadcast to nearby delivery runners");

    const orderId = buyer.page.url().match(/\/orders\/([^/]+)\/status/)?.[1];
    expect(orderId).toBeTruthy();
    const shortOrderId = orderReference(orderId!);

    await deliverer.page.goto("/quests");
    await expect(
      deliverer.page.getByText(
        "No active delivery quests available right now.",
      ),
    ).toBeVisible();
    await setDemoStep(
      deliverer.page,
      "Outside the geofence: no quest is visible",
    );
    await demoPause(1_200);

    await deliverer.moveTo(LOCATIONS.canteen);
    await setDemoStep(deliverer.page, "GPS moves inside the canteen geofence");
    await expect(deliverer.page.getByText(TEST_CANTEEN.name)).toBeVisible();
    await demoPause();

    await deliverer.page.getByRole("button", { name: "Advance only" }).click();
    await expect(deliverer.page).toHaveURL(
      new RegExp(`/orders/${orderId}/status`),
    );
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "ACCEPTED",
    );
    await Promise.all([
      setDemoStep(buyer.page, "A runner accepted the order"),
      setDemoStep(
        deliverer.page,
        "Quest accepted: confirm the food is available",
      ),
    ]);
    await demoPause();

    await deliverer.page
      .getByRole("button", { name: "Items are available" })
      .click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "ITEM_AVAILABLE",
    );
    await setDemoStep(
      deliverer.page,
      "Items confirmed: wait for verified advance payment",
    );

    await expect(
      buyer.page.getByRole("button", { name: /Pay Now.*Advance/ }),
    ).toBeVisible({ timeout: 20_000 });
    await buyer.page.getByRole("button", { name: /Pay Now.*Advance/ }).click();

    // Payment routing is snapshotted when the buyer chooses a method. A later
    // ADMIN destination change must apply to future payments, not this order.
    await admin.page.goto("/admin/payments");
    await admin.page.getByLabel("UPI ID").fill(TEST_UPI.changedId);
    await admin.page.getByLabel("Payee name").fill(TEST_UPI.changedPayeeName);
    await admin.page
      .getByRole("button", { name: "Save UPI destination" })
      .click();
    await expect(
      admin.page.getByText("Payment destination updated."),
    ).toBeVisible();

    await buyer.page.reload();
    await expect(
      buyer.page.getByText(TEST_UPI.id, { exact: true }),
    ).toBeVisible();
    await expect(
      buyer.page.getByText(TEST_UPI.changedId, { exact: true }),
    ).toHaveCount(0);

    const paymentReference = `E2E-PAY-${Date.now()}`;
    await buyer.page
      .getByPlaceholder("UPI transaction reference / UTR")
      .fill(paymentReference);
    await buyer.page
      .getByRole("button", { name: "Submit for admin verification" })
      .click();
    await expect(
      buyer.page.getByText(/Payment reference submitted/i),
    ).toBeVisible();
    await setDemoStep(
      buyer.page,
      "Payment reference submitted for admin review",
    );

    await admin.page.goto("/admin/payments");
    const paymentCard = admin.page
      .locator("article")
      .filter({ hasText: shortOrderId })
      .filter({ hasText: paymentReference });
    await expect(paymentCard).toBeVisible({ timeout: 20_000 });
    await paymentCard
      .getByRole("button", { name: "Verify bank credit" })
      .click();
    await expect(admin.page.getByText("Payment verified.")).toBeVisible();

    await expect(
      buyer.page.getByText("CAmpDeliver has verified the incoming payment."),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      deliverer.page.getByText(/Advance payment is verified/i),
    ).toBeVisible({ timeout: 20_000 });
    await setDemoStep(
      deliverer.page,
      "Admin verified the bank credit: purchase can proceed",
    );

    deliverer.page.once("dialog", (dialog) => void dialog.accept());
    await deliverer.page
      .getByRole("button", { name: "I paid the canteen / Order placed" })
      .click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "PURCHASED",
    );

    await buyer.page.goto(`/order/${orderId}/tracker`);
    const distanceLabel = buyer.page.getByTestId("tracking-distance");
    await expect(distanceLabel).toBeVisible({ timeout: 20_000 });
    const initialDistance = displayedDistance(
      await distanceLabel.textContent(),
    );
    expect(initialDistance).toBeGreaterThan(0);
    await Promise.all([
      setDemoStep(buyer.page, "Live map follows the runner's GPS"),
      setDemoStep(deliverer.page, "Start the tracked campus delivery"),
    ]);

    await deliverer.page
      .getByRole("button", { name: "Start delivery" })
      .click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "ON_THE_WAY",
    );

    await deliverer.moveTo(LOCATIONS.midway);
    await expect
      .poll(async () => displayedDistance(await distanceLabel.textContent()), {
        timeout: 30_000,
      })
      .toBeLessThan(initialDistance);
    const midwayDistance = displayedDistance(await distanceLabel.textContent());

    await deliverer.moveTo(LOCATIONS.nearBuyer);
    await expect
      .poll(async () => displayedDistance(await distanceLabel.textContent()), {
        timeout: 30_000,
      })
      .toBeLessThan(midwayDistance);
    await deliverer.page.getByRole("button", { name: "Mark Near You" }).click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "NEAR_YOU",
    );

    await buyer.page.goto(`/orders/${orderId}/status`);
    const otp = (
      await buyer.page.getByTestId("delivery-otp").textContent()
    )?.trim();
    expect(otp).toMatch(/^\d{4}$/);
    await deliverer.page.getByPlaceholder("0000").fill(otp!);
    await deliverer.page.getByRole("button", { name: "Verify OTP" }).click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "DELIVERED",
    );
    await Promise.all([
      setDemoStep(
        buyer.page,
        "Delivery completed with the one-time handover code",
      ),
      setDemoStep(deliverer.page, "Delivery complete: request reimbursement"),
    ]);

    await deliverer.page.goto("/earnings");
    await expect(
      deliverer.page.getByRole("button", { name: "Request reimbursement" }),
    ).toBeVisible();
    await deliverer.page
      .getByRole("button", { name: "Request reimbursement" })
      .click();
    await expect(
      deliverer.page.getByText(/waiting in the manual admin settlement queue/i),
    ).toBeVisible();

    await admin.page.goto("/admin/payments");
    const settlementCard = admin.page
      .locator("article")
      .filter({ hasText: shortOrderId })
      .filter({ hasText: "Food reimbursement" });
    await expect(settlementCard).toBeVisible({ timeout: 20_000 });
    const payoutReference = `E2E-PAYOUT-${Date.now()}`;
    await settlementCard
      .getByPlaceholder("Outgoing payout UTR / reference")
      .fill(payoutReference);
    await settlementCard
      .getByRole("button", { name: "Mark settlement paid" })
      .click();
    await expect(admin.page.getByText("Settlement recorded.")).toBeVisible();

    const state = await readScenarioState(orderId!, users);
    expect(state.order).toMatchObject({
      status: "DELIVERED",
      foodPrice: TEST_CANTEEN.itemPrice,
      deliveryFee: 500,
      platformFee: 300,
    });
    expect(state.order?.delivererLatitude).toBeCloseTo(
      LOCATIONS.nearBuyer.latitude,
      4,
    );
    expect(state.payment).toMatchObject({
      method: "ADVANCE",
      status: "PAID",
      expectedAmount: TEST_CANTEEN.itemPrice + 500 + 300,
      destinationUpiId: TEST_UPI.id,
      destinationUpiPayeeName: TEST_UPI.payeeName,
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
  } finally {
    await Promise.allSettled([
      buyerContext.close(),
      delivererContext.close(),
      adminContext.close(),
    ]);
    await restorePaymentDestination(users);
    if (demoMode) {
      await Promise.all([
        buyerVideo?.saveAs(path.join(demoDirectory, "buyer.webm")),
        delivererVideo?.saveAs(path.join(demoDirectory, "deliverer.webm")),
      ]);
    }
  }
});
