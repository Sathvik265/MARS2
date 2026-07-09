--
-- PostgreSQL database dump
--

\restrict fpTc3WfKcWPtzOUxeo8Rb2sGLoxNGnvwM79hpBmy6JtOimYaChvTTmM7beS3nbA

-- Dumped from database version 18.4 (Homebrew)
-- Dumped by pg_dump version 18.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE restaurant_billing_db;
--
-- Name: restaurant_billing_db; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE restaurant_billing_db WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.UTF-8';


ALTER DATABASE restaurant_billing_db OWNER TO postgres;

\unrestrict fpTc3WfKcWPtzOUxeo8Rb2sGLoxNGnvwM79hpBmy6JtOimYaChvTTmM7beS3nbA
\connect restaurant_billing_db
\restrict fpTc3WfKcWPtzOUxeo8Rb2sGLoxNGnvwM79hpBmy6JtOimYaChvTTmM7beS3nbA

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: get_category_totals_for_date(date); Type: FUNCTION; Schema: public; Owner: sathvikkemtur
--

CREATE FUNCTION public.get_category_totals_for_date(p_date date) RETURNS TABLE(category_name character varying, total_quantity integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cat->>'name' AS category_name,
        SUM((item->>'quantity')::integer * (cat->>'qty')::integer)::integer AS total_quantity
    FROM public.bills b
    CROSS JOIN LATERAL jsonb_array_elements(b.items_json) AS item
    CROSS JOIN LATERAL (
        SELECT i.category
        FROM public.items i
        WHERE i.alpha_code = item->>'item_code_alpha'
           OR i.numeric_code = item->>'item_code_numeric'
        LIMIT 1
    ) AS item_info
    CROSS JOIN LATERAL jsonb_array_elements(item_info.category) AS cat
    WHERE b.bill_date = p_date
    GROUP BY cat->>'name'
    ORDER BY total_quantity DESC;
END;
$$;


ALTER FUNCTION public.get_category_totals_for_date(p_date date) OWNER TO sathvikkemtur;

--
-- Name: get_current_session_id(character varying, date, character varying); Type: FUNCTION; Schema: public; Owner: sathvikkemtur
--

CREATE FUNCTION public.get_current_session_id(p_shift_type character varying DEFAULT NULL::character varying, p_target_date date DEFAULT NULL::date, p_clerk_initials character varying DEFAULT NULL::character varying) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    session_uuid uuid;
    v_shift_type character varying;
    v_target_date date := COALESCE(p_target_date, CURRENT_DATE);
BEGIN
    v_shift_type := COALESCE(p_shift_type, CASE
        WHEN CURRENT_TIME BETWEEN '06:00:00'::time without time zone AND '11:59:59'::time without time zone THEN '`'::character varying
        WHEN CURRENT_TIME BETWEEN '12:00:00'::time without time zone AND '17:59:59'::time without time zone THEN '``'::character varying
        WHEN CURRENT_TIME BETWEEN '18:00:00'::time without time zone AND '21:59:59'::time without time zone THEN 'RBS1'::character varying
        ELSE 'RBS2'::character varying END);
    SELECT s.session_id INTO session_uuid FROM public.sessions s
    WHERE s.shift_name::text = v_shift_type::text AND s.session_date = v_target_date AND s.status::text = 'OPEN'::text
      AND (p_clerk_initials IS NULL OR s.clerk_initials::text = p_clerk_initials::text)
    ORDER BY s.start_time DESC LIMIT 1;
    RETURN session_uuid;
END;
$$;


ALTER FUNCTION public.get_current_session_id(p_shift_type character varying, p_target_date date, p_clerk_initials character varying) OWNER TO sathvikkemtur;

--
-- Name: get_section_by_table(character varying); Type: FUNCTION; Schema: public; Owner: sathvikkemtur
--

CREATE FUNCTION public.get_section_by_table(p_table_no character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    section_name character varying(100);
    table_num integer;
BEGIN
    BEGIN
        table_num := p_table_no::integer;
    EXCEPTION WHEN OTHERS THEN
        RETURN 'Unknown';
    END;
    SELECT t.section_name INTO section_name FROM public.tables t WHERE t.table_id = table_num;
    RETURN COALESCE(section_name, 'Unknown');
END;
$$;


ALTER FUNCTION public.get_section_by_table(p_table_no character varying) OWNER TO sathvikkemtur;

--
-- Name: move_orders_to_bill_json(integer, text, text); Type: FUNCTION; Schema: public; Owner: sathvikkemtur
--

CREATE FUNCTION public.move_orders_to_bill_json(p_bill_id integer, p_table_no text, p_party_no text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_bill_items JSONB;
BEGIN
    -- Aggregating orders into a JSONB array including is_separate flag from orders table (or fallback to items default)
    SELECT jsonb_agg(
        jsonb_build_object(
            'item_name', o.item_name,
            'item_code_numeric', o.numeric_item_code,
            'item_code_alpha', o.item_code,
            'quantity', o.quantity,
            'fixed_price', o.unit_price,
            'actual_price', o.unit_price,
            'line_total', o.line_total,
            'is_separate', COALESCE(o.is_separate, i.is_separate, false),
            'categories', COALESCE(i.category, '[]'::jsonb) -- Key changed to 'categories' to support dashboard/reporting controller
        )
        ORDER BY o.id
    )
    INTO v_bill_items
    FROM public.orders o
    LEFT JOIN public.items i ON (i.alpha_code = o.item_code OR i.numeric_code = o.numeric_item_code)
    WHERE o.table_no::text = p_table_no
    AND o.party_no::text = p_party_no;

    -- Handle empty items case
    IF v_bill_items IS NULL THEN
        v_bill_items := '[]'::jsonb;
    END IF;

    -- Update the bill items_json and legacy items column
    UPDATE public.bills 
    SET items_json = v_bill_items,
        items = v_bill_items
    WHERE id = p_bill_id;

    -- Delete the moved orders
    DELETE FROM public.orders 
    WHERE table_no::text = p_table_no 
    AND party_no::text = p_party_no;
END;
$$;


ALTER FUNCTION public.move_orders_to_bill_json(p_bill_id integer, p_table_no text, p_party_no text) OWNER TO sathvikkemtur;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    event_id uuid DEFAULT public.uuid_generate_v4(),
    timestamp_utc timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    performed_by_user_id character varying(50),
    performed_by_user_name character varying(100),
    user_role character varying(20),
    action_type character varying(50),
    resource_type character varying(50),
    resource_id character varying(50),
    shift_session_id uuid,
    ip_address inet,
    payload jsonb,
    correlation_id uuid
);


ALTER TABLE public.audit_log OWNER TO sathvikkemtur;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_log_id_seq OWNER TO sathvikkemtur;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: bill_items; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.bill_items (
    bill_item_id integer NOT NULL,
    bill_id integer NOT NULL,
    item_name character varying(255) NOT NULL,
    quantity integer NOT NULL,
    price_per_item numeric(10,2) NOT NULL,
    line_total numeric(10,2),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.bill_items OWNER TO sathvikkemtur;

--
-- Name: bill_items_bill_item_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.bill_items_bill_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bill_items_bill_item_id_seq OWNER TO sathvikkemtur;

--
-- Name: bill_items_bill_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.bill_items_bill_item_id_seq OWNED BY public.bill_items.bill_item_id;


--
-- Name: bills; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.bills (
    id integer NOT NULL,
    bill_number integer NOT NULL,
    bill_date date NOT NULL,
    table_no integer,
    party_no character varying(20) DEFAULT '1'::character varying,
    section character varying(10) DEFAULT 'G'::character varying,
    track character varying(20),
    clerk_initials character varying(10),
    subtotal numeric(10,2) DEFAULT 0.00,
    sgst numeric(10,2) DEFAULT 0.00,
    cgst numeric(10,2) DEFAULT 0.00,
    tax_amount numeric(10,2) DEFAULT 0.00,
    grand_total numeric(10,2) DEFAULT 0.00,
    items_json jsonb DEFAULT '[]'::jsonb,
    items jsonb DEFAULT '[]'::jsonb,
    order_id character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.bills OWNER TO sathvikkemtur;

--
-- Name: bills_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.bills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bills_id_seq OWNER TO sathvikkemtur;

--
-- Name: bills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.bills_id_seq OWNED BY public.bills.id;


--
-- Name: debug_logs; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.debug_logs (
    id integer NOT NULL,
    message text,
    data jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.debug_logs OWNER TO sathvikkemtur;

--
-- Name: debug_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.debug_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.debug_logs_id_seq OWNER TO sathvikkemtur;

--
-- Name: debug_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.debug_logs_id_seq OWNED BY public.debug_logs.id;


--
-- Name: items; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.items (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    alpha_code character varying(20),
    numeric_code character varying(20),
    price_fixed numeric(10,2) DEFAULT 0.00,
    price_general numeric(10,2) DEFAULT 0.00,
    price_ac numeric(10,2) DEFAULT 0.00,
    category jsonb DEFAULT '[]'::jsonb,
    is_separate boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_category_format CHECK (((category IS NULL) OR (jsonb_typeof(category) = 'array'::text)))
);


ALTER TABLE public.items OWNER TO sathvikkemtur;

--
-- Name: items_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.items_id_seq OWNER TO sathvikkemtur;

--
-- Name: items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.items_id_seq OWNED BY public.items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    track character varying(20) NOT NULL,
    clerk_initials character varying(10) NOT NULL,
    table_no integer NOT NULL,
    party_no character varying(20) DEFAULT '1'::character varying NOT NULL,
    bill_number integer NOT NULL,
    bill_date date DEFAULT CURRENT_DATE NOT NULL,
    item_code character varying(20),
    numeric_item_code character varying(20),
    item_name character varying(255),
    quantity integer DEFAULT 1,
    unit_price numeric(10,2) DEFAULT 0.00,
    line_total numeric(10,2) DEFAULT 0.00,
    is_separate boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.orders OWNER TO sathvikkemtur;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO sathvikkemtur;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: pending_bills; Type: VIEW; Schema: public; Owner: sathvikkemtur
--

CREATE VIEW public.pending_bills AS
 SELECT DISTINCT table_no,
    party_no,
    public.get_section_by_table((table_no)::character varying) AS section_name,
    count(id) AS total_items,
    sum(line_total) AS total_amount,
    min(created_at) AS order_started_at,
    max(updated_at) AS last_updated_at
   FROM public.orders o
  GROUP BY table_no, party_no;


ALTER VIEW public.pending_bills OWNER TO sathvikkemtur;

--
-- Name: running_bills; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.running_bills (
    id integer DEFAULT 1 NOT NULL,
    track_morning integer DEFAULT 0,
    track_afternoon integer DEFAULT 0,
    track_rbs1 integer DEFAULT 0,
    track_rbs2 integer DEFAULT 0
);


ALTER TABLE public.running_bills OWNER TO sathvikkemtur;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    session_id uuid DEFAULT public.uuid_generate_v4(),
    shift_name character varying(20) NOT NULL,
    clerk_initials character varying(10) NOT NULL,
    session_date date NOT NULL,
    start_time timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp with time zone,
    status character varying(10) DEFAULT 'OPEN'::character varying NOT NULL,
    closed_by character varying(50),
    is_locked boolean DEFAULT false NOT NULL,
    last_bill_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sessions_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying])::text[])))
);


ALTER TABLE public.sessions OWNER TO sathvikkemtur;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessions_id_seq OWNER TO sathvikkemtur;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    hotel_name character varying(255) DEFAULT 'Restaurant Name'::character varying,
    address text,
    phone character varying(20),
    gstin character varying(20),
    clerk_initials character varying(10) DEFAULT 'CLK'::character varying,
    sgst_percentage numeric(5,2) DEFAULT 2.50,
    cgst_percentage numeric(5,2) DEFAULT 2.50,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.settings OWNER TO sathvikkemtur;

--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.settings_id_seq OWNER TO sathvikkemtur;

--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    shift_name character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT shifts_shift_name_check CHECK (((shift_name)::text = ANY ((ARRAY['`'::character varying, '``'::character varying, 'RBS'::character varying, 'RBS1'::character varying])::text[])))
);


ALTER TABLE public.shifts OWNER TO sathvikkemtur;

--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: sathvikkemtur
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shifts_id_seq OWNER TO sathvikkemtur;

--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sathvikkemtur
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: tables; Type: TABLE; Schema: public; Owner: sathvikkemtur
--

CREATE TABLE public.tables (
    table_id integer NOT NULL,
    section_name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tables OWNER TO sathvikkemtur;

--
-- Name: table_status; Type: VIEW; Schema: public; Owner: sathvikkemtur
--

CREATE VIEW public.table_status AS
 SELECT t.table_id,
    t.section_name,
        CASE
            WHEN (pb.table_no IS NOT NULL) THEN 'OCCUPIED'::text
            ELSE 'AVAILABLE'::text
        END AS status,
    pb.total_items,
    pb.total_amount,
    pb.order_started_at
   FROM (public.tables t
     LEFT JOIN public.pending_bills pb ON ((t.table_id = pb.table_no)))
  ORDER BY t.table_id;


ALTER VIEW public.table_status OWNER TO sathvikkemtur;

--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: bill_items bill_item_id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.bill_items ALTER COLUMN bill_item_id SET DEFAULT nextval('public.bill_items_bill_item_id_seq'::regclass);


--
-- Name: bills id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.bills ALTER COLUMN id SET DEFAULT nextval('public.bills_id_seq'::regclass);


--
-- Name: debug_logs id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.debug_logs ALTER COLUMN id SET DEFAULT nextval('public.debug_logs_id_seq'::regclass);


--
-- Name: items id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.items ALTER COLUMN id SET DEFAULT nextval('public.items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.audit_log (id, event_id, timestamp_utc, performed_by_user_id, performed_by_user_name, user_role, action_type, resource_type, resource_id, shift_session_id, ip_address, payload, correlation_id) FROM stdin;
\.


--
-- Data for Name: bill_items; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.bill_items (bill_item_id, bill_id, item_name, quantity, price_per_item, line_total, created_at) FROM stdin;
\.


--
-- Data for Name: bills; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.bills (id, bill_number, bill_date, table_no, party_no, section, track, clerk_initials, subtotal, sgst, cgst, tax_amount, grand_total, items_json, items, order_id, created_at) FROM stdin;
122	39	2026-07-06	10	1	G	RBS1	SRIHARI	120.00	3.00	3.00	6.00	120.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	ORD-10-1-1783347922457	2026-07-06 19:55:19.505+05:30
124	0	2026-07-06	25	1	G	RBS1	SRIHARI	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 19:55:41.761+05:30
123	40	2026-07-06	19	1	G	RBS1	SRIHARI	91.00	2.27	2.27	4.54	91.00	[{"quantity": 1, "item_name": "VEG.BERYANI", "categories": [], "line_total": 67.00, "fixed_price": 67.00, "is_separate": false, "actual_price": 67.00, "item_code_alpha": "VEB", "item_code_numeric": "118"}, {"quantity": 1, "item_name": "BAR", "categories": [], "line_total": 24.00, "fixed_price": 24.00, "is_separate": false, "actual_price": 24.00, "item_code_alpha": "CCC", "item_code_numeric": "306"}]	[{"quantity": 1, "item_name": "VEG.BERYANI", "categories": [], "line_total": 67.00, "fixed_price": 67.00, "is_separate": false, "actual_price": 67.00, "item_code_alpha": "VEB", "item_code_numeric": "118"}, {"quantity": 1, "item_name": "BAR", "categories": [], "line_total": 24.00, "fixed_price": 24.00, "is_separate": false, "actual_price": 24.00, "item_code_alpha": "CCC", "item_code_numeric": "306"}]	ORD-19-1-1783347961280	2026-07-06 19:55:28.472+05:30
3	1	2026-06-21	1	1	G	`	SRIHARI	34.20	0.90	0.90	1.80	36.00	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 36.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 36.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	ORD-1-1-1782038574762	2026-06-21 16:05:15.324+05:30
125	41	2026-07-06	1	1	G	RBS1	SRIHARI	55.00	1.38	1.38	2.76	55.00	[{"quantity": 1, "item_name": "JAMOON", "categories": [], "line_total": 35.00, "fixed_price": 35.00, "is_separate": false, "actual_price": 35.00, "item_code_alpha": "JUJ", "item_code_numeric": "151"}, {"quantity": 1, "item_name": "B.SCOTCH CUP", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "FTR", "item_code_numeric": "302"}]	[{"quantity": 1, "item_name": "JAMOON", "categories": [], "line_total": 35.00, "fixed_price": 35.00, "is_separate": false, "actual_price": 35.00, "item_code_alpha": "JUJ", "item_code_numeric": "151"}, {"quantity": 1, "item_name": "B.SCOTCH CUP", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "FTR", "item_code_numeric": "302"}]	ORD-1-1-1783348188255	2026-07-06 19:59:29.1+05:30
39	11	2026-07-05	23	1	G	``	CLK	57.94	1.53	1.53	3.06	61.00	[{"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}]	[{"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}]	ORD-23-1-1783233155851	2026-07-05 12:02:34.064+05:30
25	4	2026-07-05	22	1	G	RBS	SRIHARI	20.90	0.55	0.55	1.10	22.00	[{"quantity": 1, "item_name": "EXTRA PAV", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "PAV", "item_code_numeric": "205"}]	[{"quantity": 1, "item_name": "EXTRA PAV", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "PAV", "item_code_numeric": "205"}]	ORD-22-1-1783223407824	2026-07-05 09:20:05.208+05:30
26	0	2026-07-05	10	1	G	`	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-05 09:24:44.594+05:30
40	12	2026-07-05	1	1	G	``	CLK	124.44	3.28	3.28	6.56	131.00	[{"quantity": 1, "item_name": "BUTRMILK", "categories": [], "line_total": 27.00, "fixed_price": 27.00, "is_separate": false, "actual_price": 27.00, "item_code_alpha": "BTR", "item_code_numeric": "185"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	[{"quantity": 1, "item_name": "BUTRMILK", "categories": [], "line_total": 27.00, "fixed_price": 27.00, "is_separate": false, "actual_price": 27.00, "item_code_alpha": "BTR", "item_code_numeric": "185"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	ORD-1-1-1783233162734	2026-07-05 12:02:41.951+05:30
41	13	2026-07-05	1	1	G	``	CLK	95.00	2.50	2.50	5.00	100.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "Chapathi", "categories": [], "line_total": 52.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "CHA", "item_code_numeric": "129"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "Chapathi", "categories": [], "line_total": 52.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "CHA", "item_code_numeric": "129"}]	ORD-1-1-1783233402008	2026-07-05 12:04:20.079+05:30
4	2	2026-06-21	1	1	G	`	SRIHARI	34.20	0.90	0.90	1.80	36.00	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 36.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 36.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	ORD-1-1-1782038685011	2026-06-21 16:14:43.134+05:30
43	15	2026-07-05	13	1	G	``	SRIHARI	49.40	1.30	1.30	2.60	52.00	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 52.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}]	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 52.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}]	ORD-13-1-1783233930042	2026-07-05 12:15:20.216+05:30
45	17	2026-07-05	10	1	G	``	SRIHARI	51.30	1.35	1.35	2.70	54.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-10-1-1783250950528	2026-07-05 16:56:24.049+05:30
46	1	2026-07-05	1	1	G	RBS1	CLK	520.60	13.70	13.70	27.40	548.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 5, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 270.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 168.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PAV BAJI", "categories": [], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PBJ", "item_code_numeric": "201"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 5, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 270.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 168.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PAV BAJI", "categories": [], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PBJ", "item_code_numeric": "201"}]	ORD-1-1-1783252044398	2026-07-05 17:16:45.32+05:30
47	2	2026-07-05	15	1	G	RBS1	CLK	514.90	13.55	13.55	27.10	542.00	[{"quantity": 3, "item_name": "SAMOSA RAGADA", "categories": [], "line_total": 132.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "SAM", "item_code_numeric": "202"}, {"quantity": 4, "item_name": "MILK SHAKE", "categories": [], "line_total": 176.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "BDM", "item_code_numeric": "179"}, {"quantity": 2, "item_name": "70.MM.DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 212.00, "fixed_price": 106.00, "is_separate": false, "actual_price": 106.00, "item_code_alpha": "MMM", "item_code_numeric": "113"}, {"quantity": 1, "item_name": "EXTRA PAV", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "PAV", "item_code_numeric": "205"}]	[{"quantity": 3, "item_name": "SAMOSA RAGADA", "categories": [], "line_total": 132.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "SAM", "item_code_numeric": "202"}, {"quantity": 4, "item_name": "MILK SHAKE", "categories": [], "line_total": 176.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "BDM", "item_code_numeric": "179"}, {"quantity": 2, "item_name": "70.MM.DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 212.00, "fixed_price": 106.00, "is_separate": false, "actual_price": 106.00, "item_code_alpha": "MMM", "item_code_numeric": "113"}, {"quantity": 1, "item_name": "EXTRA PAV", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "PAV", "item_code_numeric": "205"}]	ORD-15-1-1783252208188	2026-07-05 17:19:29.068+05:30
48	3	2026-07-05	17	1	G	RBS1	CLK	211.84	5.58	5.58	11.16	223.00	[{"quantity": 2, "item_name": "AB SP IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 98.00, "fixed_price": 49.00, "is_separate": false, "actual_price": 49.00, "item_code_alpha": "SPI", "item_code_numeric": "112"}, {"quantity": 1, "item_name": "TEA + CUP", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 23.00, "fixed_price": 23.00, "is_separate": false, "actual_price": 23.00, "item_code_alpha": "AGH", "item_code_numeric": "135"}, {"quantity": 1, "item_name": "FILTR COFFEE", "categories": [{"qty": 1, "name": "coffee", "category_old": "coffee"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "COF", "item_code_numeric": "133"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 28.00, "fixed_price": 28.00, "is_separate": false, "actual_price": 28.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "MURKUL/MIXTURE", "categories": [], "line_total": 44.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "MUM", "item_code_numeric": "122"}]	[{"quantity": 2, "item_name": "AB SP IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 98.00, "fixed_price": 49.00, "is_separate": false, "actual_price": 49.00, "item_code_alpha": "SPI", "item_code_numeric": "112"}, {"quantity": 1, "item_name": "TEA + CUP", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 23.00, "fixed_price": 23.00, "is_separate": false, "actual_price": 23.00, "item_code_alpha": "AGH", "item_code_numeric": "135"}, {"quantity": 1, "item_name": "FILTR COFFEE", "categories": [{"qty": 1, "name": "coffee", "category_old": "coffee"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "COF", "item_code_numeric": "133"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 28.00, "fixed_price": 28.00, "is_separate": false, "actual_price": 28.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "MURKUL/MIXTURE", "categories": [], "line_total": 44.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "MUM", "item_code_numeric": "122"}]	ORD-17-1-1783252399337	2026-07-05 17:22:37.458+05:30
58	0	2026-07-05	1	1	G	RBS	SRIHARI	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-05 17:39:43.726+05:30
49	4	2026-07-05	1	1	G	RBS1	CLK	477.84	12.58	12.58	25.16	503.00	[{"quantity": 4, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 192.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 2, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 108.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "70.MM.DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 104.00, "fixed_price": 104.00, "is_separate": false, "actual_price": 104.00, "item_code_alpha": "MMM", "item_code_numeric": "113"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 57.00, "fixed_price": 57.00, "is_separate": false, "actual_price": 57.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "SAMOSA RAGADA", "categories": [], "line_total": 42.00, "fixed_price": 42.00, "is_separate": false, "actual_price": 42.00, "item_code_alpha": "SAM", "item_code_numeric": "202"}]	[{"quantity": 4, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 192.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 2, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 108.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "70.MM.DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 104.00, "fixed_price": 104.00, "is_separate": false, "actual_price": 104.00, "item_code_alpha": "MMM", "item_code_numeric": "113"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 57.00, "fixed_price": 57.00, "is_separate": false, "actual_price": 57.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "SAMOSA RAGADA", "categories": [], "line_total": 42.00, "fixed_price": 42.00, "is_separate": false, "actual_price": 42.00, "item_code_alpha": "SAM", "item_code_numeric": "202"}]	ORD-1-1-1783253311245	2026-07-05 17:26:45.039+05:30
119	38	2026-07-06	2	1	G	RBS1	SRIHARI	111.00	2.78	2.78	5.56	111.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 51.00, "fixed_price": 51.00, "is_separate": false, "actual_price": 51.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 51.00, "fixed_price": 51.00, "is_separate": false, "actual_price": 51.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-2-1-1783347911660	2026-07-06 15:19:04.856+05:30
70	0	2026-07-06	19	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:27:33.333+05:30
75	0	2026-07-06	15	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:28:51.235+05:30
76	0	2026-07-06	20	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:29:10.315+05:30
120	0	2026-07-06	10	1	G	``	SRIHARI	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 15:19:17.504+05:30
71	2	2026-07-06	18	1	G	RBS	CLK	130.00	3.25	3.25	6.50	130.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-18-1-1783317602992	2026-07-06 11:27:45.275+05:30
79	0	2026-07-06	18	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:30:10.221+05:30
80	0	2026-07-06	17	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:30:57.213+05:30
73	0	2026-07-06	27	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:28:05.571+05:30
74	0	2026-07-06	22	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:28:32.321+05:30
77	0	2026-07-06	21	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:29:24.995+05:30
78	0	2026-07-06	26	1	G	RBS	CLK	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 11:29:40.242+05:30
121	37	2026-07-06	1	1	G	RBS1	SRIHARI	144.00	3.60	3.60	7.20	144.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 51.00, "fixed_price": 51.00, "is_separate": false, "actual_price": 51.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "ALU BONDA", "categories": [], "line_total": 33.00, "fixed_price": 33.00, "is_separate": false, "actual_price": 33.00, "item_code_alpha": "ALU", "item_code_numeric": "124"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 51.00, "fixed_price": 51.00, "is_separate": false, "actual_price": 51.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "ALU BONDA", "categories": [], "line_total": 33.00, "fixed_price": 33.00, "is_separate": false, "actual_price": 33.00, "item_code_alpha": "ALU", "item_code_numeric": "124"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-1-1-1783347907949	2026-07-06 18:09:19.828+05:30
72	3	2026-07-06	17	1	G	RBS	CLK	148.00	3.70	3.70	7.40	148.00	[{"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-17-1-1783317647334	2026-07-06 11:27:56.073+05:30
110	28	2026-07-06	19	1	G	RBS1	SRIHARI	231.00	5.78	5.78	11.56	231.00	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 2, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 60.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 2, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 60.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-19-1-1783318864955	2026-07-06 11:50:58.866+05:30
112	29	2026-07-06	20	1	G	RBS1	SRIHARI	528.00	13.20	13.20	26.40	528.00	[{"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "TOMATO BATH", "categories": [], "line_total": 78.00, "fixed_price": 39.00, "is_separate": false, "actual_price": 39.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "EXTRA SAMBAR.", "categories": [], "line_total": 12.00, "fixed_price": 3.00, "is_separate": false, "actual_price": 3.00, "item_code_alpha": "EXS", "item_code_numeric": "186"}, {"quantity": 1, "item_name": "SAMBAR WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 72.00, "fixed_price": 72.00, "is_separate": false, "actual_price": 72.00, "item_code_alpha": "SAR", "item_code_numeric": "152"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 186.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "TOMATO BATH", "categories": [], "line_total": 78.00, "fixed_price": 39.00, "is_separate": false, "actual_price": 39.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "EXTRA SAMBAR.", "categories": [], "line_total": 12.00, "fixed_price": 3.00, "is_separate": false, "actual_price": 3.00, "item_code_alpha": "EXS", "item_code_numeric": "186"}, {"quantity": 1, "item_name": "SAMBAR WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 72.00, "fixed_price": 72.00, "is_separate": false, "actual_price": 72.00, "item_code_alpha": "SAR", "item_code_numeric": "152"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 186.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-20-1-1783319380237	2026-07-06 11:58:45.805+05:30
113	31	2026-07-06	17	1	G	RBS1	SRIHARI	148.00	3.70	3.70	7.40	148.00	[{"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-17-1-1783319456216	2026-07-06 12:00:49.065+05:30
115	0	2026-07-06	15	1	G	RBS1	SRIHARI	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-06 12:03:13.808+05:30
99	30	2026-07-06	18	1	G	RBS1	SRIHARI	130.00	3.25	3.25	6.50	130.00	[{"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	[{"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	ORD-18-1-1783319430734	2026-07-06 11:41:51.252+05:30
27	1	2026-07-05	1	1	G	``	SRIHARI	244.14	6.43	6.43	12.86	257.00	[{"quantity": 1, "item_name": "EXTRA BHAJI", "categories": [], "line_total": 37.00, "fixed_price": 37.00, "is_separate": false, "actual_price": 37.00, "item_code_alpha": "BHA", "item_code_numeric": "299"}, {"quantity": 3, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 144.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "CUPS", "categories": [], "line_total": 12.00, "fixed_price": 12.00, "is_separate": false, "actual_price": 12.00, "item_code_alpha": "STR", "item_code_numeric": "301"}, {"quantity": 1, "item_name": "BAR", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "BSH", "item_code_numeric": "304"}, {"quantity": 1, "item_name": "DHAI PAPDY", "categories": [], "line_total": 42.00, "fixed_price": 42.00, "is_separate": false, "actual_price": 42.00, "item_code_alpha": "DHP", "item_code_numeric": "200"}]	[{"quantity": 1, "item_name": "EXTRA BHAJI", "categories": [], "line_total": 37.00, "fixed_price": 37.00, "is_separate": false, "actual_price": 37.00, "item_code_alpha": "BHA", "item_code_numeric": "299"}, {"quantity": 3, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 144.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "CUPS", "categories": [], "line_total": 12.00, "fixed_price": 12.00, "is_separate": false, "actual_price": 12.00, "item_code_alpha": "STR", "item_code_numeric": "301"}, {"quantity": 1, "item_name": "BAR", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "BSH", "item_code_numeric": "304"}, {"quantity": 1, "item_name": "DHAI PAPDY", "categories": [], "line_total": 42.00, "fixed_price": 42.00, "is_separate": false, "actual_price": 42.00, "item_code_alpha": "DHP", "item_code_numeric": "200"}]	ORD-1-1-1783230572922	2026-07-05 11:14:01.395+05:30
28	2	2026-07-05	20	1	G	``	SRIHARI	152.00	4.00	4.00	8.00	160.00	[{"quantity": 1, "item_name": "SAMOSA RAGADA", "categories": [], "line_total": 44.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "SAM", "item_code_numeric": "202"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 58.00, "fixed_price": 58.00, "is_separate": false, "actual_price": 58.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 58.00, "fixed_price": 58.00, "is_separate": false, "actual_price": 58.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	[{"quantity": 1, "item_name": "SAMOSA RAGADA", "categories": [], "line_total": 44.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "SAM", "item_code_numeric": "202"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 58.00, "fixed_price": 58.00, "is_separate": false, "actual_price": 58.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 58.00, "fixed_price": 58.00, "is_separate": false, "actual_price": 58.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	ORD-20-1-1783230589626	2026-07-05 11:19:44.011+05:30
29	3	2026-07-05	12	1	G	``	SRIHARI	495.90	13.05	13.05	26.10	522.00	[{"quantity": 9, "item_name": "S.I.W Sambar", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 468.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "SRW", "item_code_numeric": "100"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 9, "item_name": "S.I.W Sambar", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 468.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "SRW", "item_code_numeric": "100"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-12-1-1783230598155	2026-07-05 11:19:55.704+05:30
36	9	2026-07-05	10	1	G	``	SRIHARI	57.00	1.50	1.50	3.00	60.00	[{"quantity": 1, "item_name": "PAV BAJI", "categories": [], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "PBJ", "item_code_numeric": "201"}]	[{"quantity": 1, "item_name": "PAV BAJI", "categories": [], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "PBJ", "item_code_numeric": "201"}]	ORD-10-1-1783232066923	2026-07-05 11:44:25.492+05:30
30	4	2026-07-05	1	1	G	``	SRIHARI	106.40	2.80	2.80	5.60	112.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	ORD-1-1-1783230700426	2026-07-05 11:21:37.715+05:30
32	6	2026-07-05	1	1	G	``	SRIHARI	106.40	2.80	2.80	5.60	112.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-1-1-1783231064136	2026-07-05 11:27:40.547+05:30
34	5	2026-07-05	1	1	G	RBS	SRIHARI	176.70	4.65	4.65	9.30	186.00	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 36.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}]	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 36.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}]	ORD-1-1-1783231489079	2026-07-05 11:33:03.342+05:30
42	14	2026-07-05	1	1	G	``	SRIHARI	40.86	1.07	1.07	2.14	43.00	[{"quantity": 1, "item_name": "RASAM IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 43.00, "fixed_price": 43.00, "is_separate": false, "actual_price": 43.00, "item_code_alpha": "RAI", "item_code_numeric": "105"}]	[{"quantity": 1, "item_name": "RASAM IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 43.00, "fixed_price": 43.00, "is_separate": false, "actual_price": 43.00, "item_code_alpha": "RAI", "item_code_numeric": "105"}]	ORD-1-1-1783233916414	2026-07-05 12:15:15.182+05:30
21	1	2026-07-05	1	1	G	RBS	SRIHARI	1145.70	30.15	30.15	60.30	1206.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 10, "item_name": "PAPER DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 1040.00, "fixed_price": 104.00, "is_separate": false, "actual_price": 104.00, "item_code_alpha": "PAD", "item_code_numeric": "119"}, {"quantity": 1, "item_name": "B.SCOTCH CUP", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "FTR", "item_code_numeric": "302"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 10, "item_name": "PAPER DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 1040.00, "fixed_price": 104.00, "is_separate": false, "actual_price": 104.00, "item_code_alpha": "PAD", "item_code_numeric": "119"}, {"quantity": 1, "item_name": "B.SCOTCH CUP", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "FTR", "item_code_numeric": "302"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 48.00, "fixed_price": 48.00, "is_separate": false, "actual_price": 48.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	ORD-1-1-1783223357768	2026-07-05 09:12:59.214+05:30
23	2	2026-07-05	10	1	G	RBS	SRIHARI	43.70	1.15	1.15	2.30	46.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	ORD-10-1-1783223384726	2026-07-05 09:19:43.348+05:30
31	5	2026-07-05	10	1	G	``	SRIHARI	222.30	5.85	5.85	11.70	234.00	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 52.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "RASAM IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 41.00, "fixed_price": 41.00, "is_separate": false, "actual_price": 41.00, "item_code_alpha": "RAI", "item_code_numeric": "105"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "ALU BONDA", "categories": [], "line_total": 33.00, "fixed_price": 33.00, "is_separate": false, "actual_price": 33.00, "item_code_alpha": "ALU", "item_code_numeric": "124"}]	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 52.00, "fixed_price": 52.00, "is_separate": false, "actual_price": 52.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "RASAM IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 41.00, "fixed_price": 41.00, "is_separate": false, "actual_price": 41.00, "item_code_alpha": "RAI", "item_code_numeric": "105"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "ALU BONDA", "categories": [], "line_total": 33.00, "fixed_price": 33.00, "is_separate": false, "actual_price": 33.00, "item_code_alpha": "ALU", "item_code_numeric": "124"}]	ORD-10-1-1783230718441	2026-07-05 11:21:56.762+05:30
33	7	2026-07-05	2	1	G	``	SRIHARI	237.50	6.25	6.25	12.50	250.00	[{"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "RAVA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 67.00, "fixed_price": 67.00, "is_separate": false, "actual_price": 67.00, "item_code_alpha": "RAD", "item_code_numeric": "110"}, {"quantity": 1, "item_name": "ONION DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 75.00, "fixed_price": 75.00, "is_separate": false, "actual_price": 75.00, "item_code_alpha": "OND", "item_code_numeric": "111"}]	[{"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "RAVA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 67.00, "fixed_price": 67.00, "is_separate": false, "actual_price": 67.00, "item_code_alpha": "RAD", "item_code_numeric": "110"}, {"quantity": 1, "item_name": "ONION DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 75.00, "fixed_price": 75.00, "is_separate": false, "actual_price": 75.00, "item_code_alpha": "OND", "item_code_numeric": "111"}]	ORD-2-1-1783231074557	2026-07-05 11:27:49.623+05:30
24	3	2026-07-05	13	1	G	RBS	SRIHARI	95.00	2.50	2.50	5.00	100.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 54.00, "fixed_price": 54.00, "is_separate": false, "actual_price": 54.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-13-1-1783223399342	2026-07-05 09:19:54.625+05:30
35	8	2026-07-05	1	1	G	``	SRIHARI	106.40	2.80	2.80	5.60	112.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	ORD-1-1-1783232059827	2026-07-05 11:43:20.124+05:30
38	0	2026-07-05	1	1	G	RBS	SRIHARI	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-05 11:53:12.462+05:30
37	10	2026-07-05	20	1	G	``	SRIHARI	132.04	3.48	3.48	6.96	139.00	[{"quantity": 1, "item_name": "PANI PURI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 34.00, "fixed_price": 34.00, "is_separate": false, "actual_price": 34.00, "item_code_alpha": "PAP", "item_code_numeric": "208"}, {"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "TOMATO CHAT", "categories": [], "line_total": 44.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "TOM", "item_code_numeric": "210"}]	[{"quantity": 1, "item_name": "PANI PURI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 34.00, "fixed_price": 34.00, "is_separate": false, "actual_price": 34.00, "item_code_alpha": "PAP", "item_code_numeric": "208"}, {"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "TOMATO CHAT", "categories": [], "line_total": 44.00, "fixed_price": 44.00, "is_separate": false, "actual_price": 44.00, "item_code_alpha": "TOM", "item_code_numeric": "210"}]	ORD-20-1-1783232092993	2026-07-05 11:44:48.559+05:30
62	20	2026-07-05	15	1	G	``	SRIHARI	62.70	1.65	1.65	3.30	66.00	[{"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "EXTRA MISC", "categories": [], "line_total": 5.00, "fixed_price": 5.00, "is_separate": false, "actual_price": 5.00, "item_code_alpha": "MIS", "item_code_numeric": "189"}]	[{"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "EXTRA MISC", "categories": [], "line_total": 5.00, "fixed_price": 5.00, "is_separate": false, "actual_price": 5.00, "item_code_alpha": "MIS", "item_code_numeric": "189"}]	ORD-15-1-1783257564895	2026-07-05 18:49:13.191+05:30
59	21	2026-07-05	2	1	G	``	SRIHARI	78.84	2.08	2.08	4.16	83.00	[{"quantity": 1, "item_name": "IDLI S.WADA", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 63.00, "fixed_price": 63.00, "is_separate": false, "actual_price": 63.00, "item_code_alpha": "ISV", "item_code_numeric": "103"}, {"quantity": 1, "item_name": "CD", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "SLI", "item_code_numeric": "180"}]	[{"quantity": 1, "item_name": "IDLI S.WADA", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 63.00, "fixed_price": 63.00, "is_separate": false, "actual_price": 63.00, "item_code_alpha": "ISV", "item_code_numeric": "103"}, {"quantity": 1, "item_name": "CD", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "SLI", "item_code_numeric": "180"}]	ORD-2-1-1783257576039	2026-07-05 18:38:15.575+05:30
81	1	2026-07-06	17	1	G	RBS1	SRIHARI	332.00	8.30	8.30	16.60	332.00	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "S.WADA", "categories": [{"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 74.00, "fixed_price": 37.00, "is_separate": false, "actual_price": 37.00, "item_code_alpha": "WWW", "item_code_numeric": "500"}]	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "S.WADA", "categories": [{"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 74.00, "fixed_price": 37.00, "is_separate": false, "actual_price": 37.00, "item_code_alpha": "WWW", "item_code_numeric": "500"}]	ORD-17-1-1783317923091	2026-07-06 11:35:14.599+05:30
105	23	2026-07-06	16	1	G	RBS1	SRIHARI	160.00	4.00	4.00	8.00	160.00	[{"quantity": 2, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 130.00, "fixed_price": 65.00, "is_separate": false, "actual_price": 65.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 2, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 130.00, "fixed_price": 65.00, "is_separate": false, "actual_price": 65.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-16-1-1783318498074	2026-07-06 11:44:52.305+05:30
63	22	2026-07-05	20	1	G	``	SRIHARI	47.50	1.25	1.25	2.50	50.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 50.00, "fixed_price": 50.00, "is_separate": false, "actual_price": 50.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 50.00, "fixed_price": 50.00, "is_separate": false, "actual_price": 50.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	ORD-20-1-1783257892631	2026-07-05 18:54:49.667+05:30
82	2	2026-07-06	16	1	G	RBS1	SRIHARI	241.00	6.03	6.03	12.06	241.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 53.00, "fixed_price": 53.00, "is_separate": false, "actual_price": 53.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 53.00, "fixed_price": 53.00, "is_separate": false, "actual_price": 53.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	ORD-16-1-1783317943351	2026-07-06 11:35:35.785+05:30
83	3	2026-07-06	23	1	G	RBS1	SRIHARI	421.00	10.53	10.53	21.06	421.00	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 53.00, "fixed_price": 53.00, "is_separate": false, "actual_price": 53.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 2, "item_name": "EXTRA SAMBAR.", "categories": [], "line_total": 6.00, "fixed_price": 3.00, "is_separate": false, "actual_price": 3.00, "item_code_alpha": "EXS", "item_code_numeric": "186"}, {"quantity": 2, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 60.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 53.00, "fixed_price": 53.00, "is_separate": false, "actual_price": 53.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 2, "item_name": "EXTRA SAMBAR.", "categories": [], "line_total": 6.00, "fixed_price": 3.00, "is_separate": false, "actual_price": 3.00, "item_code_alpha": "EXS", "item_code_numeric": "186"}, {"quantity": 2, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 60.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-23-1-1783317966227	2026-07-06 11:35:49.526+05:30
96	15	2026-07-06	15	1	G	RBS1	SRIHARI	174.00	4.35	4.35	8.70	174.00	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-15-1-1783318271780	2026-07-06 11:41:05.347+05:30
106	24	2026-07-06	1	1	G	RBS1	SRIHARI	100.00	2.50	2.50	5.00	100.00	[{"quantity": 2, "item_name": "FUN TREAT CUP", "categories": [], "line_total": 80.00, "fixed_price": 40.00, "is_separate": false, "actual_price": 40.00, "item_code_alpha": "GRN", "item_code_numeric": "303"}, {"quantity": 1, "item_name": "BAR", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "BSH", "item_code_numeric": "304"}]	[{"quantity": 2, "item_name": "FUN TREAT CUP", "categories": [], "line_total": 80.00, "fixed_price": 40.00, "is_separate": false, "actual_price": 40.00, "item_code_alpha": "GRN", "item_code_numeric": "303"}, {"quantity": 1, "item_name": "BAR", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "BSH", "item_code_numeric": "304"}]	ORD-1-1-1783318684262	2026-07-06 11:45:03.954+05:30
64	23	2026-07-05	19	1	G	``	SRIHARI	90.24	2.38	2.38	4.76	95.00	[{"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "PANI PURI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 34.00, "fixed_price": 34.00, "is_separate": false, "actual_price": 34.00, "item_code_alpha": "PAP", "item_code_numeric": "208"}]	[{"quantity": 1, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "PANI PURI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 34.00, "fixed_price": 34.00, "is_separate": false, "actual_price": 34.00, "item_code_alpha": "PAP", "item_code_numeric": "208"}]	ORD-19-1-1783257903647	2026-07-05 18:54:57.36+05:30
84	4	2026-07-06	19	1	G	RBS1	SRIHARI	106.00	2.65	2.65	5.30	106.00	[{"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 0, "item_name": "S.I.W Sambar", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 0.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "SRW", "item_code_numeric": "100"}]	[{"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 0, "item_name": "S.I.W Sambar", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 0.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "SRW", "item_code_numeric": "100"}]	ORD-19-1-1783318007391	2026-07-06 11:36:35.483+05:30
85	5	2026-07-06	19	1	G	RBS1	SRIHARI	144.00	3.60	3.60	7.20	144.00	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}]	ORD-19-1-1783318023742	2026-07-06 11:36:57.293+05:30
65	0	2026-07-05	17	1	G	``	SRIHARI	0.00	0.00	0.00	0.00	0.00	[]	[]	\N	2026-07-05 19:01:43.817+05:30
86	6	2026-07-06	22	1	G	RBS1	SRIHARI	680.00	17.00	17.00	34.00	680.00	[{"quantity": 4, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 120.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 4, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 152.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 4, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 260.00, "fixed_price": 65.00, "is_separate": false, "actual_price": 65.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	[{"quantity": 4, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 120.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 4, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 152.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 4, "item_name": "SMBR MASALADOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 260.00, "fixed_price": 65.00, "is_separate": false, "actual_price": 65.00, "item_code_alpha": "MDS", "item_code_numeric": "209"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	ORD-22-1-1783318058818	2026-07-06 11:37:28.824+05:30
87	7	2026-07-06	22	1	G	RBS1	SRIHARI	397.00	9.93	9.93	19.86	397.00	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "S.WADA", "categories": [{"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 37.00, "fixed_price": 37.00, "is_separate": false, "actual_price": 37.00, "item_code_alpha": "WWW", "item_code_numeric": "500"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 3, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 90.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "S.WADA", "categories": [{"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 37.00, "fixed_price": 37.00, "is_separate": false, "actual_price": 37.00, "item_code_alpha": "WWW", "item_code_numeric": "500"}, {"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 3, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 90.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-22-1-1783318109219	2026-07-06 11:38:16.983+05:30
91	10	2026-07-06	15	1	G	RBS1	SRIHARI	442.00	11.05	11.05	22.10	442.00	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 2, "item_name": "GHEE KARAM DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 204.00, "fixed_price": 102.00, "is_separate": false, "actual_price": 102.00, "item_code_alpha": "CCM", "item_code_numeric": "115"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 2, "item_name": "GHEE KARAM DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 204.00, "fixed_price": 102.00, "is_separate": false, "actual_price": 102.00, "item_code_alpha": "CCM", "item_code_numeric": "115"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-15-1-1783318195229	2026-07-06 11:39:50.138+05:30
97	16	2026-07-06	25	1	G	RBS1	SRIHARI	349.00	8.72	8.72	17.44	349.00	[{"quantity": 3, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 192.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 3, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 90.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 3, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 192.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 3, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 90.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-25-1-1783318285229	2026-07-06 11:41:17.481+05:30
100	18	2026-07-06	25	1	G	RBS1	SRIHARI	124.00	3.10	3.10	6.20	124.00	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-25-1-1783318327260	2026-07-06 11:42:06.043+05:30
101	19	2026-07-06	15	1	G	RBS1	SRIHARI	144.00	3.60	3.60	7.20	144.00	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-15-1-1783318337357	2026-07-06 11:42:13.035+05:30
44	16	2026-07-05	10	1	G	``	SRIHARI	43.70	1.15	1.15	2.30	46.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	ORD-10-1-1783234125322	2026-07-05 12:18:42.746+05:30
107	25	2026-07-06	22	1	G	RBS1	SRIHARI	92.00	2.30	2.30	4.60	92.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-22-1-1783318694191	2026-07-06 11:48:10.222+05:30
109	27	2026-07-06	21	1	G	RBS1	SRIHARI	695.00	17.38	17.38	34.76	695.00	[{"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 248.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "VEG.BERYANI", "categories": [], "line_total": 67.00, "fixed_price": 67.00, "is_separate": false, "actual_price": 67.00, "item_code_alpha": "VEB", "item_code_numeric": "118"}, {"quantity": 4, "item_name": "CD", "categories": [], "line_total": 80.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "SLI", "item_code_numeric": "180"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 248.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "VEG.BERYANI", "categories": [], "line_total": 67.00, "fixed_price": 67.00, "is_separate": false, "actual_price": 67.00, "item_code_alpha": "VEB", "item_code_numeric": "118"}, {"quantity": 4, "item_name": "CD", "categories": [], "line_total": 80.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "SLI", "item_code_numeric": "180"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-21-1-1783318851447	2026-07-06 11:50:32.215+05:30
104	22	2026-07-06	1	1	G	RBS1	SRIHARI	10.00	0.25	0.25	0.50	10.00	[{"quantity": 1, "item_name": "VANILLA CUP", "categories": [], "line_total": 10.00, "fixed_price": 10.00, "is_separate": false, "actual_price": 10.00, "item_code_alpha": "VAT", "item_code_numeric": "300"}]	[{"quantity": 1, "item_name": "VANILLA CUP", "categories": [], "line_total": 10.00, "fixed_price": 10.00, "is_separate": false, "actual_price": 10.00, "item_code_alpha": "VAT", "item_code_numeric": "300"}]	ORD-1-1-1783318486793	2026-07-06 11:44:27.73+05:30
66	6	2026-07-05	10	1	G	RBS	SRIHARI	604.20	15.90	15.90	31.80	636.00	[{"quantity": 7, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 420.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 6, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 216.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	[{"quantity": 7, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 420.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 6, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 216.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}]	ORD-10-1-1783259388640	2026-07-05 19:09:33.468+05:30
98	17	2026-07-06	26	1	G	RBS1	SRIHARI	176.00	4.40	4.40	8.80	176.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-26-1-1783318296917	2026-07-06 11:41:29.611+05:30
67	1	2026-07-06	1	1	G	``	SRIHARI	112.00	2.80	2.80	5.60	117.60	[{"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 56.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-1-1-1783311154245	2026-07-06 09:42:28.682+05:30
68	2	2026-07-06	20	1	G	``	SRIHARI	60.00	1.50	1.50	3.00	63.00	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 22.00, "fixed_price": 22.00, "is_separate": false, "actual_price": 22.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-20-1-1783311335740	2026-07-06 09:42:51.458+05:30
88	8	2026-07-06	20	1	G	RBS1	SRIHARI	234.00	5.85	5.85	11.70	234.00	[{"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "AB SPL DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 102.00, "fixed_price": 102.00, "is_separate": false, "actual_price": 102.00, "item_code_alpha": "JER", "item_code_numeric": "114"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "AB SPL DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 102.00, "fixed_price": 102.00, "is_separate": false, "actual_price": 102.00, "item_code_alpha": "JER", "item_code_numeric": "114"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-20-1-1783318140418	2026-07-06 11:38:49.452+05:30
69	1	2026-07-06	20	1	G	RBS	SRIHARI	528.00	13.20	13.20	26.40	528.00	[{"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "TOMATO BATH", "categories": [], "line_total": 78.00, "fixed_price": 39.00, "is_separate": false, "actual_price": 39.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 186.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "EXTRA MISC", "categories": [], "line_total": 12.00, "fixed_price": 3.00, "is_separate": false, "actual_price": 3.00, "item_code_alpha": "MIS", "item_code_numeric": "189"}, {"quantity": 1, "item_name": "SAMBAR WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 72.00, "fixed_price": 72.00, "is_separate": false, "actual_price": 72.00, "item_code_alpha": "SAR", "item_code_numeric": "152"}, {"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 76.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "TOMATO BATH", "categories": [], "line_total": 78.00, "fixed_price": 39.00, "is_separate": false, "actual_price": 39.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 186.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "EXTRA MISC", "categories": [], "line_total": 12.00, "fixed_price": 3.00, "is_separate": false, "actual_price": 3.00, "item_code_alpha": "MIS", "item_code_numeric": "189"}, {"quantity": 1, "item_name": "SAMBAR WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 72.00, "fixed_price": 72.00, "is_separate": false, "actual_price": 72.00, "item_code_alpha": "SAR", "item_code_numeric": "152"}, {"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-20-1-1783316976378	2026-07-06 11:02:48.407+05:30
90	9	2026-07-06	27	1	G	RBS1	SRIHARI	285.00	7.13	7.13	14.26	285.00	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "SAMBAR IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 45.00, "fixed_price": 45.00, "is_separate": false, "actual_price": 45.00, "item_code_alpha": "SBR", "item_code_numeric": "153"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "SAMBAR IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 45.00, "fixed_price": 45.00, "is_separate": false, "actual_price": 45.00, "item_code_alpha": "SBR", "item_code_numeric": "153"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-27-1-1783318173933	2026-07-06 11:39:28.405+05:30
102	20	2026-07-06	17	1	G	RBS1	SRIHARI	94.00	2.35	2.35	4.70	94.00	[{"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-17-1-1783318347430	2026-07-06 11:42:23.229+05:30
60	18	2026-07-05	10	1	G	``	SRIHARI	43.70	1.15	1.15	2.30	46.00	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	[{"quantity": 1, "item_name": "S.IDLI S.WADA", "categories": [{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 46.00, "fixed_price": 46.00, "is_separate": false, "actual_price": 46.00, "item_code_alpha": "SIV", "item_code_numeric": "102"}]	ORD-10-1-1783256920668	2026-07-05 18:38:33.219+05:30
92	11	2026-07-06	18	1	G	RBS1	SRIHARI	238.00	5.95	5.95	11.90	238.00	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 1, "item_name": "SAMBAR IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 45.00, "fixed_price": 45.00, "is_separate": false, "actual_price": 45.00, "item_code_alpha": "SBR", "item_code_numeric": "153"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 1, "item_name": "WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "WAD", "item_code_numeric": "104"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 1, "item_name": "SAMBAR IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 45.00, "fixed_price": 45.00, "is_separate": false, "actual_price": 45.00, "item_code_alpha": "SBR", "item_code_numeric": "153"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-18-1-1783318218069	2026-07-06 11:40:11.226+05:30
93	12	2026-07-06	21	1	G	RBS1	SRIHARI	889.00	22.23	22.23	44.46	889.00	[{"quantity": 4, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 256.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 5, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 310.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "SAMBAR IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 45.00, "fixed_price": 45.00, "is_separate": false, "actual_price": 45.00, "item_code_alpha": "SBR", "item_code_numeric": "153"}, {"quantity": 5, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 150.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 4, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 256.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 5, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 310.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "SAMBAR IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 45.00, "fixed_price": 45.00, "is_separate": false, "actual_price": 45.00, "item_code_alpha": "SBR", "item_code_numeric": "153"}, {"quantity": 5, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 150.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-21-1-1783318230869	2026-07-06 11:40:25.876+05:30
103	21	2026-07-06	1	1	G	RBS1	SRIHARI	12.00	0.30	0.30	0.60	12.00	[{"quantity": 1, "item_name": "VANILLA CUP", "categories": [], "line_total": 12.00, "fixed_price": 12.00, "is_separate": false, "actual_price": 12.00, "item_code_alpha": "VAT", "item_code_numeric": "300"}]	[{"quantity": 1, "item_name": "VANILLA CUP", "categories": [], "line_total": 12.00, "fixed_price": 12.00, "is_separate": false, "actual_price": 12.00, "item_code_alpha": "VAT", "item_code_numeric": "300"}]	ORD-1-1-1783318358741	2026-07-06 11:42:36.773+05:30
61	19	2026-07-05	1	1	G	``	SRIHARI	487.34	12.83	12.83	25.66	513.00	[{"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 72.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "TOMATO BATH", "categories": [], "line_total": 70.00, "fixed_price": 35.00, "is_separate": false, "actual_price": 35.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 168.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 57.00, "fixed_price": 57.00, "is_separate": false, "actual_price": 57.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "EXTRA SAMBAR.", "categories": [], "line_total": 20.00, "fixed_price": 5.00, "is_separate": false, "actual_price": 5.00, "item_code_alpha": "EXS", "item_code_numeric": "186"}, {"quantity": 1, "item_name": "SAMBAR WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "SAR", "item_code_numeric": "152"}, {"quantity": 1, "item_name": "IDLI S.WADA", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 65.00, "fixed_price": 65.00, "is_separate": false, "actual_price": 65.00, "item_code_alpha": "ISV", "item_code_numeric": "103"}]	[{"quantity": 2, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 72.00, "fixed_price": 36.00, "is_separate": false, "actual_price": 36.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 2, "item_name": "TOMATO BATH", "categories": [], "line_total": 70.00, "fixed_price": 35.00, "is_separate": false, "actual_price": 35.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 3, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 168.00, "fixed_price": 56.00, "is_separate": false, "actual_price": 56.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 57.00, "fixed_price": 57.00, "is_separate": false, "actual_price": 57.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 4, "item_name": "EXTRA SAMBAR.", "categories": [], "line_total": 20.00, "fixed_price": 5.00, "is_separate": false, "actual_price": 5.00, "item_code_alpha": "EXS", "item_code_numeric": "186"}, {"quantity": 1, "item_name": "SAMBAR WADA", "categories": [{"qty": 2, "name": "wada", "category_old": "wada"}], "line_total": 61.00, "fixed_price": 61.00, "is_separate": false, "actual_price": 61.00, "item_code_alpha": "SAR", "item_code_numeric": "152"}, {"quantity": 1, "item_name": "IDLI S.WADA", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}], "line_total": 65.00, "fixed_price": 65.00, "is_separate": false, "actual_price": 65.00, "item_code_alpha": "ISV", "item_code_numeric": "103"}]	ORD-1-1-1783256942272	2026-07-05 18:39:01.308+05:30
108	26	2026-07-06	26	1	G	RBS1	SRIHARI	233.00	5.83	5.83	11.66	233.00	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "CD", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "SLI", "item_code_numeric": "180"}, {"quantity": 1, "item_name": "EMPTY CUP", "categories": [], "line_total": 1.00, "fixed_price": 1.00, "is_separate": false, "actual_price": 1.00, "item_code_alpha": "EMP", "item_code_numeric": "137"}]	[{"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 2, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 124.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}, {"quantity": 1, "item_name": "CD", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "SLI", "item_code_numeric": "180"}, {"quantity": 1, "item_name": "EMPTY CUP", "categories": [], "line_total": 1.00, "fixed_price": 1.00, "is_separate": false, "actual_price": 1.00, "item_code_alpha": "EMP", "item_code_numeric": "137"}]	ORD-26-1-1783318825773	2026-07-06 11:48:20.014+05:30
94	13	2026-07-06	26	1	G	RBS1	SRIHARI	587.00	14.68	14.68	29.36	587.00	[{"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 6, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 372.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 2, "item_name": "WATER BOTAL", "categories": [], "line_total": 40.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "MYSORE BAJJI", "categories": [], "line_total": 47.00, "fixed_price": 47.00, "is_separate": false, "actual_price": 47.00, "item_code_alpha": "MYB", "item_code_numeric": "123"}, {"quantity": 2, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 128.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 6, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 372.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-26-1-1783318242756	2026-07-06 11:40:38.251+05:30
95	14	2026-07-06	20	1	G	RBS1	SRIHARI	146.00	3.65	3.65	7.30	146.00	[{"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	[{"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}, {"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}]	ORD-20-1-1783318258941	2026-07-06 11:40:53.153+05:30
114	32	2026-07-06	15	1	G	RBS1	SRIHARI	108.00	2.70	2.70	5.40	108.00	[{"quantity": 1, "item_name": "EXTRA MISC", "categories": [], "line_total": 108.00, "fixed_price": 108.00, "is_separate": false, "actual_price": 108.00, "item_code_alpha": "MIS", "item_code_numeric": "189"}]	[{"quantity": 1, "item_name": "EXTRA MISC", "categories": [], "line_total": 108.00, "fixed_price": 108.00, "is_separate": false, "actual_price": 108.00, "item_code_alpha": "MIS", "item_code_numeric": "189"}]	ORD-15-1-1783319575923	2026-07-06 12:02:05.401+05:30
111	33	2026-07-06	1	1	G	RBS1	SRIHARI	122.00	3.05	3.05	6.10	122.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 60.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	ORD-1-1-1783319777212	2026-07-06 11:56:04.337+05:30
116	34	2026-07-06	1	1	G	RBS1	SRIHARI	182.00	4.55	4.55	9.10	182.00	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 120.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	[{"quantity": 2, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 120.00, "fixed_price": 60.00, "is_separate": false, "actual_price": 60.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "POO", "item_code_numeric": "107"}]	ORD-1-1-1783319796363	2026-07-06 12:06:29.354+05:30
117	35	2026-07-06	18	1	G	RBS1	SRIHARI	171.00	4.28	4.28	8.56	171.00	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TOMATO BATH", "categories": [], "line_total": 39.00, "fixed_price": 39.00, "is_separate": false, "actual_price": 39.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	[{"quantity": 1, "item_name": "IDLY", "categories": [{"qty": 2, "name": "Idli", "category_old": "idli"}], "line_total": 38.00, "fixed_price": 38.00, "is_separate": false, "actual_price": 38.00, "item_code_alpha": "IDL", "item_code_numeric": "101"}, {"quantity": 1, "item_name": "TOMATO BATH", "categories": [], "line_total": 39.00, "fixed_price": 39.00, "is_separate": false, "actual_price": 39.00, "item_code_alpha": "TOB", "item_code_numeric": "116"}, {"quantity": 1, "item_name": "POORI", "categories": [{"qty": 1, "name": "puri", "category_old": "puri"}], "line_total": 64.00, "fixed_price": 64.00, "is_separate": false, "actual_price": 64.00, "item_code_alpha": "POO", "item_code_numeric": "107"}, {"quantity": 1, "item_name": "TEA", "categories": [{"qty": 1, "name": "tea", "category_old": "tea"}], "line_total": 30.00, "fixed_price": 30.00, "is_separate": false, "actual_price": 30.00, "item_code_alpha": "TEA", "item_code_numeric": "134"}]	ORD-18-1-1783320625887	2026-07-06 12:20:12.605+05:30
118	36	2026-07-06	27	1	G	RBS1	SRIHARI	144.00	3.60	3.60	7.20	144.00	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	[{"quantity": 1, "item_name": "MASALA DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "MAS", "item_code_numeric": "109"}, {"quantity": 1, "item_name": "PLAIN DOSA", "categories": [{"qty": 1, "name": "dosa", "category_old": "dosa"}], "line_total": 62.00, "fixed_price": 62.00, "is_separate": false, "actual_price": 62.00, "item_code_alpha": "PLD", "item_code_numeric": "108"}, {"quantity": 1, "item_name": "WATER BOTAL", "categories": [], "line_total": 20.00, "fixed_price": 20.00, "is_separate": false, "actual_price": 20.00, "item_code_alpha": "W13", "item_code_numeric": "190"}]	ORD-27-1-1783320877071	2026-07-06 12:24:28.261+05:30
\.


--
-- Data for Name: debug_logs; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.debug_logs (id, message, data, created_at) FROM stdin;
\.


--
-- Data for Name: items; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.items (id, name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate, created_at) FROM stdin;
7	IDLY	IDL	101	36.00	36.00	38.00	[{"qty": 2, "name": "Idli", "category_old": "idli"}]	f	2026-06-21 13:02:49.556068+05:30
11	RASAM IDLY	RAI	105	43.00	43.00	45.00	[{"qty": 2, "name": "Idli", "category_old": "idli"}]	f	2026-06-21 13:02:49.556068+05:30
15	MASALA DOSA	MAS	109	60.00	60.00	62.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
2	Unknown	TBY	0A	0.00	0.00	2.00	[]	f	2026-06-21 13:02:49.556068+05:30
18	AB SP IDLY	SPI	112	47.00	47.00	49.00	[{"qty": 2, "name": "Idli", "category_old": "idli"}]	f	2026-06-21 13:02:49.556068+05:30
13	POORI	POO	107	62.00	62.00	64.00	[{"qty": 1, "name": "puri", "category_old": "puri"}]	f	2026-06-21 13:02:49.556068+05:30
61	CD	SLI	180	20.00	20.00	20.00	[]	f	2026-06-21 13:02:49.556068+05:30
51	SAMBAR IDLY	SBR	153	43.00	43.00	45.00	[{"qty": 2, "name": "Idli", "category_old": "idli"}]	f	2026-06-21 13:02:49.556068+05:30
44	EMPTY CUP	EMP	137	1.00	1.00	1.00	[]	f	2026-06-21 13:02:49.556068+05:30
3	Unknown	O	0B	0.00	0.00	2.00	[]	f	2026-06-21 13:02:49.556068+05:30
4	Unknown	UTP	0C	0.00	0.00	2.00	[]	f	2026-06-21 13:02:49.556068+05:30
5	Unknown	ABU	0D	0.00	0.00	2.00	[]	f	2026-06-21 13:02:49.556068+05:30
103	Test Item 6196	TEST6196	6196	100.00	100.00	110.00	[{"qty": 1, "name": "TestCat"}]	f	2026-07-04 17:44:06.197404+05:30
1	Unknown	TES	0	0.00	0.00	2.00	[]	f	2026-06-21 13:02:49.556068+05:30
6	S.I.W Sambar	SRW	100	60.00	60.00	62.00	[{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
33	S.I.W Rasam	RSM	126	50.00	50.00	54.00	[{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
68	PAPAD	PPD	187	8.00	8.00	10.00	[]	f	2026-06-21 13:02:49.556068+05:30
69	EXTRA RICE	EXR	188	30.00	30.00	34.00	[]	f	2026-06-21 13:02:49.556068+05:30
70	EXTRA MISC	MIS	189	0.00	0.00	2.00	[]	f	2026-06-21 13:02:49.556068+05:30
72	JAWAR ROTI	JAR	193	33.00	33.00	37.00	[{"qty": 1, "name": "roti", "category_old": "roti"}]	f	2026-06-21 13:02:49.556068+05:30
71	WATER BOTAL	W13	190	20.00	20.00	20.00	[]	f	2026-06-21 13:02:49.556068+05:30
67	EXTRA SAMBAR.	EXS	186	3.00	3.00	3.00	[]	f	2026-06-21 13:02:49.556068+05:30
100	S.WADA	WWW	500	35.00	35.00	37.00	[{"qty": 1, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
90	VANILLA CUP	VAT	300	10.00	10.00	12.00	[]	f	2026-06-21 13:02:49.556068+05:30
93	FUN TREAT CUP	GRN	303	40.00	40.00	42.00	[]	f	2026-06-21 13:02:49.556068+05:30
94	BAR	BSH	304	20.00	20.00	22.00	[]	f	2026-06-21 13:02:49.556068+05:30
97	CONES	DRY	309	40.00	40.00	42.00	[]	f	2026-06-21 13:02:49.556068+05:30
8	S.IDLI S.WADA	SIV	102	51.00	51.00	53.00	[{"qty": 1, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
9	IDLI S.WADA	ISV	103	69.00	69.00	71.00	[{"qty": 2, "name": "Idli", "category_old": "idli"}, {"qty": 1, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
10	WADA	WAD	104	62.00	62.00	64.00	[{"qty": 2, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
12	RASAM WADA	RAW	106	70.00	70.00	72.00	[{"qty": 2, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
14	PLAIN DOSA	PLD	108	60.00	60.00	62.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
16	RAVA DOSA	RAD	110	75.00	75.00	77.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
17	ONION DOSA	OND	111	85.00	85.00	87.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
19	70.MM.DOSA	MMM	113	130.00	130.00	132.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
20	AB SPL DOSA	JER	114	100.00	100.00	102.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
21	AB SPL DOSA	ABD	114A	100.00	100.00	102.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
22	GHEE KARAM DOSA	CCM	115	100.00	100.00	102.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
24	TOMOTO.RICE	CAP	117	65.00	65.00	67.00	[]	f	2026-06-21 13:02:49.556068+05:30
25	VEG.BERYANI	VEB	118	65.00	65.00	67.00	[]	f	2026-06-21 13:02:49.556068+05:30
26	PAPER DOSA	PAD	119	130.00	130.00	132.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
27	DAHI WADA	DHW	120	65.00	65.00	67.00	[{"qty": 2, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
73	DAHI PURI...	DPP	199	45.00	45.00	47.00	[{"qty": 1, "name": "puri", "category_old": "puri"}]	f	2026-06-21 13:02:49.556068+05:30
74	DHAI PAPDY	DHP	200	45.00	45.00	47.00	[]	f	2026-06-21 13:02:49.556068+05:30
75	PAV BAJI	PBJ	201	65.00	65.00	67.00	[]	f	2026-06-21 13:02:49.556068+05:30
76	SAMOSA RAGADA	SAM	202	45.00	45.00	47.00	[]	f	2026-06-21 13:02:49.556068+05:30
77	CUTLETRAGADA	CUT	203	45.00	45.00	47.00	[]	f	2026-06-21 13:02:49.556068+05:30
28	SET DOSA	SED	121	75.00	75.00	77.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
29	MURKUL/MIXTURE	MUM	122	45.00	45.00	47.00	[]	f	2026-06-21 13:02:49.556068+05:30
30	MYSORE BAJJI	MYB	123	45.00	45.00	47.00	[]	f	2026-06-21 13:02:49.556068+05:30
31	ALU BONDA	ALU	124	33.00	33.00	37.00	[]	f	2026-06-21 13:02:49.556068+05:30
32	VEG.HALEEM	HAL	125	40.00	40.00	44.00	[]	f	2026-06-21 13:02:49.556068+05:30
34	PAROTA	PAR	128	55.00	55.00	57.00	[]	f	2026-06-21 13:02:49.556068+05:30
35	Chapathi	CHA	129	55.00	55.00	57.00	[]	f	2026-06-21 13:02:49.556068+05:30
36	ONION RAVA DOSA	ORD	130	85.00	85.00	87.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
37	Open Dosa	OPD	131	85.00	85.00	87.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
38	UTTAPA	UTA	132	85.00	85.00	87.00	[]	f	2026-06-21 13:02:49.556068+05:30
39	FILTR COFFEE	COF	133	35.00	35.00	35.00	[{"qty": 1, "name": "coffee", "category_old": "coffee"}]	f	2026-06-21 13:02:49.556068+05:30
40	TEA	TEA	134	30.00	30.00	30.00	[{"qty": 1, "name": "tea", "category_old": "tea"}]	f	2026-06-21 13:02:49.556068+05:30
41	TEA + CUP	AGH	135	20.00	20.00	23.00	[{"qty": 1, "name": "tea", "category_old": "tea"}]	f	2026-06-21 13:02:49.556068+05:30
42	TEA+CUP	TEC	135A	26.00	26.00	29.00	[{"qty": 1, "name": "tea", "category_old": "tea"}]	f	2026-06-21 13:02:49.556068+05:30
43	BOURNVITA	BOU	136	32.00	32.00	32.00	[]	f	2026-06-21 13:02:49.556068+05:30
45	SAMBARID.WADA	SAW	138	89.00	89.00	93.00	[{"qty": 2, "name": "Idli", "category_old": "idli"}, {"qty": 2, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
46	VEG F.RICE	VFR	142	65.00	65.00	67.00	[]	f	2026-06-21 13:02:49.556068+05:30
47	SUGARLESS COFFE	SLC	143	27.00	27.00	30.00	[{"qty": 1, "name": "coffee", "category_old": "coffee"}]	f	2026-06-21 13:02:49.556068+05:30
48	JAMOON	JUJ	151	35.00	35.00	37.00	[]	f	2026-06-21 13:02:49.556068+05:30
49	SAMBAR WADA	SAR	152	70.00	70.00	72.00	[{"qty": 2, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
50	SAMBAR WADA	SWD	152A	70.00	70.00	72.00	[{"qty": 2, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
52	Coconut Halwaa	OKM	155	35.00	35.00	37.00	[]	f	2026-06-21 13:02:49.556068+05:30
53	PLATE MEAL	PLM	167	98.00	98.00	100.00	[]	f	2026-06-21 13:02:49.556068+05:30
54	SPL MEAL	SPM	168	150.00	150.00	152.00	[]	f	2026-06-21 13:02:49.556068+05:30
55	FRUID SALAD	FTS	169	40.00	40.00	42.00	[]	f	2026-06-21 13:02:49.556068+05:30
56	FRIUT WITH ICE	FTC	170	65.00	65.00	67.00	[]	f	2026-06-21 13:02:49.556068+05:30
57	CURD RICE	CUR	171	60.00	60.00	62.00	[]	f	2026-06-21 13:02:49.556068+05:30
58	PARCEL JUICE	JUI	172	35.00	35.00	39.00	[{"qty": 1, "name": "juice", "category_old": "juice"}]	f	2026-06-21 13:02:49.556068+05:30
59	TEST	PCO	175	0.00	0.00	2.00	[]	f	2026-06-21 13:02:49.556068+05:30
60	MILK SHAKE	BDM	179	40.00	40.00	44.00	[]	f	2026-06-21 13:02:49.556068+05:30
23	TOMATO BATH	TOB	116	37.00	37.00	39.00	[]	f	2026-06-21 13:02:49.556068+05:30
62	MAAZA	CDP	181	25.00	25.00	28.00	[]	f	2026-06-21 13:02:49.556068+05:30
63	MOSAMBI	MSB	182	40.00	40.00	42.00	[]	f	2026-06-21 13:02:49.556068+05:30
64	P APPLE JUICE	FRJ	183	40.00	40.00	44.00	[{"qty": 1, "name": "juice", "category_old": "juice"}]	f	2026-06-21 13:02:49.556068+05:30
65	LASSI	LAS	184	50.00	50.00	52.00	[]	f	2026-06-21 13:02:49.556068+05:30
66	BUTRMILK	BTR	185	30.00	30.00	32.00	[]	f	2026-06-21 13:02:49.556068+05:30
78	PLAIN SAMOSA	PSA	204	20.00	20.00	22.00	[]	f	2026-06-21 13:02:49.556068+05:30
79	EXTRA PAV	PAV	205	25.00	25.00	27.00	[]	f	2026-06-21 13:02:49.556068+05:30
80	BEL PURI	BEP	206	45.00	45.00	47.00	[{"qty": 1, "name": "puri", "category_old": "puri"}]	f	2026-06-21 13:02:49.556068+05:30
81	SAVE PURI	SAP	207	45.00	45.00	47.00	[{"qty": 1, "name": "puri", "category_old": "puri"}]	f	2026-06-21 13:02:49.556068+05:30
82	PANI PURI	PAP	208	35.00	35.00	37.00	[{"qty": 1, "name": "puri", "category_old": "puri"}]	f	2026-06-21 13:02:49.556068+05:30
83	SMBR MASALADOSA	MDS	209	63.00	63.00	65.00	[{"qty": 1, "name": "dosa", "category_old": "dosa"}]	f	2026-06-21 13:02:49.556068+05:30
84	TOMATO CHAT	TOM	210	45.00	45.00	47.00	[]	f	2026-06-21 13:02:49.556068+05:30
85	MSL PAVBAJI	SPJ	211	80.00	80.00	82.00	[{"qty": 1, "name": "pavbhaji", "category_old": "pavbhaji"}]	f	2026-06-21 13:02:49.556068+05:30
86	MSL PAVBHAJI	MSL	211A	80.00	80.00	82.00	[{"qty": 1, "name": "pavbhaji", "category_old": "pavbhaji"}]	f	2026-06-21 13:02:49.556068+05:30
87	MASALA POORI	WDP	212	45.00	45.00	47.00	[{"qty": 1, "name": "puri", "category_old": "puri"}]	f	2026-06-21 13:02:49.556068+05:30
88	SPL LASSI	LSW	284	75.00	75.00	77.00	[]	f	2026-06-21 13:02:49.556068+05:30
89	EXTRA BHAJI	BHA	299	40.00	40.00	42.00	[]	f	2026-06-21 13:02:49.556068+05:30
91	CUPS	STR	301	10.00	10.00	14.00	[]	f	2026-06-21 13:02:49.556068+05:30
92	B.SCOTCH CUP	FTR	302	20.00	20.00	24.00	[]	f	2026-06-21 13:02:49.556068+05:30
95	FUSION BAR	KSH	305	30.00	30.00	34.00	[]	f	2026-06-21 13:02:49.556068+05:30
96	BAR	CCC	306	20.00	20.00	24.00	[]	f	2026-06-21 13:02:49.556068+05:30
98	KULFI STICK	STP	311	40.00	40.00	44.00	[]	f	2026-06-21 13:02:49.556068+05:30
99	MATKA KULFI	BNP	312	40.00	40.00	44.00	[]	f	2026-06-21 13:02:49.556068+05:30
101	SSAMMBAR.WADA	SSW	501	35.00	35.00	39.00	[{"qty": 1, "name": "wada", "category_old": "wada"}]	f	2026-06-21 13:02:49.556068+05:30
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.orders (id, track, clerk_initials, table_no, party_no, bill_number, bill_date, item_code, numeric_item_code, item_name, quantity, unit_price, line_total, is_separate, created_at, updated_at) FROM stdin;
588	RBS1	SRIHARI	25	1	0	2026-07-06	ALU	124	ALU BONDA	1	37.00	37.00	f	2026-07-06 19:55:41.761+05:30	2026-07-06 19:55:41.763942+05:30
589	RBS1	SRIHARI	25	1	0	2026-07-06	RAW	106	RASAM WADA	1	72.00	72.00	f	2026-07-06 19:55:41.761+05:30	2026-07-06 19:55:44.112081+05:30
590	RBS1	SRIHARI	25	1	0	2026-07-06	CCC	306	BAR	1	24.00	24.00	f	2026-07-06 19:55:41.761+05:30	2026-07-06 19:55:48.381045+05:30
\.


--
-- Data for Name: running_bills; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.running_bills (id, track_morning, track_afternoon, track_rbs1, track_rbs2) FROM stdin;
1	3	2	41	0
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.sessions (id, session_id, shift_name, clerk_initials, session_date, start_time, end_time, status, closed_by, is_locked, last_bill_number, created_at) FROM stdin;
2	c261123a-ec92-4f05-a15b-f0cc7bced274	``	SYS	2026-06-21	2026-06-21 13:02:49.521851+05:30	\N	OPEN	\N	f	0	2026-06-21 13:02:49.521851+05:30
3	7c7200ce-7094-4910-93b8-5a3bdb250410	RBS	SYS	2026-06-21	2026-06-21 13:02:49.521851+05:30	\N	OPEN	\N	f	0	2026-06-21 13:02:49.521851+05:30
4	9045ac8f-9038-4583-9335-3360526827f1	RBS1	SYS	2026-06-21	2026-06-21 13:02:49.521851+05:30	\N	OPEN	\N	f	0	2026-06-21 13:02:49.521851+05:30
1	33380d6f-ef36-46b9-a029-444b4868c921	`	SYS	2026-06-21	2026-06-21 13:02:49.521851+05:30	2026-07-05 09:27:44.780436+05:30	CLOSED	LOGOUT	t	0	2026-06-21 13:02:49.521851+05:30
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.settings (id, hotel_name, address, phone, gstin, clerk_initials, sgst_percentage, cgst_percentage, created_at) FROM stdin;
1	Udipi Anand Bhavan	Default Address	123-456-7890	GST123456789	CLK	2.50	2.50	2026-06-21 13:02:49.393803+05:30
3	Udipi Anand Bhavan	Default Address	123-456-7890	GST123456789	SRIHARI	2.50	2.50	2026-07-06 18:51:44.032495+05:30
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.shifts (id, shift_name, created_at) FROM stdin;
1	`	2026-06-21 13:02:49.425411+05:30
2	``	2026-06-21 13:02:49.425411+05:30
4	RBS1	2026-06-21 13:02:49.425411+05:30
3	RBS	2026-06-21 13:02:49.425411+05:30
\.


--
-- Data for Name: tables; Type: TABLE DATA; Schema: public; Owner: sathvikkemtur
--

COPY public.tables (table_id, section_name, created_at, updated_at) FROM stdin;
1	Parcel	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
2	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
3	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
4	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
5	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
6	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
7	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
8	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
9	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
10	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
11	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
12	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
13	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
14	General	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
15	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
16	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
17	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
18	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
19	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
20	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
21	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
22	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
23	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
24	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
25	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
26	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
27	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
28	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
29	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
30	AC	2026-06-21 13:02:49.457702+05:30	2026-06-21 13:02:49.457702+05:30
\.


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 1, false);


--
-- Name: bill_items_bill_item_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.bill_items_bill_item_id_seq', 1, false);


--
-- Name: bills_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.bills_id_seq', 125, true);


--
-- Name: debug_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.debug_logs_id_seq', 1, false);


--
-- Name: items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.items_id_seq', 103, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.orders_id_seq', 596, true);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.sessions_id_seq', 4, true);


--
-- Name: settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.settings_id_seq', 3, true);


--
-- Name: shifts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sathvikkemtur
--

SELECT pg_catalog.setval('public.shifts_id_seq', 4, true);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bill_items bill_items_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.bill_items
    ADD CONSTRAINT bill_items_pkey PRIMARY KEY (bill_item_id);


--
-- Name: bills bills_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_pkey PRIMARY KEY (id);


--
-- Name: debug_logs debug_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.debug_logs
    ADD CONSTRAINT debug_logs_pkey PRIMARY KEY (id);


--
-- Name: items items_alpha_code_key; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_alpha_code_key UNIQUE (alpha_code);


--
-- Name: items items_numeric_code_key; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_numeric_code_key UNIQUE (numeric_code);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: running_bills running_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.running_bills
    ADD CONSTRAINT running_bills_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_session_id_key UNIQUE (session_id);


--
-- Name: sessions sessions_shift_name_session_date_clerk_initials_key; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_shift_name_session_date_clerk_initials_key UNIQUE (shift_name, session_date, clerk_initials);


--
-- Name: settings settings_clerk_initials_key; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_clerk_initials_key UNIQUE (clerk_initials);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_shift_name_key; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_shift_name_key UNIQUE (shift_name);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (table_id);


--
-- Name: bills uq_bills_composite_key; Type: CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT uq_bills_composite_key UNIQUE (table_no, party_no, created_at, track, clerk_initials);


--
-- Name: bills_bill_number_bill_date_unique; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE UNIQUE INDEX bills_bill_number_bill_date_unique ON public.bills USING btree (bill_number, bill_date, track) WHERE (bill_number > 0);


--
-- Name: idx_bills_date_number; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_bills_date_number ON public.bills USING btree (bill_date, bill_number);


--
-- Name: idx_bills_items_json; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_bills_items_json ON public.bills USING gin (items_json);


--
-- Name: idx_bills_table_no; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_bills_table_no ON public.bills USING btree (table_no);


--
-- Name: idx_items_category; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_items_category ON public.items USING gin (category);


--
-- Name: idx_items_codes; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_items_codes ON public.items USING btree (alpha_code, numeric_code);


--
-- Name: idx_orders_bill_number_date; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_orders_bill_number_date ON public.orders USING btree (bill_number, bill_date);


--
-- Name: idx_orders_table_no; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_orders_table_no ON public.orders USING btree (table_no);


--
-- Name: idx_sessions_date; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_sessions_date ON public.sessions USING btree (session_date);


--
-- Name: idx_sessions_locked; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_sessions_locked ON public.sessions USING btree (shift_name, is_locked);


--
-- Name: idx_sessions_shift_date; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_sessions_shift_date ON public.sessions USING btree (shift_name, session_date);


--
-- Name: idx_sessions_status; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_sessions_status ON public.sessions USING btree (status);


--
-- Name: idx_tables_section_name; Type: INDEX; Schema: public; Owner: sathvikkemtur
--

CREATE INDEX idx_tables_section_name ON public.tables USING btree (section_name);


--
-- Name: audit_log audit_log_shift_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_shift_session_id_fkey FOREIGN KEY (shift_session_id) REFERENCES public.sessions(session_id);


--
-- Name: bill_items bill_items_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.bill_items
    ADD CONSTRAINT bill_items_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;


--
-- Name: bills bills_table_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_table_no_fkey FOREIGN KEY (table_no) REFERENCES public.tables(table_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: orders fk_orders_bills_composite; Type: FK CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_orders_bills_composite FOREIGN KEY (table_no, party_no, created_at, track, clerk_initials) REFERENCES public.bills(table_no, party_no, created_at, track, clerk_initials) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sessions sessions_shift_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sathvikkemtur
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_shift_name_fkey FOREIGN KEY (shift_name) REFERENCES public.shifts(shift_name);


--
-- PostgreSQL database dump complete
--

\unrestrict fpTc3WfKcWPtzOUxeo8Rb2sGLoxNGnvwM79hpBmy6JtOimYaChvTTmM7beS3nbA

