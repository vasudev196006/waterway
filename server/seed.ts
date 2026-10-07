import "dotenv/config";
import { getDb } from "./db";
import {
  users,
  boatOperators,
  cargoCompanies,
  shipmentProposals,
  tripProposals,
} from "../drizzle/schema";

async function seed() {
  const db = await getDb();
  if (!db) {
    console.error("❌ Failed to connect to database. Check DATABASE_URL in .env");
    process.exit(1);
  }

  console.log("🌊 Seeding Kerala Waterway Logistics Database...");

  // 1. Create or upsert core users
  console.log("1. Creating Users...");
  const [adminUser] = await db
    .insert(users)
    .values({
      openId: "admin_anita_menon",
      name: "Anita Menon",
      email: "anita.menon@waterway.kerala.gov.in",
      role: "admin",
    })
    .onConflictDoUpdate({
      target: users.openId,
      set: { name: "Anita Menon", role: "admin" },
    })
    .returning();

  const [operatorUser] = await db
    .insert(users)
    .values({
      openId: "operator_ravi_kumar",
      name: "Ravi Kumar",
      email: "ravi.kumar@bluecurrentlogistics.in",
      role: "boat_operator",
    })
    .onConflictDoUpdate({
      target: users.openId,
      set: { name: "Ravi Kumar", role: "boat_operator" },
    })
    .returning();

  const [shipperUser] = await db
    .insert(users)
    .values({
      openId: "shipper_malabar_buildco",
      name: "Malabar BuildCo",
      email: "logistics@malabarbuildco.com",
      role: "cargo_company",
    })
    .onConflictDoUpdate({
      target: users.openId,
      set: { name: "Malabar BuildCo", role: "cargo_company" },
    })
    .returning();

  // 2. Create Boat Operators & Fleet
  console.log("2. Registering Boat Operators & Vessels...");
  const [operator1] = await db
    .insert(boatOperators)
    .values({
      userId: operatorUser.id,
      vesselName: "River Fern",
      vesselType: "Heavy Freight Barge",
      maxCapacityTons: "420.00",
      licenseNumber: "KL-WAT-2024-089",
      isVerified: true,
    })
    .returning();

  const [operator2] = await db
    .insert(boatOperators)
    .values({
      userId: operatorUser.id,
      vesselName: "Backwater Star",
      vesselType: "Medium Cargo Carrier",
      maxCapacityTons: "260.00",
      licenseNumber: "KL-WAT-2023-014",
      isVerified: true,
    })
    .returning();

  const [operator3] = await db
    .insert(boatOperators)
    .values({
      userId: operatorUser.id,
      vesselName: "Matsya 4",
      vesselType: "High-Capacity Bulk Barge",
      maxCapacityTons: "520.00",
      licenseNumber: "KL-WAT-2022-441",
      isVerified: true,
    })
    .returning();

  const [operator4] = await db
    .insert(boatOperators)
    .values({
      userId: operatorUser.id,
      vesselName: "Cochin Belle",
      vesselType: "Express Feeder Vessel",
      maxCapacityTons: "180.00",
      licenseNumber: "KL-WAT-2025-102",
      isVerified: true,
    })
    .returning();

  // 3. Register Cargo Companies
  console.log("3. Registering Cargo Companies...");
  await db
    .insert(cargoCompanies)
    .values({
      userId: shipperUser.id,
      companyName: "Malabar BuildCo Infrastructure",
      registrationNumber: "CIN-U45203KL2018PTC055123",
      contactPhone: "+91 484 290 8812",
    })
    .returning();

  // 4. Create Active & Scheduled Trip Proposals
  console.log("4. Creating Trip Proposals (Fleet Schedules)...");
  await db.insert(tripProposals).values([
    {
      operatorId: operator1.id,
      departurePort: "Kochi",
      arrivalPort: "Alappuzha",
      departureDate: new Date(Date.now() + 2 * 3600 * 1000),
      availableCapacityTons: "420.00",
      status: "in_transit",
    },
    {
      operatorId: operator2.id,
      departurePort: "Kollam",
      arrivalPort: "Kottayam",
      departureDate: new Date(Date.now() + 6 * 3600 * 1000),
      availableCapacityTons: "260.00",
      status: "scheduled",
    },
    {
      operatorId: operator3.id,
      departurePort: "Alappuzha",
      arrivalPort: "Kollam",
      departureDate: new Date(Date.now() + 18 * 3600 * 1000),
      availableCapacityTons: "520.00",
      status: "in_transit",
    },
    {
      operatorId: operator4.id,
      departurePort: "Kochi",
      arrivalPort: "Kottayam",
      departureDate: new Date(Date.now() + 24 * 3600 * 1000),
      availableCapacityTons: "180.00",
      status: "scheduled",
    },
  ]);

  // 5. Create Shipment Proposals (Cargo Pool)
  console.log("5. Creating Shipment Proposals (Live Cargo Pool)...");
  await db.insert(shipmentProposals).values([
    {
      shipperId: shipperUser.id,
      title: "Portland Cement Bags",
      origin: "Kochi",
      destination: "Alappuzha",
      weightTons: "180.00",
      cargoType: "Cement",
      budgetUSD: "1200.00",
      status: "assigned",
    },
    {
      shipperId: shipperUser.id,
      title: "Bulk Kerala Paddy & Grain",
      origin: "Kollam",
      destination: "Kottayam",
      weightTons: "95.00",
      cargoType: "Grain",
      budgetUSD: "650.00",
      status: "open",
    },
    {
      shipperId: shipperUser.id,
      title: "Red Clay Construction Bricks",
      origin: "Kochi",
      destination: "Kottayam",
      weightTons: "240.00",
      cargoType: "Bricks",
      budgetUSD: "1550.00",
      status: "assigned",
    },
    {
      shipperId: shipperUser.id,
      title: "Teak & Rosewood Sawn Timber",
      origin: "Alappuzha",
      destination: "Kollam",
      weightTons: "72.00",
      cargoType: "Timber",
      budgetUSD: "480.00",
      status: "open",
    },
  ]);

  console.log("✅ Successfully seeded Supabase PostgreSQL database with live operations data!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
