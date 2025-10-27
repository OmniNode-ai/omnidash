import { TopPatternsList } from '../TopPatternsList';

export default function TopPatternsListExample() {
  //todo: remove mock functionality
  const patterns = Array.from({ length: 10 }, (_, i) => ({
    id: `pattern-${i}`,
    name: `Pattern ${i + 1}`,
    description: `Advanced pattern for ${['React hooks', 'API optimization', 'State management', 'Error handling'][i % 4]}`,
    quality: 95 - i * 2,
    usageCount: 150 - i * 10,
    trend: 10 - i,
    category: ['React', 'TypeScript', 'API', 'Performance'][i % 4],
  }));

  return (
    <div className="p-6">
      <TopPatternsList patterns={patterns} />
    </div>
  );
}
