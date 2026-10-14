// Real-money shop: Stripe Checkout (hosted page, no card data ever reaches us).
// Credits are granted only once Stripe reports the session as paid, through
// either the webhook or a server-side check when the player comes back.
import crypto from 'node:crypto';

export const DONATION_SHARE = 0.2; // 20 % of every price paid goes to the chosen association

export const ASSOCIATIONS = {
    lpo: {
        name: 'LPO', full: 'Ligue pour la Protection des Oiseaux', url: 'https://www.lpo.fr',
        text: 'Protège les oiseaux et la biodiversité en France depuis 1912 : refuges, soins à la faune sauvage, suivi des espèces.',
    },
    wwf: {
        name: 'WWF France', full: 'World Wide Fund for Nature', url: 'https://www.wwf.fr',
        text: 'Agit pour les espèces menacées et leurs habitats : forêts, océans, eau douce, partout dans le monde.',
    },
    hb: {
        name: 'Humanité & Biodiversité', full: 'Association fondée par Hubert Reeves', url: 'https://www.humanite-biodiversite.fr',
        text: 'Défend la biodiversité et les liens entre l\'humain et le vivant, avec les Oasis Nature et un travail de plaidoyer.',
    },
};

// cents, EUR. `bonus` is only shown in the shop (already included in the amounts).
export const PACKS = {
    seeds_s: { label: 'Sachet de graines', coins: 1000, nuggets: 0, price: 199 },
    seeds_m: { label: 'Sac de graines', coins: 3500, nuggets: 0, price: 499, bonus: 500 },
    seeds_l: { label: 'Grenier à graines', coins: 8500, nuggets: 0, price: 999, bonus: 1500 },
    nuggets_s: { label: 'Bourse de pépites', coins: 0, nuggets: 500, price: 299 },
    nuggets_m: { label: 'Coffret de pépites', coins: 0, nuggets: 1800, price: 799, bonus: 300 },
    naturalist: { label: 'Pack du naturaliste', coins: 6000, nuggets: 1200, price: 1299, best: true },
};

// Stripe tax code, required when Managed Payments is on: "electronically supplied services".
const TAX_CODE = process.env.STRIPE_TAX_CODE || 'txcd_10000000';

export const donationOf = (cents) => Math.round(cents * DONATION_SHARE);
export const euros = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;
export const stripeTestMode = () => (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');

// Stripe expects nested form fields: { a: { b: 1 } } → a[b]=1
function form(obj, prefix = '', out = new URLSearchParams()) {
    for (const [k, v] of Object.entries(obj)) {
        if (v == null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (typeof v === 'object') form(v, key, out);
        else out.append(key, String(v));
    }
    return out;
}

async function stripe(method, path, params) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        method,
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params ? form(params) : undefined,
        signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (!res.ok) {
        console.error('stripe', path, data.error?.message);
        throw new Error(data.error?.message || 'Stripe error');
    }
    return data;
}

export function createCheckout({ purchaseId, pack, association, username, origin }) {
    const p = PACKS[pack];
    const a = ASSOCIATIONS[association];
    const content = [p.coins && `${p.coins.toLocaleString('fr-FR')} graines`, p.nuggets && `${p.nuggets.toLocaleString('fr-FR')} pépites`].filter(Boolean).join(' + ');
    return stripe('POST', 'checkout/sessions', {
        mode: 'payment',
        locale: 'fr',
        client_reference_id: String(purchaseId),
        line_items: {
            0: {
                quantity: 1,
                price_data: {
                    currency: 'eur',
                    unit_amount: p.price,
                    product_data: {
                        tax_code: TAX_CODE,
                        name: `${p.label} NatureDex : ${content}`,
                        description: `Dont ${euros(donationOf(p.price))} reversés à ${a.name}. Compte joueur : ${username}.`,
                    },
                },
            },
        },
        metadata: { purchase_id: purchaseId, pack, association, username },
        payment_intent_data: { description: `NatureDex ${pack} (#${purchaseId})`, metadata: { purchase_id: purchaseId, association } },
        success_url: `${origin}/boutique?achat={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/boutique?annule=1`,
    });
}

export const getCheckout = (id) => stripe('GET', `checkout/sessions/${encodeURIComponent(id)}`);

// Stripe-Signature: t=timestamp,v1=hex(hmac_sha256(secret, `${t}.${body}`))
export function verifyWebhook(rawBody, header, secret, toleranceSec = 300) {
    if (!header || !secret) return null;
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
    const t = Number(parts.t);
    const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
    if (!t || !signatures.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return null;
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
    const ok = signatures.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
    return ok ? JSON.parse(rawBody) : null;
}
