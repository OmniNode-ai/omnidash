/**
 * onex_change_control projection handlers (OMN-6753).
 *
 * Projects events from the onex_change_control service:
 * - Contract drift detected -> contract_drift_events
 */

import { contractDriftEvents } from '@shared/intelligence-schema';
import { SUFFIX_CHANGE_CONTROL_CONTRACT_DRIFT_DETECTED } from '@shared/topics';

import type {
  ProjectionHandler,
  ProjectionContext,
  MessageMeta,
  ProjectionHandlerStats,
} from './types';
import { isTableMissingError, createHandlerStats, registerHandlerStats } from './types';

const CHANGE_CONTROL_TOPICS = new Set([SUFFIX_CHANGE_CONTROL_CONTRACT_DRIFT_DETECTED]);

export class ChangeControlProjectionHandler implements ProjectionHandler {
  readonly stats: ProjectionHandlerStats = createHandlerStats();

  constructor() {
    registerHandlerStats('ChangeControlProjectionHandler', this.stats);
  }

  canHandle(topic: string): boolean {
    return CHANGE_CONTROL_TOPICS.has(topic);
  }

  async projectEvent(
    topic: string,
    data: Record<string, unknown>,
    context: ProjectionContext,
    _meta: MessageMeta
  ): Promise<boolean> {
    this.stats.received++;
    const result = await this._dispatch(topic, data, context);
    if (result) {
      this.stats.projected++;
    } else {
      this.stats.dropped.db_unavailable++;
    }
    return result;
  }

  private async _dispatch(
    topic: string,
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    switch (topic) {
      case SUFFIX_CHANGE_CONTROL_CONTRACT_DRIFT_DETECTED:
        return this.projectContractDriftDetected(data, context);
      default:
        return false;
    }
  }

  private async projectContractDriftDetected(
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    const { db } = context;
    if (!db) return false;

    const row = {
      repo: (data.repo as string) || (data.repository as string) || 'unknown',
      nodeName: (data.node_name as string) || (data.nodeName as string) || null,
      driftType: (data.drift_type as string) || (data.driftType as string) || 'unknown',
      severity: (data.severity as string) || null,
      description: (data.description as string) || (data.message as string) || null,
      expectedValue: (data.expected_value as string) || (data.expectedValue as string) || null,
      actualValue: (data.actual_value as string) || (data.actualValue as string) || null,
      contractPath: (data.contract_path as string) || (data.contractPath as string) || null,
      detectedAt: data.detected_at ? new Date(data.detected_at as string) : new Date(),
    };

    try {
      await db.insert(contractDriftEvents).values(row);
    } catch (err) {
      if (isTableMissingError(err, 'contract_drift_events')) {
        console.error(
          '[ReadModelConsumer] contract_drift_events table missing -- ' +
            'run `npm run db:migrate` to apply migrations. ' +
            'Returning false so event routes to DLQ for visibility.'
        );
        return false;
      }
      throw err;
    }

    return true;
  }
}
