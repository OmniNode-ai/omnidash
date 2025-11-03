# Quick Fix Summary: Database Connection Failed

## Problem

The dashboard header shows **"Database connection failed"** and all dashboards are silently falling back to mock data.

## Root Cause

**Environment variable mismatch** between `.env` file and code expectations:

| What .env has | What code expects |
|---------------|-------------------|
| `TRACEABILITY_DB_HOST` | `POSTGRES_HOST` |
| `TRACEABILITY_DB_PORT` | `POSTGRES_PORT` |
| `TRACEABILITY_DB_NAME` | `POSTGRES_DATABASE` |
| `TRACEABILITY_DB_USER` | `POSTGRES_USER` |
| `TRACEABILITY_DB_PASSWORD` | `POSTGRES_PASSWORD` |

**Location of issue**:
- Code: `server/storage.ts:49-51`
- Alert check: `server/alert-routes.ts:74-85`
- Alert displayed: `client/src/components/AlertBanner.tsx`

## Solution

Add these lines to your `.env` file:

```bash
# PostgreSQL Intelligence Database
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omninode_bridge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=omninode_remote_2024_secure
```

## Steps to Fix

1. **Edit `.env` file** - Add the variables above
2. **Restart server** - `Ctrl+C` then `PORT=3000 npm run dev`
3. **Verify fix** - Alert banner should disappear
4. **Test API** - Run: `curl http://localhost:3000/api/intelligence/alerts/active`
   - Should return `{"alerts":[]}` or specific alerts, NOT "Database connection failed"

## What This Fixes

✅ Database connection will work
✅ "Database connection failed" alert will disappear
✅ All dashboards will use **real data** instead of mock fallbacks
✅ Pattern Learning dashboard will show actual patterns from PostgreSQL
✅ Agent Management will show real agent execution data
✅ All metrics will be accurate

## Current Data Status

**Before Fix** (Database not connected):
- ❌ Database connection: **FAILED**
- 🔄 All dashboards: **Using mock data fallbacks**
- ⚠️ Alert banner: **Showing error message**

**After Fix** (Database connected):
- ✅ Database connection: **Working**
- ✅ All dashboards: **Using real PostgreSQL data**
- ✅ Alert banner: **Clear** (no errors)

## Dashboard Integration Status

| Dashboard | Real Data API | Current Status |
|-----------|---------------|----------------|
| Agent Management | ✅ Implemented | 🔄 Falling back to mock (DB disconnected) |
| Pattern Learning | ✅ Implemented | 🔄 Falling back to mock (DB disconnected) |
| Intelligence Operations | ✅ Implemented | 🔄 Falling back to mock (DB disconnected) |
| Code Intelligence | 🔶 Partial (gates/thresholds mock) | 🔶 Partial |
| Event Flow | ✅ Implemented (OmniArchon) | ✅ Working (not DB dependent) |
| Knowledge Graph | ✅ Implemented (OmniArchon) | ✅ Working (not DB dependent) |
| Platform Health | ✅ Implemented | 🔄 Falling back to mock (DB disconnected) |

**Legend**:
- ✅ = Fully integrated and working
- 🔶 = Partially integrated
- 🔄 = Working but using mock fallback due to DB issue

## Testing After Fix

```bash
# Test database connection
source .env
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DATABASE -c "SELECT 1"

# Test pattern summary endpoint (should return real data)
curl http://localhost:3000/api/intelligence/patterns/summary?timeWindow=24h | jq

# Test agent summary endpoint
curl http://localhost:3000/api/intelligence/agents/summary?timeWindow=24h | jq

# Check alerts (should be empty or show real alerts, not DB connection error)
curl http://localhost:3000/api/intelligence/alerts/active | jq
```

## Full Documentation

See `DASHBOARD_MOCK_VS_REAL_AUDIT.md` for:
- Complete dashboard-by-dashboard audit
- All API endpoints and their status
- Data source patterns and fallback behavior
- Detailed recommendations for remaining improvements

## Questions?

If the fix doesn't work:

1. **Check PostgreSQL is running on 192.168.86.200:5436**
   ```bash
   nc -zv 192.168.86.200 5436
   ```

2. **Verify password is correct**
   ```bash
   psql "postgresql://postgres:omninode_remote_2024_secure@192.168.86.200:5436/omninode_bridge" -c "SELECT 1"
   ```

3. **Check server logs for detailed error messages**
   ```bash
   # Server will show database connection errors on startup
   PORT=3000 npm run dev
   ```

4. **Verify .env is being loaded**
   ```bash
   # Add temporary debug line to server/storage.ts after line 3:
   console.log('DB Config:', {
     host: process.env.POSTGRES_HOST,
     port: process.env.POSTGRES_PORT,
     database: process.env.POSTGRES_DATABASE,
   });
   ```
