export function formatTime(ms: number | null): string {
  if (ms === null) return 'unknown time';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function formatDuration(ms: number): string {
  if (Math.abs(ms) < 1000) return 'under a second';
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  if (hours < 48) return rem ? `${hours} h ${rem} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}
