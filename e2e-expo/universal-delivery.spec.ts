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

test("universal Expo buyer and deliverer complete the core product flow", async ({
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
  await Promise.all([stubRouting(buyerContext), stubRouting(delivererContext)]);

  const buyer = await buyerContext.newPage();
  const deliverer = await delivererContext.newPage();

  try {
    await Promise.all([
      login(buyer, TEST_USERS.buyer.phone),
      login(deliverer, TEST_USERS.deliverer.phone),
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
    await deliverer.getByText("Accept Quest", { exact: true }).click();
    await expect(deliverer).toHaveURL(new RegExp(`/orders/${orderId}/status`));
    await expect(deliverer.getByTestId("order-status")).toHaveText("ACCEPTED");

    await deliverer
      .getByText("Confirm Item Availability", { exact: true })
      .click();
    await expect(deliverer.getByTestId("order-status")).toHaveText("PREPARING");
    await expect(buyer.getByTestId("delivery-otp")).toBeVisible();

    await buyer.goto(`/order/${orderId}/chat`);
    await deliverer.goto(`/order/${orderId}/chat`);
    await buyer
      .getByPlaceholder("Type a message...")
      .fill("Buyer test message");
    await buyer.getByText("Send", { exact: true }).click();
    await expect(
      deliverer.getByText("Buyer test message", { exact: true }),
    ).toBeVisible();
    await deliverer
      .getByPlaceholder("Type a message...")
      .fill("Deliverer test reply");
    await deliverer.getByText("Send", { exact: true }).click();
    await expect(
      buyer.getByText("Deliverer test reply", { exact: true }),
    ).toBeVisible();

    await buyer.goto(`/order/${orderId}/tracker`);
    await deliverer.goto(`/orders/${orderId}/status`);
    const distanceLabel = buyer.getByTestId("tracking-distance");
    await expect(distanceLabel).toBeVisible();
    const initialDistance = displayedDistance(
      await distanceLabel.textContent(),
    );
    expect(initialDistance).toBeGreaterThan(0);

    await deliverer.getByText("Mark On The Way", { exact: true }).click();
    await expect(deliverer.getByTestId("order-status")).toHaveText(
      "ON_THE_WAY",
    );
    await delivererContext.setGeolocation(LOCATIONS.midway);
    await expect
      .poll(async () => displayedDistance(await distanceLabel.textContent()), {
        timeout: 30_000,
      })
      .toBeLessThan(initialDistance);

    await deliverer.getByText("Mark Near You", { exact: true }).click();
    await expect(deliverer.getByTestId("order-status")).toHaveText("NEAR_YOU");
    await buyer.goto(`/orders/${orderId}/status`);
    const otp = (await buyer.getByTestId("delivery-otp").textContent())?.trim();
    expect(otp).toMatch(/^\d{4}$/);

    await deliverer.getByLabel("Delivery OTP").fill(otp!);
    await deliverer.getByText("Verify", { exact: true }).click();
    await expect(deliverer.getByTestId("order-status")).toHaveText(
      /DELIVERED|COMPLETED/,
    );

    await buyer.goto("/wallet");
    await expect(
      buyer.getByText("Current Balance", { exact: true }),
    ).toBeVisible();
    await buyer.getByPlaceholder("e.g. 100").fill("1");
    await buyer.getByPlaceholder("Enter mock UTR").fill(`EXPO-${Date.now()}`);
    await buyer.getByText("Submit Top Up", { exact: true }).click();
    await expect(buyer.getByPlaceholder("e.g. 100")).toHaveValue("");

    await buyer.goto("/history_tab");
    await expect(
      buyer.getByText(TEST_CANTEEN.name, { exact: true }).first(),
    ).toBeVisible();
    await expect(buyer.getByText(/Delivered|Completed/i).first()).toBeVisible();

    const state = await readScenarioState(orderId!, users);
    expect(state.order?.status).toMatch(/DELIVERED|COMPLETED/);
    expect(state.order?.delivererLatitude).not.toBeNull();
  } finally {
    await Promise.all([buyerContext.close(), delivererContext.close()]);
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
