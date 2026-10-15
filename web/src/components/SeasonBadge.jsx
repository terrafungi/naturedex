import { Crown, Medal, Podium } from 'lucide-react';

// Best final arena rank of a player: champion (1st), podium (2-3) or top 10.
export const SEASON_TIERS = {
    champion: { label: 'Champion', Icon: Crown, color: '#e9c46a', ring: 'ring-[#e9c46a]/50', bg: 'bg-[#e9c46a]/15', text: 'text-[#f4d88f]' },
    podium: { label: 'Podium', Icon: Podium, color: '#c3ccd8', ring: 'ring-[#c3ccd8]/45', bg: 'bg-[#c3ccd8]/12', text: 'text-[#dfe6ef]' },
    top10: { label: 'Top 10', Icon: Medal, color: '#cd8a4a', ring: 'ring-[#cd8a4a]/45', bg: 'bg-[#cd8a4a]/12', text: 'text-[#e8b07a]' },
};
export const tierOf = (rank) => rank === 1 ? 'champion' : rank <= 3 ? 'podium' : rank <= 10 ? 'top10' : null;

const ordinal = (rank) => rank === 1 ? '1re' : `${rank}e`;

// `compact`: icon only (next to a name in a list). Otherwise a pill with the tier and the season.
export default function SeasonBadge({ badge, compact = false, className = '' }) {
    const key = badge && tierOf(badge.rank);
    if (!key) return null;
    const t = SEASON_TIERS[key];
    const title = `${t.label} de saison · ${ordinal(badge.rank)} place en ${badge.label}${badge.times > 1 ? ` · ${badge.times} saisons` : ''}`;
    if (compact) {
        return (
            <span title={title} aria-label={title}
                className={`inline-grid place-items-center shrink-0 w-5 h-5 rounded-full ring-1 ${t.ring} ${t.bg} ${className}`}>
                <t.Icon className="w-3 h-3" style={{ color: t.color }} />
            </span>
        );
    }
    return (
        <span title={title}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ring-1 ${t.ring} ${t.bg} text-xs font-bold ${t.text} ${className}`}>
            <t.Icon className="w-3.5 h-3.5" style={{ color: t.color }} />
            {t.label}{badge.times > 1 && ` ×${badge.times}`}
            <span className="font-medium opacity-75">· {badge.label}</span>
        </span>
    );
}

// Final ranks of every finished season (profile pages).
export function SeasonHistory({ seasons }) {
    return (
        <div className="rounded-3xl nd-glass p-5">
            <h2 className="font-display text-xl text-white">Saisons d'arène</h2>
            {seasons.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">Aucune saison terminée. Joue au moins 5 combats classés dans le mois pour être classé à la fin de la saison.</p>
            ) : (
                <ul className="mt-3 space-y-1.5">
                    {seasons.map((s) => {
                        const key = s.ranked && tierOf(s.rank);
                        const t = key && SEASON_TIERS[key];
                        return (
                            <li key={s.season} className={`flex items-center gap-3 px-3 py-2 rounded-2xl ${t ? `${t.bg} ring-1 ${t.ring}` : 'bg-white/[0.03]'}`}>
                                <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-white/5">
                                    {t ? <t.Icon className="w-4 h-4" style={{ color: t.color }} /> : <span className="text-xs font-bold text-white/60 tabular-nums">{s.rank}</span>}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-white capitalize">{s.label}</p>
                                    <p className="text-xs text-ink-soft">{s.wins} V · {s.losses} D · cote {s.rating}</p>
                                </div>
                                <span className={`text-sm font-bold tabular-nums ${t ? t.text : 'text-white/70'}`}>{ordinal(s.rank)}{t && ` · ${t.label}`}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
