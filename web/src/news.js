import { Camera, Compass, MapPin, Trees } from 'lucide-react';

// « Nouveautés » pop-up shown once per account at the next visit. To announce new features,
// replace the items and give NEWS a new id (the date): every player who joined before it sees it once.
export const NEWS = {
    id: '2026-10-23',
    title: 'Nouveau : Exploration',
    items: [
        { Icon: Compass, title: 'Des cartes dans le vrai monde', text: 'Des cartes NatureDex apparaissent sur une carte autour de toi. Marche jusqu\'à elles et attrape-les : elles rejoignent ta collection !', to: '/exploration' },
        { Icon: Trees, title: 'Plus c\'est sauvage, plus c\'est rare', text: 'Forêts, marais et montagnes cachent bien plus de cartes rares, épiques et légendaires que la ville.', to: '/exploration' },
        { Icon: MapPin, title: 'De vraies espèces locales', text: 'Seules apparaissent des espèces réellement observées près de toi. Nouvelles cartes toutes les 30 min, 10 captures par jour.', to: '/exploration' },
        { Icon: Camera, title: 'Sur le terrain', text: 'Le mode photo reste là : photographie une vraie espèce pour gagner des graines et ta carte de terrain.', to: '/terrain' },
    ],
};

// Players who signed up after the news was published have nothing "new" to discover.
export const hasNews = (user) => !!user && user.newsSeen !== NEWS.id && !!user.joinedAt && new Date(user.joinedAt) < new Date(`${NEWS.id}T00:00:00+02:00`);
