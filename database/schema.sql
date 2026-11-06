-- Full database schema reconstructed from the pgAdmin ERD export.
-- All columns, primary keys, unique constraints, and foreign keys are defined in CREATE TABLE statements.
-- Explicit indexes are defined with CREATE INDEX statements.
-- Exception: inward.customer_dc_date is retained as date NOT NULL.
BEGIN;

CREATE TABLE IF NOT EXISTS public.alembic_version
(
    version_num character varying(32) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT alembic_version_pkey PRIMARY KEY (version_num)
);

CREATE TABLE IF NOT EXISTS public.certificate_details (
    certificate_details_id SERIAL PRIMARY KEY,

    calibration_procedure TEXT NULL,

    statement_below_signature JSONB NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS public.customers
(
    customer_id serial NOT NULL,
    customer_details text COLLATE pg_catalog."default" NOT NULL,
    contact_person character varying(255) COLLATE pg_catalog."default",
    phone character varying(50) COLLATE pg_catalog."default",
    email character varying(320) COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    ship_to_address text COLLATE pg_catalog."default" NOT NULL,
    bill_to_address text COLLATE pg_catalog."default" NOT NULL,
    is_active boolean,
    location_name text COLLATE pg_catalog."default",
    CONSTRAINT customers_pkey PRIMARY KEY (customer_id)
);

CREATE TABLE IF NOT EXISTS public.equipment_flow_config
(
    id serial NOT NULL,
    equipment_type character varying(100) COLLATE pg_catalog."default" NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT equipment_flow_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_cmc_reference
(
    id serial NOT NULL,
    lower_measure_range numeric(14, 4) NOT NULL,
    higher_measure_range numeric(14, 4) NOT NULL,
    cmc_percent numeric(8, 4) NOT NULL,
    is_active boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_cmc_reference_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_const_coverage_factor
(
    id serial NOT NULL,
    k double precision NOT NULL,
    is_active boolean,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_const_coverage_factor_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_environment_config
(
    id serial NOT NULL,
    temp_min numeric(5, 2) NOT NULL,
    temp_max numeric(5, 2) NOT NULL,
    humidity_min numeric(5, 2) NOT NULL,
    humidity_max numeric(5, 2) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT htw_environment_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_job_standard_snapshot
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    master_standard_id integer NOT NULL,
    standard_order integer NOT NULL,
    nomenclature character varying COLLATE pg_catalog."default" NOT NULL,
    manufacturer character varying COLLATE pg_catalog."default",
    model_serial_no character varying COLLATE pg_catalog."default",
    certificate_no character varying COLLATE pg_catalog."default",
    traceable_to_lab character varying COLLATE pg_catalog."default",
    calibration_valid_upto date,
    uncertainty numeric(18, 8),
    uncertainty_unit character varying COLLATE pg_catalog."default",
    resolution numeric(14, 4),
    resolution_unit character varying COLLATE pg_catalog."default",
    accuracy_of_master numeric(14, 4),
    captured_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_job_standard_snapshot_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_manufacturer_spec
(
    id serial NOT NULL,
    make character varying(255) COLLATE pg_catalog."default",
    model character varying(255) COLLATE pg_catalog."default",
    range_min numeric,
    range_max numeric,
    torque_20 numeric,
    torque_40 numeric,
    torque_60 numeric,
    torque_80 numeric,
    torque_100 numeric,
    torque_unit character varying(50) COLLATE pg_catalog."default",
    pressure_20 numeric,
    pressure_40 numeric,
    pressure_60 numeric,
    pressure_80 numeric,
    pressure_100 numeric,
    pressure_unit character varying(50) COLLATE pg_catalog."default",
    is_active boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_manufacturer_spec_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_master_standard
(
    id serial NOT NULL,
    nomenclature character varying(255) COLLATE pg_catalog."default" NOT NULL,
    range_min numeric,
    range_max numeric,
    range_unit character varying(50) COLLATE pg_catalog."default",
    manufacturer character varying(255) COLLATE pg_catalog."default",
    model_serial_no character varying(255) COLLATE pg_catalog."default",
    traceable_to_lab character varying(255) COLLATE pg_catalog."default",
    uncertainty numeric,
    uncertainty_unit character varying(50) COLLATE pg_catalog."default",
    certificate_no character varying(255) COLLATE pg_catalog."default",
    calibration_valid_upto date,
    accuracy_of_master character varying(255) COLLATE pg_catalog."default",
    resolution numeric,
    resolution_unit character varying(50) COLLATE pg_catalog."default",
    is_active boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_master_standard_pkey PRIMARY KEY (id),
    CONSTRAINT htw_master_standard_nomenclature_key UNIQUE (nomenclature)
);

CREATE TABLE IF NOT EXISTS public.htw_max_val_measure_err
(
    id serial NOT NULL,
    range_min numeric(14, 4) NOT NULL,
    range_max numeric(14, 4) NOT NULL,
    un_percent numeric(8, 4) NOT NULL,
    is_active boolean,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_max_val_measure_err_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_pressure_gauge_resolution
(
    id serial NOT NULL,
    pressure numeric(14, 4) NOT NULL,
    unit text COLLATE pg_catalog."default" NOT NULL,
    is_active boolean,
    created_at timestamp without time zone DEFAULT now(),
    valid_upto date,
    CONSTRAINT htw_pressure_gauge_resolution_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_standard_uncertainty_reference
(
    id serial NOT NULL,
    valid_from date NOT NULL,
    valid_upto date NOT NULL,
    torque_nm integer NOT NULL,
    applied_torque numeric(14, 4) NOT NULL,
    indicated_torque numeric(14, 4) NOT NULL,
    error_value numeric(18, 8) NOT NULL,
    uncertainty_percent numeric(8, 4) NOT NULL,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT htw_standard_uncertainty_reference_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_t_distribution
(
    id serial NOT NULL,
    degrees_of_freedom integer NOT NULL,
    confidence_level numeric(6, 3) NOT NULL,
    alpha numeric(8, 5) NOT NULL,
    t_value numeric(10, 4) NOT NULL,
    is_active boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_t_distribution_pkey PRIMARY KEY (id),
    CONSTRAINT uq_t_dist_df_confidence UNIQUE (degrees_of_freedom, confidence_level)
);

CREATE TABLE IF NOT EXISTS public.htw_tool_type
(
    id serial NOT NULL,
    tool_name character varying COLLATE pg_catalog."default" NOT NULL,
    tool_category character varying COLLATE pg_catalog."default" NOT NULL,
    operation_type character varying COLLATE pg_catalog."default" NOT NULL,
    classification character varying COLLATE pg_catalog."default",
    is_active boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_tool_type_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.htw_un_pg_master
(
    id serial NOT NULL,
    set_pressure_min numeric(14, 4) NOT NULL,
    set_pressure_max numeric(14, 4) NOT NULL,
    uncertainty_percent numeric(8, 4) NOT NULL,
    valid_upto date NOT NULL,
    is_active boolean,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_un_pg_master_pkey PRIMARY KEY (id),
    CONSTRAINT uq_un_pg_pressure_range UNIQUE (set_pressure_min, set_pressure_max)
);

CREATE TABLE IF NOT EXISTS public.license_audit
(
    id serial NOT NULL,
    old_valid_until date,
    new_valid_until date,
    extended_by character varying(100) COLLATE pg_catalog."default",
    extended_at timestamp without time zone,
    CONSTRAINT license_audit_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.license_master
(
    id serial NOT NULL,
    valid_from date NOT NULL,
    valid_until date NOT NULL,
    last_checked_date date NOT NULL,
    checksum text COLLATE pg_catalog."default" NOT NULL,
    last_extended_by character varying(100) COLLATE pg_catalog."default",
    last_extended_at timestamp without time zone,
    CONSTRAINT license_master_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.record_locks
(
    id serial NOT NULL,
    entity_type character varying(50) COLLATE pg_catalog."default" NOT NULL,
    entity_id integer NOT NULL,
    locked_by_user_id integer NOT NULL,
    locked_by_role character varying(20) COLLATE pg_catalog."default" NOT NULL,
    customer_id integer,
    locked_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    is_active boolean NOT NULL,
    CONSTRAINT record_locks_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.report_log(
    id SERIAL NOT NULL,
    report_type CHARACTER VARYING(20) NOT NULL,
    last_sent_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT report_log_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.work_completion_certificates
(
    id bigserial NOT NULL,
    inward_id bigint,
    vendor_company_details character varying COLLATE pg_catalog."default",
    tax_registration_details character varying COLLATE pg_catalog."default",
    nextage_dispatch_dc_no character varying COLLATE pg_catalog."default",
    date date,
    services_delivered_to character varying COLLATE pg_catalog."default",
    work_location_1 character varying COLLATE pg_catalog."default",
    work_location_2 character varying COLLATE pg_catalog."default",
    work_location_3 character varying COLLATE pg_catalog."default",
    gst_no character varying COLLATE pg_catalog."default",
    pan_no character varying COLLATE pg_catalog."default",
    wcc_no character varying COLLATE pg_catalog."default",
    work_start_date date,
    work_completion_date date,
    po_no character varying COLLATE pg_catalog."default",
    po_date date,
    project_name character varying COLLATE pg_catalog."default",
    details_table jsonb NOT NULL DEFAULT '[{"uom": "", "sac_no": "", "po_s_no": null, "quantity_completed": null, "description_of_work": "", "status_of_work_completed": ""}]'::jsonb,
    remarks text COLLATE pg_catalog."default",
    signature_details jsonb NOT NULL DEFAULT '{"representative_and_company_seal_name": "", "vendor_representative_company_seal_name": ""}'::jsonb,
    tools_received_from character varying COLLATE pg_catalog."default",
    tools_dispatched_to character varying  COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT work_completion_certificates_pkey PRIMARY KEY (id),
    CONSTRAINT work_completion_certificates_inward_id_key UNIQUE (inward_id),
    CONSTRAINT work_completion_certificates_wcc_no_key UNIQUE (wcc_no)
);

CREATE TABLE IF NOT EXISTS public.calibration_bookings
(
    booking_id serial NOT NULL,
    customer_id integer NOT NULL,
    equipment_count integer,
    remarks text COLLATE pg_catalog."default",
    status character varying(20) COLLATE pg_catalog."default" NOT NULL,
    files json,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT calibration_bookings_pkey PRIMARY KEY (booking_id),
    CONSTRAINT calibration_bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.final_inspections
(
    id serial NOT NULL,
    inward_id integer NOT NULL,
    customer_id integer NOT NULL,
    srf_no character varying(100) COLLATE pg_catalog."default" NOT NULL,
    customer_dc_no character varying(255) COLLATE pg_catalog."default",
    receiver character varying(255) COLLATE pg_catalog."default",
    customer_name text COLLATE pg_catalog."default" NOT NULL,
    customer_email character varying(320) COLLATE pg_catalog."default",
    customer_decision character varying(20) COLLATE pg_catalog."default",
    customer_remarks text COLLATE pg_catalog."default",
    equipments jsonb NOT NULL,
    sent_emails jsonb NOT NULL,
    report_sent boolean NOT NULL,
    report_sent_at timestamp with time zone,
    status character varying(50) COLLATE pg_catalog."default" NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT final_inspections_pkey PRIMARY KEY (id),
    CONSTRAINT final_inspections_inward_id_key UNIQUE (inward_id),
    CONSTRAINT final_inspections_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.htw_nomenclature_range
(
    id serial NOT NULL,
    master_standard_id integer NOT NULL,
    range_min numeric(14, 4) NOT NULL,
    range_max numeric(14, 4) NOT NULL,
    nomenclature character varying(255) COLLATE pg_catalog."default" NOT NULL,
    is_active boolean,
    valid_upto date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT htw_nomenclature_range_pkey PRIMARY KEY (id),
    CONSTRAINT htw_nomenclature_range_nomenclature_key UNIQUE (nomenclature),
    CONSTRAINT htw_nomenclature_range_master_standard_id_fkey FOREIGN KEY (master_standard_id) REFERENCES public.htw_master_standard (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.users
(
    user_id serial NOT NULL,
    customer_id integer,
    username character varying(150) COLLATE pg_catalog."default" NOT NULL,
    email character varying(320) COLLATE pg_catalog."default" NOT NULL,
    password_hash text COLLATE pg_catalog."default" NOT NULL,
    full_name character varying(255) COLLATE pg_catalog."default",
    role character varying(50) COLLATE pg_catalog."default" NOT NULL,
    email_notifications_enabled boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone,
    CONSTRAINT users_pkey PRIMARY KEY (user_id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_username_key UNIQUE (username),
    CONSTRAINT users_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.invitations
(
    id bigserial NOT NULL,
    email text COLLATE pg_catalog."default" NOT NULL,
    token text COLLATE pg_catalog."default" NOT NULL DEFAULT gen_random_uuid(),
    user_role text COLLATE pg_catalog."default" NOT NULL,
    invited_name text COLLATE pg_catalog."default",
    expires_at timestamp with time zone NOT NULL DEFAULT (now() + '48:00:00'::interval),
    used_at timestamp with time zone,
    created_by integer,
    updated_at timestamp with time zone,
    customer_id integer,
    temp_password_hash text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT invitations_pkey PRIMARY KEY (id),
    CONSTRAINT invitations_token_key UNIQUE (token),
    CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION,
    CONSTRAINT invitations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.inward
(
    inward_id serial NOT NULL,
    customer_id integer,
    srf_no character varying(100) COLLATE pg_catalog."default" NOT NULL,
    material_inward_date date NOT NULL,
    customer_dc_no character varying(255) COLLATE pg_catalog."default",
    customer_dc_date date NOT NULL,
    customer_details character varying(255) COLLATE pg_catalog."default",
    received_by character varying COLLATE pg_catalog."default",
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    status character varying(50) COLLATE pg_catalog."default",
    draft_data jsonb,
    is_draft boolean,
    draft_updated_at timestamp with time zone,
    inward_srf_flag boolean NOT NULL DEFAULT false,
    received_date date,
    CONSTRAINT inward_pkey PRIMARY KEY (inward_id),
    CONSTRAINT inward_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION,
    CONSTRAINT inward_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers (customer_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT inward_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.lab_scope
(
    id serial NOT NULL,
    laboratory_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    accreditation_standard character varying(255) COLLATE pg_catalog."default",
    lab_unique_number character varying(100) COLLATE pg_catalog."default",
    valid_from date,
    valid_upto date,
    is_active boolean,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    document_storage_name character varying(255) COLLATE pg_catalog."default",
    document_filename character varying(255) COLLATE pg_catalog."default",
    document_content_type character varying(128) COLLATE pg_catalog."default",
    CONSTRAINT lab_scope_pkey PRIMARY KEY (id),
    CONSTRAINT lab_scope_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    token character varying COLLATE pg_catalog."default" NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT password_reset_tokens_token_key UNIQUE (token),
    CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.refresh_tokens
(
    id serial NOT NULL,
    user_id integer NOT NULL,
    token text COLLATE pg_catalog."default" NOT NULL,
    expiry_time timestamp with time zone NOT NULL,
    is_revoked integer,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT refresh_tokens_token_key UNIQUE (token),
    CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.delayed_email_tasks
(
    id serial NOT NULL,
    inward_id integer NOT NULL,
    recipient_email character varying(320) COLLATE pg_catalog."default",
    email_type character varying(50) COLLATE pg_catalog."default",
    scheduled_at timestamp with time zone NOT NULL,
    is_sent boolean,
    is_cancelled boolean,
    reminder_sent boolean,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    CONSTRAINT delayed_email_tasks_pkey PRIMARY KEY (id),
    CONSTRAINT delayed_email_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION,
    CONSTRAINT delayed_email_tasks_inward_id_fkey FOREIGN KEY (inward_id) REFERENCES public.inward (inward_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.inward_equipments
(
    inward_eqp_id serial NOT NULL,
    inward_id integer,
    nepl_id character varying(100) COLLATE pg_catalog."default" NOT NULL,
    material_description character varying(500) COLLATE pg_catalog."default",
    make character varying(255) COLLATE pg_catalog."default",
    model character varying(255) COLLATE pg_catalog."default",
    range character varying(255) COLLATE pg_catalog."default",
    unit character varying(50) COLLATE pg_catalog."default",
    status character varying(50) COLLATE pg_catalog."default",
    serial_no character varying(255) COLLATE pg_catalog."default",
    quantity integer NOT NULL,
    visual_inspection_notes text COLLATE pg_catalog."default",
    photos jsonb,
    calibration_by character varying(50) COLLATE pg_catalog."default",
    supplier character varying(255) COLLATE pg_catalog."default",
    out_dc character varying(255) COLLATE pg_catalog."default",
    in_dc character varying(255) COLLATE pg_catalog."default",
    nextage_contract_reference character varying(255) COLLATE pg_catalog."default",
    accessories_included text COLLATE pg_catalog."default",
    qr_code text COLLATE pg_catalog."default",
    barcode text COLLATE pg_catalog."default",
    engineer_remarks character varying(255) COLLATE pg_catalog."default",
    customer_remarks character varying(255) COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT inward_equipments_pkey PRIMARY KEY (inward_eqp_id),
    CONSTRAINT inward_equipments_inward_id_fkey FOREIGN KEY (inward_id) REFERENCES public.inward (inward_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.notifications
(
    id serial NOT NULL,
    recipient_user_id integer,
    to_email character varying(255) COLLATE pg_catalog."default",
    inward_id integer,
    subject text COLLATE pg_catalog."default",
    body_text text COLLATE pg_catalog."default",
    email_sent_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by character varying(255) COLLATE pg_catalog."default",
    status character varying(30) COLLATE pg_catalog."default",
    error text COLLATE pg_catalog."default",
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_inward_id_fkey FOREIGN KEY (inward_id) REFERENCES public.inward (inward_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION,
    CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.srfs
(
    srf_id serial NOT NULL,
    inward_id integer,
    srf_no character varying COLLATE pg_catalog."default" NOT NULL,
    nepl_srf_no character varying(100) COLLATE pg_catalog."default",
    date date NOT NULL,
    telephone character varying(50) COLLATE pg_catalog."default",
    contact_person character varying(255) COLLATE pg_catalog."default",
    email character varying(320) COLLATE pg_catalog."default",
    certificate_issue_name character varying(255) COLLATE pg_catalog."default",
    certificate_issue_adress text COLLATE pg_catalog."default",
    calibration_frequency character varying(100) COLLATE pg_catalog."default",
    statement_of_conformity boolean,
    ref_iso_is_doc boolean,
    ref_manufacturer_manual boolean,
    ref_customer_requirement boolean,
    turnaround_time integer,
    remark_special_instructions text COLLATE pg_catalog."default",
    remarks text COLLATE pg_catalog."default",
    status character varying(50) COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    is_draft boolean,
    draft_data json,
    draft_updated_at timestamp with time zone,
    resources_capability_reviewed_cal boolean,
    CONSTRAINT srfs_pkey PRIMARY KEY (srf_id),
    CONSTRAINT srfs_nepl_srf_no_key UNIQUE (nepl_srf_no),
    CONSTRAINT srfs_inward_id_fkey FOREIGN KEY (inward_id) REFERENCES public.inward (inward_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.external_deviation
(
    id serial NOT NULL,
    inward_eqp_id integer NOT NULL,
    deviation_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    tool_status character varying(50) COLLATE pg_catalog."default",
    step_per_deviation jsonb NOT NULL,
    created_by integer,
    engineer_remarks text COLLATE pg_catalog."default",
    customer_decision text COLLATE pg_catalog."default",
    report date,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    hide_customer_visibility boolean NOT NULL DEFAULT false,
    CONSTRAINT external_deviation_pkey PRIMARY KEY (id),
    CONSTRAINT external_deviation_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT external_deviation_inward_eqp_id_fkey FOREIGN KEY (inward_eqp_id) REFERENCES public.inward_equipments (inward_eqp_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.external_uploads
(
    id serial NOT NULL,
    inward_eqp_id integer NOT NULL,
    calibration_worksheet_file_name character varying(255) COLLATE pg_catalog."default",
    calibration_worksheet_file_type character varying(255) COLLATE pg_catalog."default",
    calibration_worksheet_file_url text COLLATE pg_catalog."default",
    calibration_worksheet_locked boolean NOT NULL,
    calibration_worksheet_unlock_request jsonb,
    certificate_file_name character varying(255) COLLATE pg_catalog."default",
    certificate_file_type character varying(50) COLLATE pg_catalog."default",
    certificate_file_url text COLLATE pg_catalog."default",
    certificate_locked boolean NOT NULL,
    certificate_unlock_request jsonb,
    report_date date,
    recommended_cal_due_date date,
    created_by integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT external_uploads_pkey PRIMARY KEY (id),
    CONSTRAINT external_uploads_inward_eqp_id_key UNIQUE (inward_eqp_id),
    CONSTRAINT external_uploads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT external_uploads_inward_eqp_id_fkey FOREIGN KEY (inward_eqp_id) REFERENCES public.inward_equipments (inward_eqp_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.srf_equipments
(
    srf_eqp_id serial NOT NULL,
    srf_id integer,
    inward_eqp_id integer,
    unit text COLLATE pg_catalog."default",
    status character varying(50) COLLATE pg_catalog."default",
    no_of_calibration_points character varying COLLATE pg_catalog."default",
    mode_of_calibration text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT srf_equipments_pkey PRIMARY KEY (srf_eqp_id),
    CONSTRAINT srf_equipments_inward_eqp_id_key UNIQUE (inward_eqp_id),
    CONSTRAINT srf_equipments_inward_eqp_id_fkey FOREIGN KEY (inward_eqp_id) REFERENCES public.inward_equipments (inward_eqp_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT srf_equipments_srf_id_fkey FOREIGN KEY (srf_id) REFERENCES public.srfs (srf_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.external_deviation_attachments
(
    id serial NOT NULL,
    external_deviation_id integer NOT NULL,
    file_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    file_type character varying(255) COLLATE pg_catalog."default",
    file_url text COLLATE pg_catalog."default" NOT NULL,
    uploaded_by integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT external_deviation_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT external_deviation_attachments_external_deviation_id_fkey FOREIGN KEY (external_deviation_id) REFERENCES public.external_deviation (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT external_deviation_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS public.htw_job
(
    job_id serial NOT NULL,
    inward_id integer,
    inward_eqp_id integer,
    srf_id integer,
    srf_eqp_id integer,
    pressure_gauge_ref_id integer,
    res_pressure double precision,
    range_min numeric(14, 4),
    range_max numeric(14, 4),
    date date,

    type text COLLATE pg_catalog."default"
        DEFAULT 'indicating'::text,

    classification text COLLATE pg_catalog."default"
        DEFAULT 'Type I Class C'::text,

    job_status text COLLATE pg_catalog."default",

    created_at timestamp with time zone
        DEFAULT now(),

    calibration_mode character varying(50)
        COLLATE pg_catalog."default",

    res_pressure_unit character varying(50)
        COLLATE pg_catalog."default",

    range_unit character varying(50)
        COLLATE pg_catalog."default",

    CONSTRAINT htw_job_pkey
        PRIMARY KEY (job_id),

    -- Retain uniqueness for inward equipment.
    CONSTRAINT htw_job_inward_eqp_id_key
        UNIQUE (inward_eqp_id),

    CONSTRAINT htw_job_inward_eqp_id_fkey
        FOREIGN KEY (inward_eqp_id)
        REFERENCES public.inward_equipments (inward_eqp_id)
        MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,

    CONSTRAINT htw_job_inward_id_fkey
        FOREIGN KEY (inward_id)
        REFERENCES public.inward (inward_id)
        MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,

    CONSTRAINT htw_job_pressure_gauge_ref_id_fkey
        FOREIGN KEY (pressure_gauge_ref_id)
        REFERENCES public.htw_pressure_gauge_resolution (id)
        MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,

    CONSTRAINT htw_job_srf_eqp_id_fkey
        FOREIGN KEY (srf_eqp_id)
        REFERENCES public.srf_equipments (srf_eqp_id)
        MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,

    CONSTRAINT htw_job_srf_id_fkey
        FOREIGN KEY (srf_id)
        REFERENCES public.srfs (srf_id)
        MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.certificate
(
    certificate_id serial NOT NULL,
    job_id integer NOT NULL,
    inward_id integer,
    inward_eqp_id integer,
    certificate_no character varying(255) COLLATE pg_catalog."default" NOT NULL,
    date_of_calibration date NOT NULL,
    ulr_no character varying(255) COLLATE pg_catalog."default",
    field_of_parameter character varying(255) COLLATE pg_catalog."default",
    recommended_cal_due_date date,
    item_status character varying(255) COLLATE pg_catalog."default",
    authorised_signatory character varying(255) COLLATE pg_catalog."default",
    status character varying(50) COLLATE pg_catalog."default" NOT NULL,
    admin_rework_comment text COLLATE pg_catalog."default",
    permissible_deviation_iso_6789 jsonb,
    iso_6789_results jsonb,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    approved_by integer,
    approved_at timestamp with time zone,
    issued_at timestamp with time zone,
    qr_token character varying(128) COLLATE pg_catalog."default",
    qr_image_base64 text COLLATE pg_catalog."default",
    qr_generated_at timestamp with time zone,
    CONSTRAINT certificate_pkey PRIMARY KEY (certificate_id),
    CONSTRAINT certificate_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT certificate_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT certificate_inward_eqp_id_fkey FOREIGN KEY (inward_eqp_id) REFERENCES public.inward_equipments (inward_eqp_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT certificate_inward_id_fkey FOREIGN KEY (inward_id) REFERENCES public.inward (inward_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT certificate_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_drive_interface_variation
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    set_torque_ts numeric(14, 4) NOT NULL,
    position_deg integer NOT NULL,
    mean_value numeric(18, 8),
    error_due_drive_interface_bint numeric(18, 8),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_drive_interface_variation_pkey PRIMARY KEY (id),
    CONSTRAINT uq_drive_interface_job_position UNIQUE (job_id, position_deg),
    CONSTRAINT htw_drive_interface_variation_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_job_environment
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    environment_config_id integer,
    condition_stage character varying(10) COLLATE pg_catalog."default" NOT NULL,
    ambient_temperature numeric(5, 2) NOT NULL,
    temperature_unit character varying(10) COLLATE pg_catalog."default",
    relative_humidity numeric(5, 2) NOT NULL,
    humidity_unit character varying(10) COLLATE pg_catalog."default",
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT htw_job_environment_pkey PRIMARY KEY (id),
    CONSTRAINT unique_job_condition_stage UNIQUE (job_id, condition_stage),
    CONSTRAINT htw_job_environment_environment_config_id_fkey FOREIGN KEY (environment_config_id) REFERENCES public.htw_environment_config (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT htw_job_environment_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_loading_point_variation
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    set_torque_ts numeric(14, 4) NOT NULL,
    loading_position_mm integer NOT NULL,
    mean_value numeric(18, 8),
    error_due_loading_point_bl numeric(18, 8),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_loading_point_variation_pkey PRIMARY KEY (id),
    CONSTRAINT uq_loading_point_job_position UNIQUE (job_id, loading_position_mm),
    CONSTRAINT htw_loading_point_variation_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_output_drive_variation
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    set_torque_ts numeric(14, 4) NOT NULL,
    position_deg integer NOT NULL,
    mean_value numeric(18, 8),
    error_due_output_drive_bout numeric(18, 8),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_output_drive_variation_pkey PRIMARY KEY (id),
    CONSTRAINT uq_output_drive_job_position UNIQUE (job_id, position_deg),
    CONSTRAINT htw_output_drive_variation_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_reproducibility
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    set_torque_ts numeric(14, 4) NOT NULL,
    sequence_no integer NOT NULL,
    mean_xr numeric(18, 8),
    error_due_to_reproducibility numeric(18, 8),
    created_at timestamp with time zone,
    CONSTRAINT htw_reproducibility_pkey PRIMARY KEY (id),
    CONSTRAINT htw_reproducibility_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.htw_un_resolution
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    step_percent numeric(5, 2) NOT NULL,
    measurement_error jsonb NOT NULL,
    relative_measurement_error jsonb NOT NULL,
    deviation jsonb NOT NULL,
    a_s numeric(18, 8),
    variation_due_to_repeatability numeric(18, 8),
    created_at date,
    CONSTRAINT htw_un_resolution_pkey PRIMARY KEY (id),
    CONSTRAINT htw_un_resolution_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_uncertainty_budget
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    step_percent numeric(5, 2) NOT NULL,
    set_torque_ts numeric(14, 4) NOT NULL,
    delta_s_un numeric(18, 8),
    delta_p numeric(18, 8),
    wmd numeric(18, 8),
    wr numeric(18, 8),
    wrep numeric(18, 8),
    wod numeric(18, 8),
    wint numeric(18, 8),
    wl numeric(18, 8),
    wre numeric(18, 8),
    combined_uncertainty numeric(18, 8),
    effective_dof numeric(18, 8),
    coverage_factor numeric(6, 3),
    expanded_uncertainty numeric(18, 8),
    expanded_un_nm numeric(18, 8),
    mean_measurement_error numeric(18, 8),
    max_device_error numeric(18, 8),
    final_wl numeric(18, 8),
    cmc numeric(18, 8),
    cmc_of_reading numeric(18, 8),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_uncertainty_budget_pkey PRIMARY KEY (id),
    CONSTRAINT htw_uncertainty_budget_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.deviation
(
    id serial NOT NULL,
    inward_eqp_id integer NOT NULL,
    certificate_id integer,
    created_by integer,
    status character varying(50) COLLATE pg_catalog."default" NOT NULL DEFAULT 'OPEN'::character varying,
    calibration_status character varying(50) COLLATE pg_catalog."default" NOT NULL DEFAULT 'not calibrated'::character varying,
    engineer_remarks text COLLATE pg_catalog."default",
    customer_decision text COLLATE pg_catalog."default",
    report date,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    job_id integer,
    hide_customer_visibility boolean NOT NULL DEFAULT false,
    CONSTRAINT deviation_pkey PRIMARY KEY (id),
    CONSTRAINT deviation_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.certificate (certificate_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT deviation_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT deviation_inward_eqp_id_fkey FOREIGN KEY (inward_eqp_id) REFERENCES public.inward_equipments (inward_eqp_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT deviation_job_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_drive_interface_variation_reading
(
    id serial NOT NULL,
    drive_interface_variation_id integer NOT NULL,
    reading_order integer NOT NULL,
    indicated_reading numeric(14, 4) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_drive_interface_variation_reading_pkey PRIMARY KEY (id),
    CONSTRAINT uq_drive_interface_reading_order UNIQUE (drive_interface_variation_id, reading_order),
    CONSTRAINT htw_drive_interface_variation_drive_interface_variation_id_fkey FOREIGN KEY (drive_interface_variation_id) REFERENCES public.htw_drive_interface_variation (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_loading_point_variation_reading
(
    id serial NOT NULL,
    loading_point_variation_id integer NOT NULL,
    reading_order integer NOT NULL,
    indicated_reading numeric(14, 4) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_loading_point_variation_reading_pkey PRIMARY KEY (id),
    CONSTRAINT uq_loading_point_reading_order UNIQUE (loading_point_variation_id, reading_order),
    CONSTRAINT htw_loading_point_variation_rea_loading_point_variation_id_fkey FOREIGN KEY (loading_point_variation_id) REFERENCES public.htw_loading_point_variation (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_output_drive_variation_reading
(
    id serial NOT NULL,
    output_drive_variation_id integer NOT NULL,
    reading_order integer NOT NULL,
    indicated_reading numeric(14, 4) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_output_drive_variation_reading_pkey PRIMARY KEY (id),
    CONSTRAINT uq_output_drive_reading_order UNIQUE (output_drive_variation_id, reading_order),
    CONSTRAINT htw_output_drive_variation_readi_output_drive_variation_id_fkey FOREIGN KEY (output_drive_variation_id) REFERENCES public.htw_output_drive_variation (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_reproducibility_reading
(
    id serial NOT NULL,
    reproducibility_id integer NOT NULL,
    reading_order integer NOT NULL,
    indicated_reading numeric(14, 4) NOT NULL,
    created_at timestamp with time zone,
    CONSTRAINT htw_reproducibility_reading_pkey PRIMARY KEY (id),
    CONSTRAINT htw_reproducibility_reading_reproducibility_id_fkey FOREIGN KEY (reproducibility_id) REFERENCES public.htw_reproducibility (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.deviation_attachments
(
    id serial NOT NULL,
    deviation_id integer NOT NULL,
    file_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    file_type character varying(50) COLLATE pg_catalog."default",
    file_url text COLLATE pg_catalog."default" NOT NULL,
    uploaded_by integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT deviation_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT deviation_attachments_deviation_id_fkey FOREIGN KEY (deviation_id) REFERENCES public.deviation (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT deviation_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users (user_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.htw_repeatability
(
    id serial NOT NULL,
    job_id integer NOT NULL,
    step_percent numeric(5, 2) NOT NULL,
    set_pressure_ps numeric(14, 4),
    set_torque_ts numeric(14, 4),
    mean_xr numeric(18, 8),
    corrected_standard numeric(18, 8),
    corrected_mean numeric(18, 8),
    deviation_percent numeric(18, 8),
    created_at timestamp with time zone DEFAULT now(),
    deviation_id integer,
    CONSTRAINT htw_repeatability_pkey PRIMARY KEY (id),
    CONSTRAINT htw_repeatability_job_id_step_percent_key UNIQUE (job_id, step_percent),
    CONSTRAINT fk_htw_repeatability_deviation_id FOREIGN KEY (deviation_id) REFERENCES public.deviation (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE SET NULL,
    CONSTRAINT htw_repeatability_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.htw_job (job_id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.htw_repeatability_reading
(
    id serial NOT NULL,
    repeatability_id integer NOT NULL,
    reading_order integer NOT NULL,
    indicated_reading numeric(14, 4) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT htw_repeatability_reading_pkey PRIMARY KEY (id),
    CONSTRAINT htw_repeatability_reading_key UNIQUE (repeatability_id, reading_order),
    CONSTRAINT htw_repeatability_reading_repeatability_id_fkey FOREIGN KEY (repeatability_id) REFERENCES public.htw_repeatability (id) MATCH SIMPLE ON UPDATE NO ACTION ON DELETE CASCADE
);

-- Explicit indexes from the pgAdmin export.
CREATE INDEX IF NOT EXISTS external_uploads_inward_eqp_id_key
    ON public.external_uploads(inward_eqp_id);
CREATE INDEX IF NOT EXISTS htw_job_inward_eqp_id_key
    ON public.htw_job(inward_eqp_id);
CREATE INDEX IF NOT EXISTS ix_htw_job_inward_id
    ON public.htw_job(inward_id);
CREATE INDEX IF NOT EXISTS ix_htw_job_environment_job_id
    ON public.htw_job_environment(job_id);
CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id
    ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id
    ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS srf_equipments_inward_eqp_id_key
    ON public.srf_equipments(inward_eqp_id);
CREATE INDEX IF NOT EXISTS ix_srfs_inward_id
    ON public.srfs(inward_id);

COMMIT;
