/**
 * NatureDex card game (« Duel ») — a Pokémon-style trading card game engine.
 *
 * Shared by the API (authoritative, holds the hidden deck order) and the site (card texts,
 * attack costs, previews). Every random draw goes through the seeded generator stored in
 * the state, so a saved game always replays the same way.
 *
 * Cards in a deck: creatures (the species cards of the collection), Énergies (one per
 * biome + Universelle) and Naturalistes (Objets, Supporters, Stades, Outils).
 * A turn: draw, attach one Énergie, put creatures on the Banc, play Naturalistes, attack.
 * A knocked-out creature is « capturée »: 1 capture, 2 for a legendary, secret or
 * endangered species. First to CAPTURES_TO_WIN wins, or when the foe has no creature left.
 */
import { battleStats, PROFILES, STRONG } from './battle.mjs';

export const DECK_MIN = 20;
export const DECK_MAX = 40;
export const MAX_COPIES = 2; // of the same species in a deck
export const MAX_ITEM_COPIES = 4; // of the same Énergie / Naturaliste card… except basic Énergies
export const BENCH_SIZE = 3;
export const HAND_START = 5;
export const CAPTURES_TO_WIN = 4;
export const POISON_DAMAGE = 10;
export const MAX_TURNS = 60;

// ---------- biomes and Énergies ----------

export const BIOMES = {
    foret: { name: 'Forêt', color: '#3f9b4f', icon: 'trees' },
    ocean: { name: 'Océan', color: '#2f7fd6', icon: 'waves' },
    montagne: { name: 'Montagne', color: '#8b7d6b', icon: 'mountain' },
    desert: { name: 'Désert', color: '#e0a039', icon: 'sun' },
    prairie: { name: 'Prairie', color: '#9bc53d', icon: 'flower' },
    humide: { name: 'Zone humide', color: '#3fb3a6', icon: 'droplets' },
    ciel: { name: 'Ciel', color: '#8fb8e8', icon: 'cloud' },
};
export const UNIVERSAL = 'universel';
// until the biome check has reached a card, its type gives a sensible default
const TYPE_BIOME = {
    mammal: 'foret', bird: 'foret', reptile: 'desert', fish: 'humide', arthropod: 'prairie', marine: 'ocean',
    terrestrial: 'prairie', aquatic: 'humide', plant: 'prairie', tree: 'foret', alga: 'ocean', fungus: 'foret',
    mold: 'humide', bacteria: 'humide', virus: 'prairie', fossil: 'montagne', mineral: 'montagne',
};
export const cardBiome = (card) => {
    const b = card.stats?.biome ?? card.biome;
    return BIOMES[b] ? b : TYPE_BIOME[card.type] || 'prairie';
};

// ---------- Naturalistes ----------
// kind: item (unlimited per turn), supporter (1 per turn), stadium (1 in play), tool (1 per creature).
// target: what the player must pick — 'mine' (one of their creatures), 'myBench', 'foeBench', 'mineDamaged'.
export const TRAINERS = {
    // Objets
    jumelles: { kind: 'item', name: 'Jumelles', rarity: 'common', text: 'Regarde les 5 premières cartes de ton deck et prends une créature au hasard parmi elles.' },
    appareil: { kind: 'item', name: 'Appareil photo', rarity: 'common', text: 'Pioche 1 carte.' },
    gourde: { kind: 'item', name: 'Gourde', rarity: 'common', target: 'mine', text: 'Soigne 30 PV à une de tes créatures.' },
    boussole: { kind: 'item', name: 'Boussole', rarity: 'uncommon', target: 'myBench', text: 'Échange ta créature active avec une créature de ton Banc.' },
    filet: { kind: 'item', name: 'Filet', rarity: 'rare', target: 'foeBench', text: "Échange la créature active adverse avec une créature de son Banc que tu choisis." },
    trousse: { kind: 'item', name: 'Trousse de soin', rarity: 'rare', target: 'mine', text: 'Soigne 60 PV et retire le poison d\'une de tes créatures.' },
    // Outils
    loupe: { kind: 'tool', name: 'Loupe', rarity: 'uncommon', target: 'mine', text: 'La créature équipée inflige +20 dégâts.' },
    gilet: { kind: 'tool', name: 'Gilet de terrain', rarity: 'uncommon', target: 'mine', text: 'La créature équipée subit −20 dégâts.' },
    bottes: { kind: 'tool', name: 'Bottes de marche', rarity: 'common', target: 'mine', text: 'La créature équipée bat en retraite gratuitement.' },
    // Stades (météo et milieux)
    pluie: { kind: 'stadium', name: 'Pluie', rarity: 'uncommon', boost: ['ocean', 'humide'], text: 'Les créatures Océan et Zone humide infligent +20 dégâts.' },
    secheresse: { kind: 'stadium', name: 'Sécheresse', rarity: 'uncommon', boost: ['desert', 'prairie'], text: 'Les créatures Désert et Prairie infligent +20 dégâts.' },
    canopee: { kind: 'stadium', name: 'Canopée', rarity: 'uncommon', boost: ['foret', 'ciel'], text: 'Les créatures Forêt et Ciel infligent +20 dégâts.' },
    blizzard: { kind: 'stadium', name: 'Blizzard', rarity: 'uncommon', boost: ['montagne'], text: 'Les créatures Montagne infligent +20 dégâts.' },
    // Supporters : de vrais naturalistes
    darwin: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f1/Charles_Darwin_portrait.jpg/330px-Charles_Darwin_portrait.jpg', name: 'Charles Darwin', rarity: 'legendary', years: '1809–1882', text: 'Pioche 3 cartes.' },
    linne: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Carl_von_Linn%C3%A9.jpg/330px-Carl_von_Linn%C3%A9.jpg', name: 'Carl von Linné', rarity: 'rare', years: '1707–1778', text: 'Prends une créature au hasard dans ton deck et ajoute-la à ta main.' },
    goodall: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/98/Deputy_Secretary_Higginbottom_Poses_for_a_Photo_With_Dr._Jane_Goodall_and_the_State_Department%27s_Global_Health_Diplomacy_Director_Jordan_in_Washington_%2822365513310%29_%282%29_%28cropped_2%29.jpg/330px-thumbnail.jpg', name: 'Jane Goodall', rarity: 'epic', years: '1934–2025', target: 'mine', text: 'Soigne 80 PV à une de tes créatures (120 si c\'est un mammifère).' },
    cousteau: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/10/Cousteau1972_%28cropped%29.jpg/330px-Cousteau1972_%28cropped%29.jpg', name: 'Jacques-Yves Cousteau', rarity: 'epic', years: '1910–1997', text: 'Prends 2 Énergies au hasard dans ton deck et ajoute-les à ta main.' },
    fabre: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Jean-henri_fabre.jpg/330px-Jean-henri_fabre.jpg', name: 'Jean-Henri Fabre', rarity: 'rare', years: '1823–1915', text: 'Ce tour-ci, tes créatures infligent +30 dégâts (+50 pour un arthropode).' },
    carson: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f4/Rachel-Carson.jpg/330px-Rachel-Carson.jpg', name: 'Rachel Carson', rarity: 'rare', years: '1907–1964', text: 'Soigne 30 PV à toutes tes créatures et retire leur poison.' },
    humboldt: { kind: 'supporter', img: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/AvHumboldt.jpg', name: 'Alexander von Humboldt', rarity: 'rare', years: '1769–1859', text: 'Pioche 2 cartes, puis prends un Stade au hasard dans ton deck.' },
    audubon: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/John_James_Audubon_1826.jpg/330px-John_James_Audubon_1826.jpg', name: 'John James Audubon', rarity: 'uncommon', years: '1785–1851', target: 'myBench', text: 'Échange ta créature active avec une de ton Banc, puis pioche 1 carte.' },
    buffon: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/Fran%C3%A7ois_Hubert_Drouais_-_Portrait_of_Buffon.jpg/330px-Fran%C3%A7ois_Hubert_Drouais_-_Portrait_of_Buffon.jpg', name: 'Buffon', rarity: 'uncommon', years: '1707–1788', text: 'Mélange ta main dans ton deck, puis pioche 5 cartes.' },
    fossey: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f7/Dian_Fossey_October_1968.jpg/330px-Dian_Fossey_October_1968.jpg', name: 'Dian Fossey', rarity: 'rare', years: '1932–1985', target: 'foeBench', text: 'Échange la créature active adverse avec une de son Banc, au choix.' },
    monod: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f5/Theodore_Monod_-_Adrar_de_Mauritanie_-_Oued_Akerdil_-_D%C3%A9cembre_1998.jpg/330px-Theodore_Monod_-_Adrar_de_Mauritanie_-_Oued_Akerdil_-_D%C3%A9cembre_1998.jpg', name: 'Théodore Monod', rarity: 'uncommon', years: '1902–2000', text: 'Prends 1 Énergie au hasard dans ta défausse et attache-la à ta créature active. Pioche 1 carte.' },
    maathai: { kind: 'supporter', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Wangari_Matthai_2001_%28cropped%29.jpg/330px-Wangari_Matthai_2001_%28cropped%29.jpg', name: 'Wangari Maathai', rarity: 'epic', years: '1940–2011', text: 'Pioche 2 cartes et soigne 40 PV à ta créature active.' },
};

/** Every card that is not a species, by key: 'e:foret', 't:darwin'. */
export function itemCard(key) {
    const [k, name] = key.split(':');
    if (k === 'e' && (BIOMES[name] || name === UNIVERSAL)) {
        const universal = name === UNIVERSAL;
        return {
            key, kind: 'energy', biome: name, rarity: universal ? 'rare' : 'common',
            name: universal ? 'Énergie Universelle' : `Énergie ${BIOMES[name].name}`,
            text: universal ? 'Compte comme une Énergie de n\'importe quel biome.' : `Fournit 1 Énergie ${BIOMES[name].name}.`,
        };
    }
    if (k === 't' && TRAINERS[name]) return { key, ...TRAINERS[name] };
    return null;
}
export const ITEM_KEYS = [...Object.keys(BIOMES).map((b) => `e:${b}`), `e:${UNIVERSAL}`, ...Object.keys(TRAINERS).map((t) => `t:${t}`)];

// ---------- creatures ----------

const ATTACK_NAMES = {
    mammal: ['Morsure', 'Assaut'], bird: ['Coup de bec', 'Piqué'], reptile: ['Morsure', 'Carapace'], fish: ['Charge', 'Esquive'],
    arthropod: ['Piqûre', 'Essaim'], marine: ['Tentacules', "Jet d'encre"], terrestrial: ['Glissade', 'Mucus'], aquatic: ['Ventouse', 'Étreinte'],
    plant: ['Fouet de liane', 'Pollen'], tree: ['Branche', 'Écorce'], alga: ['Vague', 'Photosynthèse'], fungus: ['Spores', 'Mycélium'],
    mold: ['Moisissure', 'Nuage toxique'], bacteria: ['Division', 'Prolifération'], virus: ['Infection', 'Contagion'],
    fossil: ['Coup de queue', 'Impact ancestral'], mineral: ['Éclat', 'Cristallisation'],
};
// The second attack's effect, by type (the old battle abilities, rewritten for turns).
const EFFECTS = {
    mammal: { power: 1.0, text: '' },
    bird: { power: 0.75, pierce: true, text: 'Ignore la défense et les outils de la cible.' },
    reptile: { power: 0.6, shield: 30, text: 'Réduit de 30 les dégâts que cette créature subira au prochain tour.' },
    fish: { power: 0.6, shield: 30, text: 'Réduit de 30 les dégâts que cette créature subira au prochain tour.' },
    arthropod: { power: 0.6, swarm: 20, text: '+20 dégâts pour chaque arthropode sur ton Banc.' },
    marine: { power: 0.65, discardEnergy: true, text: "Défausse 1 Énergie de la créature active adverse." },
    terrestrial: { power: 0.65, heal: 30, text: 'Soigne 30 PV à cette créature.' },
    aquatic: { power: 0.7, weaken: 20, text: 'Au prochain tour, la créature adverse inflige −20 dégâts.' },
    plant: { power: 0.6, healTeam: 20, text: 'Soigne 20 PV à toutes tes créatures.' },
    tree: { power: 0.65, shield: 40, text: 'Réduit de 40 les dégâts que cette créature subira au prochain tour.' },
    alga: { power: 0.55, heal: 50, text: 'Soigne 50 PV à cette créature.' },
    fungus: { power: 0.75, lifesteal: 0.5, text: 'Soigne cette créature de la moitié des dégâts infligés.' },
    mold: { power: 0.6, poison: true, text: 'La créature adverse est empoisonnée.' },
    bacteria: { power: 0.6, bench: 10, text: '10 dégâts à chaque créature du Banc adverse.' },
    virus: { power: 0.6, poison: true, text: 'La créature adverse est empoisonnée.' },
    fossil: { power: 1.25, text: '' },
    mineral: { power: 0.6, shield: 50, text: 'Réduit de 50 les dégâts que cette créature subira au prochain tour.' },
};
const r10 = (n) => Math.max(10, Math.round(n / 10) * 10);
const ENDANGERED = ['EN', 'CR', 'EW', 'EX'];

/** The game version of a species card: PV, two attacks with their Énergie cost, retreat cost. */
export function creatureCard(card) {
    const st = battleStats(card);
    const biome = cardBiome(card);
    const fx = EFFECTS[card.type] || EFFECTS.mammal;
    const [n1, n2] = ATTACK_NAMES[card.type] || ATTACK_NAMES.mammal;
    const strong = st.atk >= 90; // big hitters need one more Énergie for their best move
    const cost2 = card.type === 'fossil' ? [biome, biome, 'any'] : strong ? [biome, 'any', 'any'] : [biome, 'any'];
    const p = PROFILES[card.type] || PROFILES.plant;
    const ratio = st.spd / ((st.atk + st.def) / 2);
    return {
        key: `c:${card.id}`, kind: 'creature', id: card.id, name: card.name, type: card.type, rarity: card.rarity,
        thumb_url: card.thumb_url, biome, role: p.role,
        hp: r10(st.hp), def: st.def,
        retreat: ratio >= 1.15 ? 0 : ratio >= 0.9 ? 1 : ratio >= 0.7 ? 2 : 3,
        captures: ['legendary', 'secret'].includes(card.rarity) || ENDANGERED.includes(card.iucn) ? 2 : 1,
        endangered: ENDANGERED.includes(card.iucn),
        attacks: [
            { name: n1, cost: [biome], damage: r10(10 + st.atk * 0.4), text: '' },
            { name: n2, cost: cost2, damage: r10(st.atk * (strong ? 1.3 : 1.1) * fx.power), ...fx, power: undefined },
        ],
    };
}

/** Food chain: a predator deals ×2 to its prey, the prey resists (−20) its predator. */
export function chainMult(attackerType, defenderType) {
    if (STRONG[attackerType]?.includes(defenderType)) return 'prey';
    if (STRONG[defenderType]?.includes(attackerType)) return 'predator';
    return null;
}

// ---------- randomness ----------

function rand(state) {
    // mulberry32, its counter saved in the state
    let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(state, list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand(state) * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// ---------- state ----------

/**
 * decks: two lists of full card objects (creatureCard() or itemCard()).
 * Returns a new game, set up: hands drawn, the AI's creatures placed; the player places theirs.
 */
export function newGame(decks, { seed = 1, names = ['Toi', 'Adversaire'], ai = 2, selfPlay = false } = {}) {
    const state = {
        rng: seed | 0, turn: 0, current: 0, phase: 'setup', winner: null, names, ai, selfPlay, uid: 0,
        stadium: null, players: [], log: [],
    };
    state.players = decks.map((deck) => ({
        deck: deck.map((c) => ({ ...c, uid: ++state.uid })), hand: [], discard: [], active: null, bench: [], captures: 0,
        energyPlayed: false, supporterPlayed: false, retreated: false, boost: 0, mulligans: 0,
    }));
    for (const p of state.players) {
        // redraw until the hand holds a creature (every mulligan is shown to both players)
        for (;;) {
            p.deck.push(...p.hand.splice(0));
            shuffle(state, p.deck);
            p.hand = p.deck.splice(0, HAND_START);
            if (p.hand.some((c) => c.kind === 'creature')) break;
            p.mulligans += 1;
        }
    }
    state.first = rand(state) < 0.5 ? 0 : 1;
    aiSetup(state, 1);
    if (state.selfPlay) { aiSetup(state, 0); startGame(state, []); runAi(state); }
    return state;
}

const opp = (side) => 1 - side;
// side 1 is the AI; `selfPlay` lets the AI play side 0 too (tests, demo games)
const isAi = (state, side) => (side === 1 ? !!state.ai : !!state.selfPlay);
const inPlay = (p) => [p.active, ...p.bench].filter(Boolean);
const findInPlay = (p, uid) => inPlay(p).find((c) => c.uid === uid);
const hpLeft = (c) => c.hp - c.damage;

function place(card) {
    return { ...card, damage: 0, energies: [], tool: null, poisoned: false, shield: 0, weak: 0, playedTurn: 0 };
}

function event(state, events, e) { events.push(e); }

function draw(state, events, side, n = 1) {
    const p = state.players[side];
    const got = p.deck.splice(0, n);
    p.hand.push(...got);
    if (got.length) event(state, events, { k: 'draw', side, n: got.length });
    return got;
}

// ---------- energy costs ----------

/** Can these attached Énergies pay `cost` (biome names and 'any')? */
export function canPay(energies, cost) {
    const pool = energies.map((e) => e.biome ?? e); // attached ({biome, card}) or plain biome names
    for (const need of cost.filter((c) => c !== 'any')) {
        let i = pool.indexOf(need);
        if (i < 0) i = pool.indexOf(UNIVERSAL);
        if (i < 0) return false;
        pool.splice(i, 1);
    }
    return pool.length >= cost.filter((c) => c === 'any').length;
}

/** What an attached Énergie still lacks for the cost, so the AI and the hints can aim. */
export function missing(energies, cost) {
    const pool = energies.map((e) => e.biome ?? e); // attached ({biome, card}) or plain biome names
    const lack = [];
    for (const need of cost.filter((c) => c !== 'any')) {
        let i = pool.indexOf(need);
        if (i < 0) i = pool.indexOf(UNIVERSAL);
        if (i < 0) lack.push(need); else pool.splice(i, 1);
    }
    const anyLeft = cost.filter((c) => c === 'any').length - pool.length;
    for (let i = 0; i < anyLeft; i++) lack.push('any');
    return lack;
}

const retreatCost = (c) => (c.tool === 'bottes' ? 0 : c.retreat);

// ---------- damage ----------

/** Damage of `attack` from `att` on `def` — the exact number shown on the attack button. */
export function attackDamage(state, side, att, attack, def) {
    if (!attack.damage) return 0;
    const me = state.players[side];
    let dmg = attack.damage;
    if (attack.swarm) dmg += attack.swarm * me.bench.filter((c) => c.type === 'arthropod').length;
    if (att.tool === 'loupe') dmg += 20;
    if (state.stadium && TRAINERS[state.stadium.key].boost.includes(att.biome)) dmg += 20;
    if (me.boost) dmg += me.boost + (me.boostArthropod && att.type === 'arthropod' ? 20 : 0);
    if (att.weak) dmg -= att.weak;
    const chain = chainMult(att.type, def.type);
    if (chain === 'prey') dmg *= 2;
    if (chain === 'predator') dmg -= 20;
    if (!attack.pierce) {
        dmg -= Math.floor(def.def / 60) * 10; // thick skin, shells, bark
        if (def.tool === 'gilet') dmg -= 20;
        dmg -= def.shield;
    }
    return Math.max(0, Math.round(dmg / 10) * 10);
}

// ---------- legality ----------

/** Everything `side` may do now, as action objects (with the targets the UI must offer). */
export function legalActions(state, side) {
    if (state.phase === 'over' || state.current !== side) return [];
    const p = state.players[side];
    const foe = state.players[opp(side)];
    if (state.phase === 'setup') return [{ t: 'setup' }];
    if (state.phase === 'promote') return p.bench.map((c) => ({ t: 'promote', uid: c.uid }));
    const list = [];
    for (const c of p.hand) {
        if (c.kind === 'creature' && p.bench.length < BENCH_SIZE) list.push({ t: 'bench', uid: c.uid });
        if (c.kind === 'energy' && !p.energyPlayed) for (const m of inPlay(p)) list.push({ t: 'energy', uid: c.uid, target: m.uid });
        if (['item', 'supporter', 'stadium', 'tool'].includes(c.kind)) {
            const tr = TRAINERS[c.key.slice(2)];
            if (c.kind === 'supporter' && (p.supporterPlayed || (state.turn === 1))) continue;
            if (c.kind === 'stadium' && state.stadium?.key === c.key.slice(2)) continue;
            const targets = tr.target === 'mine' ? inPlay(p).filter((m) => c.kind !== 'tool' || !m.tool)
                : tr.target === 'myBench' ? p.bench : tr.target === 'foeBench' ? foe.bench : null;
            if (targets) for (const m of targets) list.push({ t: 'play', uid: c.uid, target: m.uid });
            else if (!blockedPlay(state, side, tr)) list.push({ t: 'play', uid: c.uid });
        }
    }
    if (p.active && !p.retreated && p.bench.length && p.active.energies.length >= retreatCost(p.active)) {
        for (const b of p.bench) list.push({ t: 'retreat', to: b.uid });
    }
    if (p.active && !(state.turn === 1)) {
        p.active.attacks.forEach((a, i) => { if (canPay(p.active.energies, a.cost)) list.push({ t: 'attack', i }); });
    }
    list.push({ t: 'end' });
    return list;
}

// a card with nothing to do is not offered (an empty deck to search, a full hand to heal…)
function blockedPlay(state, side, tr) {
    const p = state.players[side];
    if (['darwin', 'appareil', 'humboldt', 'maathai'].includes(trKey(tr)) && !p.deck.length) return true;
    if (trKey(tr) === 'linne' && !p.deck.some((c) => c.kind === 'creature')) return true;
    if (trKey(tr) === 'jumelles' && !p.deck.slice(0, 5).some((c) => c.kind === 'creature')) return true;
    if (trKey(tr) === 'cousteau' && !p.deck.some((c) => c.kind === 'energy')) return true;
    if (trKey(tr) === 'monod' && (!p.discard.some((c) => c.kind === 'energy') || !p.active)) return true;
    return false;
}
const trKey = (tr) => Object.keys(TRAINERS).find((k) => TRAINERS[k] === tr);

const same = (a, b) => a.t === b.t && a.uid === b.uid && a.target === b.target && a.to === b.to && a.i === b.i;

// ---------- actions ----------

/**
 * Plays one action for `side`. Mutates the state, returns the events.
 * After the player's turn ends the AI plays its whole turn in the same call.
 */
export function act(state, side, action, onFrame) {
    if (state.phase === 'over') throw new Error('La partie est terminée');
    if (state.current !== side) throw new Error('Ce n\'est pas ton tour');
    const events = [];
    if (action.t === 'setup') {
        if (state.phase !== 'setup') throw new Error('Action impossible');
        doSetup(state, side, action, events);
    } else {
        if (!legalActions(state, side).some((a) => same(a, action))) throw new Error('Action impossible');
        apply(state, side, action, events);
    }
    onFrame?.(events);
    return runAi(state, events, onFrame);
}

/** The AI plays until it is a human's turn again (or the game is over); `onFrame` after each of its moves, for replays. */
export function runAi(state, events = [], onFrame) {
    let guard = 0;
    while (state.phase !== 'over' && isAi(state, state.current) && guard++ < 5000) {
        aiStep(state, events, state.current);
        onFrame?.(events);
    }
    return events;
}

function doSetup(state, side, { active, bench = [] }, events) {
    const p = state.players[side];
    const pick = (uid) => {
        const i = p.hand.findIndex((c) => c.uid === uid && c.kind === 'creature');
        if (i < 0) throw new Error('Choisis des créatures de ta main');
        return place(p.hand.splice(i, 1)[0]);
    };
    if (bench.length > BENCH_SIZE) throw new Error(`${BENCH_SIZE} créatures maximum sur le Banc`);
    p.active = pick(active);
    p.bench = [...new Set(bench)].filter((u) => u !== active).map(pick);
    event(state, events, { k: 'setup', side });
    startGame(state, events);
}

function startGame(state, events) {
    state.phase = 'main';
    state.current = state.first;
    state.turn = 0;
    event(state, events, { k: 'first', side: state.first, text: `${state.names[state.first]} commence.` });
    beginTurn(state, events);
}

function beginTurn(state, events) {
    state.turn += 1;
    const side = state.current;
    const p = state.players[side];
    Object.assign(p, { energyPlayed: false, supporterPlayed: false, retreated: false, boost: 0, boostArthropod: false });
    event(state, events, { k: 'turn', side, turn: state.turn });
    if (state.turn > MAX_TURNS) return endGame(state, events, p.captures >= state.players[opp(side)].captures ? side : opp(side), 'Limite de tours atteinte.');
    if (!p.deck.length) return endGame(state, events, opp(side), `${state.names[side]} n'a plus de cartes à piocher.`);
    draw(state, events, side);
}

function endTurn(state, events) {
    const side = state.current;
    // checkup: poison hurts, shields and weakness wear off
    for (const s of [side, opp(side)]) {
        const a = state.players[s].active;
        if (a?.poisoned && s === side) {
            event(state, events, { k: 'poison', side: s, uid: a.uid, amount: POISON_DAMAGE, text: `Le poison ronge ${a.name}.` });
            hurt(state, events, s, a, POISON_DAMAGE);
        }
    }
    for (const c of inPlay(state.players[opp(side)])) c.shield = 0; // the foe's guard lasted one of our turns
    for (const c of inPlay(state.players[side])) c.weak = 0;
    if (state.phase === 'over') return;
    if (checkKos(state, events)) { if (state.phase === 'promote') state.pendingTurn = true; return; }
    state.current = opp(side);
    beginTurn(state, events);
}

function hurt(state, events, side, c, amount) {
    c.damage = Math.min(c.hp, c.damage + amount);
}

// Knocked-out creatures are captured; returns true when the turn flow stops (game over or promotion).
function checkKos(state, events) {
    for (const side of [0, 1]) {
        const p = state.players[side];
        for (const c of inPlay(p)) {
            if (hpLeft(c) > 0) continue;
            const taker = opp(side);
            state.players[taker].captures += c.captures;
            event(state, events, { k: 'ko', side, uid: c.uid, captures: c.captures, text: `${c.name} est capturé${c.captures > 1 ? ' (vaut 2 captures !)' : ''}.` });
            p.discard.push(...c.energies.map((e) => e.card), ...(c.toolCard ? [c.toolCard] : []), stripPlay(c));
            if (p.active === c) p.active = null; else p.bench = p.bench.filter((b) => b !== c);
        }
    }
    for (const side of [state.current, opp(state.current)]) {
        if (state.players[side].captures >= CAPTURES_TO_WIN) { endGame(state, events, side, `${state.names[side]} a fait ${CAPTURES_TO_WIN} captures.`); return true; }
    }
    for (const side of [0, 1]) {
        const p = state.players[side];
        if (!p.active && !p.bench.length) { endGame(state, events, opp(side), `${state.names[side]} n'a plus de créature en jeu.`); return true; }
    }
    // an empty active slot must be refilled before play goes on
    for (const side of [0, 1]) {
        const p = state.players[side];
        if (p.active) continue;
        if (isAi(state, side)) { aiPromote(state, events, side); continue; }
        state.resumeSide = state.current;
        state.current = side;
        state.phase = 'promote';
        return true;
    }
    return false;
}

function stripPlay(c) {
    const { damage, energies, tool, toolCard, poisoned, shield, weak, playedTurn, ...card } = c;
    return card;
}

function endGame(state, events, winner, reason) {
    state.phase = 'over';
    state.winner = winner;
    state.reason = reason;
    event(state, events, { k: 'end', winner, text: reason });
}

function takeFromHand(p, uid) {
    const i = p.hand.findIndex((c) => c.uid === uid);
    return p.hand.splice(i, 1)[0];
}

function switchActive(p, benchUid) {
    const i = p.bench.findIndex((c) => c.uid === benchUid);
    const next = p.bench[i];
    p.bench[i] = p.active;
    p.active = next;
}

function apply(state, side, action, events) {
    const p = state.players[side];
    const foe = state.players[opp(side)];
    const name = state.names[side];
    switch (action.t) {
        case 'promote': {
            const i = p.bench.findIndex((c) => c.uid === action.uid);
            p.active = p.bench.splice(i, 1)[0];
            event(state, events, { k: 'promote', side, uid: p.active.uid, text: `${p.active.name} entre en jeu.` });
            state.phase = 'main';
            state.current = state.resumeSide;
            // the promotion happened between turns: the next turn starts now
            if (state.pendingTurn) { state.pendingTurn = false; state.current = opp(state.resumeSide); beginTurn(state, events); }
            return;
        }
        case 'bench': {
            const c = place(takeFromHand(p, action.uid));
            c.playedTurn = state.turn;
            p.bench.push(c);
            event(state, events, { k: 'bench', side, uid: c.uid, card: publicCard(c), text: `${name} pose ${c.name} sur son Banc.` });
            return;
        }
        case 'energy': {
            const e = takeFromHand(p, action.uid);
            const target = findInPlay(p, action.target);
            target.energies.push({ biome: e.biome, card: e });
            p.energyPlayed = true;
            event(state, events, { k: 'energy', side, uid: target.uid, biome: e.biome, text: `${e.name} attachée à ${target.name}.` });
            return;
        }
        case 'retreat': {
            const cost = retreatCost(p.active);
            p.discard.push(...p.active.energies.splice(0, cost).map((e) => e.card));
            const from = p.active;
            switchActive(p, action.to);
            from.poisoned = false; // leaving the field cures
            p.retreated = true;
            event(state, events, { k: 'retreat', side, uid: p.active.uid, text: `${from.name} bat en retraite, ${p.active.name} entre en jeu.` });
            return;
        }
        case 'play': return playTrainer(state, side, action, events);
        case 'attack': return attack(state, side, action.i, events);
        case 'end':
            event(state, events, { k: 'pass', side, text: `${name} termine son tour.` });
            return endTurn(state, events);
        default: throw new Error('Action inconnue');
    }
}

function playTrainer(state, side, action, events) {
    const p = state.players[side];
    const foe = state.players[opp(side)];
    const card = takeFromHand(p, action.uid);
    const key = card.key.slice(2);
    const target = action.target != null ? findInPlay(p, action.target) || findInPlay(foe, action.target) : null;
    const name = state.names[side];
    const heal = (c, n) => { const h = Math.min(c.damage, n); c.damage -= h; return h; };
    event(state, events, { k: 'play', side, key: card.key, name: card.name, target: target?.uid, text: `${name} joue ${card.name}.` });
    if (card.kind === 'supporter') p.supporterPlayed = true;
    if (card.kind === 'tool') { target.tool = key; target.toolCard = card; return; }
    if (card.kind === 'stadium') {
        if (state.stadium) state.players[state.stadium.owner].discard.push(itemCard(`t:${state.stadium.key}`));
        state.stadium = { key, owner: side };
        return;
    }
    p.discard.push(card);
    const searchDeck = (pred, n) => {
        const found = [];
        for (let k = 0; k < n; k++) {
            const pool = p.deck.filter(pred);
            if (!pool.length) break;
            const pickC = pool[Math.floor(rand(state) * pool.length)];
            p.deck.splice(p.deck.indexOf(pickC), 1);
            p.hand.push(pickC);
            found.push(pickC);
        }
        shuffle(state, p.deck);
        if (found.length) event(state, events, { k: 'search', side, names: side === 0 ? found.map((c) => c.name) : null, n: found.length });
        return found;
    };
    switch (key) {
        case 'appareil': draw(state, events, side, 1); break;
        case 'jumelles': {
            const top = p.deck.slice(0, 5).filter((c) => c.kind === 'creature');
            const got = top[Math.floor(rand(state) * top.length)];
            p.deck.splice(p.deck.indexOf(got), 1);
            p.hand.push(got);
            shuffle(state, p.deck);
            event(state, events, { k: 'search', side, names: side === 0 ? [got.name] : null, n: 1 });
            break;
        }
        case 'gourde': event(state, events, { k: 'heal', side, uid: target.uid, amount: heal(target, 30) }); break;
        case 'trousse': target.poisoned = false; event(state, events, { k: 'heal', side, uid: target.uid, amount: heal(target, 60) }); break;
        case 'boussole': switchActive(p, target.uid); p.active.poisoned = false; event(state, events, { k: 'switch', side, uid: p.active.uid }); break;
        case 'filet': case 'fossey': switchActive(foe, target.uid); event(state, events, { k: 'switch', side: opp(side), uid: foe.active.uid, text: `${foe.active.name} est forcé d'entrer en jeu.` }); break;
        case 'darwin': draw(state, events, side, 3); break;
        case 'linne': searchDeck((c) => c.kind === 'creature', 1); break;
        case 'cousteau': searchDeck((c) => c.kind === 'energy', 2); break;
        case 'humboldt': draw(state, events, side, 2); searchDeck((c) => c.kind === 'stadium', 1); break;
        case 'goodall': event(state, events, { k: 'heal', side, uid: target.uid, amount: heal(target, target.type === 'mammal' ? 120 : 80) }); break;
        case 'carson': for (const c of inPlay(p)) { c.poisoned = false; const h = heal(c, 30); if (h) event(state, events, { k: 'heal', side, uid: c.uid, amount: h }); } break;
        case 'fabre': p.boost = 30; p.boostArthropod = true; break;
        case 'audubon': switchActive(p, target.uid); p.active.poisoned = false; event(state, events, { k: 'switch', side, uid: p.active.uid }); draw(state, events, side, 1); break;
        case 'buffon': p.deck.push(...p.hand.splice(0)); shuffle(state, p.deck); draw(state, events, side, 5); break;
        case 'monod': {
            const energies = p.discard.filter((c) => c.kind === 'energy');
            const e = energies[Math.floor(rand(state) * energies.length)];
            p.discard.splice(p.discard.indexOf(e), 1);
            p.active.energies.push({ biome: e.biome, card: e });
            event(state, events, { k: 'energy', side, uid: p.active.uid, biome: e.biome, text: `${e.name} attachée à ${p.active.name}.` });
            draw(state, events, side, 1);
            break;
        }
        case 'maathai': draw(state, events, side, 2); if (p.active) event(state, events, { k: 'heal', side, uid: p.active.uid, amount: heal(p.active, 40) }); break;
        default: break;
    }
}

function attack(state, side, i, events) {
    const p = state.players[side];
    const foeSide = opp(side);
    const foe = state.players[foeSide];
    const me = p.active;
    const a = me.attacks[i];
    const def = foe.active;
    const dmg = attackDamage(state, side, me, a, def);
    const chain = chainMult(me.type, def.type);
    event(state, events, { k: 'attack', side, uid: me.uid, name: a.name, text: `${me.name} utilise ${a.name} !` });
    if (a.damage) {
        hurt(state, events, foeSide, def, dmg);
        event(state, events, { k: 'damage', side: foeSide, uid: def.uid, amount: dmg, chain, text: chain === 'prey' ? 'Prédateur : dégâts ×2 !' : chain === 'predator' ? 'La proie résiste (−20).' : null });
    }
    if (a.lifesteal && dmg) { const h = Math.min(me.damage, Math.round(dmg * a.lifesteal / 10) * 10); me.damage -= h; if (h) event(state, events, { k: 'heal', side, uid: me.uid, amount: h }); }
    if (a.heal) { const h = Math.min(me.damage, a.heal); me.damage -= h; if (h) event(state, events, { k: 'heal', side, uid: me.uid, amount: h }); }
    if (a.healTeam) for (const c of inPlay(p)) { const h = Math.min(c.damage, a.healTeam); c.damage -= h; if (h) event(state, events, { k: 'heal', side, uid: c.uid, amount: h }); }
    if (a.shield) { me.shield = a.shield; event(state, events, { k: 'shield', side, uid: me.uid, amount: a.shield, text: `${me.name} se protège (−${a.shield} au prochain tour).` }); }
    if (a.weaken && hpLeft(def) > 0) { def.weak = a.weaken; event(state, events, { k: 'weak', side: foeSide, uid: def.uid, text: `${def.name} est affaibli (−${a.weaken} dégâts).` }); }
    if (a.poison && hpLeft(def) > 0) { def.poisoned = true; event(state, events, { k: 'poisoned', side: foeSide, uid: def.uid, text: `${def.name} est empoisonné.` }); }
    if (a.discardEnergy && def.energies.length) { foe.discard.push(def.energies.pop().card); event(state, events, { k: 'discardEnergy', side: foeSide, uid: def.uid, text: `${def.name} perd une Énergie.` }); }
    if (a.bench) for (const c of foe.bench) { hurt(state, events, foeSide, c, a.bench); event(state, events, { k: 'damage', side: foeSide, uid: c.uid, amount: a.bench }); }
    // attacking ends the turn; the KO check may stop it for a promotion
    if (checkKos(state, events)) { if (state.phase === 'promote') state.pendingTurn = true; return; }
    endTurn(state, events);
}

// ---------- AI ----------

function aiSetup(state, side) {
    const p = state.players[side];
    const creatures = p.hand.filter((c) => c.kind === 'creature').sort((a, b) => power(b) - power(a));
    const take = (c) => place(p.hand.splice(p.hand.indexOf(c), 1)[0]);
    p.active = take(creatures[0]);
    p.bench = creatures.slice(1, 1 + BENCH_SIZE).map(take);
}

export const power = (c) => c.hp + c.attacks[1].damage * 2;

function aiPromote(state, events, side) {
    const p = state.players[side];
    const foe = state.players[opp(side)].active;
    const best = [...p.bench].sort((a, b) => aiScore(state, side, b, foe) - aiScore(state, side, a, foe))[0];
    p.bench.splice(p.bench.indexOf(best), 1);
    p.active = best;
    event(state, events, { k: 'promote', side, uid: best.uid, text: `${best.name} entre en jeu.` });
}

// How good `c` is against `foe`: best damage it could deal, minus what it would take.
function aiScore(state, side, c, foe) {
    if (!foe) return hpLeft(c);
    const deal = Math.max(...c.attacks.map((a) => attackDamage(state, side, c, a, foe)));
    const take = Math.max(...foe.attacks.map((a) => attackDamage(state, opp(side), foe, a, c)));
    return deal - take * 0.6 + hpLeft(c) * 0.3;
}

/** One decision of the AI (called in a loop until its turn is over). */
export function aiStep(state, events, side) {
    const p = state.players[side];
    const foe = state.players[opp(side)];
    const legal = legalActions(state, side);
    const doIt = (a) => apply(state, side, a, events);
    const has = (t, pred = () => true) => legal.find((a) => a.t === t && pred(a));
    const card = (uid) => p.hand.find((c) => c.uid === uid);
    const tk = (a) => card(a.uid)?.key.slice(2);

    // 1. a supporter that helps
    const sup = has('play', (a) => card(a.uid)?.kind === 'supporter' && aiWantsTrainer(state, side, tk(a), a));
    if (sup) return doIt(sup);
    // 2. useful items and a matching stadium
    const item = has('play', (a) => ['item', 'stadium'].includes(card(a.uid)?.kind) && aiWantsTrainer(state, side, tk(a), a));
    if (item) return doIt(item);
    // 3. fill the bench, strongest first
    const bench = legal.filter((a) => a.t === 'bench').sort((a, b) => power(card(b.uid)) - power(card(a.uid)))[0];
    if (bench) return doIt(bench);
    // 4. one Énergie, where it brings an attack closest
    const energies = legal.filter((a) => a.t === 'energy');
    if (energies.length) {
        const score = (a) => {
            const e = card(a.uid);
            const c = findInPlay(p, a.target);
            const need = missing(c.energies, c.attacks[1].cost);
            const fits = need.includes(e.biome) || (need.length && (e.biome === UNIVERSAL || need.includes('any')));
            return (fits ? 10 : 0) + (c === p.active ? 5 : 0) - need.length;
        };
        return doIt(energies.sort((a, b) => score(b) - score(a))[0]);
    }
    // 5. a tool on the active
    const tool = has('play', (a) => card(a.uid)?.kind === 'tool' && a.target === p.active?.uid);
    if (tool) return doIt(tool);
    // 6. retreat from a hopeless matchup
    if (p.active && foe.active && state.ai >= 2) {
        const here = aiScore(state, side, p.active, foe.active);
        const better = legal.filter((a) => a.t === 'retreat').map((a) => ({ a, s: aiScore(state, side, findInPlay(p, a.to), foe.active) }))
            .filter((x) => x.s > here + 40).sort((x, y) => y.s - x.s)[0];
        if (better && (hpLeft(p.active) <= attackDamageMax(state, opp(side), foe.active, p.active) || !legal.some((a) => a.t === 'attack'))) return doIt(better.a);
    }
    // 7. the attack that deals the most (or a support move when hurting is pointless)
    const attacks = legal.filter((a) => a.t === 'attack');
    if (attacks.length) {
        const val = (a) => {
            const at = p.active.attacks[a.i];
            const d = attackDamage(state, side, p.active, at, foe.active);
            return (d >= hpLeft(foe.active) ? 1000 : d) + (at.heal && p.active.damage >= at.heal ? at.heal / 2 : 0) + (at.poison && !foe.active.poisoned ? 15 : 0) + (at.shield ? 10 : 0);
        };
        return doIt(attacks.sort((a, b) => val(b) - val(a))[0]);
    }
    return doIt({ t: 'end' });
}

const attackDamageMax = (state, side, att, def) => Math.max(...att.attacks.map((a) => (canPay(att.energies, a.cost) ? attackDamage(state, side, att, a, def) : 0)));

function aiWantsTrainer(state, side, key, action) {
    const p = state.players[side];
    const foe = state.players[opp(side)];
    const target = action.target != null ? findInPlay(p, action.target) || findInPlay(foe, action.target) : null;
    switch (key) {
        case 'appareil': case 'jumelles': case 'linne': case 'cousteau': case 'monod': return true;
        case 'darwin': case 'humboldt': return p.hand.length <= 5;
        case 'buffon': return p.hand.length <= 2;
        case 'maathai': return p.hand.length <= 5 || (p.active && p.active.damage >= 40);
        case 'gourde': return target.damage >= 30 && hpLeft(target) > 0;
        case 'trousse': case 'goodall': return target.damage >= 60 || target.poisoned;
        case 'carson': return inPlay(p).reduce((s, c) => s + Math.min(30, c.damage), 0) >= 50 || inPlay(p).some((c) => c.poisoned);
        case 'fabre': return !!p.active && p.active.attacks.some((a) => canPay(p.active.energies, a.cost)) && state.turn > 1;
        case 'boussole': case 'audubon': return !!p.active && aiScore(state, side, target, foe.active) > aiScore(state, side, p.active, foe.active) + 50;
        case 'filet': case 'fossey': return !!p.active && attackDamageMax(state, side, p.active, target) >= hpLeft(target); // pull a weak one in to capture it
        default:
            if (TRAINERS[key]?.kind === 'stadium') return inPlay(p).filter((c) => TRAINERS[key].boost.includes(c.biome)).length >= 2;
            return false;
    }
}

// ---------- view ----------

export function publicCard(c) {
    if (!c) return null;
    const { uid, card, ...rest } = c;
    return { uid, ...rest, energies: c.energies?.map((e) => e.biome) };
}

/** The state as `side` sees it: their hand, but only the count of the foe's hand and of both decks. */
export function view(state, side = 0) {
    return {
        phase: state.phase, turn: state.turn, current: state.current, first: state.first, winner: state.winner, reason: state.reason, names: state.names,
        stadium: state.stadium && { ...state.stadium, ...TRAINERS[state.stadium.key] },
        players: state.players.map((p, i) => ({
            active: publicCard(p.active), bench: p.bench.map(publicCard), captures: p.captures,
            deck: p.deck.length, discard: p.discard.map(({ uid, ...c }) => c), handCount: p.hand.length,
            hand: i === side ? p.hand : undefined, mulligans: p.mulligans,
            energyPlayed: p.energyPlayed, supporterPlayed: p.supporterPlayed, retreated: p.retreated, boost: p.boost, boostArthropod: p.boostArthropod,
        })),
        actions: legalActions(state, side),
    };
}

// ---------- decks ----------

export const DECK_MIN_CREATURES = 6;

/**
 * What is wrong with a deck (list of keys 'c:12', 'e:foret', 't:darwin'), as sentences for the player.
 * `owned` counts the cards the player has, by the same keys. Énergies have no copy limit.
 */
export function deckProblems(keys, owned) {
    const out = [];
    const n = {};
    for (const k of keys) n[k] = (n[k] || 0) + 1;
    if (keys.length < DECK_MIN) out.push(`Il faut au moins ${DECK_MIN} cartes (${keys.length} pour l'instant).`);
    if (keys.length > DECK_MAX) out.push(`${DECK_MAX} cartes au maximum.`);
    const creatures = keys.filter((k) => k.startsWith('c:')).length;
    if (creatures < DECK_MIN_CREATURES) out.push(`Il faut au moins ${DECK_MIN_CREATURES} créatures.`);
    if (!keys.some((k) => k.startsWith('e:'))) out.push('Il faut au moins une Énergie.');
    for (const [k, c] of Object.entries(n)) {
        if (!k.startsWith('c:') && !itemCard(k)) { out.push('Carte inconnue.'); continue; }
        if (!k.startsWith('e:') && c > MAX_COPIES) out.push(`${MAX_COPIES} exemplaires au maximum d'une même carte.`);
        if (c > (owned[k] || 0)) out.push('Tu n\'as pas assez d\'exemplaires de certaines cartes.');
    }
    return [...new Set(out)];
}

export const STARTER_TRAINERS = ['t:appareil', 't:appareil', 't:gourde', 't:jumelles'];

/**
 * A playable deck around some species (creatureCard()s): the creatures of their two main
 * biomes, strongest first, then Énergies of those biomes in proportion, then the Naturalistes.
 */
export function autoDeck(creatures, { size = 24, nCreatures = 10, trainers = STARTER_TRAINERS } = {}) {
    const count = {};
    for (const c of creatures) count[c.biome] = (count[c.biome] || 0) + 1;
    const main = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 2);
    const byPower = [...creatures].sort((a, b) => power(b) - power(a));
    const picked = [...byPower.filter((c) => main.includes(c.biome)), ...byPower.filter((c) => !main.includes(c.biome))].slice(0, nCreatures);
    const nEnergy = Math.max(0, size - picked.length - trainers.length);
    const need = {};
    for (const c of picked) need[c.biome] = (need[c.biome] || 0) + 1;
    const biomes = Object.keys(need).sort((a, b) => need[b] - need[a]);
    const energies = [];
    for (const b of biomes) for (let i = 0; i < Math.round((need[b] / picked.length) * nEnergy); i++) energies.push(b);
    while (energies.length < nEnergy) energies.push(biomes[0]);
    energies.length = nEnergy;
    return [...picked, ...energies.map((b) => itemCard(`e:${b}`)), ...trainers.map(itemCard)];
}
