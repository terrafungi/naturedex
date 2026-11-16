// Google Play Billing (Android app = Trusted Web Activity). The app buys through the
// Digital Goods API and sends us the purchase token; we check it with the Google Play
// Developer API (service account), then credit the player and consume / acknowledge it.
//
// Environment variables:
// - PLAY_PACKAGE_NAME   Android package, e.g. fr.naturedex.app
// - PLAY_SERVICE_ACCOUNT  service-account JSON key (raw JSON or base64 of it), with
//                         access to the app in Play Console (Users & permissions → "View financial data" + "Manage orders")
//
// Product ids in Play Console must match: one-time products = the PACKS keys (welcome, seeds_s, …),
// subscription = PLAY_PASS_ID with one monthly base plan.
import crypto from 'node:crypto';

export const PLAY_PASS_ID = 'pass_naturaliste';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

export const playPackage = () => process.env.PLAY_PACKAGE_NAME || '';
export const playReady = () => !!(process.env.PLAY_PACKAGE_NAME && process.env.PLAY_SERVICE_ACCOUNT);

let account = null;
function serviceAccount() {
    if (account) return account;
    const raw = (process.env.PLAY_SERVICE_ACCOUNT || '').trim();
    account = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    return account;
}

const b64url = (data) => Buffer.from(data).toString('base64url');

let cached = { token: null, until: 0 };
async function accessToken() {
    if (cached.token && Date.now() < cached.until) return cached.token;
    const sa = serviceAccount();
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
        iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    }));
    const signature = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
        signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Google OAuth: ${data.error_description || data.error || res.status}`);
    cached = { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 };
    return cached.token;
}

async function play(method, path, body) {
    const res = await fetch(`${API}/${encodeURIComponent(playPackage())}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
        console.error('play', method, path.split('/tokens/')[0], data.error?.message);
        const err = new Error(data.error?.message || `Google Play error ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

const enc = encodeURIComponent;

// One-time products. purchaseState: 0 purchased, 1 cancelled, 2 pending.
// consumptionState: 0 yet to be consumed, 1 consumed. purchaseType: 0 test (licence testers).
export const getProduct = (productId, token) => play('GET', `purchases/products/${enc(productId)}/tokens/${enc(token)}`);
export const consumeProduct = (productId, token) => play('POST', `purchases/products/${enc(productId)}/tokens/${enc(token)}:consume`);

// Subscriptions (v2): state + expiry of the current line item.
export const getSubscription = (token) => play('GET', `purchases/subscriptionsv2/tokens/${enc(token)}`);
export const acknowledgeSubscription = (subId, token) =>
    play('POST', `purchases/subscriptions/${enc(subId)}/tokens/${enc(token)}:acknowledge`, {});

// Perks stay while the paid period runs: CANCELED only means "won't renew".
const LIVE_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);

export function subscriptionInfo(sub) {
    const item = sub.lineItems?.find((l) => l.productId === PLAY_PASS_ID) || sub.lineItems?.[0] || {};
    const until = item.expiryTime ? new Date(item.expiryTime) : null;
    return {
        productId: item.productId,
        live: LIVE_STATES.has(sub.subscriptionState) && !!until && until.getTime() > Date.now(),
        until,
        cancelled: sub.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED' || item.autoRenewingPlan?.autoRenewEnabled === false,
        acknowledged: sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        order: sub.latestOrderId || null,
        test: !!sub.testPurchase,
        linked: sub.linkedPurchaseToken || null,
    };
}

export const manageSubscriptionUrl = () =>
    `https://play.google.com/store/account/subscriptions?sku=${enc(PLAY_PASS_ID)}&package=${enc(playPackage())}`;
