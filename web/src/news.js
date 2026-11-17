import { Bell, CalendarDays, Gift, Sparkles } from 'lucide-react';

// « Nouveautés » pop-up shown once per account at the next visit. To announce new features,
// replace the items and give NEWS a new id (the date): every player who joined before it sees it once.
export const NEWS = {
    id: '2026-11-18',
    title: 'Le calendrier de l\'Avent arrive le 1er décembre !',
    items: [
        { Icon: CalendarDays, title: '24 cases, 24 cartes de Noël', text: 'Du 1er au 24 décembre, une case à ouvrir chaque jour : sapins, épices, animaux du Grand Nord et présents des Rois mages. Communes, holo ou full art.', to: '/avent' },
        { Icon: Gift, title: 'Introuvables ailleurs', text: 'Ces cartes portent le tag « Avent 2026 » et ne sortent jamais dans les boosters. Attention : une case non ouverte le jour même est perdue.', to: '/avent' },
        { Icon: Sparkles, title: 'Un final légendaire', text: 'Le 23, un renne légendaire en full art. Le 24, le père Noël… avec une chance sur dix de le recevoir en version secrète.', to: '/avent' },
        { Icon: Bell, title: 'Ne rate aucune case', text: 'Active les notifications dans ton profil : un rappel chaque matin tant que la case du jour n\'est pas ouverte.', to: '/profil' },
    ],
};

// Players who signed up after the news was published have nothing "new" to discover.
export const hasNews = (user) => !!user && user.newsSeen !== NEWS.id && !!user.joinedAt && new Date(user.joinedAt) < new Date(`${NEWS.id}T00:00:00+02:00`);
