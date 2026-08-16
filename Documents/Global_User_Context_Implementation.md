# Global User Context Implementation

## Summary

Implemented a global UserContext to store and manage the logged-in user's clerk initials, track, billing date, and session ID across the entire application. This ensures that the correct clerk's information is used consistently throughout the app, especially when printing bills.

## Changes Made

### 1. Created UserContext (`src/context/UserContext.js`)

- Created a React Context to store global user state:
  - `userInitials`: Clerk initials (e.g., "SHI", "CLK")
  - `track`: Current shift track (e.g., "`", "``", "RBS1", "RBS2")
  - `billingDate`: Current billing date
  - `sessionId`: Current session ID
- Automatically syncs all values with localStorage
- Provides `useUser()` hook for easy access in any component

### 2. Updated `src/index.js`

- Wrapped the entire App with `UserProvider` to make the context available globally

### 3. Updated `src/App.js`

- Replaced local state with `useUser()` hook from UserContext
- Simplified `handleLogin` and `handleLogout` functions
- Context now handles localStorage synchronization automatically

### 4. Updated `src/components/BillPrint.js`

- Now uses `useUser()` hook to get the logged-in clerk's initials
- When fetching settings, it uses:
  1. Clerk initials from bill data (if available)
  2. Otherwise, uses logged-in clerk from global context
  3. Falls back to "CLK" if neither is available
- This ensures bills always print with the correct clerk's settings

### 5. BillingScreen.js

- Already receives `userInitials` as a prop from App.js
- Now automatically gets the correct value from global context
- No changes needed (works automatically)

## How It Works

1. **Login**: When a user logs in with "SHI", the UserContext stores "SHI" in both state and localStorage
2. **Bill Creation**: When creating a bill, BillingScreen uses the `userInitials` from context
3. **Bill Printing**: BillPrint component:
   - Checks if bill data has clerk_initials
   - If not, uses the logged-in clerk from global context
   - Fetches the correct settings for that clerk
   - Displays clerk initials in the bill header (e.g., "Hotel Name(SHI)")

## Benefits

✅ **Centralized State**: All user-related data in one place
✅ **Automatic Persistence**: localStorage sync handled automatically
✅ **Consistent Data**: Same clerk initials used everywhere
✅ **Easy Access**: Any component can use `useUser()` hook
✅ **No Prop Drilling**: Components can access user data directly

## Testing

To verify the fix:

1. Login with "SHI" credentials
2. Create and print a bill
3. The bill should show:
   - Hotel name with "(SHI)" in the header
   - Settings from the SHI clerk's configuration
   - Correct clerk initials throughout

## Future Usage

Any component that needs user information can now use:

```javascript
import { useUser } from "../context/UserContext";

function MyComponent() {
  const { userInitials, track, billingDate, sessionId } = useUser();

  // Use the values as needed
  console.log("Current clerk:", userInitials);
}
```
