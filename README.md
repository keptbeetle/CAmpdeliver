# CAmpDeliver 🚀

**CAmpDeliver** is a digital campus ecosystem designed to gamify peer-to-peer food delivery within university campuses. Students can act as **buyers** by ordering food from campus canteens, or as **deliverers** (taking on "quests") to pick up and deliver orders for their peers in exchange for a delivery fee.

The application is engineered as a modern, high-performance full-stack monorepo featuring complete parity between a responsive **Next.js Web Dashboard** and a cross-platform **Expo Mobile Application (iOS & Android)**.

---

## 🛠️ Tech Stack

Built on top of the **T3 Stack** philosophy within a **Turborepo** monorepo using **pnpm**:

- **Web Frontend**: [Next.js 15](https://nextjs.org/) (App Router), React 19, Tailwind CSS v4, Lucide Icons
- **Mobile Frontend**: [Expo](https://expo.dev/) (React Native), [NativeWind](https://nativewind.dev/)
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
│   ├── expo/             # React Native mobile app (iOS & Android)
│   └── nextjs/           # Next.js 15 web application & API gateway
└── packages/
    ├── api/              # tRPC router definitions & business logic procedures
    ├── auth/             # Supabase Auth configuration & helper utilities
    ├── db/               # PostgreSQL schema definitions & Drizzle database client
    ├── ui/               # Shared cross-platform React UI components (shadcn/ui based)
    └── validators/       # Shared Zod validation schemas
```

---

## ⚡ Branch History & Implementation Status

### ✅ 1. Merged Feature: Delivery Tracking & OTP Verification (`feature/delivery-tracking-otp` $\rightarrow$ `main`)
The core delivery tracking and verification engine was completed and merged directly into `main`:
- **Phone-First Auth**: E.164 phone sanitization, virtual email mapping (`+91XXXXXXXXXX@campus.edu`), and 6-digit signup OTP verification.
- **Interactive Dual-Marker Map Tracker**: Real-time live map rendering buyer & deliverer positions, OSRM road routing, and dynamic distance calculations.
- **Geofence Proximity Detection (`GeofenceManager.tsx`)**: Automatic proximity checks against canteen & hostel GPS radii triggering status progression (`ON_THE_WAY` $\rightarrow$ `NEAR_YOU`).
- **Real-Time P2P Chat**: WebSocket streaming via Supabase Realtime for instant messaging between buyer and deliverer per active order.
- **Escrow Wallet Ledger & 4-Digit Handover OTP**: Funds (`foodPrice` + `deliveryFee`) frozen upon acceptance and released to deliverer upon 4-digit OTP verification.

---

### 🎨 2. Active Branch: Web UI Redesign & Mobile-First Overhaul (`feature/web-ui-overhaul`)
A new feature branch `feature/web-ui-overhaul` was created to overhaul the Next.js frontend into a modern, mobile-first design system and polish the Expo mobile app:
- **Persistent Bottom Navigation (`BottomNav.tsx`)**: Fixed bottom navigation bar for **Home** (`/`), **Available Quests** (`/quests`), **My Orders** (`/orders`), and **Wallet** (`/wallet`).
- **YouTube-Style Canteen Feed (`CanteenFeed.tsx`)**: Hero banner promotional carousel, 16:9 canteen video-cards with "Open Now" pills, preparation times, and landmark tags. The flex layout was recently stabilized to prevent horizontal overflow on narrow mobile screens.
- **Active Order Floating Banner (`ActiveOrderBanner.tsx`)**: Sticky floating card anchored above `BottomNav` showing active order progress bars linking directly to the status hub. Repositioned the close button as an external floating badge to prevent text overlap.
- **Interactive Cart & Stepper Controls (`CartContext.tsx`)**: Local cart state with `[-] [ Count ] [+]` quantity steppers, canteen boundary validation, and a sticky bottom cart bar.
- **Full Checkout Experience (`/checkout`)**: Item breakdown, campus landmark drop-off picker, room/block details input, and bill breakdown.
- **Order Status Hub (`/orders/[id]/status`)**: 4-step visual progress timeline, quick shortcuts for Live Map & Chat, and delivery OTP verification card.
- **Mobile Map Stability (Expo)**: Improved Android map reliability by switching `mapType` to standard and configuring `UrlTile` properly, ensuring maps do not appear blank without a Google Maps API Key.
- **Mobile Wallet Integration (Expo)**: Introduced the digital wallet tab directly into the Android bottom navigation, allowing for seamless mock balance top-ups matching the Web App functionality.
- **EAS APK Builds**: Configured `eas.json` to generate installable standalone `.apk` files under the `preview` profile for easy Android testing.

> [!NOTE]
> All core features for the web UI redesign and mobile parity are fully implemented and typechecked. Minor UI polish, responsive edge-case testing, and styling refinements are currently underway on the `feature/web-ui-overhaul` branch.

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

# Supabase Public API Keys
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"

# Optional: Supabase Service Role Key (for admin auto-confirming users)
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Optional: Fast2SMS API Key (for SMS OTP dispatch in production)
FAST2SMS_API_KEY="your-fast2sms-api-key"
```

### 3. Push Database Schema
Sync your Drizzle schema with your PostgreSQL database:
```bash
pnpm db:push
```

### 4. Start Development Servers

Run both the Next.js Web App and Expo Mobile App simultaneously:

```bash
# Start all apps in monorepo
pnpm dev

# OR start apps individually:
pnpm --filter @acme/nextjs dev   # Web App on http://localhost:3000
pnpm --filter @acme/expo dev     # Expo Mobile App
```

- **Web Dashboard**: Available at `http://localhost:3000`
- **Expo Mobile App**: Scan the terminal QR code using **Expo Go** on your phone, or press `a` for Android Emulator / `i` for iOS Simulator.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
