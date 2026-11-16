// Google Play Billing inside the Android app (Trusted Web Activity), through the Digital Goods API.
// In the app, every real-money purchase must go through Google Play (Play Store policy):
// the shop switches to these helpers and never shows the Stripe checkout there.
import { api } from './api.jsx';

const PLAY_BILLING = 'https://play.google.com/billing';
const FLAG = 'naturdex.twa';

// The app opens /?source=twa (Bubblewrap start URL) and Chrome sets an android-app:// referrer.
// sessionStorage, not localStorage: the TWA shares its storage with Chrome on the same phone.
export function isPlayApp() {
    try {
        if (new URLSearchParams(window.location.search).get('source') === 'twa' || document.referrer.startsWith('android-app://')) {
            sessionStorage.setItem(FLAG, '1');
        }
        return sessionStorage.getItem(FLAG) === '1';
    } catch {
        return false;
    }
}

let service = null;
export async function playService() {
    if (service) return service;
    if (!('getDigitalGoodsService' in window)) throw new Error('Google Play Billing indisponible : mets à jour Chrome et l\'appli NatureDex.');
    service = await window.getDigitalGoodsService(PLAY_BILLING);
    if (!service) throw new Error('Google Play Billing indisponible sur cet appareil.');
    return service;
}

// Localised prices as Google Play shows them: { itemId: '1,99 €' }
export async function playPrices(ids) {
    const s = await playService();
    const details = await s.getDetails(ids);
    return Object.fromEntries(details.map((d) => [d.itemId,
        new Intl.NumberFormat('fr-FR', { style: 'currency', currency: d.price.currency }).format(Number(d.price.value))]));
}

// Opens the Google Play purchase sheet, then lets the server check and credit the token.
export async function playBuy(itemId, association) {
    await playService();
    const request = new PaymentRequest(
        [{ supportedMethods: PLAY_BILLING, data: { sku: itemId } }],
        { total: { label: 'Total', amount: { currency: 'EUR', value: '0' } } },
    );
    let response;
    try {
        response = await request.show();
    } catch (err) {
        if (err.name === 'AbortError') return null; // closed by the player
        throw err;
    }
    try {
        const res = await api('playPurchase', { productId: itemId, token: response.details.purchaseToken, association });
        await response.complete('success');
        return res;
    } catch (err) {
        await response.complete('fail').catch(() => {});
        throw err;
    }
}

// Purchases Play still holds (not consumed / acknowledged yet): credit them now.
export async function playRestore() {
    const s = await playService();
    const owned = await s.listPurchases();
    let user = null;
    for (const p of owned) {
        const res = await api('playPurchase', { productId: p.itemId, token: p.purchaseToken }).catch(() => null);
        if (res?.user) user = res.user;
    }
    return user;
}
