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
pnpm test:e2e:expo                      # Mobile-browser buyer/deliverer journey
```

Ordinary TypeScript, UI, and business-logic changes do not require rebuilding the Android APK. Rebuild only when native dependencies, permissions, plugins, or native configuration change.

---

## ⚡ Branch History & Implementation Status

### ✅ 1. Merged Feature: Delivery Tracking & OTP Verification (`feature/delivery-tracking-otp` → `main`)

The core delivery tracking and verification engine was completed and merged directly into `main`:

- **Phone-First Auth**: E.164 phone sanitization, virtual email mapping (`+91XXXXXXXXXX@campus.edu`), and 6-digit signup OTP verification.
- **Interactive Dual-Marker Map Tracker**: Real-time live map rendering buyer & deliverer positions, OSRM road routing, and dynamic distance calculations.
- **Geofence Proximity Detection (`GeofenceManager.tsx`)**: Automatic proximity checks against canteen & hostel GPS radii triggering status progression (`ON_THE_WAY` → `NEAR_YOU`).
- **Real-Time P2P Chat**: WebSocket streaming via Supabase Realtime for instant messaging between buyer and deliverer per active order.
- **Escrow Wallet Ledger & 4-Digit Handover OTP**: Funds (`foodPrice` + `deliveryFee`) frozen upon acceptance and released to deliverer upon 4-digit OTP verification.

---

### ✅ 2. Merged Feature: Web UI Redesign & Mobile-First Overhaul (`feature/web-ui-overhaul` → `main`)

Overhauled the Next.js web app into a mobile-first design system and polished the Expo mobile app for full parity:

- **Persistent Bottom Navigation (`BottomNav.tsx`)**: Fixed bottom navigation bar for **Home** (`/`), **Available Quests** (`/quests`), **My Orders** (`/orders`), and **Wallet** (`/wallet`).
- **YouTube-Style Canteen Feed (`CanteenFeed.tsx`)**: Hero banner promotional carousel, 16:9 canteen video-cards with "Open Now" pills, preparation times, and landmark tags with responsive flex layout.
- **Active Order Floating Banner (`ActiveOrderBanner.tsx`)**: Sticky floating card anchored above `BottomNav` showing active order progress bars linking directly to the status hub with external floating close badge.
- **Interactive Cart & Stepper Controls (`CartContext.tsx`)**: Local cart state with `[-] [ Count ] [+]` quantity steppers, canteen boundary validation, and a sticky bottom cart bar.
- **Full Checkout Experience (`/checkout`)**: Item breakdown, campus landmark drop-off picker, room/block details input, and bill breakdown.
- **Order Status Hub (`/orders/[id]/status`)**: 4-step visual progress timeline, quick shortcuts for Live Map & Chat, and delivery OTP verification card.
- **Mobile Map Stability (Expo)**: Android renders the same CARTO tiles and shared route/marker data as web through MapLibre Native. It does not require a Google Maps SDK key.
- **Mobile Wallet Integration (Expo)**: Introduced digital wallet tab into Android bottom navigation with mock balance top-up functionality matching the web app.
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

- **Shared Product Experience**: Canteen browsing, cart and checkout, quests, order history, wallet, chat, status, and live tracking use the same Expo routes and business logic on both platforms.
- **Platform-Specific Adapters**: Android uses SecureStore, native location/geofencing, notifications, and MapLibre; web uses browser storage/geolocation and Leaflet.
- **Automated Journey Coverage**: Playwright exercises the two-user buyer/deliverer flow against the Expo web build.
- **Build Verification**: CI exports both web and Android bundles. The APK workflow supports `arm64-v8a` and `x86_64`, resolves the matching Vercel deployment, and verifies that the backend URL is embedded in the Android bundle.
- **Tracking Reliability**: Route requests are geographically bounded and the map follows the active delivery instead of unrelated location updates.

---

### 🚧 5. Current Branch: Android Background Push Notifications (`fix/android-background-push-notifications`)

The active branch implements Firebase-backed Expo push notifications so order updates can reach Android users while the app is backgrounded:

- **Native Notification Setup**: Added Firebase configuration and the `expo-notifications` plugin with background remote notifications enabled.
- **Device Registration**: The Expo client requests notification permission, obtains an Expo push token, and stores it on the authenticated user's profile through tRPC.
- **Order Lifecycle Alerts**: New quests are broadcast to registered deliverers; buyers are notified when an order is accepted, on the way, nearby, and delivered; deliverers receive a payout confirmation after OTP handover.
- **Deep Linking**: Tapping a notification opens the relevant quests, order status, or wallet screen.
- **Resilient Dispatch**: The API validates tokens, batches requests to the Expo Push API, and keeps push-delivery failures from blocking the underlying order action.

After pulling this branch, apply the new `profiles.push_token` column and regenerate the native Android project before rebuilding:

```bash
pnpm db:push
pnpm --filter @acme/expo exec expo prebuild --platform android --clean
pnpm --filter @acme/expo exec expo run:android
```

---

## ⚠️ Known Issue & Technical Note: Phone OTP Verification

> [!WARNING]
> **External SMS Gateway Limitation (Fast2SMS)**
>
> The backend (`packages/api/src/router/otp.ts`) includes integration for third-party SMS delivery via Fast2SMS. However, due to external API key restrictions, SMS gateway quota limits, or carrier delays, **live SMS messages may not arrive on real mobile numbers during local testing**.

### 🛠️ Developer Workarounds for Testing OTPs:

1. **Server Console Output (Recommended)**:
   Every generated OTP code is logged directly to the server terminal:
   ```text
   [OTP-LOG] Generated OTP for +919876543210 is: 482910
   [SMS-MOCK] OTP for +919876543210 is: 482910
   ```
2. **Built-in Test Phone Numbers**:
   The backend automatically bypasses external SMS dispatches for standard dummy numbers (`+911234567890`, `+911111111111`, `+912222222222`, `+913333333333`, `+919999999999`).

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

Fill in your Supabase project credentials in `.env`:

```env
# Database connection string (Transaction pooler)
POSTGRES_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# Supabase Public API Keys used by Next.js
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

# Public values bundled into the universal Expo web/Android client
EXPO_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
EXPO_PUBLIC_API_URL="https://your-api.example.com"

# Optional: Supabase Service Role Key (for admin auto-confirming users)
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Optional: Fast2SMS API Key (for SMS OTP dispatch in production)
FAST2SMS_API_KEY="your-fast2sms-api-key"
```

For the `Android APK` GitHub Actions workflow, configure the following repository values before running it on `main` or manually:

- Repository variables: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Pull requests without these values still perform a compile-only Android build, but GitHub does not upload that non-functional APK.

### 3. Push Database Schema

Sync your Drizzle schema with your PostgreSQL database:

```bash
pnpm db:push
```

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
