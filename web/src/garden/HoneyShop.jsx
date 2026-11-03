/** Honey shop: avatar backgrounds, avatar effects and card frames, bought once with garden honey. */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Maximize2, ShoppingBag, X } from 'lucide-react';
import { useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { AvatarFigure, defaultAvatar } from '../components/PlayerAvatar.jsx';
import { RARITIES } from '../game.jsx';
import { Honey } from './art.jsx';
import { Sheet } from './Panels.jsx';

const TABS = [
    { slot: 'scene', label: 'Fonds', text: "Le décor derrière ton avatar, partout où il apparaît : profil, classements, amis." },
    { slot: 'fx', label: 'Effets', text: 'Une petite animation autour de ton avatar, visible sur ton profil et les grands formats.' },
    { slot: 'frame', label: 'Cadres', text: 'Le cadre de tes cartes dans ta collection, tes boosters et ton profil public. La rareté reste visible en liseré.' },
];
const RANK = Object.keys(RARITIES);

export default function HoneyShopPanel({ garden, busy, onBuy, onEquip, onClose }) {
    const { user, catalog, owned: cards } = useGame();
    const [tab, setTab] = useState('scene');
    const [zoom, setZoom] = useState(null); // { id, name, price } of the item shown big
    const { catalog: items, owned } = garden.cosmetics;
    const me = useMemo(() => ({ ...defaultAvatar(user.username), ...user.avatar }), [user]);
    // The player's rarest card shows the frames, any card if the collection is empty.
    const sample = useMemo(() => {
        const list = catalog?.cards || [];
        const mine = list.filter((c) => cards[c.id]).sort((a, b) => RANK.indexOf(b.rarity) - RANK.indexOf(a.rarity));
        return mine[0] || list[0];
    }, [catalog, cards]);
    const info = TABS.find((t) => t.slot === tab);
    const worn = me[tab] || 'aucun';
    const total = Object.values(items).flat().length;

    return (
        <Sheet title="Boutique du miel" icon={<ShoppingBag className="w-5 h-5" />} accent="#ff9ec2" onClose={onClose} wide>
            <div className="mt-3 flex items-center gap-3 p-4 rounded-2xl bg-[#ffb627]/10 ring-1 ring-[#ffb627]/30">
                <Honey className="w-10 h-10" />
                <div className="mr-auto">
                    <p className="font-display text-3xl font-bold text-white tabular-nums leading-none">{garden.honey}</p>
                    <p className="text-xs text-white/60 mt-1">Des objets à vie pour ton avatar et tes cartes · {owned.length}/{total} obtenus</p>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1 p-1 rounded-full bg-white/[0.06] ring-1 ring-white/10" role="tablist">
                {TABS.map((t) => (
                    <button key={t.slot} type="button" role="tab" aria-selected={tab === t.slot} onClick={() => setTab(t.slot)}
                        className={`py-2 rounded-full text-sm font-bold transition-colors ${tab === t.slot ? 'bg-[#ff9ec2] text-[#3a0b20]' : 'text-white/75 hover:bg-white/10'}`}>{t.label}</button>
                ))}
            </div>
            <p className="mt-3 text-sm text-ink-soft">{info.text}</p>
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[{ id: 'aucun', name: 'Aucun' }, ...items[tab]].map((it) => (
                    <Tile key={it.id} name={it.name} price={it.price} honey={garden.honey}
                        preview={<Preview slot={tab} id={it.id} me={me} sample={sample} />} onZoom={() => setZoom(it)}
                        have={it.id === 'aucun' || owned.includes(`${tab}:${it.id}`)} worn={worn === it.id} busy={busy}
                        onBuy={() => onBuy(tab, it)} onEquip={() => onEquip(tab, it.id)} />
                ))}
            </ul>
            {createPortal(
                <AnimatePresence>
                    {zoom && (
                        <motion.div key="zoom" className="fixed inset-0 z-[120] grid place-items-center p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setZoom(null)} />
                            <button type="button" onClick={() => setZoom(null)} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 grid place-items-center w-11 h-11 rounded-full nd-cta-glass text-white" aria-label="Fermer l'aperçu"><X className="w-5 h-5" /></button>
                            <motion.div className="relative flex flex-col items-center w-full max-w-sm" initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                                transition={{ type: 'spring', damping: 22, stiffness: 280 }}>
                                <Preview slot={tab} id={zoom.id} me={me} sample={sample} big />
                                <p className="mt-4 font-display text-2xl font-bold text-white">{zoom.name}</p>
                                <div className="mt-3 w-56">
                                    <Action price={zoom.price} honey={garden.honey} busy={busy}
                                        have={zoom.id === 'aucun' || owned.includes(`${tab}:${zoom.id}`)} worn={worn === zoom.id}
                                        onBuy={() => onBuy(tab, zoom)} onEquip={() => onEquip(tab, zoom.id)} />
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </Sheet>
    );
}

function Preview({ slot, id, me, sample, big }) {
    if (slot === 'frame') return sample ? <div className={`${big ? 'w-[min(17rem,72vw)]' : 'w-[6.2rem]'} pointer-events-none`}><Card card={sample} frame={id} /></div> : null;
    const look = slot === 'scene' ? { ...me, scene: id, fx: 'aucun' } : { ...me, fx: id };
    return big ? <AvatarFigure avatar={look} size={300} full animate /> : <AvatarFigure avatar={look} size={84} />;
}

function Tile({ name, preview, onZoom, have, worn, ...action }) {
    return (
        <li className={`p-3 rounded-2xl ring-1 flex flex-col items-center ${worn ? 'bg-[#ff9ec2]/12 ring-[#ff9ec2]/50' : have ? 'bg-[#8ee6a8]/[0.07] ring-[#8ee6a8]/30' : 'bg-white/[0.04] ring-white/10'}`}>
            <button type="button" onClick={onZoom} className="relative grid place-items-center h-[8.8rem] w-full" aria-label={`Voir ${name} en grand`}>
                {preview}
                <span className="absolute top-0 right-0 grid place-items-center w-7 h-7 rounded-full bg-black/45 text-white/85"><Maximize2 className="w-3.5 h-3.5" /></span>
            </button>
            <p className="mt-1.5 font-bold text-white text-sm text-center leading-tight">{name}</p>
            <div className="mt-2 w-full"><Action have={have} worn={worn} {...action} /></div>
        </li>
    );
}

function Action({ price, honey, have, worn, busy, onBuy, onEquip }) {
    if (worn) return <span className="w-full flex items-center justify-center gap-1 py-2 rounded-full text-sm font-bold text-[#ffc4dc]"><Check className="w-4 h-4" />Équipé</span>;
    if (have) return <button type="button" disabled={busy} onClick={onEquip} className="w-full py-2 rounded-full text-sm font-bold nd-cta-glass text-white disabled:opacity-60">Équiper</button>;
    return (
        <button type="button" disabled={busy || honey < price} onClick={onBuy}
            className="w-full flex items-center justify-center gap-1 py-2 rounded-full text-sm font-bold bg-[#ffb627] text-[#3b2a05] disabled:opacity-60 disabled:grayscale">
            <Honey className="w-4 h-4" />{price}
        </button>
    );
}
