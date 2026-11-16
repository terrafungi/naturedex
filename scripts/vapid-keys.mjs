// Generates the VAPID key pair for Web Push. Run once: node scripts/vapid-keys.mjs
// Put both values on the `api` function (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY). Changing them later
// invalidates every existing subscription (players would have to re-enable notifications).
import crypto from 'node:crypto';

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}`);
