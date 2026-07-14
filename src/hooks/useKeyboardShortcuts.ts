import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

/**
 * Global keyboard shortcuts for the LandScope map editor.
 *
 * Shortcuts (only active when no input/textarea is focused):
 *  - `p` or `Escape` → setDrawMode('pan')
 *  - `e`            → if a parcel is selected, setDrawMode('exclude')
 *  - `r`            → if a parcel is selected, setDrawMode('restore')
 *  - `ctrl+z` / `meta+z` → undoLastEdit()
 *
 * Shortcuts are ignored when modifier keys other than Ctrl/Meta are held
 * (e.g. Shift+e, Alt+e) to avoid clobbering browser/system shortcuts.
 *
 * Returns nothing — this hook is purely side-effect driven.
 */
export function useKeyboardShortcuts(): void {
  const selectedParcelId = useAppStore((s) => s.selectedParcelId);
  const setDrawMode = useAppStore((s) => s.setDrawMode);
  const undoLastEdit = useAppStore((s) => s.undoLastEdit);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Ignore when focus is inside an input or textarea.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      // Allow Ctrl/Meta for undo, but reject other modifier combinations.
      const hasCtrlOrMeta = event.ctrlKey || event.metaKey;
      const hasOtherModifier = event.altKey || event.shiftKey;

      if (hasOtherModifier) {
        return;
      }

      const key = event.key.toLowerCase();

      // Ctrl+Z / Meta+Z → undo
      if (hasCtrlOrMeta && key === 'z') {
        event.preventDefault();
        undoLastEdit();
        return;
      }

      // If Ctrl/Meta is held but it's not 'z', ignore — don't hijack other shortcuts.
      if (hasCtrlOrMeta) {
        return;
      }

      // Single-key shortcuts
      switch (key) {
        case 'p':
        case 'escape':
          setDrawMode('pan');
          break;
        case 'e':
          if (selectedParcelId) {
            setDrawMode('exclude');
          }
          break;
        case 'r':
          if (selectedParcelId) {
            setDrawMode('restore');
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedParcelId, setDrawMode, undoLastEdit]);
}
