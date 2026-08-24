interface RestoreBannerProps { savedAt: number; onRestore: () => void; onDiscard: () => void; }
export function RestoreBanner({ savedAt, onRestore, onDiscard }: RestoreBannerProps) {
  const time = savedAt ? new Date(savedAt).toLocaleString() : 'an earlier session';
  return (
    <div data-testid="restore-banner" style={{ background: '#1f2937', color: '#fff', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center' }}>
      <span>Unsaved work recovered from {time}.</span>
      <button data-testid="restore-banner-restore" onClick={onRestore}>Restore</button>
      <button data-testid="restore-banner-discard" onClick={onDiscard}>Discard</button>
    </div>
  );
}
