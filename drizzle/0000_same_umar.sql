CREATE TYPE "public"."bid_status" AS ENUM('pending', 'accepted', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'boat_operator', 'cargo_company', 'admin');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('open', 'assigned', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('scheduled', 'in_transit', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "bids_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipmentId" integer NOT NULL,
	"tripId" integer NOT NULL,
	"agreedPriceUSD" numeric(10, 2) NOT NULL,
	"status" "bid_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boat_operators" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"vesselName" text NOT NULL,
	"vesselType" text NOT NULL,
	"maxCapacityTons" numeric(10, 2) NOT NULL,
	"licenseNumber" text NOT NULL,
	"isVerified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargo_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"companyName" text NOT NULL,
	"registrationNumber" text NOT NULL,
	"contactPhone" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipperId" integer NOT NULL,
	"title" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"weightTons" numeric(10, 2) NOT NULL,
	"cargoType" text NOT NULL,
	"budgetUSD" numeric(10, 2),
	"status" "shipment_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"operatorId" integer NOT NULL,
	"departurePort" text NOT NULL,
	"arrivalPort" text NOT NULL,
	"departureDate" timestamp with time zone NOT NULL,
	"availableCapacityTons" numeric(10, 2) NOT NULL,
	"passengerSeats" integer DEFAULT 0,
	"status" "trip_status" DEFAULT 'scheduled' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64),
	"name" text,
	"email" text,
	"passwordHash" text,
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bids_bookings" ADD CONSTRAINT "bids_bookings_shipmentId_shipment_proposals_id_fk" FOREIGN KEY ("shipmentId") REFERENCES "public"."shipment_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids_bookings" ADD CONSTRAINT "bids_bookings_tripId_trip_proposals_id_fk" FOREIGN KEY ("tripId") REFERENCES "public"."trip_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boat_operators" ADD CONSTRAINT "boat_operators_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargo_companies" ADD CONSTRAINT "cargo_companies_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_proposals" ADD CONSTRAINT "shipment_proposals_shipperId_users_id_fk" FOREIGN KEY ("shipperId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_proposals" ADD CONSTRAINT "trip_proposals_operatorId_boat_operators_id_fk" FOREIGN KEY ("operatorId") REFERENCES "public"."boat_operators"("id") ON DELETE cascade ON UPDATE no action;