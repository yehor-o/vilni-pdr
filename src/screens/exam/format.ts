const dateTime = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(ms: number): string {
  return dateTime.format(new Date(ms));
}

const dateOnly = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

/** «24 листопада 2026» (without the trailing «р.»). */
export function formatDate(ms: number): string {
  return dateOnly.format(new Date(ms)).replace(/\s*р\.$/, '');
}
