/**
 * OMN-13004 — tests for the SEA Control Plane generate affordance.
 *
 * Covers the thin-publisher client (`submitGeneration`) and the panel's honest
 * states: it posts the typed command to `/api/sea/generate`, surfaces the returned
 * correlation id, and renders an explicit failure (never a silent success).
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitGeneration } from "@/services/event-dash-api";
import { SeaGeneratePanel } from "./SeaGeneratePanel";

describe("submitGeneration (thin-publisher client)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("POSTs the typed command to /api/sea/generate and returns the correlation id", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        correlation_id: "ui-20260611T120000Z-abcd1234",
        topic: "onex.cmd.omnimarket.node-generation-requested.v1",
      }),
    });

    const res = await submitGeneration("Generate a node that adds two ints");

    expect(res.correlation_id).toBe("ui-20260611T120000Z-abcd1234");
    expect(res.topic).toBe("onex.cmd.omnimarket.node-generation-requested.v1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sea/generate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      task_description: "Generate a node that adds two ints",
    });
  });

  it("does not apply the 20-second projection timeout to node generation", async () => {
    vi.useFakeTimers();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) =>
      new Promise((resolve, reject) => {
        const timer = window.setTimeout(
          () => resolve({
            ok: true,
            json: async () => ({
              correlation_id: "ui-slow-success",
              topic: "onex.cmd.omnimarket.node-generation-requested.v1",
            }),
          }),
          25_000,
        );
        init.signal?.addEventListener("abort", () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );

    const assertion = expect(submitGeneration("Generate a slower node")).resolves.toMatchObject({
      correlation_id: "ui-slow-success",
    });
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });

  it("throws a typed Error on a non-OK response", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "KAFKA_BOOTSTRAP_SERVERS is required",
    });

    await expect(submitGeneration("x")).rejects.toThrow(/HTTP 503/);
  });

  it("throws on a malformed success body (missing correlation_id)", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ topic: "x" }),
    });

    await expect(submitGeneration("x")).rejects.toThrow(/malformed/);
  });
});

describe("SeaGeneratePanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a description and renders the returned correlation id", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        correlation_id: "ui-20260611T120000Z-abcd1234",
        topic: "onex.cmd.omnimarket.node-generation-requested.v1",
      }),
    });

    render(<SeaGeneratePanel />);

    fireEvent.change(
      screen.getByPlaceholderText(/Describe the node to generate/i),
      {
        target: { value: "Generate a CSV parser node" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/ui-20260611T120000Z-abcd1234/),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Command published/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending:/i)).toBeInTheDocument();
  });

  it("renders an honest failure state when the publish fails", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "KAFKA_BOOTSTRAP_SERVERS is required",
    });

    render(<SeaGeneratePanel />);

    fireEvent.change(
      screen.getByPlaceholderText(/Describe the node to generate/i),
      {
        target: { value: "x" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
    });
    // No correlation id is shown on failure.
    expect(screen.queryByText(/Pending:/i)).not.toBeInTheDocument();
  });
});
