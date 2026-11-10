/**
 * The garden as a floating 3D island (three.js), built from simple low-poly shapes: the 3×3 plots
 * with their plants growing in 4 stages, the villagers' order board, the barn, the hive, the
 * workshop, the mushroom arcade, the quest chest, the pond and every decoration bought with honey.
 * Day and night follow the Paris clock (fireflies, lanterns, glowing mushrooms), rain falls when it
 * waters the garden. Drag to turn around the island, pinch or scroll to zoom, tap to play.
 * HTML labels (timers, « Prêt ! », counters) follow their 3D anchor every frame.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LOOK, daylight, growth } from './art.jsx';

const TAU = Math.PI * 2;
const GRID = 2.35;
const SOIL_TOP = 0.27;
const ISLAND = 9.4;
export const slotXZ = (slot) => [((slot % 3) - 1) * GRID, (1 - Math.floor(slot / 3)) * GRID];

// Tappable buildings: position on the island, label height.
export const PROPS = {
    orders: { pos: [-5.5, 4.1], rot: 0.7, h: 2.6 },
    barn: { pos: [-5.3, -4.5], rot: 0.75, h: 2.9 },
    hive: { pos: [5.1, -4.9], rot: -0.6, h: 2.2 },
    workshop: { pos: [6.3, -0.5], rot: -1.3, h: 1.9 },
    arcade: { pos: [0.3, -6.9], rot: 0, h: 3.6 },
    quests: { pos: [5.5, 4.6], rot: -0.7, h: 1.5 },
};
const DECOR_SPOTS = {
    lanterne: [[-3.75, -3.75], [3.75, -3.75], [-3.75, 3.75], [3.75, 3.75]],
    champis: [[-2.3, 6.7]],
    nichoir: [[7.4, 2.3]],
    banc: [[2.0, 6.9]],
    epouvantail: [[-4.5, -0.9]],
    fontaine: [[3.3, -6.7]],
    arche: [[0, 5.0]],
    moulin: [[-2.9, -7.2]],
    cerisier: [[7.3, -2.9]],
    // seasonal
    tulipes: [[-4.5, 1.5]], nid: [[-7.7, 2.9]], oeufs: [[-2.0, 4.7]],
    parasol: [[2.0, 4.8]], pasteques: [[3.9, 6.3]], tournesols: [[5.5, 2.3]],
    feuilles: [[-6.7, -2.3]], chataignes: [[-2.3, -5.3]], citrouilles: [[1.6, -4.8]],
    bonhomme: [[-0.7, -4.1]], cadeaux: [[-4.2, 6.0]], sapin: [[-4.7, -6.8]],
};
const POND = [-6.7, 0.3];
const TREES = [[-8.2, -1.8, 'pine'], [-7.6, -4.6, 'round'], [-1.0, -8.6, 'pine'], [2.2, -8.4, 'round'], [7.9, 0.5, 'pine'], [8.3, 4.0, 'round'], [-8.0, 4.5, 'pine'], [-5.0, 7.3, 'round'], [5.0, 7.4, 'pine'], [-8.6, 1.6, 'round'], [8.6, -1.4, 'round']];

// tiny deterministic random, so the scenery is the same every visit
function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function makeKit() {
    const mats = new Map();
    const geos = new Map();
    const glow = glowTexture();
    const mat = (m) => {
        if (m instanceof THREE.Material) return m;
        const o = typeof m === 'string' ? { color: m } : m;
        const k = JSON.stringify(o);
        if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true, ...o }));
        return mats.get(k);
    };
    const geo = (k, make) => {
        if (!geos.has(k)) geos.set(k, make());
        return geos.get(k);
    };
    const mesh = (g, m, pos, rot, scale) => {
        const x = new THREE.Mesh(g, mat(m));
        if (pos) x.position.set(...pos);
        if (rot) x.rotation.set(...rot);
        if (scale != null) typeof scale === 'number' ? x.scale.setScalar(scale) : x.scale.set(...scale);
        x.castShadow = true;
        x.receiveShadow = true;
        return x;
    };
    const group = (children, pos, rot, scale) => {
        const g = new THREE.Group();
        children.filter(Boolean).forEach((c) => g.add(c));
        if (pos) g.position.set(...pos);
        if (rot) g.rotation.set(...rot);
        if (scale != null) typeof scale === 'number' ? g.scale.setScalar(scale) : g.scale.set(...scale);
        return g;
    };
    const glowSprite = (color, size, opacity = 0.8) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.setScalar(size);
        s.userData.glow = opacity;
        return s;
    };
    const G = {
        sphere: (r, w = 10, h = 8) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h)),
        dome: (r, w = 14) => geo(`d${r},${w}`, () => new THREE.SphereGeometry(r, w, 7, 0, TAU, 0, Math.PI / 2)),
        cyl: (rt, rb, h, s = 10) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
        cone: (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
        box: (x, y, z) => geo(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z)),
        rbox: (x, y, z, r) => geo(`r${x},${y},${z},${r}`, () => new RoundedBoxGeometry(x, y, z, 2, r)),
        ico: (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
        dodeca: (r) => geo(`o${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
        torus: (r, t, rs = 8, ts = 20, arc = TAU) => geo(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
        capsule: (r, l) => geo(`p${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 8)),
        leaf: () => geo('leaf', () => new THREE.SphereGeometry(0.2, 8, 6).scale(1, 0.28, 0.55)),
        plane: (w, h) => geo(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
    };
    const dispose = () => {
        mats.forEach((m) => m.dispose());
        geos.forEach((g) => g.dispose());
        glow.dispose();
    };
    return { mat, mesh, group, glowSprite, G, dispose };
}

// ---------------------------------------------------------------- plants

function leaves(k, color, n, y, r = 0.14, size = 1) {
    return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU + 0.4;
        return k.mesh(k.G.leaf(), color, [Math.cos(a) * r, y, Math.sin(a) * r], [0, -a, 0.5], size);
    });
}

function buildPlant(k, kind, stage) {
    const c = LOOK[kind] || LOOK.tournesol;
    const stem = (h, r = 0.035) => k.mesh(k.G.cyl(r * 0.8, r, h, 6), '#3f8f3c', [0, h / 2, 0]);
    if (stage === 0) {
        return k.group([
            k.mesh(k.G.dome(0.34), '#5a3720', [0, -0.02, 0], null, [1, 0.45, 1]),
            k.mesh(k.G.sphere(0.07, 6, 5), '#d9b26a', [0.04, 0.13, 0.02]),
            k.mesh(k.G.leaf(), c.leaf, [0.06, 0.2, 0], [0, 0, 0.9], 0.5),
        ]);
    }
    if (stage === 1) return k.group([stem(0.35), ...leaves(k, c.leaf, 2, 0.36, 0.1, 0.8)]);
    if (stage === 2) {
        return k.group([stem(0.75), ...leaves(k, c.leaf, 3, 0.3, 0.16), ...leaves(k, c.leaf, 2, 0.55, 0.12, 0.8),
            k.mesh(k.G.sphere(0.12, 8, 6), { color: c.head, emissive: kind === 'champignon' ? c.head : '#000', emissiveIntensity: 0.4 }, [0, 0.8, 0])]);
    }
    const parts = [];
    switch (kind) {
        case 'radis':
            for (const [x, z] of [[-0.25, 0.1], [0.22, 0.18], [0, -0.22]]) {
                parts.push(k.mesh(k.G.sphere(0.22, 10, 8), c.head, [x, 0.1, z], null, [1, 0.9, 1]));
                parts.push(k.mesh(k.G.sphere(0.07, 6, 5), c.headHi, [x - 0.08, 0.2, z + 0.12]));
                for (let i = 0; i < 3; i++) parts.push(k.mesh(k.G.cone(0.06, 0.55, 5), c.leaf, [x + (i - 1) * 0.06, 0.45, z], [0, 0, (i - 1) * 0.35]));
            }
            break;
        case 'fraise':
            parts.push(...[[-0.2, 0.25, 0], [0.22, 0.28, 0.1], [0, 0.3, -0.2], [0.05, 0.35, 0.18]].map(([x, y, z]) => k.mesh(k.G.ico(0.3, 0), c.leaf, [x, y, z], null, [1, 0.6, 1])));
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * TAU;
                parts.push(k.mesh(k.G.cone(0.11, 0.24, 7), { color: c.head, roughness: 0.4 }, [Math.cos(a) * 0.42, 0.22, Math.sin(a) * 0.42], [Math.PI, 0, 0]));
            }
            break;
        case 'tournesol': {
            parts.push(stem(1.7, 0.06), ...leaves(k, c.leaf, 2, 0.6, 0.2, 1.6), ...leaves(k, c.leaf, 2, 1.1, 0.18, 1.3));
            const petals = Array.from({ length: 12 }, (_, i) => {
                const a = (i / 12) * TAU;
                return k.mesh(k.G.sphere(0.1, 6, 4), c.head, [Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0], [0, 0, a], [1.9, 0.75, 0.35]);
            });
            parts.push(k.group([k.mesh(k.G.cyl(0.27, 0.27, 0.1, 14), c.headHi, null, [Math.PI / 2, 0, 0]), ...petals], [0, 1.75, 0.05], [-0.35, 0, 0]));
            break;
        }
        case 'lavande':
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * TAU, r = i ? 0.25 : 0, tilt = i ? 0.25 : 0;
                parts.push(k.group([
                    k.mesh(k.G.cyl(0.02, 0.025, 0.8, 5), '#6f9c70', [0, 0.4, 0]),
                    k.mesh(k.G.capsule(0.07, 0.32), { color: c.head, roughness: 0.9 }, [0, 0.95, 0]),
                ], [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]));
            }
            parts.push(...leaves(k, c.leaf, 5, 0.1, 0.2, 0.9));
            break;
        case 'champignon':
            for (const [x, z, s] of [[-0.25, 0.15, 0.8], [0.28, 0.2, 0.65], [0, -0.18, 1.1]]) {
                parts.push(k.group([
                    k.mesh(k.G.cyl(0.08, 0.11, 0.5, 8), '#f2ead8', [0, 0.25, 0]),
                    k.mesh(k.G.dome(0.32), { color: c.head, emissive: c.head, emissiveIntensity: 0.9, roughness: 0.4 }, [0, 0.48, 0], null, [1, 0.75, 1]),
                    k.mesh(k.G.sphere(0.05, 5, 4), { color: c.headHi, emissive: c.headHi, emissiveIntensity: 0.8 }, [0.12, 0.66, 0.1]),
                    k.mesh(k.G.sphere(0.04, 5, 4), { color: c.headHi, emissive: c.headHi, emissiveIntensity: 0.8 }, [-0.1, 0.68, -0.05]),
                ], [x, 0, z], null, s));
            }
            parts.push(placed(k.glowSprite(c.head, 2.2, 0.5), [0, 0.6, 0]));
            break;
        case 'chene':
            parts.push(k.mesh(k.G.cyl(0.12, 0.18, 1.0, 7), '#7a4f2a', [0, 0.5, 0]));
            parts.push(k.mesh(k.G.ico(0.6, 0), c.head, [0, 1.35, 0]), k.mesh(k.G.ico(0.45, 0), c.head, [-0.38, 1.05, 0.15]),
                k.mesh(k.G.ico(0.42, 0), c.headHi, [0.35, 1.15, -0.1]), k.mesh(k.G.ico(0.32, 0), c.headHi, [0.05, 1.75, 0.1]));
            parts.push(k.mesh(k.G.sphere(0.06, 6, 5), '#b7793a', [0.3, 0.95, 0.4]), k.mesh(k.G.sphere(0.06, 6, 5), '#b7793a', [-0.4, 0.85, 0.42]));
            break;
        case 'bambou':
            for (const [x, z, n] of [[-0.25, 0.1, 4], [0.2, 0.22, 5], [0.05, -0.25, 3], [0.32, -0.12, 4]]) {
                for (let j = 0; j < n; j++) {
                    parts.push(k.mesh(k.G.cyl(0.07, 0.075, 0.42, 7), j % 2 ? c.leaf : c.head, [x, 0.21 + j * 0.44, z]));
                    parts.push(k.mesh(k.G.torus(0.075, 0.022, 4, 10), '#4f9a3c', [x, 0.43 + j * 0.44, z], [Math.PI / 2, 0, 0]));
                }
                parts.push(k.mesh(k.G.leaf(), c.leaf, [x + 0.15, n * 0.44, z], [0, 0.5, 0.4], 1.2), k.mesh(k.G.leaf(), c.leaf, [x - 0.15, n * 0.44 - 0.2, z], [0, -0.5, -0.4], 1.1));
            }
            break;
        case 'rose': {
            parts.push(...[[-0.18, 0.25, 0.05], [0.2, 0.3, 0], [0, 0.32, -0.2], [0, 0.4, 0.15]].map(([x, y, z]) => k.mesh(k.G.ico(0.28, 0), c.leaf, [x, y, z], null, [1, 0.7, 1])));
            parts.push(stem(0.9, 0.035));
            const bloom = Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * TAU;
                return k.mesh(k.G.sphere(0.14, 8, 6), { color: c.head, emissive: c.head, emissiveIntensity: 0.25, roughness: 0.5 }, [Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14], [0, -a, 0.6], [1, 0.8, 0.5]);
            });
            parts.push(k.group([...bloom, k.mesh(k.G.sphere(0.12, 8, 6), { color: c.headHi, emissive: c.headHi, emissiveIntensity: 0.3 }, [0, 0.05, 0])], [0, 1.0, 0]));
            parts.push(placed(k.glowSprite(c.head, 1.4, 0.45), [0, 1.0, 0]));
            break;
        }
        case 'lotus': {
            parts.push(k.mesh(k.G.cyl(0.85, 0.85, 0.05, 24), { color: '#4cc3e0', roughness: 0.15, metalness: 0.1, flatShading: false }, [0, 0.03, 0]));
            parts.push(k.mesh(k.G.cyl(0.32, 0.32, 0.03, 12), '#2e8a5c', [-0.45, 0.07, 0.3]), k.mesh(k.G.cyl(0.25, 0.25, 0.03, 12), '#2e8a5c', [0.5, 0.07, -0.25]));
            const petals = [];
            for (let ring = 0; ring < 2; ring++) {
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * TAU + ring * 0.4;
                    petals.push(k.mesh(k.G.sphere(0.16, 8, 6), { color: ring ? c.headHi : c.head, emissive: c.head, emissiveIntensity: 0.15 },
                        [Math.cos(a) * (0.22 - ring * 0.08), 0.12 + ring * 0.06, Math.sin(a) * (0.22 - ring * 0.08)], [0, -a, 0.9 - ring * 0.5], [0.5, 1.3, 0.25]));
                }
            }
            parts.push(k.group([...petals, k.mesh(k.G.sphere(0.09, 8, 6), '#ffd166', [0, 0.2, 0])], [0, 0.1, 0]));
            parts.push(placed(k.glowSprite(c.head, 1.6, 0.4), [0, 0.4, 0]));
            break;
        }
        default:
            parts.push(stem(0.8), ...leaves(k, c.leaf, 4, 0.4, 0.16));
    }
    return k.group(parts);
}

function buildPest(k) {
    const body = k.mesh(k.G.capsule(0.08, 0.2), { color: '#8a9a3a', roughness: 0.35 }, [0, 0.08, 0], [0, 0, Math.PI / 2]);
    const shell = k.mesh(k.G.sphere(0.12, 10, 8), '#b0743a', [-0.05, 0.17, 0], null, [1, 0.9, 0.8]);
    const swirl = k.mesh(k.G.torus(0.07, 0.02, 4, 12), '#7a4a22', [-0.05, 0.17, 0.09]);
    const eyes = [-0.04, 0.04].map((z) => k.group([
        k.mesh(k.G.cyl(0.012, 0.015, 0.14, 4), '#8a9a3a', [0, 0.07, 0]),
        k.mesh(k.G.sphere(0.025, 5, 4), '#1a1a1a', [0, 0.15, 0]),
    ], [0.17, 0.1, z], [0, 0, -0.4]));
    return k.group([body, shell, swirl, ...eyes], null, null, 1.3);
}

// ---------------------------------------------------------------- buildings and decorations

const WOOD = '#8a5a32', WOOD_D = '#5e3a1e', ROOF = '#a8372e';

function buildProp(k, key) {
    switch (key) {
        case 'orders': {
            const papers = [[-0.4, 0.15, '#fff6d8'], [0.1, 0.25, '#ffe9b0'], [0.45, -0.05, '#e9f7ff'], [-0.15, -0.25, '#fff6d8']].map(([x, y, col], i) => k.group([
                k.mesh(k.G.box(0.36, 0.42, 0.02), col, [0, 0, 0], [0, 0, (i - 1.5) * 0.12]),
                k.mesh(k.G.sphere(0.035, 5, 4), '#e04848', [0, 0.17, 0.02]),
            ], [x, 1.3 + y, 0.08]));
            return k.group([
                k.mesh(k.G.cyl(0.07, 0.08, 1.9, 6), WOOD_D, [-0.85, 0.95, 0]), k.mesh(k.G.cyl(0.07, 0.08, 1.9, 6), WOOD_D, [0.85, 0.95, 0]),
                k.mesh(k.G.rbox(1.9, 1.1, 0.12, 0.03), WOOD, [0, 1.3, 0]),
                k.mesh(k.G.box(2.2, 0.08, 0.5), ROOF, [0, 1.95, 0], [0.25, 0, 0]),
                ...papers,
            ]);
        }
        case 'barn': {
            const roof = k.mesh(k.G.cyl(1.25, 1.25, 1.9, 3), ROOF, [0, 1.62, 0], [0, 0, Math.PI / 2], [1, 1, 0.75]);
            return k.group([
                k.mesh(k.G.rbox(1.9, 1.3, 1.6, 0.05), '#c0453a', [0, 0.65, 0]),
                roof,
                k.mesh(k.G.box(0.8, 1.0, 0.04), '#f2e6d0', [0, 0.5, 0.81]),
                k.mesh(k.G.box(0.7, 0.9, 0.05), '#8f2f27', [0, 0.5, 0.82]),
                k.mesh(k.G.box(0.08, 1.15, 0.06), '#f2e6d0', [0, 0.5, 0.84], [0, 0, 0.66]),
                k.mesh(k.G.box(0.08, 1.15, 0.06), '#f2e6d0', [0, 0.5, 0.84], [0, 0, -0.66]),
                k.mesh(k.G.box(0.34, 0.34, 0.05), '#f2e6d0', [0, 1.6, 0.66]),
                k.mesh(k.G.cyl(0.32, 0.32, 0.55, 12), '#e9c46a', [1.25, 0.32, 0.5], [0, 0, Math.PI / 2]),
                k.mesh(k.G.cyl(0.32, 0.32, 0.55, 12), '#e0b850', [1.25, 0.32, -0.2], [0, 0, Math.PI / 2]),
            ]);
        }
        case 'hive': {
            const rings = [0.5, 0.52, 0.46, 0.36, 0.22].map((r, i) => k.mesh(k.G.torus(r, 0.13, 6, 16), { color: i % 2 ? '#d99a2b' : '#e8b44a', roughness: 0.9 }, [0, 0.95 + i * 0.2, 0], [Math.PI / 2, 0, 0]));
            return k.group([
                k.mesh(k.G.cyl(0.08, 0.1, 0.8, 6), WOOD_D, [0, 0.4, 0]),
                k.mesh(k.G.cyl(0.6, 0.6, 0.08, 10), WOOD, [0, 0.8, 0]),
                k.mesh(k.G.sphere(0.45, 12, 10), '#e8b44a', [0, 1.25, 0], null, [1, 1.1, 1]),
                ...rings,
                k.mesh(k.G.cyl(0.12, 0.12, 0.1, 10), '#3b2208', [0, 1.0, 0.5], [Math.PI / 2, 0, 0]),
                k.mesh(k.G.sphere(0.12, 8, 6), { color: '#ffb627', roughness: 0.2, emissive: '#ff9a00', emissiveIntensity: 0.3 }, [0.35, 0.9, 0.35], null, [1, 0.6, 1]),
            ]);
        }
        case 'workshop': {
            const planks = [];
            for (let s = 0; s < 4; s++) {
                const a = (s / 4) * TAU;
                for (let j = 0; j < 3; j++) planks.push(k.mesh(k.G.box(1.2, 0.2, 0.06), j % 2 ? WOOD : WOOD_D, [Math.sin(a) * 0.6, 0.15 + j * 0.25, Math.cos(a) * 0.6], [0, a, 0]));
            }
            return k.group([
                ...planks,
                k.mesh(k.G.box(1.1, 0.5, 1.1), '#5a3720', [0, 0.45, 0]),
                k.mesh(k.G.dome(0.5), '#6b4226', [0, 0.68, 0], null, [1.05, 0.35, 1.05]),
                ...leaves(k, '#6fd66b', 4, 0.8, 0.25, 0.9),
                k.group([k.mesh(k.G.cyl(0.03, 0.03, 1.1, 5), WOOD, [0, 0.55, 0]), k.mesh(k.G.box(0.22, 0.3, 0.03), '#9aa3ad', [0, -0.05, 0], null)], [0.75, 0.55, 0.55], [0.3, 0, -0.35]),
                k.mesh(k.G.box(0.5, 0.35, 0.5), '#e9d6a8', [-0.95, 0.18, 0.35], [0, 0.4, 0]),
            ]);
        }
        case 'arcade': {
            const spots = [[0.4, 0.55, 0.6], [-0.6, 0.5, 0.3], [0.1, 0.8, -0.5], [-0.2, 0.3, 0.95], [0.8, 0.3, -0.3]].map(([x, y, z]) => k.mesh(k.G.sphere(0.16, 8, 6), '#fff6e8', [x, 2.0 + y * 0.8, z], null, [1, 0.5, 1]));
            return k.group([
                k.mesh(k.G.cyl(0.85, 1.0, 1.9, 12), '#f2e2c4', [0, 0.95, 0]),
                k.mesh(k.G.dome(1.65, 18), { color: '#e2453b', roughness: 0.55 }, [0, 1.8, 0], null, [1, 0.8, 1]),
                k.mesh(k.G.cyl(1.66, 1.66, 0.14, 18), '#f2e2c4', [0, 1.82, 0]),
                ...spots,
                k.mesh(k.G.rbox(0.55, 0.9, 0.1, 0.04), '#7a4a26', [0, 0.45, 0.95]),
                k.mesh(k.G.sphere(0.04, 5, 4), '#e9c46a', [0.15, 0.45, 1.01]),
                k.mesh(k.G.cyl(0.2, 0.2, 0.06, 12), { color: '#ffd27a', emissive: '#ffb12e', emissiveIntensity: 0.6 }, [0.55, 1.25, 0.72], [Math.PI / 2, 0, 0.6]),
                k.mesh(k.G.cyl(0.2, 0.2, 0.06, 12), { color: '#ffd27a', emissive: '#ffb12e', emissiveIntensity: 0.6 }, [-0.55, 1.25, 0.72], [Math.PI / 2, 0, -0.6]),
            ]);
        }
        case 'quests':
            return k.group([
                k.mesh(k.G.rbox(1.0, 0.55, 0.7, 0.05), WOOD, [0, 0.3, 0]),
                k.mesh(k.G.cyl(0.35, 0.35, 1.0, 10, 1), WOOD_D, [0, 0.58, 0], [0, 0, Math.PI / 2], [1, 1, 1]),
                k.mesh(k.G.box(1.04, 0.12, 0.74), { color: '#e9c46a', metalness: 0.6, roughness: 0.35 }, [0, 0.3, 0]),
                k.mesh(k.G.box(0.16, 0.2, 0.06), { color: '#e9c46a', metalness: 0.6, roughness: 0.35 }, [0, 0.5, 0.37]),
            ]);
        default:
            return new THREE.Group();
    }
}

// Sprites have a read-only position: move them with .set() instead of Object.assign.
function placed(obj, [x, y, z], userData) {
    obj.position.set(x, y, z);
    if (userData) Object.assign(obj.userData, userData);
    return obj;
}

function buildDecor(k, key) {
    switch (key) {
        case 'lanterne':
            return k.group([
                k.mesh(k.G.cyl(0.04, 0.06, 1.3, 6), '#3a3a42', [0, 0.65, 0]),
                k.mesh(k.G.box(0.26, 0.3, 0.26), { color: '#ffe3a1', emissive: '#ffb84d', emissiveIntensity: 0.4 }, [0, 1.4, 0]),
                k.mesh(k.G.cone(0.24, 0.18, 4), '#3a3a42', [0, 1.64, 0], [0, Math.PI / 4, 0]),
                placed(k.glowSprite('#ffc46b', 1.6, 0), [0, 1.4, 0], { glow: 0.9, night: true }),
            ]);
        case 'champis':
            return k.group(Array.from({ length: 7 }, (_, i) => {
                const a = (i / 7) * TAU, s = 0.6 + (i % 3) * 0.2;
                return k.group([k.mesh(k.G.cyl(0.05, 0.07, 0.25, 6), '#f2ead8', [0, 0.12, 0]), k.mesh(k.G.dome(0.17), '#e2453b', [0, 0.24, 0], null, [1, 0.8, 1]),
                    k.mesh(k.G.sphere(0.03, 4, 3), '#fff', [0.06, 0.36, 0.04])], [Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7], null, s);
            }));
        case 'nichoir':
            return k.group([
                k.mesh(k.G.cyl(0.06, 0.07, 1.5, 6), WOOD_D, [0, 0.75, 0]),
                k.mesh(k.G.box(0.45, 0.45, 0.4), '#7fb6d6', [0, 1.65, 0]),
                k.mesh(k.G.cyl(0.36, 0.36, 0.5, 3), ROOF, [0, 1.98, 0], [0, 0, Math.PI / 2], [1, 1, 0.7]),
                k.mesh(k.G.cyl(0.08, 0.08, 0.05, 10), '#1e1408', [0, 1.68, 0.21], [Math.PI / 2, 0, 0]),
                k.mesh(k.G.sphere(0.1, 8, 6), '#e2733b', [0.12, 1.92, 0.3]),
            ]);
        case 'banc':
            return k.group([
                ...[-0.6, 0.6].map((x) => k.mesh(k.G.box(0.08, 0.4, 0.45), WOOD_D, [x, 0.2, 0])),
                ...[-0.12, 0.05, 0.18].map((z) => k.mesh(k.G.box(1.5, 0.06, 0.12), WOOD, [0, 0.42, z])),
                ...[0.6, 0.78].map((y) => k.mesh(k.G.box(1.5, 0.12, 0.05), WOOD, [0, y, -0.22])),
            ], null, [0, Math.PI, 0]);
        case 'epouvantail':
            return k.group([
                k.mesh(k.G.cyl(0.05, 0.05, 1.8, 6), WOOD_D, [0, 0.9, 0]),
                k.mesh(k.G.cyl(0.04, 0.04, 1.4, 6), WOOD_D, [0, 1.3, 0], [0, 0, Math.PI / 2]),
                k.mesh(k.G.box(0.55, 0.6, 0.25), '#4f7fbf', [0, 1.15, 0]),
                k.mesh(k.G.sphere(0.2, 10, 8), '#e9d6a8', [0, 1.65, 0]),
                k.mesh(k.G.cyl(0.42, 0.42, 0.04, 14), '#d9b26a', [0, 1.8, 0]),
                k.mesh(k.G.cone(0.22, 0.3, 10), '#d9b26a', [0, 1.95, 0]),
                k.mesh(k.G.cone(0.08, 0.25, 5), '#e9c46a', [0.7, 1.25, 0], [0, 0, -1.6]), k.mesh(k.G.cone(0.08, 0.25, 5), '#e9c46a', [-0.7, 1.25, 0], [0, 0, 1.6]),
            ]);
        case 'fontaine': {
            const water = { color: '#7fd3f0', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85, flatShading: false };
            return k.group([
                k.mesh(k.G.cyl(0.9, 1.0, 0.35, 14), '#b8b2a7', [0, 0.17, 0]),
                k.mesh(k.G.cyl(0.8, 0.8, 0.05, 20), water, [0, 0.33, 0]),
                k.mesh(k.G.cyl(0.12, 0.16, 0.9, 8), '#b8b2a7', [0, 0.65, 0]),
                k.mesh(k.G.cyl(0.4, 0.3, 0.12, 12), '#b8b2a7', [0, 1.1, 0]),
                k.mesh(k.G.sphere(0.16, 10, 8), water, [0, 1.3, 0], null, [1, 1.6, 1]),
                Object.assign(k.mesh(k.G.cone(0.38, 0.6, 12, 1), { ...water, opacity: 0.35 }, [0, 0.8, 0], [Math.PI, 0, 0]), { userData: { spray: true } }),
            ]);
        }
        case 'arche': {
            const flowers = Array.from({ length: 11 }, (_, i) => {
                const a = (i / 10) * Math.PI;
                return k.mesh(k.G.sphere(0.13, 6, 5), ['#ff8fc0', '#fff0f7', '#ffd166'][i % 3], [Math.cos(a) * 1.0, 0.25 + Math.sin(a) * 1.4, 0.12]);
            });
            return k.group([
                k.mesh(k.G.torus(1.0, 0.08, 5, 16, Math.PI), '#6f9c70', [0, 0.25, 0], null, [1, 1.4, 1]),
                k.mesh(k.G.cyl(0.08, 0.08, 0.3, 5), '#6f9c70', [-1, 0.12, 0]), k.mesh(k.G.cyl(0.08, 0.08, 0.3, 5), '#6f9c70', [1, 0.12, 0]),
                ...flowers,
            ]);
        }
        case 'moulin': {
            const blades = k.group([0, 1, 2, 3].map((i) => k.group([k.mesh(k.G.box(0.18, 1.1, 0.03), '#f2e6d0', [0, 0.6, 0])], null, [0, 0, (i * Math.PI) / 2])), [0, 2.3, 0.62]);
            blades.userData.spin = true;
            return k.group([
                k.mesh(k.G.cyl(0.45, 0.7, 2.3, 8), '#f2e2c4', [0, 1.15, 0]),
                k.mesh(k.G.cone(0.6, 0.7, 8), ROOF, [0, 2.65, 0]),
                k.mesh(k.G.rbox(0.35, 0.55, 0.05, 0.03), '#7a4a26', [0, 0.3, 0.6], [-0.1, 0, 0]),
                k.mesh(k.G.sphere(0.1, 6, 5), WOOD_D, [0, 2.3, 0.58]),
                blades,
            ], null, null, 0.85);
        }
        case 'cerisier': {
            const pink = ['#ffb7d5', '#ffc9e0', '#ff9fc6'];
            return k.group([
                k.mesh(k.G.cyl(0.14, 0.22, 1.4, 7), '#6b4226', [0, 0.7, 0]),
                k.mesh(k.G.cyl(0.07, 0.1, 0.8, 5), '#6b4226', [0.3, 1.4, 0], [0, 0, -0.6]),
                ...[[0, 2.0, 0, 0.85], [-0.6, 1.75, 0.2, 0.6], [0.7, 1.8, -0.1, 0.65], [0.1, 2.5, 0.1, 0.5], [-0.2, 1.7, -0.6, 0.55]]
                    .map(([x, y, z, r], i) => k.mesh(k.G.ico(r, 1), pink[i % 3], [x, y, z])),
            ]);
        }
        // ---- seasonal decorations
        case 'tulipes': {
            const colors = ['#ff5a7a', '#ffd166', '#ff8fc0', '#c78bff', '#ff7a3d'];
            return k.group([
                k.mesh(k.G.cyl(0.85, 0.9, 0.12, 14), '#6b4226', [0, 0.06, 0]),
                ...Array.from({ length: 9 }, (_, i) => {
                    const a = (i / 9) * TAU, r = i % 3 ? 0.55 : 0.2;
                    return k.group([
                        k.mesh(k.G.cyl(0.025, 0.025, 0.5, 4), '#4f9a3a', [0, 0.3, 0]),
                        k.mesh(k.G.capsule(0.09, 0.08), colors[i % 5], [0, 0.6, 0]),
                        k.mesh(k.G.box(0.04, 0.22, 0.12), '#5fae3f', [0.06, 0.25, 0], [0, 0, -0.4]),
                    ], [Math.cos(a) * r, 0, Math.sin(a) * r]);
                }),
            ]);
        }
        case 'nid':
            return k.group([
                k.mesh(k.G.cyl(0.08, 0.12, 0.9, 6), WOOD_D, [0, 0.45, 0]),
                k.mesh(k.G.torus(0.32, 0.12, 6, 14), '#a77b4a', [0, 0.95, 0], [Math.PI / 2, 0, 0]),
                k.mesh(k.G.cyl(0.3, 0.2, 0.12, 12), '#7a5530', [0, 0.9, 0]),
                ...[[-0.1, 0.02], [0.1, 0.05], [0, -0.1]].map(([x, z]) => k.mesh(k.G.sphere(0.09, 8, 6), '#bfe3f2', [x, 1.0, z], null, [1, 1.25, 1])),
                k.group([k.mesh(k.G.sphere(0.14, 8, 6), '#e2733b', [0, 0, 0]), k.mesh(k.G.sphere(0.09, 8, 6), '#5a3a22', [0.12, 0.1, 0]), k.mesh(k.G.cone(0.03, 0.08, 4), '#ffb627', [0.22, 0.1, 0], [0, 0, -Math.PI / 2])], [0.42, 1.12, 0]),
            ]);
        case 'oeufs': {
            const shells = ['#ff9ec2', '#9fd8ff', '#ffd166', '#a8f0c6', '#c78bff'];
            return k.group([
                k.mesh(k.G.cyl(0.6, 0.45, 0.35, 12), '#c99a5b', [0, 0.18, 0]),
                k.mesh(k.G.torus(0.58, 0.05, 5, 16), '#a77b4a', [0, 0.36, 0], [Math.PI / 2, 0, 0]),
                k.mesh(k.G.torus(0.4, 0.04, 5, 14, Math.PI), '#a77b4a', [0, 0.36, 0], null, [1, 1.4, 1]),
                ...shells.map((c, i) => {
                    const a = (i / 5) * TAU;
                    return k.mesh(k.G.sphere(0.15, 10, 8), c, [Math.cos(a) * 0.3, 0.44, Math.sin(a) * 0.3], [0.3, a, 0.2], [1, 1.3, 1]);
                }),
                k.mesh(k.G.sphere(0.16, 10, 8), '#fff0f7', [0, 0.52, 0], null, [1, 1.3, 1]),
            ]);
        }
        case 'parasol':
            return k.group([
                k.mesh(k.G.cyl(0.04, 0.04, 1.9, 6), '#f2e6d0', [0, 0.95, 0], [0, 0, 0.12]),
                k.mesh(k.G.cone(0.97, 0.44, 16), '#ff5a5a', [0.11, 1.94, 0], [0, 0, 0.12]),
                ...Array.from({ length: 4 }, (_, i) => k.mesh(k.G.box(0.98, 0.02, 0.2), '#fff6e8', [0.11, 1.76, 0], [0, (i / 4) * Math.PI, 0.12])),
                k.mesh(k.G.rbox(1.1, 0.08, 0.6, 0.03), '#4ab8ff', [0.2, 0.05, 0.6]),
                k.mesh(k.G.sphere(0.18, 10, 8), '#ffe74a', [-0.6, 0.18, 0.5]),
            ]);
        case 'pasteques':
            return k.group([
                k.mesh(k.G.sphere(0.42, 12, 10), '#2f7d3a', [0, 0.36, 0], null, [1.2, 0.85, 1]),
                k.mesh(k.G.sphere(0.3, 12, 10), '#3a9a46', [0.65, 0.26, 0.25], null, [1.15, 0.85, 1]),
                k.group([
                    k.mesh(k.G.cyl(0.3, 0.3, 0.08, 14, 1), '#ff4a5a', [0, 0, 0], [Math.PI / 2, 0, 0]),
                    k.mesh(k.G.torus(0.3, 0.04, 5, 16), '#2f7d3a', [0, 0, 0]),
                ], [-0.55, 0.3, 0.35], [0, 0.5, 0], [1, 1, 1]),
                k.mesh(k.G.box(0.5, 0.06, 0.25), '#ff4a5a', [0.1, 0.05, 0.7], [0, 0.4, 0]),
            ]);
        case 'tournesols':
            return k.group([-0.7, 0, 0.7].map((x, i) => k.group([
                k.mesh(k.G.cyl(0.04, 0.05, 1.6 + i % 2 * 0.3, 5), '#4f9a3a', [0, 0.8 + i % 2 * 0.15, 0]),
                k.mesh(k.G.box(0.3, 0.04, 0.14), '#5fae3f', [0.12, 0.7, 0], [0, 0, -0.5]),
                k.group([
                    k.mesh(k.G.cyl(0.36, 0.36, 0.06, 14), '#ffc93c', [0, 0, 0], [Math.PI / 2, 0, 0]),
                    ...Array.from({ length: 10 }, (_, j) => k.mesh(k.G.box(0.1, 0.28, 0.03), '#ffb627', [Math.cos(j / 10 * TAU) * 0.4, Math.sin(j / 10 * TAU) * 0.4, 0], [0, 0, j / 10 * TAU + Math.PI / 2])),
                    k.mesh(k.G.cyl(0.2, 0.2, 0.1, 12), '#5a3a1a', [0, 0, 0.04], [Math.PI / 2, 0, 0]),
                ], [0, 1.65 + i % 2 * 0.3, 0.05], [-0.25, 0, 0]),
            ], [x, 0, 0])));
        case 'feuilles': {
            const tones = ['#e07a2e', '#c8502a', '#e9b23a', '#a8432a', '#d9932f'];
            return k.group([
                k.mesh(k.G.dome(0.75, 12), '#b5602a', [0, 0, 0], null, [1, 0.45, 1]),
                ...Array.from({ length: 16 }, (_, i) => {
                    const a = i * 2.4, r = 0.15 + (i % 5) * 0.16;
                    return k.mesh(k.G.box(0.22, 0.02, 0.16), tones[i % 5], [Math.cos(a) * r, 0.36 - r * 0.38, Math.sin(a) * r], [0.3 * (i % 3 - 1), a, 0.4 * (i % 2 - 0.5)]);
                }),
                k.mesh(k.G.cyl(0.03, 0.03, 1.1, 4), WOOD_D, [0.75, 0.5, 0.2], [0, 0, -0.35]),
                ...[-0.08, 0, 0.08].map((z) => k.mesh(k.G.box(0.02, 0.2, 0.02), '#d9b26a', [0.96 + z, 0.05, 0.2 + z])),
            ]);
        }
        case 'chataignes':
            return k.group([
                ...[0, 1, 2].map((i) => k.mesh(k.G.cyl(0.03, 0.03, 0.75, 4), '#3a3a42', [Math.cos(i / 3 * TAU) * 0.35, 0.35, Math.sin(i / 3 * TAU) * 0.35], [Math.sin(i / 3 * TAU) * 0.2, 0, -Math.cos(i / 3 * TAU) * 0.2])),
                k.mesh(k.G.cyl(0.45, 0.32, 0.28, 12), '#2f2f36', [0, 0.78, 0]),
                k.mesh(k.G.cyl(0.4, 0.4, 0.04, 12), { color: '#ff6a2a', emissive: '#ff4a1a', emissiveIntensity: 0.8 }, [0, 0.9, 0]),
                ...Array.from({ length: 6 }, (_, i) => k.mesh(k.G.sphere(0.08, 6, 5), '#6b3a1a', [Math.cos(i) * 0.22, 0.95, Math.sin(i) * 0.22], null, [1, 0.8, 1])),
                k.mesh(k.G.rbox(0.5, 0.25, 0.35, 0.04), '#c99a5b', [0.75, 0.13, 0.1]),
                placed(k.glowSprite('#ff8a3d', 1.6, 0), [0, 1.0, 0], { glow: 0.85, night: true }),
            ]);
        case 'citrouilles':
            return k.group([[0, 0, 0.55], [0.7, 0.15, 0.38], [-0.6, 0.25, 0.32]].map(([x, z, r], i) => k.group([
                ...Array.from({ length: 6 }, (_, j) => k.mesh(k.G.sphere(r, 10, 8), i === 1 ? '#f29a2e' : '#e8772a', [Math.cos(j / 6 * TAU) * r * 0.35, r * 0.75, Math.sin(j / 6 * TAU) * r * 0.35], null, [0.75, 0.8, 0.75])),
                k.mesh(k.G.cyl(0.04, 0.06, 0.2, 5), '#4f6b2a', [0, r * 1.45, 0], [0, 0, 0.3]),
                ...(i === 0 ? [
                    k.mesh(k.G.cone(0.08, 0.1, 3), { color: '#ffd27a', emissive: '#ffb12e', emissiveIntensity: 0.9 }, [-0.16, r * 0.95, r * 0.66], [Math.PI / 2, 0, 0]),
                    k.mesh(k.G.cone(0.08, 0.1, 3), { color: '#ffd27a', emissive: '#ffb12e', emissiveIntensity: 0.9 }, [0.16, r * 0.95, r * 0.66], [Math.PI / 2, 0, 0]),
                    k.mesh(k.G.box(0.3, 0.06, 0.05), { color: '#ffd27a', emissive: '#ffb12e', emissiveIntensity: 0.9 }, [0, r * 0.6, r * 0.7]),
                    placed(k.glowSprite('#ffb12e', 1.4, 0), [0, r * 0.8, r * 0.8], { glow: 0.7, night: true }),
                ] : []),
            ], [x, 0, z])));
        case 'bonhomme':
            return k.group([
                k.mesh(k.G.sphere(0.5, 14, 10), '#f4f8ff', [0, 0.45, 0]),
                k.mesh(k.G.sphere(0.36, 14, 10), '#f4f8ff', [0, 1.1, 0]),
                k.mesh(k.G.sphere(0.26, 14, 10), '#f4f8ff', [0, 1.6, 0]),
                k.mesh(k.G.cone(0.05, 0.25, 6), '#ff7a2e', [0, 1.6, 0.32], [Math.PI / 2, 0, 0]),
                ...[-0.09, 0.09].map((x) => k.mesh(k.G.sphere(0.035, 5, 4), '#1e1e24', [x, 1.68, 0.23])),
                ...[1.2, 1.05, 0.9].map((y) => k.mesh(k.G.sphere(0.04, 5, 4), '#1e1e24', [0, y, 0.35])),
                k.mesh(k.G.torus(0.25, 0.06, 6, 14), '#e2453b', [0, 1.38, 0], [Math.PI / 2, 0, 0]),
                k.mesh(k.G.box(0.1, 0.4, 0.04), '#e2453b', [0.15, 1.2, 0.26], [0, 0, 0.2]),
                k.mesh(k.G.cyl(0.2, 0.22, 0.28, 12), '#2b2b33', [0, 1.92, 0]),
                k.mesh(k.G.cyl(0.32, 0.32, 0.04, 14), '#2b2b33', [0, 1.79, 0]),
                ...[-1, 1].map((sgn) => k.mesh(k.G.cyl(0.02, 0.03, 0.7, 4), WOOD_D, [sgn * 0.6, 1.2, 0], [0, 0, sgn * -1.0])),
            ]);
        case 'cadeaux':
            return k.group([[0, 0, 0.7, '#e2453b', '#ffd166'], [0.75, 0.2, 0.5, '#4ab8ff', '#fff'], [-0.55, 0.35, 0.45, '#5fae3f', '#e2453b'], [0.1, -0.05, 0.4, '#c78bff', '#ffd166', 0.7]].map(([x, z, s, c, rib, y = 0], i) => k.group([
                k.mesh(k.G.rbox(s, s * 0.8, s, 0.03), c, [0, s * 0.4, 0]),
                k.mesh(k.G.box(s + 0.02, s * 0.8 + 0.02, s * 0.16), rib, [0, s * 0.4, 0]),
                k.mesh(k.G.box(s * 0.16, s * 0.8 + 0.02, s + 0.02), rib, [0, s * 0.4, 0]),
                k.mesh(k.G.torus(s * 0.14, s * 0.04, 4, 10), rib, [-s * 0.1, s * 0.86, 0], [0, 0.6, 0.4]),
                k.mesh(k.G.torus(s * 0.14, s * 0.04, 4, 10), rib, [s * 0.1, s * 0.86, 0], [0, -0.6, -0.4]),
            ], [x, y, z], [0, i * 0.7, 0])));
        case 'sapin': {
            const bulbs = ['#ff5a5a', '#ffd166', '#4ab8ff', '#ff9ec2', '#fff6c8'];
            return k.group([
                k.mesh(k.G.cyl(0.14, 0.18, 0.5, 7), '#6b4226', [0, 0.25, 0]),
                k.mesh(k.G.cone(1.0, 1.1, 9), '#1f6b44', [0, 1.0, 0]),
                k.mesh(k.G.cone(0.8, 1.0, 9), '#26804f', [0, 1.6, 0]),
                k.mesh(k.G.cone(0.55, 0.85, 9), '#2f9a5e', [0, 2.15, 0]),
                k.mesh(k.G.ico(0.17, 0), { color: '#ffe27a', emissive: '#ffc93c', emissiveIntensity: 1 }, [0, 2.65, 0]),
                placed(k.glowSprite('#ffe27a', 1.3, 0), [0, 2.65, 0], { glow: 0.9, night: true }),
                ...Array.from({ length: 14 }, (_, i) => {
                    const y = 0.7 + (i / 14) * 1.8, r = 0.95 - (i / 14) * 0.75, a = i * 2.3;
                    return k.mesh(k.G.sphere(0.065, 6, 5), { color: bulbs[i % 5], emissive: bulbs[i % 5], emissiveIntensity: 0.7 }, [Math.cos(a) * r, y, Math.sin(a) * r]);
                }),
                placed(k.glowSprite('#ffd166', 3.2, 0), [0, 1.5, 0], { glow: 0.35, night: true }),
            ]);
        }
        default:
            return new THREE.Group();
    }
}

function buildTree(k, kind) {
    if (kind === 'pine') {
        return k.group([
            k.mesh(k.G.cyl(0.1, 0.14, 0.6, 6), '#6b4226', [0, 0.3, 0]),
            k.mesh(k.G.cone(0.85, 1.2, 7), '#2f7d52', [0, 1.0, 0]),
            k.mesh(k.G.cone(0.65, 1.0, 7), '#3a9461', [0, 1.6, 0]),
            k.mesh(k.G.cone(0.42, 0.8, 7), '#47a86f', [0, 2.15, 0]),
        ]);
    }
    return k.group([
        k.mesh(k.G.cyl(0.11, 0.16, 0.9, 6), '#6b4226', [0, 0.45, 0]),
        k.mesh(k.G.ico(0.75, 0), '#4caf5a', [0, 1.35, 0]),
        k.mesh(k.G.ico(0.5, 0), '#5fc26b', [0.35, 1.7, 0.2]),
    ]);
}

function buildIsland(k) {
    const g = new THREE.Group();
    // grass top with a slightly wavy rim
    const top = new THREE.CylinderGeometry(ISLAND, ISLAND - 0.15, 0.5, 64, 1);
    const pos = top.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const a = Math.atan2(z, x), r = Math.hypot(x, z);
        if (r > 1) {
            const w = 1 + Math.sin(a * 5) * 0.025 + Math.sin(a * 11 + 1) * 0.015;
            pos.setX(i, x * w);
            pos.setZ(i, z * w);
        }
    }
    top.computeVertexNormals();
    const grass = k.mesh(top, { color: '#6cbf5a', roughness: 0.95 }, [0, -0.25, 0]);
    grass.castShadow = false;
    g.add(grass);
    g.add(k.mesh(k.G.cyl(ISLAND - 0.1, ISLAND - 0.6, 1.1, 48), '#8a5a32', [0, -1.05, 0]));
    // rocky underside, jittered for a low-poly look
    const under = new THREE.ConeGeometry(ISLAND - 0.6, 6.5, 24, 5, true);
    under.rotateX(Math.PI);
    const up = under.attributes.position, rand = rng(7);
    for (let i = 0; i < up.count; i++) {
        const y = up.getY(i);
        const j = 1 + (rand() - 0.5) * 0.22 * (1 - Math.abs(y) / 4);
        up.setX(i, up.getX(i) * j);
        up.setZ(i, up.getZ(i) * j);
        up.setY(i, y + (rand() - 0.5) * 0.3);
    }
    under.computeVertexNormals();
    const rock = k.mesh(under, { color: '#6d5a4b', roughness: 1, side: THREE.DoubleSide }, [0, -4.85, 0]);
    rock.castShadow = false;
    g.add(rock);
    // a few rocks floating below
    const floaters = [[-6, -6.5, 5, 0.9], [7, -5.5, -3, 0.7], [3, -8, 6, 0.5], [-7, -8.5, -5, 0.6]].map(([x, y, z, r]) => {
        const m = k.mesh(k.G.dodeca(r), '#6d5a4b', [x, y, z]);
        m.add(k.mesh(k.G.cyl(r * 0.8, r * 0.8, 0.12, 7), '#6cbf5a', [0, r * 0.7, 0]));
        m.userData.float = { y, s: rand() * TAU };
        return m;
    });
    floaters.forEach((m) => g.add(m));
    // stepping stones from the front edge to the plots, and around
    const stones = [];
    for (let i = 0; i < 6; i++) stones.push([(rand() - 0.5) * 0.4, 4.1 + i * 0.85]);
    for (const [x, z] of stones) g.add(k.mesh(k.G.cyl(0.38, 0.42, 0.08, 7), '#c9c2b4', [x, 0.02, z], [0, rand() * TAU, 0]));
    // pond
    g.add(k.mesh(k.G.cyl(1.55, 1.55, 0.06, 32), { color: '#3fb0d9', roughness: 0.08, metalness: 0.2, flatShading: false }, [POND[0], 0.02, POND[1]]));
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        g.add(k.mesh(k.G.dodeca(0.22 + rand() * 0.12), '#a39d93', [POND[0] + Math.cos(a) * 1.65, 0.05, POND[1] + Math.sin(a) * 1.65], [rand(), rand(), rand()]));
    }
    g.add(k.mesh(k.G.cyl(0.32, 0.32, 0.03, 10), '#2e8a5c', [POND[0] + 0.5, 0.07, POND[1] - 0.3]), k.mesh(k.G.cyl(0.25, 0.25, 0.03, 10), '#2e8a5c', [POND[0] - 0.6, 0.07, POND[1] + 0.5]));
    g.add(k.mesh(k.G.sphere(0.1, 6, 5), '#ff9fc6', [POND[0] + 0.5, 0.14, POND[1] - 0.3]));
    for (let i = 0; i < 4; i++) {
        const a = 2.4 + i * 0.25;
        g.add(k.group([k.mesh(k.G.cyl(0.02, 0.02, 1, 4), '#4f8a3c', [0, 0.5, 0]), k.mesh(k.G.capsule(0.05, 0.2), '#7a4a26', [0, 1.0, 0])], [POND[0] + Math.cos(a) * 1.4, 0, POND[1] + Math.sin(a) * 1.4]));
    }
    // trees around the edge
    for (const [x, z, kind] of TREES) g.add(buildTree(k, kind).translateX(x).translateZ(z).rotateY(rand() * TAU));
    // grass tufts and wild flowers, kept away from the plots, buildings and pond
    const blocked = (x, z) => (Math.abs(x) < 3.6 && Math.abs(z) < 3.6) || Math.hypot(x - POND[0], z - POND[1]) < 2
        || Object.values(PROPS).some((p) => Math.hypot(x - p.pos[0], z - p.pos[1]) < 1.5)
        || Object.values(DECOR_SPOTS).flat().some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.1)
        || TREES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.9) || (Math.abs(x) < 0.7 && z > 3.6);
    const spots = [];
    while (spots.length < 260) {
        const a = rand() * TAU, r = Math.sqrt(rand()) * (ISLAND - 0.5);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!blocked(x, z)) spots.push([x, z]);
    }
    const tuft = new THREE.InstancedMesh(k.G.cone(0.07, 0.35, 4), k.mat({ color: '#4f9e45' }), 200);
    const flower = new THREE.InstancedMesh(k.G.sphere(0.07, 6, 4), k.mat({ color: '#ffffff', roughness: 0.6 }), 60);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const petal = ['#ffffff', '#ffd166', '#ff8fc0', '#9b7bea', '#7fd3f0'].map((c) => new THREE.Color(c));
    spots.forEach(([x, z], i) => {
        if (i < 200) {
            q.setFromEuler(e.set((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4));
            s.setScalar(0.7 + rand() * 0.8);
            tuft.setMatrixAt(i, m4.compose(p.set(x, 0.15, z), q, s));
        } else {
            q.identity();
            s.setScalar(0.8 + rand() * 0.6);
            flower.setMatrixAt(i - 200, m4.compose(p.set(x, 0.12, z), q, s));
            flower.setColorAt(i - 200, petal[i % petal.length]);
        }
    });
    tuft.receiveShadow = flower.receiveShadow = true;
    g.add(tuft, flower);
    return g;
}

// ---------------------------------------------------------------- the component

const SKY = {
    day: ['#7cc8f2', '#d9f1ff'],
    dusk: ['#3c3f8f', '#ff9a6b'],
    night: ['#070d24', '#1d2b5c'],
    rain: ['#5f7389', '#a9b8c6'],
};
function skyOf(light, rain) {
    if (rain) return light > 0.3 ? SKY.rain : ['#141d33', '#3a4a66'];
    if (light >= 1) return SKY.day;
    if (light <= 0) return SKY.night;
    return light > 0.5 ? SKY.dusk.map((c, i) => new THREE.Color(c).lerp(new THREE.Color(SKY.day[i]), (light - 0.5) * 2).getStyle())
        : SKY.night.map((c, i) => new THREE.Color(c).lerp(new THREE.Color(SKY.dusk[i]), light * 2).getStyle());
}

export default function Island3D({ plots, maxPlots, now, decor, rain, hour, labels, bursts, onTap, onFail, selected }) {
    const wrap = useRef(null);
    const host = useRef(null);
    const world = useRef(null);
    const labelEls = useRef({});
    const tapRef = useRef(onTap);
    tapRef.current = onTap;

    // ---- scene setup, once
    useEffect(() => {
        const el = host.current;
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        } catch {
            onFail?.();
            return undefined;
        }
        const k = makeKit();
        renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        el.appendChild(renderer.domElement);
        renderer.domElement.style.touchAction = 'none';

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog('#bfe6ff', 40, 90);
        const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 200);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minPolarAngle = 0.35;
        controls.maxPolarAngle = 1.2;
        controls.rotateSpeed = 0.6;
        controls.target.set(0, -0.3, 0.4);

        const hemi = new THREE.HemisphereLight('#dff3ff', '#5a7d3a', 0.9);
        const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
        sun.position.set(9, 16, 7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
        sun.shadow.bias = -0.0008;
        sun.shadow.normalBias = 0.03;
        scene.add(hemi, sun, sun.target);

        const island = buildIsland(k);
        scene.add(island);

        // buildings
        const props = {};
        for (const [key, p] of Object.entries(PROPS)) {
            const g = buildProp(k, key);
            g.position.set(p.pos[0], 0, p.pos[1]);
            g.rotation.y = p.rot;
            g.traverse((o) => { o.userData.tap = { type: 'prop', key }; });
            scene.add(g);
            props[key] = g;
        }
        // decorations (hidden until bought)
        const decorObjs = {};
        for (const [key, spots] of Object.entries(DECOR_SPOTS)) {
            decorObjs[key] = spots.map(([x, z]) => {
                const g = buildDecor(k, key);
                g.position.set(x, 0, z);
                g.rotation.y += Math.atan2(-x, -z) + Math.PI;
                g.visible = false;
                g.traverse((o) => { o.userData.tap = o.userData.tap || { type: 'decor', key }; });
                scene.add(g);
                return g;
            });
        }

        // plots
        const plotObjs = Array.from({ length: 9 }, (_, slot) => {
            const [x, z] = slotXZ(slot);
            const g = new THREE.Group();
            g.position.set(x, 0, z);
            const soil = k.mesh(k.G.rbox(2.0, 0.34, 2.0, 0.08), { color: '#6b4226', roughness: 0.95 }, [0, 0.1, 0]);
            soil.material = soil.material.clone();
            const furrows = [-0.55, 0, 0.55].map((dz) => k.mesh(k.G.box(1.7, 0.03, 0.12), '#4e2f19', [0, SOIL_TOP + 0.005, dz]));
            const locked = k.group([
                k.mesh(k.G.rbox(2.0, 0.16, 2.0, 0.06), '#5aa152', [0, 0.03, 0]),
                ...Array.from({ length: 9 }, (_, i) => k.mesh(k.G.cone(0.09, 0.45, 4), '#4f9e45', [((i % 3) - 1) * 0.55 + 0.1, 0.3, (Math.floor(i / 3) - 1) * 0.55 - 0.1], [0.2 * (i % 2), 0, -0.15])),
                k.group([k.mesh(k.G.cyl(0.04, 0.05, 0.9, 5), WOOD_D, [0, 0.45, 0]), k.mesh(k.G.rbox(0.7, 0.42, 0.06, 0.02), WOOD, [0, 0.85, 0])], [0.45, 0, 0.55], [0, -0.3, 0]),
            ]);
            const sign = locked.children.at(-1).children[1];
            sign.material = sign.material.clone();
            const ring = k.mesh(k.G.torus(1.05, 0.04, 6, 40), { color: '#ffd76a', emissive: '#ffb800', emissiveIntensity: 1.2 }, [0, SOIL_TOP + 0.02, 0], [Math.PI / 2, 0, 0]);
            ring.castShadow = false;
            const sparkle = k.glowSprite('#ffe28a', 1.6, 0.9);
            const sel = k.mesh(k.G.torus(1.15, 0.05, 6, 40), { color: '#ffffff', emissive: '#bff7d4', emissiveIntensity: 1 }, [0, SOIL_TOP + 0.02, 0], [Math.PI / 2, 0, 0]);
            sel.visible = false;
            const fert = k.glowSprite('#7dff9a', 2.2, 0.35);
            fert.position.y = 0.4;
            const pest = buildPest(k);
            const content = new THREE.Group();
            content.position.y = SOIL_TOP;
            g.add(soil, ...furrows, locked, ring, sparkle, sel, fert, pest, content);
            g.traverse((o) => { o.userData.tap = { type: 'plot', slot }; });
            pest.traverse((o) => { o.userData.tap = { type: 'pest', slot }; });
            scene.add(g);
            return { g, soil, furrows, locked, sign, ring, sparkle, sel, fert, pest, content, key: null, phase: slot * 1.7 };
        });

        // bees around the hive, butterflies, clouds, fireflies, rain, stars
        const bee = () => k.group([
            k.mesh(k.G.sphere(0.09, 8, 6), '#ffc93c', null, null, [1.3, 1, 1]),
            k.mesh(k.G.torus(0.07, 0.02, 4, 10), '#222', [0, 0, 0], [0, Math.PI / 2, 0]),
            k.mesh(k.G.plane(0.14, 0.1), { color: '#ffffff', transparent: true, opacity: 0.75, side: THREE.DoubleSide, flatShading: false }, [0, 0.09, 0], [Math.PI / 2, 0, 0]),
        ]);
        const bees = Array.from({ length: 4 }, (_, i) => {
            const b = bee();
            b.userData.phase = i * 1.6;
            scene.add(b);
            return b;
        });
        const wing = (color) => k.mesh(k.G.plane(0.32, 0.26), { color, side: THREE.DoubleSide, flatShading: false, roughness: 0.6 });
        const butterflies = ['#ff9fc6', '#ffd166', '#9b7bea', '#7fd3f0', '#ffffff'].map((c, i) => {
            const l = wing(c), r = wing(c);
            l.position.x = -0.16; r.position.x = 0.16;
            const lw = k.group([l]), rw = k.group([r]);
            const b = k.group([lw, rw, k.mesh(k.G.capsule(0.025, 0.16), '#2a1c10', null, [Math.PI / 2, 0, 0])]);
            b.userData = { lw, rw, phase: i * 2.3, r: 4.5 + (i % 3) * 1.6 };
            scene.add(b);
            return b;
        });
        const cloudMat = k.mat({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92 });
        const clouds = Array.from({ length: 6 }, (_, i) => {
            const c = k.group([[0, 0, 0, 1.2], [1.1, -0.2, 0.2, 0.9], [-1.1, -0.25, 0, 0.85], [0.4, 0.5, 0, 0.8]].map(([x, y, z, r]) => k.mesh(k.G.ico(r, 1), cloudMat, [x, y, z])));
            c.traverse((o) => { o.castShadow = false; });
            c.userData = { a: (i / 6) * TAU, r: 15 + (i % 3) * 3, y: 4 + (i % 2) * 3 + i * 0.3, speed: 0.012 + (i % 3) * 0.006 };
            scene.add(c);
            return c;
        });
        const glowMap = glowTexture();
        const ff = new THREE.BufferGeometry();
        const ffPos = new Float32Array(45 * 3), ffSeed = [];
        const r1 = rng(3);
        for (let i = 0; i < 45; i++) ffSeed.push([(r1() - 0.5) * 16, 0.4 + r1() * 2, (r1() - 0.5) * 16, r1() * TAU]);
        ff.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
        const fireflies = new THREE.Points(ff, new THREE.PointsMaterial({ size: 0.35, map: glowMap, color: '#d8ff7a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        scene.add(fireflies);
        const RAIN = 700;
        const rg = new THREE.BufferGeometry();
        const rPos = new Float32Array(RAIN * 6);
        for (let i = 0; i < RAIN; i++) {
            const a = r1() * TAU, r = Math.sqrt(r1()) * 11, x = Math.cos(a) * r, z = Math.sin(a) * r, y = r1() * 14;
            rPos.set([x, y, z, x - 0.05, y - 0.45, z], i * 6);
        }
        rg.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
        const rainLines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.55 }));
        rainLines.visible = false;
        scene.add(rainLines);
        const sg = new THREE.BufferGeometry();
        const sPos = new Float32Array(300 * 3);
        for (let i = 0; i < 300; i++) {
            const a = r1() * TAU, b = Math.acos(r1() * 0.9), R = 80;
            sPos.set([Math.cos(a) * Math.sin(b) * R, Math.cos(b) * R, Math.sin(a) * Math.sin(b) * R], i * 3);
        }
        sg.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
        const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.9, map: glowMap, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
        scene.add(stars);

        // floating "burst" particles on harvest
        const particles = [];
        function burst(slot, golden) {
            const [x, z] = slotXZ(slot);
            for (let i = 0; i < 18; i++) {
                const m = new THREE.Mesh(i % 3 ? k.G.leaf() : k.G.sphere(0.07, 6, 4), k.mat({ color: golden || i % 3 === 0 ? '#ffd76a' : '#9be86f', emissive: golden ? '#ffb800' : '#000', emissiveIntensity: 0.6 }));
                m.position.set(x, 0.8, z);
                const a = Math.random() * TAU;
                m.userData = { v: new THREE.Vector3(Math.cos(a) * 2.2, 4 + Math.random() * 3, Math.sin(a) * 2.2), life: 1.2, spin: Math.random() * 8 };
                scene.add(m);
                particles.push(m);
            }
        }

        // resize: frame the plots (and most of the island) whatever the screen shape
        let base = 26;
        function resize() {
            const w = el.clientWidth, h = el.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            const fit = camera.aspect < 1 ? 15.5 : 19.5; // world width to show (tighter on phones, the user can pinch out)
            const vfov = THREE.MathUtils.degToRad(camera.fov);
            const byWidth = (fit / camera.aspect) / (2 * Math.tan(vfov / 2));
            const byHeight = 15 / (2 * Math.tan(vfov / 2));
            const d = Math.min(62, Math.max(byWidth, byHeight));
            const first = !world.current?.framed;
            base = d;
            controls.minDistance = d * 0.45;
            controls.maxDistance = d * 1.25;
            if (first) {
                const az = 0.42, pol = 0.95;
                camera.position.set(Math.sin(az) * Math.sin(pol) * d, Math.cos(pol) * d, Math.cos(az) * Math.sin(pol) * d);
                if (world.current) world.current.framed = true;
            }
            camera.updateProjectionMatrix();
        }
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        // taps (a short press without dragging)
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        let down = null;
        // the raycaster ignores visibility: a hidden group (unbought decor, lock sign) would steal the tap
        const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
        function pick(e) {
            const box = renderer.domElement.getBoundingClientRect();
            ndc.set(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
            ray.setFromCamera(ndc, camera);
            const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData.tap && !h.object.isPoints && !h.object.isLineSegments && !h.object.isSprite && shown(h.object));
            return hit?.object.userData.tap || null;
        }
        const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
        const onUp = (e) => {
            if (!down) return;
            const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
            const quick = performance.now() - down.t < 600;
            down = null;
            if (moved > (e.pointerType === 'mouse' ? 8 : 16) || !quick) return;
            const tap = pick(e);
            if (tap) tapRef.current?.(tap);
        };
        let hoverAt = 0;
        const onHover = (e) => {
            if (e.pointerType !== 'mouse' || down) return;
            const t = performance.now();
            if (t - hoverAt < 80) return;
            hoverAt = t;
            renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab';
        };
        renderer.domElement.addEventListener('pointerdown', onDown);
        renderer.domElement.addEventListener('pointerup', onUp);
        renderer.domElement.addEventListener('pointermove', onHover);

        const env = { light: 1, target: 1, rain: false };
        const v = new THREE.Vector3();
        const clock = new THREE.Clock();
        let raf = 0, running = true;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

        function frame() {
            raf = requestAnimationFrame(frame);
            if (!running) return;
            const dt = Math.min(0.05, clock.getDelta());
            const t = clock.elapsedTime;
            controls.update();
            // day / night easing
            env.light += (env.target - env.light) * Math.min(1, dt * 1.5);
            const L = env.light, night = 1 - L;
            hemi.intensity = 0.35 + 0.6 * L - (env.rain ? 0.15 : 0);
            hemi.color.set(L > 0.2 ? '#dff3ff' : '#8fa6ff');
            sun.intensity = (env.rain ? 0.6 : 1) * (0.35 + 1.9 * L);
            sun.color.set(L > 0.99 ? '#fff4e0' : L > 0.2 ? '#ffc58f' : '#a9bcff');
            sun.position.set(9 - night * 14, 16 - night * 3, 7);
            scene.fog.color.set(L > 0.5 ? (env.rain ? '#a9b8c6' : '#bfe6ff') : '#1d2b5c');
            fireflies.material.opacity = Math.max(0, night - 0.3) * 1.2;
            stars.material.opacity = env.rain ? 0 : Math.max(0, night - 0.4) * 1.4;
            scene.traverse((o) => {
                if (o.isSprite && o.userData.night) o.material.opacity = o.userData.glow * Math.max(0.15, night);
            });
            if (!reduced) {
                for (let i = 0; i < 45; i++) {
                    const [x, y, z, s] = ffSeed[i];
                    ffPos.set([x + Math.sin(t * 0.4 + s) * 0.8, y + Math.sin(t * 0.9 + s * 2) * 0.3, z + Math.cos(t * 0.35 + s) * 0.8], i * 3);
                }
                ff.attributes.position.needsUpdate = true;
                bees.forEach((b) => {
                    const p = b.userData.phase, a = t * 1.6 + p;
                    const [hx, hz] = PROPS.hive.pos;
                    b.position.set(hx + Math.cos(a) * (0.9 + Math.sin(t * 2 + p) * 0.3), 1.3 + Math.sin(t * 3 + p) * 0.35, hz + Math.sin(a * 1.3) * 0.9);
                    b.rotation.y = -a;
                });
                butterflies.forEach((b) => {
                    const { lw, rw, phase, r } = b.userData;
                    const a = t * 0.25 + phase;
                    b.position.set(Math.cos(a) * r, 1.2 + Math.sin(t * 1.3 + phase) * 0.5, Math.sin(a * 1.2) * r * 0.85);
                    b.rotation.y = -a - Math.PI / 2;
                    const f = Math.sin(t * 14 + phase) * 0.9;
                    lw.rotation.z = f; rw.rotation.z = -f;
                });
                clouds.forEach((c) => {
                    const u = c.userData;
                    u.a += u.speed * dt;
                    c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
                });
                island.children.forEach((o) => { if (o.userData.float) o.position.y = o.userData.float.y + Math.sin(t * 0.6 + o.userData.float.s) * 0.25; });
                scene.traverse((o) => { if (o.userData.spin) o.rotation.z += dt * 0.8; });
            }
            if (rainLines.visible) {
                for (let i = 0; i < RAIN; i++) {
                    let y = rPos[i * 6 + 1] - dt * 16;
                    if (y < -0.5) y += 14;
                    rPos[i * 6 + 1] = y;
                    rPos[i * 6 + 4] = y - 0.45;
                }
                rg.attributes.position.needsUpdate = true;
            }
            // plots: sway, ready bounce, pests crawling
            plotObjs.forEach((p) => {
                if (!p.g.visible) return;
                const s = p.state;
                if (!s) return;
                const sway = reduced ? 0 : Math.sin(t * 1.4 + p.phase) * 0.04;
                p.content.rotation.z = sway;
                p.content.position.y = SOIL_TOP + (s.ready && !reduced ? Math.abs(Math.sin(t * 3 + p.phase)) * 0.12 : 0);
                if (s.ready) {
                    p.ring.rotation.z = t;
                    p.ring.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.4;
                    p.sparkle.position.y = s.top + 0.4 + Math.sin(t * 2 + p.phase) * 0.1;
                    p.sparkle.material.opacity = 0.55 + Math.sin(t * 5 + p.phase) * 0.3;
                }
                if (s.pest) {
                    const a = t * 0.6 + p.phase;
                    p.pest.position.set(Math.cos(a) * 0.62, SOIL_TOP, Math.sin(a) * 0.62);
                    p.pest.rotation.y = -a - Math.PI / 2 + Math.PI;
                    p.pest.scale.setScalar(1.3 + Math.sin(t * 6) * 0.05);
                }
                if (p.locked.visible && s.next) p.sign.material.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.3;
            });
            // harvest particles
            for (let i = particles.length - 1; i >= 0; i--) {
                const m = particles[i], u = m.userData;
                u.life -= dt;
                u.v.y -= 9 * dt;
                m.position.addScaledVector(u.v, dt);
                m.rotation.x += u.spin * dt;
                m.scale.setScalar(Math.max(0.01, u.life));
                if (u.life <= 0) { scene.remove(m); particles.splice(i, 1); }
            }
            renderer.render(scene, camera);
            // labels follow their anchor
            const W = el.clientWidth, H = el.clientHeight;
            const anchors = world.current?.anchors || {};
            for (const [key, node] of Object.entries(labelEls.current)) {
                if (!node) continue;
                const a = anchors[key];
                if (!a) { node.style.transform = 'translate(-9999px,0)'; continue; }
                v.copy(a).project(camera);
                const hidden = v.z > 1;
                node.style.transform = hidden ? 'translate(-9999px,0)' : `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px)`;
            }
        }
        frame();
        const onVis = () => {
            running = !document.hidden;
            if (running) clock.getDelta();
        };
        document.addEventListener('visibilitychange', onVis);

        const anchors = {};
        for (const [key, p] of Object.entries(PROPS)) anchors[`prop:${key}`] = new THREE.Vector3(p.pos[0], p.h, p.pos[1]);
        world.current = { k, scene, plotObjs, decorObjs, env, rainLines, burst, anchors, framed: false, props };
        resize();

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('visibilitychange', onVis);
            ro.disconnect();
            controls.dispose();
            renderer.domElement.removeEventListener('pointerdown', onDown);
            renderer.domElement.removeEventListener('pointerup', onUp);
            renderer.domElement.removeEventListener('pointermove', onHover);
            scene.traverse((o) => {
                if (o.isPoints || o.isLineSegments || o.isInstancedMesh) { o.geometry.dispose(); o.material.dispose?.(); }
                if (o.isSprite) o.material.dispose();
            });
            plotObjs.forEach((p) => { p.soil.material.dispose(); p.sign.material.dispose(); });
            glowMap.dispose();
            k.dispose();
            renderer.dispose();
            renderer.domElement.remove();
            world.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- plots: rebuild a plant only when what it shows changes
    useEffect(() => {
        const w = world.current;
        if (!w) return;
        w.plotObjs.forEach((p, slot) => {
            const unlockedPlot = slot < plots.length;
            const plot = unlockedPlot ? plots[slot] : null;
            const g = growth(plot, now);
            const next = slot === plots.length && slot < maxPlots;
            const key = !unlockedPlot ? `locked:${next}` : !plot ? 'empty' : `${plot.kind}:${g.stage}:${plot.watered}:${g.pest}:${plot.fertilized}`;
            const [x, z] = slotXZ(slot);
            w.anchors[`plot:${slot}`] = new THREE.Vector3(x, plot ? (g.stage === 3 ? 2.3 : 1.5) : 1.0, z);
            p.sel.visible = selected === slot;
            if (p.key === key) return;
            p.key = key;
            p.content.clear();
            p.locked.visible = !unlockedPlot;
            p.soil.visible = unlockedPlot;
            p.furrows.forEach((f) => { f.visible = unlockedPlot && !plot; });
            p.ring.visible = p.sparkle.visible = !!g?.ready;
            p.pest.visible = !!g?.pest;
            p.fert.visible = !!plot?.fertilized && !g?.ready;
            p.soil.material.color.set(plot?.watered ? '#40271a' : '#6b4226');
            p.soil.material.roughness = plot?.watered ? 0.45 : 0.95;
            p.sign.material.color.set(next ? '#e9c46a' : '#8a5a32');
            p.sign.material.emissive.set(next ? '#ffb800' : '#000000');
            let top = 0.5;
            if (plot) {
                const plant = buildPlant(w.k, plot.kind, g.stage);
                plant.traverse((o) => { o.userData.tap = { type: 'plot', slot }; });
                p.content.add(plant);
                const box = new THREE.Box3().setFromObject(plant);
                top = Math.max(0.5, box.max.y - box.min.y);
            }
            p.state = { ready: !!g?.ready, pest: !!g?.pest, top: SOIL_TOP + top, next };
        });
    }, [plots, now, maxPlots, selected]);

    useEffect(() => {
        const w = world.current;
        if (!w) return;
        for (const [key, objs] of Object.entries(w.decorObjs)) objs.forEach((o) => { o.visible = decor.includes(key); });
    }, [decor]);

    useEffect(() => {
        const w = world.current;
        if (!w) return;
        w.env.target = daylight(hour);
        w.env.rain = rain;
        w.rainLines.visible = rain;
        const [a, b] = skyOf(daylight(hour), rain);
        wrap.current.style.background = `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;
    }, [hour, rain]);

    useEffect(() => {
        const w = world.current;
        if (!w || !bursts?.length) return;
        bursts.forEach((b) => w.burst(b.slot, b.golden));
    }, [bursts]);

    return (
        <div ref={wrap} className="absolute inset-0 overflow-hidden transition-[background] duration-1000">
            <div ref={host} className="absolute inset-0 [&>canvas]:block [&>canvas]:w-full [&>canvas]:h-full" />
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Object.entries(labels).map(([key, node]) => node && (
                    <div key={key} ref={(n) => { labelEls.current[key] = n; }} className="absolute left-0 top-0 will-change-transform" style={{ transform: 'translate(-9999px,0)' }}>
                        <div className="-translate-x-1/2 -translate-y-full">{node}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
