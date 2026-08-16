# Restaurant Billing System - ER Diagram

This diagram represents the final database schema after applying the initial creation script and all subsequent updates (Update-1, Update-2, and Update-3).

```mermaid
erDiagram
    sections ||--o{ bills : "linked by table_no"
    bills ||--o{ orders : "linked by composite key (table_no, party_no, created_at, track, clerk_initials)"
    shifts ||--o{ sessions : "linked by shift_name"
    sessions ||--o{ audit_log : "linked by session_id"
    items ||--o{ orders : "logical link by item code"

    settings {
        int id PK
        string hotel_name
        text address
        string phone
        string gstin
        string clerk_initials UK "Unique Clerk Identifier"
        timestamp_with_timezone created_at
    }

    items {
        int id PK
        string name
        string alpha_code UK
        string numeric_code UK
        decimal price_fixed
        decimal price_general
        decimal price_ac
        boolean is_separate
        string category_old "Migrated from original schema"
        jsonb category "Stores array of categories with quantities"
        timestamp_with_timezone created_at
    }

    shifts {
        int id PK
        string shift_name UK "e.g., `, ``, RBS1, RBS2"
        timestamp_with_timezone created_at
    }

    sessions {
        int id PK
        uuid session_id UK
        string shift_name FK "References shifts.shift_name"
        string clerk_initials
        date session_date
        timestamp_with_timezone start_time
        timestamp_with_timezone end_time
        string status "OPEN or CLOSED"
        string closed_by
        timestamp_with_timezone created_at
    }

    bills {
        int id PK
        int bill_number
        date bill_date
        int table_no FK "References sections.table_id"
        string party_no
        string section "Bill billing section (G/AC)"
        string track
        string clerk_initials
        decimal subtotal
        decimal sgst
        decimal cgst
        decimal tax_amount
        decimal grand_total
        jsonb items_json "Archived items data"
        string order_id
        timestamp_with_timezone created_at
    }

    orders {
        int id PK
        string track FK "Part of composite key to bills"
        string clerk_initials FK "Part of composite key to bills"
        int table_no FK "Part of composite key to bills"
        string party_no FK "Part of composite key to bills"
        int bill_number
        date bill_date
        string item_code
        string numeric_item_code
        string item_name
        int quantity
        decimal unit_price
        decimal line_total
        timestamp_with_timezone created_at FK "Part of composite key to bills"
        timestamp_with_timezone updated_at
    }

    sections {
        int table_id PK "Equivalent to table_no"
        string section_name
        timestamp_with_timezone created_at
        timestamp_with_timezone updated_at
    }

    audit_log {
        int id PK
        uuid event_id
        timestamp_with_timezone timestamp_utc
        string performed_by_user_id
        string performed_by_user_name
        string user_role
        string action_type
        string resource_type
        string resource_id
        uuid shift_session_id FK "References sessions.session_id"
        inet ip_address
        jsonb payload
        uuid correlation_id
    }
```

## Key Relationships & Constraints

1.  **Bills & Sections**: Every bill is associated with a specific table/section via the `table_no` (FK to `sections.table_id`).
2.  **Orders & Bills**: In the final schema (Update-3), orders are linked to bills using a composite foreign key consisting of `(table_no, party_no, created_at, track, clerk_initials)`. This ensures precise tracking of orders related to a specific billing instance.
3.  **Shifts & Sessions**: The `sessions` table tracks individual instances of shifts. Each session belongs to a predefined shift type in the `shifts` table.
4.  **Audit Logs**: All system events in the `audit_log` are optionally linked to a specific `session_id` to track actions during a particular shift.
5.  **Settings**: Global configuration and the unique clerk identifier are managed here.
6.  **Items**: The menu items include both alpha and numeric codes for quick entry, and support a complex category structure via JSONB (Update-1) to handle item components (e.g., an "Idli Vada" plate containing 1 Idli and 1 Vada).
