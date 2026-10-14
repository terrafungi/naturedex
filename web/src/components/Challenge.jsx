import { Bird, Bone, Bug, Check, Compass, Droplet, Gem, Leaf, PawPrint, Sparkles, Sun } from 'lucide-react';

const ICONS = {
    leaf: [Leaf, '#4fd18b'],
    drop: [Droplet, '#4ea8ff'],
    bird: [Bird, '#7dd3fc'],
    sun: [Sun, '#f4a261'],
    bug: [Bug, '#e9c46a'],
    paw: [PawPrint, '#e76f51'],
    bone: [Bone, '#c9a27a'],
    compass: [Compass, '#a8f0c6'],
    gem: [Gem, '#b794f6'],
    sparkles: [Sparkles, '#f4d88f'],
};

// Shown to visitors before they log in (progress is per player).
export const SAMPLE_CHALLENGES = [
    { key: 'forest', icon: 'leaf', title: 'Gardiens de la Forêt', text: 'Obtiens 3 cartes Forêt', goal: 3, progress: 0, reward: 100 },
    { key: 'water', icon: 'drop', title: 'Sources de Vie', text: 'Obtiens 2 cartes Eau', goal: 2, progress: 0, reward: 100 },
    { key: 'sky', icon: 'bird', title: 'Maîtres du Ciel', text: 'Obtiens 2 cartes Oiseau', goal: 2, progress: 0, reward: 80 },
    { key: 'expert', icon: 'gem', title: 'Œil d\'Expert', text: 'Obtiens une carte Rare ou mieux', goal: 1, progress: 0, reward: 60 },
];

export function GoldLeaf({ className = 'w-4 h-4' }) {
    return <Leaf className={`${className} text-[#e9c46a] fill-[#e9c46a]/30`} />;
}

export function ChallengeCard({ challenge: c, onClaim, busy }) {
    const [Icon, color] = ICONS[c.icon] || ICONS.leaf;
    const done = c.progress >= c.goal;
    return (
        <div className="relative h-full rounded-3xl nd-glass p-4 sm:p-5 flex flex-col overflow-hidden">
            <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full blur-3xl opacity-25" style={{ background: color }} />
            <div className="relative flex flex-col sm:flex-row items-start gap-3">
                <span className="grid place-items-center w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full"
                    style={{ background: `radial-gradient(circle at 35% 30%, ${color}55, ${color}18)`, boxShadow: `0 0 0 1px ${color}66 inset, 0 0 20px -4px ${color}` }}>
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" style={{ color }} />
                </span>
                <div className="min-w-0">
                    <h3 className="font-display text-[1.05rem] sm:text-lg font-semibold text-white leading-tight">{c.title}</h3>
                    <p className="mt-1 text-xs sm:text-[13px] text-ink-soft leading-snug">{c.text}</p>
                </div>
            </div>
            <div className="relative mt-auto pt-4">
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(c.progress / c.goal) * 100}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-white/70">{c.progress}/{c.goal}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-bold text-sm text-[#f4d88f]"><GoldLeaf />+{c.reward}</span>
                    {onClaim && (c.claimed ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-[#a8f0c6]"><Check className="w-4 h-4" />Récupéré</span>
                    ) : done ? (
                        <button onClick={() => onClaim(c.key)} disabled={busy} className="nd-cta-gold px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-60">Récupérer</button>
                    ) : null)}
                </div>
            </div>
        </div>
    );
}
