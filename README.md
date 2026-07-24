# CAmpDeliver 🚀

**CAmpDeliver** is a digital campus ecosystem designed to gamify peer-to-peer food delivery within university campuses. Students can act as **buyers** by ordering food from campus canteens, or as **deliverers** (taking on "quests") to pick up and deliver orders for their peers in exchange for a delivery fee.

The application is engineered as a modern, high-performance full-stack monorepo featuring complete parity between a responsive **Next.js Web Dashboard** and a cross-platform **Expo Mobile Application (iOS & Android)**.

---

## 🛠️ Tech Stack

Built on top of the **T3 Stack** philosophy within a **Turborepo** monorepo using **pnpm**:

- **Web Frontend**: [Next.js 15](https://nextjs.org/) (App Router), React 19, Tailwind CSS v4
- **Mobile Frontend**: [Expo](https://expo.dev/) (React Native), [NativeWind](https://nativewind.dev/)
- **API Layer**: [tRPC v11](https://trpc.io/) for end-to-end type safety between server and clients
- **Database & ORM**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication & Realtime**: [Supabase Auth](https://supabase.com/) & Supabase Realtime (WebSockets)
- **State & Data Fetching**: [@tanstack/react-query](https://tanstack.com/)
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

## ⚡ Current Implementation Status & Progress

The platform has reached feature-complete parity across both Web and Mobile platforms for core user flows:

### 🔐 1. Authentication & Profile Management
- **Phone-First Authentication**: Users register and log in using their 10-digit mobile number and password (no email input required for end-users).
- **Virtual Email Mapping**: Internally maps phone numbers to Supabase Auth using a virtual email scheme (`+91XXXXXXXXXX@campus.edu`).
- **6-Digit Phone OTP Verification**: Registration flow includes mandatory phone verification via a custom 6-digit OTP step before user creation.
- **Anti-Abuse Rate Limiting**: Restricts OTP dispatch to a maximum of 3 requests per phone number within a 15-minute window.
- **Session Handling & SSR Middleware**: Uses `@supabase/ssr` middleware to refresh auth tokens seamlessly across tRPC requests on web and secure token storage on mobile.
- **Campus Profiles**: Stores student details including Full Name, Hostel Name, Phone Number, and Role (`STUDENT`, `DELIVERER`, `ADMIN`).

### 💳 2. Campus Virtual Wallet & Financial Ledger
- **Dual-Balance Architecture**: Manages both active `walletBalance` and escrowed `frozenBalance` stored in integer paise (e.g. 10000 paise = ₹100.00).
- **Simulated Top-Ups**: Students can simulate wallet deposits by submitting a unique UTR (Unique Transaction Reference) number.
- **Escrow & Fund Freezing**: 
  - When an order is accepted, the required total amount (`foodPrice` + `deliveryFee`) is frozen in the buyer's wallet.
  - Funds are safely released and credited to the deliverer upon verified order completion.
- **Auditable Transaction History**: Tracks transaction types including `TOP_UP`, `ORDER_FREEZE`, `ORDER_UNFREEZE`, `DELIVERY_PAYOUT`, `ADMIN_COMMISSION`, and `REFUND`.

### 🍱 3. Canteens, Campus Landmarks & Menu System
- **Landmark Directory**: Dynamic database of campus canteens and hostels with exact GPS coordinates (`latitude`, `longitude`) and geofence boundary radii.
- **Live Menu Catalog**: Canteen menus with item prices, categories, and real-time availability toggles (`isAvailable`).
- **Cart Builder**: Interactive cart allowing custom item selections and automatic delivery fee calculation.

### 📋 4. Quest Marketplace & Order Lifecycle
- **Broadcast Ordering**: Buyers publish food delivery requests ("Quests") visible to all logged-in students across campus.
- **Quest Board**: Deliverers can view available delivery requests, inspect order items, canteen pickup location, and delivery destination before accepting.
- **Order State Machine**: Enforces status transitions across the delivery pipeline:
  $$\text{BROADCASTED} \longrightarrow \text{ACCEPTED} \longrightarrow \text{PREPARING} \longrightarrow \text{ON\_THE\_WAY} \longrightarrow \text{NEAR\_YOU} \longrightarrow \text{DELIVERED} \longrightarrow \text{COMPLETED}$$
- **OTP Delivery Handover**: Generates a secure 4-digit verification code required at delivery pickup/dropoff to finalize order completion and release funds.

### 💬 5. Real-Time Peer-to-Peer Chat
- **Instant Messaging**: Dedicated order chat linking the buyer and deliverer for direct communication.
- **WebSocket Streaming**: Powered by Supabase Realtime for instant message delivery without manual polling.
- **Persistent History**: Chat logs saved in the `chat_messages` table for dispute resolution.

### 📍 6. Live Location Tracking & Geofencing
- **Interactive Dual-Marker Map Tracker**: Real-time live map showing both buyer and deliverer positions, dynamic route lines, and live distance calculations (in meters/kilometers).
- **Geofence Manager (`GeofenceManager.tsx`)**: Automatic proximity detection against canteen and hostel GPS radii:
  - Automatically updates status (e.g., triggering `ON_THE_WAY` or `NEAR_YOU`) when the deliverer enters within landmark boundary radii (e.g. 50 meters).
- **Continuous Location Broadcasting**: Background and foreground location updates synced across devices.

---

## ⚠️ Known Issue & Technical Note: Phone OTP Verification

> [!WARNING]
> **External SMS Gateway Limitation (Fast2SMS)**
> 
> The backend (`packages/api/src/router/otp.ts`) includes integration for third-party SMS delivery via Fast2SMS. However, due to external API key restrictions, SMS gateway quota limits, or carrier delays, **live SMS messages may not arrive on real mobile numbers during local testing**.

### 🛠️ Developer Workarounds for Testing OTPs:
1. **Server Console Output (Recommended)**:
   Every generated OTP code is logged directly to the server terminal. Check your running server terminal output for lines like:
   ```text
   [OTP-LOG] Generated OTP for +919876543210 is: 482910
   [SMS-MOCK] OTP for +919876543210 is: 482910
   ```
2. **Built-in Test Phone Numbers**:
   The backend automatically bypasses external SMS dispatches for standard dummy numbers. You can use any of the following phone numbers for instant testing with terminal-logged OTPs:
   - `+911234567890`
   - `+911111111111`
   - `+912222222222`
   - `+913333333333`
   - `+919999999999`

---

## 🧪 Comprehensive Multi-Device & Location Simulation Testing Guide

To test full end-to-end workflows (Buyer placing an order, Deliverer accepting and delivering with live map tracking), follow this setup:

### 📱 1. Dual-Device Setup (Phone + Emulator / PC)

To experience the real-time interaction between **Buyer** and **Deliverer**:

- **Device A (Buyer)**: Open the **Web Application** on a physical mobile phone connected to your local Wi-Fi, or run a desktop browser in an Incognito window / separate browser profile.
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
2. Click the **Three Dots (`...`)** menu on the emulator sidebar to open **Extended Controls**.
3. Select **Location**:
   - Manually enter coordinates (Latitude & Longitude) corresponding to campus canteens or hostels.
   - Or load a `.gpx` / `.kml` route file to simulate walking from the canteen to the hostel.
4. Watch the Expo app automatically calculate distance to the buyer, display updated markers on the map, and trigger the `GeofenceManager` when entering landmark radii.

#### Option B: Google Chrome DevTools (Web)
1. Press `F12` or right-click and choose **Inspect** on the Next.js web application.
2. Click the **Three Dots** menu in DevTools top-right $\rightarrow$ **More tools** $\rightarrow$ **Sensors**.
3. Under **Geolocation**, select **Other...** and input custom coordinates.
4. Move coordinates closer to the canteen or delivery location to test real-time distance updates and status progression.

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
