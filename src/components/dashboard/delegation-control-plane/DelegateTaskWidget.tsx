import { ComponentWrapper } from '../ComponentWrapper';
import { useEffectiveDataSource } from '@/data-source/useDataSourceOverride';
import { isLiveDataSource } from '@/hooks/useDataSourceMode';
import { DelegationTriggerPanel } from './DelegationTriggerPanel';

export default function DelegateTaskWidget({
  config,
}: {
  config?: Record<string, unknown>;
}) {
  const mode = useEffectiveDataSource().mode;
  const isLive = isLiveDataSource(mode);
  const initialPrompt = typeof config?.initialPrompt === 'string' ? config.initialPrompt : '';

  return (
    <ComponentWrapper title="Delegate Task" isLive={isLive}>
      <DelegationTriggerPanel collapsible={false} initialPrompt={initialPrompt} />
    </ComponentWrapper>
  );
}
