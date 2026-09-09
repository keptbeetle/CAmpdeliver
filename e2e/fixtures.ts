import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

export const TEST_PASSWORD =
  process.env.CAMPDELIVER_E2E_PASSWORD ?? `CampdeliverE2E-${randomUUID()}-Aa1!`;
export const TEST_USERS = {
  buyer: {
    phone: "1111111111",
    email: "+911111111111@campus.edu",
    name: "E2E Buyer",
  },
  deliverer: {
    phone: "2222222222",
    email: "+912222222222@campus.edu",
    name: "E2E Deliverer",
  },
  admin: {
    phone: "3333333333",
    email: "+913333333333@campus.edu",
    name: "E2E Admin",
  },
} as const;

export const TEST_CANTEEN = {
  id: "00000000-0000-4000-8000-000000000101",
  menuItemId: "00000000-0000-4000-8000-000000000201",
  landmarkId: "00000000-0000-4000-8000-000000000301",
  name: "E2E Canteen",
  itemName: "E2E Meal",
  itemPrice: 12_000,
  latitude: 28.545,
  longitude: 77.19,
  radius: 250,
} as const;

export const LOCATIONS = {
  buyer: { latitude: 28.548, longitude: 77.195 },
  outsideCanteen: { latitude: 28.549, longitude: 77.19 },
  canteen: {
    latitude: TEST_CANTEEN.latitude,
    longitude: TEST_CANTEEN.longitude,
  },
  midway: { latitude: 28.5467, longitude: 77.1928 },
  nearBuyer: { latitude: 28.54785, longitude: 77.19475 },
} as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for E2E tests`);
  return value;
}

const retryingFetch: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
};

async function ensureAuthUser(
  admin: ReturnType<typeof createClient>,
  email: string,
  password: string,
  name: string,
): Promise<User> {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = listed.users.find((user) => user.email === email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw error;
  return data.user;
}

export interface SeededScenario {
  buyerId: string;
  delivererId: string;
  adminId: string;
}

export async function resetScenario(): Promise<SeededScenario> {
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: retryingFetch },
    },
  );
  const sql = postgres(required("POSTGRES_URL"), { prepare: false });

  try {
    const buyer = await ensureAuthUser(
      supabase,
      TEST_USERS.buyer.email,
      TEST_PASSWORD,
      TEST_USERS.buyer.name,
    );
    const deliverer = await ensureAuthUser(
      supabase,
      TEST_USERS.deliverer.email,
      TEST_PASSWORD,
      TEST_USERS.deliverer.name,
    );
    const admin = await ensureAuthUser(
      supabase,
      TEST_USERS.admin.email,
      TEST_PASSWORD,
      TEST_USERS.admin.name,
    );

    for (const user of [buyer, deliverer, admin]) {
      await sql`delete from profiles where email = ${user.email!} and id <> ${user.id}`;
    }

    const orderIds = await sql<{ id: string }[]>`
      select id from orders
      where buyer_id in (${buyer.id}, ${deliverer.id})
         or deliverer_id in (${buyer.id}, ${deliverer.id})
    `;
    for (const { id } of orderIds) {
      await sql`delete from orders where id = ${id}`;
    }

    const profiles = [
      { user: buyer, role: "STUDENT", hostel: "E2E Hostel" },
      { user: deliverer, role: "STUDENT", hostel: "E2E Hostel" },
      { user: admin, role: "ADMIN", hostel: "E2E Admin" },
    ];
    for (const profile of profiles) {
      await sql`
        insert into profiles (
          id, name, email, phone_number, hostel_name, role,
          wallet_balance, frozen_balance
        ) values (
          ${profile.user.id}, ${profile.user.user_metadata.name as string},
          ${profile.user.email!}, ${profile.user.email!.replace("@campus.edu", "")},
          ${profile.hostel}, ${profile.role}, 0, 0
        )
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          phone_number = excluded.phone_number,
          hostel_name = excluded.hostel_name,
          role = excluded.role,
          wallet_balance = 0,
          frozen_balance = 0
      `;
    }

    await sql`
      insert into canteens (id, name, latitude, longitude, radius, is_active)
      values (
        ${TEST_CANTEEN.id}, ${TEST_CANTEEN.name}, ${TEST_CANTEEN.latitude},
        ${TEST_CANTEEN.longitude}, ${TEST_CANTEEN.radius}, true
      )
      on conflict (id) do update set
        name = excluded.name,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        radius = excluded.radius,
        is_active = true
    `;
    await sql`
      insert into menu_items (id, canteen_id, name, price, is_available)
      values (
        ${TEST_CANTEEN.menuItemId}, ${TEST_CANTEEN.id},
        ${TEST_CANTEEN.itemName}, ${TEST_CANTEEN.itemPrice}, true
      )
      on conflict (id) do update set
        canteen_id = excluded.canteen_id,
        name = excluded.name,
        price = excluded.price,
        is_available = true
    `;
    await sql`
      insert into landmarks (id, name, latitude, longitude, radius, is_active)
      values (
        ${TEST_CANTEEN.landmarkId}, 'E2E Hostel Gate',
        ${LOCATIONS.buyer.latitude}, ${LOCATIONS.buyer.longitude}, 100, true
      )
      on conflict (id) do update set
        name = excluded.name,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        radius = excluded.radius,
        is_active = true
    `;

    return { buyerId: buyer.id, delivererId: deliverer.id, adminId: admin.id };
  } finally {
    await sql.end();
  }
}

export async function readScenarioState(
  orderId: string,
  _users: SeededScenario,
) {
  const sql = postgres(required("POSTGRES_URL"), { prepare: false });
  try {
    const [order] = await sql<
      {
        status: string;
        foodPrice: number;
        deliveryFee: number;
        platformFee: number;
        delivererLatitude: number | null;
      }[]
    >`
      select status,
             food_price as "foodPrice",
             delivery_fee as "deliveryFee",
             platform_fee as "platformFee",
             deliverer_latitude as "delivererLatitude"
      from orders where id = ${orderId}
    `;
    const [payment] = await sql<
      {
        method: string | null;
        status: string;
        expectedAmount: number;
        submittedUtr: string | null;
        verifiedByAdminId: string | null;
      }[]
    >`
      select method,
             status,
             expected_amount as "expectedAmount",
             submitted_utr as "submittedUtr",
             verified_by_admin_id as "verifiedByAdminId"
      from order_payments where order_id = ${orderId}
    `;
    const [settlement] = await sql<
      {
        status: string;
        amountDue: number;
        foodReimbursement: number;
        deliveryEarning: number;
        requestedAt: Date | null;
        payoutReference: string | null;
      }[]
    >`
      select status,
             amount_due as "amountDue",
             food_reimbursement as "foodReimbursement",
             delivery_earning as "deliveryEarning",
             requested_at as "requestedAt",
             payout_reference as "payoutReference"
      from order_settlements where order_id = ${orderId}
    `;
    return { order, payment, settlement };
  } finally {
    await sql.end();
  }
}
