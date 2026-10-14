import { Link } from 'react-router-dom';
import { ChevronRight, Gift } from 'lucide-react';

// Shortcut to the invite page, shown in the shop and on the friends page.
export default function InviteBanner({ className = '' }) {
    return (
        <Link to="/inviter" className={`group flex items-center gap-3 rounded-2xl p-3.5 sm:p-4 bg-[linear-gradient(135deg,rgba(233,196,106,0.16),rgba(233,196,106,0.04))] ring-1 ring-[#e9c46a]/30 hover:ring-[#e9c46a]/60 transition ${className}`}>
            <span className="grid place-items-center w-11 h-11 shrink-0 rounded-full bg-[#e9c46a] text-[#2a1c00]"><Gift className="w-5 h-5" /></span>
            <span className="min-w-0 flex-1">
                <span className="block font-semibold text-white">Gagne des monnaies gratuitement</span>
                <span className="block text-sm text-ink-soft leading-snug">Invite tes amis et partage ton lien : jusqu'à 1 000 graines et 150 pépites par ami.</span>
            </span>
            <ChevronRight className="w-5 h-5 shrink-0 text-[#f4d88f] transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}
