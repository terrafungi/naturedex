/**
 * Honey shop: cosmetics bought once with the garden's honey, worn by the player everywhere.
 * - scene: drawn background behind the avatar (replaces the plain colour)
 * - fx: small animated effect around the avatar (pollen, petals, fireflies…)
 * - frame: card frame shown around the player's own cards (collection, boosters, profile)
 * Equipped ids live in users.avatar next to the clothes ('aucun' = none); ownership in user_items
 * as "slot:id", like the avatar items. The drawings live in the browser (PlayerAvatar.jsx, index.css).
 */
const item = (id, name, price) => ({ id, name, price });

export const COSMETICS = {
    scene: [
        item('prairie', 'Prairie fleurie', 120), item('rayons', 'Rayons de miel', 150), item('sousbois', 'Sous-bois', 180),
        item('couchant', 'Soleil couchant', 220), item('lucioles', 'Nuit des lucioles', 260), item('cerisiers', 'Pluie de cerisiers', 300),
        item('lagon', 'Lagon', 300), item('aurore', 'Aurore boréale', 400),
    ],
    fx: [
        item('pollen', 'Pollen doré', 150), item('petales', 'Pétales', 200), item('lucioles', 'Lucioles', 250),
        item('papillons', 'Papillons', 300), item('flocons', 'Flocons', 300), item('arcenciel', 'Halo arc-en-ciel', 500),
    ],
    frame: [
        item('bois', 'Bois sculpté', 150), item('lierre', 'Lierre', 200), item('miel', 'Rayon de miel', 250),
        item('fleurs', 'Couronne fleurie', 300), item('givre', 'Givre', 350), item('or', 'Or massif', 500), item('aurore', 'Aurore', 600),
    ],
};
export const COSMETIC_SLOTS = Object.keys(COSMETICS);
export const COSMETIC = Object.fromEntries(COSMETIC_SLOTS.map((slot) => [slot, Object.fromEntries(COSMETICS[slot].map((i) => [i.id, i]))]));
export const cosmeticKey = (slot, id) => `${slot}:${id}`;
