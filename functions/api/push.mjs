// Web Push (site + Android app: the TWA shows web notifications as Android notifications).
// No dependency: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291) with node:crypto.
//
// Environment variables (generate once with `node scripts/vapid-keys.mjs`):
// - VAPID_PUBLIC_KEY   base64url, uncompressed P-256 point (65 bytes)
// - VAPID_PRIVATE_KEY  base64url, private scalar (32 bytes)
// - VAPID_SUBJECT      optional, defaults to https://naturedex.fr
import crypto from 'node:crypto';

// Categories a player can switch off one by one (users.push_prefs[key] === false).
export const PUSH_KINDS = {
    boosters: 'Boosters gratuits rechargés',
    auctions: 'Enchères : surenchère, vente, carte gagnée',
    social: 'Messages, cadeaux et demandes d\'amis',
    advent: 'Calendrier de l\'Avent : la case du jour',
};

export const pushReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

const b64 = (s) => Buffer.from(String(s), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

let signingKey = null;
function vapidKey() {
    if (signingKey) return signingKey;
    const pub = b64(process.env.VAPID_PUBLIC_KEY);
    signingKey = crypto.createPrivateKey({
        format: 'jwk',
        key: { kty: 'EC', crv: 'P-256', d: process.env.VAPID_PRIVATE_KEY, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') },
    });
    return signingKey;
}

const jwts = new Map(); // audience → { token, until }
function vapidJwt(audience) {
    const hit = jwts.get(audience);
    if (hit && hit.until > Date.now()) return hit.token;
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: process.env.VAPID_SUBJECT || 'https://naturedex.fr' })).toString('base64url');
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: vapidKey(), dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const token = `${head}.${claims}.${sig}`;
    jwts.set(audience, { token, until: Date.now() + 11 * 3600 * 1000 });
    return token;
}

// RFC 8291: one aes128gcm record, keyed from an ECDH with the browser's key and its auth secret.
export function encryptPayload(payload, p256dh, auth) {
    const uaPublic = b64(p256dh);
    const authSecret = b64(auth);
    const ecdh = crypto.createECDH('prime256v1');
    const asPublic = ecdh.generateKeys();
    const shared = ecdh.computeSecret(uaPublic);
    const salt = crypto.randomBytes(16);
    const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const rs = Buffer.alloc(4);
    rs.writeUInt32BE(4096);
    return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// → 'ok' | 'gone' (subscription expired: delete it) | 'error'
export async function sendPush(sub, message, { ttl = 24 * 3600, urgency = 'normal', topic } = {}) {
    const url = new URL(sub.endpoint);
    const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
            Authorization: `vapid t=${vapidJwt(url.origin)}, k=${process.env.VAPID_PUBLIC_KEY}`,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(ttl),
            Urgency: urgency,
            ...(topic ? { Topic: topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
        },
        body: encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth),
        signal: AbortSignal.timeout(8000),
    }).catch((err) => ({ ok: false, status: 0, text: async () => err.message }));
    if (res.ok) return 'ok';
    if (res.status === 404 || res.status === 410) return 'gone';
    console.error('push', url.host, res.status, (await res.text().catch(() => '')).slice(0, 200));
    return 'error';
}
