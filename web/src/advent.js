// Calendrier de l'Avent: 1 → 24 December, Paris time (the server decides what can be opened).
export const ADVENT_YEAR = 2026;

export function adventDay(now = new Date()) {
    const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now).split('-').map(Number);
    return y === ADVENT_YEAR && m === 12 && d <= 24 ? d : null;
}
