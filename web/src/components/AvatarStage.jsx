import { Suspense, lazy } from 'react';
import { AvatarFigure, BGS } from './PlayerAvatar.jsx';

// three.js is heavy: it is only downloaded when a big avatar view is opened.
const Avatar3D = lazy(() => import('./Avatar3D.jsx'));

/** The character in 3D on its coloured stage, like a trainer card. `children` are laid over the top. */
export default function AvatarStage({ avatar, height = 380, interactive = true, children, className = '' }) {
    const fallback = (
        <div className={`relative overflow-hidden rounded-3xl grid place-items-center ${className}`} style={{ height, background: BGS[avatar?.bg] || BGS[0] }}>
            <AvatarFigure avatar={avatar} full size={height * 0.85} animate />
            {children}
        </div>
    );
    return (
        <Suspense fallback={fallback}>
            <Avatar3D avatar={avatar} height={height} interactive={interactive} className={className}>{children}</Avatar3D>
        </Suspense>
    );
}

/** Name and badges in the top-left corner of the stage, readable on any background colour. */
export function StageTitle({ kicker, name, children }) {
    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 p-5 pr-16 pb-16 bg-gradient-to-b from-black/45 via-black/15 to-transparent">
            <p className="uppercase tracking-[0.25em] text-[11px] font-bold text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,.5)]">{kicker}</p>
            <h1 className="font-display text-3xl sm:text-4xl font-medium text-white truncate [text-shadow:0_2px_10px_rgba(0,0,0,.45)]">{name}</h1>
            <div className="pointer-events-auto flex flex-wrap gap-2">{children}</div>
        </div>
    );
}
