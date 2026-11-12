export function RetroLoader({ label = "กำลังโหลด" }: { label?: string }) {
  return <span role="status" aria-label={label} className="loading loading-dots" />;
}
