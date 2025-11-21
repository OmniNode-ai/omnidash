import { QualityGatePanel } from '../QualityGatePanel';

export default function QualityGatePanelExample() {
  //todo: remove mock functionality
  const gates = [
    {
      id: '1',
      name: 'Code Coverage',
      status: 'passed' as const,
      threshold: '> 80%',
      currentValue: '87%',
    },
    {
      id: '2',
      name: 'Cyclomatic Complexity',
      status: 'passed' as const,
      threshold: '< 10',
      currentValue: '7.2',
    },
    {
      id: '3',
      name: 'Response Time',
      status: 'warning' as const,
      threshold: '< 200ms',
      currentValue: '185ms',
    },
    {
      id: '4',
      name: 'Error Rate',
      status: 'passed' as const,
      threshold: '< 1%',
      currentValue: '0.3%',
    },
    {
      id: '5',
      name: 'Security Vulnerabilities',
      status: 'failed' as const,
      threshold: '= 0',
      currentValue: '2',
    },
  ];

  return (
    <div className="p-6">
      <QualityGatePanel gates={gates} />
    </div>
  );
}
