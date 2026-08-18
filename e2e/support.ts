import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { TEST_PASSWORD } from "./fixtures";

const demoMode = process.env.E2E_DEMO === "1";

export interface Point {
  latitude: number;
  longitude: number;
}

export class Actor {
  constructor(
    readonly context: BrowserContext,
    readonly page: Page,
    readonly phone: string,
  ) {}

  async login(): Promise<void> {
    await this.page.goto("/");
    await this.page.getByLabel("Phone Number").fill(this.phone);
    await this.page.getByLabel("Password").fill(TEST_PASSWORD);
    await this.page.getByRole("button", { name: "Sign In" }).click();
    await expect(this.page.getByText("Campus Canteens")).toBeVisible();
  }

  async moveTo(point: Point): Promise<void> {
    await this.context.setGeolocation(point);
  }
}

export async function installDemoOverlay(
  page: Page,
  role: "BUYER" | "DELIVERER",
): Promise<void> {
  if (!demoMode) return;

  await page.addInitScript(
    ({ role }) => {
      const render = () => {
        if (!document.body) return;

        let roleBadge =
          document.querySelector<HTMLDivElement>("#e2e-demo-role");
        if (!roleBadge) {
          roleBadge = document.createElement("div");
          roleBadge.id = "e2e-demo-role";
          Object.assign(roleBadge.style, {
            position: "fixed",
            top: "74px",
            right: "18px",
            zIndex: "2147483647",
            padding: "7px 12px",
            borderRadius: "999px",
            background: "rgba(88, 28, 135, 0.94)",
            border: "1px solid rgba(216, 180, 254, 0.75)",
            color: "white",
            font: "700 12px/1 system-ui, sans-serif",
            letterSpacing: "0.12em",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
            pointerEvents: "none",
          });
          document.body.append(roleBadge);
        }
        roleBadge.textContent = role;

        let stepBadge =
          document.querySelector<HTMLDivElement>("#e2e-demo-step");
        if (!stepBadge) {
          stepBadge = document.createElement("div");
          stepBadge.id = "e2e-demo-step";
          Object.assign(stepBadge.style, {
            position: "fixed",
            left: "50%",
            bottom: "92px",
            zIndex: "2147483647",
            maxWidth: "82%",
            transform: "translateX(-50%)",
            padding: "10px 16px",
            borderRadius: "12px",
            background: "rgba(9, 9, 11, 0.92)",
            border: "1px solid rgba(168, 85, 247, 0.65)",
            color: "white",
            font: "600 14px/1.35 system-ui, sans-serif",
            textAlign: "center",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.45)",
            pointerEvents: "none",
          });
          document.body.append(stepBadge);
        }

        const step = localStorage.getItem("e2e-demo-step") ?? "";
        stepBadge.textContent = step;
        stepBadge.style.opacity = step ? "1" : "0";
      };

      document.addEventListener(
        "click",
        (event) => {
          const click = event as MouseEvent;
          const ring = document.createElement("div");
          Object.assign(ring.style, {
            position: "fixed",
            left: `${click.clientX}px`,
            top: `${click.clientY}px`,
            zIndex: "2147483647",
            width: "30px",
            height: "30px",
            transform: "translate(-50%, -50%)",
            borderRadius: "999px",
            border: "3px solid rgb(192, 132, 252)",
            boxShadow: "0 0 0 6px rgba(168, 85, 247, 0.22)",
            pointerEvents: "none",
          });
          document.body.append(ring);
          void ring
            .animate(
              [
                { opacity: 1, transform: "translate(-50%, -50%) scale(0.55)" },
                { opacity: 0, transform: "translate(-50%, -50%) scale(1.65)" },
              ],
              { duration: 650, easing: "ease-out" },
            )
            .finished.finally(() => ring.remove());
        },
        true,
      );

      document.addEventListener("DOMContentLoaded", render);
      new MutationObserver(render).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      window.setInterval(render, 500);
    },
    { role },
  );
}

export async function setDemoStep(page: Page, step: string): Promise<void> {
  if (!demoMode) return;

  await page.evaluate((value) => {
    localStorage.setItem("e2e-demo-step", value);
    const badge = document.querySelector<HTMLDivElement>("#e2e-demo-step");
    if (badge) {
      badge.textContent = value;
      badge.style.opacity = value ? "1" : "0";
    }
  }, step);
}

export async function demoPause(milliseconds = 850): Promise<void> {
  if (demoMode)
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function haversine(start: Point, end: Point): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRadians(end.latitude - start.latitude);
  const dLon = toRadians(end.longitude - start.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(start.latitude)) *
      Math.cos(toRadians(end.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function stubRouting(context: BrowserContext): Promise<void> {
  await context.route("https://router.project-osrm.org/**", async (route) => {
    const url = new URL(route.request().url());
    const points = url.pathname.split("/").at(-1)?.split(";");
    if (!points || points.length !== 2) return route.abort();

    const parse = (value: string): Point => {
      const [longitude, latitude] = value.split(",").map(Number);
      return { latitude: latitude!, longitude: longitude! };
    };
    const start = parse(points[0]!);
    const end = parse(points[1]!);

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        code: "Ok",
        routes: [
          {
            distance: haversine(start, end),
            geometry: {
              coordinates: [
                [start.longitude, start.latitude],
                [end.longitude, end.latitude],
              ],
            },
          },
        ],
      }),
    });
  });
}

export function displayedDistance(text: string | null): number {
  const match = text?.match(/([\d.]+)\s*(m|km)/);
  if (!match) throw new Error(`Could not parse distance: ${text}`);
  return Number(match[1]) * (match[2] === "km" ? 1000 : 1);
}
