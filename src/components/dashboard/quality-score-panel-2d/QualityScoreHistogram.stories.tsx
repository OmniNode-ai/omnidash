// Storybook stories for QualityScoreHistogram (T18 / OMN-159).
import type { Meta, StoryObj } from '@storybook/react-vite';
import QualityScoreHistogram from './QualityScoreHistogram';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const QUERY_KEY = ['quality-summary'];

const meta: Meta<typeof QualityScoreHistogram> = {
  title: 'Dashboard / QualityScoreHistogram',
  component: QualityScoreHistogram,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 480, height: 280 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof QualityScoreHistogram>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: QUERY_KEY, data: [{ meanScore: 0, totalMeasurements: 0, distribution: [] }] }],
    }),
  ],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Populated: Story = {
  args: { config: { passThreshold: 0.8 } },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: QUERY_KEY,
          data: [
            {
              meanScore: 0.72,
              totalMeasurements: 50,
              distribution: [
                { bucket: '1', count: 1 },
                { bucket: '2', count: 4 },
                { bucket: '3', count: 10 },
                { bucket: '4', count: 20 },
                { bucket: '5', count: 15 },
              ],
            },
          ],
        },
      ],
    }),
  ],
};
