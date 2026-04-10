import type { DashboardDefinition } from '@shared/types/dashboard';
import { costDelegationTemplate } from './cost-delegation';
import { platformHealthTemplate } from './platform-health';

export const DASHBOARD_TEMPLATES: DashboardDefinition[] = [
  costDelegationTemplate,
  platformHealthTemplate,
];
