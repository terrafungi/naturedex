import { useEffect } from 'react';
import { useGame } from '../api.jsx';

// Rarities worth showing off: the button only appears on these cards.
export const SHAREABLE = new Set(['rare', 'epic', 'legendary', 'secret']);

// The link points at the share page of the API (Open Graph preview with the card's image),
// which then sends visitors to the site with the sharer's invite code.
export function shareUrl(card, username) {
    return `https://naturedex.fr/api/partage/${card.id}${username ? `?u=${encodeURIComponent(username)}` : ''}`;
}

function FacebookIcon({ className }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
            <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
        </svg>
    );
}

// The share page renders the card's preview image on first visit (a few seconds): warm it up as soon
// as the button shows, so it is cached by the time Facebook's crawler asks for it.
const warmed = new Set();

export default function ShareButton({ card, compact = false, className = '' }) {
    const { user } = useGame();
    const shareable = card && SHAREABLE.has(card.rarity);
    useEffect(() => {
        if (!shareable || warmed.has(card.id)) return;
        warmed.add(card.id);
        fetch(shareUrl(card), { mode: 'no-cors' }).catch(() => warmed.delete(card.id));
    }, [shareable, card?.id]);
    if (!shareable) return null;
    function share(e) {
        e.preventDefault();
        e.stopPropagation(); // inside clickable cards (booster reveal, links)
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl(card, user?.username))}`;
        const w = 600, h = 560;
        const popup = window.open(url, 'naturedex-share', `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2}`);
        if (!popup) window.location.href = url;
    }
    if (compact) {
        return (
            <button onClick={share} title="Partager sur Facebook" aria-label={`Partager ${card.name} sur Facebook`}
                className={`grid place-items-center w-8 h-8 rounded-full bg-[#1877f2] text-white shadow-lg hover:brightness-110 ${className}`}>
                <FacebookIcon className="w-4 h-4" />
            </button>
        );
    }
    return (
        <button onClick={share}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1877f2] text-white text-sm font-bold shadow-lg hover:brightness-110 ${className}`}>
            <FacebookIcon className="w-4 h-4" />Partager sur Facebook
        </button>
    );
}
