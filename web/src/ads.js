// Rewarded video ads via Google AdSense H5 Games Ads (Ad Placement API).
// The publisher id is public (it also goes in /ads.txt). Empty = feature hidden.
const ADSENSE_CLIENT = 'ca-pub-2706263813199995';

let loaded = false;

export const adsEnabled = () => !!ADSENSE_CLIENT;

export function loadAds() {
    if (loaded || !ADSENSE_CLIENT) return;
    loaded = true;
    const script = document.createElement('script');
    script.async = true;
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
export function showRewardedAd() {
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
