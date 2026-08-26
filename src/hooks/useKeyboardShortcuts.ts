import { useEffect } from 'react';

interface UseKeyboardShortcutsProps {
  enabled: boolean;
  onFocusSearch: () => void;
  onNewItem: () => void;
  onLock: () => void;
}

/**
 * Global Cmd/Ctrl shortcuts while the vault is unlocked:
 *   - Cmd/Ctrl+K → focus search
 *   - Cmd/Ctrl+N → new item
 *   - Cmd/Ctrl+L → lock vault
 */
export function useKeyboardShortcuts({ enabled, onFocusSearch, onNewItem, onLock }: UseKeyboardShortcutsProps) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier) {
        const key = e.key.toLowerCase();
        if (key === 'k') {
          e.preventDefault();
          onFocusSearch();
        } else if (key === 'n') {
          e.preventDefault();
          onNewItem();
        } else if (key === 'l') {
          e.preventDefault();
          onLock();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onFocusSearch, onNewItem, onLock]);
}

export function dispatchFocusSearchShortcut(): void {
  window.dispatchEvent(new CustomEvent('aegis-focus-search'));
}
