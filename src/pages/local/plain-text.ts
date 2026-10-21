/**
 * OMN-21166 AC39: the words a user reads when data is missing or a read failed. No exposure, topic, field or typed
 * code reaches the page; those stay in code, contracts and tests. One helper, used by every page and card that shows
 * a read's failure (the Overview, Runs, Usage and Workflow panels, and the Workflow run's answer).
 */

/** The one plain waiting line for a figure whose source is not served yet. */
export const NOT_AVAILABLE_YET = 'Not available yet';

/** "Not available yet: <what>" when what is missing can be named in plain words; the bare line when it cannot. */
export function notAvailableYet(waitsOn: string | undefined): string {
  return waitsOn ? `${NOT_AVAILABLE_YET}: ${waitsOn}` : NOT_AVAILABLE_YET;
}

/**
 * What each exposure holds, in plain words, so a not-served read says what is missing without naming the exposure.
 * Keyed by the exposure without its onex.snapshot.projection. prefix; an exposure not listed reads the bare line.
 */
const PLAIN_DATA_NAMES: Readonly<Record<string, string>> = {
  'delegation.decisions.v1': 'run records',
  'delegation.savings.v1': 'run savings',
  'cost.savings-overview.v1': 'savings summary',
  'metering-summary.v1': 'usage summary',
  'delegation.model-routing.v1': 'model routing',
  'local-environment.v1': 'dashboard access details',
  'run-trace.v1': 'run steps',
  'delegation.correlation-trace.v1': 'run answers',
  'tenant-credentials.v1': 'credentials',
};

function plainDataName(topic: string | undefined): string | undefined {
  return topic === undefined ? undefined : PLAIN_DATA_NAMES[topic.replace(/^onex\.snapshot\.projection\./, '')];
}

/**
 * A read's failure as a user may read it. The loader keeps the exposure name in `failure.message` for contracts and
 * tests; this says what it means. `topic` names what is missing when it is not served; `subject` is what could not be
 * read ("The answer" on the Workflow run's answer card). Only an HTTP status is kept from a failed read's message,
 * because it is the one part a user can act on or report.
 */
export function plainFailureMessage(
  failure: { kind: string; message: string },
  { topic, subject = 'The data' }: { topic?: string; subject?: string } = {},
): string {
  switch (failure.kind) {
    case 'not-served': return `${notAvailableYet(plainDataName(topic))}.`;
    case 'timeout': return 'No answer within 5 seconds.';
    case 'tenant-not-configured': return 'No tenant is configured for this dashboard.';
    default: {
      const status = /HTTP \d{3}.*$/.exec(failure.message)?.[0];
      return status ? `${subject} could not be read (${status}).` : `${subject} could not be read.`;
    }
  }
}
