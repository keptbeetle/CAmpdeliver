import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import {
  LOCATIONS,
  readScenarioState,
  resetScenario,
  TEST_CANTEEN,
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

test("buyer and deliverer complete a tracked delivery", async ({
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
  await Promise.all([stubRouting(buyerContext), stubRouting(delivererContext)]);

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
  const buyerVideo = buyer.page.video();
  const delivererVideo = deliverer.page.video();

  await Promise.all([
    installDemoOverlay(buyer.page, "BUYER"),
    installDemoOverlay(deliverer.page, "DELIVERER"),
  ]);

  try {
    await Promise.all([buyer.login(), deliverer.login()]);
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

    await deliverer.page.getByRole("button", { name: "Accept Quest" }).click();
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
      .getByRole("button", { name: "Confirm Item Availability" })
      .click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "PREPARING",
    );
    await expect(buyer.page.getByTestId("delivery-otp")).toBeVisible();
    await Promise.all([
      setDemoStep(buyer.page, "Payment frozen and a delivery OTP generated"),
      setDemoStep(deliverer.page, "Food confirmed: begin the tracked delivery"),
    ]);
    await demoPause(1_200);

    await buyer.page.goto(`/order/${orderId}/tracker`);
    const distanceLabel = buyer.page.getByTestId("tracking-distance");
    await expect(distanceLabel).toBeVisible({ timeout: 20_000 });
    const initialDistance = displayedDistance(
      await distanceLabel.textContent(),
    );
    expect(initialDistance).toBeGreaterThan(0);
    await Promise.all([
      setDemoStep(buyer.page, "Live map follows the runner's GPS"),
      setDemoStep(deliverer.page, "Move along the simulated campus route"),
    ]);
    await demoPause();

    await deliverer.moveTo(LOCATIONS.midway);
    await expect
      .poll(
        async () => {
          const distance = displayedDistance(await distanceLabel.textContent());
          return distance > 0 && distance < initialDistance;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    const midwayDistance = displayedDistance(await distanceLabel.textContent());
    await setDemoStep(
      buyer.page,
      "The displayed distance decreases in real time",
    );
    await demoPause();

    await deliverer.page
      .getByRole("button", { name: "Mark On The Way" })
      .click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "ON_THE_WAY",
    );
    await setDemoStep(deliverer.page, "Status changed to ON THE WAY");

    await deliverer.moveTo(LOCATIONS.nearBuyer);
    await expect
      .poll(
        async () => {
          const distance = displayedDistance(await distanceLabel.textContent());
          return distance > 0 && distance < midwayDistance;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    await setDemoStep(
      buyer.page,
      "Location keeps updating after the ON THE WAY transition",
    );
    await demoPause(1_100);

    await deliverer.page.getByRole("button", { name: "Mark Near You" }).click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "NEAR_YOU",
    );
    await Promise.all([
      setDemoStep(buyer.page, "Runner is nearby: share the one-time code"),
      setDemoStep(deliverer.page, "Enter the buyer's 4-digit delivery code"),
    ]);
    await demoPause(1_200);

    const otp = (
      await buyer.page.getByTestId("delivery-otp").textContent()
    )?.trim();
    expect(otp).toMatch(/^\d{4}$/);
    await deliverer.page.getByPlaceholder("1234").fill(otp!);
    await demoPause(600);
    await deliverer.page.getByRole("button", { name: "Verify" }).click();
    await expect(deliverer.page.getByTestId("order-status")).toContainText(
      "DELIVERED",
    );
    await Promise.all([
      setDemoStep(buyer.page, "Delivery completed securely"),
      setDemoStep(deliverer.page, "Delivered: payout and commission settled"),
    ]);
    await demoPause(2_000);

    const state = await readScenarioState(orderId!, users);
    expect(state.order).toMatchObject({
      status: "DELIVERED",
      foodPrice: TEST_CANTEEN.itemPrice,
      deliveryFee: 500,
    });
    expect(state.order?.delivererLatitude).toBeCloseTo(
      LOCATIONS.nearBuyer.latitude,
      4,
    );

    const balances = new Map(
      state.profiles.map((profile) => [profile.id, profile]),
    );
    expect(balances.get(users.buyerId)).toMatchObject({
      walletBalance: 87_500,
      frozenBalance: 0,
    });
    expect(balances.get(users.delivererId)?.walletBalance).toBe(12_225);
    expect(state.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ORDER_FREEZE", amount: -12_500 }),
        expect.objectContaining({ type: "DELIVERY_PAYOUT", amount: 12_225 }),
        expect.objectContaining({ type: "ADMIN_COMMISSION", amount: 275 }),
      ]),
    );
  } finally {
    await Promise.all([buyerContext.close(), delivererContext.close()]);
    if (demoMode) {
      await Promise.all([
        buyerVideo?.saveAs(path.join(demoDirectory, "buyer.webm")),
        delivererVideo?.saveAs(path.join(demoDirectory, "deliverer.webm")),
      ]);
    }
  }
});
