// Calendar-only arithmetic: never interpret a selected date in the host timezone.
export function yearLength(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
}
export function atYear(date: string, year: number): string {
  const [, month, day] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
export function dayIndex(date: string): number {
  const year = Number(date.slice(0, 4));
  return (Date.parse(`${date}T00:00:00Z`) - Date.UTC(year, 0, 1)) / 86400000;
}
export function dateAt(year: number, index: number): string {
  return new Date(Date.UTC(year, 0, 1 + Math.max(0, Math.min(index, yearLength(year) - 1)))).toISOString().slice(0, 10);
}
export function formatDate(date: string, language: string): string {
  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-GB", {
    year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
