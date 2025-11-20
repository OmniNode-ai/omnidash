/**
 * Event Bus Verification Script
 *
 * Verifies that:
 * 1. Event bus API endpoints are working
 * 2. Events are being generated and stored
 * 3. Event data is valid
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function verifyEventBus() {
  console.warn('🔍 Verifying Event Bus Data Source...\n');

  try {
    // 1. Check status
    console.warn('1. Checking Event Bus Status...');
    const statusResponse = await fetch(`${BASE_URL}/api/event-bus/status`);
    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.statusText}`);
    }
    const status = await statusResponse.json();
    console.warn('   ✅ Status:', status);
    console.warn(`   - Active: ${status.active}`);
    console.warn(`   - Connected: ${status.connected}`);
    console.warn(`   - Status: ${status.status}\n`);

    // 2. Query events
    console.warn('2. Querying Events...');
    const eventsResponse = await fetch(`${BASE_URL}/api/event-bus/events?limit=10`);
    if (!eventsResponse.ok) {
      throw new Error(`Events query failed: ${eventsResponse.statusText}`);
    }
    const eventsData = await eventsResponse.json();
    console.warn(`   ✅ Found ${eventsData.count} events`);

    if (eventsData.events.length > 0) {
      console.warn(`   - Sample events:`);
      eventsData.events.slice(0, 3).forEach((event: any, i: number) => {
        console.warn(`     ${i + 1}. ${event.event_type}`);
        console.warn(`        ID: ${event.event_id}`);
        console.warn(`        Timestamp: ${event.timestamp}`);
        console.warn(`        Source: ${event.source}`);
      });
    } else {
      console.warn('   ⚠️  No events found yet (waiting for mock generator...)');
    }
    console.warn('');

    // 3. Get statistics
    console.warn('3. Getting Statistics...');
    const statsResponse = await fetch(`${BASE_URL}/api/event-bus/statistics`);
    if (!statsResponse.ok) {
      throw new Error(`Statistics query failed: ${statsResponse.statusText}`);
    }
    const stats = await statsResponse.json();
    console.warn('   ✅ Statistics:');
    console.warn(`   - Total Events: ${stats.total_events}`);
    console.warn(`   - Events by Type: ${Object.keys(stats.events_by_type).length} types`);
    console.warn(`   - Events by Tenant: ${Object.keys(stats.events_by_tenant).length} tenants`);
    console.warn(`   - Events per Minute: ${stats.events_per_minute.toFixed(2)}`);
    if (stats.oldest_event) {
      console.warn(`   - Oldest Event: ${new Date(stats.oldest_event).toISOString()}`);
    }
    if (stats.newest_event) {
      console.warn(`   - Newest Event: ${new Date(stats.newest_event).toISOString()}`);
    }
    console.warn('');

    // 4. Verify event types
    if (eventsData.events.length > 0) {
      console.warn('4. Verifying Event Types...');
      const eventTypes = new Set(eventsData.events.map((e: any) => e.event_type));
      const validPatterns = [
        /omninode\.intelligence\..*\.v\d+/,
        /omninode\.agent\..*\.v\d+/,
        /omninode\.metadata\..*\.v\d+/,
        /omninode\.code\..*\.v\d+/,
        /omninode\.database\..*\.v\d+/,
        /omninode\.consul\..*\.v\d+/,
        /omninode\.vault\..*\.v\d+/,
        /omninode\.bridge\..*\.v\d+/,
        /omninode\.service\..*\.v\d+/,
        /omninode\.logging\..*\.v\d+/,
        /onex\..*\.v\d+/,
      ];

      let allValid = true;
      eventTypes.forEach((eventType) => {
        const matches = validPatterns.some((pattern) => pattern.test(eventType));
        if (!matches) {
          console.warn(`   ❌ Invalid event type: ${eventType}`);
          allValid = false;
        }
      });

      if (allValid) {
        console.warn(`   ✅ All ${eventTypes.size} event types are valid`);
      }
      console.warn('');
    }

    // 5. Check event chains
    if (eventsData.events.length > 0) {
      console.warn('5. Checking Event Chains...');
      const eventsWithCorrelation = eventsData.events.filter((e: any) => e.correlation_id);

      if (eventsWithCorrelation.length > 0) {
        const correlationId = eventsWithCorrelation[0].correlation_id;
        const chainResponse = await fetch(
          `${BASE_URL}/api/event-bus/events?correlation_id=${encodeURIComponent(correlationId)}`
        );
        if (!chainResponse.ok) {
          console.warn(
            `   ⚠️  Correlation chain request failed: ${chainResponse.status} ${chainResponse.statusText}`
          );
        } else {
          const chainData = await chainResponse.json();
          console.warn(`   ✅ Found ${chainData.events.length} events in chain: ${correlationId}`);
          const chainTypes = chainData.events.map((e: any) => e.event_type);
          console.warn(`   - Event types: ${chainTypes.join(', ')}`);
        }
      } else {
        console.warn('   ⚠️  No events with correlation_id found');
      }
      console.warn('');
    }

    console.warn('✅ Event Bus Verification Complete!\n');
    return true;
  } catch (error) {
    console.error('❌ Event Bus Verification Failed:', error);
    if (error instanceof Error) {
      console.error('   Error:', error.message);
    }
    return false;
  }
}

// Run verification
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyEventBus()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { verifyEventBus };
