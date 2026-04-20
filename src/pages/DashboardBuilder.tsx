// Re-export shim for OMN-43: DashboardBuilder renamed to DashboardView.
// Tests and integration tests that import DashboardBuilder continue to work
// unchanged via this alias. Remove this shim in OMN-44 when all references
// are migrated to DashboardView.
export { DashboardView as DashboardBuilder } from './DashboardView';
