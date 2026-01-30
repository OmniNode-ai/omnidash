/**
 * PatternScoreDebugger Tests
 *
 * Tests for the PatternScoreDebugger component and its type guards.
 * The type guards protect against malformed JSONB data from the API.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatternScoreDebugger } from '../pattern/PatternScoreDebugger';
import type { PatlearnArtifact } from '@/lib/schemas/api-response-schemas';

// ===========================
// Test Fixtures
// ===========================

/**
 * Creates a valid PatlearnArtifact for testing
 */
function createValidArtifact(overrides?: Partial<PatlearnArtifact>): PatlearnArtifact {
  return {
    id: 'artifact-123',
    patternId: 'pattern-456',
    patternName: 'ONEX Effect Pattern',
    patternType: 'architectural',
    language: 'Python',
    lifecycleState: 'validated',
    stateChangedAt: '2024-01-15T10:00:00Z',
    compositeScore: 0.85,
    scoringEvidence: {
      labelAgreement: {
        score: 0.9,
        matchedLabels: ['effect', 'async', 'io'],
        totalLabels: 4,
        disagreements: ['validation'],
      },
      clusterCohesion: {
        score: 0.85,
        clusterId: 'cluster-001',
        memberCount: 15,
        avgPairwiseSimilarity: 0.78,
        medoidId: 'medoid-001',
      },
      frequencyFactor: {
        score: 0.8,
        observedCount: 25,
        minRequired: 10,
        windowDays: 30,
      },
    },
    signature: {
      hash: 'abc123def456',
      version: '1.0.0',
      algorithm: 'sha256',
      inputs: ['node_type', 'method_names', 'imports'],
    },
    metrics: {
      processingTimeMs: 150,
      inputCount: 100,
      clusterCount: 8,
      dedupMergeCount: 5,
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

// ===========================
// Type Guard Tests
// ===========================

describe('Type Guards', () => {
  describe('isValidScoringEvidence', () => {
    // We need to test the type guard by importing the component and testing behavior
    // The type guards are internal, so we test them through component rendering

    it('should render scoring tab content when scoringEvidence is valid', () => {
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Valid scoring evidence should show the evidence cards, not DataUnavailable
      expect(screen.queryByText('Scoring evidence data unavailable')).not.toBeInTheDocument();
      expect(screen.getByText('Label Agreement')).toBeInTheDocument();
    });

    it('should show DataUnavailable when scoringEvidence is null', () => {
      const artifact = createValidArtifact({
        scoringEvidence: null as unknown as PatlearnArtifact['scoringEvidence'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Scoring evidence data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when scoringEvidence is missing labelAgreement', () => {
      const artifact = createValidArtifact({
        scoringEvidence: {
          clusterCohesion: {
            score: 0.85,
            clusterId: 'cluster-001',
            memberCount: 15,
            avgPairwiseSimilarity: 0.78,
          },
          frequencyFactor: {
            score: 0.8,
            observedCount: 25,
            minRequired: 10,
            windowDays: 30,
          },
        } as unknown as PatlearnArtifact['scoringEvidence'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Scoring evidence data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when labelAgreement.score is not a number', () => {
      const artifact = createValidArtifact({
        scoringEvidence: {
          labelAgreement: {
            score: 'invalid' as unknown as number,
            matchedLabels: [],
            totalLabels: 0,
          },
          clusterCohesion: {
            score: 0.85,
            clusterId: 'cluster-001',
            memberCount: 15,
            avgPairwiseSimilarity: 0.78,
          },
          frequencyFactor: {
            score: 0.8,
            observedCount: 25,
            minRequired: 10,
            windowDays: 30,
          },
        } as unknown as PatlearnArtifact['scoringEvidence'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Scoring evidence data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when clusterCohesion is missing', () => {
      const artifact = createValidArtifact({
        scoringEvidence: {
          labelAgreement: {
            score: 0.9,
            matchedLabels: [],
            totalLabels: 0,
          },
          frequencyFactor: {
            score: 0.8,
            observedCount: 25,
            minRequired: 10,
            windowDays: 30,
          },
        } as unknown as PatlearnArtifact['scoringEvidence'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Scoring evidence data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when frequencyFactor is missing', () => {
      const artifact = createValidArtifact({
        scoringEvidence: {
          labelAgreement: {
            score: 0.9,
            matchedLabels: [],
            totalLabels: 0,
          },
          clusterCohesion: {
            score: 0.85,
            clusterId: 'cluster-001',
            memberCount: 15,
            avgPairwiseSimilarity: 0.78,
          },
        } as unknown as PatlearnArtifact['scoringEvidence'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Scoring evidence data unavailable')).toBeInTheDocument();
    });
  });

  describe('isValidSignature', () => {
    it('should render signature tab content when signature is valid', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Signature tab
      await user.click(screen.getByRole('tab', { name: /signature/i }));

      // Valid signature should show hash, not DataUnavailable
      expect(screen.queryByText('Signature data unavailable')).not.toBeInTheDocument();
      expect(screen.getByText('abc123def456')).toBeInTheDocument();
    });

    it('should show DataUnavailable when signature is null', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        signature: null as unknown as PatlearnArtifact['signature'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Signature tab
      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('Signature data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when signature.hash is missing', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        signature: {
          version: '1.0.0',
          algorithm: 'sha256',
          inputs: ['node_type'],
        } as unknown as PatlearnArtifact['signature'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Signature tab
      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('Signature data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when signature.inputs is not an array', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        signature: {
          hash: 'abc123',
          version: '1.0.0',
          algorithm: 'sha256',
          inputs: 'not-an-array' as unknown as string[],
        } as unknown as PatlearnArtifact['signature'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Signature tab
      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('Signature data unavailable')).toBeInTheDocument();
    });

    it('should render valid signature with empty inputs array', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        signature: {
          hash: 'abc123',
          version: '1.0.0',
          algorithm: 'sha256',
          inputs: [],
        },
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Signature tab
      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.queryByText('Signature data unavailable')).not.toBeInTheDocument();
      expect(screen.getByText('No inputs recorded')).toBeInTheDocument();
    });
  });

  describe('isValidMetrics', () => {
    it('should render metrics tab content when metrics is valid', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Metrics tab
      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      // Valid metrics should show processing time, not DataUnavailable
      expect(screen.queryByText('Metrics data unavailable')).not.toBeInTheDocument();
      expect(screen.getByText('150ms')).toBeInTheDocument();
    });

    it('should show DataUnavailable when metrics is null', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        metrics: null as unknown as PatlearnArtifact['metrics'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Metrics tab
      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      expect(screen.getByText('Metrics data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when metrics.processingTimeMs is not a number', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        metrics: {
          processingTimeMs: 'invalid' as unknown as number,
          inputCount: 100,
          clusterCount: 8,
          dedupMergeCount: 5,
        },
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Metrics tab
      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      expect(screen.getByText('Metrics data unavailable')).toBeInTheDocument();
    });

    it('should show DataUnavailable when metrics is missing processingTimeMs', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        metrics: {
          inputCount: 100,
          clusterCount: 8,
          dedupMergeCount: 5,
        } as unknown as PatlearnArtifact['metrics'],
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Click on Metrics tab
      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      expect(screen.getByText('Metrics data unavailable')).toBeInTheDocument();
    });
  });
});

// ===========================
// Component Rendering Tests
// ===========================

describe('PatternScoreDebugger', () => {
  describe('Basic Rendering', () => {
    it('should return null when artifact is null', () => {
      const { container } = render(
        <PatternScoreDebugger artifact={null} open={true} onOpenChange={vi.fn()} />
      );

      // Component should render nothing
      expect(container.firstChild).toBeNull();
    });

    it('should render pattern name in header', () => {
      const artifact = createValidArtifact({ patternName: 'Custom Pattern Name' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Custom Pattern Name')).toBeInTheDocument();
    });

    it('should render lifecycle state badge', () => {
      const artifact = createValidArtifact({ lifecycleState: 'validated' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Validated')).toBeInTheDocument();
    });

    it('should render pattern type in description', () => {
      const artifact = createValidArtifact({ patternType: 'behavioral' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('behavioral')).toBeInTheDocument();
    });

    it('should render language badge when provided', () => {
      const artifact = createValidArtifact({ language: 'TypeScript' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('should not render language badge when language is null', () => {
      const artifact = createValidArtifact({ language: null });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // When language is null, should not show a language badge
      // The pattern type is shown but not Python/TypeScript etc.
      expect(screen.queryByText('Python')).not.toBeInTheDocument();
      expect(screen.queryByText('TypeScript')).not.toBeInTheDocument();
    });

    it('should render composite score as percentage', () => {
      // Use a distinctive score that won't appear in the scoring evidence cards
      const artifact = createValidArtifact({ compositeScore: 0.73 });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // The composite score appears in the header, formatted as percentage
      expect(screen.getByText('73%')).toBeInTheDocument();
    });

    it('should render created date', () => {
      const artifact = createValidArtifact({ createdAt: '2024-01-01T00:00:00Z' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Check that created date is displayed (exact format depends on locale)
      expect(screen.getByText(/Created:/i)).toBeInTheDocument();
    });

    it('should render updated date when provided', () => {
      const artifact = createValidArtifact({ updatedAt: '2024-01-15T10:00:00Z' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/Updated:/i)).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should render all three tabs', () => {
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('tab', { name: /scoring/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /signature/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /metrics/i })).toBeInTheDocument();
    });

    it('should show Scoring tab by default', () => {
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Scoring tab should be selected by default
      const scoringTab = screen.getByRole('tab', { name: /scoring/i });
      expect(scoringTab).toHaveAttribute('data-state', 'active');

      // Scoring content should be visible
      expect(screen.getByText('Label Agreement')).toBeInTheDocument();
    });

    it('should switch to Signature tab when clicked', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /signature/i }));

      const signatureTab = screen.getByRole('tab', { name: /signature/i });
      expect(signatureTab).toHaveAttribute('data-state', 'active');

      // Signature content should be visible
      expect(screen.getByText('Hash:')).toBeInTheDocument();
    });

    it('should switch to Metrics tab when clicked', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      const metricsTab = screen.getByRole('tab', { name: /metrics/i });
      expect(metricsTab).toHaveAttribute('data-state', 'active');

      // Metrics content should be visible
      expect(screen.getByText('Processing Time:')).toBeInTheDocument();
    });
  });

  describe('Scoring Tab Content', () => {
    it('should render all three scoring evidence cards', () => {
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Label Agreement')).toBeInTheDocument();
      expect(screen.getByText('Cluster Cohesion')).toBeInTheDocument();
      expect(screen.getByText('Frequency Factor')).toBeInTheDocument();
    });

    it('should display label agreement details', () => {
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Label Agreement card is expanded by default
      expect(screen.getByText(/effect, async, io/)).toBeInTheDocument();
      // Check for Total Labels label and value (avoiding matching other numbers)
      expect(screen.getByText(/Total Labels:/)).toBeInTheDocument();
    });

    it('should display disagreements when present', () => {
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/validation/)).toBeInTheDocument(); // disagreement
    });

    it('should show "None" for matched labels when empty', () => {
      const artifact = createValidArtifact({
        scoringEvidence: {
          ...createValidArtifact().scoringEvidence,
          labelAgreement: {
            score: 0.5,
            matchedLabels: [],
            totalLabels: 5,
          },
        },
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('None')).toBeInTheDocument();
    });
  });

  describe('Signature Tab Content', () => {
    it('should display signature hash', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('abc123def456')).toBeInTheDocument();
    });

    it('should display signature version', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('1.0.0')).toBeInTheDocument();
    });

    it('should display signature algorithm', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('sha256')).toBeInTheDocument();
    });

    it('should display input badges', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('node_type')).toBeInTheDocument();
      expect(screen.getByText('method_names')).toBeInTheDocument();
      expect(screen.getByText('imports')).toBeInTheDocument();
    });

    it('should show "Unknown" for missing version', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        signature: {
          hash: 'abc123',
          version: undefined as unknown as string,
          algorithm: 'sha256',
          inputs: [],
        },
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /signature/i }));

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('Metrics Tab Content', () => {
    it('should display processing time', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      expect(screen.getByText('150ms')).toBeInTheDocument();
    });

    it('should display input count', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should display cluster count', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('should display dedup merge count', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show N/A for missing optional metrics', async () => {
      const user = userEvent.setup();
      const artifact = createValidArtifact({
        metrics: {
          processingTimeMs: 100,
          inputCount: undefined as unknown as number,
          clusterCount: undefined as unknown as number,
          dedupMergeCount: undefined as unknown as number,
        },
      });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /metrics/i }));

      const naElements = screen.getAllByText('N/A');
      expect(naElements.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Lifecycle State Badges', () => {
    it('should render candidate state', () => {
      const artifact = createValidArtifact({ lifecycleState: 'candidate' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Candidate')).toBeInTheDocument();
    });

    it('should render provisional state', () => {
      const artifact = createValidArtifact({ lifecycleState: 'provisional' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Provisional')).toBeInTheDocument();
    });

    it('should render validated state', () => {
      const artifact = createValidArtifact({ lifecycleState: 'validated' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Validated')).toBeInTheDocument();
    });

    it('should render deprecated state', () => {
      const artifact = createValidArtifact({ lifecycleState: 'deprecated' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Deprecated')).toBeInTheDocument();
    });
  });

  describe('Sheet Open/Close Behavior', () => {
    it('should call onOpenChange when sheet is closed', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={onOpenChange} />);

      // Find and click the close button (X)
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should not render sheet content when open is false', () => {
      const artifact = createValidArtifact();

      render(<PatternScoreDebugger artifact={artifact} open={false} onOpenChange={vi.fn()} />);

      // Sheet content should not be visible when closed
      expect(screen.queryByText('ONEX Effect Pattern')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero composite score', () => {
      const artifact = createValidArtifact({ compositeScore: 0 });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should handle full composite score', () => {
      const artifact = createValidArtifact({ compositeScore: 1 });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should handle missing updatedAt', () => {
      const artifact = createValidArtifact({ updatedAt: undefined });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Should not show Updated: line
      expect(screen.queryByText(/Updated:/i)).not.toBeInTheDocument();
      // But should still show Created:
      expect(screen.getByText(/Created:/i)).toBeInTheDocument();
    });

    it('should handle empty string pattern name', () => {
      const artifact = createValidArtifact({ patternName: '' });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      // Component should still render without crashing
      expect(screen.getByRole('tab', { name: /scoring/i })).toBeInTheDocument();
    });

    it('should handle very long pattern names', () => {
      const longName = 'A'.repeat(200);
      const artifact = createValidArtifact({ patternName: longName });

      render(<PatternScoreDebugger artifact={artifact} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(longName)).toBeInTheDocument();
    });
  });
});
