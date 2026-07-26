CREATE TABLE "workforce_employee_socials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"profile_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workforce_employee_socials" ADD CONSTRAINT "workforce_employee_socials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_employee_socials" ADD CONSTRAINT "workforce_employee_socials_employee_id_workforce_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workforce_employee_socials_employee_idx" ON "workforce_employee_socials" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_employee_socials_employee_provider_uidx" ON "workforce_employee_socials" USING btree ("tenant_id","employee_id","provider");
