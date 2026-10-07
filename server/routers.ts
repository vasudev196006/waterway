import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ==========================================
  // Shipment Proposals
  // ==========================================
  shipments: router({
    list: publicProcedure
      .input(
        z
          .object({
            status: z.enum(["open", "assigned", "completed", "cancelled"]).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.getShipmentProposals(input);
      }),

    byId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getShipmentProposalById(input.id);
      }),

    create: publicProcedure
      .input(
        z.object({
          title: z.string().min(1, "Title is required"),
          origin: z.string().min(1, "Origin is required"),
          destination: z.string().min(1, "Destination is required"),
          weightTons: z.string().min(1, "Weight in tons is required"),
          cargoType: z.string().min(1, "Cargo type is required"),
          budgetUSD: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const shipperId = ctx.user?.id ?? 3;
        return db.createShipmentProposal({
          shipperId,
          title: input.title,
          origin: input.origin,
          destination: input.destination,
          weightTons: input.weightTons,
          cargoType: input.cargoType,
          budgetUSD: input.budgetUSD ?? null,
          status: "open",
        });
      }),

    updateStatus: publicProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["open", "assigned", "completed", "cancelled"]),
        })
      )
      .mutation(async ({ input }) => {
        return db.updateShipmentProposalStatus(input.id, input.status);
      }),
  }),

  // ==========================================
  // Trip Proposals
  // ==========================================
  trips: router({
    list: publicProcedure
      .input(
        z
          .object({
            status: z.enum(["scheduled", "in_transit", "completed", "cancelled"]).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.getTripProposals(input);
      }),

    byId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getTripProposalById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          operatorId: z.number(),
          departurePort: z.string().min(1, "Departure port is required"),
          arrivalPort: z.string().min(1, "Arrival port is required"),
          departureDate: z.string().or(z.date()),
          availableCapacityTons: z.string().min(1, "Available capacity is required"),
          passengerSeats: z.number().optional().default(0),
        })
      )
      .mutation(async ({ input }) => {
        return db.createTripProposal({
          operatorId: input.operatorId,
          departurePort: input.departurePort,
          arrivalPort: input.arrivalPort,
          departureDate: new Date(input.departureDate),
          availableCapacityTons: input.availableCapacityTons,
          passengerSeats: input.passengerSeats,
          status: "scheduled",
        });
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["scheduled", "in_transit", "completed", "cancelled"]),
        })
      )
      .mutation(async ({ input }) => {
        return db.updateTripProposalStatus(input.id, input.status);
      }),
  }),

  // ==========================================
  // Boat Operators
  // ==========================================
  operators: router({
    list: publicProcedure.query(async () => {
      return db.getBoatOperators();
    }),

    byUserId: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return db.getBoatOperatorByUserId(input.userId);
      }),

    register: protectedProcedure
      .input(
        z.object({
          vesselName: z.string().min(1, "Vessel name is required"),
          vesselType: z.string().min(1, "Vessel type is required"),
          maxCapacityTons: z.string().min(1, "Capacity in tons is required"),
          licenseNumber: z.string().min(1, "License number is required"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return db.createBoatOperator({
          userId: ctx.user.id,
          vesselName: input.vesselName,
          vesselType: input.vesselType,
          maxCapacityTons: input.maxCapacityTons,
          licenseNumber: input.licenseNumber,
          isVerified: false,
        });
      }),
  }),

  // ==========================================
  // Cargo Companies
  // ==========================================
  cargoCompanies: router({
    list: publicProcedure.query(async () => {
      return db.getCargoCompanies();
    }),

    byUserId: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return db.getCargoCompanyByUserId(input.userId);
      }),

    register: protectedProcedure
      .input(
        z.object({
          companyName: z.string().min(1, "Company name is required"),
          registrationNumber: z.string().min(1, "Registration number is required"),
          contactPhone: z.string().min(1, "Contact phone is required"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return db.createCargoCompany({
          userId: ctx.user.id,
          companyName: input.companyName,
          registrationNumber: input.registrationNumber,
          contactPhone: input.contactPhone,
        });
      }),
  }),

  // ==========================================
  // Bids & Bookings
  // ==========================================
  bookings: router({
    list: publicProcedure
      .input(
        z
          .object({
            shipmentId: z.number().optional(),
            tripId: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.getBidsBookings(input);
      }),

    create: protectedProcedure
      .input(
        z.object({
          shipmentId: z.number(),
          tripId: z.number(),
          agreedPriceUSD: z.string().min(1, "Agreed price is required"),
        })
      )
      .mutation(async ({ input }) => {
        return db.createBidBooking({
          shipmentId: input.shipmentId,
          tripId: input.tripId,
          agreedPriceUSD: input.agreedPriceUSD,
          status: "pending",
        });
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "accepted", "rejected", "completed"]),
        })
      )
      .mutation(async ({ input }) => {
        return db.updateBidBookingStatus(input.id, input.status);
      }),
  }),
});

export type AppRouter = typeof appRouter;
