import type { Meta, StoryObj } from '@storybook/react-vite';
import { Heading } from './index';

const meta: Meta = { title: 'UI/Heading' };
export default meta;

export const Levels: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <Heading level={1}>Level 1 — dashboard title (22px)</Heading>
      <Heading level={2}>Level 2 — widget title (18px)</Heading>
      <Heading level={3}>Level 3 — section (16px)</Heading>
      <Heading level={4}>Level 4 — minor section (14px)</Heading>
    </div>
  ),
};
