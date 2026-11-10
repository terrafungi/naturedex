import {
    Bird, Biohazard, Bone, Bug, Fish, Flower2, Gem, GraduationCap, PawPrint, Shell, Shrimp, Snail, TreeDeciduous, Turtle, Waves,
} from 'lucide-react';

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function MushroomIcon(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M3 12a9 7 0 0 1 18 0z" />
            <path d="M9.5 12v5.5a2.5 2.5 0 0 0 5 0V12" />
            <circle cx="8.5" cy="8.5" r="1" /><circle cx="14" cy="7" r="1" />
        </svg>
    );
}

function BacteriumIcon(props) {
    return (
        <svg {...svgProps} {...props}>
            <rect x="4" y="8" width="16" height="8" rx="4" transform="rotate(-30 12 12)" />
            <path d="M19 5.5l2-1.5M5 18.5l-2 1.5M17.5 3.5l.5-2M6.5 20.5l-.5 2" />
        </svg>
    );
}

function SporesIcon(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M12 21v-7M12 14c-3 0-5-2-5-5M12 14c3 0 5-2 5-5M12 14V8" />
            <circle cx="7" cy="7" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="12" cy="5" r="2" />
        </svg>
    );
}

export const TYPES = {
    mammal:    { label: 'Mammifère', color: '#e2683c', Icon: PawPrint, attacks: ['Coup de griffe', 'Charge', 'Hurlement', 'Morsure'] },
    bird:      { label: 'Oiseau', color: '#3b82f6', Icon: Bird, attacks: ['Piqué', 'Coup de bec', 'Bourrasque', 'Chant'] },
    reptile:   { label: 'Reptile & amphibien', color: '#22a35a', Icon: Turtle, attacks: ['Morsure', 'Mue', 'Langue collante', 'Carapace'] },
    fish:      { label: 'Poisson', color: '#0ea5e9', Icon: Fish, attacks: ['Banc tournoyant', 'Nage rapide', 'Aileron', 'Remous'] },
    arthropod: { label: 'Insecte & arachnide', color: '#e09b00', Icon: Bug, attacks: ['Piqûre', 'Essaim', 'Toile', 'Mandibules'] },
    terrestrial: { label: 'Mollusque terrestre', color: '#b7791f', Icon: Snail, attacks: ['Bave', 'Râpe', 'Fouissage', 'Repli'] },
    aquatic:   { label: 'Mollusque aquatique', color: '#c0567a', Icon: Shell, attacks: ['Ventouses', 'Coquille', 'Jet d\'encre', 'Filtration'] },
    marine:    { label: 'Créature aquatique', color: '#4f46e5', Icon: Shrimp, attacks: ['Tentacules', 'Jet d\'encre', 'Pince', 'Courant'] },
    plant:     { label: 'Plante', color: '#65a30d', Icon: Flower2, attacks: ['Pollinisation', 'Épines', 'Lianes', 'Parfum'] },
    tree:      { label: 'Arbre', color: '#15803d', Icon: TreeDeciduous, attacks: ['Racines profondes', 'Chute de glands', 'Sève', 'Canopée'] },
    alga:      { label: 'Algue', color: '#0d9488', Icon: Waves, attacks: ['Photosynthèse', 'Marée verte', 'Enlacement', 'Bloom'] },
    fungus:    { label: 'Champignon', color: '#c2410c', Icon: MushroomIcon, attacks: ['Nuage de spores', 'Mycélium', 'Toxine', 'Rond de sorcière'] },
    mold:      { label: 'Moisissure & levure', color: '#889c24', Icon: SporesIcon, attacks: ['Fermentation', 'Spores', 'Colonisation', 'Décomposition'] },
    bacteria:  { label: 'Bactérie', color: '#8b5cf6', Icon: BacteriumIcon, attacks: ['Division', 'Biofilm', 'Flagelle', 'Toxine'] },
    virus:     { label: 'Virus', color: '#e11d74', Icon: Biohazard, attacks: ['Réplication', 'Mutation', 'Contagion', 'Capside'] },
    fossil:    { label: 'Fossile', color: '#a8763e', Icon: Bone, attacks: ['Rugissement ancestral', 'Pétrification', 'Âge de pierre', 'Extinction'] },
    mineral:   { label: 'Minéral & roche', color: '#6d7fa3', Icon: Gem, attacks: ['Éclat cristallin', 'Érosion', 'Éboulement', 'Coulée de magma'] },
    // the Naturaliste cards of the Duel (scientists, objects, stades): no battle stats
    naturalist: { label: 'Naturaliste', color: '#ff8a65', Icon: GraduationCap, attacks: [] },
};

export const RARITIES = {
    common:    { label: 'Commune', symbol: '●', order: 0, color: '#9ca3af' },
    uncommon:  { label: 'Peu commune', symbol: '◆', order: 1, color: '#10b981' },
    rare:      { label: 'Rare', symbol: '★', order: 2, color: '#4ea8ff' },
    epic:      { label: 'Épique', symbol: '★★', order: 3, color: '#a855f7' },
    legendary: { label: 'Légendaire', symbol: '★★★', order: 4, color: '#ffc53d' },
    secret:    { label: 'Secrète', symbol: '✦', order: 5, color: '#ff5fd2' },
};

// Server-side sorts (CARD_SORTS in the API); '' = rarest first, the default.
export const SORTS = [
    ['', 'Rareté (rares d\'abord)'],
    ['rarityAsc', 'Rareté (communes d\'abord)'],
    ['recent', 'Obtenues récemment'],
    ['name', 'Nom (A → Z)'],
    ['num', 'Numéro'],
    ['count', 'Nombre d\'exemplaires'],
    ['type', 'Type'],
    ['hp', 'Points de vie'],
    ['atk', 'Attaque'],
    ['views', 'Popularité'],
];

export const IUCN = {
    LC: { label: 'Préoccupation mineure', color: '#4f7a3a' },
    NT: { label: 'Quasi menacée', color: '#8a8f2a' },
    VU: { label: 'Vulnérable', color: '#c08a1f' },
    EN: { label: 'En danger', color: '#c0611f' },
    CR: { label: 'En danger critique', color: '#b5323b' },
    EW: { label: 'Éteinte à l\'état sauvage', color: '#5d3a6b' },
    EX: { label: 'Éteinte', color: '#2b2b2b' },
    DD: { label: 'Données insuffisantes', color: '#7a7a7a' },
};

// Decorative attacks, derived deterministically from the card so they never change.
export function attacksFor(card) {
    const names = TYPES[card.type]?.attacks || ['Attaque'];
    const hp = card.hp ?? card.stats?.hp ?? 60;
    const first = names[card.id % names.length];
    const second = names[(card.id * 7 + 3) % names.length];
    const list = [{ name: first, dmg: Math.max(10, Math.round(hp * 0.25 / 10) * 10) }];
    if (second !== first && hp >= 80) list.push({ name: second, dmg: Math.round(hp * 0.55 / 10) * 10 });
    return list;
}

export function formatViews(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
    return String(n);
}
