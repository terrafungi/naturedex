import { Bird, Bone, Flower2, PawPrint, TreeDeciduous, Waves } from 'lucide-react';

export function Pack() {
    return (
        <div className="nd-pack nd-shine">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="grid grid-cols-3 gap-3 text-white/80">
                    <PawPrint className="w-6 h-6" /><Bird className="w-6 h-6" /><TreeDeciduous className="w-6 h-6" />
                    <Waves className="w-6 h-6" /><Flower2 className="w-6 h-6" /><Bone className="w-6 h-6" />
                </div>
                <div className="font-display leading-none">
                    <div className="text-4xl font-black tracking-tight">Natur<span className="font-medium">Dex</span></div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.3em] text-white/85">Booster · 6 cartes</div>
                </div>
                <div className="mt-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur border border-white/50 text-white font-bold text-[10px] uppercase tracking-[0.2em]">
                    1 carte rare garantie
                </div>
            </div>
        </div>
    );
}
