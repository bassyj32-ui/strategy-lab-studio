interface SessionToastProps { savedAt: number; onStartFresh: () => void; }

/**
 * Non-blocking confirmation that the previous session was auto-restored at
 * boot. Stays until dismissed — "Start fresh" wipes the autosave and resets
 * to a clean default scene (the only way to deliberately discard it).
 */
export function SessionToast({ savedAt, onStartFresh }: SessionToastProps) {
  const time = savedAt ? new Date(savedAt).toLocaleString() : 'an earlier session';
  return (
    <div className="session-toast" data-testid="session-toast">
      <span>Restored your work from {time}.</span>
      <button type="button" data-testid="session-toast-fresh" onClick={onStartFresh}>
        Start fresh
      </button>
    </div>
  );
}
