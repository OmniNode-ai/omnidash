/**
 * Unit tests for consumer-utils enum parsing functions [OMN-7094]
 *
 * Validates case-insensitive enum parsing for NodeType,
 * RegistrationState, and IntrospectionReason. The runtime
 * sends lowercase values but the TypeScript types are UPPERCASE,
 * so normalization must handle both.
 */
import { describe, it, expect } from 'vitest';
import {
  parseNodeType,
  parseRegistrationState,
  parseIntrospectionReason,
} from '../consumers/domain/consumer-utils';

describe('parseNodeType', () => {
  it('accepts uppercase values', () => {
    expect(parseNodeType('EFFECT')).toBe('EFFECT');
    expect(parseNodeType('COMPUTE')).toBe('COMPUTE');
    expect(parseNodeType('REDUCER')).toBe('REDUCER');
    expect(parseNodeType('ORCHESTRATOR')).toBe('ORCHESTRATOR');
  });

  it('accepts lowercase values and normalizes to uppercase', () => {
    expect(parseNodeType('effect')).toBe('EFFECT');
    expect(parseNodeType('compute')).toBe('COMPUTE');
    expect(parseNodeType('reducer')).toBe('REDUCER');
    expect(parseNodeType('orchestrator')).toBe('ORCHESTRATOR');
  });

  it('accepts mixed-case values and normalizes to uppercase', () => {
    expect(parseNodeType('Effect')).toBe('EFFECT');
    expect(parseNodeType('Compute')).toBe('COMPUTE');
    expect(parseNodeType('Reducer')).toBe('REDUCER');
    expect(parseNodeType('Orchestrator')).toBe('ORCHESTRATOR');
  });

  it('strips _GENERIC suffix (Python runtime emits effect_generic)', () => {
    expect(parseNodeType('EFFECT_GENERIC')).toBe('EFFECT');
    expect(parseNodeType('effect_generic')).toBe('EFFECT');
    expect(parseNodeType('compute_generic')).toBe('COMPUTE');
  });

  it('returns default for invalid values', () => {
    expect(parseNodeType('invalid')).toBe('COMPUTE');
    expect(parseNodeType(undefined)).toBe('COMPUTE');
    expect(parseNodeType(null)).toBe('COMPUTE');
    expect(parseNodeType(42)).toBe('COMPUTE');
    expect(parseNodeType('')).toBe('COMPUTE');
  });

  it('uses custom default when provided', () => {
    expect(parseNodeType('invalid', 'EFFECT')).toBe('EFFECT');
  });
});

describe('parseIntrospectionReason', () => {
  it('accepts uppercase values', () => {
    expect(parseIntrospectionReason('STARTUP')).toBe('STARTUP');
    expect(parseIntrospectionReason('HEARTBEAT')).toBe('HEARTBEAT');
    expect(parseIntrospectionReason('REQUESTED')).toBe('REQUESTED');
  });

  it('accepts lowercase values and normalizes to uppercase', () => {
    expect(parseIntrospectionReason('startup')).toBe('STARTUP');
    expect(parseIntrospectionReason('heartbeat')).toBe('HEARTBEAT');
    expect(parseIntrospectionReason('requested')).toBe('REQUESTED');
  });

  it('accepts mixed-case values and normalizes to uppercase', () => {
    expect(parseIntrospectionReason('Startup')).toBe('STARTUP');
    expect(parseIntrospectionReason('Heartbeat')).toBe('HEARTBEAT');
  });

  it('returns default for invalid values', () => {
    expect(parseIntrospectionReason('invalid')).toBe('STARTUP');
    expect(parseIntrospectionReason(undefined)).toBe('STARTUP');
    expect(parseIntrospectionReason(null)).toBe('STARTUP');
  });

  it('uses custom default when provided', () => {
    expect(parseIntrospectionReason('invalid', 'HEARTBEAT')).toBe('HEARTBEAT');
  });
});

describe('parseRegistrationState', () => {
  it('accepts lowercase values', () => {
    expect(parseRegistrationState('pending_registration')).toBe('pending_registration');
    expect(parseRegistrationState('accepted')).toBe('accepted');
    expect(parseRegistrationState('active')).toBe('active');
    expect(parseRegistrationState('rejected')).toBe('rejected');
    expect(parseRegistrationState('awaiting_ack')).toBe('awaiting_ack');
    expect(parseRegistrationState('ack_received')).toBe('ack_received');
    expect(parseRegistrationState('ack_timed_out')).toBe('ack_timed_out');
    expect(parseRegistrationState('liveness_expired')).toBe('liveness_expired');
  });

  it('accepts uppercase values and normalizes to lowercase', () => {
    expect(parseRegistrationState('PENDING_REGISTRATION')).toBe('pending_registration');
    expect(parseRegistrationState('ACCEPTED')).toBe('accepted');
    expect(parseRegistrationState('ACTIVE')).toBe('active');
    expect(parseRegistrationState('REJECTED')).toBe('rejected');
  });

  it('accepts mixed-case values and normalizes to lowercase', () => {
    expect(parseRegistrationState('Active')).toBe('active');
    expect(parseRegistrationState('Pending_Registration')).toBe('pending_registration');
  });

  it('returns default for invalid values', () => {
    expect(parseRegistrationState('invalid')).toBe('pending_registration');
    expect(parseRegistrationState(undefined)).toBe('pending_registration');
    expect(parseRegistrationState(null)).toBe('pending_registration');
  });

  it('uses custom default when provided', () => {
    expect(parseRegistrationState('invalid', 'active')).toBe('active');
  });
});
