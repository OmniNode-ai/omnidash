import { describe, it, expect, vi } from 'vitest';
import {
  clickableCardClasses,
  clickableRowClasses,
  clickableListItemClasses,
  disabledClasses,
  interactiveClasses,
  createKeyboardHandler,
  getInteractiveAriaProps,
} from '../interactive-classes';

describe('Interactive Classes', () => {
  describe('clickableCardClasses', () => {
    it('should return a string', () => {
      expect(typeof clickableCardClasses).toBe('string');
      expect(clickableCardClasses.length).toBeGreaterThan(0);
    });

    it('should include cursor-pointer', () => {
      expect(clickableCardClasses).toContain('cursor-pointer');
    });
  });

  describe('clickableRowClasses', () => {
    it('should return a string', () => {
      expect(typeof clickableRowClasses).toBe('string');
      expect(clickableRowClasses.length).toBeGreaterThan(0);
    });

    it('should include cursor-pointer', () => {
      expect(clickableRowClasses).toContain('cursor-pointer');
    });
  });

  describe('clickableListItemClasses', () => {
    it('should return a string', () => {
      expect(typeof clickableListItemClasses).toBe('string');
      expect(clickableListItemClasses.length).toBeGreaterThan(0);
    });

    it('should include cursor-pointer', () => {
      expect(clickableListItemClasses).toContain('cursor-pointer');
    });
  });

  describe('disabledClasses', () => {
    it('should return a string', () => {
      expect(typeof disabledClasses).toBe('string');
      expect(disabledClasses.length).toBeGreaterThan(0);
    });

    it('should include cursor-not-allowed', () => {
      expect(disabledClasses).toContain('cursor-not-allowed');
    });
  });

  describe('interactiveClasses', () => {
    it('should combine base classes with card variant', () => {
      const result = interactiveClasses('p-4 rounded', 'card');
      expect(typeof result).toBe('string');
      expect(result).toContain('p-4');
      expect(result).toContain('rounded');
    });

    it('should combine base classes with row variant', () => {
      const result = interactiveClasses('bg-white', 'row');
      expect(typeof result).toBe('string');
      expect(result).toContain('bg-white');
    });

    it('should combine base classes with list variant', () => {
      const result = interactiveClasses('px-2', 'list');
      expect(typeof result).toBe('string');
      expect(result).toContain('px-2');
    });

    it('should combine base classes with subtle variant', () => {
      const result = interactiveClasses('text-sm', 'subtle');
      expect(typeof result).toBe('string');
      expect(result).toContain('text-sm');
    });

    it('should add disabled classes when disabled is true', () => {
      const result = interactiveClasses('p-4', 'card', true);
      expect(result).toContain('cursor-not-allowed');
    });

    it('should default to card variant', () => {
      const result = interactiveClasses('p-4');
      expect(typeof result).toBe('string');
    });
  });

  describe('createKeyboardHandler', () => {
    it('should return a function', () => {
      const handler = createKeyboardHandler(() => {});
      expect(typeof handler).toBe('function');
    });

    it('should call callback on Enter key', () => {
      const callback = vi.fn();
      const handler = createKeyboardHandler(callback);
      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as any;

      handler(event);

      expect(callback).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should call callback on Space key', () => {
      const callback = vi.fn();
      const handler = createKeyboardHandler(callback);
      const event = {
        key: ' ',
        preventDefault: vi.fn(),
      } as any;

      handler(event);

      expect(callback).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should not call callback on other keys', () => {
      const callback = vi.fn();
      const handler = createKeyboardHandler(callback);
      const event = {
        key: 'Tab',
        preventDefault: vi.fn(),
      } as any;

      handler(event);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getInteractiveAriaProps', () => {
    it('should return ARIA attributes for button role', () => {
      const props = getInteractiveAriaProps({ role: 'button' });
      expect(props.role).toBe('button');
      expect(props.tabIndex).toBe(0);
    });

    it('should return ARIA attributes for link role', () => {
      const props = getInteractiveAriaProps({ role: 'link' });
      expect(props.role).toBe('link');
      expect(props.tabIndex).toBe(0);
    });

    it('should return ARIA attributes for menuitem role', () => {
      const props = getInteractiveAriaProps({ role: 'menuitem' });
      expect(props.role).toBe('menuitem');
      expect(props.tabIndex).toBe(0);
    });

    it('should set tabIndex to -1 when disabled', () => {
      const props = getInteractiveAriaProps({ disabled: true });
      expect(props.tabIndex).toBe(-1);
      expect(props['aria-disabled']).toBe(true);
    });

    it('should include aria-pressed when provided', () => {
      const props = getInteractiveAriaProps({ pressed: true });
      expect(props['aria-pressed']).toBe(true);
    });

    it('should include aria-expanded when provided', () => {
      const props = getInteractiveAriaProps({ expanded: true });
      expect(props['aria-expanded']).toBe(true);
    });

    it('should default to button role', () => {
      const props = getInteractiveAriaProps({});
      expect(props.role).toBe('button');
    });
  });
});
