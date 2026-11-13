// Rewarded video ads. The server picks the provider (adStatus.provider):
// - 'google': AdSense H5 Games Ads (Ad Placement API). The publisher id is public (it also goes in /ads.txt).
// - 'applixir': AppLixir SDK v6.1.0. Its servers confirm each completed ad to our API, which grants the booster.
const ADSENSE_CLIENT = 'ca-pub-2706263813199995';
const APPLIXIR_SDK = 'https://cdn.applixir.com/applixir.app.v6.1.0.js';
const APPLIXIR_API_KEY = 'd127191f-1eea-49d5-a7e6-d54914014da5'; // public client key
const APPLIXIR_CONTAINER = 'applixir-ad-container';

let loaded = '';

export const adsEnabled = () => !!ADSENSE_CLIENT;

export function loadAds(provider = 'google') {
    if (loaded === provider) return;
    loaded = provider;
    const script = document.createElement('script');
    script.async = true;
    if (provider === 'applixir') {
        script.src = APPLIXIR_SDK;
        document.head.appendChild(script);
        const box = document.createElement('div');
        box.id = APPLIXIR_CONTAINER;
        box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none';
        document.body.appendChild(box);
        return;
    }
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.dataset.adFrequencyHint = '30s';
    if (new URLSearchParams(location.search).has('adtest')) script.dataset.adbreakTest = 'on';
    document.head.appendChild(script);
    // Official shim: calls are queued until the library is ready.
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = (o) => window.adsbygoogle.push(o);
    window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
}

// Resolves 'viewed' (reward earned), 'dismissed' (closed early) or 'unavailable' (no ad to show).
// Call it straight from the click: the AppLixir player must open inside the user gesture.
export function showRewardedAd(provider = 'google', userId = '') {
    return provider === 'applixir' ? showApplixir(userId) : showGoogle();
}

function showGoogle() {
    return new Promise((resolve) => {
        if (!window.adBreak) return resolve('unavailable');
        let result = 'unavailable';
        // If the library never answers (blocked by an ad blocker), give up.
        const timer = setTimeout(() => resolve('unavailable'), 15000);
        window.adBreak({
            type: 'reward',
            name: 'booster-offert',
            beforeReward: (showAdFn) => { clearTimeout(timer); showAdFn(); },
            adDismissed: () => { result = 'dismissed'; },
            adViewed: () => { result = 'viewed'; },
            adBreakDone: () => { clearTimeout(timer); resolve(result); },
        });
    });
}

const SKIPPED = ['skipped', 'skip', 'manuallyEnded', 'adSkippedNoReward'];
const ENDED = [...SKIPPED, 'allAdsCompleted', 'consentDeclined', 'consentUnavailable', 'thankYouModalClosed'];

function showApplixir(userId) {
    return new Promise((resolve) => {
        if (typeof window.initializeAndOpenPlayer !== 'function') return resolve('unavailable'); // ad blocker, offline
        const box = document.getElementById(APPLIXIR_CONTAINER);
        let viewed = false, done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            clearTimeout(watchdog);
            if (box) box.style.display = 'none';
            resolve(result);
        };
        // a bad key or a blocked player can fire no callback at all: don't leave the button stuck
        let watchdog = setTimeout(() => finish('unavailable'), 15000);
        if (box) box.style.display = 'block';
        window.initializeAndOpenPlayer({
            apiKey: APPLIXIR_API_KEY,
            injectionElementId: APPLIXIR_CONTAINER,
            userId, // sent back to our server callback: the player to credit
            adStatusCallbackFn: (status) => {
                // the docs show both an object { type } and a bare string ('ad-watched'): accept either
                const type = typeof status === 'string' ? status : status?.type;
                if (type === 'loaded' || type === 'started') clearTimeout(watchdog);
                if (type === 'complete' || type === 'ad-watched') viewed = true;
                else if (ENDED.includes(type)) finish(viewed ? 'viewed' : SKIPPED.includes(type) ? 'dismissed' : 'unavailable');
            },
            adErrorCallbackFn: () => finish(viewed ? 'viewed' : 'unavailable'), // no ad to show
        });
    });
}
