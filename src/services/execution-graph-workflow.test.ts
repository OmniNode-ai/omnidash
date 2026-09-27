import { describe, expect, it, vi } from 'vitest';
import { createLiveExecutionGraphTransport } from './execution-graph-workflow';
import { historicalTopologyWithSyntheticWatermarks } from '@/components/dashboard/delegation-control-plane/execution-graph-spike/__fixtures__/historicalTopologyWithSyntheticWatermarks';

const CORRELATION_ID = historicalTopologyWithSyntheticWatermarks.replay.correlation_id;
const WORKFLOW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACK = { workflow_id: WORKFLOW_ID, correlation_id: CORRELATION_ID };
const RESULT = {
  workflow_id: WORKFLOW_ID,
  workflow_type: 'delegation-execution-graph-read',
  status: 'completed',
  result: historicalTopologyWithSyntheticWatermarks,
  refusal: null,
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('live execution graph workflow transport', () => {
  it('submits latest through same-origin BFF and waits for its verified result', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(ACK, 202))
      .mockResolvedValueOnce(json({ error: 'workflow_result_pending' }, 409))
      .mockResolvedValueOnce(json(RESULT, 200));
    const wait = vi.fn(async () => undefined);
    const transport = createLiveExecutionGraphTransport({ fetchImpl, wait });

    expect(await transport.readLatest(CORRELATION_ID)).toEqual(historicalTopologyWithSyntheticWatermarks);
    expect(transport.step).toBeUndefined();
    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/workflow-reads', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correlation_id: CORRELATION_ID, payload: { cursor_mode: 'latest' } }),
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, `/api/workflow-reads/${WORKFLOW_ID}/result`, {
      method: 'GET', credentials: 'same-origin',
    });
    expect(wait).toHaveBeenCalledWith(500);
  });

  it('does not submit noncanonical correlation IDs', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const transport = createLiveExecutionGraphTransport({ fetchImpl });
    await expect(transport.readLatest('not-a-uuid')).rejects.toThrow('canonical delegation correlation');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a mismatched acknowledgement without reading another workflow', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...ACK, correlation_id: WORKFLOW_ID }, 202));
    const transport = createLiveExecutionGraphTransport({ fetchImpl });
    await expect(transport.readLatest(CORRELATION_ID)).rejects.toThrow('acknowledgement is invalid');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not render an authorization refusal as graph data', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(ACK, 202))
      .mockResolvedValueOnce(json({ ...RESULT, status: 'failed', result: null, refusal: { code: 'not_found' } }, 200));
    const transport = createLiveExecutionGraphTransport({ fetchImpl });
    await expect(transport.readLatest(CORRELATION_ID)).rejects.toThrow('not found or could not be read');
  });

  it('refuses malformed terminal and legacy offset cursor', async () => {
    const malformed = {
      ...historicalTopologyWithSyntheticWatermarks,
      replay: {
        ...historicalTopologyWithSyntheticWatermarks.replay,
        source_cursors: [{ topic: 't', partition: 0, max_kafka_offset: 1 }],
      },
    };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(ACK, 202))
      .mockResolvedValueOnce(json({ ...RESULT, result: malformed }, 200));
    const transport = createLiveExecutionGraphTransport({ fetchImpl });
    await expect(transport.readLatest(CORRELATION_ID)).rejects.toThrow('Graph result is invalid');
  });

  it('does not retry a disabled route or gateway refusal', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'workflow_reads_disabled' }, 503));
    const transport = createLiveExecutionGraphTransport({ fetchImpl });
    await expect(transport.readLatest(CORRELATION_ID)).rejects.toThrow('refused or is unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
