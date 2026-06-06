import type { DashboardDefinition } from '@shared/types/dashboard';
import { costDelegationTemplate } from './cost-delegation';
import { delegationEvidenceTemplate } from './delegation-evidence';
import { platformHealthTemplate } from './platform-health';
import { seaDemoTemplate } from './sea-demo';

export const DASHBOARD_TEMPLATES: DashboardDefinition[] = [
  seaDemoTemplate,
  costDelegationTemplate,
  delegationEvidenceTemplate,
  platformHealthTemplate,
];
