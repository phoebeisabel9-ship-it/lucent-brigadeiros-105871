CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"ticker" text NOT NULL,
	"units" integer NOT NULL,
	"unit_price" numeric(14,4) NOT NULL,
	"amount_invested" numeric(14,2) NOT NULL,
	"brokerage" numeric(14,2) NOT NULL,
	"cash_used" numeric(14,2) NOT NULL,
	"cash_remaining" numeric(14,2) NOT NULL,
	"strategic_score" numeric(7,2) NOT NULL,
	"tactical_score" numeric(7,2) NOT NULL,
	"overall_score" numeric(7,2) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
