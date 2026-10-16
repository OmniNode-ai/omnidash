/**
 * Columns a local page reads that the runtime serves but the captured lab catalogue (served-catalogue.lab.json,
 * recaptured 2026-10-14) does not list, because the release that added them is newer than the capture. Each entry says
 * where the column is declared. The list can only shrink: once a recapture lists a column its entry has to go, and a
 * test fails until it does. A whole exposure the lab does not serve is never excused here.
 */
export const SERVED_SINCE_CAPTURE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // Empty since the 2026-10-14T04:30:11Z recapture (omnidash#397), which lists requested_model, queue_wait_ms and
  // execution_ms on delegation.decisions.v1.
};
