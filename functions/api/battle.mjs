/**
 * NatureDex battle engine — pure and deterministic (no randomness anywhere).
 *
 * Shared by the API (authoritative) and the site (rules, stats and type chart).
 *
 * A battle: two teams of 3 cards, one active card each. Every round the AI picks its
 * action first and shows it (its "intention"), then the player answers. Switches and
 * guards resolve first, then the two other actions in speed order (VIT). The team's
 * energy (⚡) grows by 1 per round and pays for the cards' special abilities.
 */

export const TEAM_SIZE = 3;
export const MAX_ENERGY = 5;
export const MAX_ROUNDS = 40;
export const STRONG_MULT = 1.5;
export const WEAK_MULT = 0.75;
export const GUARD_FACTOR = 0.5;

// Food chain / ecology: each type is strong against two others (roots and fungi also crack rock) (×1.5 damage) and takes
// ×0.75 when it attacks a type that is strong against it.
export const STRONG = {
    mammal: ['plant', 'bird'],
    bird: ['arthropod', 'fish'],
    reptile: ['mammal', 'bird'],
    fish: ['marine', 'alga'],
    arthropod: ['plant', 'tree'],
    marine: ['fish', 'alga'],
    plant: ['fossil', 'bacteria', 'mineral'],
    tree: ['fungus', 'mold'],
    alga: ['virus', 'fungus'],
    fungus: ['tree', 'arthropod', 'mineral'],
    mold: ['virus', 'reptile'],
    bacteria: ['mold', 'fossil'],
    virus: ['bacteria', 'mammal'],
    fossil: ['reptile', 'marine'],
    mineral: ['fossil', 'virus'],
};
export const WEAK = Object.fromEntries(Object.keys(STRONG).map((t) => [t, Object.keys(STRONG).filter((o) => STRONG[o].includes(t))]));

export function typeMult(attacker, defender) {
    if (STRONG[attacker]?.includes(defender)) return STRONG_MULT;
    if (STRONG[defender]?.includes(attacker)) return WEAK_MULT;
    return 1;
}

// Role of each type: how its power splits between attack, defence and speed.
export const PROFILES = {
    mammal: { atk: 1.15, def: 1.0, spd: 0.85, role: 'Prédateur' },
    bird: { atk: 0.95, def: 0.75, spd: 1.3, role: 'Rapide' },
    reptile: { atk: 1.0, def: 1.25, spd: 0.75, role: 'Blindé' },
    fish: { atk: 0.95, def: 0.9, spd: 1.15, role: 'Agile' },
    arthropod: { atk: 1.05, def: 0.8, spd: 1.15, role: 'Nuée' },
    marine: { atk: 0.9, def: 1.2, spd: 0.9, role: 'Contrôle' },
    plant: { atk: 0.8, def: 1.15, spd: 1.05, role: 'Soutien' },
    tree: { atk: 0.85, def: 1.45, spd: 0.7, role: 'Rempart' },
    alga: { atk: 0.85, def: 1.0, spd: 1.15, role: 'Soin' },
    fungus: { atk: 1.0, def: 1.1, spd: 0.9, role: 'Drain' },
    mold: { atk: 1.05, def: 0.85, spd: 1.1, role: 'Poison' },
    bacteria: { atk: 0.95, def: 0.8, spd: 1.25, role: 'Croissance' },
    virus: { atk: 1.35, def: 0.6, spd: 1.05, role: 'Infection' },
    fossil: { atk: 1.3, def: 1.1, spd: 0.6, role: 'Colosse' },
    mineral: { atk: 0.9, def: 1.5, spd: 0.6, role: 'Bastion' },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Battle stats from the card's real data: PV (from its popularity), its type's role,
 * and its body — heavy animals hit and resist harder but are slower, tall or long
 * species resist better, tiny ones are quicker.
 */
export function battleStats(card) {
    const s = card.stats || card;
    const hp = Number(s.hp ?? card.hp) || 50;
    const p = PROFILES[card.type] || PROFILES.plant;
    const kg = Number(s.mass_kg) || 0;
    const size = Math.max(Number(s.length_m) || 0, Number(s.height_m) || 0);
    const mass = kg > 0 ? clamp(Math.log10(kg) + 1, 0, 5) : 0; // 100 g → 0 … 10 t → 5
    const body = size > 0 ? clamp(Math.log10(size) + 1, 0, 3) : 0; // 10 cm → 0 … 100 m → 3
    const tiny = kg > 0 && kg < 0.1 ? 0.1 : 0;
    const base = 8 + hp * 0.5;
    return {
        hp,
        atk: Math.max(5, Math.round(base * p.atk * (1 + mass * 0.05 + body * 0.03))),
        def: Math.max(5, Math.round(base * p.def * (1 + mass * 0.04 + body * 0.04))),
        spd: Math.max(5, Math.round(base * p.spd * (1 - mass * 0.04 + tiny))),
    };
}

/**
 * One special ability per type. `cost` in energy, `power` scales a normal attack.
 * `priority` abilities resolve before attacks, like switching.
 */
export const ABILITIES = {
    mammal: { name: 'Assaut', cost: 2, power: 1.8, text: 'Une attaque à 180 % de puissance.' },
    bird: { name: 'Piqué', cost: 2, power: 1.4, pierce: true, text: 'Attaque à 140 % qui ignore la protection et les boucliers.' },
    reptile: { name: 'Carapace', cost: 2, shield: 0.4, priority: true, text: 'Bouclier de 40 % de ses PV max, posé avant les attaques.' },
    fish: { name: 'Esquive', cost: 2, power: 0.8, dodge: true, priority: true, text: 'Évite toutes les attaques de la manche, puis contre-attaque à 80 %.' },
    arthropod: { name: 'Essaim', cost: 2, power: 1, splash: 0.5, text: 'Attaque normale, et 50 % des dégâts sur chaque carte en réserve adverse.' },
    marine: { name: "Jet d'encre", cost: 2, power: 0.6, drain: 2, text: "Attaque à 60 % et vole 2 ⚡ d'énergie à l'adversaire." },
    plant: { name: 'Pollen', cost: 2, healTeam: 0.2, text: 'Soigne toute ton équipe de 20 % de ses PV max.' },
    tree: { name: 'Écorce', cost: 2, shield: 0.25, thorns: 2, priority: true, text: 'Bouclier de 25 % et renvoie 50 % des dégâts subis pendant 2 manches.' },
    alga: { name: 'Photosynthèse', cost: 2, heal: 0.4, priority: true, text: 'Se soigne de 40 % de ses PV max, avant les attaques.' },
    fungus: { name: 'Mycélium', cost: 2, power: 1.1, lifesteal: 0.6, text: 'Attaque à 110 % et récupère 60 % des dégâts infligés.' },
    mold: { name: 'Spores', cost: 2, poison: 0.1, poisonTurns: 3, weaken: 2, text: "Empoisonne (10 % des PV max par manche, 3 manches) et baisse l'ATQ de 30 % pendant 2 manches." },
    bacteria: { name: 'Prolifération', cost: 1, boost: 1, maxBoost: 3, text: "+30 % d'ATQ tant qu'elle reste en jeu (jusqu'à 3 fois)." },
    virus: { name: 'Contagion', cost: 2, power: 0.6, poison: 0.12, poisonTurns: 3, text: 'Attaque à 60 % et infecte (12 % des PV max par manche, 3 manches).' },
    fossil: { name: 'Impact ancestral', cost: 4, power: 2.4, text: 'Une frappe colossale à 240 % de puissance.' },
    mineral: { name: 'Cristallisation', cost: 3, shield: 0.6, priority: true, text: 'Bouclier de 60 % de ses PV max, posé avant les attaques.' },
};

export const RULES = {
    teamSize: TEAM_SIZE, maxEnergy: MAX_ENERGY, maxRounds: MAX_ROUNDS,
    strongMult: STRONG_MULT, weakMult: WEAK_MULT, guardFactor: GUARD_FACTOR,
};

// ---------- state ----------

export function fighter(card) {
    const st = battleStats(card);
    return {
        id: card.id, name: card.name, type: card.type, rarity: card.rarity, thumb_url: card.thumb_url,
        maxHp: st.hp, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd,
        shield: 0, poison: 0, poisonTurns: 0, weak: 0, thorns: 0, boost: 0,
    };
}

/** side 0 = player, side 1 = AI. `ai` 1 = naive, 2 = tactician, 3 = expert. */
export function newBattle(playerCards, aiCards, { ai = 2, names = ['Toi', 'Adversaire'] } = {}) {
    const state = {
        round: 0, maxRounds: MAX_ROUNDS, ai, names,
        teams: [playerCards.map(fighter), aiCards.map(fighter)],
        active: [0, 0], energy: [0, 0], switchedAt: [-9, -9],
        phase: 'choose', winner: null, intent: null, log: [],
    };
    startRound(state);
    return state;
}

const alive = (f) => f.hp > 0;
const activeOf = (state, side) => state.teams[side][state.active[side]];
const effAtk = (f) => f.atk * (1 + 0.3 * f.boost) * (f.weak > 0 ? 0.7 : 1);

/** Damage of a hit before shields — the same formula for everybody. */
export function hitDamage(attacker, defender, power = 1, { guard = false, pierce = false } = {}) {
    const atk = effAtk(attacker);
    const ratio = clamp(atk / defender.def, 0.25, 4);
    let dmg = power * typeMult(attacker.type, defender.type) * 0.65 * atk * Math.sqrt(ratio);
    if (guard && !pierce) dmg *= GUARD_FACTOR;
    return Math.max(1, Math.round(dmg));
}

function startRound(state) {
    state.round += 1;
    for (const side of [0, 1]) state.energy[side] = Math.min(MAX_ENERGY, state.energy[side] + 1);
    state.phase = 'choose';
    state.intent = aiDecide(state);
}

// ---------- actions ----------

/** Every action the given side can legally take now. */
export function legalActions(state, side) {
    const team = state.teams[side];
    if (state.phase === 'over') return [];
    const cur = state.active[side];
    const switches = team.map((f, i) => (i !== cur && alive(f) ? { kind: 'switch', to: i } : null)).filter(Boolean);
    if (!alive(team[cur])) return switches; // replacement after a KO
    const me = team[cur];
    const ab = ABILITIES[me.type];
    const list = [{ kind: 'attack' }];
    if (state.energy[side] >= ab.cost && !(ab.boost && me.boost >= ab.maxBoost)) list.push({ kind: 'special' });
    list.push({ kind: 'guard' });
    return [...list, ...switches];
}

const sameAction = (a, b) => a.kind === b.kind && (a.kind !== 'switch' || a.to === b.to);

function isPriority(state, side, action) {
    if (action.kind === 'switch' || action.kind === 'guard') return true;
    return action.kind === 'special' && ABILITIES[activeOf(state, side).type].priority;
}

// The log is a list of events the site replays one by one; each carries the state of
// the card it touched afterwards, so HP bars can move in step.
function ev(state, list, e) {
    const f = e.side != null && e.slot != null ? state.teams[e.side][e.slot] : null;
    list.push(f ? { ...e, hp: f.hp, shield: f.shield } : e);
}

function applyDamage(state, events, side, slot, amount, { pierce = false, source } = {}) {
    const f = state.teams[side][slot];
    let left = amount;
    if (!pierce && f.shield > 0) {
        const absorbed = Math.min(f.shield, left);
        f.shield -= absorbed;
        left -= absorbed;
    }
    f.hp = Math.max(0, f.hp - left);
    ev(state, events, { kind: 'damage', side, slot, amount, source });
    if (!alive(f)) ev(state, events, { kind: 'ko', side, slot, text: `${f.name} est K.O. !` });
    return amount;
}

function heal(state, events, side, slot, amount) {
    const f = state.teams[side][slot];
    if (!alive(f)) return;
    const gained = Math.min(f.maxHp - f.hp, Math.round(amount));
    f.hp += gained;
    if (gained > 0) ev(state, events, { kind: 'heal', side, slot, amount: gained });
}

function doSwitch(state, events, side, to) {
    const from = state.active[side];
    state.active[side] = to;
    state.switchedAt[side] = state.round;
    const team = state.teams[side];
    team[from].boost = 0; // growth is lost when the card leaves the field
    ev(state, events, { kind: 'switch', side, slot: to, from, text: `${team[to].name} entre en jeu${alive(team[from]) ? ` à la place de ${team[from].name}` : ''}.` });
}

// A damaging hit from side's active card on the foe's active card.
function strike(state, events, side, power, opts = {}) {
    const me = activeOf(state, side);
    const foeSide = 1 - side;
    const slot = state.active[foeSide];
    const foe = state.teams[foeSide][slot];
    if (!alive(foe)) return 0;
    if (foe.dodging && !opts.pierce) {
        ev(state, events, { kind: 'dodge', side: foeSide, slot, text: `${foe.name} esquive !` });
        return 0;
    }
    const dmg = hitDamage(me, foe, power, { guard: foe.guarding, pierce: opts.pierce });
    const mult = typeMult(me.type, foe.type);
    applyDamage(state, events, foeSide, slot, dmg, { pierce: opts.pierce, source: { side, slot: state.active[side], mult } });
    if (foe.thorns > 0 && alive(me)) {
        const back = Math.max(1, Math.round(dmg * 0.5));
        ev(state, events, { kind: 'info', side: foeSide, slot, text: `L'écorce de ${foe.name} renvoie ${back} dégâts.` });
        applyDamage(state, events, side, state.active[side], back);
    }
    return dmg;
}

function act(state, events, side, action) {
    const team = state.teams[side];
    const me = activeOf(state, side);
    const slot = state.active[side];
    if (action.kind === 'switch') return doSwitch(state, events, side, action.to);
    if (!alive(me)) return;
    if (action.kind === 'guard') {
        me.guarding = true;
        state.energy[side] = Math.min(MAX_ENERGY, state.energy[side] + 1);
        return ev(state, events, { kind: 'guard', side, slot, text: `${me.name} se protège (+1 ⚡).` });
    }
    if (action.kind === 'attack') {
        ev(state, events, { kind: 'act', side, slot, text: `${me.name} attaque.` });
        return strike(state, events, side, 1);
    }
    const ab = ABILITIES[me.type];
    ev(state, events, { kind: 'act', side, slot, special: true, text: `${me.name} utilise ${ab.name} !` });
    if (ab.shield) {
        me.shield = Math.min(Math.round(me.maxHp * 0.6), me.shield + Math.round(me.maxHp * ab.shield));
        ev(state, events, { kind: 'shield', side, slot, text: `Bouclier de ${me.shield} points.` });
    }
    if (ab.thorns) me.thorns = ab.thorns;
    if (ab.heal) heal(state, events, side, slot, me.maxHp * ab.heal);
    if (ab.healTeam) team.forEach((f, i) => heal(state, events, side, i, f.maxHp * ab.healTeam));
    if (ab.boost) {
        me.boost = Math.min(ab.maxBoost, me.boost + 1);
        ev(state, events, { kind: 'boost', side, slot, text: `ATQ de ${me.name} : +${me.boost * 30} %.` });
    }
    const foeSide = 1 - side;
    const foeSlot = state.active[foeSide];
    const foe = state.teams[foeSide][foeSlot];
    let dealt = 0;
    if (ab.power && !ab.dodge) dealt = strike(state, events, side, ab.power, { pierce: ab.pierce }); // a dodge counters later
    if (ab.lifesteal && dealt) heal(state, events, side, slot, dealt * ab.lifesteal);
    if (ab.splash && dealt) {
        state.teams[foeSide].forEach((f, i) => {
            if (i === foeSlot || !alive(f)) return;
            applyDamage(state, events, foeSide, i, Math.max(1, Math.round(hitDamage(me, f, ab.power) * ab.splash)), { source: { side, slot } });
        });
    }
    if (ab.drain) {
        const stolen = Math.min(ab.drain, state.energy[foeSide]);
        state.energy[foeSide] -= stolen;
        ev(state, events, { kind: 'drain', side: foeSide, amount: stolen, text: `L'adversaire perd ${stolen} ⚡.` });
    }
    if (ab.poison && alive(foe) && !(foe.dodging && !ab.pierce)) {
        foe.poison = Math.max(foe.poison, Math.max(1, Math.round(foe.maxHp * ab.poison)));
        foe.poisonTurns = ab.poisonTurns;
        ev(state, events, { kind: 'poison', side: foeSide, slot: foeSlot, text: `${foe.name} est empoisonné (${foe.poison} par manche).` });
    }
    if (ab.weaken && alive(foe) && !foe.dodging) {
        foe.weak = ab.weaken;
        ev(state, events, { kind: 'weak', side: foeSide, slot: foeSlot, text: `ATQ de ${foe.name} : −30 %.` });
    }
}

// ---------- round resolution ----------

function teamAlive(team) { return team.some(alive); }

function checkEnd(state, events) {
    const p = teamAlive(state.teams[0]);
    const a = teamAlive(state.teams[1]);
    if (p && a && state.round < state.maxRounds) return false;
    let winner;
    if (p && !a) winner = 0;
    else if (!p) winner = 1; // both wiped out: the defender keeps the field
    else {
        // round limit: the team with more health left (in % of its total) wins
        const pct = (team) => team.reduce((s, f) => s + f.hp, 0) / team.reduce((s, f) => s + f.maxHp, 0);
        winner = pct(state.teams[0]) > pct(state.teams[1]) ? 0 : 1;
        ev(state, events, { kind: 'info', text: `Limite de ${state.maxRounds} manches : victoire aux PV restants.` });
    }
    state.phase = 'over';
    state.winner = winner;
    state.intent = null;
    ev(state, events, { kind: 'end', winner, text: winner === 0 ? 'Victoire !' : 'Défaite…' });
    return true;
}

function endOfRound(state, events) {
    for (const side of [0, 1]) {
        state.teams[side].forEach((f, i) => {
            f.guarding = false;
            f.dodging = false;
            if (!alive(f)) return;
            if (f.poisonTurns > 0) {
                ev(state, events, { kind: 'info', side, slot: i, text: `Le poison ronge ${f.name}.` });
                applyDamage(state, events, side, i, f.poison, { pierce: true });
                f.poisonTurns -= 1;
                if (!f.poisonTurns) f.poison = 0;
            }
            if (f.weak > 0) f.weak -= 1;
            if (f.thorns > 0) f.thorns -= 1;
        });
    }
}

/** The AI replaces a knocked-out card with the best one against the player's active. */
function aiReplace(state, events) {
    const team = state.teams[1];
    if (alive(team[state.active[1]]) || !teamAlive(team)) return;
    const foe = activeOf(state, 0);
    const best = team.map((f, i) => ({ i, f })).filter(({ f }) => alive(f))
        .sort((a, b) => matchScore(state, b.f, foe) - matchScore(state, a.f, foe) || a.i - b.i)[0];
    doSwitch(state, events, 1, best.i);
}

// How good card `f` is against `foe`: damage it deals per round minus damage it takes.
function matchScore(state, f, foe) {
    if (!alive(foe)) return effAtk(f);
    const dealt = hitDamage(f, foe) / foe.maxHp;
    const taken = hitDamage(foe, f) / f.maxHp;
    return dealt - taken + (f.hp / f.maxHp) * 0.3;
}

/**
 * Plays one round (or a replacement after a KO). Mutates `state` and returns the
 * events. Throws on an illegal action.
 */
export function playRound(state, action) {
    if (state.phase === 'over') throw new Error('Le combat est terminé');
    const legal = legalActions(state, 0);
    if (!action || !legal.some((a) => sameAction(a, action))) throw new Error('Action impossible');
    const events = [];

    if (state.phase === 'replace') {
        doSwitch(state, events, 0, action.to);
        startRound(state);
        return events;
    }

    const aiAction = state.intent?.action || { kind: 'attack' };
    const actions = [action, legalActions(state, 1).some((a) => sameAction(a, aiAction)) ? aiAction : { kind: 'attack' }];
    // specials are paid when chosen
    for (const side of [0, 1]) {
        if (actions[side].kind === 'special') state.energy[side] -= ABILITIES[activeOf(state, side).type].cost;
    }
    // fish dodge is up from the very start of the round
    for (const side of [0, 1]) {
        const ab = ABILITIES[activeOf(state, side).type];
        if (actions[side].kind === 'special' && ab.dodge) activeOf(state, side).dodging = true;
    }
    // speed of each side's card *after* switches decides who goes first among the rest
    const prio = [0, 1].filter((s) => isPriority(state, s, actions[s]));
    const first = (sides) => sides.sort((a, b) => activeOf(state, b).spd - activeOf(state, a).spd || a - b);
    for (const side of first(prio)) act(state, events, side, actions[side]);
    for (const side of first([0, 1].filter((s) => !prio.includes(s)))) act(state, events, side, actions[side]);
    // the dodge's counter-attack comes last
    for (const side of prio) {
        const ab = ABILITIES[activeOf(state, side).type];
        if (actions[side].kind === 'special' && ab.dodge && alive(activeOf(state, side))) {
            ev(state, events, { kind: 'act', side, slot: state.active[side], text: `${activeOf(state, side).name} contre-attaque.` });
            strike(state, events, side, ab.power);
        }
    }
    endOfRound(state, events);
    if (checkEnd(state, events)) return events;
    aiReplace(state, events);
    if (!alive(activeOf(state, 0))) {
        state.phase = 'replace';
        state.intent = null;
        return events;
    }
    startRound(state);
    return events;
}

// ---------- AI ----------

function abilityUseful(state, side, f, foe) {
    const ab = ABILITIES[f.type];
    const team = state.teams[side];
    if (ab.shield) return f.shield < f.maxHp * 0.15 && f.hp < f.maxHp * 0.9;
    if (ab.heal) return f.hp <= f.maxHp * 0.55;
    if (ab.healTeam) return team.reduce((s, t) => s + (alive(t) ? t.maxHp - t.hp : 0), 0) >= f.maxHp * 0.35;
    if (ab.boost) return f.boost < ab.maxBoost && f.hp > f.maxHp * 0.4;
    if (ab.dodge) return hitDamage(foe, f) >= f.hp * 0.3;
    if (ab.drain) return state.energy[1 - side] >= 2 || hitDamage(f, foe, ab.power) >= foe.hp;
    if (ab.weaken) return !foe.poisonTurns;
    if (ab.poison) return !foe.poisonTurns || hitDamage(f, foe, ab.power) >= foe.hp;
    return true; // pure damage
}

function describe(state, side, action) {
    const me = activeOf(state, side);
    const foe = activeOf(state, 1 - side);
    if (action.kind === 'switch') {
        const to = state.teams[side][action.to];
        return { label: `Changer pour ${to.name}`, text: `${me.name} va laisser sa place à ${to.name}.`, icon: 'switch' };
    }
    if (action.kind === 'guard') return { label: 'Se protéger', text: `${me.name} va se protéger (dégâts reçus ÷ 2).`, icon: 'guard' };
    if (action.kind === 'attack') {
        return { label: 'Attaque', text: `${me.name} va attaquer ta carte active.`, icon: 'attack', damage: hitDamage(me, foe), mult: typeMult(me.type, foe.type) };
    }
    const ab = ABILITIES[me.type];
    return {
        label: ab.name, text: `${me.name} va utiliser ${ab.name} : ${ab.text}`, icon: 'special', special: me.type,
        damage: ab.power ? hitDamage(me, foe, ab.power, { pierce: ab.pierce }) : undefined, mult: ab.power ? typeMult(me.type, foe.type) : undefined,
    };
}

/**
 * The AI's choice for this round — a fixed rule list, so a player who reads the
 * intention can always counter it. Level 1 never switches nor guards.
 */
function aiDecide(state) {
    const side = 1;
    const me = activeOf(state, side);
    const foe = activeOf(state, 0);
    const legal = legalActions(state, side);
    const can = (a) => legal.some((l) => sameAction(l, a));
    const ab = ABILITIES[me.type];
    const pick = (action, why) => ({ action, why, ...describe(state, side, action) });

    // 1. finish the foe when possible
    if (hitDamage(me, foe) >= foe.hp + foe.shield) return pick({ kind: 'attack' }, 'ko');
    if (can({ kind: 'special' }) && ab.power && hitDamage(me, foe, ab.power, { pierce: ab.pierce }) >= foe.hp + (ab.pierce ? 0 : foe.shield)) {
        return pick({ kind: 'special' }, 'ko');
    }
    if (state.ai >= 2) {
        // 2. flee a bad matchup (not twice in a row)
        const bench = state.teams[side].map((f, i) => ({ f, i })).filter(({ f, i }) => i !== state.active[side] && alive(f));
        const here = matchScore(state, me, foe);
        if (state.switchedAt[side] < state.round - 1 && typeMult(foe.type, me.type) > 1) {
            const better = bench.map((b) => ({ ...b, s: matchScore(state, b.f, foe) })).filter((b) => b.s > here + 0.15 && typeMult(foe.type, b.f.type) <= 1)
                .sort((a, b) => b.s - a.s || a.i - b.i)[0];
            if (better) return pick({ kind: 'switch', to: better.i }, 'matchup');
        }
        // 3. about to be knocked out without being able to strike back first: guard
        const threat = hitDamage(foe, me);
        if (state.ai >= 3 && threat >= me.hp + me.shield && foe.spd >= me.spd && state.energy[side] < ab.cost) {
            return pick({ kind: 'guard' }, 'survive');
        }
    }
    // 4. the ability when it helps, otherwise a plain attack
    if (can({ kind: 'special' }) && abilityUseful(state, side, me, foe)) return pick({ kind: 'special' }, 'special');
    // fossils save up for their big hit
    if (state.ai >= 2 && ab.cost >= 4 && state.energy[side] === ab.cost - 1 && hitDamage(foe, me) < me.hp * 0.5) {
        return pick({ kind: 'guard' }, 'charge');
    }
    return pick({ kind: 'attack' }, 'attack');
}

// ---------- previews ----------

const clone = (o) => JSON.parse(JSON.stringify(o));

/** What each of the player's options would do this round — exact, since nothing is random. */
export function previews(state) {
    return legalActions(state, 0).map((action) => {
        const s = clone(state);
        const events = playRound(s, action);
        const sum = (side) => events.filter((e) => e.kind === 'damage' && e.side === side).reduce((t, e) => t + e.amount, 0);
        return {
            action,
            dealt: sum(1),
            taken: sum(0),
            koFoe: events.some((e) => e.kind === 'ko' && e.side === 1),
            koSelf: events.some((e) => e.kind === 'ko' && e.side === 0),
            win: s.phase === 'over' && s.winner === 0,
            lose: s.phase === 'over' && s.winner === 1,
        };
    });
}

/** The state as the player sees it (everything is public in this game). */
export function view(state) {
    const { teams, ...rest } = state;
    return {
        ...rest,
        teams: teams.map((t) => t.map(({ guarding, dodging, ...f }) => f)),
        options: state.phase === 'over' ? [] : previews(state),
    };
}
