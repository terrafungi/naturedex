/** Bottom sheets of the garden: orders, barn, workshop, hive & decorations, arcade, quests, levels, a plot. */
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Bug, Check, Clock, Crown, Droplets, FlaskConical, Gamepad2, Gift, Lock, Sparkles, Sprout, Trophy, X } from 'lucide-react';
import { Plant, Seed } from '../components/Currency.jsx';
import { Compost, DECOR_EMOJI, Fertilizer, Honey, NPCS, PlantArt, ROADMAP, SEED_ORDER, growth, left, npcLine } from './art.jsx';

export function Sheet({ title, icon, accent = '#8ee6a8', onClose, children, wide }) {
    return createPortal(
        <motion.div className="fixed inset-0 z-[100] grid place-items-end sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={onClose} />
            <motion.div className={`relative w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[86dvh] overflow-y-auto overscroll-contain rounded-t-[2rem] sm:rounded-[2rem] bg-[#081a11]/95 ring-1 ring-white/10 shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]`}
                initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 300 }}>
                <div className="sm:hidden mx-auto -mt-2 mb-3 w-10 h-1.5 rounded-full bg-white/20" />
                <button type="button" onClick={onClose} className="absolute top-4 right-4 grid place-items-center w-9 h-9 rounded-full nd-cta-glass" aria-label="Fermer"><X className="w-4 h-4" /></button>
                <h2 className="font-display text-2xl text-white pr-10 flex items-center gap-2.5">
                    <span className="grid place-items-center w-9 h-9 rounded-xl" style={{ background: `${accent}22`, color: accent }}>{icon}</span>{title}
                </h2>
                {children}
            </motion.div>
        </motion.div>,
        document.body
    );
}

const Chip = ({ children, className = '' }) => <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.07] ring-1 ring-white/10 text-xs font-bold tabular-nums ${className}`}>{children}</span>;
const Bar = ({ value, max, color = '#c7ef7a' }) => (
    <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: color }} /></div>
);
const Locked = ({ level, text }) => (
    <div className="mt-5 p-5 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 text-center">
        <Lock className="w-7 h-7 mx-auto text-white/40" />
        <p className="mt-2 font-bold text-white">Niveau {level} du jardin</p>
        <p className="mt-1 text-sm text-ink-soft">{text}</p>
    </div>
);

// ---------------------------------------------------------------- orders

export function OrdersPanel({ garden, now, busy, onDeliver, onSkip, onClose }) {
    return (
        <Sheet title="Commandes du village" icon={<span className="text-lg">📜</span>} accent="#e9c46a" onClose={onClose} wide>
            <p className="mt-1 text-sm text-ink-soft">Les habitants te passent commande. Livre-leur ce que tu as récolté : graines, miel et XP en échange.</p>
            <p className="mt-2 text-xs text-white/50">Graines gagnées en livraison aujourd'hui : {garden.caps.orderCoins.used} / {garden.caps.orderCoins.max}</p>
            <ul className="mt-4 grid sm:grid-cols-2 gap-3">
                {garden.orders.map((o, i) => {
                    if (!o.items) {
                        return (
                            <li key={`w${i}`} className="p-4 rounded-2xl bg-white/[0.03] ring-1 ring-dashed ring-white/10 grid place-items-center text-center min-h-40">
                                <div>
                                    <Clock className="w-6 h-6 mx-auto text-white/35" />
                                    <p className="mt-2 text-sm text-white/60">Un habitant arrive dans</p>
                                    <p className="font-display text-xl font-bold text-white tabular-nums">{left(new Date(o.wait).getTime() - now)}</p>
                                </div>
                            </li>
                        );
                    }
                    const npc = NPCS[o.npc] || NPCS.herisson;
                    const ok = Object.entries(o.items).every(([k, q]) => (garden.barn[k] || 0) >= q);
                    return (
                        <motion.li key={o.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            className={`p-4 rounded-2xl ring-1 ${ok ? 'bg-[#e9c46a]/10 ring-[#e9c46a]/50' : 'bg-white/[0.04] ring-white/10'}`}>
                            <div className="flex items-center gap-3">
                                <span className="grid place-items-center w-12 h-12 rounded-2xl text-3xl shrink-0" style={{ background: `${npc.color}33` }}>{npc.emoji}</span>
                                <div className="min-w-0">
                                    <p className="font-bold text-white truncate">{npc.name}</p>
                                    <p className="text-xs text-white/60 italic leading-snug">« {npcLine(o)} »</p>
                                </div>
                            </div>
                            <ul className="mt-3 flex flex-wrap gap-2">
                                {Object.entries(o.items).map(([k, q]) => {
                                    const have = garden.barn[k] || 0;
                                    return (
                                        <li key={k} className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl ring-1 ${have >= q ? 'bg-[#8ee6a8]/12 ring-[#8ee6a8]/40' : 'bg-black/25 ring-white/10'}`} title={garden.seeds[k]?.name}>
                                            <PlantArt kind={k} stage={3} className="w-8 h-8" />
                                            <span className={`text-sm font-bold tabular-nums ${have >= q ? 'text-[#a8f0c6]' : 'text-white/70'}`}>{Math.min(have, q)}/{q}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                <Chip><Seed className="w-3.5 h-3.5" />{o.coins}</Chip>
                                <Chip><Honey className="w-3.5 h-3.5" />{o.honey}</Chip>
                                <Chip className="text-[#a8f0c6]">+{o.xp} XP</Chip>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <button type="button" disabled={busy || !ok} onClick={() => onDeliver(i, o.id)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full nd-btn font-bold disabled:opacity-40 disabled:grayscale">
                                    <Check className="w-4 h-4" />Livrer
                                </button>
                                <button type="button" disabled={busy} onClick={() => window.confirm(`Refuser la commande de ${npc.name} ? Un autre habitant viendra dans 20 min.`) && onSkip(i)}
                                    className="px-3.5 py-2.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40">Refuser</button>
                            </div>
                        </motion.li>
                    );
                })}
            </ul>
        </Sheet>
    );
}

// ---------------------------------------------------------------- barn

export function BarnPanel({ garden, onClose, onOrders }) {
    const items = SEED_ORDER.filter((k) => garden.barn[k]);
    return (
        <Sheet title="La grange" icon={<span className="text-lg">🛖</span>} accent="#e07a5f" onClose={onClose}>
            <p className="mt-1 text-sm text-ink-soft">Chaque récolte remplit la grange (×2 si elle est dorée). Les habitants te l'achètent dans leurs commandes.</p>
            {items.length ? (
                <ul className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {items.map((k) => (
                        <li key={k} className="p-2 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 text-center">
                            <PlantArt kind={k} stage={3} className="w-16 h-16 mx-auto" />
                            <p className="text-[11px] font-semibold text-white/70 truncate">{garden.seeds[k].name}</p>
                            <p className="font-display text-xl font-bold text-white tabular-nums">×{garden.barn[k]}</p>
                        </li>
                    ))}
                </ul>
            ) : <p className="mt-6 text-center text-white/50">La grange est vide : récolte tes parcelles pour la remplir.</p>}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[[<Honey key="h" className="w-6 h-6 mx-auto" />, garden.honey, 'miel'], [<Compost key="c" className="w-6 h-6 mx-auto" />, garden.compost, 'compost'], [<Fertilizer key="f" className="w-6 h-6 mx-auto" />, garden.fertilizer, 'engrais']].map(([icon, n, label]) => (
                    <div key={label} className="p-3 rounded-2xl bg-black/25 ring-1 ring-white/10">{icon}<p className="mt-1 font-bold text-white tabular-nums">{n}</p><p className="text-[11px] text-white/50">{label}</p></div>
                ))}
            </div>
            <button type="button" onClick={onOrders} className="mt-4 w-full py-3 rounded-full nd-btn font-bold">Voir les commandes</button>
        </Sheet>
    );
}

// ---------------------------------------------------------------- workshop

export function WorkshopPanel({ garden, busy, onCraft, onClose }) {
    const r = garden.rules;
    const can = Math.floor(garden.compost / r.compostPerFertilizer);
    return (
        <Sheet title="L'atelier" icon={<FlaskConical className="w-5 h-5" />} accent="#7dff9a" onClose={onClose}>
            {!garden.unlocks.includes('atelier') ? <Locked level={2} text="Transforme ton compost en engrais." /> : (
                <>
                    <p className="mt-1 text-sm text-ink-soft">
                        Le compost vient des récoltes (+1), des nuisibles chassés et de la chasse aux nuisibles. {r.compostPerFertilizer} compost = 1 engrais,
                        qui donne <b className="text-white">+{Math.round(r.fertilizerBonus * 100)} % de plantes</b> à la récolte.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-4">
                        <div className="text-center"><Compost className="w-14 h-14 mx-auto" /><p className="font-display text-2xl font-bold text-white tabular-nums">{garden.compost}</p></div>
                        <motion.span animate={{ x: [0, 6, 0] }} transition={{ duration: 1.4, repeat: Infinity }} className="text-3xl text-white/40">→</motion.span>
                        <div className="text-center"><Fertilizer className="w-14 h-14 mx-auto" /><p className="font-display text-2xl font-bold text-white tabular-nums">{garden.fertilizer}</p></div>
                    </div>
                    <div className="mt-3"><Bar value={garden.compost % r.compostPerFertilizer || (can ? r.compostPerFertilizer : 0)} max={r.compostPerFertilizer} color="#7dff9a" /></div>
                    <div className="mt-5 flex gap-2">
                        <button type="button" disabled={busy || can < 1} onClick={() => onCraft(false)} className="flex-1 py-3 rounded-full nd-btn font-bold disabled:opacity-40 disabled:grayscale">Fabriquer 1 engrais</button>
                        {can > 1 && <button type="button" disabled={busy} onClick={() => onCraft(true)} className="px-4 py-3 rounded-full bg-white/10 ring-1 ring-white/15 font-bold text-white">Tout ({can})</button>}
                    </div>
                    <p className="mt-3 text-xs text-white/50">Pour l'utiliser : touche une plante en train de pousser, puis « Engrais ».</p>
                </>
            )}
        </Sheet>
    );
}

// ---------------------------------------------------------------- hive & decorations

export function HivePanel({ garden, busy, onBuy, onClose }) {
    const r = garden.rules;
    const pct = (x) => `${Math.round(x * 1000) / 10} %`;
    return (
        <Sheet title="Ruche & décorations" icon={<span className="text-lg">🐝</span>} accent="#ffb627" onClose={onClose} wide>
            <div className="mt-3 flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-[#ffb627]/10 ring-1 ring-[#ffb627]/30">
                <Honey className="w-10 h-10" />
                <div className="mr-auto">
                    <p className="font-display text-3xl font-bold text-white tabular-nums leading-none">{garden.honey}</p>
                    <p className="text-xs text-white/60 mt-1">Miel : fleurs récoltées, commandes, quêtes, mini-jeux et niveaux.</p>
                </div>
            </div>
            <div className="mt-3 p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
                <p className="flex items-center gap-2 font-bold text-white"><FlaskConical className="w-4 h-4 text-[#c69bff]" />Potion de croissance · <Honey className="w-4 h-4" />{r.potionPrice}</p>
                <p className="mt-1 text-sm text-ink-soft">{garden.unlocks.includes('potion') ? 'Divise par deux le temps restant d\'une plante. Touche une plante qui pousse pour l\'utiliser.' : 'Se débloque au niveau 7.'}</p>
            </div>
            {!garden.unlocks.includes('decor') ? <Locked level={4} text="Achète des décorations avec ton miel : elles embellissent l'île et augmentent tes chances de récolte dorée." /> : (
                <>
                    <div className="mt-4 flex items-center gap-3">
                        <p className="font-bold text-white">Beauté du jardin : {garden.beauty}</p>
                        <span className="ml-auto text-sm font-semibold text-[#e9c46a]">Récolte dorée : {pct(garden.goldenChance)}</span>
                    </div>
                    <div className="mt-2"><Bar value={garden.goldenChance - 0.1} max={r.beautyMax} color="#e9c46a" /></div>
                    <p className="mt-1 text-[11px] text-white/45">Chaque point de beauté ajoute {pct(r.beautyStep)} de chance de récolte dorée, jusqu'à +{pct(r.beautyMax)}.</p>
                    <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {Object.entries(garden.decorShop).map(([key, d]) => {
                            const owned = garden.decor.includes(key);
                            return (
                                <li key={key} className={`p-3 rounded-2xl ring-1 flex flex-col ${owned ? 'bg-[#8ee6a8]/10 ring-[#8ee6a8]/40' : 'bg-white/[0.04] ring-white/10'}`}>
                                    <span className="text-4xl text-center">{DECOR_EMOJI[key]}</span>
                                    <p className="mt-1 font-bold text-white text-sm text-center leading-tight">{d.name}</p>
                                    <p className="text-[11px] text-white/50 text-center">+{d.beauty} beauté · +{d.beauty * 3} XP</p>
                                    <button type="button" disabled={busy || owned || garden.honey < d.price} onClick={() => onBuy(key)}
                                        className={`mt-2 flex items-center justify-center gap-1 py-2 rounded-full text-sm font-bold disabled:opacity-60 ${owned ? 'bg-transparent text-[#a8f0c6]' : 'bg-[#ffb627] text-[#3b2a05] disabled:grayscale'}`}>
                                        {owned ? <><Check className="w-4 h-4" />Sur l'île</> : <><Honey className="w-4 h-4" />{d.price}</>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </Sheet>
    );
}

// ---------------------------------------------------------------- arcade

const GAME_INFO = {
    bee: { emoji: '🐝', color: '#ffc93c', text: "Pilote l'abeille, butine le pollen, évite les guêpes. 45 secondes." },
    pests: { emoji: '🐌', color: '#7dff9a', text: 'Chasse escargots, chenilles et criquets. Épargne les coccinelles ! 30 secondes.' },
    memory: { emoji: '🃏', color: '#b98cff', text: 'Retrouve les 8 paires de plantes, en peu de coups et vite.' },
};
export function ArcadePanel({ garden, onPlay, onClose }) {
    const c = garden.caps;
    return (
        <Sheet title="La maison des jeux" icon={<Gamepad2 className="w-5 h-5" />} accent="#ff7a6b" onClose={onClose}>
            <p className="mt-1 text-sm text-ink-soft">Gagne du miel, de l'XP et du compost en jouant. Les records restent, les gains ont une limite par jour.</p>
            <ul className="mt-4 space-y-2.5">
                {Object.entries(garden.games).map(([key, g]) => {
                    const info = GAME_INFO[key];
                    return (
                        <li key={key}>
                            <button type="button" onClick={() => onPlay(key)} className="group w-full flex items-center gap-3 p-3 rounded-2xl text-left bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/[0.08] transition-colors">
                                <span className="grid place-items-center w-14 h-14 rounded-2xl text-3xl shrink-0 group-hover:scale-110 transition-transform" style={{ background: `${info.color}26` }}>{info.emoji}</span>
                                <span className="flex-1 min-w-0">
                                    <b className="text-white">{g.name}</b>
                                    <span className="block text-xs text-white/60 leading-snug">{info.text}</span>
                                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#e9c46a]"><Trophy className="w-3.5 h-3.5" />Record : {garden.best[key] || 0} / {g.max}</span>
                                </span>
                                <span className="shrink-0 px-3 py-1.5 rounded-full nd-btn text-sm font-bold">Jouer</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-4 space-y-2 text-xs text-white/60">
                <div><p className="flex justify-between"><span className="flex items-center gap-1"><Honey className="w-3.5 h-3.5" />Miel du jour</span><span>{c.gameHoney.used} / {c.gameHoney.max}</span></p><Bar value={c.gameHoney.used} max={c.gameHoney.max} color="#ffb627" /></div>
                <div><p className="flex justify-between"><span>XP du jour</span><span>{c.gameXp.used} / {c.gameXp.max}</span></p><Bar value={c.gameXp.used} max={c.gameXp.max} /></div>
            </div>
            <p className="mt-3 text-[11px] text-white/40">Une fois les limites atteintes, tu peux continuer à jouer pour battre tes records.</p>
        </Sheet>
    );
}

// ---------------------------------------------------------------- quests

export function QuestsPanel({ garden, busy, onClaim, onChest, onClose }) {
    const qr = garden.rules.questReward;
    const done = garden.quests.filter((q) => q.claimed).length;
    return (
        <Sheet title="Quêtes du jour" icon={<Sparkles className="w-5 h-5" />} accent="#c69bff" onClose={onClose}>
            <p className="mt-1 text-sm text-ink-soft">4 quêtes chaque jour, nouvelles à minuit. Finis-les toutes pour ouvrir le coffre.</p>
            <ul className="mt-4 space-y-2">
                {garden.quests.map((q) => {
                    const complete = q.progress >= q.goal;
                    return (
                        <li key={q.key} className={`p-3 rounded-2xl ring-1 ${q.claimed ? 'bg-[#8ee6a8]/[0.07] ring-[#8ee6a8]/25' : 'bg-white/[0.04] ring-white/10'}`}>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className={`font-semibold ${q.claimed ? 'text-white/50 line-through' : 'text-white'}`}>{q.text}</p>
                                    <div className="mt-1.5 flex items-center gap-2"><div className="flex-1"><Bar value={q.progress} max={q.goal} color="#c69bff" /></div><span className="text-xs font-bold text-white/70 tabular-nums">{q.progress}/{q.goal}</span></div>
                                </div>
                                {q.claimed ? <Check className="w-6 h-6 text-[#8ee6a8]" /> : (
                                    <button type="button" disabled={busy || !complete} onClick={() => onClaim(q.key)}
                                        className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-full text-xs font-bold bg-[#c69bff] text-[#1d0b3a] disabled:bg-white/10 disabled:text-white/50">
                                        <Honey className="w-3.5 h-3.5" />{qr.honey} · {qr.xp} XP
                                    </button>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            <div className={`mt-4 p-4 rounded-2xl flex items-center gap-3 ring-1 ${garden.chest.ready && !garden.chest.claimed ? 'bg-[#e9c46a]/15 ring-[#e9c46a]/60' : 'bg-white/[0.03] ring-white/10'}`}>
                <motion.span className="text-4xl" animate={garden.chest.ready && !garden.chest.claimed ? { rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] } : {}} transition={{ duration: 1, repeat: Infinity }}>🎁</motion.span>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-white">Coffre du jour</p>
                    <p className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-white/70">
                        <Seed className="w-3.5 h-3.5" />{garden.chest.reward.coins} · <Honey className="w-3.5 h-3.5" />{garden.chest.reward.honey} · <Fertilizer className="w-3.5 h-3.5" />{garden.chest.reward.fertilizer}
                    </p>
                </div>
                {garden.chest.claimed ? <span className="text-sm font-bold text-[#8ee6a8]">Ouvert</span> : (
                    <button type="button" disabled={busy || !garden.chest.ready} onClick={onChest} className="px-4 py-2.5 rounded-full nd-btn font-bold text-sm disabled:opacity-40 disabled:grayscale">
                        {garden.chest.ready ? 'Ouvrir' : `${done}/4`}
                    </button>
                )}
            </div>
        </Sheet>
    );
}

// ---------------------------------------------------------------- levels

export function LevelPanel({ garden, onClose }) {
    return (
        <Sheet title={`Niveau ${garden.level} · ${garden.title}`} icon={<Crown className="w-5 h-5" />} accent="#e9c46a" onClose={onClose}>
            <div className="mt-3"><Bar value={garden.xp} max={garden.xpNext} color="linear-gradient(90deg,#8ee6a8,#e9c46a)" /></div>
            <p className="mt-1 text-xs text-white/60 tabular-nums">{garden.xp} / {garden.xpNext} XP jusqu'au niveau {garden.level + 1}</p>
            <p className="mt-3 text-sm text-ink-soft">
                L'XP vient de tout ce que tu fais au jardin : planter, arroser, récolter, livrer, chasser, jouer. Chaque niveau donne des graines et <Honey className="inline w-3.5 h-3.5" /> 10 miel.
            </p>
            <ol className="mt-4 relative border-l-2 border-white/10 ml-3 space-y-3">
                {ROADMAP.map(([lvl, text], i) => {
                    const got = garden.level >= lvl;
                    return (
                        <li key={i} className="pl-5 relative">
                            <span className={`absolute -left-[0.6rem] top-0.5 grid place-items-center w-4 h-4 rounded-full ${got ? 'bg-[#8ee6a8]' : 'bg-[#1a2e22] ring-2 ring-white/15'}`}>{got && <Check className="w-3 h-3 text-[#06210f]" />}</span>
                            <p className={`text-sm ${got ? 'text-white/55' : 'text-white'}`}><b className="tabular-nums">Niv. {lvl}</b> · {text}</p>
                        </li>
                    );
                })}
            </ol>
        </Sheet>
    );
}

// ---------------------------------------------------------------- a plot

export function PlotPanel({ garden, slot, now, busy, onClose, onWater, onFertilize, onPotion, onShoo, onHarvest, onPlant }) {
    const plot = garden.plots[slot];
    const g = growth(plot, now);
    if (!plot) return null;
    const seed = garden.seeds[plot.kind];
    const r = garden.rules;
    const canPotion = garden.unlocks.includes('potion');
    return (
        <Sheet title={seed.name} icon={<Sprout className="w-5 h-5" />} onClose={onClose}>
            <div className="mt-3 flex items-center gap-4">
                <div className="shrink-0 w-24 h-24 rounded-2xl bg-gradient-to-b from-[#1d3a26] to-[#3b2414] grid place-items-center">
                    <PlantArt kind={plot.kind} stage={g.stage} className="w-20 h-20" />
                </div>
                <div className="flex-1 min-w-0">
                    {g.ready ? <p className="font-display text-2xl font-bold text-[#e9c46a]">Prête à récolter !</p> : (
                        <>
                            <p className="font-display text-2xl font-bold text-white tabular-nums">{left(g.left)}</p>
                            <div className="mt-1.5"><Bar value={g.progress} max={1} /></div>
                        </>
                    )}
                    <p className="mt-2 flex flex-wrap gap-1.5">
                        <Chip><Plant className="w-3.5 h-3.5" />{seed.plants}{plot.fertilized ? ` +${Math.round(r.fertilizerBonus * 100)} %` : ''}</Chip>
                        {plot.watered && <Chip className="text-[#9fd8ff]"><Droplets className="w-3.5 h-3.5" />Arrosée</Chip>}
                        {plot.fertilized && <Chip className="text-[#7dff9a]"><Fertilizer className="w-3.5 h-3.5" />Nourrie</Chip>}
                        {g.pest && <Chip className="text-[#ffb4a2]"><Bug className="w-3.5 h-3.5" />Nuisible −{Math.round(r.pestCut * 100)} %</Chip>}
                    </p>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
                {g.ready && <button type="button" disabled={busy} onClick={onHarvest} className="col-span-2 py-3 rounded-full nd-btn font-bold flex items-center justify-center gap-2"><Sparkles className="w-5 h-5" />Récolter</button>}
                {g.ready && <button type="button" disabled={busy} onClick={onPlant} className="col-span-2 py-2.5 rounded-full bg-white/10 ring-1 ring-white/15 text-white font-semibold">Récolter et replanter</button>}
                {g.pest && <button type="button" disabled={busy} onClick={onShoo} className="col-span-2 py-3 rounded-full bg-[#ff7a6b] text-[#2a0805] font-bold flex items-center justify-center gap-2"><Bug className="w-5 h-5" />Chasser le nuisible</button>}
                {!g.ready && (
                    <>
                        <Action disabled={busy || plot.watered} onClick={onWater} icon={<Droplets className="w-5 h-5 text-[#9fd8ff]" />} title={plot.watered ? 'Déjà arrosée' : 'Arroser'} sub={`−${Math.round(garden.waterCut * 100)} % de temps`} />
                        <Action disabled={busy || plot.fertilized || garden.fertilizer < 1} onClick={onFertilize} icon={<Fertilizer className="w-5 h-5" />}
                            title={plot.fertilized ? 'Déjà nourrie' : `Engrais (${garden.fertilizer})`} sub={`+${Math.round(r.fertilizerBonus * 100)} % de plantes`} />
                        <Action disabled={busy || !canPotion || garden.honey < r.potionPrice} onClick={onPotion} className="col-span-2"
                            icon={canPotion ? <FlaskConical className="w-5 h-5 text-[#c69bff]" /> : <Lock className="w-5 h-5 text-white/40" />}
                            title={canPotion ? <>Potion de croissance · <Honey className="inline w-4 h-4" />{r.potionPrice}</> : 'Potion (niveau 7)'} sub="Divise le temps restant par deux" />
                    </>
                )}
            </div>
            {!g.ready && garden.fertilizer < 1 && garden.unlocks.includes('atelier') && !plot.fertilized && <p className="mt-2 text-[11px] text-white/45 flex items-center gap-1"><Gift className="w-3 h-3" />Fabrique de l'engrais à l'atelier avec ton compost.</p>}
        </Sheet>
    );
}
function Action({ icon, title, sub, className = '', ...props }) {
    return (
        <button type="button" {...props} className={`flex items-center gap-2.5 p-3 rounded-2xl text-left bg-white/[0.05] ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-45 disabled:hover:bg-white/[0.05] ${className}`}>
            {icon}<span className="min-w-0"><b className="block text-sm text-white">{title}</b><span className="block text-[11px] text-white/55">{sub}</span></span>
        </button>
    );
}

// ---------------------------------------------------------------- level up

export function LevelUp({ ups, onClose }) {
    const last = ups.at(-1);
    return createPortal(
        <motion.div className="fixed inset-0 z-[110] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
            <motion.div className="absolute w-[34rem] h-[34rem] rounded-full pointer-events-none" style={{ background: 'conic-gradient(from 0deg, #e9c46a55, transparent 12%, #8ee6a855 25%, transparent 37%, #e9c46a55 50%, transparent 62%, #8ee6a855 75%, transparent 87%, #e9c46a55)' }}
                animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }} />
            <motion.div className="relative w-full max-w-sm rounded-[2rem] bg-[#0b2117] ring-2 ring-[#e9c46a]/60 p-6 text-center shadow-[0_0_80px_-10px_#e9c46a]"
                initial={{ scale: 0.6, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 14 }}>
                <p className="uppercase tracking-[0.3em] text-xs font-bold text-[#e9c46a]">Niveau supérieur</p>
                <motion.p className="mt-2 font-display text-7xl font-black text-white" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring' }}>{last.level}</motion.p>
                {ups.map((u) => u.title && <p key={`t${u.level}`} className="mt-1 font-display text-xl text-[#a8f0c6]">Nouveau titre : {u.title}</p>)}
                <div className="mt-4 flex justify-center gap-2">
                    <Chip className="text-base px-3 py-1"><Seed className="w-4 h-4" />+{ups.reduce((n, u) => n + u.coins, 0)}</Chip>
                    <Chip className="text-base px-3 py-1"><Honey className="w-4 h-4" />+{ups.reduce((n, u) => n + u.honey, 0)}</Chip>
                </div>
                {ups.filter((u) => u.unlock).map((u) => (
                    <p key={u.level} className="mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#e9c46a]/15 text-sm font-bold text-[#f8d98a]"><Sparkles className="w-4 h-4 shrink-0" />Débloqué : {u.unlock}</p>
                ))}
                <button type="button" onClick={onClose} className="mt-5 w-full py-3 rounded-full nd-btn font-bold">Génial !</button>
            </motion.div>
        </motion.div>,
        document.body
    );
}
