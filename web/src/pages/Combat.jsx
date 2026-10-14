import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
    BookOpen, Check, ChevronRight, Crown, Flag, Lock, Map as MapIcon, Search, Shield, Skull, Swords, Trophy, Users, Wind, X, Zap,
} from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Amount } from '../components/Currency.jsx';
import { RARITIES, TYPES } from '../game.jsx';
import { ABILITIES, AbilityLine, Avatar, MultTag, PROFILES, RarityDot, STRONG, Stats, TypeChip, WEAK_TO, matchup } from '../components/Fighter.jsx';

const AI_LEVEL = { 1: 'Débutant', 2: 'Tacticien', 3: 'Expert' };
const TABS = [
    { key: 'campaign', label: 'Campagne', Icon: MapIcon },
    { key: 'arena', label: 'Arène classée', Icon: Trophy },
    { key: 'team', label: 'Mon équipe', Icon: Users },
    { key: 'rules', label: 'Règles', Icon: BookOpen },
];
export const Reward = ({ coins, nuggets, sign }) => (
    <span className="inline-flex items-center gap-2">
        {coins > 0 && <Amount seeds={coins} sign={sign} />}
        {nuggets > 0 && <Amount nuggets={nuggets} sign={sign} />}
    </span>
);
const power = (c) => c.hp + c.atk + c.def + c.spd;

// For each foe card, the best type matchup my team has against it.
function TeamVs({ team, mine }) {
    return (
        <div className="flex items-center gap-2.5">
            {team.map((c) => {
                const best = mine.length ? Math.max(...mine.map((m) => matchup(m, c).dealt)) : 1;
                const worst = mine.length ? Math.max(...mine.map((m) => matchup(m, c).taken)) : 1;
                return (
                    <div key={c.id} className="flex flex-col items-center gap-1 w-14">
                        <Avatar card={c} size={44} />
                        <span className="text-[10px] leading-tight text-center text-white/70 line-clamp-1 w-full">{c.name}</span>
                        <span className="flex gap-0.5" title="Ton meilleur multiplicateur contre elle / le pire qu'elle t'inflige">
                            <MultTag mult={best > 1 ? best : null} />
                            {worst > 1 && <MultTag mult={worst} prefix="⚠" invert />}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function TeamStrip({ team, onEdit }) {
    return (
        <div className="p-4 sm:p-5 rounded-3xl nd-glass flex flex-wrap items-center gap-4">
            <div className="min-w-0">
                <p className="uppercase tracking-[0.2em] text-[10px] font-bold text-brass-deep">Ton équipe</p>
                <p className="text-sm text-ink-soft">{team.length === 3 ? 'Prête au combat' : 'Choisis 3 cartes de ta collection'}</p>
            </div>
            <div className="flex flex-1 flex-wrap gap-3">
                {[0, 1, 2].map((i) => team[i] ? (
                    <div key={i} className="flex items-center gap-2.5 pr-3 py-1.5 pl-1.5 rounded-full bg-white/[0.06]">
                        <Avatar card={team[i]} size={40} />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight truncate max-w-36">{team[i].name}</p>
                            <Stats card={team[i]} className="!gap-1.5 !text-[10px]" />
                        </div>
                    </div>
                ) : (
                    <button key={i} onClick={onEdit} className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 grid place-items-center text-white/40">+</button>
                ))}
            </div>
            <button onClick={onEdit} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold">Modifier</button>
        </div>
    );
}

/* ---------- campaign ---------- */

function Campaign({ data, start, busy }) {
    return (
        <ol className="relative space-y-3">
            <span className="absolute left-[1.35rem] top-4 bottom-4 w-0.5 bg-gradient-to-b from-[#4fd18b]/60 via-white/10 to-[#e9c46a]/50" />
            {data.stages.map((s) => (
                <li key={s.n} className={`relative pl-12 ${s.locked ? 'opacity-50' : ''}`}>
                    <span className={`absolute left-0 top-4 w-11 h-11 rounded-full grid place-items-center font-display font-black text-lg
                        ${s.cleared ? 'bg-[#2fa866] text-white' : s.locked ? 'bg-white/10 text-white/50' : s.boss ? 'bg-rust text-white' : 'bg-[#e9c46a] text-[#2a1c00]'}`}>
                        {s.cleared ? <Check className="w-5 h-5" strokeWidth={3} /> : s.locked ? <Lock className="w-4 h-4" /> : s.boss ? <Skull className="w-5 h-5" /> : s.n}
                    </span>
                    <div className={`p-4 rounded-3xl border ${s.boss ? 'border-rust/40 bg-rust/[0.07]' : 'border-white/10 bg-white/[0.04]'} flex flex-wrap items-center gap-4`}>
                        <div className="flex-1 min-w-52">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-ink-soft">
                                Étape {s.n}{s.boss ? ' · Boss' : ''} · IA {AI_LEVEL[s.ai]}
                            </p>
                            <h3 className="font-display text-xl font-semibold">{s.name}</h3>
                            <p className="text-sm text-ink-soft">{s.text}</p>
                            <p className="mt-1.5 text-xs text-white/70">
                                {s.cleared ? <>Déjà gagnée · rejouer rapporte <Amount seeds={data.replayCoins} /> (victoires du jour)</> : <>1re victoire : <Reward coins={s.coins} nuggets={s.nuggets} /></>}
                            </p>
                        </div>
                        <TeamVs team={s.team} mine={data.team} />
                        <button disabled={s.locked || busy || data.team.length !== 3} onClick={() => start({ mode: 'campaign', stage: s.n })}
                            className="px-5 py-2.5 rounded-full nd-btn font-bold text-sm disabled:opacity-40 disabled:grayscale flex items-center gap-1.5">
                            <Swords className="w-4 h-4" />{s.cleared ? 'Rejouer' : 'Combattre'}
                        </button>
                    </div>
                </li>
            ))}
        </ol>
    );
}

/* ---------- ranked arena ---------- */

function Opponent({ name, rating, team, mine, onFight, busy, sub }) {
    return (
        <div className="p-4 rounded-3xl border border-white/10 bg-white/[0.04] flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-40">
                <p className="font-display text-lg font-semibold">{name}</p>
                <p className="text-xs text-ink-soft">{rating} points{sub ? ` · ${sub}` : ''}</p>
            </div>
            <TeamVs team={team} mine={mine} />
            <button disabled={busy || mine.length !== 3} onClick={onFight}
                className="px-5 py-2.5 rounded-full nd-btn font-bold text-sm disabled:opacity-40 disabled:grayscale flex items-center gap-1.5">
                <Swords className="w-4 h-4" />Défier
            </button>
        </div>
    );
}

function Arena({ data, start, busy }) {
    return (
        <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-3xl nd-glass">
                    <p className="text-xs text-ink-soft">Ta cote</p>
                    <p className="font-display text-3xl font-bold">{data.rating}</p>
                    <p className="text-xs text-white/60">{data.rank ? `${data.rank}e au classement` : 'Pas encore classé'}</p>
                </div>
                <div className="p-4 rounded-3xl nd-glass">
                    <p className="text-xs text-ink-soft">Bilan</p>
                    <p className="font-display text-3xl font-bold">{data.wins}<span className="text-ink-soft text-xl"> V · </span>{data.losses}<span className="text-ink-soft text-xl"> D</span></p>
                    <Link to="/classement" className="text-xs text-[#f4d88f] hover:underline">Voir le classement →</Link>
                </div>
                <div className="p-4 rounded-3xl nd-glass">
                    <p className="text-xs text-ink-soft">Victoires récompensées aujourd'hui</p>
                    <p className="font-display text-3xl font-bold">{data.rewardsLeft}<span className="text-ink-soft text-xl">/{data.dailyRewards}</span></p>
                    <p className="text-xs text-white/60"><Amount seeds={data.winCoins} /> par victoire classée</p>
                </div>
            </div>

            <section>
                <h3 className="font-display text-xl font-semibold">Gardes de la réserve</h3>
                <p className="text-sm text-ink-soft">Des naturalistes de ton niveau. Leur équipe change chaque jour.</p>
                <div className="mt-3 space-y-3">
                    {data.rangers.map((r) => (
                        <Opponent key={r.slot} {...r} mine={data.team} busy={busy} sub="IA Expert" onFight={() => start({ mode: 'ranked', bot: r.slot })} />
                    ))}
                </div>
            </section>

            {data.players.length > 0 && (
                <section>
                    <h3 className="font-display text-xl font-semibold">Joueurs</h3>
                    <p className="text-sm text-ink-soft">Affronte l'équipe enregistrée d'autres joueurs, jouée par l'IA. Gagner leur prend des points.</p>
                    <div className="mt-3 space-y-3">
                        {data.players.map((p) => (
                            <Opponent key={p.username} name={p.username} rating={p.rating} team={p.team.map((c) => ({ ...c }))} mine={data.team} busy={busy}
                                sub={`${p.wins} victoire${p.wins > 1 ? 's' : ''}`} onFight={() => start({ mode: 'ranked', username: p.username })} />
                        ))}
                    </div>
                </section>
            )}

            <section className="p-4 rounded-3xl border border-white/10">
                <h3 className="font-display text-xl font-semibold">Entraînement entre amis</h3>
                <p className="text-sm text-ink-soft">Teste ton équipe contre celle d'un ami, sans enjeu : pas de points, pas de récompense.</p>
                {data.friends.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {data.friends.map((f) => (
                            <button key={f.username} disabled={!f.ready || busy || data.team.length !== 3} onClick={() => start({ mode: 'friend', username: f.username })}
                                className="px-3.5 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
                                title={f.ready ? `Affronter ${f.username}` : 'Pas encore d\'équipe'}>
                                <Swords className="w-3.5 h-3.5" />{f.username}{!f.ready && <span className="text-xs text-white/50">· sans équipe</span>}
                            </button>
                        ))}
                    </div>
                ) : <p className="mt-2 text-sm"><Link to="/amis" className="text-[#f4d88f] hover:underline">Ajoute des amis</Link> pour t'entraîner contre eux.</p>}
            </section>
        </div>
    );
}

/* ---------- team builder ---------- */

function TeamBuilder({ data, onSaved }) {
    const [cards, setCards] = useState(null);
    const [pick, setPick] = useState(data.team.map((c) => c.id));
    const [type, setType] = useState('');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('power');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    useEffect(() => { api('arenaCards').then((r) => setCards(r.cards)).catch((e) => setMsg(e.message)); }, []);

    const byId = useMemo(() => Object.fromEntries((cards || data.team).map((c) => [c.id, c])), [cards, data.team]);
    const chosen = pick.map((id) => byId[id]).filter(Boolean);
    const list = useMemo(() => (cards || [])
        .filter((c) => (!type || c.type === type) && (!query || c.name.toLowerCase().includes(query.toLowerCase())))
        .sort((a, b) => (sort === 'power' ? power(b) - power(a) : b[sort] - a[sort]) || a.name.localeCompare(b.name))
        .slice(0, 120), [cards, type, query, sort]);
    const toggle = (id) => setPick((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p);
    const strongVs = [...new Set(chosen.flatMap((c) => STRONG[c.type]))];
    const weakTo = [...new Set(chosen.flatMap((c) => WEAK_TO[c.type]))].filter((t) => !chosen.some((c) => STRONG[c.type].includes(t)));

    async function save() {
        setSaving(true);
        setMsg('');
        try {
            const r = await api('setTeam', { cards: pick });
            onSaved(r.team);
            setMsg('Équipe enregistrée !');
        } catch (e) { setMsg(e.message); } finally { setSaving(false); }
    }

    return (
        <div className="space-y-5">
            <div className="grid md:grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => {
                    const c = chosen[i];
                    return (
                        <div key={i} className={`p-3.5 rounded-3xl border ${c ? 'border-white/15 bg-white/[0.06]' : 'border-dashed border-white/20'} min-h-32`}>
                            {c ? (
                                <div className="flex gap-3">
                                    <Avatar card={c} size={56} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start gap-2">
                                            <p className="font-semibold leading-tight flex-1 line-clamp-2">{i === 0 ? '① ' : i === 1 ? '② ' : '③ '}{c.name}</p>
                                            <button onClick={() => toggle(c.id)} className="text-white/50 hover:text-white" title="Retirer"><X className="w-4 h-4" /></button>
                                        </div>
                                        <p className="text-[11px] text-ink-soft">{TYPES[c.type].label} · {PROFILES[c.type].role}</p>
                                        <Stats card={c} className="mt-1" />
                                        <AbilityLine type={c.type} className="mt-1.5 line-clamp-2" />
                                    </div>
                                </div>
                            ) : <p className="h-full grid place-items-center text-sm text-white/40">Carte {i + 1} — choisis dans la liste</p>}
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-ink-soft flex-1 min-w-60">
                    La 1re carte commence le combat. {chosen.length > 0 && <>Fort contre : <b className="text-[#8ee6a8]">{strongVs.map((t) => TYPES[t].label).join(', ')}</b>.
                    {weakTo.length > 0 && <> Sans réponse face à : <b className="text-[#ffb4a2]">{weakTo.map((t) => TYPES[t].label).join(', ')}</b>.</>}</>}
                </p>
                {msg && <span className="text-sm font-semibold text-[#f4d88f]">{msg}</span>}
                <button disabled={pick.length !== 3 || saving} onClick={save} className="px-6 py-2.5 rounded-full nd-btn font-bold disabled:opacity-40">Enregistrer l'équipe</button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.06] flex-1 min-w-48">
                    <Search className="w-4 h-4 text-white/50" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une carte" className="bg-transparent outline-none text-sm flex-1" />
                </label>
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-2 rounded-full bg-white/[0.06] text-sm">
                    <option value="power">Plus fortes</option><option value="atk">Attaque</option><option value="def">Défense</option><option value="spd">Vitesse</option><option value="hp">PV</option>
                </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setType('')} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${!type ? 'bg-white text-black' : 'bg-white/[0.06]'}`}>Tous</button>
                {Object.entries(TYPES).map(([k, t]) => (
                    <button key={k} onClick={() => setType(type === k ? '' : k)} className="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"
                        style={type === k ? { background: t.color, color: 'white' } : { background: 'rgb(255 255 255 / 0.06)' }}>
                        <t.Icon className="w-3.5 h-3.5" />{t.label}
                    </button>
                ))}
            </div>
            {!cards ? <p className="text-ink-soft text-sm">Chargement de ta collection…</p> : list.length === 0 ? <p className="text-ink-soft text-sm">Aucune carte. <Link to="/booster" className="text-[#f4d88f]">Ouvre des boosters</Link>.</p> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {list.map((c) => {
                        const on = pick.includes(c.id);
                        return (
                            <button key={c.id} onClick={() => toggle(c.id)} disabled={!on && pick.length >= 3}
                                className={`text-left p-2.5 rounded-2xl flex gap-3 items-center transition ${on ? 'bg-[#2fa866]/25 ring-2 ring-[#4fd18b]' : 'bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50'}`}>
                                <Avatar card={c} size={46} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2"><span className="font-semibold text-sm truncate">{c.name}</span><RarityDot rarity={c.rarity} /></span>
                                    <span className="block text-[11px] text-ink-soft">{PROFILES[c.type].role} · {ABILITIES[c.type].name}</span>
                                    <Stats card={c} className="!gap-2 !text-[11px]" />
                                </span>
                                {on && <Check className="w-5 h-5 text-[#4fd18b]" strokeWidth={3} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ---------- rules ---------- */

function Rules() {
    const step = 'p-4 rounded-3xl border border-white/10 bg-white/[0.04]';
    return (
        <div className="space-y-5 text-sm leading-relaxed">
            <div className="grid md:grid-cols-2 gap-3">
                <div className={step}>
                    <h3 className="font-display text-lg font-semibold">Le principe</h3>
                    <p className="text-ink-soft mt-1">3 cartes contre 3. Une seule carte de chaque camp est en jeu, les autres attendent en réserve. Le premier qui met K.O. les 3 cartes adverses gagne. <b className="text-white">Aucun hasard</b> : mêmes choix, même résultat. Les stats viennent des vraies données de l'espèce (popularité sur Wikipédia, masse, taille) et de son type.</p>
                </div>
                <div className={step}>
                    <h3 className="font-display text-lg font-semibold">Chaque manche</h3>
                    <p className="text-ink-soft mt-1">Les deux camps gagnent <b className="text-white">+1 <Zap className="inline w-3 h-3 fill-current" /></b> (5 max). Tu vois à l'avance ce que l'adversaire prépare (bulle d'intention) et les dégâts exacts de chacune de tes actions. Les changements, protections et capacités « prioritaires » passent d'abord, puis la carte la plus <b className="text-white">rapide</b> agit avant l'autre.</p>
                </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    [Swords, 'Attaque', 'Dégâts selon ton ATQ, la DÉF adverse et les types.'],
                    [Zap, 'Capacité', 'Le pouvoir de ton type, payé en énergie. Bien placée, elle renverse un combat.'],
                    [Shield, 'Protection', 'Divise par 2 les dégâts reçus et donne +1 ⚡. Parfait contre une grosse attaque annoncée.'],
                    [Wind, 'Changement', 'Fais entrer une carte de la réserve avant les attaques : elle encaisse le coup à la place.'],
                ].map(([Icon, title, text]) => (
                    <div key={title} className={step}>
                        <Icon className="w-5 h-5 text-[#f4d88f]" />
                        <h4 className="mt-1 font-semibold">{title}</h4>
                        <p className="text-ink-soft text-xs mt-0.5">{text}</p>
                    </div>
                ))}
            </div>
            <div className={step}>
                <h3 className="font-display text-lg font-semibold">Les types</h3>
                <p className="text-ink-soft">Un type fort inflige <b className="text-[#8ee6a8]">×1,5</b> ; dans l'autre sens, il ne subit que <b className="text-[#ffb4a2]">×0,75</b>. Change de carte pour exploiter ces avantages.</p>
                <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {Object.entries(TYPES).map(([k, t]) => (
                        <div key={k} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <TypeChip type={k} />
                                <span className="text-xs text-white/50">{PROFILES[k].role}</span>
                                <span className="text-xs">fort contre</span>
                                {STRONG[k].map((o) => <TypeChip key={o} type={o} small />)}
                            </div>
                            <p className="text-xs text-white/70"><b className="text-white">{ABILITIES[k].name}</b> ({ABILITIES[k].cost} ⚡) : {ABILITIES[k].text}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div className={step}>
                <h3 className="font-display text-lg font-semibold">Récompenses</h3>
                <ul className="text-ink-soft list-disc pl-5 space-y-0.5">
                    <li>Campagne : 15 étapes de plus en plus dures, 3 boss. Chaque 1re victoire paie des graines, et des pépites pour les boss.</li>
                    <li>Arène classée : ta cote monte quand tu gagnes, surtout contre plus fort que toi. Tes 5 premières victoires du jour rapportent des graines.</li>
                    <li>Ton équipe sert aussi de défense : les autres joueurs peuvent l'affronter.</li>
                    <li>Un combat dure 40 manches au plus : ensuite, l'équipe qui garde le plus de PV en % gagne.</li>
                </ul>
            </div>
        </div>
    );
}

/* ---------- page ---------- */

export default function Combat() {
    const { refreshBadges } = useGame();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [tab, setTab] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const load = () => api('arena').then((d) => { setData(d); setTab((t) => t || (d.team.length === 3 ? 'campaign' : 'team')); }).catch((e) => setError(e.message));
    useEffect(() => { load(); }, []);

    async function start(params) {
        setBusy(true);
        setError('');
        try {
            const { battle } = await api('battleStart', params);
            refreshBadges?.();
            navigate(`/combat/${battle.id}`);
        } catch (e) { setError(e.message); setBusy(false); }
    }

    if (!data) return <div className="max-w-5xl mx-auto px-4 py-16 text-ink-soft">{error || 'Chargement de l\'arène…'}</div>;
    return (
        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">Arène NatureDex</p>
                    <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white mt-1">Combat</h1>
                    <p className="text-ink-soft mt-1 max-w-xl">Des combats au tour par tour, sans hasard. Lis l'intention de l'adversaire, joue les types, gère ton énergie.</p>
                </div>
                <div className="flex gap-2 text-sm">
                    <span className="px-3 py-1.5 rounded-full bg-white/[0.06] flex items-center gap-1.5"><Crown className="w-4 h-4 text-[#f4d88f]" />{data.rating}</span>
                    <span className="px-3 py-1.5 rounded-full bg-white/[0.06] flex items-center gap-1.5"><Flag className="w-4 h-4 text-[#8ee6a8]" />Étape {Math.min(15, data.campaign + 1)}/15</span>
                </div>
            </div>

            {data.active && (
                <motion.button initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} onClick={() => navigate(`/combat/${data.active.id}`)}
                    className="w-full p-4 rounded-3xl nd-cta-gold flex items-center gap-3 text-left font-bold">
                    <Swords className="w-6 h-6" />
                    <span className="flex-1">Combat en cours contre {data.active.opponent} — manche {data.active.round}</span>
                    Reprendre <ChevronRight className="w-5 h-5" />
                </motion.button>
            )}

            <TeamStrip team={data.team} onEdit={() => setTab('team')} />
            {error && <p className="text-sm font-semibold text-[#ffb4a2]">{error}</p>}

            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {TABS.map(({ key, label, Icon }) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 ${tab === key ? 'bg-white text-[#05130d]' : 'bg-white/[0.06] hover:bg-white/[0.1]'}`}>
                        <Icon className="w-4 h-4" />{label}
                    </button>
                ))}
            </div>

            {tab === 'campaign' && <Campaign data={data} start={start} busy={busy || !!data.active} />}
            {tab === 'arena' && <Arena data={data} start={start} busy={busy || !!data.active} />}
            {tab === 'team' && <TeamBuilder data={data} onSaved={(team) => { setData((d) => ({ ...d, team })); load(); }} />}
            {tab === 'rules' && <Rules />}

            {data.history.length > 0 && (
                <section>
                    <h3 className="font-display text-lg font-semibold">Derniers combats</h3>
                    <ul className="mt-2 divide-y divide-white/5 text-sm">
                        {data.history.map((h) => (
                            <li key={h.id} className="py-2 flex items-center gap-3">
                                <span className={`w-14 text-center text-xs font-black rounded-full py-0.5 ${h.status === 'won' ? 'bg-[#2fa866]/25 text-[#8ee6a8]' : 'bg-rust/20 text-[#ffb4a2]'}`}>{h.status === 'won' ? 'Victoire' : 'Défaite'}</span>
                                <span className="flex-1 truncate">{h.mode === 'campaign' ? `Campagne · ${h.stageName}` : h.mode === 'friend' ? `Entraînement · ${h.opponent_name}` : `Arène · ${h.opponent_name}`}</span>
                                {h.rating_delta != null && <span className={`tabular-nums font-bold ${h.rating_delta >= 0 ? 'text-[#8ee6a8]' : 'text-[#ffb4a2]'}`}>{h.rating_delta >= 0 ? '+' : ''}{h.rating_delta}</span>}
                                {h.reward && <Reward coins={h.reward.coins} nuggets={h.reward.nuggets} sign />}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
