// OMN-13007 — DataSourceControl chrome component.
//
// Proves the honest-state + runtime-switch contract:
//   - file mode renders the prominent fixture treatment (data-mode="file"),
//   - selecting Live with a backend URL flips the trigger to a live label AND
//     changes what the resolution seam resolves to,
//   - selecting File flips back to the fixture treatment.
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataSourceControl } from './DataSourceControl';
import {
  setDataSourceOverride,
  clearDataSourceOverride,
} from '@/data-source/data-source-override';
import { resolveProjectionBaseUrl } from '@/data-source/projection-base-url';

// jsdom here ships without a functioning localStorage; install an in-memory one.
function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage: Storage = {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

describe('DataSourceControl (OMN-13007)', () => {
  beforeEach(() => {
    installMemoryStorage();
    clearDataSourceOverride();
  });
  afterEach(() => {
    cleanup();
    clearDataSourceOverride();
    vi.unstubAllGlobals();
  });

  it('renders the fixture treatment in file mode (cannot masquerade as live)', () => {
    setDataSourceOverride({ mode: 'file' });
    render(<DataSourceControl />);
    const trigger = screen.getByTestId('data-source-control-trigger');
    expect(trigger).toHaveAttribute('data-mode', 'file');
    expect(trigger.textContent).toContain('File fixtures');
  });

  it('renders a live label with the backend host in live mode', () => {
    setDataSourceOverride({ mode: 'live', baseUrl: 'http://100.109.203.94:13002' });
    render(<DataSourceControl />);
    const trigger = screen.getByTestId('data-source-control-trigger');
    expect(trigger).toHaveAttribute('data-mode', 'live');
    expect(trigger.textContent).toContain('Live');
    expect(trigger.textContent).toContain('100.109.203.94:13002');
  });

  it('switching to Live changes the resolved projection base URL (override seam)', () => {
    setDataSourceOverride({ mode: 'file' });
    render(<DataSourceControl />);
    expect(resolveProjectionBaseUrl()).toBeNull();

    // Open the menu, type a backend URL, click "Use live".
    fireEvent.click(screen.getByTestId('data-source-control-trigger'));
    const input = screen.getByTestId('data-source-url-input');
    fireEvent.change(input, { target: { value: 'http://100.109.203.94:13002' } });
    fireEvent.click(screen.getByTestId('data-source-use-live'));

    expect(resolveProjectionBaseUrl()).toBe('http://100.109.203.94:13002');
    // Trigger reflects the live switch.
    expect(screen.getByTestId('data-source-control-trigger')).toHaveAttribute('data-mode', 'live');
  });

  it('switching to File flips the resolution to null and shows the fixture treatment', () => {
    setDataSourceOverride({ mode: 'live', baseUrl: 'http://100.109.203.94:13002' });
    render(<DataSourceControl />);
    expect(resolveProjectionBaseUrl()).toBe('http://100.109.203.94:13002');

    fireEvent.click(screen.getByTestId('data-source-control-trigger'));
    fireEvent.click(screen.getByTestId('data-source-use-file'));

    expect(resolveProjectionBaseUrl()).toBeNull();
    expect(screen.getByTestId('data-source-control-trigger')).toHaveAttribute('data-mode', 'file');
  });
});
