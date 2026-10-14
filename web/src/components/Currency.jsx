import { Sprout } from 'lucide-react';

// Two currencies: graines open boosters, pépites buy and sell cards at the auction house.
export const SEED_COLOR = '#8ee6a8';
export const NUGGET_COLOR = '#f4c25b';

export function Seed({ className = 'w-4 h-4' }) {
    return <Sprout className={className} style={{ color: SEED_COLOR }} aria-label="graines" />;
}

export function Nugget({ className = 'w-4 h-4' }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-label="pépites">
            <path d="M4 15.5 7.5 7l6-3 5.5 4 1.5 7.5-5 4.5H8z" fill="#f4c25b" stroke="#8a5a12" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M7.5 7 10 12l3.5-8M10 12l-6 3.5M10 12l5.5 8M10 12l9-4" stroke="#8a5a12" strokeWidth="1" strokeLinejoin="round" opacity="0.55" fill="none" />
            <path d="M8.5 8.5 11.5 6.5" stroke="#fff6d8" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}

const fmt = (n) => Number(n).toLocaleString('fr-FR');

/** Inline amount: <Amount seeds={100} /> or <Amount nuggets={40} sign />. */
export function Amount({ seeds, nuggets, sign = false, className = '' }) {
    const value = seeds ?? nuggets;
    return (
        <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${className}`} style={{ color: seeds != null ? SEED_COLOR : NUGGET_COLOR }}>
            {seeds != null ? <Seed /> : <Nugget />}{sign ? '+' : ''}{fmt(value)}
        </span>
    );
}
