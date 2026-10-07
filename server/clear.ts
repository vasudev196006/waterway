import "dotenv/config";
import { getDb } from "./db";
import {
  bidsBookings,
  shipmentProposals,
  tripProposals,
  boatOperators,
  cargoCompanies,
} from "../drizzle/schema";

async function clear() {
  const db = await getDb();
  if (!db) {
    console.error("❌ Failed to connect to database. Check DATABASE_URL in .env");
    process.exit(1);
  }

  console.log("🧹 Clearing all cargo shipments, trips, and bids from Supabase...");
  await db.delete(bidsBookings);
  await db.delete(shipmentProposals);
  await db.delete(tripProposals);
  console.log("✅ Cleared operations tables (bids, shipments, trips)!");
  process.exit(0);
}

clear().catch((err) => {
  console.error("❌ Failed to clear database:", err);
  process.exit(1);
});
