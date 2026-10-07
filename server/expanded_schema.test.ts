import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(userRole?: "user" | "admin" | "boat_operator" | "cargo_company"): TrpcContext {
  return {
    user: userRole
      ? {
          id: 1,
          openId: "test-user-id",
          name: "Test User",
          email: "test@waterway.com",
          passwordHash: null,
          loginMethod: "manus",
          role: userRole,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Expanded Schema & tRPC Procedures", () => {
  it("allows querying public shipments list", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const shipments = await caller.shipments.list();
    expect(Array.isArray(shipments)).toBe(true);
  });

  it("allows querying public trips list", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const trips = await caller.trips.list();
    expect(Array.isArray(trips)).toBe(true);
  });

  it("allows querying boat operators and cargo companies", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const operators = await caller.operators.list();
    expect(Array.isArray(operators)).toBe(true);

    const companies = await caller.cargoCompanies.list();
    expect(Array.isArray(companies)).toBe(true);
  });

  it("requires authentication for creating a shipment proposal", async () => {
    const unauthedCtx = createMockContext();
    const caller = appRouter.createCaller(unauthedCtx);

    await expect(
      caller.shipments.create({
        title: "50 Tons Cement",
        origin: "Kochi",
        destination: "Alappuzha",
        weightTons: "50",
        cargoType: "Cement",
      })
    ).rejects.toThrow();
  });
});
