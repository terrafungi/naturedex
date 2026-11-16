import { Crop, Flag, Layers } from 'lucide-react';

// « Nouveautés » pop-up shown once per account at the next visit. To announce new features,
// replace the items and give NEWS a new id (the date): every player who joined before it sees it once.
export const NEWS = {
    id: '2026-11-16',
    title: 'Nouveau : des images mieux cadrées',
    items: [
        { Icon: Flag, title: 'Signale une image mal cadrée', text: 'On ne voit que la tête, ou presque rien ? Ouvre la carte et touche « Image mal cadrée ? Signaler », sous la carte.', to: '/collection' },
        { Icon: Crop, title: 'L\'équipe la recadre', text: 'Chaque signalement arrive chez nous : on recadre l\'image à la main, en déplaçant et en zoomant sur l\'espèce.', to: '/collection' },
        { Icon: Layers, title: 'Pour tous les joueurs', text: 'Une fois recadrée, la carte est corrigée partout : collection, combats, vitrines, Full art et Illustrations compris.', to: '/collection' },
    ],
};

// Players who signed up after the news was published have nothing "new" to discover.
export const hasNews = (user) => !!user && user.newsSeen !== NEWS.id && !!user.joinedAt && new Date(user.joinedAt) < new Date(`${NEWS.id}T00:00:00+02:00`);
