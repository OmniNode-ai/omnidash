import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders a span by default with size=xl and color=primary', () => {
    const { container } = render(<Text>hello</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el.nodeName).toBe('SPAN');
    expect(el.style.fontSize).toBe('var(--ds-text-xl)');
    expect(el.style.color).toBe('var(--ds-ink)');
    expect(el.textContent).toBe('hello');
  });

  it.each([
    ['xs', 'var(--ds-text-xs)'], ['sm', 'var(--ds-text-sm)'], ['md', 'var(--ds-text-md)'],
    ['lg', 'var(--ds-text-lg)'], ['xl', 'var(--ds-text-xl)'], ['2xl', 'var(--ds-text-2xl)'],
    ['3xl', 'var(--ds-text-3xl)'], ['4xl', 'var(--ds-text-4xl)'],
  ] as const)('size=%s → font-size %s', (size, expected) => {
    const { container } = render(<Text size={size}>x</Text>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe(expected);
  });

  it.each([
    ['primary', 'var(--ds-ink)'], ['secondary', 'var(--ds-ink-2)'],
    ['tertiary', 'var(--ds-ink-3)'], ['brand', 'var(--ds-brand)'],
    ['ok', 'var(--ds-ok)'], ['warn', 'var(--ds-warn)'], ['bad', 'var(--ds-bad)'],
    ['inherit', 'inherit'],
  ] as const)('color=%s → %s', (color, expected) => {
    const { container } = render(<Text color={color}>x</Text>);
    expect((container.firstChild as HTMLElement).style.color).toBe(expected);
  });

  it('family=mono → font-family var(--ds-font-mono)', () => {
    const { container } = render(<Text family="mono">x</Text>);
    expect((container.firstChild as HTMLElement).style.fontFamily).toBe('var(--ds-font-mono)');
  });

  it('weight=semibold → font-weight var(--ds-weight-semibold)', () => {
    const { container } = render(<Text weight="semibold">x</Text>);
    expect((container.firstChild as HTMLElement).style.fontWeight).toBe('var(--ds-weight-semibold)');
  });

  it('leading=tight → line-height var(--ds-leading-tight)', () => {
    const { container } = render(<Text leading="tight">x</Text>);
    expect((container.firstChild as HTMLElement).style.lineHeight).toBe('var(--ds-leading-tight)');
  });

  it('tabularNums → font-variant-numeric: tabular-nums', () => {
    const { container } = render(<Text tabularNums>12.34</Text>);
    expect((container.firstChild as HTMLElement).style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('truncate → overflow/ellipsis/nowrap', () => {
    const { container } = render(<Text truncate>long long long</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.overflow).toBe('hidden');
    expect(el.style.textOverflow).toBe('ellipsis');
    expect(el.style.whiteSpace).toBe('nowrap');
  });

  it('style prop overrides computed style (escape hatch)', () => {
    const { container } = render(<Text size="md" style={{ fontSize: '99px' }}>x</Text>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('99px');
  });

  it('as="div" renders a div', () => {
    const { container } = render(<Text as="div">x</Text>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('passes aria-label through', () => {
    const { container } = render(<Text aria-label="hello">x</Text>);
    expect(container.firstChild).toHaveAttribute('aria-label', 'hello');
  });
});
