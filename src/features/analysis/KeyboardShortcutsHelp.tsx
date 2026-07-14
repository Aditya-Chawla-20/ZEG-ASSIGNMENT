/**
 * Small inline hint showing available keyboard shortcuts.
 * Only renders when a parcel is selected.
 * Styled as muted text — intended to sit below the draw tool buttons.
 */
interface KeyboardShortcutsHelpProps {
  visible: boolean;
}

export function KeyboardShortcutsHelp({ visible }: KeyboardShortcutsHelpProps) {
  if (!visible) return null;

  return (
    <p className="mt-2 text-[11px] leading-relaxed text-brand-400">
      Shortcuts: P=Pan · E=Exclude · R=Restore · Ctrl+Z=Undo
    </p>
  );
}
