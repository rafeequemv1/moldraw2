export function LocalSaveToast({ message }: { message: string }) {
  return (
    <div className="local-save-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
