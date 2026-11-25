CREATE TYPE "public"."assignment_role" AS ENUM('primary', 'backup');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('working', 'weekly_off', 'holiday', 'leave', 'comp_off', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."roster_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."time_off_kind" AS ENUM('leave', 'comp_off', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."time_off_status" AS ENUM('requested', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "assignments" (
	"employee_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"role" "assignment_role" NOT NULL,
	CONSTRAINT "assignments_employee_id_service_id_pk" PRIMARY KEY("employee_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"pod_id" integer NOT NULL,
	"calendar_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "comp_off_credits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comp_off_credits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"earned_on" date NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "comp_off_credits_once_per_day" UNIQUE("employee_id","earned_on")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "employees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"pod_id" integer NOT NULL,
	"weekly_off_count" smallint DEFAULT 1 NOT NULL,
	"fixed_off_days" smallint[] DEFAULT '{}' NOT NULL,
	"unavailable_days" smallint[] DEFAULT '{}' NOT NULL,
	"preferred_off_days" smallint[] DEFAULT '{}' NOT NULL,
	"max_brands_per_day" smallint DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "employees_weekly_off_count" CHECK ("employees"."weekly_off_count" between 0 and 6),
	CONSTRAINT "employees_max_brands" CHECK ("employees"."max_brands_per_day" >= 1),
	CONSTRAINT "employees_fixed_off_days" CHECK ("employees"."fixed_off_days" <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
	CONSTRAINT "employees_unavailable_days" CHECK ("employees"."unavailable_days" <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
	CONSTRAINT "employees_preferred_off_days" CHECK ("employees"."preferred_off_days" <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_calendars" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operating_calendars_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"open_days" smallint[] DEFAULT '{}' NOT NULL,
	"open_on_holidays" boolean NOT NULL,
	CONSTRAINT "operating_calendars_name_unique" UNIQUE("name"),
	CONSTRAINT "operating_calendars_open_days" CHECK ("operating_calendars"."open_days" <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
--> statement-breakpoint
CREATE TABLE "pods" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"lead_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pods_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "processes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "processes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "processes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "roster_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roster_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"roster_id" integer NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_days" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roster_days_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"roster_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"status" "day_status" NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "roster_days_once" UNIQUE("roster_id","employee_id","date")
);
--> statement-breakpoint
CREATE TABLE "roster_duties" (
	"roster_day_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"is_backup" boolean DEFAULT false NOT NULL,
	CONSTRAINT "roster_duties_roster_day_id_service_id_pk" PRIMARY KEY("roster_day_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "rosters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rosters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"month" date NOT NULL,
	"status" "roster_status" DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"override_reason" text,
	CONSTRAINT "rosters_month_unique" UNIQUE("month"),
	CONSTRAINT "rosters_first_of_month" CHECK (extract(day from "rosters"."month") = 1),
	CONSTRAINT "rosters_published_at" CHECK (("rosters"."status" = 'published') = ("rosters"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"brand_id" integer NOT NULL,
	"process_id" integer NOT NULL,
	"calendar_id" integer,
	"shift_id" integer NOT NULL,
	"min_staff" smallint DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "services_brand_process" UNIQUE("brand_id","process_id"),
	CONSTRAINT "services_min_staff" CHECK ("services"."min_staff" >= 1)
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shifts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "shifts_name_unique" UNIQUE("name"),
	CONSTRAINT "shifts_same_day" CHECK ("shifts"."end_time" > "shifts"."start_time")
);
--> statement-breakpoint
CREATE TABLE "staffing_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staffing_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"service_id" integer NOT NULL,
	"weekday" smallint,
	"date" date,
	"min_staff" smallint NOT NULL,
	"note" text,
	CONSTRAINT "staffing_rules_one_kind" CHECK (num_nonnulls("staffing_rules"."weekday", "staffing_rules"."date") = 1),
	CONSTRAINT "staffing_rules_weekday_range" CHECK ("staffing_rules"."weekday" between 0 and 6),
	CONSTRAINT "staffing_rules_min_staff" CHECK ("staffing_rules"."min_staff" >= 0)
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "time_off_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"kind" time_off_kind NOT NULL,
	"status" time_off_status DEFAULT 'requested' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_off_date_order" CHECK ("time_off"."end_date" >= "time_off"."start_date"),
	CONSTRAINT "time_off_comp_off_one_day" CHECK ("time_off"."kind" <> 'comp_off' or "time_off"."start_date" = "time_off"."end_date")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_pod_id_pods_id_fk" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_calendar_id_operating_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."operating_calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_off_credits" ADD CONSTRAINT "comp_off_credits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_pod_id_pods_id_fk" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pods" ADD CONSTRAINT "pods_lead_id_employees_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_changes" ADD CONSTRAINT "roster_changes_roster_id_rosters_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."rosters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_days" ADD CONSTRAINT "roster_days_roster_id_rosters_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."rosters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_days" ADD CONSTRAINT "roster_days_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_duties" ADD CONSTRAINT "roster_duties_roster_day_id_roster_days_id_fk" FOREIGN KEY ("roster_day_id") REFERENCES "public"."roster_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_duties" ADD CONSTRAINT "roster_duties_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_calendar_id_operating_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."operating_calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_rules" ADD CONSTRAINT "staffing_rules_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_service_idx" ON "assignments" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "brands_pod_idx" ON "brands" USING btree ("pod_id");--> statement-breakpoint
CREATE INDEX "employees_pod_idx" ON "employees" USING btree ("pod_id");--> statement-breakpoint
CREATE INDEX "roster_changes_roster_idx" ON "roster_changes" USING btree ("roster_id","created_at");--> statement-breakpoint
CREATE INDEX "roster_days_date_idx" ON "roster_days" USING btree ("roster_id","date");--> statement-breakpoint
CREATE INDEX "roster_duties_service_idx" ON "roster_duties" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staffing_rules_weekday" ON "staffing_rules" USING btree ("service_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "staffing_rules_date" ON "staffing_rules" USING btree ("service_id","date");--> statement-breakpoint
CREATE INDEX "time_off_employee_dates_idx" ON "time_off" USING btree ("employee_id","start_date","end_date");