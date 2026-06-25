# CAmpDeliver 🚀

CAmpDeliver is a digital campus ecosystem that gamifies food delivery. Students can act as buyers by ordering food from campus canteens, or as "deliverers" (taking on "quests") to pick up and deliver food for their peers in exchange for a delivery fee. 

The application is built as a modern full-stack monorepo featuring both a responsive web dashboard and a cross-platform mobile application.

## 🛠️ Tech Stack

This project is structured as a monorepo using **Turborepo** and **pnpm**, utilizing the **T3 Stack** philosophy.

- **Web Frontend**: [Next.js 15](https://nextjs.org/) (App Router), React 19
- **Mobile Frontend**: [Expo](https://expo.dev/) (React Native)
- **API**: [tRPC](https://trpc.io/) for end-to-end typesafe APIs
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication**: [Supabase Auth](https://supabase.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (Web) and [NativeWind](https://nativewind.dev/) (Mobile)
- **State Management**: [@tanstack/react-query](https://tanstack.com/query/latest)

## 📦 Monorepo Structure

- `apps/nextjs`: The Next.js web application.
- `apps/expo`: The Expo React Native mobile application.
- `packages/api`: tRPC router definitions and procedures.
- `packages/db`: Drizzle ORM schema and database client.
- `packages/auth`: Shared authentication utilities.
- `packages/ui`: Shared React components (shadcn/ui based).
- `packages/validators`: Shared Zod validation schemas.

## 🚀 Current State

### Frontend (Web & Mobile Parity)
Both the **Next.js Web Dashboard** and **Expo Mobile App** currently support:
- **Authentication**: Sign up, login, and secure sessions via Supabase.
- **Wallet System**: Users can simulate topping up their campus wallet with a dummy UTR number.
- **Canteen Menu**: A comprehensive menu system allowing students to build a cart and "Broadcast" orders to the campus network.
- **Quest Board**: An "Available Quests" feed where other students can view and accept pending delivery requests.
- **Order Management**: 
  - Buyers can track their order status (`PENDING` -> `ACCEPTED` -> `PREPARING` -> `DELIVERED`).
  - Deliverers have access to "Confirm Availability" (which freezes the buyer's funds) and "Reject (Unavailable)" actions to manage the order lifecycle.

### Backend
- **tRPC API**: Robust API layer handling complex transactions (e.g., wallet freezing, balance deductions, and crediting the deliverer upon successful completion).
- **Database Schema**: Fully structured relational models for `profiles`, `orders`, and `order_items`.
- **Validation**: Strict input validation using Zod on all endpoints.

## ⚙️ How to Run Locally

### Prerequisites
1. [Node.js](https://nodejs.org/en/) (v22.21.0 or newer recommended)
2. [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
3. A [Supabase](https://supabase.com/) project (for Postgres DB and Auth)

### 1. Clone & Install
```bash
git clone https://github.com/CAmpdeliver/CAmpdeliver.git
cd CAmpdeliver
pnpm install
```

### 2. Environment Variables
Copy the `.env.example` file to `.env` in the root directory:
```bash
cp .env.example .env
```
Update the `.env` file with your Supabase credentials:
- `POSTGRES_URL` (Transaction connection pooler string)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Database Setup
Push the Drizzle schema to your Supabase database:
```bash
pnpm db:push
```

### 4. Run the Development Servers
You can run both the web and mobile apps simultaneously using Turborepo:

```bash
# Run everything
pnpm dev

# OR run individually:
pnpm --filter @acme/nextjs dev
pnpm --filter @acme/expo dev
```

- **Web Dashboard**: Available at `http://localhost:3000`
- **Mobile App**: Scan the generated QR code in your terminal using the Expo Go app on iOS/Android, or press `a` to run on an Android emulator / `i` for iOS simulator.
