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
// The more you spend, the more you get per euro (500 → 700 → 1 000 graines per euro).
// `once`: one purchase per account, double the smallest pack, to make the first step easy.
export const PACKS = {
    welcome: { label: 'Offre de bienvenue', coins: 2000, nuggets: 300, price: 199, once: true },
    seeds_s: { label: 'Sachet de graines', coins: 1000, nuggets: 0, price: 199 },
    seeds_m: { label: 'Sac de graines', coins: 3500, nuggets: 0, price: 499, bonus: 500 },
    seeds_l: { label: 'Grenier à graines', coins: 10000, nuggets: 0, price: 999, bonus: 3000 },
    nuggets_s: { label: 'Bourse de pépites', coins: 0, nuggets: 500, price: 299 },
    nuggets_m: { label: 'Coffret de pépites', coins: 0, nuggets: 1800, price: 799, bonus: 300 },
    naturalist: { label: 'Pack du naturaliste', coins: 7000, nuggets: 1500, price: 1299, best: true },
};

// Monthly subscription (Stripe Billing). Perks last until the paid period ends, even after
// cancelling. Every paid month is also stored as a `pass` purchase, so the donation counts.
export const PASS = {
    label: 'Pass Naturaliste', price: 399,
    dailyCoins: 100, // on top of the daily bonus
    dailyNuggets: 40,
    catches: 5, // extra exploration catches a day
    quizzes: 2, // extra quizzes a day
    chargeMinutes: 45, // a free booster every 45 min instead of every hour
};
export const passActive = (user) => !!user?.pass_until && new Date(user.pass_until).getTime() > Date.now();

// Stripe tax code, required when Managed Payments is on: "electronically supplied services".
const TAX_CODE = process.env.STRIPE_TAX_CODE || 'txcd_10000000';

export const donationOf = (cents) => Math.round(cents * DONATION_SHARE);
export const euros = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;
export const stripeTestMode = () => /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || '');

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

export function createPassCheckout({ userId, association, username, origin }) {
    const a = ASSOCIATIONS[association];
    const meta = { kind: 'pass', user_id: userId, association, username };
    return stripe('POST', 'checkout/sessions', {
        mode: 'subscription',
        locale: 'fr',
        client_reference_id: `pass:${userId}`,
        line_items: {
            0: {
                quantity: 1,
                price_data: {
                    currency: 'eur',
                    unit_amount: PASS.price,
                    recurring: { interval: 'month' },
                    product_data: { tax_code: TAX_CODE, name: `${PASS.label} NatureDex (mensuel)` },
                },
            },
        },
        metadata: meta,
        subscription_data: { description: `${PASS.label} : dont ${euros(donationOf(PASS.price))} par mois pour ${a.name}. Compte joueur : ${username}.`, metadata: meta },
        success_url: `${origin}/boutique?pass={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/boutique?annule=1`,
    });
}

export const getSubscription = (id) => stripe('GET', `subscriptions/${encodeURIComponent(id)}?expand[]=latest_invoice`);
export const setCancelAtPeriodEnd = (id, cancel) => stripe('POST', `subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: cancel });
// Moved to the subscription items in recent API versions.
export const periodEnd = (sub) => sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
export const invoiceSubscription = (inv) => inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;

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
