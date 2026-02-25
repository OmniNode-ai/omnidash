import { Redirect } from 'wouter';

/**
 * Redirect: /preview/contracts-v2 → /contracts
 * Kept for one release cycle to avoid broken links.
 */
export default function ContractBuilderV2() {
  return <Redirect to="/contracts" />;
}
