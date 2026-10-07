import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema";
import {
  bidsBookings,
  boatOperators,
  cargoCompanies,
  InsertBidBooking,
  InsertBoatOperator,
  InsertCargoCompany,
  InsertShipmentProposal,
  InsertTripProposal,
  InsertUser,
  shipmentProposals,
  tripProposals,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: postgres.Sql | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, { max: 10 });
      _db = drizzle(_client, { schema });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==========================================
// User Queries & Mutations
// ==========================================
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId && !user.email) {
    throw new Error("User openId or email is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId ?? null,
      email: user.email ?? null,
      name: user.name ?? null,
      loginMethod: user.loginMethod ?? null,
      passwordHash: user.passwordHash ?? null,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    textFields.forEach((field) => {
      const value = user[field];
      if (value !== undefined) {
        const normalized = value ?? null;
        values[field] = normalized as any;
        updateSet[field] = normalized;
      }
    });

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    if (values.openId) {
      await db
        .insert(users)
        .values(values)
        .onConflictDoUpdate({
          target: users.openId,
          set: updateSet,
        });
    } else {
      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==========================================
// Boat Operators
// ==========================================
export async function getBoatOperators() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(boatOperators).orderBy(desc(boatOperators.createdAt));
}

export async function getBoatOperatorByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(boatOperators)
    .where(eq(boatOperators.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createBoatOperator(data: InsertBoatOperator) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(boatOperators).values(data).returning();
  return result[0];
}

// ==========================================
// Cargo Companies
// ==========================================
export async function getCargoCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cargoCompanies).orderBy(desc(cargoCompanies.createdAt));
}

export async function getCargoCompanyByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(cargoCompanies)
    .where(eq(cargoCompanies.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCargoCompany(data: InsertCargoCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cargoCompanies).values(data).returning();
  return result[0];
}

// ==========================================
// Shipment Proposals (Live Cargo Requests)
// ==========================================
export async function getShipmentProposals(filter?: { status?: "open" | "assigned" | "completed" | "cancelled" }) {
  const db = await getDb();
  if (!db) return [];
  if (filter?.status) {
    return db
      .select()
      .from(shipmentProposals)
      .where(eq(shipmentProposals.status, filter.status))
      .orderBy(desc(shipmentProposals.createdAt));
  }
  return db.select().from(shipmentProposals).orderBy(desc(shipmentProposals.createdAt));
}

export async function getShipmentProposalById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(shipmentProposals)
    .where(eq(shipmentProposals.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createShipmentProposal(data: InsertShipmentProposal) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(shipmentProposals).values(data).returning();
  return result[0];
}

export async function updateShipmentProposalStatus(
  id: number,
  status: "open" | "assigned" | "completed" | "cancelled"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(shipmentProposals)
    .set({ status, updatedAt: new Date() })
    .where(eq(shipmentProposals.id, id))
    .returning();
  return result[0];
}

// ==========================================
// Trip Proposals (Live Boat Routes)
// ==========================================
export async function getTripProposals(filter?: { status?: "scheduled" | "in_transit" | "completed" | "cancelled" }) {
  const db = await getDb();
  if (!db) return [];
  if (filter?.status) {
    return db
      .select()
      .from(tripProposals)
      .where(eq(tripProposals.status, filter.status))
      .orderBy(desc(tripProposals.departureDate));
  }
  return db.select().from(tripProposals).orderBy(desc(tripProposals.departureDate));
}

export async function getTripProposalById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(tripProposals)
    .where(eq(tripProposals.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createTripProposal(data: InsertTripProposal) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tripProposals).values(data).returning();
  return result[0];
}

export async function updateTripProposalStatus(
  id: number,
  status: "scheduled" | "in_transit" | "completed" | "cancelled"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(tripProposals)
    .set({ status, updatedAt: new Date() })
    .where(eq(tripProposals.id, id))
    .returning();
  return result[0];
}

// ==========================================
// Bids & Bookings
// ==========================================
export async function getBidsBookings(filter?: { shipmentId?: number; tripId?: number }) {
  const db = await getDb();
  if (!db) return [];
  if (filter?.shipmentId) {
    return db
      .select()
      .from(bidsBookings)
      .where(eq(bidsBookings.shipmentId, filter.shipmentId))
      .orderBy(desc(bidsBookings.createdAt));
  }
  if (filter?.tripId) {
    return db
      .select()
      .from(bidsBookings)
      .where(eq(bidsBookings.tripId, filter.tripId))
      .orderBy(desc(bidsBookings.createdAt));
  }
  return db.select().from(bidsBookings).orderBy(desc(bidsBookings.createdAt));
}

export async function createBidBooking(data: InsertBidBooking) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bidsBookings).values(data).returning();
  return result[0];
}

export async function updateBidBookingStatus(
  id: number,
  status: "pending" | "accepted" | "rejected" | "completed"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(bidsBookings)
    .set({ status, updatedAt: new Date() })
    .where(eq(bidsBookings.id, id))
    .returning();
  return result[0];
}
