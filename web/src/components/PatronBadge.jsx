import { Leaf } from 'lucide-react';

// Shown while the player's Pass Naturaliste is active.
export default function PatronBadge({ className = '' }) {
    return (
        <span title="Mécène : abonné·e au Pass Naturaliste, soutient chaque mois une association nature"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ring-1 ring-[#e9c46a]/50 bg-[#e9c46a]/12 text-xs font-bold text-[#f4d88f] ${className}`}>
            <Leaf className="w-3.5 h-3.5 text-[#e9c46a]" />Mécène
        </span>
    );
}
