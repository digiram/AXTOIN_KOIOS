CREATE TABLE "app_cache_entries" (
	"namespace" varchar(64) NOT NULL,
	"cache_key" varchar(128) NOT NULL,
	"payload" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_cache_entries_namespace_cache_key_pk" PRIMARY KEY("namespace","cache_key")
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" varchar(128) NOT NULL,
	"job_name" varchar(128) NOT NULL,
	"payload" text NOT NULL,
	"dedupe_key" varchar(256),
	"status" varchar(32) DEFAULT 'waiting' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(128),
	"result" text,
	"error" text,
	"processed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"completed_retention_sec" integer,
	"failed_retention_sec" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" varchar(512) NOT NULL,
	"sku" varchar(256),
	"seat_count" integer,
	"amount_minor" bigint,
	"currency_code" varchar(3),
	"cadence_kind" varchar(32) DEFAULT 'monthly' NOT NULL,
	"cadence_interval_count" integer,
	"cadence_interval_unit" varchar(16),
	"start_date" date,
	"end_date" date,
	"renewal_date" date,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_subscription_provider_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"title" varchar(512) NOT NULL,
	"original_filename" varchar(512) NOT NULL,
	"mime_type" varchar(255),
	"storage_rel_path" varchar(512) NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_subscription_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(512) NOT NULL,
	"vendor_name" varchar(512),
	"category" varchar(128),
	"description" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"subscription_kind" varchar(32) DEFAULT 'singular' NOT NULL,
	"owner_employee_id" uuid,
	"renewal_date" date,
	"contract_start_date" date,
	"contract_end_date" date,
	"cadence_kind" varchar(32) DEFAULT 'monthly' NOT NULL,
	"cadence_interval_count" integer,
	"cadence_interval_unit" varchar(16),
	"amount_minor" bigint,
	"currency_code" varchar(3),
	"billing_metadata_json" text DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_subscription_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"employee_id" uuid,
	"display_name" varchar(512),
	"email" text,
	"seat_type" varchar(128),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"activity_type" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"related_entity_id" uuid NOT NULL,
	"related_entity_kind" varchar(32) NOT NULL,
	"scheduled_at" timestamp with time zone,
	"direction" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"salutation" text,
	"title" text,
	"email" text,
	"phone" text,
	"emails_json" text DEFAULT '[]' NOT NULL,
	"phones_json" text DEFAULT '[]' NOT NULL,
	"addresses_json" text DEFAULT '[]' NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"city" text,
	"state" text,
	"country" text,
	"photo_rel_path" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_organization_market_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"layer" integer NOT NULL,
	"parent_id" uuid,
	"name" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_organization_marketing_tag_links" (
	"organization_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "crm_organization_marketing_tag_links_organization_id_tag_id_pk" PRIMARY KEY("organization_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "crm_organization_marketing_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"emails_json" text DEFAULT '[]' NOT NULL,
	"phones_json" text DEFAULT '[]' NOT NULL,
	"addresses_json" text DEFAULT '[]' NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"city" text,
	"state" text,
	"country" text,
	"market_segment_layer1_id" uuid,
	"market_segment_layer2_id" uuid,
	"market_segment_layer3_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_relationship_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"reverse_name" varchar(255) NOT NULL,
	"source_entity_kind" varchar(32) NOT NULL,
	"target_entity_kind" varchar(32) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"relationship_usage_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"relationship_type_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_entity_kind" varchar(32) NOT NULL,
	"target_id" uuid NOT NULL,
	"target_entity_kind" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_key" varchar(320) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_search_tokens" (
	"tenant_id" uuid,
	"entity_table" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"field_name" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_kind" varchar(64) NOT NULL,
	"document_kind" varchar(16) NOT NULL,
	"document_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"payload" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_kind" varchar(16) DEFAULT 'service' NOT NULL,
	"sku" varchar(64),
	"name" varchar(512) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unit_label" varchar(32) DEFAULT 'unit' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"currency_code" varchar(3) DEFAULT 'USD' NOT NULL,
	"tax_rate_bps" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"catalog_item_id" uuid,
	"line_kind" varchar(16) DEFAULT 'manual' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sku" varchar(64),
	"quantity" numeric(18, 6) DEFAULT '1' NOT NULL,
	"unit_label" varchar(32) DEFAULT 'unit' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer,
	"line_subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"line_tax_minor" bigint DEFAULT 0 NOT NULL,
	"line_total_minor" bigint DEFAULT 0 NOT NULL,
	"snapshot" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"payment_date" date NOT NULL,
	"reference" varchar(128),
	"note" text DEFAULT '' NOT NULL,
	"revised_invoice_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'invoice_draft' NOT NULL,
	"document_number" varchar(64) NOT NULL,
	"revision" varchar(32),
	"source_quote_id" uuid,
	"source_offer_id" uuid,
	"source_invoice_id" uuid,
	"crm_organization_id" uuid,
	"crm_contact_id" uuid,
	"customer_snapshot" text DEFAULT '{}' NOT NULL,
	"issuer_snapshot" text DEFAULT '{}' NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"document_date" date NOT NULL,
	"invoice_date" date,
	"service_delivery_date" date,
	"payment_term_days" integer,
	"due_date" date,
	"partial_payment_anchor_date" date,
	"subtotal_excluding_tax_minor" bigint DEFAULT 0 NOT NULL,
	"discount_total_minor" bigint DEFAULT 0 NOT NULL,
	"tax_total_minor" bigint DEFAULT 0 NOT NULL,
	"total_including_tax_minor" bigint DEFAULT 0 NOT NULL,
	"tax_breakdown" text DEFAULT '[]' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"terms_text" text DEFAULT '' NOT NULL,
	"footer_text" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoicing_number_sequences" (
	"tenant_id" uuid NOT NULL,
	"document_kind" varchar(16) NOT NULL,
	"sequence_year" integer DEFAULT 0 NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "invoicing_number_sequences_tenant_id_document_kind_sequence_year_pk" PRIMARY KEY("tenant_id","document_kind","sequence_year")
);
--> statement-breakpoint
CREATE TABLE "invoicing_offer_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"catalog_item_id" uuid,
	"line_kind" varchar(16) DEFAULT 'manual' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sku" varchar(64),
	"quantity" numeric(18, 6) DEFAULT '1' NOT NULL,
	"unit_label" varchar(32) DEFAULT 'unit' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer,
	"line_subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"line_tax_minor" bigint DEFAULT 0 NOT NULL,
	"line_total_minor" bigint DEFAULT 0 NOT NULL,
	"snapshot" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_offer_response_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'offer_draft' NOT NULL,
	"document_number" varchar(64) NOT NULL,
	"revision" varchar(32),
	"source_quote_id" uuid,
	"crm_organization_id" uuid,
	"crm_contact_id" uuid,
	"customer_snapshot" text DEFAULT '{}' NOT NULL,
	"issuer_snapshot" text DEFAULT '{}' NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"document_date" date NOT NULL,
	"offer_expiry_date" date,
	"payment_term_days" integer,
	"subtotal_excluding_tax_minor" bigint DEFAULT 0 NOT NULL,
	"discount_total_minor" bigint DEFAULT 0 NOT NULL,
	"tax_total_minor" bigint DEFAULT 0 NOT NULL,
	"total_including_tax_minor" bigint DEFAULT 0 NOT NULL,
	"tax_breakdown" text DEFAULT '[]' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"terms_text" text DEFAULT '' NOT NULL,
	"footer_text" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_payment_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"reminder_kind" varchar(16) NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_quote_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"catalog_item_id" uuid,
	"line_kind" varchar(16) DEFAULT 'manual' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sku" varchar(64),
	"quantity" numeric(18, 6) DEFAULT '1' NOT NULL,
	"unit_label" varchar(32) DEFAULT 'unit' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer,
	"line_subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"line_tax_minor" bigint DEFAULT 0 NOT NULL,
	"line_total_minor" bigint DEFAULT 0 NOT NULL,
	"snapshot" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'quote_draft' NOT NULL,
	"document_number" varchar(64),
	"temporary_reference" varchar(64),
	"source_offer_id" uuid,
	"source_invoice_id" uuid,
	"crm_organization_id" uuid,
	"crm_contact_id" uuid,
	"customer_snapshot" text DEFAULT '{}' NOT NULL,
	"issuer_snapshot" text DEFAULT '{}' NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"document_date" date NOT NULL,
	"quote_expiry_date" date,
	"payment_term_days" integer,
	"subtotal_excluding_tax_minor" bigint DEFAULT 0 NOT NULL,
	"discount_total_minor" bigint DEFAULT 0 NOT NULL,
	"tax_total_minor" bigint DEFAULT 0 NOT NULL,
	"total_including_tax_minor" bigint DEFAULT 0 NOT NULL,
	"tax_breakdown" text DEFAULT '[]' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"terms_text" text DEFAULT '' NOT NULL,
	"footer_text" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicing_tenant_configuration" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"quote_number_prefix" varchar(16) DEFAULT 'QUO' NOT NULL,
	"offer_number_prefix" varchar(16) DEFAULT 'OFF' NOT NULL,
	"invoice_number_prefix" varchar(16) DEFAULT 'INV' NOT NULL,
	"quote_sequence_year" integer,
	"offer_sequence_year" integer,
	"invoice_sequence_year" integer,
	"quote_sequence_current" integer DEFAULT 0 NOT NULL,
	"offer_sequence_current" integer DEFAULT 0 NOT NULL,
	"invoice_sequence_current" integer DEFAULT 0 NOT NULL,
	"number_padding" integer DEFAULT 4 NOT NULL,
	"yearly_reset" boolean DEFAULT true NOT NULL,
	"allow_direct_quote_to_invoice" boolean DEFAULT false NOT NULL,
	"require_quote_expiry_date" boolean DEFAULT false NOT NULL,
	"allow_customer_facing_quotes" boolean DEFAULT true NOT NULL,
	"default_quote_validity_days" integer,
	"default_payment_term_days" integer DEFAULT 30,
	"payment_reminder_first_offset_days" integer DEFAULT 0 NOT NULL,
	"payment_reminder_second_offset_days" integer DEFAULT 7 NOT NULL,
	"payment_reminders_enabled" boolean DEFAULT true NOT NULL,
	"email_moments_enabled_json" text DEFAULT '{}' NOT NULL,
	"auto_expire_offers_enabled" boolean DEFAULT true NOT NULL,
	"quote_expiry_warnings_enabled" boolean DEFAULT true NOT NULL,
	"allow_manual_line_items" boolean DEFAULT true NOT NULL,
	"allow_discounts" boolean DEFAULT true NOT NULL,
	"issuer_snapshot" text DEFAULT '{}' NOT NULL,
	"tax_rate_options" text DEFAULT '[]' NOT NULL,
	"default_quote_terms_text" text DEFAULT '' NOT NULL,
	"default_offer_terms_text" text DEFAULT '' NOT NULL,
	"default_invoice_terms_text" text DEFAULT '' NOT NULL,
	"default_footer_text" text DEFAULT '' NOT NULL,
	"document_theme_color" varchar(32) DEFAULT 'purple' NOT NULL,
	"company_logo_rel_path" varchar(512),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_account_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(32) DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mailbox_inbox_id" uuid NOT NULL,
	"owner_scope" varchar(32) DEFAULT 'user' NOT NULL,
	"owner_user_id" uuid,
	"owner_employee_id" uuid,
	"display_name" text DEFAULT '' NOT NULL,
	"email_address" text DEFAULT '' NOT NULL,
	"provider" varchar(32) DEFAULT 'internal' NOT NULL,
	"imap_host" varchar(255),
	"imap_port" integer,
	"imap_secure" boolean DEFAULT true NOT NULL,
	"smtp_host" varchar(255),
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT true NOT NULL,
	"username" varchar(512),
	"credentials_encrypted" text,
	"oauth_refresh_token_encrypted" text,
	"oauth_access_token_encrypted" text,
	"oauth_access_token_expires_at" timestamp with time zone,
	"sync_cursor" text,
	"sync_status" varchar(32) DEFAULT 'idle' NOT NULL,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"webhook_subscription_id" varchar(512),
	"color" varchar(32) DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"filename" varchar(512) DEFAULT 'attachment' NOT NULL,
	"mime_type" varchar(255) DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"blob_path" varchar(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"title" varchar(1024) DEFAULT '' NOT NULL,
	"description" text,
	"location" varchar(1024),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'confirmed' NOT NULL,
	"organizer_json" text DEFAULT '{}' NOT NULL,
	"source_message_id" uuid,
	"provider_event_id" varchar(512),
	"ics_uid" varchar(512),
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"recurrence_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mailbox_account_id" uuid,
	"name" varchar(255) DEFAULT 'Calendar' NOT NULL,
	"color" varchar(32) DEFAULT '#3b82f6' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" varchar(32) DEFAULT 'native' NOT NULL,
	"provider_calendar_id" varchar(512),
	"sync_cursor" text,
	"sync_status" varchar(32) DEFAULT 'idle' NOT NULL,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(512),
	"response" varchar(32) DEFAULT 'needs_action' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_inboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_scope" varchar(32) DEFAULT 'user' NOT NULL,
	"owner_user_id" uuid,
	"owner_employee_id" uuid,
	"display_name" varchar(255) DEFAULT '' NOT NULL,
	"color" varchar(32) DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"provider_message_id" varchar(512),
	"direction" varchar(16) DEFAULT 'inbound' NOT NULL,
	"from_json" text DEFAULT '{}' NOT NULL,
	"to_json" text DEFAULT '[]' NOT NULL,
	"cc_json" text DEFAULT '[]' NOT NULL,
	"bcc_json" text DEFAULT '[]' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body_text" text,
	"body_html" text,
	"headers_json" text,
	"message_id" varchar(512),
	"in_reply_to" varchar(512),
	"references_header" text,
	"internal_source" varchar(64),
	"action_url" varchar(2048),
	"related_entity_kind" varchar(64),
	"related_entity_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"has_calendar_invite" boolean DEFAULT false NOT NULL,
	"sent_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_thread_id" varchar(512),
	"subject_normalized" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"folder" varchar(64) DEFAULT 'inbox' NOT NULL,
	"previous_folder" varchar(64),
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" varchar(64) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"subject" varchar(512),
	"body_html" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_geolocation_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"nominatim_base_url" varchar(512) DEFAULT 'https://nominatim.openstreetmap.org' NOT NULL,
	"nominatim_contact_email" varchar(320),
	"nominatim_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_module_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"crm_enabled" boolean DEFAULT true NOT NULL,
	"hrm_enabled" boolean DEFAULT false NOT NULL,
	"sales_funnel_enabled" boolean DEFAULT false NOT NULL,
	"company_subscriptions_enabled" boolean DEFAULT false NOT NULL,
	"invoicing_enabled" boolean DEFAULT false NOT NULL,
	"mailbox_enabled" boolean DEFAULT false NOT NULL,
	"self_register_enabled" boolean DEFAULT false NOT NULL,
	"mfa_totp_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_payment_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"payments_enabled" boolean DEFAULT false NOT NULL,
	"provider" varchar(16) DEFAULT 'stripe' NOT NULL,
	"stripe_publishable_key" varchar(512) DEFAULT '' NOT NULL,
	"stripe_secret_encrypted" text,
	"stripe_webhook_secret_encrypted" text,
	"adyen_merchant_account" varchar(255) DEFAULT '' NOT NULL,
	"adyen_client_key" varchar(512) DEFAULT '' NOT NULL,
	"adyen_environment" varchar(16) DEFAULT 'test' NOT NULL,
	"adyen_api_key_encrypted" text,
	"accepted_payment_methods_json" text DEFAULT '["card","paypal","wallet_apple_google_pay","ideal"]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_smtp_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"username" text,
	"password_encrypted" text,
	"from_name" varchar(255) DEFAULT '' NOT NULL,
	"from_email" varchar(320) DEFAULT '' NOT NULL,
	"smtp_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"subscription_id" uuid,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency_code" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(32) NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"reimbursed_at" timestamp with time zone,
	"description" text,
	"psp_invoice_id" varchar(255),
	"psp_payment_intent_id" varchar(255),
	"psp_charge_id" varchar(255),
	"period_start_utc" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscription_plan_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" varchar(48) NOT NULL,
	"plan_id" uuid,
	"actor_user_id" uuid,
	"summary" text NOT NULL,
	"detail_json" text
);
--> statement-breakpoint
CREATE TABLE "platform_subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_name" varchar(128) NOT NULL,
	"duration_unit" varchar(16) NOT NULL,
	"duration_count" integer DEFAULT 1 NOT NULL,
	"price_cents" integer NOT NULL,
	"currency_code" varchar(3) DEFAULT 'USD' NOT NULL,
	"allow_cancel_anytime" boolean DEFAULT false NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"allow_tier_change_next_period" boolean DEFAULT true NOT NULL,
	"billing_scope" varchar(16) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscription_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"subscriptions_enabled" boolean DEFAULT false NOT NULL,
	"subscription_currency_code" varchar(3) DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_stripe_events" (
	"stripe_event_id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"user_device_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_funnel_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"activity_type" varchar(32) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"payload_json" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_funnel_bdr_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"stage_key" varchar(64) NOT NULL,
	"tags_json" text,
	"owner_user_id" uuid,
	"crm_organization_id" uuid,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"inactive_stage_label" varchar(128),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_funnel_contact_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_funnel_deal_contacts" (
	"tenant_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role_label" varchar(128) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_funnel_deal_contacts_deal_id_contact_id_pk" PRIMARY KEY("deal_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "sales_funnel_lead_contacts" (
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role_label" varchar(128) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_funnel_lead_contacts_lead_id_contact_id_pk" PRIMARY KEY("lead_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "sales_funnel_sales_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"stage_key" varchar(64) NOT NULL,
	"tags_json" text,
	"owner_user_id" uuid,
	"crm_organization_id" uuid,
	"promoted_from_lead_id" uuid,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"outcome_bucket" varchar(8),
	"inactive_stage_label" varchar(128),
	"expected_value_minor" bigint,
	"expected_value_currency" varchar(3),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_funnel_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pipeline" varchar(16) NOT NULL,
	"stage_key" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"outcome" varchar(16) DEFAULT 'open' NOT NULL,
	"close_chance_percent" integer,
	"ready_for_sales" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"plan_id" uuid NOT NULL,
	"pending_plan_id" uuid,
	"status" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"cancel_effective_mode" varchar(32),
	"effective_end_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"psp_customer_id" varchar(255),
	"psp_subscription_id" varchar(255),
	"psp_default_payment_method_id" varchar(255),
	"payment_method_brand" varchar(32),
	"payment_method_last4" varchar(8),
	"payment_method_exp_month" integer,
	"payment_method_exp_year" integer,
	"billing_past_due_since" timestamp with time zone,
	"billing_failed_charge_count" integer DEFAULT 0 NOT NULL,
	"billing_last_payment_error_code" varchar(128),
	"billing_next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_smtp_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"host" varchar(255) DEFAULT '' NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"username" varchar(512),
	"password_encrypted" text,
	"from_name" varchar(255) DEFAULT '' NOT NULL,
	"from_email" varchar(320) DEFAULT '' NOT NULL,
	"smtp_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_user_module_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"module" varchar(32) NOT NULL,
	"role" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_lookup_key" text NOT NULL,
	"realm_self_register_enabled" boolean DEFAULT true NOT NULL,
	"mfa_enforced" boolean DEFAULT false NOT NULL,
	"encrypted_dek" text,
	"dek_key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"install_key" text NOT NULL,
	"platform" varchar(16) NOT NULL,
	"label" text,
	"push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"email" text NOT NULL,
	"role" text DEFAULT 'tenant_user' NOT NULL,
	"identity_key" text NOT NULL,
	"password_hash" text NOT NULL,
	"encrypted_tax_id" text,
	"display_name" text,
	"country_code" varchar(2),
	"measurement_system" varchar(16),
	"timezone" varchar(128),
	"currency_code" varchar(3),
	"currency_format" varchar(32),
	"date_time_format" varchar(16),
	"time_format" varchar(8),
	"home_address_line1" text,
	"home_address_line2" text,
	"home_postal_code" text,
	"home_city" text,
	"home_state" text,
	"home_country" text,
	"first_password_login_at" timestamp with time zone,
	"mfa_grace_expires_at" timestamp with time zone,
	"mfa_blocked_at" timestamp with time zone,
	"mfa_totp_secret_encrypted" text,
	"mfa_totp_enabled" boolean DEFAULT false NOT NULL,
	"mfa_totp_pending_secret_encrypted" text,
	"mfa_totp_pending_expires_at" timestamp with time zone,
	"mfa_email_enabled" boolean DEFAULT false NOT NULL,
	"access_token_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"title" varchar(512) NOT NULL,
	"original_filename" varchar(512) NOT NULL,
	"mime_type" varchar(255),
	"storage_rel_path" varchar(512) NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_employment" date,
	"personal_phone" text,
	"personal_email" text,
	"work_phone" text,
	"work_email" text,
	"personal_address" text,
	"work_location" text,
	"employment_org_unit_id" uuid,
	"job_title" varchar(255),
	"employee_kind" varchar(16) DEFAULT 'person' NOT NULL,
	"notes" text,
	"photo_rel_path" varchar(512),
	"work_time_kind" varchar(16),
	"work_schedule_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_org_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_org_unit_id" uuid,
	"assigned_employee_id" uuid,
	"on_org_chart" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_subscription_plans" ADD CONSTRAINT "company_subscription_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_plans" ADD CONSTRAINT "company_subscription_plans_provider_id_company_subscription_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."company_subscription_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_plans" ADD CONSTRAINT "company_subscription_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_plans" ADD CONSTRAINT "company_subscription_plans_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_provider_documents" ADD CONSTRAINT "company_subscription_provider_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_provider_documents" ADD CONSTRAINT "company_subscription_provider_documents_provider_id_company_subscription_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."company_subscription_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_providers" ADD CONSTRAINT "company_subscription_providers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_providers" ADD CONSTRAINT "company_subscription_providers_owner_employee_id_workforce_employees_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_providers" ADD CONSTRAINT "company_subscription_providers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_providers" ADD CONSTRAINT "company_subscription_providers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_seats" ADD CONSTRAINT "company_subscription_seats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_seats" ADD CONSTRAINT "company_subscription_seats_plan_id_company_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."company_subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_seats" ADD CONSTRAINT "company_subscription_seats_employee_id_workforce_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_seats" ADD CONSTRAINT "company_subscription_seats_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscription_seats" ADD CONSTRAINT "company_subscription_seats_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organization_market_segments" ADD CONSTRAINT "crm_organization_market_segments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organization_market_segments" ADD CONSTRAINT "crm_organization_market_segments_parent_id_crm_organization_market_segments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."crm_organization_market_segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organization_marketing_tag_links" ADD CONSTRAINT "crm_organization_marketing_tag_links_organization_id_crm_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organization_marketing_tag_links" ADD CONSTRAINT "crm_organization_marketing_tag_links_tag_id_crm_organization_marketing_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."crm_organization_marketing_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organization_marketing_tags" ADD CONSTRAINT "crm_organization_marketing_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organizations" ADD CONSTRAINT "crm_organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organizations" ADD CONSTRAINT "crm_organizations_market_segment_layer1_id_crm_organization_market_segments_id_fk" FOREIGN KEY ("market_segment_layer1_id") REFERENCES "public"."crm_organization_market_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organizations" ADD CONSTRAINT "crm_organizations_market_segment_layer2_id_crm_organization_market_segments_id_fk" FOREIGN KEY ("market_segment_layer2_id") REFERENCES "public"."crm_organization_market_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_organizations" ADD CONSTRAINT "crm_organizations_market_segment_layer3_id_crm_organization_market_segments_id_fk" FOREIGN KEY ("market_segment_layer3_id") REFERENCES "public"."crm_organization_market_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_relationship_types" ADD CONSTRAINT "crm_relationship_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_relationship_types" ADD CONSTRAINT "crm_relationship_types_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_relationships" ADD CONSTRAINT "crm_relationships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_relationships" ADD CONSTRAINT "crm_relationships_relationship_type_id_crm_relationship_types_id_fk" FOREIGN KEY ("relationship_type_id") REFERENCES "public"."crm_relationship_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_search_tokens" ADD CONSTRAINT "field_search_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_audit_events" ADD CONSTRAINT "invoicing_audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_audit_events" ADD CONSTRAINT "invoicing_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_catalog_items" ADD CONSTRAINT "invoicing_catalog_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_catalog_items" ADD CONSTRAINT "invoicing_catalog_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_catalog_items" ADD CONSTRAINT "invoicing_catalog_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_line_items" ADD CONSTRAINT "invoicing_invoice_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_line_items" ADD CONSTRAINT "invoicing_invoice_line_items_invoice_id_invoicing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoicing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_line_items" ADD CONSTRAINT "invoicing_invoice_line_items_catalog_item_id_invoicing_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."invoicing_catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_payments" ADD CONSTRAINT "invoicing_invoice_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_payments" ADD CONSTRAINT "invoicing_invoice_payments_invoice_id_invoicing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoicing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_payments" ADD CONSTRAINT "invoicing_invoice_payments_revised_invoice_id_invoicing_invoices_id_fk" FOREIGN KEY ("revised_invoice_id") REFERENCES "public"."invoicing_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoice_payments" ADD CONSTRAINT "invoicing_invoice_payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoices" ADD CONSTRAINT "invoicing_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoices" ADD CONSTRAINT "invoicing_invoices_source_quote_id_invoicing_quotes_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."invoicing_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoices" ADD CONSTRAINT "invoicing_invoices_source_offer_id_invoicing_offers_id_fk" FOREIGN KEY ("source_offer_id") REFERENCES "public"."invoicing_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoices" ADD CONSTRAINT "invoicing_invoices_source_invoice_id_invoicing_invoices_id_fk" FOREIGN KEY ("source_invoice_id") REFERENCES "public"."invoicing_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoices" ADD CONSTRAINT "invoicing_invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_invoices" ADD CONSTRAINT "invoicing_invoices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_number_sequences" ADD CONSTRAINT "invoicing_number_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offer_line_items" ADD CONSTRAINT "invoicing_offer_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offer_line_items" ADD CONSTRAINT "invoicing_offer_line_items_offer_id_invoicing_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."invoicing_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offer_line_items" ADD CONSTRAINT "invoicing_offer_line_items_catalog_item_id_invoicing_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."invoicing_catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offer_response_tokens" ADD CONSTRAINT "invoicing_offer_response_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offer_response_tokens" ADD CONSTRAINT "invoicing_offer_response_tokens_offer_id_invoicing_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."invoicing_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offers" ADD CONSTRAINT "invoicing_offers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offers" ADD CONSTRAINT "invoicing_offers_source_quote_id_invoicing_quotes_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."invoicing_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offers" ADD CONSTRAINT "invoicing_offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_offers" ADD CONSTRAINT "invoicing_offers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_payment_reminders" ADD CONSTRAINT "invoicing_payment_reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_payment_reminders" ADD CONSTRAINT "invoicing_payment_reminders_invoice_id_invoicing_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoicing_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_quote_line_items" ADD CONSTRAINT "invoicing_quote_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_quote_line_items" ADD CONSTRAINT "invoicing_quote_line_items_quote_id_invoicing_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."invoicing_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_quote_line_items" ADD CONSTRAINT "invoicing_quote_line_items_catalog_item_id_invoicing_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."invoicing_catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_quotes" ADD CONSTRAINT "invoicing_quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_quotes" ADD CONSTRAINT "invoicing_quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_quotes" ADD CONSTRAINT "invoicing_quotes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoicing_tenant_configuration" ADD CONSTRAINT "invoicing_tenant_configuration_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_account_members" ADD CONSTRAINT "mailbox_account_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_account_members" ADD CONSTRAINT "mailbox_account_members_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_account_members" ADD CONSTRAINT "mailbox_account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_mailbox_inbox_id_mailbox_inboxes_id_fk" FOREIGN KEY ("mailbox_inbox_id") REFERENCES "public"."mailbox_inboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_owner_employee_id_workforce_employees_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_attachments" ADD CONSTRAINT "mailbox_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_attachments" ADD CONSTRAINT "mailbox_attachments_message_id_mailbox_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mailbox_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_calendar_events" ADD CONSTRAINT "mailbox_calendar_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_calendar_events" ADD CONSTRAINT "mailbox_calendar_events_calendar_id_mailbox_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."mailbox_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_calendar_events" ADD CONSTRAINT "mailbox_calendar_events_source_message_id_mailbox_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."mailbox_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_calendars" ADD CONSTRAINT "mailbox_calendars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_calendars" ADD CONSTRAINT "mailbox_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_calendars" ADD CONSTRAINT "mailbox_calendars_mailbox_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("mailbox_account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_event_attendees" ADD CONSTRAINT "mailbox_event_attendees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_event_attendees" ADD CONSTRAINT "mailbox_event_attendees_event_id_mailbox_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."mailbox_calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_inboxes" ADD CONSTRAINT "mailbox_inboxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_inboxes" ADD CONSTRAINT "mailbox_inboxes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_inboxes" ADD CONSTRAINT "mailbox_inboxes_owner_employee_id_workforce_employees_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_messages" ADD CONSTRAINT "mailbox_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_messages" ADD CONSTRAINT "mailbox_messages_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_messages" ADD CONSTRAINT "mailbox_messages_thread_id_mailbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mailbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_messages" ADD CONSTRAINT "mailbox_messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_threads" ADD CONSTRAINT "mailbox_threads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_threads" ADD CONSTRAINT "mailbox_threads_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_otp_challenges" ADD CONSTRAINT "mfa_otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payments" ADD CONSTRAINT "platform_subscription_payments_plan_id_platform_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payments" ADD CONSTRAINT "platform_subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payments" ADD CONSTRAINT "platform_subscription_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payments" ADD CONSTRAINT "platform_subscription_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_plan_audit_log" ADD CONSTRAINT "platform_subscription_plan_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_device_id_user_devices_id_fk" FOREIGN KEY ("user_device_id") REFERENCES "public"."user_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_activities" ADD CONSTRAINT "sales_funnel_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_bdr_leads" ADD CONSTRAINT "sales_funnel_bdr_leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_bdr_leads" ADD CONSTRAINT "sales_funnel_bdr_leads_crm_organization_id_crm_organizations_id_fk" FOREIGN KEY ("crm_organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_contact_roles" ADD CONSTRAINT "sales_funnel_contact_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_deal_contacts" ADD CONSTRAINT "sales_funnel_deal_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_deal_contacts" ADD CONSTRAINT "sales_funnel_deal_contacts_deal_id_sales_funnel_sales_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."sales_funnel_sales_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_deal_contacts" ADD CONSTRAINT "sales_funnel_deal_contacts_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_lead_contacts" ADD CONSTRAINT "sales_funnel_lead_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_lead_contacts" ADD CONSTRAINT "sales_funnel_lead_contacts_lead_id_sales_funnel_bdr_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_funnel_bdr_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_lead_contacts" ADD CONSTRAINT "sales_funnel_lead_contacts_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_sales_deals" ADD CONSTRAINT "sales_funnel_sales_deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_sales_deals" ADD CONSTRAINT "sales_funnel_sales_deals_crm_organization_id_crm_organizations_id_fk" FOREIGN KEY ("crm_organization_id") REFERENCES "public"."crm_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_sales_deals" ADD CONSTRAINT "sales_funnel_sales_deals_promoted_from_lead_id_sales_funnel_bdr_leads_id_fk" FOREIGN KEY ("promoted_from_lead_id") REFERENCES "public"."sales_funnel_bdr_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_funnel_stages" ADD CONSTRAINT "sales_funnel_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_platform_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_platform_subscription_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."platform_subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_smtp_settings" ADD CONSTRAINT "tenant_smtp_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_user_module_roles" ADD CONSTRAINT "tenant_user_module_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_user_module_roles" ADD CONSTRAINT "tenant_user_module_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_employee_documents" ADD CONSTRAINT "workforce_employee_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_employee_documents" ADD CONSTRAINT "workforce_employee_documents_employee_id_workforce_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_employees" ADD CONSTRAINT "workforce_employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_employees" ADD CONSTRAINT "workforce_employees_employment_org_unit_id_workforce_org_units_id_fk" FOREIGN KEY ("employment_org_unit_id") REFERENCES "public"."workforce_org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_org_units" ADD CONSTRAINT "workforce_org_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_org_units" ADD CONSTRAINT "workforce_org_units_parent_org_unit_id_workforce_org_units_id_fk" FOREIGN KEY ("parent_org_unit_id") REFERENCES "public"."workforce_org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_org_units" ADD CONSTRAINT "workforce_org_units_assigned_employee_id_workforce_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_cache_entries_expires_idx" ON "app_cache_entries" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "background_jobs_queue_status_run_priority_idx" ON "background_jobs" USING btree ("queue_name","status","run_at","priority");--> statement-breakpoint
CREATE INDEX "background_jobs_purge_after_idx" ON "background_jobs" USING btree ("purge_after");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_queue_dedupe_unique" ON "background_jobs" USING btree ("queue_name","dedupe_key");--> statement-breakpoint
CREATE INDEX "company_subscription_plans_provider_idx" ON "company_subscription_plans" USING btree ("tenant_id","provider_id");--> statement-breakpoint
CREATE INDEX "company_subscription_provider_documents_provider_idx" ON "company_subscription_provider_documents" USING btree ("tenant_id","provider_id");--> statement-breakpoint
CREATE INDEX "company_subscription_providers_tenant_status_idx" ON "company_subscription_providers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "company_subscription_providers_tenant_renewal_idx" ON "company_subscription_providers" USING btree ("tenant_id","renewal_date");--> statement-breakpoint
CREATE INDEX "company_subscription_seats_plan_idx" ON "company_subscription_seats" USING btree ("tenant_id","plan_id");--> statement-breakpoint
CREATE INDEX "crm_activities_entity_idx" ON "crm_activities" USING btree ("tenant_id","related_entity_kind","related_entity_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_activities_type_idx" ON "crm_activities" USING btree ("tenant_id","activity_type");--> statement-breakpoint
CREATE INDEX "crm_contacts_tenant_idx" ON "crm_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "crm_org_market_segments_tenant_parent_idx" ON "crm_organization_market_segments" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "crm_org_marketing_tag_links_tag_idx" ON "crm_organization_marketing_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_org_marketing_tags_tenant_name_uidx" ON "crm_organization_marketing_tags" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "crm_organizations_tenant_idx" ON "crm_organizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "crm_organizations_market_segment_l1_idx" ON "crm_organizations" USING btree ("tenant_id","market_segment_layer1_id");--> statement-breakpoint
CREATE INDEX "crm_organizations_market_segment_l2_idx" ON "crm_organizations" USING btree ("tenant_id","market_segment_layer2_id");--> statement-breakpoint
CREATE INDEX "crm_organizations_market_segment_l3_idx" ON "crm_organizations" USING btree ("tenant_id","market_segment_layer3_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_relationship_types_tenant_name_src_tgt_uidx" ON "crm_relationship_types" USING btree ("tenant_id","name","source_entity_kind","target_entity_kind");--> statement-breakpoint
CREATE INDEX "crm_relationships_src_idx" ON "crm_relationships" USING btree ("tenant_id","source_entity_kind","source_id");--> statement-breakpoint
CREATE INDEX "crm_relationships_tgt_idx" ON "crm_relationships" USING btree ("tenant_id","target_entity_kind","target_id");--> statement-breakpoint
CREATE INDEX "email_otp_challenges_subject_purpose_idx" ON "email_otp_challenges" USING btree ("subject_key","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "field_search_tokens_unique" ON "field_search_tokens" USING btree ("tenant_id","entity_table","entity_id","field_name","token_hash");--> statement-breakpoint
CREATE INDEX "field_search_tokens_lookup_idx" ON "field_search_tokens" USING btree ("tenant_id","entity_table","field_name","token_hash");--> statement-breakpoint
CREATE INDEX "invoicing_audit_events_tenant_doc_idx" ON "invoicing_audit_events" USING btree ("tenant_id","document_kind","document_id","created_at");--> statement-breakpoint
CREATE INDEX "invoicing_catalog_items_tenant_active_idx" ON "invoicing_catalog_items" USING btree ("tenant_id","is_active","name");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_line_items_invoice_idx" ON "invoicing_invoice_line_items" USING btree ("invoice_id","sort_order");--> statement-breakpoint
CREATE INDEX "invoicing_invoice_payments_invoice_idx" ON "invoicing_invoice_payments" USING btree ("tenant_id","invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "invoicing_invoices_tenant_status_idx" ON "invoicing_invoices" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "invoicing_invoices_due_date_idx" ON "invoicing_invoices" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoicing_invoices_source_offer_idx" ON "invoicing_invoices" USING btree ("source_offer_id");--> statement-breakpoint
CREATE INDEX "invoicing_invoices_source_invoice_idx" ON "invoicing_invoices" USING btree ("source_invoice_id");--> statement-breakpoint
CREATE INDEX "invoicing_offer_line_items_offer_idx" ON "invoicing_offer_line_items" USING btree ("offer_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "invoicing_offer_response_tokens_offer_unique" ON "invoicing_offer_response_tokens" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoicing_offer_response_tokens_hash_unique" ON "invoicing_offer_response_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invoicing_offers_tenant_status_idx" ON "invoicing_offers" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "invoicing_offers_source_quote_idx" ON "invoicing_offers" USING btree ("source_quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoicing_payment_reminders_invoice_kind_unique" ON "invoicing_payment_reminders" USING btree ("tenant_id","invoice_id","reminder_kind");--> statement-breakpoint
CREATE INDEX "invoicing_quote_line_items_quote_idx" ON "invoicing_quote_line_items" USING btree ("quote_id","sort_order");--> statement-breakpoint
CREATE INDEX "invoicing_quotes_tenant_status_idx" ON "invoicing_quotes" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "invoicing_quotes_tenant_number_idx" ON "invoicing_quotes" USING btree ("tenant_id","document_number");--> statement-breakpoint
CREATE INDEX "invoicing_quotes_source_offer_idx" ON "invoicing_quotes" USING btree ("source_offer_id");--> statement-breakpoint
CREATE INDEX "invoicing_quotes_source_invoice_idx" ON "invoicing_quotes" USING btree ("source_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_account_members_account_user_uq" ON "mailbox_account_members" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE INDEX "mailbox_account_members_user_idx" ON "mailbox_account_members" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "mailbox_accounts_tenant_owner_idx" ON "mailbox_accounts" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "mailbox_accounts_tenant_scope_idx" ON "mailbox_accounts" USING btree ("tenant_id","owner_scope");--> statement-breakpoint
CREATE INDEX "mailbox_accounts_tenant_employee_idx" ON "mailbox_accounts" USING btree ("tenant_id","owner_employee_id");--> statement-breakpoint
CREATE INDEX "mailbox_accounts_inbox_idx" ON "mailbox_accounts" USING btree ("tenant_id","mailbox_inbox_id");--> statement-breakpoint
CREATE INDEX "mailbox_attachments_message_idx" ON "mailbox_attachments" USING btree ("tenant_id","message_id");--> statement-breakpoint
CREATE INDEX "mailbox_calendar_events_calendar_idx" ON "mailbox_calendar_events" USING btree ("tenant_id","calendar_id","starts_at");--> statement-breakpoint
CREATE INDEX "mailbox_calendars_user_idx" ON "mailbox_calendars" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "mailbox_calendars_account_idx" ON "mailbox_calendars" USING btree ("tenant_id","mailbox_account_id");--> statement-breakpoint
CREATE INDEX "mailbox_event_attendees_event_idx" ON "mailbox_event_attendees" USING btree ("tenant_id","event_id");--> statement-breakpoint
CREATE INDEX "mailbox_inboxes_tenant_owner_idx" ON "mailbox_inboxes" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "mailbox_inboxes_tenant_scope_idx" ON "mailbox_inboxes" USING btree ("tenant_id","owner_scope");--> statement-breakpoint
CREATE INDEX "mailbox_inboxes_tenant_employee_idx" ON "mailbox_inboxes" USING btree ("tenant_id","owner_employee_id");--> statement-breakpoint
CREATE INDEX "mailbox_messages_thread_idx" ON "mailbox_messages" USING btree ("tenant_id","thread_id","received_at");--> statement-breakpoint
CREATE INDEX "mailbox_messages_account_received_idx" ON "mailbox_messages" USING btree ("tenant_id","account_id","received_at");--> statement-breakpoint
CREATE INDEX "mailbox_threads_account_folder_idx" ON "mailbox_threads" USING btree ("tenant_id","account_id","folder","last_message_at");--> statement-breakpoint
CREATE INDEX "mailbox_threads_provider_thread_idx" ON "mailbox_threads" USING btree ("account_id","provider_thread_id");--> statement-breakpoint
CREATE INDEX "mfa_otp_challenges_user_purpose_idx" ON "mfa_otp_challenges" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_email_templates_key_uidx" ON "platform_email_templates" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "platform_subscription_payments_status_idx" ON "platform_subscription_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_subscription_payments_tenant_idx" ON "platform_subscription_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "platform_subscription_payments_subscription_idx" ON "platform_subscription_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "platform_subscription_payments_psp_pi_idx" ON "platform_subscription_payments" USING btree ("psp_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscription_payments_sub_period_unique" ON "platform_subscription_payments" USING btree ("subscription_id","period_start_utc");--> statement-breakpoint
CREATE INDEX "platform_subscription_plan_audit_log_created_idx" ON "platform_subscription_plan_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_uidx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sales_funnel_activities_entity_idx" ON "sales_funnel_activities" USING btree ("tenant_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_funnel_bdr_leads_crm_org_idx" ON "sales_funnel_bdr_leads" USING btree ("tenant_id","crm_organization_id");--> statement-breakpoint
CREATE INDEX "sales_funnel_bdr_leads_tenant_stage_idx" ON "sales_funnel_bdr_leads" USING btree ("tenant_id","stage_key","updated_at");--> statement-breakpoint
CREATE INDEX "sales_funnel_bdr_leads_tenant_owner_idx" ON "sales_funnel_bdr_leads" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "sales_funnel_bdr_leads_tenant_active_idx" ON "sales_funnel_bdr_leads" USING btree ("tenant_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_funnel_contact_roles_tenant_label_uidx" ON "sales_funnel_contact_roles" USING btree ("tenant_id","label");--> statement-breakpoint
CREATE INDEX "sales_funnel_contact_roles_tenant_sort_idx" ON "sales_funnel_contact_roles" USING btree ("tenant_id","sort_order","label");--> statement-breakpoint
CREATE INDEX "sales_funnel_deal_contacts_contact_idx" ON "sales_funnel_deal_contacts" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "sales_funnel_lead_contacts_contact_idx" ON "sales_funnel_lead_contacts" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "sales_funnel_sales_deals_crm_org_idx" ON "sales_funnel_sales_deals" USING btree ("tenant_id","crm_organization_id");--> statement-breakpoint
CREATE INDEX "sales_funnel_sales_deals_tenant_stage_idx" ON "sales_funnel_sales_deals" USING btree ("tenant_id","stage_key","updated_at");--> statement-breakpoint
CREATE INDEX "sales_funnel_sales_deals_tenant_owner_idx" ON "sales_funnel_sales_deals" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "sales_funnel_sales_deals_tenant_active_idx" ON "sales_funnel_sales_deals" USING btree ("tenant_id","archived_at");--> statement-breakpoint
CREATE INDEX "sales_funnel_sales_deals_promoted_idx" ON "sales_funnel_sales_deals" USING btree ("tenant_id","promoted_from_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_funnel_stages_tenant_pipeline_key_uidx" ON "sales_funnel_stages" USING btree ("tenant_id","pipeline","stage_key");--> statement-breakpoint
CREATE INDEX "sales_funnel_stages_tenant_pipeline_sort_idx" ON "sales_funnel_stages" USING btree ("tenant_id","pipeline","sort_order");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_user_idx" ON "subscriptions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_pending_plan_id_idx" ON "subscriptions" USING btree ("pending_plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_psp_customer_id_idx" ON "subscriptions" USING btree ("psp_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_user_module_roles_tenant_user_module_unique" ON "tenant_user_module_roles" USING btree ("tenant_id","user_id","module");--> statement-breakpoint
CREATE INDEX "tenant_user_module_roles_tenant_user_idx" ON "tenant_user_module_roles" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_name_lookup_key_unique" ON "tenants" USING btree ("name_lookup_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_devices_user_install_uidx" ON "user_devices" USING btree ("user_id","install_key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_identity_key_uidx" ON "users" USING btree ("identity_key");--> statement-breakpoint
CREATE INDEX "workforce_employee_documents_employee_idx" ON "workforce_employee_documents" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "workforce_employees_tenant_idx" ON "workforce_employees" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "workforce_employees_employment_org_unit_idx" ON "workforce_employees" USING btree ("tenant_id","employment_org_unit_id");--> statement-breakpoint
CREATE INDEX "workforce_org_units_tenant_idx" ON "workforce_org_units" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_org_units_assigned_employee_uidx" ON "workforce_org_units" USING btree ("assigned_employee_id");