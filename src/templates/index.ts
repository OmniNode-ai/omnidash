import type { DashboardDefinition } from '@shared/types/dashboard';
import { costDelegationTemplate } from './cost-delegation';
import { delegationEvidenceTemplate } from './delegation-evidence';
import { platformHealthTemplate } from './platform-health';

export const DASHBOARD_TEMPLATES: DashboardDefinition[] = [
  costDelegationTemplate,
  delegationEvidenceTemplate,
  platformHealthTemplate,
];
