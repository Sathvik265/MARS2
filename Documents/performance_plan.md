@"
## Plan: Optimize Performance Bottlenecks in Restaurant Billing App

Identify and fix key performance bottlenecks in the backend (Node.js/Express/PostgreSQL), frontend (React), and database (PostgreSQL schema/queries) to improve response times, reduce memory usage, and handle larger datasets efficiently. Focus on pagination, indexing, memoization, and query optimization for scalability from small (50 bills/day) to busy periods (1500 bills/day) with low concurrency (1-5 users).

**Steps**
1. Add database indexes on frequently queried columns (e.g., bills.created_at, bills.track, orders.created_at) to eliminate full table scans for report queries.
2. Implement pagination in backend APIs (e.g., getAllBills, getDateRangeReport) with LIMIT/OFFSET to prevent loading all 1500 bills at once.
3. Optimize frontend rendering: Add useMemo for filtered lists (e.g., in FoodMenu.js, RecentBills.js) and React.memo for list items to reduce unnecessary re-renders during busy periods.
4. Refactor heavy computations out of render cycles (e.g., category parsing in FoodMenu.js) into useMemo hooks to handle large menus efficiently.
5. Add debouncing to search inputs (e.g., in BillingScreen.js, FoodMenu.js) to limit excessive filtering on keystrokes.
6. Implement virtualization for large tables (e.g., menu items >50) using react-window to improve scrolling performance when viewing reports.
7. Optimize JSONB queries in reports (e.g., getShiftDetailedReport) by pre-filtering bills before jsonb_array_elements expansion to handle 1500 bills/day.
8. Add caching for frequently accessed data (e.g., menu items) using in-memory cache to reduce database hits.
9. Profile and test changes with load simulations (e.g., 1500 bills) using tools like Artillery for backend and React Profiler for frontend.
10. Monitor for lock contention on running_bills table with low concurrency; add row-level locking if needed.

**Relevant files**
- restaurant-billing-app/backend/src/models/billingModel.js — Add pagination to getAllBills query
- restaurant-billing-app/backend/src/controllers/reportController.js — Optimize JSONB queries in reports
- restaurant-billing-app/frontend/src/components/FoodMenu.js — Memoize filteredItems and category parsing
- restaurant-billing-app/frontend/src/components/BillingScreen.js — Add debouncing and memoization for search/filter
- restaurant-billing-app/Final.sql — Add indexes scripts
- restaurant-billing-app/backend/src/app.js — Review middleware for blocking operations

**Verification**
1. Run EXPLAIN ANALYZE on key queries (e.g., getAllBills, report queries) before/after index additions to confirm reduced scan times for 1500 bills.
2. Use React DevTools Profiler to measure render times for components like FoodMenu and RecentBills with 200+ items.
3. Perform load testing with 5 concurrent users and 1500 bills/day using Artillery, checking response times <500ms for APIs.
4. Monitor database query performance with pg_stat_statements extension.
5. Test pagination: Ensure getAllBills with limit=50 loads in <200ms for 1500 bills.

**Decisions**
- Prioritize backend database optimizations first, as they impact all users; frontend changes second for UI responsiveness.
- Use LIMIT/OFFSET pagination for simplicity, given low concurrency.
- Exclude partitioning initially; implement only if historical data (e.g., >10k bills) causes issues.
- Focus on caching and memoization to handle peak loads without over-engineering for high concurrency.

**Further Considerations**
1. How many menu items are there? If >500, prioritize virtualization and memoization.
2. Do bills have an average of 10-20 items each? This affects JSONB query performance.
"@ | Out-File -FilePath "Documents/performance_plan.md" -Encoding UTF8