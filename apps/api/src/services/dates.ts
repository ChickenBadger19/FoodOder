const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Resolve a spoken day ("friday", "tomorrow", "weekend") to the next matching date, today included. */
export function dateForDay(day: string | null, now = new Date()): string | null {
  if (!day) return null;
  const d = day.toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d === 'today' || d === 'tonight') return isoDate(base);
  if (d === 'tomorrow') { base.setDate(base.getDate() + 1); return isoDate(base); }
  if (d === 'weekend') { const idx = 6; const diff = (idx - base.getDay() + 7) % 7; base.setDate(base.getDate() + diff); return isoDate(base); }
  const idx = WEEKDAYS.indexOf(d);
  if (idx < 0) return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  const diff = (idx - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  return isoDate(base);
}

/** Monday..Sunday of the week containing `date` (ISO), plus `weeks` weeks ahead. */
export function weekRange(from: Date, weeks = 1): { start: string; end: string } {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const dow = (base.getDay() + 6) % 7; // Monday = 0
  base.setDate(base.getDate() - dow);
  const end = new Date(base);
  end.setDate(end.getDate() + 7 * weeks - 1);
  return { start: isoDate(base), end: isoDate(end) };
}

export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return WEEKDAYS[dt.getDay()]!;
}
