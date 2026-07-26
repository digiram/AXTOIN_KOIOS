CREATE TABLE `app_cache_entries` (
	`namespace` varchar(64) NOT NULL,
	`cache_key` varchar(128) NOT NULL,
	`payload` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_cache_entries_namespace_cache_key_pk` PRIMARY KEY(`namespace`,`cache_key`)
);
--> statement-breakpoint
CREATE TABLE `background_jobs` (
	`id` varchar(36) NOT NULL,
	`queue_name` varchar(128) NOT NULL,
	`job_name` varchar(128) NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` varchar(256),
	`status` varchar(32) NOT NULL DEFAULT 'waiting',
	`priority` int NOT NULL DEFAULT 0,
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`run_at` timestamp NOT NULL,
	`locked_at` timestamp,
	`locked_by` varchar(128),
	`result` text,
	`error` text,
	`processed_at` timestamp,
	`finished_at` timestamp,
	`purge_after` timestamp,
	`completed_retention_sec` int,
	`failed_retention_sec` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `background_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `background_jobs_queue_dedupe_unique` UNIQUE(`queue_name`,`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `company_subscription_plans` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`provider_id` varchar(36) NOT NULL,
	`name` varchar(512) NOT NULL,
	`sku` varchar(256),
	`seat_count` int,
	`amount_minor` bigint,
	`currency_code` varchar(3),
	`cadence_kind` varchar(32) NOT NULL DEFAULT 'monthly',
	`cadence_interval_count` int,
	`cadence_interval_unit` varchar(16),
	`start_date` date,
	`end_date` date,
	`renewal_date` date,
	`auto_renew` boolean NOT NULL DEFAULT false,
	`notes` text,
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_subscription_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_subscription_provider_documents` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`provider_id` varchar(36) NOT NULL,
	`title` varchar(512) NOT NULL,
	`original_filename` varchar(512) NOT NULL,
	`mime_type` varchar(255),
	`storage_rel_path` varchar(512) NOT NULL,
	`byte_size` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_subscription_provider_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_subscription_providers` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(512) NOT NULL,
	`vendor_name` varchar(512),
	`category` varchar(128),
	`description` text,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`subscription_kind` varchar(32) NOT NULL DEFAULT 'singular',
	`owner_employee_id` varchar(36),
	`renewal_date` date,
	`contract_start_date` date,
	`contract_end_date` date,
	`cadence_kind` varchar(32) NOT NULL DEFAULT 'monthly',
	`cadence_interval_count` int,
	`cadence_interval_unit` varchar(16),
	`amount_minor` bigint,
	`currency_code` varchar(3),
	`billing_metadata_json` text NOT NULL,
	`notes` text,
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_subscription_providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_subscription_seats` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`plan_id` varchar(36) NOT NULL,
	`employee_id` varchar(36),
	`display_name` varchar(512),
	`email` text,
	`seat_type` varchar(128),
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`start_date` date,
	`end_date` date,
	`notes` text,
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_subscription_seats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_activities` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`activity_type` varchar(32) NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`related_entity_id` varchar(36) NOT NULL,
	`related_entity_kind` varchar(32) NOT NULL,
	`scheduled_at` timestamp,
	`direction` varchar(16),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`salutation` text,
	`title` text,
	`email` text,
	`phone` text,
	`emails_json` varchar(8000) NOT NULL DEFAULT '[]',
	`phones_json` varchar(8000) NOT NULL DEFAULT '[]',
	`addresses_json` varchar(8000) NOT NULL DEFAULT '[]',
	`address_line1` text,
	`address_line2` text,
	`postal_code` text,
	`city` text,
	`state` text,
	`country` text,
	`photo_rel_path` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_organization_market_segments` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`layer` int NOT NULL,
	`parent_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_organization_market_segments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_organization_marketing_tag_links` (
	`organization_id` varchar(36) NOT NULL,
	`tag_id` varchar(36) NOT NULL,
	CONSTRAINT `crm_organization_marketing_tag_links_organization_id_tag_id_pk` PRIMARY KEY(`organization_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `crm_organization_marketing_tags` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(64) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_organization_marketing_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_org_marketing_tags_tenant_name_uidx` UNIQUE(`tenant_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `crm_organizations` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`emails_json` text NOT NULL DEFAULT ('[]'),
	`phones_json` text NOT NULL DEFAULT ('[]'),
	`addresses_json` text NOT NULL DEFAULT ('[]'),
	`address_line1` text,
	`address_line2` text,
	`postal_code` text,
	`city` text,
	`state` text,
	`country` text,
	`market_segment_layer1_id` varchar(36),
	`market_segment_layer2_id` varchar(36),
	`market_segment_layer3_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_relationship_types` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`reverse_name` varchar(255) NOT NULL,
	`source_entity_kind` varchar(32) NOT NULL,
	`target_entity_kind` varchar(32) NOT NULL,
	`is_system` boolean NOT NULL DEFAULT false,
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`relationship_usage_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `crm_relationship_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_relationship_types_tenant_name_src_tgt_uidx` UNIQUE(`tenant_id`,`name`,`source_entity_kind`,`target_entity_kind`)
);
--> statement-breakpoint
CREATE TABLE `crm_relationships` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`relationship_type_id` varchar(36) NOT NULL,
	`source_id` varchar(36) NOT NULL,
	`source_entity_kind` varchar(32) NOT NULL,
	`target_id` varchar(36) NOT NULL,
	`target_entity_kind` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_relationships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_otp_challenges` (
	`id` varchar(36) NOT NULL,
	`subject_key` varchar(320) NOT NULL,
	`purpose` varchar(32) NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_otp_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `field_search_tokens` (
	`tenant_id` varchar(36),
	`entity_table` varchar(64) NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	`field_name` varchar(64) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	CONSTRAINT `field_search_tokens_unique` UNIQUE(`tenant_id`,`entity_table`,`entity_id`,`field_name`,`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_audit_events` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`event_kind` varchar(64) NOT NULL,
	`document_kind` varchar(16) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`actor_user_id` varchar(36),
	`payload_json` text NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoicing_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_catalog_items` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`item_kind` varchar(16) NOT NULL DEFAULT 'service',
	`sku` varchar(64),
	`name` varchar(512) NOT NULL,
	`description` text NOT NULL DEFAULT (''),
	`unit_label` varchar(32) NOT NULL DEFAULT 'unit',
	`unit_price_minor` bigint NOT NULL DEFAULT 0,
	`currency_code` varchar(3) NOT NULL DEFAULT 'USD',
	`tax_rate_bps` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_catalog_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_invoice_line_items` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`catalog_item_id` varchar(36),
	`line_kind` varchar(16) NOT NULL DEFAULT 'manual',
	`description` text NOT NULL DEFAULT (''),
	`sku` varchar(64),
	`quantity` decimal(18,6) NOT NULL DEFAULT '1',
	`unit_label` varchar(32) NOT NULL DEFAULT 'unit',
	`unit_price_minor` bigint NOT NULL DEFAULT 0,
	`discount_minor` bigint NOT NULL DEFAULT 0,
	`tax_rate_bps` int,
	`line_subtotal_minor` bigint NOT NULL DEFAULT 0,
	`line_tax_minor` bigint NOT NULL DEFAULT 0,
	`line_total_minor` bigint NOT NULL DEFAULT 0,
	`snapshot_json` text NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_invoice_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_invoice_payments` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`amount_minor` bigint NOT NULL,
	`payment_date` date NOT NULL,
	`reference` varchar(128),
	`note` text NOT NULL DEFAULT (''),
	`revised_invoice_id` varchar(36),
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoicing_invoice_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_invoices` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'invoice_draft',
	`document_number` varchar(64) NOT NULL,
	`revision` varchar(32),
	`source_quote_id` varchar(36),
	`source_offer_id` varchar(36),
	`source_invoice_id` varchar(36),
	`crm_organization_id` varchar(36),
	`crm_contact_id` varchar(36),
	`customer_snapshot_json` text NOT NULL DEFAULT ('{}'),
	`issuer_snapshot_json` text NOT NULL DEFAULT ('{}'),
	`currency_code` varchar(3) NOT NULL,
	`document_date` date NOT NULL,
	`invoice_date` date,
	`service_delivery_date` date,
	`payment_term_days` int,
	`due_date` date,
	`partial_payment_anchor_date` date,
	`subtotal_excluding_tax_minor` bigint NOT NULL DEFAULT 0,
	`discount_total_minor` bigint NOT NULL DEFAULT 0,
	`tax_total_minor` bigint NOT NULL DEFAULT 0,
	`total_including_tax_minor` bigint NOT NULL DEFAULT 0,
	`tax_breakdown_json` text NOT NULL DEFAULT ('[]'),
	`notes` text NOT NULL DEFAULT (''),
	`internal_notes` text NOT NULL DEFAULT (''),
	`terms_text` text NOT NULL DEFAULT (''),
	`footer_text` text NOT NULL DEFAULT (''),
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`archived_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`finalized_at` timestamp,
	CONSTRAINT `invoicing_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_number_sequences` (
	`tenant_id` varchar(36) NOT NULL,
	`document_kind` varchar(16) NOT NULL,
	`sequence_year` int NOT NULL DEFAULT 0,
	`next_value` int NOT NULL DEFAULT 1,
	CONSTRAINT `invoicing_number_sequences_tenant_id_document_kind_sequence_year_pk` PRIMARY KEY(`tenant_id`,`document_kind`,`sequence_year`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_offer_line_items` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`offer_id` varchar(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`catalog_item_id` varchar(36),
	`line_kind` varchar(16) NOT NULL DEFAULT 'manual',
	`description` text NOT NULL DEFAULT (''),
	`sku` varchar(64),
	`quantity` decimal(18,6) NOT NULL DEFAULT '1',
	`unit_label` varchar(32) NOT NULL DEFAULT 'unit',
	`unit_price_minor` bigint NOT NULL DEFAULT 0,
	`discount_minor` bigint NOT NULL DEFAULT 0,
	`tax_rate_bps` int,
	`line_subtotal_minor` bigint NOT NULL DEFAULT 0,
	`line_tax_minor` bigint NOT NULL DEFAULT 0,
	`line_total_minor` bigint NOT NULL DEFAULT 0,
	`snapshot_json` text NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_offer_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_offer_response_tokens` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`offer_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_offer_response_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoicing_offer_response_tokens_offer_unique` UNIQUE(`offer_id`),
	CONSTRAINT `invoicing_offer_response_tokens_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_offers` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'offer_draft',
	`document_number` varchar(64) NOT NULL,
	`revision` varchar(32),
	`source_quote_id` varchar(36),
	`crm_organization_id` varchar(36),
	`crm_contact_id` varchar(36),
	`customer_snapshot_json` text NOT NULL DEFAULT ('{}'),
	`issuer_snapshot_json` text NOT NULL DEFAULT ('{}'),
	`currency_code` varchar(3) NOT NULL,
	`document_date` date NOT NULL,
	`offer_expiry_date` date,
	`payment_term_days` int,
	`subtotal_excluding_tax_minor` bigint NOT NULL DEFAULT 0,
	`discount_total_minor` bigint NOT NULL DEFAULT 0,
	`tax_total_minor` bigint NOT NULL DEFAULT 0,
	`total_including_tax_minor` bigint NOT NULL DEFAULT 0,
	`tax_breakdown_json` text NOT NULL DEFAULT ('[]'),
	`notes` text NOT NULL DEFAULT (''),
	`internal_notes` text NOT NULL DEFAULT (''),
	`terms_text` text NOT NULL DEFAULT (''),
	`footer_text` text NOT NULL DEFAULT (''),
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`archived_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_payment_reminders` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`reminder_kind` varchar(16) NOT NULL,
	`recipient_email` varchar(320) NOT NULL,
	`sent_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoicing_payment_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoicing_payment_reminders_invoice_kind_unique` UNIQUE(`tenant_id`,`invoice_id`,`reminder_kind`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_quote_line_items` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`quote_id` varchar(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`catalog_item_id` varchar(36),
	`line_kind` varchar(16) NOT NULL DEFAULT 'manual',
	`description` text NOT NULL DEFAULT (''),
	`sku` varchar(64),
	`quantity` decimal(18,6) NOT NULL DEFAULT '1',
	`unit_label` varchar(32) NOT NULL DEFAULT 'unit',
	`unit_price_minor` bigint NOT NULL DEFAULT 0,
	`discount_minor` bigint NOT NULL DEFAULT 0,
	`tax_rate_bps` int,
	`line_subtotal_minor` bigint NOT NULL DEFAULT 0,
	`line_tax_minor` bigint NOT NULL DEFAULT 0,
	`line_total_minor` bigint NOT NULL DEFAULT 0,
	`snapshot_json` text NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_quote_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_quotes` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'quote_draft',
	`document_number` varchar(64),
	`temporary_reference` varchar(64),
	`source_offer_id` varchar(36),
	`source_invoice_id` varchar(36),
	`crm_organization_id` varchar(36),
	`crm_contact_id` varchar(36),
	`customer_snapshot_json` text NOT NULL DEFAULT ('{}'),
	`issuer_snapshot_json` text NOT NULL DEFAULT ('{}'),
	`currency_code` varchar(3) NOT NULL,
	`document_date` date NOT NULL,
	`quote_expiry_date` date,
	`payment_term_days` int,
	`subtotal_excluding_tax_minor` bigint NOT NULL DEFAULT 0,
	`discount_total_minor` bigint NOT NULL DEFAULT 0,
	`tax_total_minor` bigint NOT NULL DEFAULT 0,
	`total_including_tax_minor` bigint NOT NULL DEFAULT 0,
	`tax_breakdown_json` text NOT NULL DEFAULT ('[]'),
	`notes` text NOT NULL DEFAULT (''),
	`internal_notes` text NOT NULL DEFAULT (''),
	`terms_text` text NOT NULL DEFAULT (''),
	`footer_text` text NOT NULL DEFAULT (''),
	`created_by_user_id` varchar(36),
	`updated_by_user_id` varchar(36),
	`archived_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicing_tenant_configuration` (
	`tenant_id` varchar(36) NOT NULL,
	`quote_number_prefix` varchar(16) NOT NULL DEFAULT 'QUO',
	`offer_number_prefix` varchar(16) NOT NULL DEFAULT 'OFF',
	`invoice_number_prefix` varchar(16) NOT NULL DEFAULT 'INV',
	`quote_sequence_year` int,
	`offer_sequence_year` int,
	`invoice_sequence_year` int,
	`quote_sequence_current` int NOT NULL DEFAULT 0,
	`offer_sequence_current` int NOT NULL DEFAULT 0,
	`invoice_sequence_current` int NOT NULL DEFAULT 0,
	`number_padding` int NOT NULL DEFAULT 4,
	`yearly_reset` boolean NOT NULL DEFAULT true,
	`allow_direct_quote_to_invoice` boolean NOT NULL DEFAULT false,
	`require_quote_expiry_date` boolean NOT NULL DEFAULT false,
	`allow_customer_facing_quotes` boolean NOT NULL DEFAULT true,
	`default_quote_validity_days` int,
	`default_payment_term_days` int DEFAULT 30,
	`payment_reminder_first_offset_days` int NOT NULL DEFAULT 0,
	`payment_reminder_second_offset_days` int NOT NULL DEFAULT 7,
	`payment_reminders_enabled` boolean NOT NULL DEFAULT true,
	`email_moments_enabled_json` text NOT NULL DEFAULT ('{}'),
	`auto_expire_offers_enabled` boolean NOT NULL DEFAULT true,
	`quote_expiry_warnings_enabled` boolean NOT NULL DEFAULT true,
	`allow_manual_line_items` boolean NOT NULL DEFAULT true,
	`allow_discounts` boolean NOT NULL DEFAULT true,
	`issuer_snapshot_json` text NOT NULL DEFAULT ('{}'),
	`tax_rate_options_json` text NOT NULL DEFAULT ('[]'),
	`default_quote_terms_text` text NOT NULL DEFAULT (''),
	`default_offer_terms_text` text NOT NULL DEFAULT (''),
	`default_invoice_terms_text` text NOT NULL DEFAULT (''),
	`default_footer_text` text NOT NULL DEFAULT (''),
	`document_theme_color` varchar(32) NOT NULL DEFAULT 'purple',
	`company_logo_rel_path` varchar(512),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoicing_tenant_configuration_tenant_id` PRIMARY KEY(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_account_members` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` varchar(32) NOT NULL DEFAULT 'viewer',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_account_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `mailbox_account_members_account_user_uq` UNIQUE(`account_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_accounts` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`mailbox_inbox_id` varchar(36) NOT NULL,
	`owner_scope` varchar(32) NOT NULL DEFAULT 'user',
	`owner_user_id` varchar(36),
	`owner_employee_id` varchar(36),
	`display_name` text NOT NULL DEFAULT (''),
	`email_address` text NOT NULL DEFAULT (''),
	`provider` varchar(32) NOT NULL DEFAULT 'internal',
	`imap_host` varchar(255),
	`imap_port` int,
	`imap_secure` boolean NOT NULL DEFAULT true,
	`smtp_host` varchar(255),
	`smtp_port` int,
	`smtp_secure` boolean NOT NULL DEFAULT true,
	`username` varchar(512),
	`credentials_encrypted` text,
	`oauth_refresh_token_encrypted` text,
	`oauth_access_token_encrypted` text,
	`oauth_access_token_expires_at` timestamp,
	`sync_cursor` text,
	`sync_status` varchar(32) NOT NULL DEFAULT 'idle',
	`sync_error` text,
	`last_synced_at` timestamp,
	`webhook_subscription_id` varchar(512),
	`color` varchar(32) NOT NULL DEFAULT '#6366f1',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_attachments` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`message_id` varchar(36) NOT NULL,
	`filename` varchar(512) NOT NULL DEFAULT 'attachment',
	`mime_type` varchar(255) NOT NULL DEFAULT 'application/octet-stream',
	`size_bytes` bigint NOT NULL DEFAULT 0,
	`blob_path` varchar(1024) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_calendar_events` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`calendar_id` varchar(36) NOT NULL,
	`title` varchar(1024) NOT NULL DEFAULT '',
	`description` text,
	`location` varchar(1024),
	`starts_at` timestamp NOT NULL,
	`ends_at` timestamp NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`all_day` boolean NOT NULL DEFAULT false,
	`status` varchar(32) NOT NULL DEFAULT 'confirmed',
	`organizer_json` text NOT NULL,
	`source_message_id` varchar(36),
	`provider_event_id` varchar(512),
	`ics_uid` varchar(512),
	`ics_sequence` int NOT NULL DEFAULT 0,
	`recurrence_json` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_calendar_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_calendars` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`mailbox_account_id` varchar(36),
	`name` varchar(255) NOT NULL DEFAULT 'Calendar',
	`color` varchar(32) NOT NULL DEFAULT '#3b82f6',
	`is_primary` boolean NOT NULL DEFAULT false,
	`source` varchar(32) NOT NULL DEFAULT 'native',
	`provider_calendar_id` varchar(512),
	`sync_cursor` text,
	`sync_status` varchar(32) NOT NULL DEFAULT 'idle',
	`sync_error` text,
	`last_synced_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_calendars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_event_attendees` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`display_name` varchar(512),
	`response` varchar(32) NOT NULL DEFAULT 'needs_action',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_event_attendees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_inboxes` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`owner_scope` varchar(32) NOT NULL DEFAULT 'user',
	`owner_user_id` varchar(36),
	`owner_employee_id` varchar(36),
	`display_name` varchar(255) NOT NULL DEFAULT '',
	`color` varchar(32) NOT NULL DEFAULT '#6366f1',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_inboxes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_messages` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`thread_id` varchar(36) NOT NULL,
	`provider_message_id` varchar(512),
	`direction` varchar(16) NOT NULL DEFAULT 'inbound',
	`from_json` text NOT NULL,
	`to_json` text NOT NULL,
	`cc_json` text NOT NULL,
	`bcc_json` text NOT NULL,
	`subject` text NOT NULL DEFAULT (''),
	`snippet` text NOT NULL,
	`body_text` text,
	`body_html` text,
	`headers_json` text,
	`message_id` varchar(512),
	`in_reply_to` varchar(512),
	`references_header` text,
	`internal_source` varchar(64),
	`action_url` varchar(2048),
	`related_entity_kind` varchar(64),
	`related_entity_id` varchar(36),
	`received_at` timestamp NOT NULL DEFAULT (now()),
	`is_read` boolean NOT NULL DEFAULT false,
	`is_draft` boolean NOT NULL DEFAULT false,
	`has_attachments` boolean NOT NULL DEFAULT false,
	`has_calendar_invite` boolean NOT NULL DEFAULT false,
	`sent_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailbox_threads` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`provider_thread_id` varchar(512),
	`subject_normalized` text NOT NULL DEFAULT (''),
	`snippet` text NOT NULL,
	`folder` varchar(64) NOT NULL DEFAULT 'inbox',
	`previous_folder` varchar(64),
	`last_message_at` timestamp NOT NULL DEFAULT (now()),
	`unread_count` int NOT NULL DEFAULT 0,
	`is_starred` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailbox_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mfa_otp_challenges` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`purpose` varchar(32) NOT NULL,
	`code_hash` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mfa_otp_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_email_templates` (
	`id` varchar(36) NOT NULL,
	`template_key` varchar(64) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`subject` varchar(512),
	`body_html` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_email_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_email_templates_key_uidx` UNIQUE(`template_key`)
);
--> statement-breakpoint
CREATE TABLE `platform_geolocation_settings` (
	`id` varchar(36) NOT NULL,
	`nominatim_base_url` varchar(512) NOT NULL DEFAULT 'https://nominatim.openstreetmap.org',
	`nominatim_contact_email` varchar(320),
	`nominatim_enabled` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_geolocation_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_module_settings` (
	`id` varchar(36) NOT NULL,
	`crm_enabled` boolean NOT NULL DEFAULT true,
	`hrm_enabled` boolean NOT NULL DEFAULT false,
	`sales_funnel_enabled` boolean NOT NULL DEFAULT false,
	`company_subscriptions_enabled` boolean NOT NULL DEFAULT false,
	`invoicing_enabled` boolean NOT NULL DEFAULT false,
	`mailbox_enabled` boolean NOT NULL DEFAULT false,
	`self_register_enabled` boolean NOT NULL DEFAULT false,
	`mfa_totp_enabled` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_module_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_payment_settings` (
	`id` varchar(36) NOT NULL,
	`payments_enabled` boolean NOT NULL DEFAULT false,
	`provider` varchar(16) NOT NULL DEFAULT 'stripe',
	`stripe_publishable_key` varchar(512) NOT NULL DEFAULT '',
	`stripe_secret_encrypted` text,
	`stripe_webhook_secret_encrypted` text,
	`adyen_merchant_account` varchar(255) NOT NULL DEFAULT '',
	`adyen_client_key` varchar(512) NOT NULL DEFAULT '',
	`adyen_environment` varchar(16) NOT NULL DEFAULT 'test',
	`adyen_api_key_encrypted` text,
	`accepted_payment_methods_json` text NOT NULL DEFAULT ('["card","paypal","wallet_apple_google_pay","ideal"]'),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_payment_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_smtp_settings` (
	`id` varchar(36) NOT NULL,
	`host` text NOT NULL DEFAULT '',
	`port` int NOT NULL DEFAULT 587,
	`secure` boolean NOT NULL DEFAULT false,
	`username` text,
	`password_encrypted` text,
	`from_name` varchar(255) NOT NULL DEFAULT '',
	`from_email` varchar(320) NOT NULL DEFAULT '',
	`smtp_enabled` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_smtp_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_subscription_payments` (
	`id` varchar(36) NOT NULL,
	`plan_id` varchar(36),
	`subscription_id` varchar(36),
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`amount_cents` int NOT NULL,
	`currency_code` varchar(3) NOT NULL DEFAULT 'USD',
	`status` varchar(32) NOT NULL,
	`due_at` timestamp,
	`paid_at` timestamp,
	`cancelled_at` timestamp,
	`reimbursed_at` timestamp,
	`description` text,
	`psp_invoice_id` varchar(255),
	`psp_payment_intent_id` varchar(255),
	`psp_charge_id` varchar(255),
	`period_start_utc` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_subscription_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_subscription_payments_sub_period_unique` UNIQUE(`subscription_id`,`period_start_utc`)
);
--> statement-breakpoint
CREATE TABLE `platform_subscription_plan_audit_log` (
	`id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`action` varchar(48) NOT NULL,
	`plan_id` varchar(36),
	`actor_user_id` varchar(36),
	`summary` text NOT NULL,
	`detail_json` text,
	CONSTRAINT `platform_subscription_plan_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_subscription_plans` (
	`id` varchar(36) NOT NULL,
	`tier_name` varchar(128) NOT NULL,
	`duration_unit` varchar(16) NOT NULL,
	`duration_count` int NOT NULL DEFAULT 1,
	`price_cents` int NOT NULL,
	`currency_code` varchar(3) NOT NULL DEFAULT 'USD',
	`allow_cancel_anytime` boolean NOT NULL DEFAULT false,
	`trial_days` int NOT NULL DEFAULT 0,
	`allow_tier_change_next_period` boolean NOT NULL DEFAULT true,
	`billing_scope` varchar(16) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`disabled` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_subscription_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_subscription_settings` (
	`id` varchar(36) NOT NULL,
	`subscriptions_enabled` boolean NOT NULL DEFAULT false,
	`subscription_currency_code` varchar(3) NOT NULL DEFAULT 'USD',
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_subscription_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processed_stripe_events` (
	`stripe_event_id` varchar(255) NOT NULL,
	`event_type` varchar(128) NOT NULL,
	`processed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processed_stripe_events_stripe_event_id` PRIMARY KEY(`stripe_event_id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`tenant_id` varchar(36),
	`user_device_id` varchar(36),
	`token_hash` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_tokens_token_hash_uidx` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `sales_funnel_activities` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`entity_type` varchar(32) NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	`activity_type` varchar(32) NOT NULL,
	`summary` text NOT NULL,
	`payload_json` text,
	`actor_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_funnel_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_funnel_bdr_leads` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`stage_key` varchar(64) NOT NULL,
	`tags_json` text,
	`owner_user_id` varchar(36),
	`crm_organization_id` varchar(36),
	`stage_entered_at` timestamp NOT NULL DEFAULT (now()),
	`archived_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`inactive_stage_label` varchar(128),
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_funnel_bdr_leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_funnel_contact_roles` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`label` varchar(128) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_funnel_contact_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_funnel_contact_roles_tenant_label_uidx` UNIQUE(`tenant_id`,`label`)
);
--> statement-breakpoint
CREATE TABLE `sales_funnel_deal_contacts` (
	`tenant_id` varchar(36) NOT NULL,
	`deal_id` varchar(36) NOT NULL,
	`contact_id` varchar(36) NOT NULL,
	`role_label` varchar(128) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_funnel_deal_contacts_deal_id_contact_id_pk` PRIMARY KEY(`deal_id`,`contact_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_funnel_lead_contacts` (
	`tenant_id` varchar(36) NOT NULL,
	`lead_id` varchar(36) NOT NULL,
	`contact_id` varchar(36) NOT NULL,
	`role_label` varchar(128) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_funnel_lead_contacts_lead_id_contact_id_pk` PRIMARY KEY(`lead_id`,`contact_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_funnel_sales_deals` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`stage_key` varchar(64) NOT NULL,
	`tags_json` text,
	`owner_user_id` varchar(36),
	`crm_organization_id` varchar(36),
	`promoted_from_lead_id` varchar(36),
	`stage_entered_at` timestamp NOT NULL DEFAULT (now()),
	`archived_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`outcome_bucket` varchar(8),
	`inactive_stage_label` varchar(128),
	`expected_value_minor` bigint,
	`expected_value_currency` varchar(3),
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_funnel_sales_deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_funnel_stages` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`pipeline` varchar(16) NOT NULL,
	`stage_key` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`outcome` varchar(16) NOT NULL DEFAULT 'open',
	`close_chance_percent` int,
	`ready_for_sales` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_funnel_stages_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_funnel_stages_tenant_pipeline_key_uidx` UNIQUE(`tenant_id`,`pipeline`,`stage_key`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`plan_id` varchar(36) NOT NULL,
	`pending_plan_id` varchar(36),
	`status` varchar(32) NOT NULL,
	`started_at` timestamp NOT NULL,
	`current_period_start` timestamp NOT NULL,
	`current_period_end` timestamp NOT NULL,
	`cancel_at_period_end` boolean NOT NULL DEFAULT false,
	`canceled_at` timestamp,
	`cancel_effective_mode` varchar(32),
	`effective_end_at` timestamp,
	`trial_ends_at` timestamp,
	`psp_customer_id` varchar(255),
	`psp_subscription_id` varchar(255),
	`psp_default_payment_method_id` varchar(255),
	`payment_method_brand` varchar(32),
	`payment_method_last4` varchar(8),
	`payment_method_exp_month` int,
	`payment_method_exp_year` int,
	`billing_past_due_since` timestamp,
	`billing_failed_charge_count` int NOT NULL DEFAULT 0,
	`billing_last_payment_error_code` varchar(128),
	`billing_next_retry_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_smtp_settings` (
	`tenant_id` varchar(36) NOT NULL,
	`host` varchar(255) NOT NULL DEFAULT '',
	`port` int NOT NULL DEFAULT 587,
	`secure` boolean NOT NULL DEFAULT false,
	`username` varchar(512),
	`password_encrypted` text,
	`from_name` varchar(255) NOT NULL DEFAULT '',
	`from_email` varchar(320) NOT NULL DEFAULT '',
	`smtp_enabled` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_smtp_settings_tenant_id` PRIMARY KEY(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_user_module_roles` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`module` varchar(32) NOT NULL,
	`role` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_user_module_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_user_module_roles_tenant_user_module_unique` UNIQUE(`tenant_id`,`user_id`,`module`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`name_lookup_key` varchar(512) NOT NULL,
	`realm_self_register_enabled` boolean NOT NULL DEFAULT true,
	`mfa_enforced` boolean NOT NULL DEFAULT false,
	`encrypted_dek` text,
	`dek_key_version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_name_lookup_key_unique` UNIQUE(`name_lookup_key`)
);
--> statement-breakpoint
CREATE TABLE `user_devices` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`install_key` varchar(256) NOT NULL,
	`platform` varchar(16) NOT NULL,
	`label` varchar(255),
	`push_token` varchar(4096),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`revoked_at` timestamp,
	CONSTRAINT `user_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_devices_user_install_uidx` UNIQUE(`user_id`,`install_key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36),
	`email` text NOT NULL,
	`role` varchar(32) NOT NULL DEFAULT 'tenant_user',
	`identity_key` varchar(512) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`encrypted_tax_id` varchar(1024),
	`display_name` varchar(255),
	`country_code` varchar(2),
	`measurement_system` varchar(16),
	`timezone` varchar(128),
	`currency_code` varchar(3),
	`currency_format` varchar(32),
	`date_time_format` varchar(16),
	`time_format` varchar(8),
	`home_address_line1` text,
	`home_address_line2` text,
	`home_postal_code` text,
	`home_city` text,
	`home_state` text,
	`home_country` text,
	`first_password_login_at` timestamp,
	`mfa_grace_expires_at` timestamp,
	`mfa_blocked_at` timestamp,
	`mfa_totp_secret_encrypted` text,
	`mfa_totp_enabled` boolean NOT NULL DEFAULT false,
	`mfa_totp_pending_secret_encrypted` text,
	`mfa_totp_pending_expires_at` timestamp,
	`mfa_email_enabled` boolean NOT NULL DEFAULT false,
	`access_token_version` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_identity_key_uidx` UNIQUE(`identity_key`)
);
--> statement-breakpoint
CREATE TABLE `workforce_employee_documents` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`title` varchar(512) NOT NULL,
	`original_filename` varchar(512) NOT NULL,
	`mime_type` varchar(255),
	`storage_rel_path` varchar(512) NOT NULL,
	`byte_size` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workforce_employee_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workforce_employees` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`date_of_employment` varchar(10),
	`personal_phone` text,
	`personal_email` text,
	`work_phone` text,
	`work_email` text,
	`personal_address` text,
	`work_location` text,
	`employment_org_unit_id` varchar(36),
	`job_title` varchar(255),
	`employee_kind` varchar(16) NOT NULL DEFAULT 'person',
	`notes` text,
	`photo_rel_path` varchar(512),
	`work_time_kind` varchar(16),
	`work_schedule_json` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workforce_employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workforce_org_units` (
	`id` varchar(36) NOT NULL,
	`tenant_id` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`parent_org_unit_id` varchar(36),
	`assigned_employee_id` varchar(36),
	`on_org_chart` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workforce_org_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `workforce_org_units_assigned_employee_uidx` UNIQUE(`assigned_employee_id`)
);
--> statement-breakpoint
ALTER TABLE `company_subscription_plans` ADD CONSTRAINT `company_subscription_plans_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_plans` ADD CONSTRAINT `company_subscription_plans_provider_id_company_subscription_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `company_subscription_providers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_plans` ADD CONSTRAINT `company_subscription_plans_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_plans` ADD CONSTRAINT `company_subscription_plans_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_provider_documents` ADD CONSTRAINT `company_subscription_provider_documents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_provider_documents` ADD CONSTRAINT `company_subscription_provider_documents_provider_id_company_subscription_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `company_subscription_providers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_providers` ADD CONSTRAINT `company_subscription_providers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_providers` ADD CONSTRAINT `company_subscription_providers_owner_employee_id_workforce_employees_id_fk` FOREIGN KEY (`owner_employee_id`) REFERENCES `workforce_employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_providers` ADD CONSTRAINT `company_subscription_providers_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_providers` ADD CONSTRAINT `company_subscription_providers_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_seats` ADD CONSTRAINT `company_subscription_seats_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_seats` ADD CONSTRAINT `company_subscription_seats_plan_id_company_subscription_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `company_subscription_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_seats` ADD CONSTRAINT `company_subscription_seats_employee_id_workforce_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `workforce_employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_seats` ADD CONSTRAINT `company_subscription_seats_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_subscription_seats` ADD CONSTRAINT `company_subscription_seats_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_activities` ADD CONSTRAINT `crm_activities_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_contacts` ADD CONSTRAINT `crm_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organization_market_segments` ADD CONSTRAINT `crm_organization_market_segments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organization_market_segments` ADD CONSTRAINT `crm_organization_market_segments_parent_id_crm_organization_market_segments_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `crm_organization_market_segments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organization_marketing_tag_links` ADD CONSTRAINT `crm_organization_marketing_tag_links_organization_id_crm_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `crm_organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organization_marketing_tag_links` ADD CONSTRAINT `crm_organization_marketing_tag_links_tag_id_crm_organization_marketing_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `crm_organization_marketing_tags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organization_marketing_tags` ADD CONSTRAINT `crm_organization_marketing_tags_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organizations` ADD CONSTRAINT `crm_organizations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organizations` ADD CONSTRAINT `crm_organizations_market_segment_layer1_id_crm_organization_market_segments_id_fk` FOREIGN KEY (`market_segment_layer1_id`) REFERENCES `crm_organization_market_segments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organizations` ADD CONSTRAINT `crm_organizations_market_segment_layer2_id_crm_organization_market_segments_id_fk` FOREIGN KEY (`market_segment_layer2_id`) REFERENCES `crm_organization_market_segments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_organizations` ADD CONSTRAINT `crm_organizations_market_segment_layer3_id_crm_organization_market_segments_id_fk` FOREIGN KEY (`market_segment_layer3_id`) REFERENCES `crm_organization_market_segments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_relationship_types` ADD CONSTRAINT `crm_relationship_types_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_relationship_types` ADD CONSTRAINT `crm_relationship_types_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_relationships` ADD CONSTRAINT `crm_relationships_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `crm_relationships` ADD CONSTRAINT `crm_relationships_relationship_type_id_crm_relationship_types_id_fk` FOREIGN KEY (`relationship_type_id`) REFERENCES `crm_relationship_types`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_search_tokens` ADD CONSTRAINT `field_search_tokens_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_audit_events` ADD CONSTRAINT `invoicing_audit_events_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_catalog_items` ADD CONSTRAINT `invoicing_catalog_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_invoice_line_items` ADD CONSTRAINT `invoicing_invoice_line_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_invoice_line_items` ADD CONSTRAINT `invoicing_invoice_line_items_invoice_id_invoicing_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoicing_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_invoice_payments` ADD CONSTRAINT `invoicing_invoice_payments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_invoice_payments` ADD CONSTRAINT `invoicing_invoice_payments_invoice_id_invoicing_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoicing_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_invoices` ADD CONSTRAINT `invoicing_invoices_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_number_sequences` ADD CONSTRAINT `invoicing_number_sequences_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_offer_line_items` ADD CONSTRAINT `invoicing_offer_line_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_offer_line_items` ADD CONSTRAINT `invoicing_offer_line_items_offer_id_invoicing_offers_id_fk` FOREIGN KEY (`offer_id`) REFERENCES `invoicing_offers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_offer_response_tokens` ADD CONSTRAINT `invoicing_offer_response_tokens_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_offer_response_tokens` ADD CONSTRAINT `invoicing_offer_response_tokens_offer_id_invoicing_offers_id_fk` FOREIGN KEY (`offer_id`) REFERENCES `invoicing_offers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_offers` ADD CONSTRAINT `invoicing_offers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_payment_reminders` ADD CONSTRAINT `invoicing_payment_reminders_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_payment_reminders` ADD CONSTRAINT `invoicing_payment_reminders_invoice_id_invoicing_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoicing_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_quote_line_items` ADD CONSTRAINT `invoicing_quote_line_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_quote_line_items` ADD CONSTRAINT `invoicing_quote_line_items_quote_id_invoicing_quotes_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `invoicing_quotes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_quotes` ADD CONSTRAINT `invoicing_quotes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoicing_tenant_configuration` ADD CONSTRAINT `invoicing_tenant_configuration_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_account_members` ADD CONSTRAINT `mailbox_account_members_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_account_members` ADD CONSTRAINT `mailbox_account_members_account_id_mailbox_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `mailbox_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_account_members` ADD CONSTRAINT `mailbox_account_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_accounts` ADD CONSTRAINT `mailbox_accounts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_accounts` ADD CONSTRAINT `mailbox_accounts_mailbox_inbox_id_mailbox_inboxes_id_fk` FOREIGN KEY (`mailbox_inbox_id`) REFERENCES `mailbox_inboxes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_accounts` ADD CONSTRAINT `mailbox_accounts_owner_employee_id_workforce_employees_id_fk` FOREIGN KEY (`owner_employee_id`) REFERENCES `workforce_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_attachments` ADD CONSTRAINT `mailbox_attachments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_attachments` ADD CONSTRAINT `mailbox_attachments_message_id_mailbox_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `mailbox_messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_calendar_events` ADD CONSTRAINT `mailbox_calendar_events_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_calendar_events` ADD CONSTRAINT `mailbox_calendar_events_calendar_id_mailbox_calendars_id_fk` FOREIGN KEY (`calendar_id`) REFERENCES `mailbox_calendars`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_calendars` ADD CONSTRAINT `mailbox_calendars_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_calendars` ADD CONSTRAINT `mailbox_calendars_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_calendars` ADD CONSTRAINT `mailbox_calendars_mailbox_account_id_mailbox_accounts_id_fk` FOREIGN KEY (`mailbox_account_id`) REFERENCES `mailbox_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_event_attendees` ADD CONSTRAINT `mailbox_event_attendees_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_event_attendees` ADD CONSTRAINT `mailbox_event_attendees_event_id_mailbox_calendar_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `mailbox_calendar_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_inboxes` ADD CONSTRAINT `mailbox_inboxes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_inboxes` ADD CONSTRAINT `mailbox_inboxes_owner_employee_id_workforce_employees_id_fk` FOREIGN KEY (`owner_employee_id`) REFERENCES `workforce_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_messages` ADD CONSTRAINT `mailbox_messages_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_messages` ADD CONSTRAINT `mailbox_messages_account_id_mailbox_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `mailbox_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_messages` ADD CONSTRAINT `mailbox_messages_thread_id_mailbox_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `mailbox_threads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_threads` ADD CONSTRAINT `mailbox_threads_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mailbox_threads` ADD CONSTRAINT `mailbox_threads_account_id_mailbox_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `mailbox_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mfa_otp_challenges` ADD CONSTRAINT `mfa_otp_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_subscription_payments` ADD CONSTRAINT `platform_subscription_payments_plan_id_platform_subscription_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `platform_subscription_plans`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_subscription_payments` ADD CONSTRAINT `platform_subscription_payments_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_subscription_payments` ADD CONSTRAINT `platform_subscription_payments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_subscription_payments` ADD CONSTRAINT `platform_subscription_payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_subscription_plan_audit_log` ADD CONSTRAINT `platform_subscription_plan_audit_log_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_device_id_user_devices_id_fk` FOREIGN KEY (`user_device_id`) REFERENCES `user_devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_activities` ADD CONSTRAINT `sales_funnel_activities_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_bdr_leads` ADD CONSTRAINT `sales_funnel_bdr_leads_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_bdr_leads` ADD CONSTRAINT `sales_funnel_bdr_leads_crm_organization_id_crm_organizations_id_fk` FOREIGN KEY (`crm_organization_id`) REFERENCES `crm_organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_contact_roles` ADD CONSTRAINT `sales_funnel_contact_roles_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_deal_contacts` ADD CONSTRAINT `sales_funnel_deal_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_deal_contacts` ADD CONSTRAINT `sales_funnel_deal_contacts_deal_id_sales_funnel_sales_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `sales_funnel_sales_deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_deal_contacts` ADD CONSTRAINT `sales_funnel_deal_contacts_contact_id_crm_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_lead_contacts` ADD CONSTRAINT `sales_funnel_lead_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_lead_contacts` ADD CONSTRAINT `sales_funnel_lead_contacts_lead_id_sales_funnel_bdr_leads_id_fk` FOREIGN KEY (`lead_id`) REFERENCES `sales_funnel_bdr_leads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_lead_contacts` ADD CONSTRAINT `sales_funnel_lead_contacts_contact_id_crm_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_sales_deals` ADD CONSTRAINT `sales_funnel_sales_deals_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_sales_deals` ADD CONSTRAINT `sales_funnel_sales_deals_crm_organization_id_crm_organizations_id_fk` FOREIGN KEY (`crm_organization_id`) REFERENCES `crm_organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_sales_deals` ADD CONSTRAINT `sales_funnel_sales_deals_promoted_from_lead_id_sales_funnel_bdr_leads_id_fk` FOREIGN KEY (`promoted_from_lead_id`) REFERENCES `sales_funnel_bdr_leads`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_funnel_stages` ADD CONSTRAINT `sales_funnel_stages_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_platform_subscription_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `platform_subscription_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_pending_plan_id_platform_subscription_plans_id_fk` FOREIGN KEY (`pending_plan_id`) REFERENCES `platform_subscription_plans`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_smtp_settings` ADD CONSTRAINT `tenant_smtp_settings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_user_module_roles` ADD CONSTRAINT `tenant_user_module_roles_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_user_module_roles` ADD CONSTRAINT `tenant_user_module_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_devices` ADD CONSTRAINT `user_devices_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workforce_employee_documents` ADD CONSTRAINT `workforce_employee_documents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workforce_employee_documents` ADD CONSTRAINT `workforce_employee_documents_employee_id_workforce_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `workforce_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workforce_employees` ADD CONSTRAINT `workforce_employees_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workforce_employees` ADD CONSTRAINT `workforce_employees_employment_org_unit_id_workforce_org_units_id_fk` FOREIGN KEY (`employment_org_unit_id`) REFERENCES `workforce_org_units`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workforce_org_units` ADD CONSTRAINT `workforce_org_units_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workforce_org_units` ADD CONSTRAINT `workforce_org_units_parent_org_unit_id_workforce_org_units_id_fk` FOREIGN KEY (`parent_org_unit_id`) REFERENCES `workforce_org_units`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workforce_org_units` ADD CONSTRAINT `workforce_org_units_assigned_employee_id_workforce_employees_id_fk` FOREIGN KEY (`assigned_employee_id`) REFERENCES `workforce_employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `app_cache_entries_expires_idx` ON `app_cache_entries` (`expires_at`);--> statement-breakpoint
CREATE INDEX `background_jobs_queue_status_run_priority_idx` ON `background_jobs` (`queue_name`,`status`,`run_at`,`priority`);--> statement-breakpoint
CREATE INDEX `background_jobs_purge_after_idx` ON `background_jobs` (`purge_after`);--> statement-breakpoint
CREATE INDEX `company_subscription_plans_provider_idx` ON `company_subscription_plans` (`tenant_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `company_subscription_provider_documents_provider_idx` ON `company_subscription_provider_documents` (`tenant_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `company_subscription_providers_tenant_status_idx` ON `company_subscription_providers` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `company_subscription_providers_tenant_renewal_idx` ON `company_subscription_providers` (`tenant_id`,`renewal_date`);--> statement-breakpoint
CREATE INDEX `company_subscription_seats_plan_idx` ON `company_subscription_seats` (`tenant_id`,`plan_id`);--> statement-breakpoint
CREATE INDEX `crm_activities_entity_idx` ON `crm_activities` (`tenant_id`,`related_entity_kind`,`related_entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `crm_activities_type_idx` ON `crm_activities` (`tenant_id`,`activity_type`);--> statement-breakpoint
CREATE INDEX `crm_contacts_tenant_idx` ON `crm_contacts` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `crm_org_market_segments_tenant_parent_idx` ON `crm_organization_market_segments` (`tenant_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `crm_org_marketing_tag_links_tag_idx` ON `crm_organization_marketing_tag_links` (`tag_id`);--> statement-breakpoint
CREATE INDEX `crm_organizations_tenant_idx` ON `crm_organizations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `crm_organizations_market_segment_l1_idx` ON `crm_organizations` (`tenant_id`,`market_segment_layer1_id`);--> statement-breakpoint
CREATE INDEX `crm_organizations_market_segment_l2_idx` ON `crm_organizations` (`tenant_id`,`market_segment_layer2_id`);--> statement-breakpoint
CREATE INDEX `crm_organizations_market_segment_l3_idx` ON `crm_organizations` (`tenant_id`,`market_segment_layer3_id`);--> statement-breakpoint
CREATE INDEX `crm_relationships_src_idx` ON `crm_relationships` (`tenant_id`,`source_entity_kind`,`source_id`);--> statement-breakpoint
CREATE INDEX `crm_relationships_tgt_idx` ON `crm_relationships` (`tenant_id`,`target_entity_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `email_otp_challenges_subject_purpose_idx` ON `email_otp_challenges` (`subject_key`,`purpose`);--> statement-breakpoint
CREATE INDEX `field_search_tokens_lookup_idx` ON `field_search_tokens` (`tenant_id`,`entity_table`,`field_name`,`token_hash`);--> statement-breakpoint
CREATE INDEX `invoicing_audit_events_tenant_doc_idx` ON `invoicing_audit_events` (`tenant_id`,`document_kind`,`document_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoicing_catalog_items_tenant_active_idx` ON `invoicing_catalog_items` (`tenant_id`,`is_active`,`name`);--> statement-breakpoint
CREATE INDEX `invoicing_invoice_line_items_invoice_idx` ON `invoicing_invoice_line_items` (`invoice_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `invoicing_invoice_payments_invoice_idx` ON `invoicing_invoice_payments` (`tenant_id`,`invoice_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_tenant_status_idx` ON `invoicing_invoices` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_due_date_idx` ON `invoicing_invoices` (`tenant_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_source_offer_idx` ON `invoicing_invoices` (`source_offer_id`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_source_invoice_idx` ON `invoicing_invoices` (`source_invoice_id`);--> statement-breakpoint
CREATE INDEX `invoicing_offer_line_items_offer_idx` ON `invoicing_offer_line_items` (`offer_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `invoicing_offers_tenant_status_idx` ON `invoicing_offers` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `invoicing_offers_source_quote_idx` ON `invoicing_offers` (`source_quote_id`);--> statement-breakpoint
CREATE INDEX `invoicing_quote_line_items_quote_idx` ON `invoicing_quote_line_items` (`quote_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `invoicing_quotes_tenant_status_idx` ON `invoicing_quotes` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `invoicing_quotes_tenant_number_idx` ON `invoicing_quotes` (`tenant_id`,`document_number`);--> statement-breakpoint
CREATE INDEX `invoicing_quotes_source_offer_idx` ON `invoicing_quotes` (`source_offer_id`);--> statement-breakpoint
CREATE INDEX `invoicing_quotes_source_invoice_idx` ON `invoicing_quotes` (`source_invoice_id`);--> statement-breakpoint
CREATE INDEX `mailbox_account_members_user_idx` ON `mailbox_account_members` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `mailbox_accounts_tenant_owner_idx` ON `mailbox_accounts` (`tenant_id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `mailbox_accounts_tenant_scope_idx` ON `mailbox_accounts` (`tenant_id`,`owner_scope`);--> statement-breakpoint
CREATE INDEX `mailbox_accounts_tenant_employee_idx` ON `mailbox_accounts` (`tenant_id`,`owner_employee_id`);--> statement-breakpoint
CREATE INDEX `mailbox_accounts_inbox_idx` ON `mailbox_accounts` (`tenant_id`,`mailbox_inbox_id`);--> statement-breakpoint
CREATE INDEX `mailbox_attachments_message_idx` ON `mailbox_attachments` (`tenant_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `mailbox_calendar_events_calendar_idx` ON `mailbox_calendar_events` (`tenant_id`,`calendar_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `mailbox_calendars_user_idx` ON `mailbox_calendars` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `mailbox_calendars_account_idx` ON `mailbox_calendars` (`tenant_id`,`mailbox_account_id`);--> statement-breakpoint
CREATE INDEX `mailbox_event_attendees_event_idx` ON `mailbox_event_attendees` (`tenant_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `mailbox_inboxes_tenant_owner_idx` ON `mailbox_inboxes` (`tenant_id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `mailbox_inboxes_tenant_scope_idx` ON `mailbox_inboxes` (`tenant_id`,`owner_scope`);--> statement-breakpoint
CREATE INDEX `mailbox_inboxes_tenant_employee_idx` ON `mailbox_inboxes` (`tenant_id`,`owner_employee_id`);--> statement-breakpoint
CREATE INDEX `mailbox_messages_thread_idx` ON `mailbox_messages` (`tenant_id`,`thread_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `mailbox_messages_account_received_idx` ON `mailbox_messages` (`tenant_id`,`account_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `mailbox_threads_account_folder_idx` ON `mailbox_threads` (`tenant_id`,`account_id`,`folder`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `mailbox_threads_provider_thread_idx` ON `mailbox_threads` (`account_id`,`provider_thread_id`);--> statement-breakpoint
CREATE INDEX `mfa_otp_challenges_user_purpose_idx` ON `mfa_otp_challenges` (`user_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `platform_subscription_payments_status_idx` ON `platform_subscription_payments` (`status`);--> statement-breakpoint
CREATE INDEX `platform_subscription_payments_tenant_idx` ON `platform_subscription_payments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `platform_subscription_payments_subscription_idx` ON `platform_subscription_payments` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `platform_subscription_payments_psp_pi_idx` ON `platform_subscription_payments` (`psp_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `platform_subscription_plan_audit_log_created_idx` ON `platform_subscription_plan_audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `sales_funnel_activities_entity_idx` ON `sales_funnel_activities` (`tenant_id`,`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sales_funnel_bdr_leads_crm_org_idx` ON `sales_funnel_bdr_leads` (`tenant_id`,`crm_organization_id`);--> statement-breakpoint
CREATE INDEX `sales_funnel_bdr_leads_tenant_stage_idx` ON `sales_funnel_bdr_leads` (`tenant_id`,`stage_key`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sales_funnel_bdr_leads_tenant_owner_idx` ON `sales_funnel_bdr_leads` (`tenant_id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `sales_funnel_bdr_leads_tenant_active_idx` ON `sales_funnel_bdr_leads` (`tenant_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `sales_funnel_contact_roles_tenant_sort_idx` ON `sales_funnel_contact_roles` (`tenant_id`,`sort_order`,`label`);--> statement-breakpoint
CREATE INDEX `sales_funnel_deal_contacts_contact_idx` ON `sales_funnel_deal_contacts` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `sales_funnel_lead_contacts_contact_idx` ON `sales_funnel_lead_contacts` (`tenant_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `sales_funnel_sales_deals_crm_org_idx` ON `sales_funnel_sales_deals` (`tenant_id`,`crm_organization_id`);--> statement-breakpoint
CREATE INDEX `sales_funnel_sales_deals_tenant_stage_idx` ON `sales_funnel_sales_deals` (`tenant_id`,`stage_key`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sales_funnel_sales_deals_tenant_owner_idx` ON `sales_funnel_sales_deals` (`tenant_id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `sales_funnel_sales_deals_tenant_active_idx` ON `sales_funnel_sales_deals` (`tenant_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `sales_funnel_sales_deals_promoted_idx` ON `sales_funnel_sales_deals` (`tenant_id`,`promoted_from_lead_id`);--> statement-breakpoint
CREATE INDEX `sales_funnel_stages_tenant_pipeline_sort_idx` ON `sales_funnel_stages` (`tenant_id`,`pipeline`,`sort_order`);--> statement-breakpoint
CREATE INDEX `subscriptions_tenant_user_idx` ON `subscriptions` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_plan_idx` ON `subscriptions` (`plan_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_pending_plan_id_idx` ON `subscriptions` (`pending_plan_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_psp_customer_id_idx` ON `subscriptions` (`psp_customer_id`);--> statement-breakpoint
CREATE INDEX `tenant_user_module_roles_tenant_user_idx` ON `tenant_user_module_roles` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workforce_employee_documents_employee_idx` ON `workforce_employee_documents` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `workforce_employees_tenant_idx` ON `workforce_employees` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `workforce_employees_employment_org_unit_idx` ON `workforce_employees` (`tenant_id`,`employment_org_unit_id`);--> statement-breakpoint
CREATE INDEX `workforce_org_units_tenant_idx` ON `workforce_org_units` (`tenant_id`);