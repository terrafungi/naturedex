import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Camera, Check, Flag, Layers, MapPin, RefreshCw, Sparkles, Trash2, Users, X } from 'lucide-react';
import { api, useGame } from '../api.jsx';
import { Card, FieldCard } from '../components/Card.jsx';
import { Amount } from '../components/Currency.jsx';
import { RARITIES } from '../game.jsx';

const PHOTO_SIZE = 1600;
const THUMB_SIZE = 560;
const GEO_KEY = 'naturdex.terrainGeo';
// When the phone does not zoom itself, the photo is cropped in the middle of the frame.
const DIGITAL_ZOOM_MAX = 4;
const HARDWARE_ZOOM_MAX = 10;
const ZOOM_STOPS = [0.5, 1, 2, 3, 5, 10];
const zoomLabel = (z) => `${z.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}×`;

/** Resized JPEG (base64, no prefix) of a bitmap, longest side ≤ max. */
function jpeg(bitmap, max, quality) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

/** 64-bit difference hash: spots the same picture re-encoded or resized. */
function dhash(bitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = 9; canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, 9, 8);
    const px = ctx.getImageData(0, 0, 9, 8).data;
    const grey = (x, y) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
    let hex = '';
    for (let y = 0; y < 8; y++) {
        let byte = 0;
        for (let x = 0; x < 8; x++) byte = (byte << 1) | (grey(x, y) > grey(x + 1, y) ? 1 : 0);
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

function position() {
    if (!navigator.geolocation || localStorage.getItem(GEO_KEY) === 'off') return Promise.resolve(null);
    return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, maximumAge: 10 * 60_000, enableHighAccuracy: false },
    ));
}

export default function Terrain() {
    const { setUser } = useGame();
    const [daily, setDaily] = useState(null);
    const [step, setStep] = useState('idle'); // idle | analysing | rejected | choose | confirming | reveal
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [geo, setGeo] = useState(() => localStorage.getItem(GEO_KEY) !== 'off');
    const [tab, setTab] = useState('mine');
    const [journal, setJournal] = useState(null);
    const [feed, setFeed] = useState(null);
    const [open, setOpen] = useState(null);
    const [camera, setCamera] = useState(false);

    const loadJournal = () => api('fieldJournal').then((r) => { setJournal(r.cards); setDaily(r.daily); }).catch((e) => setError(e.message));
    useEffect(() => { loadJournal(); }, []);
    useEffect(() => { if (tab === 'feed' && !feed) api('fieldFeed').then(setFeed).catch((e) => setError(e.message)); }, [tab, feed]);

    function toggleGeo() {
        localStorage.setItem(GEO_KEY, geo ? 'off' : 'on');
        setGeo(!geo);
    }

    // A frame of the live camera (never a file: gallery and computer uploads are not allowed).
    async function onCapture(frame, token) {
        setCamera(false);
        setError(''); setResult(null);
        setPreview(frame.toDataURL('image/jpeg', 0.8));
        setStep('analysing');
        try {
            const where = await position();
            const body = { photo: jpeg(frame, PHOTO_SIZE, 0.85), thumb: jpeg(frame, THUMB_SIZE, 0.8), dhash: dhash(frame), camera: token, ...(where || {}) };
            const res = await api('fieldIdentify', body);
            setDaily(res.daily);
            setResult(res);
            setStep(res.rejected ? 'rejected' : 'choose');
        } catch (err) {
            setError(err.status === 413 ? 'Photo trop lourde, réessaie.' : err.message);
            setStep('idle');
        }
    }

    async function confirm(cardId) {
        setStep('confirming');
        try {
            const res = await api('fieldConfirm', { id: result.observation.id, cardId });
            setUser(res.user);
            setDaily(res.daily);
            setResult({ ...result, confirmed: res });
            setStep('reveal');
            setJournal((j) => [res.fieldCard, ...(j || []).filter((o) => o.card.id !== res.fieldCard.card.id)]);
            setFeed(null);
        } catch (err) {
            setError(err.message);
            setStep('choose');
        }
    }

    function reset() {
        if (step === 'choose') api('fieldDismiss', { id: result.observation.id }).catch(() => {});
        setStep('idle'); setResult(null); setPreview(null);
    }

    const busy = step === 'analysing' || step === 'confirming';
    const shot = () => { setError(''); setCamera(true); };

    return (
        <div className="max-w-5xl mx-auto px-4 py-10">
            <div className="text-center">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-[#7dffb0] to-[#6ec8ff] text-[#05261a] text-xs font-black uppercase tracking-wider">
                    <Camera className="w-3.5 h-3.5" />Nouveau
                </span>
                <h1 className="mt-4 font-display text-4xl sm:text-5xl font-semibold text-white">Sur le terrain</h1>
                <p className="mt-3 max-w-xl mx-auto text-white/75">
                    Photographie une vraie plante, un animal ou un champignon. L'IA reconnaît l'espèce, et ta photo devient une <b className="text-white">carte de terrain unique</b>, signée de ton pseudo.
                </p>
            </div>

            {camera && <LiveCamera onCapture={onCapture} onClose={() => setCamera(false)} />}

            <div className="mt-8 max-w-xl mx-auto p-5 sm:p-6 rounded-3xl nd-glass">
                <AnimatePresence mode="wait">
                    {step === 'idle' && (
                        <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
                            <button onClick={shot} disabled={daily && !daily.attemptsLeft}
                                className="nd-btn inline-flex items-center gap-3 px-8 py-4 rounded-full text-lg font-bold disabled:opacity-50">
                                <Camera className="w-6 h-6" />Prendre une photo
                            </button>
                            <p className="mt-2 text-xs text-white/55">En direct avec l'appareil photo uniquement : pas d'import depuis la galerie ou l'ordinateur.</p>
                            {daily && (
                                <p className="mt-4 text-sm text-white/70">
                                    {daily.rewardsLeft > 0
                                        ? <>Encore <b className="text-white">{daily.rewardsLeft}/{daily.dailyRewards}</b> observations récompensées aujourd'hui</>
                                        : <>Récompenses du jour épuisées : tes nouvelles photos rejoignent quand même ton carnet.</>}
                                    {!daily.attemptsLeft && <><br /><span className="text-[#ffb4a2]">Plus d'identification possible aujourd'hui, reviens demain !</span></>}
                                </p>
                            )}
                            <ul className="mt-5 grid sm:grid-cols-3 gap-2 text-left text-xs text-white/70">
                                <li className="p-3 rounded-2xl bg-white/[0.04]"><b className="block text-white">De 30 à 150 graines</b>selon la rareté, que tu aies déjà la carte ou non.</li>
                                <li className="p-3 rounded-2xl bg-white/[0.04]"><b className="block text-white">+50 graines</b>si tu es le premier joueur à observer l'espèce.</li>
                                <li className="p-3 rounded-2xl bg-white/[0.04]"><b className="block text-white">Zoo, aquarium, serre</b>acceptés, à moitié prix, avec la mention « en captivité ».</li>
                            </ul>
                            <button onClick={toggleGeo} className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
                                <MapPin className="w-3.5 h-3.5" />{geo ? 'Région ajoutée à tes cartes (jamais ta position exacte) · désactiver' : 'Sans localisation · ajouter la région'}
                            </button>
                        </motion.div>
                    )}

                    {(step === 'analysing' || step === 'rejected' || step === 'choose' || step === 'confirming') && (
                        <motion.div key="work" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <div className="relative mx-auto w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden bg-black/40">
                                {preview && <img src={preview} alt="" className="w-full h-full object-cover" />}
                                {step === 'analysing' && (
                                    <>
                                        <motion.div className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-[#7dffb0]/40 to-transparent"
                                            initial={{ top: '-33%' }} animate={{ top: '100%' }} transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }} />
                                        <div className="absolute inset-x-0 bottom-0 p-3 bg-black/60 text-center text-sm font-semibold text-white">Identification en cours…</div>
                                    </>
                                )}
                            </div>

                            {step === 'rejected' && (
                                <div className="mt-5 text-center">
                                    <p className="text-[#ffb4a2] font-semibold">{result.reason}</p>
                                    <button onClick={() => { reset(); shot(); }} className="mt-4 nd-btn inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold">
                                        <Camera className="w-5 h-5" />Nouvelle photo
                                    </button>
                                </div>
                            )}

                            {(step === 'choose' || step === 'confirming') && (
                                <div className="mt-5">
                                    <p className="text-sm text-white/75 text-center">{result.observation.reason}</p>
                                    {result.observation.captive && <p className="mt-1 text-xs text-[#ffd36e] text-center">Animal ou plante en captivité : récompense divisée par deux.</p>}
                                    <h2 className="mt-4 font-display text-xl text-white text-center">Quelle espèce as-tu photographiée ?</h2>
                                    <p className="mt-2 flex items-start gap-2 p-3 rounded-2xl bg-[#ffd36e]/10 border border-[#ffd36e]/25 text-xs text-[#ffe4a3]">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                                        <span>L'IA peut se tromper, surtout entre espèces qui se ressemblent. Compare avec la photo de la carte avant de valider, et choisis « Aucune de ces espèces » en cas de doute.</span>
                                    </p>
                                    <div className="mt-3 space-y-2">
                                        {result.observation.candidates.map(({ card, confidence, hasField }) => {
                                            const r = RARITIES[card.rarity] || RARITIES.common;
                                            return (
                                                <button key={card.id} disabled={busy} onClick={() => confirm(card.id)}
                                                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.05] border border-white/10 hover:bg-white/10 text-left disabled:opacity-60">
                                                    <img src={card.thumb_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                                                    <span className="min-w-0 flex-1">
                                                        <b className="block text-white truncate">{card.name}</b>
                                                        <i className="block text-xs text-white/60 truncate">{card.sci_name}</i>
                                                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-semibold">
                                                            <span style={{ color: r.color }}>{r.symbol} {r.label}</span>
                                                            {hasField && <span className="text-white/60">Remplace ta photo</span>}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 text-right">
                                                        <span className="block text-xs text-white/60">{Math.round(confidence * 100)} %</span>
                                                        <Check className="w-5 h-5 text-[#7dffb0] ml-auto" />
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button onClick={reset} disabled={busy} className="mt-3 w-full text-center text-sm text-white/60 hover:text-white">
                                        Aucune de ces espèces
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {step === 'reveal' && (
                        <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                            <motion.div className="w-64 mx-auto" initial={{ rotateY: 180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }}
                                transition={{ type: 'spring', stiffness: 120, damping: 14 }} style={{ transformPerspective: 900 }}>
                                <FieldCard obs={result.confirmed.fieldCard} />
                            </motion.div>
                            <Rewards res={result.confirmed} />
                            <div className="mt-5 flex flex-wrap justify-center gap-3">
                                <button onClick={() => { reset(); shot(); }} className="nd-btn inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold">
                                    <Camera className="w-5 h-5" />Encore une
                                </button>
                                <Link to={`/carte/${result.confirmed.fieldCard.card.id}`} className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/15 text-white font-semibold hover:bg-white/10">
                                    Voir la fiche
                                </Link>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                {error && <p className="mt-4 text-center text-[#ffb4a2] font-semibold">{error}</p>}
            </div>

            <div className="mt-12 flex justify-center gap-2">
                {[['mine', 'Mon carnet', Layers], ['feed', 'Communauté', Users]].map(([k, label, Icon]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${tab === k ? 'bg-white text-[#0b2a1b]' : 'text-white/75 hover:bg-white/10'}`}>
                        <Icon className="w-4 h-4" />{label}{k === 'mine' && journal ? ` (${journal.length})` : ''}
                    </button>
                ))}
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/50 text-center">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />Identifications faites par une IA : elles peuvent contenir des erreurs.
            </p>
            {tab === 'feed' && feed?.stats && (
                <p className="mt-3 text-center text-sm text-white/60">{feed.stats.total} observations · {feed.stats.species} espèces · {feed.stats.players} naturalistes</p>
            )}
            <FieldGrid cards={tab === 'mine' ? journal : feed?.cards} onOpen={setOpen}
                empty={tab === 'mine' ? 'Ton carnet est vide : sors photographier ta première espèce !' : 'Aucune observation pour le moment.'} />
            <FieldViewer obs={open} onClose={() => setOpen(null)}
                onDeleted={(id) => { setJournal((j) => j?.filter((o) => o.id !== id)); setFeed(null); setOpen(null); }} />
        </div>
    );
}

/** Full-screen live viewfinder: the only way to take a field photo. */
function LiveCamera({ onCapture, onClose }) {
    const video = useRef(null);
    const [facing, setFacing] = useState('environment');
    const [token, setToken] = useState(null);
    const [ready, setReady] = useState(false);
    const [flash, setFlash] = useState(false);
    const [error, setError] = useState('');
    const track = useRef(null);
    // hw: the camera zooms itself (sharper, may switch to the telephoto lens); otherwise digital crop
    const [zoomRange, setZoomRange] = useState(null);
    const [zoom, setZoom] = useState(1);
    const pinch = useRef(null);
    const pendingZoom = useRef(null);

    useEffect(() => { api('fieldCamera').then((r) => setToken(r.token)).catch((e) => setError(e.message)); }, []);

    useEffect(() => {
        let stream, cancelled = false;
        setReady(false);
        setZoomRange(null);
        setZoom(1);
        track.current = null;
        if (!navigator.mediaDevices?.getUserMedia) {
            setError("Ton navigateur ne donne pas accès à l'appareil photo. Ouvre NatureDex sur ton téléphone, dans Chrome ou Safari.");
            return undefined;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
            .then((s) => {
                if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
                stream = s;
                const t = s.getVideoTracks()[0];
                track.current = t;
                const caps = t.getCapabilities?.() || {};
                if (caps.zoom && caps.zoom.max > caps.zoom.min) {
                    setZoomRange({ min: caps.zoom.min, max: Math.min(caps.zoom.max, HARDWARE_ZOOM_MAX), hw: true });
                    setZoom(t.getSettings?.().zoom || Math.max(1, caps.zoom.min));
                } else {
                    setZoomRange({ min: 1, max: DIGITAL_ZOOM_MAX, hw: false });
                }
                video.current.srcObject = s;
                video.current.play().catch(() => {});
            })
            .catch((e) => setError(e.name === 'NotAllowedError'
                ? "Accès à l'appareil photo refusé. Autorise la caméra pour naturedex.fr dans les réglages de ton navigateur, puis réessaie."
                : e.name === 'NotFoundError' || e.name === 'OverconstrainedError'
                    ? "Aucun appareil photo trouvé. Le mode terrain se joue avec l'appareil photo de ton téléphone."
                    : "Impossible d'ouvrir l'appareil photo."));
        return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
    }, [facing]);

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
    }, [onClose]);

    function applyZoom(value) {
        if (!zoomRange) return;
        const z = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
        setZoom(z);
        if (!zoomRange.hw) return;
        // one camera update per frame while pinching
        if (pendingZoom.current == null) requestAnimationFrame(() => {
            const next = pendingZoom.current;
            pendingZoom.current = null;
            track.current?.applyConstraints({ advanced: [{ zoom: next }] }).catch(() => {});
        });
        pendingZoom.current = z;
    }

    const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    function onTouchStart(e) {
        if (e.touches.length === 2) pinch.current = { d: distance(e.touches), zoom };
    }
    function onTouchMove(e) {
        if (e.touches.length === 2 && pinch.current) applyZoom(pinch.current.zoom * (distance(e.touches) / pinch.current.d));
    }

    function capture() {
        const v = video.current;
        if (!ready || !token || !v.videoWidth) return;
        // digital zoom: keep the middle of the frame, as shown on screen
        const crop = zoomRange && !zoomRange.hw ? zoom : 1;
        const w = Math.round(v.videoWidth / crop), h = Math.round(v.videoHeight / crop);
        const frame = document.createElement('canvas');
        frame.width = w; frame.height = h;
        frame.getContext('2d').drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, w, h);
        setFlash(true);
        setTimeout(() => onCapture(frame, token), 120);
    }

    const digital = zoomRange && !zoomRange.hw ? zoom : 1;
    const stops = zoomRange ? ZOOM_STOPS.filter((z) => z >= zoomRange.min - 0.01 && z <= zoomRange.max + 0.01) : [];

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden touch-none"
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { pinch.current = null; }}>
            <video ref={video} playsInline muted autoPlay onLoadedData={() => setReady(true)}
                style={{ transform: `scale(${(facing === 'user' ? -1 : 1) * digital}, ${digital})` }}
                className="flex-1 min-h-0 w-full object-cover" />
            {flash && <div className="absolute inset-0 bg-white animate-pulse" />}
            <button onClick={onClose} aria-label="Fermer l'appareil photo"
                className="absolute top-4 right-4 w-11 h-11 grid place-items-center rounded-full bg-black/50 text-white" style={{ marginTop: 'env(safe-area-inset-top)' }}>
                <X className="w-6 h-6" />
            </button>
            {error ? (
                <div className="absolute inset-0 grid place-items-center p-6">
                    <div className="max-w-sm p-5 rounded-3xl bg-[#0b1f16] border border-white/10 text-center">
                        <Camera className="w-8 h-8 mx-auto text-[#ffb4a2]" />
                        <p className="mt-3 text-white/85">{error}</p>
                        <button onClick={onClose} className="mt-4 nd-btn px-6 py-2.5 rounded-full font-bold">Fermer</button>
                    </div>
                </div>
            ) : (
                <div className="absolute inset-x-0 bottom-0 pt-10 bg-gradient-to-t from-black/75 to-transparent" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
                    {zoomRange && (
                        <div className="mx-auto mb-5 w-full max-w-xs px-6">
                            <div className="flex justify-center gap-2">
                                {stops.map((z) => {
                                    const on = Math.abs(zoom - z) < 0.05;
                                    return (
                                        <button key={z} onClick={() => applyZoom(z)} aria-label={`Zoom ${zoomLabel(z)}`} aria-pressed={on}
                                            className={`min-w-10 h-10 px-2 rounded-full text-sm font-bold transition-colors ${on ? 'bg-[#f4c25b] text-[#2a1c00]' : 'bg-black/55 text-white'}`}>
                                            {on ? zoomLabel(zoom) : zoomLabel(z)}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                                <span className="w-10 text-right text-sm font-bold text-white tabular-nums">{zoomLabel(zoom)}</span>
                                <input type="range" min={zoomRange.min} max={zoomRange.max} step={0.1} value={zoom} onChange={(e) => applyZoom(Number(e.target.value))}
                                    aria-label="Zoom" className="flex-1 accent-[#f4c25b]" />
                            </div>
                        </div>
                    )}
                    <div className="flex items-center justify-center gap-10">
                        <span className="w-12" />
                        <button onClick={capture} disabled={!ready || !token} aria-label="Prendre la photo"
                            className="w-20 h-20 rounded-full border-4 border-white grid place-items-center disabled:opacity-40">
                            <span className="w-16 h-16 rounded-full bg-white active:scale-90 transition-transform" />
                        </button>
                        <button onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label="Changer de caméra"
                            className="w-12 h-12 grid place-items-center rounded-full bg-black/50 text-white">
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}

function Rewards({ res }) {
    return (
        <div className="mt-5 space-y-1.5">
            {res.reward > 0 && <p className="font-display text-2xl text-white"><Amount seeds={res.reward} sign /></p>}
            {res.firstEver && <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#ffd36e]"><Sparkles className="w-4 h-4" />Première observation de cette espèce sur NatureDex !</p>}
            {res.replaced && <p className="text-sm text-white/70">Ta nouvelle photo remplace l'ancienne (pas de nouvelle récompense pour cette espèce).</p>}
            {res.capReached && <p className="text-sm text-white/70">Récompenses du jour épuisées : la carte de terrain est quand même dans ton carnet.</p>}
        </div>
    );
}

export function FieldGrid({ cards, onOpen, empty }) {
    if (!cards) return <p className="mt-8 text-center text-ink-soft">Chargement…</p>;
    if (!cards.length) return <p className="mt-8 text-center text-white/60">{empty}</p>;
    return (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {cards.map((o) => (
                <button key={o.id} onClick={() => onOpen(o)} className="block text-left transition-transform hover:-translate-y-1">
                    <FieldCard obs={o} />
                </button>
            ))}
        </div>
    );
}

/** Large view of a field card, with the regular card, and delete (mine) or report (others). */
export function FieldViewer({ obs, onClose, onDeleted }) {
    const { user } = useGame();
    const [state, setState] = useState('');
    useEffect(() => setState(''), [obs]);
    if (!obs) return null;
    const mine = obs.username === user?.username;

    async function remove() {
        if (!window.confirm('Supprimer cette photo de ton carnet ? Les récompenses déjà reçues sont conservées, mais cette espèce ne sera plus récompensée.')) return;
        await api('fieldDelete', { id: obs.id });
        onDeleted?.(obs.id);
    }
    async function report() {
        await api('fieldReport', { id: obs.id }).then(() => setState('reported')).catch((e) => setState(e.message));
    }

    return createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="relative w-full max-w-3xl max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-0 right-0 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fermer"><X className="w-5 h-5" /></button>
                <div className="grid sm:grid-cols-2 gap-6 items-start pt-10 sm:pt-0">
                    <div className="w-full max-w-[340px] mx-auto"><FieldCard obs={{ ...obs, thumb: obs.photo }} /></div>
                    <div className="text-white">
                        <h2 className="font-display text-3xl font-semibold">{obs.card.name}</h2>
                        <p className="italic text-white/70">{obs.card.sci_name}</p>
                        <p className="mt-3 text-sm text-white/75">
                            Observation n°{obs.number} de l'espèce sur NatureDex, par <Link to={`/joueur/${obs.username}`} className="font-semibold underline">{obs.username}</Link>
                            {obs.region ? `, ${obs.region}` : ''}.
                            {obs.captive && ' Photographiée en captivité.'}
                        </p>
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-white/55">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />Espèce identifiée par une IA et validée par le joueur : une erreur reste possible. Signale la photo si elle est fausse.
                        </p>
                        <div className="mt-4 w-40"><Link to={`/carte/${obs.card.id}`}><Card card={obs.card} number={obs.card.num} /></Link></div>
                        <div className="mt-5 flex flex-wrap gap-3 text-sm">
                            <a href={obs.photo} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-full border border-white/15 hover:bg-white/10">Photo en grand</a>
                            {mine
                                ? <button onClick={remove} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[#ffb4a2] hover:bg-white/10"><Trash2 className="w-4 h-4" />Supprimer</button>
                                : state === 'reported'
                                    ? <span className="px-4 py-2 text-white/60">Merci, signalement envoyé.</span>
                                    : <button onClick={report} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white/60 hover:bg-white/10"><Flag className="w-4 h-4" />Signaler</button>}
                        </div>
                        {state && state !== 'reported' && <p className="mt-2 text-sm text-[#ffb4a2]">{state}</p>}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
