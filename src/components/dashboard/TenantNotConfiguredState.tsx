import { Text } from '@/components/ui/typography';

/** Shared operator-facing state for a refused tenant-scoped projection read. */
export function TenantNotConfiguredState() {
  return (
    <div data-tenant-state="not-configured" role="status">
      <Text as="div" size="lg" color="tertiary">Tenant not configured</Text>
      <Text as="div" size="sm" color="tertiary">Configure the tenant in contract.local.yaml.</Text>
    </div>
  );
}
