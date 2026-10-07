import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ==========================================
// Enums
// ==========================================
export const roleEnum = pgEnum("role", [
  "user",
  "boat_operator",
  "cargo_company",
  "admin",
]);

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "open",
  "assigned",
  "completed",
  "cancelled",
]);

export const tripStatusEnum = pgEnum("trip_status", [
  "scheduled",
  "in_transit",
  "completed",
  "cancelled",
]);

export const bidStatusEnum = pgEnum("bid_status", [
  "pending",
  "accepted",
  "rejected",
  "completed",
]);

// ==========================================
// 1. Users (Core Auth & Identity)
// ==========================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: text("email").unique(),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 2. Boat Operators (Operator Profiles)
// ==========================================
export const boatOperators = pgTable("boat_operators", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  vesselName: text("vesselName").notNull(),
  vesselType: text("vesselType").notNull(),
  maxCapacityTons: decimal("maxCapacityTons", { precision: 10, scale: 2 }).notNull(),
  licenseNumber: text("licenseNumber").notNull(),
  isVerified: boolean("isVerified").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 3. Cargo Companies (Logistics Profiles)
// ==========================================
export const cargoCompanies = pgTable("cargo_companies", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  companyName: text("companyName").notNull(),
  registrationNumber: text("registrationNumber").notNull(),
  contactPhone: text("contactPhone").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 4. Shipment Proposals (Live Cargo Requests)
// ==========================================
export const shipmentProposals = pgTable("shipment_proposals", {
  id: serial("id").primaryKey(),
  shipperId: integer("shipperId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  weightTons: decimal("weightTons", { precision: 10, scale: 2 }).notNull(),
  cargoType: text("cargoType").notNull(),
  budgetUSD: decimal("budgetUSD", { precision: 10, scale: 2 }),
  status: shipmentStatusEnum("status").default("open").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 5. Trip Proposals (Live Boat Routes)
// ==========================================
export const tripProposals = pgTable("trip_proposals", {
  id: serial("id").primaryKey(),
  operatorId: integer("operatorId")
    .references(() => boatOperators.id, { onDelete: "cascade" })
    .notNull(),
  departurePort: text("departurePort").notNull(),
  arrivalPort: text("arrivalPort").notNull(),
  departureDate: timestamp("departureDate", { withTimezone: true }).notNull(),
  availableCapacityTons: decimal("availableCapacityTons", { precision: 10, scale: 2 }).notNull(),
  passengerSeats: integer("passengerSeats").default(0),
  status: tripStatusEnum("status").default("scheduled").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 6. Bids & Bookings (Contract & Matching)
// ==========================================
export const bidsBookings = pgTable("bids_bookings", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipmentId")
    .references(() => shipmentProposals.id, { onDelete: "cascade" })
    .notNull(),
  tripId: integer("tripId")
    .references(() => tripProposals.id, { onDelete: "cascade" })
    .notNull(),
  agreedPriceUSD: decimal("agreedPriceUSD", { precision: 10, scale: 2 }).notNull(),
  status: bidStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// Relational Definitions
// ==========================================
export const usersRelations = relations(users, ({ one, many }) => ({
  boatOperator: one(boatOperators, {
    fields: [users.id],
    references: [boatOperators.userId],
  }),
  cargoCompany: one(cargoCompanies, {
    fields: [users.id],
    references: [cargoCompanies.userId],
  }),
  shipmentProposals: many(shipmentProposals),
}));

export const boatOperatorsRelations = relations(boatOperators, ({ one, many }) => ({
  user: one(users, {
    fields: [boatOperators.userId],
    references: [users.id],
  }),
  tripProposals: many(tripProposals),
}));

export const cargoCompaniesRelations = relations(cargoCompanies, ({ one }) => ({
  user: one(users, {
    fields: [cargoCompanies.userId],
    references: [users.id],
  }),
}));

export const shipmentProposalsRelations = relations(shipmentProposals, ({ one, many }) => ({
  shipper: one(users, {
    fields: [shipmentProposals.shipperId],
    references: [users.id],
  }),
  bids: many(bidsBookings),
}));

export const tripProposalsRelations = relations(tripProposals, ({ one, many }) => ({
  operator: one(boatOperators, {
    fields: [tripProposals.operatorId],
    references: [boatOperators.id],
  }),
  bids: many(bidsBookings),
}));

export const bidsBookingsRelations = relations(bidsBookings, ({ one }) => ({
  shipment: one(shipmentProposals, {
    fields: [bidsBookings.shipmentId],
    references: [shipmentProposals.id],
  }),
  trip: one(tripProposals, {
    fields: [bidsBookings.tripId],
    references: [tripProposals.id],
  }),
}));

// ==========================================
// Inferred TypeScript Types
// ==========================================
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type BoatOperator = typeof boatOperators.$inferSelect;
export type InsertBoatOperator = typeof boatOperators.$inferInsert;

export type CargoCompany = typeof cargoCompanies.$inferSelect;
export type InsertCargoCompany = typeof cargoCompanies.$inferInsert;

export type ShipmentProposal = typeof shipmentProposals.$inferSelect;
export type InsertShipmentProposal = typeof shipmentProposals.$inferInsert;

export type TripProposal = typeof tripProposals.$inferSelect;
export type InsertTripProposal = typeof tripProposals.$inferInsert;

export type BidBooking = typeof bidsBookings.$inferSelect;
export type InsertBidBooking = typeof bidsBookings.$inferInsert;