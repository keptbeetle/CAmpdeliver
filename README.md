# CAmpDeliver 🚀

**CAmpDeliver** is a digital campus ecosystem designed to gamify peer-to-peer food delivery within university campuses. Students can act as **buyers** by ordering food from campus canteens, or as **deliverers** (taking on "quests") to pick up and deliver orders for their peers in exchange for a delivery fee.

The customer and deliverer experience is a single universal **Expo application** that renders on Android and the web. **Next.js** remains the API gateway and the web-first administration surface.

---

## 🛠️ Tech Stack

Built on top of the **T3 Stack** philosophy within a **Turborepo** monorepo using **pnpm**:

- **Universal Client**: [Expo](https://expo.dev/) + React Native Web + NativeWind (Android and web from the same screens)
- **API & Admin Web**: [Next.js 15](https://nextjs.org/) (App Router), React 19, Tailwind CSS v4, Lucide Icons
- **API Layer**: [tRPC v11](https://trpc.io/) for end-to-end type safety between server and clients
- **Database & ORM**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication & Realtime**: [Supabase Auth](https://supabase.com/) & Supabase Realtime (WebSockets)
- **State & Data Fetching**: [@tanstack/react-query](https://tanstack.com/) & Local React Cart Context
- **Validation**: [Zod](https://zod.dev/) schemas shared across packages

---

## 📦 Monorepo Structure

```text
CAmpDeliver/
├── apps/
│   ├── expo/             # Universal customer/deliverer app (Android + web)
│   └── nextjs/           # API gateway and web-first admin dashboard
└── packages/
    ├── api/              # tRPC router definitions & business logic procedures
    ├── auth/             # Supabase Auth configuration & helper utilities
    ├── db/               # PostgreSQL schema definitions & Drizzle database client
    ├── ui/               # Shared cross-platform React UI components (shadcn/ui based)
    └── validators/       # Shared Zod validation schemas
```

---

## Universal Client Architecture

The Expo routes are the canonical customer and deliverer UI. Shared screens, tRPC queries, cart/order state, chat, routing calculations, and validation run unchanged on both targets. Platform boundaries are intentionally narrow:

- Android uses SecureStore, Expo Location/background geofencing, native notifications, and MapLibre Native with CARTO tiles.
- Web uses browser storage/geolocation and Leaflet with the same CARTO tiles and OSRM route data.
- Next.js continues to host the API and full canteen/landmark administration tools.

```bash
pnpm --filter @acme/expo dev:web       # Browser development with Fast Refresh
pnpm --filter @acme/expo dev           # Expo development client / device
pnpm --filter @acme/expo export:web    # Production web bundle
pnpm --filter @acme/expo export:android
pnpm test:e2e:expo                      # Mobile-browser buyer/deliverer/admin payment journey
```

Ordinary TypeScript, UI, and business-logic changes do not require rebuilding the Android APK. Rebuild only when native dependencies, permissions, plugins, or native configuration change.

---

## ⚡ Branch History & Implementation Status

### ✅ 1. Merged Feature: Delivery Tracking & OTP Verification (`feature/delivery-tracking-otp` → `main`)

The core delivery tracking and verification engine was completed and merged directly into `main`:

- **College Email Auth**: New accounts verify an allowed official college email with an 8-digit Supabase email OTP. A valid Indian phone number is still mandatory profile/contact information but is not OTP-verified, and login accepts either the registered email or phone number.
- **Interactive Dual-Marker Map Tracker**: Real-time live map rendering buyer & deliverer positions, OSRM road routing, and dynamic distance calculations.
- **Geofence Proximity Detection (`GeofenceManager.tsx`)**: Automatic proximity checks against canteen & hostel GPS radii triggering status progression (`ON_THE_WAY` → `NEAR_YOU`).
- **Real-Time P2P Chat**: WebSocket streaming via Supabase Realtime for instant messaging between buyer and deliverer per active order.
- **4-Digit Handover OTP**: Delivery completion is gated by a buyer-held handover code. The current payment branch additionally requires verified order payment before the OTP can complete a delivery.

---

### ✅ 2. Merged Feature: Web UI Redesign & Mobile-First Overhaul (`feature/web-ui-overhaul` → `main`)

Overhauled the Next.js web app into a mobile-first design system and polished the Expo mobile app for full parity:

- **Persistent Bottom Navigation (`BottomNav.tsx`)**: Fixed bottom navigation bar for **Home** (`/`), **Available Quests** (`/quests`), **My Orders** (`/orders`), and **Earnings** (`/earnings`).
- **YouTube-Style Canteen Feed (`CanteenFeed.tsx`)**: Hero banner promotional carousel, 16:9 canteen video-cards with "Open Now" pills, preparation times, and landmark tags with responsive flex layout.
- **Active Order Floating Banner (`ActiveOrderBanner.tsx`)**: Sticky floating card anchored above `BottomNav` showing active order progress bars linking directly to the status hub with external floating close badge.
- **Interactive Cart & Stepper Controls (`CartContext.tsx`)**: Local cart state with `[-] [ Count ] [+]` quantity steppers, canteen boundary validation, and a sticky bottom cart bar.
- **Full Checkout Experience (`/checkout`)**: Item breakdown, campus landmark drop-off picker, room/block details input, and bill breakdown.
- **Order Status Hub (`/orders/[id]/status`)**: 4-step visual progress timeline, quick shortcuts for Live Map & Chat, and delivery OTP verification card.
- **Mobile Map Stability (Expo)**: Android renders the same CARTO tiles and shared route/marker data as web through MapLibre Native. It does not require a Google Maps SDK key.
- **Earnings & Settlement Activity**: The legacy mock wallet/top-up UI has been replaced by delivery earnings, reimbursement, pending-settlement, and settlement-history views shared across student accounts.
- **EAS APK Builds**: Configured `eas.json` for standalone `.apk` builds under the `preview` profile for Android device testing.

---

### ✅ 3. Merged Feature: Fixed Delivery Destination at Order Creation (`feature/fixed-delivery-destination` → `main`)

Integrated locked delivery points during checkout to ensure navigation accuracy for deliverers:

- **Locked Drop-off Destination**: Buyers lock a fixed destination pin (current GPS location or campus landmark) at checkout. The target coordinates and address label are frozen in the database upon order broadcast.
- **Strict API Validation (`order-input.ts`)**: Added shared Zod validation schemas (`createOrderInputSchema`, `updateDelivererLocationInputSchema`) verifying coordinate boundaries (-90 to 90 lat, -180 to 180 lng) and non-empty location strings, supported by unit tests (`order-input.test.mjs`).
- **Live Map & Tracking Isolation**: Maps in Expo (`tracker.tsx`) and Next.js (`TrackerView.tsx`) pin the fixed drop-off target (`deliveryCoords`) while continuously streaming real-time location updates for the deliverer.

---

### ✅ 4. Merged Feature: Universal Expo Web & Android Client (`feature/universal-expo-web-android` → `main`)

The customer and deliverer flows now share one Expo codebase across Android and the web, while Next.js remains the API gateway and administration surface:

- **Shared Product Experience**: Canteen browsing, cart and checkout, quests, order history, earnings, chat, payment-aware status, and live tracking use the same Expo routes and business logic on both platforms.
- **Platform-Specific Adapters**: Android uses SecureStore, native location/geofencing, notifications, and MapLibre; web uses browser storage/geolocation and Leaflet.
- **Automated Journey Coverage**: Playwright exercises the two-user buyer/deliverer flow against the Expo web build.
- **Build Verification**: CI exports both web and Android bundles. The APK workflow supports `arm64-v8a` and `x86_64`, resolves the matching Vercel deployment, and verifies that the backend URL is embedded in the Android bundle.
- **Tracking Reliability**: Route requests are geographically bounded and the map follows the active delivery instead of unrelated location updates.

---

### ✅ 5. Feature: Android Background Push Notifications

The app uses Firebase-backed Expo push notifications so order updates can reach Android users while the app is backgrounded:

- **Native Notification Setup**: Added Firebase configuration and the `expo-notifications` plugin with background remote notifications enabled.
- **Device Registration**: The Expo client requests notification permission, obtains an Expo push token, and stores it on the authenticated user's profile through tRPC.
- **Order Lifecycle Alerts**: New quests are broadcast to registered deliverers; buyers are notified when an order is accepted, on the way, nearby, and delivered; deliverers receive a payout confirmation after OTP handover.
- **Deep Linking**: Tapping a notification opens the relevant quests, order status, or earnings/settlement screen.
- **Resilient Dispatch**: The API validates tokens, batches requests to the Expo Push API, and keeps push-delivery failures from blocking the underlying order action.

After pulling this branch, apply the new `profiles.push_token` column and regenerate the native Android project before rebuilding:

```bash
pnpm db:push
pnpm --filter @acme/expo exec expo prebuild --platform android --clean
pnpm --filter @acme/expo exec expo run:android
```

---

### 🚧 6. Current Branch: Pilot Payments, Settlements & Database Hardening (`feat/payment-settlement-security`)

This branch replaces the mock wallet with a small-pilot payment workflow designed for real campus usage without pretending to be an automated payment gateway:

- **Dual Student Roles**: Every normal account is a `STUDENT`; the same user can place orders as a buyer and complete other orders as a deliverer. `ADMIN` is the only elevated role.
- **Deliverer-Controlled Pay at Delivery**: Accepting a quest defaults to advance payment. A deliverer can explicitly opt into digital Pay at Delivery for that order and accept the risk of fronting the canteen cost. Before payment, the deliverer can end an accepted quest only by declaring the requested items unavailable; after availability is confirmed, manual cancellation is allowed only when CAmpDeliver has verified advance payment and therefore can queue the buyer's refund.
- **Manual UPI Verification**: Buyers pay the configured CAmpDeliver UPI account and submit the transaction reference. Client-side UPI success is never treated as proof; only an ADMIN can mark the incoming payment verified after matching it against the bank/UPI history.
- **Irreversible Purchase Boundary**: Advance orders cannot be marked purchased until payment is verified. Pay-at-delivery orders may be purchased first only when the assigned deliverer offered that mode. Once the canteen purchase is confirmed, normal cancellation is disabled.
- **Refund & Settlement Queues**: A verified payment on an order cancelled before purchase becomes `REFUND_REQUIRED`. Successful OTP handover creates a reimbursement record containing food cost plus delivery earnings in `AVAILABLE` state; the deliverer explicitly requests it from Earnings, which moves it into the admin settlement queue. Admins record outgoing refund/payout references.
- **No Wallet Balance**: The user-facing wallet/top-up system and wallet tRPC router are removed. Earnings distinguish actual delivery earnings from food reimbursement and show paid/pending settlement totals.
- **Server-Authoritative Pricing**: Order creation accepts only menu-item IDs and quantities. The API fetches current menu prices from PostgreSQL so a modified client cannot submit a fake food price.
- **Backend TTLs**: Broadcast, accepted, payment-selection, payment-verification, and paid-before-purchase states carry server deadlines. Expired pre-purchase orders are cancelled by the backend; purchased orders never auto-cancel and require fulfilment/admin resolution.
- **Database & Realtime Hardening**: The additive SQL migrations add payment/settlement tables, financial and coordinate constraints, strict transaction-reference validation, indexes, update triggers, least-privilege grants, RLS, backend-only access to sensitive order/payment/chat/OTP data, append-only financial admin audit records, and participant-only authorization for private `order:<uuid>` Realtime Broadcast channels. Privileged financial actions enforce separation of duties: an ADMIN cannot reconcile an order where that same account is the buyer or deliverer. Legacy wallet columns/table remain physically present only for safe rollback and are not used by the application.
- **Email Auth & Session Hardening**: New signup uses Supabase email OTP for allowed college domains and creates the application profile only after the authenticated Supabase user has a confirmed email. Phone numbers are mandatory contact data only. Protected/admin tRPC calls authorize against Supabase's verified user lookup rather than trusting local session material. The separate 4-digit order handover OTP retains its persisted failure counters and serialized verification protections.

The manual settlement layer is intentionally isolated from the order state machine. A future regulated payment provider can replace manual UPI verification/payout operations without redesigning fulfilment states.

For Realtime privacy, the order/chat channels are created as private channels and the migration authorizes only the order's buyer, assigned deliverer, or an ADMIN. In Supabase **Realtime Settings**, also disable **Allow public access** when deploying this branch so clients cannot create public channels that bypass the project's private-channel requirement.

---

## 📧 Production College Email Verification

New account registration verifies the student's official IIITDMJ email through Supabase Auth email OTP. Student addresses use the student's unique roll number before `@iiitdmj.ac.in`. The phone number remains mandatory profile/contact information but is never used as an OTP identity. Production defaults to the exact `iiitdmj.ac.in` domain; `COLLEGE_EMAIL_DOMAINS` is retained only as an explicit server-side override for staging/test environments.

Supabase must be configured to send a numeric email OTP rather than a confirmation/magic link. In the hosted Supabase Dashboard, edit **Authentication → Email Templates → Confirm signup** and **Magic link or OTP** so their content uses `{{ .Token }}` and does not use `{{ .ConfirmationURL }}`. The hosted project is configured for an 8-digit numeric email OTP, and the app verifies that exact token with `verifyOtp({ type: "email" })`. Keep Supabase's Email OTP length at 8 so the dashboard and clients stay aligned. A suitable subject is `Your CAmpDeliver verification code`, with content such as `Your CAmpDeliver verification code is: <strong>{{ .Token }}</strong>`. No Fast2SMS/Firebase SMS key or phone-OTP secret is used. Login accepts either the registered college email or the registered Indian phone number in the same identifier field, while Supabase password authentication remains the session authority.

---

## 🧪 Comprehensive Multi-Device & Location Simulation Testing Guide

To test full end-to-end workflows (Buyer placing an order, Deliverer accepting and delivering with live map tracking), follow this setup:

### 📱 1. Dual-Device Setup (Phone + Emulator / PC)

To experience the real-time interaction between **Buyer** and **Deliverer**:

- **Device A (Buyer)**: Open the **Web Application** on a physical mobile phone connected to your local Wi-Fi, or run a desktop browser in an Incognito window.
- **Device B (Deliverer)**: Open the **Expo Mobile App** inside an Android Emulator / iOS Simulator on your PC (or a second mobile device via Expo Go).

#### Connecting Physical Phone to Local Web App:

1. Find your computer's local IP address (`ipconfig` on Windows or `ifconfig` on macOS/Linux). Example: `192.168.1.15`.
2. Ensure your phone and PC are connected to the same Wi-Fi network.
3. Open your mobile browser and navigate to `http://<YOUR_LOCAL_IP>:3000`.

---

### 🌐 2. Location Simulation & Geofence Verification

To test live GPS route tracking, distance calculations, and automatic geofence triggers:

#### Option A: Android Studio Emulator (PC)

1. Open the Android Emulator running the **Expo Mobile App** (Deliverer view).
2. Click **Extended Controls (`...`)** $\rightarrow$ **Location**:
   - Manually enter coordinates (Latitude & Longitude) corresponding to campus canteens or hostels.
   - Or load a `.gpx` / `.kml` route file to simulate walking from canteen to hostel.
3. Watch the Expo app automatically calculate distance to buyer, update map markers, and trigger `GeofenceManager` when entering landmark radii.

#### Option B: Google Chrome DevTools (Web)

1. Press `F12` $\rightarrow$ **More tools** $\rightarrow$ **Sensors**.
2. Under **Geolocation**, select **Other...** and input custom coordinates.
3. Move coordinates closer to canteen or drop-off location to test real-time distance updates and status progression.

---

## ⚙️ How to Run Locally

### Prerequisites

- **Node.js**: v22.21.0 or newer
- **pnpm**: `npm install -g pnpm`
- **Supabase**: Active Supabase project (for PostgreSQL DB, Auth, and Realtime WebSockets)

### 1. Clone Repository & Install Dependencies

```bash
git clone https://github.com/CAmpdeliver/CAmpdeliver.git
cd CAmpdeliver
pnpm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in the repository root:

```bash
cp .env.example .env
```

Fill in the environment values from `.env.example`. The payment branch additionally requires server-only payment/TTL configuration:

```env
# Database and Supabase
POSTGRES_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
EXPO_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
EXPO_API_URL_OVERRIDE=""

# Auth policy / maintenance
COLLEGE_EMAIL_DOMAINS="iiitdmj.ac.in"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Pilot payment configuration (amounts are paise)
# Receiving UPI ID/payee name are managed dynamically by ADMIN in the app.
DELIVERY_FEE_PAISE="500"
PLATFORM_FEE_PAISE="300"

# Pre-purchase state deadlines in seconds
ORDER_BROADCAST_TTL_SECONDS="600"
ORDER_ACCEPTED_TTL_SECONDS="300"
ORDER_PAYMENT_SELECTION_TTL_SECONDS="300"
ORDER_PAYMENT_VERIFICATION_TTL_SECONDS="900"
ORDER_PAID_PURCHASE_TTL_SECONDS="600"

# Server-only bearer secret for /api/cron/orders
CRON_SECRET="replace-with-at-least-32-random-characters"
```

Expo commands run through `pnpm --filter @acme/expo with-env ...`. On non-`main` branches this resolves the latest successful Vercel Preview in the current Git history, so a stale `EXPO_PUBLIC_API_URL` inherited from `.env`, Playwright, or a parent shell cannot silently point the app at an older branch. If backend-relevant files are modified locally or a backend-changing commit has not received a successful Vercel Preview yet, the command fails instead of silently using an older backend. Commit/push the backend change first, or use `EXPO_API_URL_OVERRIDE` only when you intentionally need to target a specific backend for one run.

For the `Android APK` GitHub Actions workflow, configure these repository variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The APK workflow resolves its backend from the same branch history and falls back to the production API only when that history has no usable Preview deployment.

### 3. Apply the Database Security Migration

For a fresh database, sync the Drizzle schema first. For an existing deployment, make sure there are no in-flight legacy orders before applying the payment/security migration.

```bash
# Fresh database only / normal schema development
pnpm db:push

# Existing payment branch rollout: inspect first, then validate the migration inside
# a transaction and roll it back. These commands target POSTGRES_URL in .env.
pnpm --filter @acme/db security:preflight
pnpm --filter @acme/db security:check

# Apply only after the check succeeds and active legacy orders are finished/cancelled.
pnpm --filter @acme/db security:apply

# Add the ADMIN-managed receiving UPI destination and its audit trail.
pnpm --filter @acme/db payment-destination:preflight
pnpm --filter @acme/db payment-destination:check
pnpm --filter @acme/db payment-destination:apply

# Add strict payment-reference constraints and append-only financial admin auditing.
pnpm --filter @acme/db payment-hardening:preflight
pnpm --filter @acme/db payment-hardening:check
pnpm --filter @acme/db payment-hardening:apply

# Remove the now-unused legacy phone-signup OTP table after confirming it is empty.
pnpm --filter @acme/db email-auth-cleanup:preflight
pnpm --filter @acme/db email-auth-cleanup:check
pnpm --filter @acme/db email-auth-cleanup:apply

```

`security:preflight` is read-only and reports active-order counts, the legacy deliverer-role count, payment-table presence, and whether the migration can proceed. `security:apply` is intentionally explicit because it changes database grants/RLS, invalidates legacy signup-OTP rows, and converts legacy `DELIVERER` roles to `STUDENT`. It refuses to run while a legacy active order exists. The old wallet columns/table are retained only for rollback compatibility; the application no longer reads or writes them.

The second migration is additive and stores the current receiving UPI destination plus an append-only ADMIN change history. The settings tables are backend-only under RLS. After it is applied, an ADMIN configures or changes the UPI ID and payee name from **Payments & Settlements**; buyer payment selection fails closed until a valid destination has been saved. When a buyer chooses a payment method, that order snapshots the current UPI destination so later ADMIN changes affect new payment selections without rerouting an in-progress payment.

The email-auth cleanup migration removes the legacy `phone_verifications` table after its preflight confirms that no pending rows remain. New signup OTP state belongs to Supabase Auth rather than PostgreSQL.

Configure a backend scheduler to call `GET /api/cron/orders` with `Authorization: Bearer <CRON_SECRET>` at a cadence appropriate for the configured TTLs (for example once per minute). Order queries also opportunistically expire stale pre-purchase orders, but the scheduler ensures ghosted orders are cleaned up even when no student has the app open.

### 4. Start Development Servers

Run the API/admin surface and universal Expo client:

```bash
# Start all apps in monorepo
pnpm dev

# OR start apps individually:
pnpm --filter @acme/nextjs dev   # API and admin web on http://localhost:3000
pnpm --filter @acme/expo dev:web # Universal client in the browser
pnpm --filter @acme/expo dev     # Universal client on Android/iOS
```

- **API/Admin Web**: Available at `http://localhost:3000`
- **Universal Web Client**: Served by Expo's web development server.
- **Native Client**: Open the reusable Expo development build on a device or emulator.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
