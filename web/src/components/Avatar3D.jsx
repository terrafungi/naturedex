/**
 * The avatar as a real 3D character (three.js), standing on a soft stage with its companion, for the
 * big views only (profile, player page, editor). Lists keep the light 2D drawing of PlayerAvatar.
 * Everything is built from simple shapes; the t-shirt and pants motifs are the 2D drawings used as
 * textures, so every item keeps the same look in both versions. Drag to turn the character.
 */
import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AvatarFigure, BGS, HAIR_COLORS, PANTS_STYLES, PantsArt, SHIRTS, SKINS, ShirtArt, defaultAvatar } from './PlayerAvatar.jsx';

const TAU = Math.PI * 2;
const GOLD = { color: '#e0b23a', metalness: 0.75, roughness: 0.28 };

// ---------------------------------------------------------------- building blocks

function makeKit() {
    const mats = new Map();
    const mat = (m) => {
        if (m instanceof THREE.Material) return m;
        const o = typeof m === 'string' ? { color: m } : m;
        const k = JSON.stringify(o);
        if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ roughness: 0.62, ...o }));
        return mats.get(k);
    };
    const mesh = (geo, m, pos, rot, scale) => {
        const x = new THREE.Mesh(geo, mat(m));
        if (pos) x.position.set(...pos);
        if (rot) x.rotation.set(...rot);
        if (scale) typeof scale === 'number' ? x.scale.setScalar(scale) : x.scale.set(...scale);
        x.castShadow = true;
        return x;
    };
    const group = (children, pos, rot, scale) => {
        const g = new THREE.Group();
        children.filter(Boolean).forEach((c) => g.add(c));
        if (pos) g.position.set(...pos);
        if (rot) g.rotation.set(...rot);
        if (scale) typeof scale === 'number' ? g.scale.setScalar(scale) : g.scale.set(...scale);
        return g;
    };
    return {
        mat, mesh, group,
        ball: (r, m, pos, scale, rot) => mesh(new THREE.SphereGeometry(r, 32, 20), m, pos, rot, scale),
        dome: (r, m, pos, scale, rot, theta = Math.PI / 2) => mesh(new THREE.SphereGeometry(r, 32, 16, 0, TAU, 0, theta), m, pos, rot, scale),
        cap: (r, len, m, pos, rot, scale) => mesh(new THREE.CapsuleGeometry(r, len, 8, 20), m, pos, rot, scale),
        cyl: (rt, rb, h, m, pos, rot, scale) => mesh(new THREE.CylinderGeometry(rt, rb, h, 32), m, pos, rot, scale),
        cone: (r, h, m, pos, rot, scale) => mesh(new THREE.ConeGeometry(r, h, 24), m, pos, rot, scale),
        torus: (R, t, m, pos, rot, arc = TAU, scale) => mesh(new THREE.TorusGeometry(R, t, 12, 48, arc), m, pos, rot, scale),
        box: (w, h, d, m, pos, rot, radius = 0.01) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2)), m, pos, rot),
    };
}

// Points a cone (built along +y) along a direction.
const UP = new THREE.Vector3(0, 1, 0);
const aim = (obj, dir) => { obj.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); return obj; };

// Eyes blink: every mesh group tagged `blink` is squashed for a moment by the animation loop.
function eye(k, pos, r, { white = false, color = '#1d1410' } = {}) {
    const g = k.group([
        white && k.ball(r * 1.45, '#ffffff', [0, 0, -r * 0.5], [1, 0.85, 0.45]),
        k.ball(r, { color, roughness: 0.25 }, [0, 0, 0], [1, 1.1, 0.55]),
        k.ball(r * 0.32, { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6 }, [r * 0.35, r * 0.4, r * 0.45]),
    ], pos);
    g.userData.blink = true;
    return g;
}

function flower3d(k, pos, petal, r = 0.016, rot) {
    return k.group([
        ...[0, 1, 2, 3, 4].map((i) => k.ball(r, petal, [Math.cos(i * TAU / 5) * r * 1.3, Math.sin(i * TAU / 5) * r * 1.3, 0], [1, 1, 0.45])),
        k.ball(r * 0.75, '#ffd36e', [0, 0, r * 0.3], [1, 1, 0.6]),
    ], pos, rot);
}

// ---------------------------------------------------------------- the character

const HEAD_Y = 1.6;
const HEAD_SCALE = 1.28; // a bit bigger than life, like the trainers in Pokémon GO
const HR = [0.118, 0.13, 0.12]; // head radii
const surf = (x, y, out = 0) => HR[2] * Math.sqrt(Math.max(0, 1 - (x / HR[0]) ** 2 - (y / HR[1]) ** 2)) + out;
const TORSO_Z = 0.66; // the torso is a flattened lathe

function torsoGeometry() {
    const curve = new THREE.SplineCurve([
        [0.165, 0.8], [0.16, 0.86], [0.146, 0.98], [0.152, 1.12], [0.168, 1.24], [0.164, 1.31], [0.12, 1.365], [0.052, 1.39],
    ].map(([r, y]) => new THREE.Vector2(r, y)));
    // Seam at the back, so the front of the texture (its middle) is on the chest.
    const geo = new THREE.LatheGeometry(curve.getSpacedPoints(40), 48, Math.PI, TAU);
    geo.scale(1, 1, TORSO_Z);
    return geo;
}

function buildHair(k, style, color) {
    const m = { color, roughness: 0.48 };
    const shell = (theta, grow = 1.06, tilt = -0.45) => k.dome(1, m, [0, 0.004, -0.004], HR.map((r) => r * grow), [tilt, 0, 0], theta);
    const fringe = () => k.group([-0.05, -0.015, 0.025, 0.06].map((x, i) => k.ball(0.034, m, [x, 0.088 - (i % 2) * 0.006, surf(x, 0.088) - 0.012], [1.2, 0.6, 0.7], [0, 0, -0.3])));
    switch (style) {
        case 'rase':
            return shell(1.25, 1.025, -0.5);
        case 'meche':
            return k.group([shell(1.3), k.ball(0.06, m, [0.03, 0.1, 0.07], [1.5, 0.55, 0.9], [0.2, 0, -0.45])]);
        case 'boucles': {
            const curls = [];
            for (let ring = 0; ring < 3; ring++) {
                const n = 7 + ring * 3;
                for (let i = 0; i < n; i++) {
                    const th = 0.35 + ring * 0.42, ph = (i / n) * TAU;
                    const p = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
                    if (p.z > 0.55 && p.y < 0.55) continue; // keep the face free
                    curls.push(k.ball(0.036, m, [p.x * HR[0] * 1.07, p.y * HR[1] * 1.07, p.z * HR[2] * 1.07]));
                }
            }
            return k.group([shell(1.4, 1.05), ...curls]);
        }
        case 'long':
            return k.group([
                shell(1.4), fringe(),
                k.ball(1, m, [0, -0.1, -0.05], [0.128, 0.2, 0.085]),
                k.cap(0.032, 0.15, m, [-0.106, -0.1, 0.01], [0, 0, 0.06]),
                k.cap(0.032, 0.15, m, [0.106, -0.1, 0.01], [0, 0, -0.06]),
            ]);
        case 'chignon':
            return k.group([shell(1.35), k.ball(0.056, m, [0, 0.11, -0.085]), k.torus(0.04, 0.008, '#e94b4b', [0, 0.095, -0.06], [-0.9, 0, 0])]);
        case 'tresses': {
            const braid = (s) => [0, 1, 2, 3, 4, 5].map((i) => k.ball(0.028 - i * 0.0015, m, [s * (0.098 + i * 0.006), -0.05 - i * 0.045, 0.02 + i * 0.01]));
            return k.group([shell(1.35), fringe(), ...braid(-1), ...braid(1),
                k.ball(0.014, '#e94b4b', [-0.135, -0.33, 0.08]), k.ball(0.014, '#e94b4b', [0.135, -0.33, 0.08])]);
        }
        default: // court
            return k.group([shell(1.3), fringe()]);
    }
}

function buildHat(k, id) {
    const top = HR[1] * 1.06;
    const brim = (r, color, y, h = 0.008) => k.cyl(r, r, h, color, [0, y, 0]);
    switch (id) {
        case 'casquette':
            return k.group([
                k.dome(1, '#d64040', [0, 0.03, 0], [0.128, 0.122, 0.13], [-0.2, 0, 0]),
                k.cyl(0.085, 0.085, 0.008, '#c23434', [0, 0.045, 0.12], [0.18, 0, 0], [1, 1, 0.9]),
                k.ball(0.012, '#c23434', [0, top + 0.012, -0.02]),
            ]);
        case 'explorateur':
            return k.group([k.cyl(0.098, 0.12, 0.08, '#c9b07a', [0, 0.125, -0.005]), k.cyl(0.121, 0.121, 0.02, '#6b4a2a', [0, 0.1, -0.005]), brand(k, 0.2, '#bfa46a', 0.085)]);
        case 'bandana':
            return k.group([k.dome(1, '#d8322b', [0, 0.006, -0.006], HR.map((r) => r * 1.09), [-0.5, 0, 0], 1.25),
                k.ball(0.025, '#d8322b', [0, 0.02, -0.135]), k.cone(0.03, 0.07, '#d8322b', [0.02, -0.03, -0.13], [0.3, 0, 0.4])]);
        case 'fleur':
            return flower3d(k, [0.085, 0.085, 0.07], '#ff7fae', 0.02, [-0.3, 0.6, 0]);
        case 'bonnet':
            return k.group([
                k.dome(1, '#e94b4b', [0, 0.01, -0.005], HR.map((r) => r * 1.12), [-0.35, 0, 0], 1.45),
                k.torus(0.125, 0.018, '#c23434', [0, 0.045, -0.02], [Math.PI / 2 - 0.35, 0, 0], TAU, [1, 1.05, 0.9]),
                k.ball(0.035, '#ffffff', [0, top + 0.035, -0.04]),
            ]);
        case 'paille':
            return k.group([k.cyl(0.095, 0.115, 0.075, '#e8c770', [0, 0.125, 0]), k.cyl(0.117, 0.117, 0.018, '#d64040', [0, 0.098, 0]), brand(k, 0.24, '#e0b85a', 0.088)]);
        case 'beret':
            return k.group([k.ball(1, '#2b2b3a', [0.02, 0.112, -0.01], [0.145, 0.04, 0.14], [0, 0, -0.18]), k.cyl(0.005, 0.005, 0.02, '#2b2b3a', [0.015, 0.155, -0.01])]);
        case 'bob':
            return k.group([k.dome(1, '#e8d6a8', [0, 0.05, 0], [0.12, 0.1, 0.122]), k.cyl(0.12, 0.165, 0.035, '#dcc792', [0, 0.06, 0])]);
        case 'couronne_fleurs':
            return k.group([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                const a = (i / 9) * TAU;
                return flower3d(k, [Math.sin(a) * 0.118, 0.085, Math.cos(a) * 0.12], ['#ff7fae', '#ffffff', '#b98ae8'][i % 3], 0.015, [0, a, 0]);
            }));
        case 'champi': {
            const dots = [[0, 0.99, 0.1], [0.55, 0.75, 0.35], [-0.55, 0.75, 0.35], [0.3, 0.7, -0.65], [-0.35, 0.65, -0.65], [0.8, 0.45, -0.2], [-0.8, 0.45, -0.2], [0, 0.6, 0.8]];
            return k.group([
                k.dome(1, '#d8322b', [0, 0.09, -0.005], [0.19, 0.12, 0.19]),
                k.cyl(0.19, 0.19, 0.01, '#f3e6d0', [0, 0.09, -0.005]),
                ...dots.map(([x, y, z]) => k.ball(0.022, '#fff7ee', [x * 0.19 * 0.85, 0.09 + y * 0.12, z * 0.19 * 0.85 - 0.005], [1, 0.5, 1])),
            ]);
        }
        case 'renard': {
            const ear = (s) => k.group([k.cone(0.045, 0.1, '#e8752a', [0, 0, 0], null, [1, 1, 0.45]), k.cone(0.026, 0.06, '#3a2418', [0, 0.025, 0.012], null, [1, 1, 0.3])],
                [s * 0.07, 0.15, -0.01], [0, 0, -s * 0.3]);
            return k.group([ear(-1), ear(1), k.torus(0.12, 0.007, '#3a2418', [0, 0.1, -0.01], [Math.PI / 2 - 0.25, 0, 0], Math.PI, [1, 1, 1])]);
        }
        case 'sorcier':
            return k.group([k.cone(0.1, 0.32, '#4b2f7a', [0, 0.27, -0.03], [-0.18, 0, 0.1]), k.cyl(0.21, 0.21, 0.01, '#3f2566', [0, 0.11, 0]),
                k.cyl(0.103, 0.106, 0.025, '#e9c46a', [0, 0.125, -0.005]), k.ball(0.012, GOLD, [0.04, 0.23, 0.04])]);
        case 'couronne': case 'lauriers': {
            if (id === 'lauriers') {
                const leaves = [];
                for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
                    const a = s * (0.25 + i * 0.42);
                    leaves.push(k.ball(0.028, GOLD, [Math.sin(a) * 0.125, 0.07 + i * 0.002, Math.cos(a) * 0.125], [0.45, 0.25, 1], [0.5, a + s * 0.6, 0]));
                }
                return k.group(leaves);
            }
            return k.group([
                k.mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 40, 1, true), { ...GOLD, side: THREE.DoubleSide }, [0, 0.135, 0]),
                ...[0, 1, 2, 3, 4].map((i) => k.cone(0.022, 0.05, GOLD, [Math.sin(i * TAU / 5) * 0.1, 0.18, Math.cos(i * TAU / 5) * 0.1])),
                ...[0, 1, 2, 3, 4].map((i) => k.ball(0.012, { color: ['#d8322b', '#2a6fb0', '#4caf6a'][i % 3], roughness: 0.15 }, [Math.sin(i * TAU / 5) * 0.102, 0.135, Math.cos(i * TAU / 5) * 0.102])),
            ]);
        }
        default:
            return null;
    }
}
const brand = (k, r, color, y) => k.cyl(r, r, 0.008, color, [0, y, 0]);

function buildFace(k, id, hairColor) {
    const ez = surf(0.042, -0.005);
    const ring = (x, m, r = 0.027, t = 0.0045) => k.torus(r, t, m, [x, -0.005, ez + 0.016]);
    const lens = (x, m, r = 0.026) => k.cyl(r, r, 0.003, m, [x, -0.005, ez + 0.016], [Math.PI / 2, 0, 0]);
    const temples = (m) => [-1, 1].map((s) => k.cyl(0.003, 0.003, 0.11, m, [s * 0.112, -0.002, 0.06], [Math.PI / 2, 0, 0]));
    const bridge = (m) => k.cyl(0.003, 0.003, 0.03, m, [0, 0.0, ez + 0.02], [0, 0, Math.PI / 2]);
    const glass = { color: '#cfe8ff', transparent: true, opacity: 0.25, roughness: 0.05 };
    switch (id) {
        case 'lunettes':
            return k.group([ring(-0.042, '#2a2a2a'), ring(0.042, '#2a2a2a'), lens(-0.042, glass), lens(0.042, glass), bridge('#2a2a2a'), ...temples('#2a2a2a')]);
        case 'rondes':
            return k.group([ring(-0.042, GOLD, 0.025, 0.0035), ring(0.042, GOLD, 0.025, 0.0035), lens(-0.042, glass, 0.024), lens(0.042, glass, 0.024), bridge(GOLD), ...temples(GOLD)]);
        case 'soleil':
            return k.group([ring(-0.042, '#1d1d1d'), ring(0.042, '#1d1d1d'), lens(-0.042, { color: '#1d1d24', roughness: 0.08, metalness: 0.3 }), lens(0.042, { color: '#1d1d24', roughness: 0.08, metalness: 0.3 }), bridge('#1d1d1d'), ...temples('#1d1d1d')]);
        case 'coeurs': {
            const heart = new THREE.Shape();
            heart.moveTo(0, -0.025); heart.bezierCurveTo(-0.04, 0.0, -0.028, 0.032, 0, 0.012); heart.bezierCurveTo(0.028, 0.032, 0.04, 0.0, 0, -0.025);
            const geo = new THREE.ExtrudeGeometry(heart, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 });
            return k.group([k.mesh(geo, { color: '#ff4f8b', roughness: 0.2 }, [-0.042, -0.005, ez + 0.012]), k.mesh(geo, { color: '#ff4f8b', roughness: 0.2 }, [0.042, -0.005, ez + 0.012]), bridge('#c2185b'), ...temples('#c2185b')]);
        }
        case 'monocle':
            return k.group([ring(0.042, GOLD, 0.028, 0.004), lens(0.042, glass, 0.027), k.torus(0.05, 0.0018, GOLD, [0.07, -0.06, ez - 0.01], [0.2, 0.6, 0], Math.PI)]);
        case 'moustache':
            return k.group([-1, 1].map((s) => k.ball(0.022, hairColor, [s * 0.022, -0.05, surf(0.02, -0.05) + 0.004], [1.25, 0.45, 0.6], [0, 0, s * 0.25])));
        case 'rousseur':
            return k.group([[-0.07, -0.03], [-0.058, -0.04], [-0.078, -0.045], [-0.064, -0.022], [0.07, -0.03], [0.058, -0.04], [0.078, -0.045], [0.064, -0.022]]
                .map(([x, y]) => k.ball(0.0045, '#a0603a', [x, y, surf(x, y) - 0.001], [1, 1, 0.4])));
        case 'peinture':
            return k.group([-1, 1].flatMap((s) => [0, 1].map((i) => k.ball(0.014, '#3f9a4a', [s * (0.062 + i * 0.016), -0.03 - i * 0.012, surf(0.07, -0.035) + 0.002], [1.4, 0.5, 0.35], [0, 0, s * 0.5]))));
        case 'plongee':
            return k.group([
                k.box(0.15, 0.065, 0.035, '#2a6fb0', [0, -0.005, ez + 0.006], null, 0.02),
                k.box(0.13, 0.048, 0.01, { color: '#9fe0ff', transparent: true, opacity: 0.55, roughness: 0.05 }, [0, -0.005, ez + 0.024], null, 0.015),
                k.torus(0.123, 0.008, '#1d4a7a', [0, -0.005, -0.005], [0, 0, 0], TAU, [1, 1, 1.0]).rotateX(Math.PI / 2),
                k.cap(0.012, 0.09, '#f2a53a', [0.11, 0.08, 0.0], [0, 0, -0.15]),
            ]);
        default:
            return null;
    }
}

function buildNeck(k, id) {
    const cord = (color, drop = 0.16) => k.torus(0.075, 0.0035, color, [0, 1.37 - drop / 2, 0.035], [-1.15, 0, 0], TAU, [1, drop / 0.15, 1]);
    switch (id) {
        case 'jumelles':
            return k.group([cord('#3a2a1e'), ...[-1, 1].map((s) => k.cyl(0.02, 0.023, 0.065, '#2a2a2a', [s * 0.024, 1.19, 0.14], [Math.PI / 2, 0, 0])),
                ...[-1, 1].map((s) => k.cyl(0.016, 0.016, 0.004, { color: '#6fb7ff', roughness: 0.05 }, [s * 0.024, 1.19, 0.174], [Math.PI / 2, 0, 0]))]);
        case 'foulard':
            return k.group([k.torus(0.058, 0.02, '#d8322b', [0, 1.375, 0.005], [Math.PI / 2, 0, 0], TAU, [1, TORSO_Z * 1.4, 1]), k.cone(0.05, 0.08, '#d8322b', [0, 1.32, 0.085], [Math.PI, 0, 0], [1, 1, 0.3])]);
        case 'noeud':
            return k.group([-1, 1].map((s) => k.cone(0.028, 0.045, '#d8322b', [s * 0.022, 1.36, 0.075], [0, 0, s * Math.PI / 2], [1, 1, 0.5])).concat([k.ball(0.011, '#b8262b', [0, 1.36, 0.08])]));
        case 'echarpe':
            return k.group([k.torus(0.064, 0.028, '#f2a53a', [0, 1.38, 0.0], [Math.PI / 2, 0, 0], TAU, [1, TORSO_Z * 1.35, 1]), k.box(0.05, 0.2, 0.025, '#f2a53a', [0.06, 1.25, 0.11], [0.15, 0, 0.12], 0.012),
                ...[0, 1, 2].map((i) => k.box(0.052, 0.012, 0.027, '#d8322b', [0.062 - i * 0.004, 1.3 - i * 0.05, 0.112 + i * 0.006], [0.15, 0, 0.12], 0.004))]);
        case 'loupe':
            return k.group([cord('#3a2a1e', 0.2), k.torus(0.03, 0.006, GOLD, [0.02, 1.16, 0.135], [0, 0, 0]), k.cyl(0.028, 0.028, 0.003, { color: '#cfe8ff', transparent: true, opacity: 0.4, roughness: 0.05 }, [0.02, 1.16, 0.135], [Math.PI / 2, 0, 0]),
                k.cap(0.008, 0.05, '#6b4a2a', [0.045, 1.11, 0.135], [0, 0, 0.6])]);
        case 'appareil':
            return k.group([cord('#1d1d1d'), k.box(0.1, 0.065, 0.045, '#2a2a2a', [0, 1.17, 0.14], null, 0.012), k.cyl(0.024, 0.026, 0.03, '#3a3a3a', [0, 1.165, 0.17], [Math.PI / 2, 0, 0]),
                k.cyl(0.018, 0.018, 0.004, { color: '#4a6fa0', roughness: 0.05 }, [0, 1.165, 0.186], [Math.PI / 2, 0, 0]), k.box(0.02, 0.012, 0.012, '#d8322b', [0.032, 1.208, 0.14])]);
        case 'coquillages':
            return k.group([k.torus(0.07, 0.003, '#c9a26a', [0, 1.35, 0.03], [-1.25, 0, 0], TAU, [1, 1.2, 1]),
                ...[-3, -2, -1, 0, 1, 2, 3].map((i) => k.cone(0.012, 0.022, ['#fff3e6', '#ffc9b8', '#f6e3b0'][Math.abs(i) % 3], [i * 0.019, 1.29 + Math.abs(i) * Math.abs(i) * 0.003, 0.105 - Math.abs(i) * 0.008], [Math.PI, 0, 0]))]);
        case 'medaille':
            return k.group([-1, 1].map((s) => k.box(0.018, 0.13, 0.004, '#2a6fb0', [s * 0.03, 1.29, 0.105], [0.1, 0, s * 0.35])).concat([
                k.cyl(0.03, 0.03, 0.007, GOLD, [0, 1.21, 0.122], [Math.PI / 2 - 0.1, 0, 0]), k.ball(0.012, { color: '#fff3b0', emissive: '#e0b23a', emissiveIntensity: 0.4 }, [0, 1.21, 0.126], [1, 1, 0.3])]));
        default:
            return null;
    }
}

function buildShoe(k, id, skin, s) {
    const sole = (color, w = 0.09, l = 0.17) => k.box(w, 0.022, l, color, [0, 0.011, 0.025], null, 0.01);
    const upper = (color, h = 0.07, w = 0.084, l = 0.155) => k.box(w, h, l, color, [0, 0.022 + h / 2 - 0.005, 0.022], null, 0.03);
    const laces = (color) => [0, 1, 2].map((i) => k.box(0.04, 0.006, 0.008, color, [0, 0.075 - i * 0.008, 0.055 + i * 0.022], [-0.45, 0, 0], 0.002));
    const shaft = (color, h) => k.cyl(0.062, 0.064, h, color, [0, h / 2 + 0.02, -0.005]);
    let parts;
    switch (id) {
        case 'rando':
            parts = [sole('#2e241c'), upper('#7a4a28', 0.085), ...laces('#f2a53a'), k.box(0.088, 0.016, 0.16, '#5a3a22', [0, 0.034, 0.022], null, 0.008)];
            break;
        case 'sandales':
            parts = [sole('#c98a4a'), k.box(0.07, 0.04, 0.14, skin, [0, 0.035, 0.025], null, 0.02), k.box(0.078, 0.012, 0.03, '#8b5a2b', [0, 0.05, 0.05], null, 0.005), k.box(0.078, 0.012, 0.03, '#8b5a2b', [0, 0.05, -0.01], null, 0.005)];
            break;
        case 'bottes': case 'jaunes': case 'coccinelle': {
            const c = { bottes: '#2f7a4a', jaunes: '#f2c230', coccinelle: '#d8322b' }[id];
            parts = [sole('#2a2622'), upper({ color: c, roughness: 0.3 }, 0.07), shaft({ color: c, roughness: 0.3 }, 0.22)];
            if (id === 'coccinelle') parts.push(...[[0.4, 0.08], [2.2, 0.12], [3.6, 0.17], [5.0, 0.1], [1.2, 0.2]].map(([a, y]) => k.ball(0.014, '#1d1d1d', [Math.sin(a) * 0.063, y, Math.cos(a) * 0.063 - 0.005], [1, 1, 0.5], [0, a, 0])));
            break;
        }
        case 'sabots':
            parts = [k.box(0.1, 0.08, 0.19, '#c98a4a', [0, 0.04, 0.025], null, 0.04), k.box(0.07, 0.02, 0.05, '#8b5a2b', [0, 0.078, -0.03], null, 0.01)];
            break;
        case 'palmes':
            parts = [k.box(0.16, 0.012, 0.3, { color: '#f2c230', roughness: 0.35 }, [0, 0.008, 0.11], null, 0.006), k.box(0.084, 0.06, 0.13, '#2b3f6b', [0, 0.04, 0.0], null, 0.03)];
            break;
        case 'montantes':
            parts = [sole('#ffffff'), upper('#2b3f6b', 0.075), shaft('#2b3f6b', 0.12), k.ball(0.03, '#ffffff', [0, 0.035, 0.08], [1.3, 0.8, 1]), ...laces('#ffffff'), k.ball(0.018, '#ffffff', [s * -0.045, 0.1, 0], [0.3, 1, 1])];
            break;
        case 'grenouille':
            parts = [k.ball(0.06, '#5fbf5f', [0, 0.04, 0.025], [0.85, 0.75, 1.5]), ...[-1, 1].map((e) => k.group([k.ball(0.02, '#5fbf5f', [0, 0, 0]), eye(k, [0, 0.004, 0.014], 0.011)], [e * 0.024, 0.085, 0.07])),
                k.torus(0.02, 0.003, '#2f7a3a', [0, 0.06, 0.112], [0.4, 0, Math.PI], Math.PI)];
            break;
        case 'dorees':
            parts = [sole('#ffffff'), upper({ ...GOLD, roughness: 0.22 }), ...laces('#fffbe6')];
            break;
        case 'ailees':
            parts = [sole(GOLD), upper('#f6f2ea'), ...laces(GOLD), ...[0, 1, 2].map((i) => k.ball(0.03 - i * 0.006, { color: '#ffffff', roughness: 0.4 }, [s * -0.06 - s * i * 0.018, 0.08 + i * 0.016, -0.02 - i * 0.012], [0.25, 0.55, 1.1], [0, 0, s * 0.6]))];
            break;
        default: // baskets
            parts = [sole('#f3efe6'), upper('#e94b4b'), ...laces('#ffffff'), k.box(0.088, 0.012, 0.12, '#ffffff', [0, 0.045, 0.01], null, 0.006)];
    }
    return k.group(parts, [s * 0.08, 0, 0.02], null, 1.15);
}

function buildPants(k, id, skin, fabric) {
    const p = PANTS_STYLES[id] || PANTS_STYLES.jean;
    const parts = [k.cyl(0.14, 0.152, 0.1, fabric, [0, 0.84, 0], null, [1, 1, TORSO_Z]), k.ball(1, fabric, [0, 0.8, 0], [0.15, 0.07, 0.15 * TORSO_Z])];
    for (const s of [-1, 1]) {
        if (p.cut === 'long') parts.push(k.cap(0.07, 0.6, fabric, [s * 0.078, 0.46, 0]));
        else {
            parts.push(k.cap(0.052, 0.6, skin, [s * 0.078, 0.4, 0]));
            if (p.cut === 'short') parts.push(k.cap(0.074, 0.16, fabric, [s * 0.078, 0.72, 0]));
        }
    }
    if (p.cut === 'skirt') parts.push(k.cyl(0.152, 0.235, 0.24, fabric, [0, 0.72, 0], null, [1, 1, 0.82]));
    if (p.detail === 'stripe') parts.push(...[-1, 1].map((s) => k.box(0.012, 0.66, 0.02, '#ffffff', [s * 0.142, 0.48, 0], null, 0.005)));
    if (p.detail === 'pockets' || p.detail === 'ranger') parts.push(...[-1, 1].map((s) => k.box(0.012, 0.07, 0.06, { color: p.color, roughness: 0.8 }, [s * 0.14, 0.6, 0], null, 0.005)));
    if (p.detail === 'ranger') parts.push(k.cyl(0.02, 0.02, 0.005, GOLD, [-0.09, 0.74, 0.064], [Math.PI / 2, 0, 0]), k.ball(0.012, '#3f6a2a', [-0.09, 0.74, 0.068], [0.6, 1, 0.3], [0, 0, 0.5]));
    if (p.bib) {
        parts.push(k.box(0.2, 0.17, 0.02, fabric, [0, 0.99, 0.093], [0.05, 0, 0], 0.008), k.box(0.08, 0.05, 0.006, { color: p.color, roughness: 0.8 }, [0, 1.0, 0.105], null, 0.003));
        parts.push(...[-1, 1].map((s) => k.box(0.028, 0.3, 0.012, p.color, [s * 0.075, 1.2, 0.112], [-0.12, 0, s * -0.08], 0.005)));
        parts.push(...[-1, 1].map((s) => k.ball(0.011, GOLD, [s * 0.08, 1.07, 0.11])));
    }
    return k.group(parts);
}

function buildCharacter(k, a, tex) {
    const skin = { color: SKINS[a.skin] || SKINS[0], roughness: 0.55 };
    const hairColor = HAIR_COLORS[a.hairColor] || HAIR_COLORS[0];
    const shirt = SHIRTS[a.shirt] || SHIRTS.foret;
    const sleeveColor = shirt.gradient ? shirt.gradient[0] : shirt.base;

    const head = k.group([
        k.ball(1, skin, [0, 0, 0], HR),
        k.ball(0.028, skin, [-0.117, -0.005, -0.005], [0.6, 1, 0.8]),
        k.ball(0.028, skin, [0.117, -0.005, -0.005], [0.6, 1, 0.8]),
        ...[-1, 1].map((s) => eye(k, [s * 0.042, -0.005, surf(0.042, -0.005) - 0.004], 0.016, { white: true, color: '#3a2a1e' })),
        ...[-1, 1].map((s) => k.cap(0.0055, 0.026, hairColor, [s * 0.043, 0.04, surf(0.043, 0.04) + 0.001], [0, 0, Math.PI / 2 - s * 0.12])),
        k.ball(0.013, skin, [0, -0.035, surf(0, -0.035) - 0.002], [1, 1, 0.8]),
        k.torus(0.019, 0.0035, '#8a3b2e', [0, -0.062, surf(0, -0.062) - 0.004], [-0.35, 0, Math.PI], Math.PI),
        ...[-1, 1].map((s) => k.ball(0.017, { color: '#ff8a8a', transparent: true, opacity: 0.35 }, [s * 0.072, -0.04, surf(0.072, -0.04) - 0.006], [1, 0.65, 0.3])),
        buildHair(k, a.hair, hairColor),
        buildFace(k, a.face, hairColor),
        buildHat(k, a.hat),
    ], [0, HEAD_Y, 0], null, HEAD_SCALE);

    const torso = k.mesh(torsoGeometry(), tex.shirt);
    const arm = (s) => k.group([
        k.cap(0.068, 0.07, tex.sleeve || sleeveColor, [0, -0.05, 0]),
        k.cap(0.045, 0.38, skin, [0, -0.3, 0]),
        k.ball(0.052, skin, [0, -0.54, 0.005], [0.85, 1.1, 0.75]),
    ], [s * 0.198, 1.3, 0], [0, 0, s * 0.1]);
    const arms = [arm(-1), arm(1)];
    arms.forEach((g, i) => { g.userData.arm = i ? 1 : -1; });

    return k.group([
        head,
        k.cyl(0.05, 0.055, 0.14, skin, [0, 1.42, 0]),
        torso,
        k.torus(0.054, 0.01, sleeveColor, [0, 1.385, 0], [Math.PI / 2, 0, 0], TAU, [1, TORSO_Z * 1.4, 1]),
        ...arms,
        buildPants(k, a.pants, skin, tex.pants),
        buildShoe(k, a.shoes, skin.color, -1),
        buildShoe(k, a.shoes, skin.color, 1),
        buildNeck(k, a.neck),
    ]);
}

// ---------------------------------------------------------------- companions (feet at y = 0)

function buildPet(k, id) {
    const spikesOver = (center, radii, color, n, filter) => {
        const out = [];
        for (let i = 0; i < n; i++) {
            const th = Math.acos(1 - (i + 0.5) / n), ph = i * 2.39996;
            const d = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
            if (filter && !filter(d)) continue;
            out.push(aim(k.cone(0.018, 0.06, color, [center[0] + d.x * radii[0], center[1] + d.y * radii[1], center[2] + d.z * radii[2]]), d));
        }
        return out;
    };
    const legs4 = (color, y, spread = 0.06, len = 0.04) => [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, z]) => k.cap(0.022, len, color, [x * spread, y, z * spread]));
    switch (id) {
        case 'coccinelle':
            return k.group([
                k.dome(0.11, { color: '#d8322b', roughness: 0.25 }, [0, 0.03, -0.01], [1, 0.75, 1.15]),
                k.box(0.006, 0.09, 0.24, '#1d1d1d', [0, 0.06, -0.01], null, 0.003),
                ...[[0.05, 0.08, 0.03], [-0.05, 0.08, 0.03], [0.045, 0.07, -0.07], [-0.045, 0.07, -0.07], [0.07, 0.05, -0.01], [-0.07, 0.05, -0.01]].map((p) => k.ball(0.02, '#1d1d1d', p, [1, 0.5, 1])),
                k.ball(0.055, '#1d1d1d', [0, 0.05, 0.12]),
                eye(k, [-0.022, 0.065, 0.165], 0.014, { white: true }), eye(k, [0.022, 0.065, 0.165], 0.014, { white: true }),
                ...[-1, 1].map((s) => k.cyl(0.003, 0.003, 0.07, '#1d1d1d', [s * 0.02, 0.12, 0.15], [0.5, 0, -s * 0.3])),
                ...[-1, 1].flatMap((s) => [-0.05, 0.0, 0.05].map((z) => k.cap(0.008, 0.03, '#1d1d1d', [s * 0.09, 0.015, z], [0, 0, s * 1.2]))),
            ], null, null, 1.5);
        case 'escargot':
            return k.group([
                k.cap(0.045, 0.2, '#c9b28a', [0, 0.045, 0.02], [Math.PI / 2, 0, 0], [1, 0.8, 1]),
                k.torus(0.065, 0.045, '#b8742a', [0, 0.13, -0.03], [0, Math.PI / 2, 0]),
                k.ball(0.06, '#d89a4a', [0, 0.13, -0.03], [0.85, 1, 1]),
                k.torus(0.03, 0.012, '#8b4a1d', [0.05, 0.13, -0.03], [0, Math.PI / 2, 0]),
                ...[-1, 1].map((s) => k.cyl(0.006, 0.008, 0.08, '#c9b28a', [s * 0.022, 0.12, 0.13], [0.3, 0, -s * 0.2])),
                eye(k, [-0.03, 0.165, 0.145], 0.013), eye(k, [0.03, 0.165, 0.145], 0.013),
                k.torus(0.014, 0.003, '#6b4a2a', [0, 0.05, 0.135], [0, 0, Math.PI], Math.PI),
            ], null, null, 1.3);
        case 'grenouille':
            return k.group([
                k.ball(0.12, { color: '#5fbf5f', roughness: 0.35 }, [0, 0.1, 0], [1.1, 0.8, 1]),
                k.ball(0.09, '#c8eeb0', [0, 0.08, 0.05], [1, 0.75, 0.8]),
                ...[-1, 1].map((s) => k.ball(0.045, { color: '#5fbf5f', roughness: 0.35 }, [s * 0.06, 0.19, 0.05])),
                eye(k, [-0.06, 0.2, 0.09], 0.022, { white: true }), eye(k, [0.06, 0.2, 0.09], 0.022, { white: true }),
                k.torus(0.05, 0.005, '#2f7a3a', [0, 0.13, 0.095], [0.2, 0, Math.PI], Math.PI),
                ...[-1, 1].map((s) => k.ball(0.06, '#4caf50', [s * 0.11, 0.04, -0.03], [0.7, 0.45, 1.2])),
                ...[-1, 1].map((s) => k.ball(0.03, '#4caf50', [s * 0.07, 0.02, 0.1], [1.2, 0.5, 1])),
            ], null, null, 1.15);
        case 'tortue':
            return k.group([
                k.dome(0.14, { color: '#4a7a3a', roughness: 0.4 }, [0, 0.06, 0], [1, 0.75, 1.15]),
                k.cyl(0.145, 0.15, 0.025, '#c9a26a', [0, 0.06, 0], null, [1, 1, 1.15]),
                ...[[0, 0.16, 0], [0.065, 0.135, 0.06], [-0.065, 0.135, 0.06], [0.065, 0.135, -0.07], [-0.065, 0.135, -0.07]].map((p) => k.ball(0.035, '#6b9a4a', p, [1, 0.35, 1])),
                k.ball(0.05, '#9bc27a', [0, 0.08, 0.2], [1, 0.95, 1.1]),
                eye(k, [-0.025, 0.1, 0.24], 0.011), eye(k, [0.025, 0.1, 0.24], 0.011),
                k.torus(0.015, 0.003, '#4a6a3a', [0, 0.07, 0.245], [0, 0, Math.PI], Math.PI),
                ...legs4('#9bc27a', 0.03, 0.1, 0.03), k.cone(0.02, 0.05, '#9bc27a', [0, 0.05, -0.18], [-Math.PI / 2, 0, 0]),
            ], null, null, 1.1);
        case 'herisson':
            return k.group([
                k.ball(0.13, '#8b5a2b', [0, 0.11, -0.02], [1, 0.85, 1.1]),
                ...spikesOver([0, 0.11, -0.02], [0.13, 0.11, 0.14], '#5a3a22', 70, (d) => d.z < 0.55 && d.y > -0.3),
                k.ball(0.07, '#e9d3b0', [0, 0.1, 0.1], [1, 0.9, 1.1]),
                k.cone(0.04, 0.07, '#e9d3b0', [0, 0.09, 0.18], [Math.PI / 2, 0, 0]),
                k.ball(0.014, '#1d1410', [0, 0.09, 0.215]),
                eye(k, [-0.032, 0.125, 0.155], 0.013), eye(k, [0.032, 0.125, 0.155], 0.013),
                ...[-1, 1].map((s) => k.ball(0.022, '#c9a27a', [s * 0.055, 0.17, 0.08], [1, 1, 0.5])),
                ...legs4('#5a3a22', 0.02, 0.07, 0.02),
            ], null, null, 1.15);
        case 'lapin':
            return k.group([
                k.ball(0.11, '#ece6dc', [0, 0.11, 0], [1, 1, 1.1]),
                k.ball(0.08, '#ece6dc', [0, 0.25, 0.05]),
                ...[-1, 1].map((s) => k.group([k.cap(0.026, 0.13, '#ece6dc', [0, 0, 0], null, [1, 1, 0.6]), k.cap(0.014, 0.1, '#ffb6c8', [0, 0, 0.012], null, [1, 1, 0.4])], [s * 0.035, 0.39, 0.03], [-0.15, 0, -s * 0.18])),
                eye(k, [-0.032, 0.27, 0.115], 0.014), eye(k, [0.032, 0.27, 0.115], 0.014),
                k.ball(0.012, '#ff8fb1', [0, 0.245, 0.13]),
                ...[-1, 1].map((s) => k.ball(0.022, '#ffffff', [s * 0.016, 0.225, 0.12])),
                k.ball(0.035, '#ffffff', [0, 0.08, -0.12]),
                ...[-1, 1].map((s) => k.ball(0.035, '#ece6dc', [s * 0.06, 0.02, 0.07], [0.8, 0.5, 1.4])),
            ], null, null, 1.1);
        case 'chat':
            return k.group([
                k.ball(0.1, '#f2a24a', [0, 0.11, 0], [1, 1.15, 1]),
                k.ball(0.06, '#fff3e6', [0, 0.11, 0.06], [1, 1.2, 0.7]),
                k.ball(0.085, '#f2a24a', [0, 0.27, 0.03]),
                ...[-1, 1].map((s) => k.cone(0.032, 0.06, '#f2a24a', [s * 0.05, 0.35, 0.02], [0, 0, -s * 0.3], [1, 1, 0.5])),
                ...[-1, 1].map((s) => k.cone(0.018, 0.035, '#ffb6c8', [s * 0.05, 0.345, 0.03], [0, 0, -s * 0.3], [1, 1, 0.3])),
                ...[0, 1, 2].map((i) => k.ball(0.012, '#c9752a', [0, 0.335 - i * 0.015, 0.06 - i * 0.004], [2.4, 0.4, 1])),
                k.ball(0.04, '#fff3e6', [0, 0.245, 0.09], [1.2, 0.8, 0.7]),
                k.ball(0.01, '#ff8fb1', [0, 0.26, 0.115]),
                eye(k, [-0.033, 0.285, 0.098], 0.015, { color: '#2f6a2a' }), eye(k, [0.033, 0.285, 0.098], 0.015, { color: '#2f6a2a' }),
                ...[-1, 1].flatMap((s) => [0, 1].map((i) => k.cyl(0.0015, 0.0015, 0.07, '#ffffff', [s * 0.07, 0.25 - i * 0.012, 0.09], [0, 0, Math.PI / 2 + s * (i ? -0.15 : 0.1)]))),
                k.torus(0.08, 0.02, '#f2a24a', [0.08, 0.09, -0.06], [Math.PI / 2, 0, 0], Math.PI * 1.1),
                ...[-1, 1].map((s) => k.ball(0.03, '#fff3e6', [s * 0.04, 0.02, 0.08], [1, 0.6, 1.3])),
            ], null, null, 1.1);
        case 'ecureuil':
            return k.group([
                k.ball(0.08, '#b8642a', [0, 0.1, 0.02], [1, 1.2, 1]),
                k.ball(0.05, '#f2dcc0', [0, 0.1, 0.06], [1, 1.3, 0.7]),
                k.ball(0.065, '#b8642a', [0, 0.23, 0.05]),
                ...[-1, 1].map((s) => k.cone(0.02, 0.045, '#b8642a', [s * 0.035, 0.295, 0.04], [0, 0, -s * 0.2])),
                k.ball(0.028, '#f2dcc0', [0, 0.215, 0.1], [1.2, 0.8, 0.8]),
                k.ball(0.009, '#1d1410', [0, 0.225, 0.125]),
                eye(k, [-0.028, 0.245, 0.098], 0.012), eye(k, [0.028, 0.245, 0.098], 0.012),
                ...[[0, 0.08, -0.09, 0.05], [0, 0.16, -0.14, 0.06], [0, 0.26, -0.15, 0.065], [0, 0.34, -0.11, 0.06], [0, 0.38, -0.05, 0.05]].map(([x, y, z, r]) => k.ball(r, '#c97a3a', [x, y, z])),
                k.ball(0.022, '#8b5a2b', [0, 0.15, 0.1], [1, 1.1, 1]),
                ...[-1, 1].map((s) => k.ball(0.025, '#b8642a', [s * 0.04, 0.015, 0.06], [1, 0.6, 1.3])),
            ], null, null, 1.15);
        case 'chouette':
            return k.group([
                k.ball(0.12, '#8b6a4a', [0, 0.15, 0], [1, 1.25, 0.95]),
                k.ball(0.09, '#e6d2b0', [0, 0.11, 0.045], [1, 1.1, 0.75]),
                ...[-1, 1].map((s) => k.cyl(0.042, 0.042, 0.01, '#ffffff', [s * 0.045, 0.21, 0.1], [Math.PI / 2, 0, 0])),
                ...[-1, 1].map((s) => k.torus(0.042, 0.006, '#f2a53a', [s * 0.045, 0.21, 0.104])),
                eye(k, [-0.045, 0.21, 0.108], 0.02), eye(k, [0.045, 0.21, 0.108], 0.02),
                k.cone(0.014, 0.035, '#f2a53a', [0, 0.17, 0.115], [Math.PI, 0, 0]),
                ...[-1, 1].map((s) => k.cone(0.02, 0.06, '#6b4a2a', [s * 0.07, 0.3, 0.0], [0, 0, -s * 0.35])),
                ...[-1, 1].map((s) => k.ball(0.06, '#6b4a2a', [s * 0.1, 0.13, -0.01], [0.35, 1, 0.9])),
                ...[-1, 1].map((s) => k.ball(0.02, '#f2a53a', [s * 0.035, 0.01, 0.06], [1.2, 0.5, 1])),
            ], null, null, 1.15);
        case 'renard': case 'panda': {
            const fur = id === 'renard' ? '#e8752a' : '#c8502a';
            const dark = id === 'renard' ? '#3a2418' : '#2a1610';
            const parts = [
                k.ball(0.1, fur, [0, 0.11, 0], [1, 1.1, 1.1]),
                k.ball(0.06, '#fff7ee', [0, 0.12, 0.07], [1, 1.2, 0.7]),
                k.ball(0.08, fur, [0, 0.26, 0.04]),
                ...[-1, 1].map((s) => k.cone(0.035, 0.07, fur, [s * 0.05, 0.345, 0.03], [0, 0, -s * 0.28], [1, 1, 0.5])),
                ...[-1, 1].map((s) => k.cone(0.02, 0.04, id === 'renard' ? dark : '#fff7ee', [s * 0.052, 0.36, 0.04], [0, 0, -s * 0.28], [1, 1, 0.4])),
                k.cone(0.036, 0.08, '#fff7ee', [0, 0.235, 0.13], [Math.PI / 2, 0, 0], [1, 1, 0.8]),
                k.ball(0.013, '#1d1410', [0, 0.24, 0.17]),
                ...[-1, 1].map((s) => k.ball(0.035, '#fff7ee', [s * 0.045, 0.24, 0.08], [1, 0.8, 0.7])),
                eye(k, [-0.033, 0.28, 0.104], 0.014), eye(k, [0.033, 0.28, 0.104], 0.014),
                ...legs4(dark, 0.03, 0.05, 0.03),
            ];
            if (id === 'renard') parts.push(k.ball(0.06, fur, [0.1, 0.1, -0.1], [0.8, 0.8, 1.6], [0.3, -0.7, 0]), k.ball(0.035, '#fff7ee', [0.16, 0.12, -0.17], [0.9, 0.9, 1.2], [0.3, -0.7, 0]));
            else {
                parts.push(...[-1, 1].map((s) => k.ball(0.02, '#fff7ee', [s * 0.033, 0.31, 0.09], [1.2, 0.6, 0.5])));
                parts.push(...[0, 1, 2, 3, 4].map((i) => k.ball(0.042 - i * 0.002, i % 2 ? '#f2dcc0' : fur, [0.07 + i * 0.022, 0.07 + i * 0.03, -0.1 - i * 0.02])));
            }
            return k.group(parts, null, null, 1.15);
        }
        case 'dragon': {
            const wing = new THREE.Shape();
            wing.moveTo(0, 0); wing.lineTo(0.16, 0.12); wing.lineTo(0.14, 0.02); wing.lineTo(0.18, -0.02); wing.lineTo(0.12, -0.04); wing.lineTo(0.13, -0.08); wing.lineTo(0, -0.03);
            const wingGeo = new THREE.ShapeGeometry(wing);
            const wm = { color: '#9a6ae0', side: THREE.DoubleSide, roughness: 0.5 };
            return k.group([
                k.ball(0.11, '#4caf6a', [0, 0.13, 0], [1, 1.1, 1]),
                k.ball(0.075, '#f2d64b', [0, 0.12, 0.05], [1, 1.2, 0.7]),
                k.ball(0.085, '#4caf6a', [0, 0.29, 0.03]),
                k.ball(0.05, '#5fbf7a', [0, 0.265, 0.1], [1.1, 0.8, 1]),
                ...[-1, 1].map((s) => k.ball(0.007, '#2f6a3a', [s * 0.017, 0.275, 0.148])),
                ...[-1, 1].map((s) => k.cone(0.014, 0.06, '#f3e6d0', [s * 0.04, 0.38, -0.01], [-0.3, 0, -s * 0.3])),
                eye(k, [-0.035, 0.31, 0.098], 0.016, { white: true }), eye(k, [0.035, 0.31, 0.098], 0.016, { white: true }),
                k.mesh(wingGeo, wm, [0.06, 0.2, -0.06], [0, -0.6, 0.2]),
                k.mesh(wingGeo, wm, [-0.06, 0.2, -0.06], [0, Math.PI + 0.6, 0.2]),
                k.cone(0.05, 0.18, '#4caf6a', [0, 0.06, -0.15], [-Math.PI / 2 - 0.4, 0, 0]),
                ...[0, 1, 2].map((i) => k.cone(0.015, 0.035, '#9a6ae0', [0, 0.24 - i * 0.06, -0.1 + i * 0.005], [-0.6, 0, 0])),
                ...legs4('#3f9a5a', 0.03, 0.055, 0.03),
            ], null, null, 1.15);
        }
        case 'faon':
            return k.group([
                k.cap(0.07, 0.13, '#b8742a', [0, 0.21, 0], [Math.PI / 2, 0, 0]),
                ...[[0.03, 0.27, 0.0], [-0.035, 0.26, -0.05], [0.02, 0.265, -0.09], [-0.02, 0.27, 0.05], [0.045, 0.24, -0.04]].map((p) => k.ball(0.011, '#fff7ee', p, [1, 0.5, 1])),
                ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, z]) => k.cyl(0.015, 0.012, 0.17, '#9c5a22', [x * 0.04, 0.085, z * 0.09])),
                k.cap(0.035, 0.08, '#b8742a', [0, 0.31, 0.1], [0.5, 0, 0]),
                k.ball(0.06, '#b8742a', [0, 0.38, 0.13], [1, 1, 1.05]),
                k.ball(0.032, '#d9a46a', [0, 0.36, 0.18], [1, 0.8, 1]),
                k.ball(0.01, '#1d1410', [0, 0.365, 0.21]),
                ...[-1, 1].map((s) => k.ball(0.035, '#b8742a', [s * 0.065, 0.42, 0.11], [1.3, 0.45, 0.6], [0, 0, s * 0.4])),
                eye(k, [-0.03, 0.395, 0.175], 0.015), eye(k, [0.03, 0.395, 0.175], 0.015),
                k.ball(0.02, '#fff7ee', [0, 0.25, -0.13]),
            ], null, null, 1.05);
        default:
            return null;
    }
}

// ---------------------------------------------------------------- textures from the 2D drawings

function svgCanvas(markup, draw) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = 1024; c.height = 512;
            draw(c.getContext('2d'), img);
            resolve(c);
        };
        img.onerror = () => resolve(null);
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    });
}

async function shirtTexture(id) {
    const shirt = SHIRTS[id] || SHIRTS.foret;
    const [plain, art] = await Promise.all([renderToStaticMarkup(<ShirtArt id={id} plain />), renderToStaticMarkup(<ShirtArt id={id} />)].map((m) => svgCanvas(m, (ctx, img) => ctx.drawImage(img, 0, 0, 1024, 512))));
    if (!plain || !art) return null;
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    // Front of the lathe = middle of the texture. Patterns go all around, pictures only on the chest.
    if (shirt.repeat) [-256, 256, 768].forEach((x) => ctx.drawImage(art, x, 0, 512, 512));
    else { ctx.drawImage(plain, 0, 0); ctx.drawImage(art, 256, 0, 512, 512); }
    return c;
}

async function pantsTexture(id) {
    return svgCanvas(renderToStaticMarkup(<PantsArt id={id} />), (ctx, img) => { ctx.drawImage(img, 0, 0, 512, 512); ctx.drawImage(img, 512, 0, 512, 512); });
}

const toTexture = (canvas, repeat) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
};

// ---------------------------------------------------------------- the stage

function dispose(obj) {
    obj.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
    });
}

function webglOk() {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

const PET_POS = [-0.5, 0, 0.18];

/**
 * `avatar` as stored on the user; `height` in px (the width follows the container).
 * `interactive`: drag to turn (otherwise the character only sways a little).
 */
export default function Avatar3D({ avatar, height = 360, className = '', interactive = true, children }) {
    const wrap = useRef(null);
    const api = useRef(null);
    const [fallback] = useState(() => !webglOk());
    const a = { ...defaultAvatar(''), ...(avatar || {}) };
    const bg = BGS[a.bg] || BGS[0];

    // Renderer, lights, camera and the animation loop: once.
    useEffect(() => {
        if (fallback) return;
        const el = wrap.current;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        // Out of the flow: a canvas sized once too wide (mobile viewport settling) would otherwise
        // keep its frame wide and never let it shrink back.
        renderer.domElement.style.cssText = 'display:block;position:absolute;inset:0';
        el.prepend(renderer.domElement);

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = env;
        scene.environmentIntensity = 0.55;
        const sun = new THREE.DirectionalLight('#fff4e6', 2.2);
        sun.position.set(1.2, 3.2, 2.4);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, top: 2, bottom: -0.3, near: 0.5, far: 8 });
        sun.shadow.radius = 6;
        sun.shadow.bias = -0.0008;
        scene.add(sun, new THREE.HemisphereLight('#ffffff', '#c9b8a8', 0.5));
        const fill = new THREE.DirectionalLight('#dfe8ff', 0.6);
        fill.position.set(-2, 1.5, 1);
        scene.add(fill);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.ShadowMaterial({ opacity: 0.22 }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const stage = new THREE.Group();
        scene.add(stage);
        const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);

        const resize = () => {
            const w = el.clientWidth, h = el.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            const t = Math.tan(THREE.MathUtils.degToRad(13));
            const d = Math.max(1.14 / t, 0.85 / (t * camera.aspect));
            camera.position.set(-0.1, 1.08, d);
            camera.lookAt(-0.1, 0.96, 0);
            camera.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();

        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const state = { yaw: 0.22, drag: null, lastInput: -10, visible: true, char: null, pet: null };
        let raf = 0;
        const clock = new THREE.Clock();
        const frame = () => {
            const t = clock.getElapsedTime();
            if (state.drag == null && t - state.lastInput > 2) state.yaw += (0.22 + (still ? 0 : Math.sin(t * 0.45) * 0.12) - state.yaw) * 0.03;
            stage.rotation.y = state.yaw;
            if (!still) {
                const blink = (off) => ((t + off) % 3.7 < 0.13 ? 0.12 : 1);
                state.char?.traverse((o) => {
                    if (o.userData.blink) o.scale.y = blink(0);
                    if (o.userData.arm) o.rotation.z = o.userData.arm * (0.1 + Math.sin(t * 1.6) * 0.015);
                });
                if (state.char) state.char.position.y = Math.sin(t * 1.6) * 0.004;
                if (state.pet) {
                    const p = (t % 4.6) / 0.55;
                    state.pet.position.y = p < 1 ? Math.sin(Math.PI * p) * 0.08 : 0;
                    state.pet.rotation.y = 0.5 + Math.sin(t * 0.7) * 0.15;
                    state.pet.traverse((o) => { if (o.userData.blink) o.scale.y = blink(1.4); });
                }
            }
            renderer.render(scene, camera);
            raf = state.visible ? requestAnimationFrame(frame) : 0;
        };
        const io = new IntersectionObserver(([e]) => {
            state.visible = e.isIntersecting && !document.hidden;
            if (state.visible && !raf) raf = requestAnimationFrame(frame);
        });
        io.observe(el);
        const onVis = () => { state.visible = !document.hidden; if (state.visible && !raf) raf = requestAnimationFrame(frame); };
        document.addEventListener('visibilitychange', onVis);

        api.current = { stage, state, renderer };
        raf = requestAnimationFrame(frame);
        return () => {
            cancelAnimationFrame(raf);
            io.disconnect(); ro.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            dispose(scene);
            env.dispose(); pmrem.dispose();
            renderer.dispose();
            renderer.domElement.remove();
            api.current = null;
        };
    }, [fallback]);

    // The character itself: rebuilt whenever an item changes.
    const sig = JSON.stringify([a.skin, a.hair, a.hairColor, a.shirt, a.hat, a.face, a.neck, a.pet, a.pants, a.shoes]);
    useEffect(() => {
        if (fallback || !api.current) return;
        const { stage, state } = api.current;
        const k = makeKit();
        const shirt = SHIRTS[a.shirt] || SHIRTS.foret;
        const pantsStyle = PANTS_STYLES[a.pants] || PANTS_STYLES.jean;
        const shirtMat = new THREE.MeshStandardMaterial({ color: shirt.gradient ? shirt.gradient[1] : shirt.base, roughness: 0.78 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: pantsStyle.color, roughness: 0.8 });
        const sleeveMat = shirt.gradient ? new THREE.MeshStandardMaterial({ color: shirt.gradient[0], roughness: 0.78 }) : null;
        const char = buildCharacter(k, a, { shirt: shirtMat, pants: pantsMat, sleeve: sleeveMat });
        const pet = buildPet(k, a.pet);
        if (pet) { pet.position.set(...PET_POS); pet.scale.multiplyScalar(1.3); }
        const root = k.group([char, pet]);
        stage.add(root);
        state.char = char; state.pet = pet;

        let alive = true;
        shirtTexture(a.shirt).then((c) => {
            if (!alive || !c) return;
            shirtMat.map = toTexture(c); shirtMat.color.set('#ffffff'); shirtMat.needsUpdate = true;
        });
        // Plain fabrics stay plain; printed ones (tartan, camo, leaves, stars…) use the 2D drawing.
        if (['pleats', 'ribs', 'flowers', 'plaid', 'camo', 'leaves', 'rainbow', 'stars'].includes(pantsStyle.detail)) {
            pantsTexture(a.pants).then((c) => {
                if (!alive || !c) return;
                pantsMat.map = toTexture(c, [2, 1]); pantsMat.color.set('#ffffff'); pantsMat.needsUpdate = true;
            });
        }
        return () => {
            alive = false;
            stage.remove(root);
            dispose(root);
            if (state.char === char) { state.char = null; state.pet = null; }
        };
    }, [sig, fallback]); // eslint-disable-line react-hooks/exhaustive-deps

    const drag = interactive ? {
        onPointerDown: (e) => { if (api.current) { api.current.state.drag = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId); } },
        onPointerMove: (e) => {
            const s = api.current?.state;
            if (s?.drag == null) return;
            s.yaw += (e.clientX - s.drag) * 0.012;
            s.drag = e.clientX;
            s.lastInput = performance.now() / 1000;
        },
        onPointerUp: () => { const s = api.current?.state; if (s) { s.drag = null; s.lastInput = performance.now() / 1000; } },
        onPointerCancel: () => { const s = api.current?.state; if (s) s.drag = null; },
    } : {};

    return (
        <div ref={wrap} {...drag}
            className={`relative overflow-hidden rounded-3xl select-none ${interactive ? 'cursor-grab active:cursor-grabbing' : ''} ${className}`}
            style={{
                height, touchAction: 'pan-y',
                background: `radial-gradient(120% 85% at 50% 28%, color-mix(in srgb, ${bg} 22%, #fff) 0%, color-mix(in srgb, ${bg} 55%, #fff) 48%, ${bg} 100%)`,
            }}>
            {fallback && <div className="absolute inset-0 grid place-items-center"><AvatarFigure avatar={a} full size={height * 0.92} animate /></div>}
            {/* Soft floor, like a studio backdrop. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'linear-gradient(to top, rgba(255,255,255,.28), transparent)' }} />
            {children}
        </div>
    );
}
