# Kafka Timeout Fix for Node.js 23.x

## Problem

When running Omnidash with Node.js 23.x, a `TimeoutNegativeWarning` was emitted on startup:

```
(node:86929) TimeoutNegativeWarning: -1762868040434 is a negative number.
Timeout duration was set to 1.
```

## Root Cause

This is a known bug in `kafkajs@2.2.4` (and earlier versions) when running on Node.js 22+ or 23+.

**Issue**: [kafkajs #1751](https://github.com/tulios/kafkajs/issues/1751)

The bug occurs in `node_modules/kafkajs/src/network/requestQueue/index.js` in the `scheduleCheckPendingRequests()` method:

```javascript
let scheduleAt = this.throttledUntil - Date.now()
// ...
this.throttleCheckTimeoutId = setTimeout(() => { ... }, scheduleAt)
```

When `throttledUntil` is `-1` (initial value) and there are no pending requests, `scheduleAt` becomes a huge negative number (e.g., `-1762868040434`), which triggers the Node.js warning when passed to `setTimeout()`.

## Solution Applied

We've applied a patch using `patch-package` that adds validation before scheduling the timeout:

```javascript
// Fix: Ensure scheduleAt is never negative to prevent TimeoutNegativeWarning
// This can happen when throttledUntil is -1 (initial value) and pending is empty
if (scheduleAt <= 0) {
  return // No need to schedule if not throttled and no pending requests
}
```

## Files Modified

1. **package.json** - Added `postinstall` script to automatically apply patches:
   ```json
   "scripts": {
     "postinstall": "patch-package"
   }
   ```

2. **patches/kafkajs+2.2.4.patch** - Contains the patch that fixes the timeout issue

3. **node_modules/kafkajs/src/network/requestQueue/index.js** - Patched version (auto-applied)

## Maintenance

### After npm install

The patch is **automatically applied** after every `npm install` thanks to the `postinstall` script. You don't need to do anything manually.

### If you see the warning again

1. Check that `patches/kafkajs+2.2.4.patch` still exists
2. Verify the postinstall script is in package.json
3. Manually reapply the patch: `npx patch-package kafkajs`

### Upgrading kafkajs

When kafkajs releases version 2.2.5+ with a proper fix:

1. Update kafkajs: `npm install kafkajs@latest`
2. Test if the warning is gone without the patch
3. If fixed upstream, remove the patch:
   - Delete `patches/kafkajs+2.2.4.patch`
   - Remove or update `postinstall` script if no other patches exist

## Verification

To verify the fix is working:

```bash
PORT=3000 npm run dev 2>&1 | grep -i "timeout"
```

You should see NO `TimeoutNegativeWarning` messages. The Kafka consumer should connect successfully:

```
Kafka consumer connected
[EventConsumer] Preloaded historical data from PostgreSQL
Event consumer started successfully
```

## References

- **GitHub Issue**: https://github.com/tulios/kafkajs/issues/1751
- **Node.js Version**: 23.10.0 (affected)
- **kafkajs Version**: 2.2.4 (affected)
- **Fix Applied**: 2025-11-11
- **Status**: ✅ Working - No warnings on startup

## Alternative Solutions Considered

1. **Downgrade Node.js to v20 LTS** - Would work but limits using newer Node.js features
2. **Upgrade to kafkajs beta (2.3.0-beta.x)** - Beta versions released before Node.js 24, unlikely to have fix
3. **Wait for official fix** - Issue is still open, no timeline for fix
4. **✅ Apply local patch (SELECTED)** - Minimal, targeted fix that's automatically maintained
