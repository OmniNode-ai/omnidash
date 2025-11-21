import { EventFeed } from '../EventFeed';

export default function EventFeedExample() {
  //todo: remove mock functionality
  const events = [
    {
      id: '1',
      type: 'success' as const,
      message: 'Agent-42 completed code analysis',
      timestamp: '10:23:15',
      source: 'Agent-42',
    },
    {
      id: '2',
      type: 'info' as const,
      message: 'New pattern discovered: React Hook Pattern',
      timestamp: '10:23:12',
      source: 'Pattern Learner',
    },
    {
      id: '3',
      type: 'warning' as const,
      message: 'High memory usage detected on Agent-15',
      timestamp: '10:23:08',
      source: 'Monitor',
    },
    {
      id: '4',
      type: 'success' as const,
      message: 'Quality gate passed: Code Coverage > 80%',
      timestamp: '10:22:55',
      source: 'Quality Gate',
    },
    {
      id: '5',
      type: 'error' as const,
      message: 'Agent-7 failed to connect to knowledge graph',
      timestamp: '10:22:50',
      source: 'Agent-7',
    },
  ];

  return (
    <div className="p-6">
      <EventFeed events={events} />
    </div>
  );
}
