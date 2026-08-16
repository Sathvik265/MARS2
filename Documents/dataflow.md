# RESTAURANT BILLING SYSTEM - DATA FLOW DOCUMENTATION

SYSTEM OVERVIEW
The Restaurant Billing System is designed to manage restaurant operations including
shift management, order taking, bill generation, and audit tracking. The system uses
a composite key architecture for bills to support multi-party billing at tables.

DATABASE ARCHITECTURE
Core Tables (9 tables):
settings - System configuration

items - Menu items catalog

sessions - Shift and session management

bill_sequences - Bill numbering sequence

sections - Table-section mappings

orders - Temporary order storage (pre-bill printing)

bills - Final printed bills

bill_items - Items in printed bills

audit_log - System audit trail

Key Design Patterns:
Composite Primary Key: bills (track, clerk_initials, table_no, party_no, bill_number)

Temporary Storage Pattern: orders table → bill_items table on print

No foreign key constraints between bill_items and bills (allows duplicates)

Section-based pricing through sections table

DATA FLOW DIAGRAMS
FLOW 1: SYSTEM INITIALIZATION
┌─────────────────────────────────────────────────────────────┐
│ 1. SYSTEM STARTUP │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Check/Insert Settings │
│ - Hotel Name: "Udupi Anand Bhavan" │
│ - Address, Phone, GSTIN │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Initialize Shift Sessions for Current Date │
│ - Shift '`' (6:00 AM - 11:59 AM) │
│ - Shift '``' (12:00 PM - 5:59 PM) │
│ - Shift 'RBS1' (6:00 PM - 9:59 PM) │
│ - Shift 'RBS2' (10:00 PM onwards) │
│ Each created with clerk_initials='SYS', status='OPEN' │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Load Menu Items │
│ - 8 pre-configured items (Idli, Dosa, Coffee, etc.) │
│ - Each with alpha_code, numeric_code │
│ - Prices for: Fixed, General, AC sections │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Initialize Section Mappings │
│ - Table 1: Parcel │
│ - Tables 2-14: General │
│ - Tables 15-30: AC │
└─────────────────────────────────────────────────────────────┘

FLOW 2: SHIFT SESSION MANAGEMENT
┌─────────────────────────────────────────────────────────────┐
│ 1. CLERK STARTS SHIFT │
│ Input: clerk_initials, shift_name, session_date │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 2. INSERT INTO sessions │
│ - Generate UUID (session_id) │
│ - Set start_time = CURRENT_TIMESTAMP │
│ - Set status = 'OPEN' │
│ - Unique constraint: (shift_name, session_date, clerk) │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Log to audit_log │
│ - action_type: 'SHIFT_START' │
│ - session_id: UUID reference │
│ - payload: JSON with shift details │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Clerk Takes Orders/Creates Bills │
│ (See FLOW 3: ORDER CREATION) │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 5. CLERK ENDS SHIFT │
│ - UPDATE sessions │
│ - SET end_time = CURRENT_TIMESTAMP │
│ - SET status = 'CLOSED' │
│ - SET closed_by = clerk_name │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Log to audit_log │
│ - action_type: 'SHIFT_END' │
└─────────────────────────────────────────────────────────────┘

FLOW 3: ORDER CREATION & BILL PRINTING (COMPLETE WORKFLOW)
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: CUSTOMER ARRIVES & GETS SEATED │
│ Waiter assigns: Table 5, Party 1, Section (General) │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: DETERMINE CURRENT SHIFT │
│ Call: get_current_session_id() │
│ - Returns UUID based on current time │
│ - Example: shift_name='`' for morning (6AM-12PM) │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: GET NEXT BILL NUMBER │
│ Check bill_sequences for current date │
│ - If exists: INCREMENT last_number │
│ - If not exists: INSERT with last_number=1 │
│ Example: bill_number = 14 │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: TAKE ORDER (Items NOT yet printed) │
│ Customer orders: Idli (2), Coffee (1), Vada (1) │
│ │
│ FOR EACH ITEM: │
│ 1. Look up item in 'items' table │
│ 2. Get price based on section (General=price_general) │
│ 3. Calculate line_total = quantity × unit_price │
│ 4. INSERT INTO orders table: │
│ - track = 'TRACK1' (shift track identifier) │
│ - clerk_initials = 'ABC' │
│ - table_no = '5' │
│ - party_no = '1' │
│ - bill_number = 14 │
│ - item_code = 'IDL' (alpha_code) │
│ - numeric_item_code = '101' │
│ - item_name = 'Idli (2 pcs)' │
│ - quantity = 2 │
│ - unit_price = 30.00 (from items.price_general) │
│ - line_total = 60.00 │
│ - order_status = 'PENDING' │
│ - ordered_at = CURRENT_TIMESTAMP │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: ORDER IN TEMPORARY STORAGE │
│ orders table now contains: │
│ ┌────┬────────┬─────┬──────────┬────────┬───────┬──────┐│
│ │ID │Track │Table│Bill# │Item │Qty │Total ││
│ ├────┼────────┼─────┼──────────┼────────┼───────┼──────┤│
│ │1 │TRACK1 │5 │14 │Idli │2 │60.00 ││
│ │2 │TRACK1 │5 │14 │Coffee │1 │20.00 ││
│ │3 │TRACK1 │5 │14 │Vada │1 │25.00 ││
│ └────┴────────┴─────┴──────────┴────────┴───────┴──────┘│
│ │
│ Order status = PENDING (bill NOT yet printed) │
│ Customer can still add/remove items │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: CHECK PENDING ORDERS (View) │
│ Query: SELECT _ FROM pending_bills │
│ WHERE table_no = '5' │
│ │
│ Returns: │
│ - track: TRACK1 │
│ - clerk_initials: ABC │
│ - table_no: 5 │
│ - party_no: 1 │
│ - bill_number: 14 │
│ - section_name: General │
│ - total_items: 3 │
│ - total_amount: 105.00 │
│ - order_started_at: <timestamp> │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: CUSTOMER REQUESTS BILL │
│ Waiter clicks "Print Bill" for Table 5, Party 1, Bill 14│
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 8: CREATE BILL RECORD │
│ Calculate totals from orders: │
│ - subtotal = 105.00 │
│ - SGST = 2.50 (2.5%) │
│ - CGST = 2.50 (2.5%) │
│ - tax_amount = 5.00 │
│ - grand_total = 110.00 │
│ │
│ INSERT INTO bills: │
│ - bill_number = 14 │
│ - bill_date = CURRENT_DATE │
│ - table_no = '5' │
│ - party_no = '1' │
│ - section = 'G' (General) │
│ - track = 'TRACK1' │
│ - clerk_initials = 'ABC' │
│ - subtotal = 105.00 │
│ - sgst = 2.50 │
│ - cgst = 2.50 │
│ - tax_amount = 5.00 │
│ - grand_total = 110.00 │
│ - created_at = CURRENT_TIMESTAMP │
│ │
│ PRIMARY KEY = (TRACK1, ABC, 5, 1, 14) │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 9: MOVE ORDERS TO BILL_ITEMS │
│ Call: move_orders_to_bill_items('TRACK1','ABC','5','1',14)│
│ │
│ This function: │
│ 1. Gets bill.id for the composite key │
│ 2. INSERT INTO bill_items (FROM orders) │
│ - bill_id = <found id> │
│ - track = 'TRACK1' │
│ - clerk_initials = 'ABC' │
│ - table_no = '5' │
│ - party_no = '1' │
│ - bill_number = 14 │
│ - item_code = 'IDL' │
│ - numeric_item_code = '101' │
│ - item_name = 'Idli (2 pcs)' │
│ - quantity = 2 │
│ - unit_price = 30.00 │
│ - line_total = 60.00 │
│ │
│ 3. DELETE FROM orders │
│ WHERE (track, clerk, table, party, bill) match │
│ │
│ Returns: 3 (number of items moved) │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 10: BILL PRINTED & SAVED │
│ - orders table is now EMPTY for this bill │
│ - bill_items table contains all 3 items │
│ - bills table has the bill record │
│ - Composite key ensures uniqueness │
│ │
│ Final State: │
│ ┌──────────────────────────────────────────────┐ │
│ │ bills table │ │
│ │ PK: (TRACK1, ABC, 5, 1, 14) │ │
│ │ grand_total: 110.00 │ │
│ └──────────────────────────────────────────────┘ │
│ │
│ ┌──────────────────────────────────────────────┐ │
│ │ bill_items table (3 rows) │ │
│ │ Each row references bill via: │ │
│ │ - bill_id (internal reference) │ │
│ │ - composite key (track,clerk,table,party,#) │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 11: TABLE STATUS UPDATED │
│ Query: SELECT _ FROM table_status │
│ WHERE table_id = 5 │
│ │
│ Returns: │
│ - table_id: 5 │
│ - section_name: General │
│ - status: AVAILABLE (no pending orders) │
│ - total_items: NULL │
│ - total_amount: NULL │
└──────────────────┬──────────────────────────────────────────┘
▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 12: AUDIT LOG ENTRY │
│ INSERT INTO audit_log: │
│ - event_id = <new UUID> │
│ - timestamp_utc = CURRENT_TIMESTAMP │
│ - performed_by_user_name = 'ABC' │
│ - action_type = 'BILL_CREATED' │
│ - resource_type = 'BILL' │
│ - resource_id = '14' │
│ - session_id = <current shift UUID> │
│ - payload = {bill details in JSON} │
└─────────────────────────────────────────────────────────────┘

FLOW 4: QUERYING & REPORTING
┌─────────────────────────────────────────────────────────────┐
│ QUERY TYPE 1: Get All Pending Orders │
│ │
│ SELECT \* FROM pending_bills; │
│ │
│ Returns all bills with items in orders table (not printed) │
│ Groups by composite key, shows totals and timestamps │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ QUERY TYPE 2: Get Completed Bills │
│ │
│ SELECT \* FROM completed_bills │
│ WHERE bill_date = CURRENT_DATE; │
│ │
│ Returns all printed bills with item counts and totals │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ QUERY TYPE 3: Table Occupancy Status │
│ │
│ SELECT \* FROM table_status; │
│ │
│ Shows which tables have pending orders (OCCUPIED) │
│ vs which are free (AVAILABLE) │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ QUERY TYPE 4: Shift Performance │
│ │
│ SELECT ss.shift_name, ss.clerk_initials, │
│ COUNT(b.id) as total_bills, │
│ SUM(b.grand_total) as total_revenue │
│ FROM sessions ss │
│ JOIN bills b ON (ss.shift_name = substring(b.track, ...)) │
│ WHERE ss.session_date = CURRENT_DATE │
│ GROUP BY ss.shift_name, ss.clerk_initials; │
└─────────────────────────────────────────────────────────────┘

KEY FEATURES & DESIGN DECISIONS

1. Composite Primary Key Strategy
   Bills Table PK: (track, clerk_initials, table_no, party_no, bill_number)

Why?

Supports multiple parties at same table

Each party can have multiple bills

Track identifies shift/session context

Unique identification without auto-increment

Example Scenario:

Table 10 has 2 parties

Party 1: Bill #25, #26 (they ordered twice)

Party 2: Bill #27

All uniquely identified by composite key

2. Temporary Storage Pattern (orders table)
   Flow: orders → bill_items (on print)

Benefits:

Orders can be modified before printing

Kitchen can see pending orders

Clean separation: pending vs finalized

Easy to track "unpaid" tables

3. Section-Based Pricing
   sections table → items table (price_fixed, price_general, price_ac)

Logic:

Look up table in sections: table 5 → General

Use items.price_general for all items

Calculate totals based on section pricing

4. No Foreign Key on bill_items
   Allows duplicate items in multiple bills

Reason:

Same item can appear in many bills

No referential integrity issues

Flexibility for data modifications

Integrity maintained via helper functions

5. Shift Auto-Detection
   Function: get_current_session_id()

Time-based shifts:

06:00-11:59 → '`' (morning)

12:00-17:59 → '``' (afternoon)

18:00-21:59 → 'RBS1' (evening)

22:00-05:59 → 'RBS2' (night)

6. Audit Trail
   Every action logged to audit_log

Tracked:

Shift start/end

Bill creation

User actions

System events

Linked to session_id

SAMPLE DATA SCENARIOS
Scenario 1: Busy Restaurant Day
Morning Shift (6 AM - 12 PM)

Clerk: "RAM"

Shift: '`'

Tables served: 1, 3, 5, 7, 9

Bills created: 1-25

Revenue: ₹2,500

Afternoon Shift (12 PM - 6 PM)

Clerk: "SRI"

Shift: '``'

Tables served: 2, 4, 6, 8, 10-20

Bills created: 26-60

Revenue: ₹5,200

Evening Shift (6 PM - 10 PM)

Clerk: "KRI"

Shift: 'RBS1'

Tables served: 15-30 (AC section)

Bills created: 61-95

Revenue: ₹8,700

Scenario 2: Multi-Party Table
Table 15 (AC Section)

Party 1 arrives at 7:00 PM

Bill #65: Idli (2), Coffee (2) = ₹110

Bill #70: Dosa (1), Tea (1) = ₹60

Total: ₹170

Party 2 arrives at 7:30 PM (same table, different party)

Bill #73: Vada (3), Coffee (2) = ₹170

Composite Keys:

(TRACK1, KRI, 15, 1, 65)

(TRACK1, KRI, 15, 1, 70)

(TRACK1, KRI, 15, 2, 73)

All unique, no conflicts!

ERROR HANDLING & EDGE CASES
Case 1: Duplicate Composite Keys
Prevention:

Database ensures uniqueness via PRIMARY KEY constraint

Application should check before insert

Use bill_sequences to get next available number

Case 2: Orders Stuck in Temporary Storage
Detection:

sql
SELECT \* FROM pending_bills
WHERE order_started_at < CURRENT_TIMESTAMP - INTERVAL '2 hours';
Resolution:

Manual review

Print bill or cancel order

Clear from orders table

Case 3: Shift Not Closed Properly
Detection:

sql
SELECT \* FROM sessions
WHERE session_date < CURRENT_DATE
AND status = 'OPEN';
Resolution:

Manually close shift

Update end_time and status

Case 4: Missing Composite Key Values
Handled in robust script:

NULL values filled with defaults

Ensures all 5 components have values

Validates before creating primary key

PERFORMANCE OPTIMIZATION
Indexes Created:
idx_bills_date_number - Fast bill lookups

idx_bills_clerk - Clerk performance reports

idx_items_codes - Quick item search

idx_sessions_active - Active shift queries

idx_orders_composite_key - Pending order lookups

idx_bill_items_composite_key - Bill item joins

idx_sections_section_name - Section filtering

Query Optimization Tips:
Always filter by session_date for shift queries

Use composite key for bill lookups

Use views (pending_bills, completed_bills) for common queries

Index on created_at for time-based reports

BACKUP & RECOVERY
Critical Tables (Priority Order):
bills - Core transaction data

bill_items - Transaction details

sessions - Shift tracking

items - Menu configuration

sections - Table configuration

audit_log - Audit trail

bill_sequences - Bill numbering

settings - System config

orders - Can be regenerated

Recovery Scenarios:
Data Loss: Restore from last backup

Corruption: Use audit_log to reconstruct

Incomplete Bills: Check orders table for pending

CONCLUSION
This database design provides:
✅ Flexible multi-party billing
✅ Clear order workflow (pending → printed)
✅ Section-based pricing
✅ Comprehensive audit trail
✅ Shift performance tracking
✅ Table occupancy management
✅ Data integrity without rigid constraints
✅ Scalable architecture

The composite key approach and temporary storage pattern create a robust,
flexible system suitable for high-volume restaurant operations.
