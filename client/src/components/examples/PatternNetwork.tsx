import { PatternNetwork } from '../PatternNetwork';

export default function PatternNetworkExample() {
  //todo: remove mock functionality
  const patterns = Array.from({ length: 30 }, (_, i) => ({
    id: `pattern-${i}`,
    name: `Pattern ${i + 1}`,
    quality: 60 + Math.random() * 40,
    usage: Math.floor(Math.random() * 100),
    category: ['React', 'TypeScript', 'API', 'Database'][i % 4],
  }));

  return (
    <div className="p-6">
      <PatternNetwork patterns={patterns} />
    </div>
  );
}
