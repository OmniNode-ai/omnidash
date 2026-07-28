/**
 * OMN-13004 — SEA Control Plane generate affordance.
 *
 * A minimal, demo-clean generation form: task description in, submit, watch the
 * node get generated. On submit it POSTs the typed command to `/api/sea/generate`
 * (the THIN PUBLISHER on the projection backend), which wraps it in the
 * canonical ModelEventEnvelope and publishes ONE command to
 * `onex.cmd.omnimarket.node-generation-requested.v1`. The existing
 * node_generation_consumer does the work; the existing SEA panels poll the
 * node-generation-completed projection and render the artifact when it lands.
 *
 * This panel owns NO truth: it does not generate, validate, or register a node,
 * and it never fabricates a completed row. It shows the minted correlation id
 * and an honest "publishing → published, awaiting the projection" state.
 */

import { useState, useCallback } from "react";
import { Panel } from "@/components/dashboard/event-dash/primitives";
import { Text } from "@/components/ui/typography";
import { PromptInput } from "@/components/dashboard/control-plane/PromptInput";
import { submitGeneration } from "@/services/event-dash-api";

type SubmitStatus = "idle" | "submitting" | "accepted" | "error";

interface SubmitState {
  status: SubmitStatus;
  correlationId: string | null;
  message: string;
}

const IDLE: SubmitState = { status: "idle", correlationId: null, message: "" };

export function SeaGeneratePanel() {
  const [state, setState] = useState<SubmitState>(IDLE);

  const handleSubmit = useCallback((prompt: string) => {
    setState({
      status: "submitting",
      correlationId: null,
      message: "Publishing command to the bus…",
    });
    submitGeneration(prompt)
      .then((res) => {
        setState({
          status: "accepted",
          correlationId: res.correlation_id,
          message:
            "Command published — node_generation_consumer is generating. Watch the panels below.",
        });
      })
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : "Unknown error";
        setState({ status: "error", correlationId: null, message: detail });
      });
  }, []);

  const feedback =
    state.status === "idle"
      ? undefined
      : state.correlationId
        ? `${state.message} (correlation_id: ${state.correlationId})`
        : state.message;

  return (
    <Panel
      title="GENERATE A NODE"
      sub="task → onex.cmd.omnimarket.node-generation-requested.v1 → live generation"
    >
      <PromptInput
        onSubmit={handleSubmit}
        status={state.status}
        feedback={feedback}
      />
      {state.status === "accepted" && (
        <Text
          as="div"
          size="xs"
          color="secondary"
          className="ev-generate-hint"
          role="status"
          aria-live="polite"
        >
          Pending: the terminal node-generation-completed event for this
          correlation id will appear in "Latest Generated Node" / "Recent
          Generations" on the next projection poll.
        </Text>
      )}
    </Panel>
  );
}
