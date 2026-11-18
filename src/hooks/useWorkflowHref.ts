import { useLocation, useSearch } from 'wouter';
import { PAGE_PATHS } from '@/navigation/page-routes';
import { workflowHref } from '@/navigation/workflow-url-state';

/**
 * OMN-24616 AC7: the Workflow address of a run as linked from where the reader is. On Runs it carries the Runs view
 * (its filters included), so the run page leads back to it; anywhere else it is the plain run address.
 */
export function useWorkflowHref(): (runId: string) => string {
  const [location] = useLocation();
  const search = useSearch();
  const runs = PAGE_PATHS['local-runs'];
  const here = location === runs ? (search === '' ? runs : `${runs}?${search}`) : null;
  return runId => workflowHref(runId, here);
}
