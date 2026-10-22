import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, Clock, Compass, Crosshair, LocateFixed, MapPin, Sparkles, X } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { api, useGame } from '../api.jsx';
import { Card } from '../components/Card.jsx';
import { RARITIES, TYPES } from '../game.jsx';

maplibregl.setWorkerUrl(workerUrl);

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const REFRESH_MOVE = 25; // m walked before asking the server again
const REFRESH_MS = 60_000;

// Mini-game: a ring shrinks around the card, throw when it is inside the target band.
// Rarer cards: faster ring, thinner band.
const GAME = {
    common: { period: 1700, width: 0.26 },
    uncommon: { period: 1500, width: 0.22 },
    rare: { period: 1300, width: 0.18 },
    epic: { period: 1100, width: 0.15 },
    legendary: { period: 950, width: 0.12 },
};
const TARGET = 0.42; // band centre, as a share of the start radius

const HABITAT_TIP = {
    forest: 'Forêt : les cartes rares sortent bien plus souvent ici.',
    wetland: 'Zone humide : un des meilleurs coins pour les cartes rares.',
    mangrove: 'Mangrove : un des meilleurs coins pour les cartes rares.',
    tundra: 'Lande sauvage : beaucoup de cartes rares.',
    scrub: 'Broussailles : bon coin pour les cartes rares.',
    water: 'Au bord de l\'eau : poissons, oiseaux d\'eau, algues…',
    snow: 'Haute montagne : cartes rares fréquentes.',
    rock: 'Rochers et montagne : cartes rares assez fréquentes.',
    meadow: 'Prairie : quelques cartes rares. La forêt fait encore mieux !',
    fields: 'Champs : surtout des cartes communes. Va vers les bois pour du rare !',
    city: 'En ville : surtout des cartes communes. Les parcs et les bois cachent les raretés !',
};

function metres(aLat, aLon, bLat, bLon) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function minutesLeft(iso) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

function circle(lat, lon, radius) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * 2 * Math.PI;
        pts.push([lon + (radius / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (radius / 111_320) * Math.sin(a)]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } };
}

function markerEl(spawn, onClick) {
    const r = RARITIES[spawn.card.rarity] || RARITIES.common;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `nd-spawn nd-spawn-${spawn.card.rarity} ${spawn.state !== 'wild' ? 'is-done' : ''}`;
    el.style.setProperty('--ring', r.color);
    el.setAttribute('aria-label', `${spawn.card.name}, ${r.label}`);
    el.innerHTML = `<img src="${spawn.card.thumb_url}" alt="" loading="lazy" />${spawn.state === 'caught' ? '<span class="nd-spawn-tag">✓</span>' : !spawn.owned && spawn.state === 'wild' ? '<span class="nd-spawn-tag">!</span>' : ''}`;
    el.addEventListener('click', (e) => { e.stopPropagation(); onClick(spawn.id); });
    return el;
}

export default function Exploration() {
    const { setUser, addCards } = useGame();
    const [started, setStarted] = useState(false);
    const [geoError, setGeoError] = useState('');
    const [pos, setPos] = useState(null);
    const [data, setData] = useState(null);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState('');
    const [, tick] = useState(0);
    const mapDiv = useRef(null);
    const map = useRef(null);
    const markers = useRef(new Map());
    const last = useRef(null); // { lat, lon, at } of the last server refresh
    const posRef = useRef(null);

    // GPS
    useEffect(() => {
        if (!started) return;
        if (!navigator.geolocation) { setGeoError("Ton appareil ne donne pas sa position : l'exploration a besoin du GPS."); return; }
        const id = navigator.geolocation.watchPosition(
            (p) => { setGeoError(''); setPos({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }); },
            (e) => setGeoError(e.code === 1
                ? "Position refusée. Autorise la localisation pour ce site dans les réglages de ton navigateur, puis réessaie."
                : 'Position introuvable pour le moment. Sors à découvert ou réessaie dans un instant.'),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        );
        return () => navigator.geolocation.clearWatch(id);
    }, [started]);
    useEffect(() => { posRef.current = pos; }, [pos]);

    const refresh = useCallback(async () => {
        const p = posRef.current;
        if (!p) return;
        last.current = { lat: p.lat, lon: p.lon, at: Date.now() };
        try {
            setData(await api('exploreNearby', { lat: p.lat, lon: p.lon }));
            setError('');
        } catch (e) { setError(e.message); }
    }, []);

    // ask the server again after a walk, every minute, and when the cards change (every 30 min)
    useEffect(() => {
        if (!pos) return;
        const l = last.current;
        if (!l || metres(l.lat, l.lon, pos.lat, pos.lon) > REFRESH_MOVE) refresh();
    }, [pos, refresh]);
    useEffect(() => {
        if (!started) return;
        const t = setInterval(() => {
            tick((n) => n + 1);
            const l = last.current;
            if (document.visibilityState === 'visible' && l && (Date.now() - l.at > REFRESH_MS || (data && Date.now() > new Date(data.endsAt).getTime() + 3000))) refresh();
        }, 5000);
        return () => clearInterval(t);
    }, [started, data, refresh]);

    // map
    useEffect(() => {
        if (!pos || map.current || !mapDiv.current) return;
        const m = new maplibregl.Map({
            container: mapDiv.current, style: STYLE, center: [pos.lon, pos.lat], zoom: 16.3, pitch: 45,
            attributionControl: { compact: true }, dragRotate: true,
        });
        m.on('load', () => {
            m.addSource('me', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addLayer({ id: 'me-reach', type: 'fill', source: 'me', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#7dffb0', 'fill-opacity': 0.12 } });
            m.addLayer({ id: 'me-reach-line', type: 'line', source: 'me', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': '#1f9d63', 'line-width': 1.5, 'line-dasharray': [2, 2] } });
            m.addLayer({ id: 'me-dot', type: 'circle', source: 'me', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 8, 'circle-color': '#2563eb', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
            m.loaded_ = true;
            m.getContainer().querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
            setPos((p) => ({ ...p })); // draw the player now
        });
        map.current = m;
    }, [pos]);
    useEffect(() => () => { map.current?.remove(); map.current = null; markers.current.clear(); }, []);

    const radius = data?.catchRadius || 50;
    useEffect(() => {
        const m = map.current;
        if (!m || !pos || !m.loaded_) return;
        m.getSource('me')?.setData({
            type: 'FeatureCollection',
            features: [circle(pos.lat, pos.lon, radius), { type: 'Feature', geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] } }],
        });
    }, [pos, radius]);

    const recenter = () => pos && map.current?.easeTo({ center: [pos.lon, pos.lat], zoom: 16.3 });

    useEffect(() => {
        const m = map.current;
        if (!m || !data) return;
        const keep = new Set();
        for (const s of data.spawns) {
            const key = `${s.id}:${s.state}`;
            keep.add(key);
            if (!markers.current.has(key)) {
                markers.current.set(key, new maplibregl.Marker({ element: markerEl(s, setSelected) }).setLngLat([s.lon, s.lat]).addTo(m));
            }
        }
        for (const [key, mk] of markers.current) if (!keep.has(key)) { mk.remove(); markers.current.delete(key); }
    }, [data]);

    const spawn = data?.spawns.find((s) => s.id === selected);
    const dist = spawn && pos ? Math.round(metres(pos.lat, pos.lon, spawn.lat, spawn.lon)) : null;

    const onCaught = (res) => {
        setUser(res.user);
        if (res.caught) addCards([res.card]);
        setData((d) => d && {
            ...d, daily: res.daily,
            spawns: d.spawns.map((s) => s.id === spawn.id ? { ...s, tries: res.tries, state: res.caught ? 'caught' : res.fled ? 'fled' : 'wild', owned: s.owned || res.caught } : s),
        });
    };

    if (!started) return <Intro onStart={() => setStarted(true)} />;

    return (
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white mr-auto">Exploration</h1>
                {data && (
                    <>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.07] text-white/80">
                            <Check className="w-4 h-4 text-[#7dffb0]" /><b className="text-white">{data.daily.caught}/{data.daily.max}</b> aujourd'hui
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.07] text-white/80">
                            <Clock className="w-4 h-4" />Nouvelles cartes dans {minutesLeft(data.endsAt)} min
                        </span>
                    </>
                )}
            </div>
            {data?.habitat && (
                <p className="mt-2 flex items-center gap-2 text-sm text-white/75">
                    <Compass className="w-4 h-4 shrink-0 text-[#7dffb0]" />
                    <span>{HABITAT_TIP[data.habitat.key]}</span>
                </p>
            )}

            <div className="relative mt-3 h-[68vh] min-h-[380px] rounded-3xl overflow-hidden border border-white/10 bg-[#0e2a1d]">
                <div ref={mapDiv} className="w-full h-full" />
                {!pos && (
                    <div className="absolute inset-0 grid place-items-center p-6 text-center">
                        {geoError
                            ? <p className="max-w-sm text-[#ffb4a2] font-semibold">{geoError}</p>
                            : <p className="text-white/75 inline-flex items-center gap-2"><LocateFixed className="w-5 h-5 animate-pulse" />Recherche de ta position…</p>}
                    </div>
                )}
                {pos && (
                    <button onClick={recenter} aria-label="Recentrer sur moi" className="absolute right-3 top-3 w-10 h-10 grid place-items-center rounded-full bg-[#0b1f16]/85 text-white border border-white/15">
                        <Crosshair className="w-5 h-5" />
                    </button>
                )}
                {pos && pos.accuracy > 60 && (
                    <p className="absolute left-3 top-3 right-16 px-3 py-2 rounded-2xl bg-[#0b1f16]/85 text-xs text-[#ffe4a3]">
                        GPS imprécis (± {Math.round(pos.accuracy)} m). Active la localisation précise ou sors à découvert.
                    </p>
                )}
                {data?.cooldownUntil && (
                    <p className="absolute left-3 bottom-3 right-3 px-3 py-2 rounded-2xl bg-[#0b1f16]/90 text-sm text-[#ffb4a2] font-semibold">
                        Déplacement trop rapide détecté : la capture reprend à {new Date(data.cooldownUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
                    </p>
                )}
                {data && !data.spawns.length && (
                    <p className="absolute left-3 bottom-3 right-3 px-3 py-2 rounded-2xl bg-[#0b1f16]/85 text-sm text-white/80">
                        Aucune carte autour de toi pour le moment. Marche un peu, ou attends les prochaines apparitions.
                    </p>
                )}
                <AnimatePresence>
                    {spawn && (
                        <SpawnSheet key={spawn.id} spawn={spawn} dist={dist} radius={radius} data={data} onClose={() => setSelected(null)} pos={pos} onCaught={onCaught} />
                    )}
                </AnimatePresence>
            </div>
            {error && <p className="mt-3 text-center text-[#ffb4a2] font-semibold">{error}</p>}
            <p className="mt-3 flex items-start gap-2 text-xs text-white/55">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Reste attentif à ce qui t'entoure : ne joue pas en marchant au bord d'une route, reste sur les chemins et respecte la nature et les propriétés privées. Seule ta dernière position est utilisée pour le jeu, jamais ton trajet.</span>
            </p>
        </div>
    );
}

function Intro({ onStart }) {
    return (
        <div className="max-w-3xl mx-auto px-4 py-10 text-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-[#7dffb0] to-[#6ec8ff] text-[#05261a] text-xs font-black uppercase tracking-wider">
                <Compass className="w-3.5 h-3.5" />Nouveau
            </span>
            <h1 className="mt-4 font-display text-4xl sm:text-5xl font-semibold text-white">Exploration</h1>
            <p className="mt-3 max-w-xl mx-auto text-white/75">
                Des cartes NatureDex apparaissent autour de toi, dans le vrai monde. Marche jusqu'à elles et attrape-les : elles rejoignent ta collection.
            </p>
            <ul className="mt-6 grid sm:grid-cols-3 gap-2 text-left text-sm text-white/70">
                <li className="p-4 rounded-2xl bg-white/[0.05]"><b className="block text-white mb-1">De vraies espèces</b>Seules apparaissent les espèces réellement observées près de chez toi.</li>
                <li className="p-4 rounded-2xl bg-white/[0.05]"><b className="block text-white mb-1">Plus c'est sauvage, plus c'est rare</b>Forêts, marais et montagnes cachent bien plus de cartes rares, épiques et légendaires que la ville.</li>
                <li className="p-4 rounded-2xl bg-white/[0.05]"><b className="block text-white mb-1">Nouvelles cartes toutes les 30 min</b>Les mêmes pour tous les joueurs, jusqu'à 10 captures par jour.</li>
            </ul>
            <button onClick={onStart} className="mt-8 nd-btn inline-flex items-center gap-3 px-8 py-4 rounded-full text-lg font-bold">
                <MapPin className="w-6 h-6" />Partir en exploration
            </button>
            <p className="mt-4 text-xs text-white/55 max-w-md mx-auto">
                Ta position est demandée pour placer les cartes autour de toi. Seule ta dernière position est gardée (contre la triche), jamais ton trajet.
            </p>
        </div>
    );
}

function SpawnSheet({ spawn, dist, radius, data, pos, onClose, onCaught }) {
    const r = RARITIES[spawn.card.rarity] || RARITIES.common;
    const t = TYPES[spawn.card.type] || TYPES.plant;
    const [playing, setPlaying] = useState(false);
    const inReach = dist != null && dist <= radius;
    const capped = data.daily.caught >= data.daily.max;
    return (
        <>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                className="absolute left-2 right-2 bottom-2 sm:left-auto sm:w-96 p-4 rounded-3xl bg-[#0b1f16]/95 border border-white/15 shadow-2xl">
                <button onClick={onClose} aria-label="Fermer" className="absolute right-3 top-3 text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
                <div className="flex items-center gap-3 pr-6">
                    <img src={spawn.card.thumb_url} alt="" className="w-16 h-16 rounded-2xl object-cover border-2" style={{ borderColor: r.color }} />
                    <div className="min-w-0">
                        <b className="block text-white truncate">{spawn.card.name}</b>
                        <i className="block text-xs text-white/60 truncate">{spawn.card.sci_name}</i>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-semibold">
                            <span style={{ color: r.color }}>{r.symbol} {r.label}</span>
                            <span style={{ color: t.color }}>{t.label}</span>
                            {!spawn.owned && spawn.state === 'wild' && <span className="text-[#ffd36e]">Nouvelle pour toi !</span>}
                        </span>
                    </div>
                </div>
                <div className="mt-3">
                    {spawn.state === 'caught' ? (
                        <p className="text-center text-[#7dffb0] font-semibold">Attrapée ! <Link to={`/carte/${spawn.card.id}`} className="underline">Voir la fiche</Link></p>
                    ) : spawn.state === 'fled' ? (
                        <p className="text-center text-white/60">Elle s'est enfuie… D'autres cartes arrivent bientôt.</p>
                    ) : capped ? (
                        <p className="text-center text-white/70">Tu as attrapé {data.daily.max} cartes aujourd'hui : la nature se repose, reviens demain !</p>
                    ) : inReach ? (
                        <button onClick={() => setPlaying(true)} disabled={!!data.cooldownUntil} className="w-full nd-btn inline-flex justify-center items-center gap-2 px-6 py-3 rounded-full font-bold disabled:opacity-50">
                            <Sparkles className="w-5 h-5" />Attraper{spawn.tries ? ` (essai ${spawn.tries + 1}/${data.maxTries})` : ''}
                        </button>
                    ) : (
                        <p className="text-center text-white/75">
                            <MapPin className="inline w-4 h-4 mr-1 -mt-0.5" />À {dist ?? '…'} m · approche-toi à moins de {radius} m pour l'attraper
                        </p>
                    )}
                </div>
            </motion.div>
            {playing && createPortal(
                <CatchGame spawn={spawn} maxTries={data.maxTries} pos={pos} onDone={() => setPlaying(false)} onResult={onCaught} />,
                document.body,
            )}
        </>
    );
}

function CatchGame({ spawn, maxTries, pos, onDone, onResult }) {
    const game = GAME[spawn.card.rarity] || GAME.common;
    const r = RARITIES[spawn.card.rarity] || RARITIES.common;
    const ring = useRef(null);
    const start = useRef(performance.now());
    const [phase, setPhase] = useState('aim'); // aim | sending | escaped | caught | fled
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [tries, setTries] = useState(spawn.tries);
    const scale = () => 1 - (((performance.now() - start.current) % game.period) / game.period);

    useEffect(() => {
        if (phase !== 'aim') return;
        let raf;
        const loop = () => {
            const s = scale();
            if (ring.current) {
                ring.current.style.transform = `scale(${s})`;
                ring.current.style.borderColor = Math.abs(s - TARGET) <= game.width / 2 ? '#7dffb0' : '#ffffff';
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

    const throwIt = async () => {
        if (phase !== 'aim') return;
        const off = Math.abs(scale() - TARGET);
        const quality = off <= game.width / 6 ? 'perfect' : off <= game.width / 2 ? 'good' : 'miss';
        setPhase('sending');
        try {
            const res = await api('exploreCatch', { spawn: spawn.id, lat: pos.lat, lon: pos.lon, throw: quality });
            onResult(res);
            setTries(res.tries);
            setResult({ ...res, quality });
            setPhase(res.caught ? 'caught' : res.fled ? 'fled' : 'escaped');
        } catch (e) {
            setError(e.message);
            setPhase('error');
        }
    };

    const again = () => { start.current = performance.now(); setPhase('aim'); };
    const label = { perfect: 'Lancer parfait !', good: 'Joli lancer !', miss: 'Raté, le cercle n\'était pas dans la zone verte.' };

    return (
        <div className="fixed inset-0 z-[80] bg-[#04120b]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <button onClick={onDone} aria-label="Fermer" className="absolute right-4 top-4 text-white/70 hover:text-white"><X className="w-7 h-7" /></button>
            {phase === 'caught' ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="font-display text-3xl text-white">{result.isNew ? 'Nouvelle carte !' : 'Attrapée !'}</p>
                    <motion.div className="w-64 mx-auto mt-5" initial={{ rotateY: 180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 120, damping: 14 }} style={{ transformPerspective: 900 }}>
                        <Card card={result.card} />
                    </motion.div>
                    <p className="mt-4 text-white/75 text-sm">{result.isNew ? 'Elle rejoint ta collection.' : 'Un exemplaire de plus dans ta collection.'} {label[result.quality]}</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                        <button onClick={onDone} className="nd-btn px-6 py-3 rounded-full font-bold">Continuer l'exploration</button>
                        <Link to={`/carte/${result.card.id}`} className="px-6 py-3 rounded-full border border-white/15 text-white font-semibold hover:bg-white/10">Voir la fiche</Link>
                    </div>
                </motion.div>
            ) : (
                <>
                    <p className="font-display text-2xl text-white">{spawn.card.name}</p>
                    <p className="text-sm font-semibold" style={{ color: r.color }}>{r.symbol} {r.label}</p>
                    <button onClick={phase === 'aim' ? throwIt : undefined} aria-label="Lancer"
                        className="relative mt-6 w-72 h-72 max-w-[80vw] max-h-[80vw] rounded-full grid place-items-center select-none touch-manipulation">
                        <span className="absolute inset-0 rounded-full border border-white/10" />
                        <span className="absolute rounded-full bg-[#7dffb0]/30" style={{ inset: `${(1 - TARGET - game.width / 2) * 50}%` }} />
                        <span className="absolute rounded-full bg-[#04120b]" style={{ inset: `${(1 - TARGET + game.width / 2) * 50}%` }} />
                        <img src={spawn.card.thumb_url} alt="" className="relative w-20 h-20 rounded-full object-cover border-4 shadow-xl" style={{ borderColor: r.color }} />
                        {phase === 'aim' && <span ref={ring} className="absolute inset-0 rounded-full border-4 border-white pointer-events-none" />}
                    </button>
                    <div className="mt-6 min-h-[5rem]">
                        {phase === 'aim' && <p className="text-white/80">Touche le cercle quand l'anneau blanc passe dans la <b className="text-[#7dffb0]">zone verte</b>.<br /><span className="text-xs text-white/55">Essai {tries + 1}/{maxTries}</span></p>}
                        {phase === 'sending' && <p className="text-white/80">…</p>}
                        {phase === 'escaped' && (
                            <>
                                <p className="text-[#ffd36e] font-semibold">{result.quality === 'miss' ? label.miss : `${label[result.quality]} Mais la carte s'est échappée !`}</p>
                                <button onClick={again} className="mt-3 nd-btn px-6 py-3 rounded-full font-bold">Réessayer ({tries + 1}/{maxTries})</button>
                            </>
                        )}
                        {phase === 'fled' && (
                            <>
                                <p className="text-[#ffb4a2] font-semibold">La carte s'est enfuie… D'autres arrivent bientôt.</p>
                                <button onClick={onDone} className="mt-3 px-6 py-3 rounded-full border border-white/15 text-white font-semibold">Retour à la carte</button>
                            </>
                        )}
                        {phase === 'error' && (
                            <>
                                <p className="text-[#ffb4a2] font-semibold">{error}</p>
                                <button onClick={onDone} className="mt-3 px-6 py-3 rounded-full border border-white/15 text-white font-semibold">Retour à la carte</button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
