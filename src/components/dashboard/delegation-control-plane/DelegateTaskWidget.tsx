import { ComponentWrapper } from '../ComponentWrapper';
import { useEffectiveDataSource } from '@/data-source/useDataSourceOverride';
import { DelegationTriggerPanel } from './DelegationTriggerPanel';

export default function DelegateTaskWidget() {
  const mode = useEffectiveDataSource().mode;
  const isLive = mode === 'http' || mode === 'postgres';

  return (
    <ComponentWrapper title="Delegate Task" isLive={isLive}>
      <DelegationTriggerPanel collapsible={false} />
    </ComponentWrapper>
  );
}
