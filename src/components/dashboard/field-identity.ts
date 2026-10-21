import '@/styles/field-identity.css';

/** Display identity only: labels select a color, never a value or verdict. */
const TONES: Readonly<Record<string, string>> = {
  passed: 'pass', pass: 'pass', failed: 'fail', fail: 'fail', cause: 'fail',
  checks: 'count', delegations: 'delegations', 'agent calls': 'calls', 'measured runs': 'count',
  'quality pass': 'pass', 'pass rate': 'pass',
  'quality score': 'score', 'actual score': 'score', 'average score': 'score',
  'required bar': 'threshold', 'required threshold': 'threshold', 'average required bar': 'threshold',
  model: 'model', 'requested model': 'model', 'routed model': 'model', 'active model': 'model',
  age: 'age', 'created at': 'age', 'written at': 'age', created: 'age', minted: 'age',
  run: 'identity', correlation: 'identity', tenant: 'tenant', session: 'session',
  duration: 'duration', latency: 'duration', 'avg gen latency': 'duration',
  cost: 'cost', 'local cost': 'cost', 'actual spend': 'cost', 'est. cost': 'cost',
  'recorded cost (usd)': 'cost', 'local / delegated cost': 'cost',
  savings: 'savings', 'savings (modelled)': 'savings', 'modelled savings': 'savings', saved: 'savings',
  backend: 'backend', 'answering backend': 'backend', host: 'host',
  'tokens in': 'tokens-in', 'input tokens': 'tokens-in', prompt: 'tokens-in',
  'tokens out': 'tokens-out', 'output tokens': 'tokens-out', completion: 'tokens-out',
  tokens: 'tokens', 'tokens processed': 'tokens', 'tokens to compliance': 'tokens',
  basis: 'basis', 'data source': 'basis', 'score source': 'basis', 'recorded by': 'basis',
  task: 'task', 'task type': 'task', 'route tier': 'tier', tier: 'tier', 'routing rule': 'tier',
  'queue wait': 'queue', execution: 'execution', escalations: 'queue',
  'baseline spend': 'baseline', 'avg saving / call': 'saving-average', compression: 'compression', 'cache hit rate': 'cache',
  quality: 'quality', 'quality gate': 'quality', 'pipeline events': 'events', 'generation rows': 'generation',
  'delegation rows': 'delegations', correlations: 'identity', 'ws invalidation': 'transport', 'contract pass': 'contract',
  'tier-routed': 'routing', 'not tier-routed': 'unrouted', 'all runs': 'delegations',
  'finish reason': 'completion', truncated: 'completion', 'quality detail': 'score',
};

export function fieldTone(label: unknown, value?: unknown): string | undefined {
  if (typeof label !== 'string') return undefined;
  const key = label.trim().toLowerCase();
  if (['status', 'outcome', 'terminal state', 'terminal ok'].includes(key)) {
    if (value === true || ['passed', 'succeeded', 'true'].includes(String(value))) return 'pass';
    if (value === false || ['failed', 'false'].includes(String(value))) return 'fail';
    return undefined;
  }
  return TONES[key];
}

/** A recorded zero is a value; null and explicit unavailable labels are not. */
export function isUnavailableField(value: unknown): boolean {
  return value === null || value === undefined || value === ''
    || (typeof value === 'string' && /^(?:—|unknown|Not recorded|Not measured|Not served|Baseline unresolved)(?:$|[:\s])/i.test(value));
}
