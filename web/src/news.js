import { BookOpen, Crown, Frame, HeartHandshake, Palette } from 'lucide-react';

// « Nouveautés » pop-up shown once per account at the next visit. To announce new features,
// replace the items and give NEWS a new id (the date): every player who joined before it sees it once.
export const NEWS = {
    id: '2026-10-17',
    title: 'Quoi de neuf sur NatureDex ?',
    items: [
        { Icon: Frame, title: 'Les vitrines des joueurs', text: 'Découvre les vitrines de toute la communauté et vote ♥ pour tes préférées.', to: '/vitrines' },
        { Icon: Crown, title: 'Concours de la semaine', text: 'Chaque lundi, les 3 vitrines les plus aimées gagnent 300, 200 et 100 pépites.', to: '/vitrines' },
        { Icon: Palette, title: '6 nouveaux fonds premium', text: 'Récif, sous-bois, cerisiers, savane, abysses et arc-en-ciel pour ta vitrine.', to: '/vitrine' },
        { Icon: HeartHandshake, title: 'Classement des donateurs', text: 'Une partie de chaque achat va aux associations : vois qui les soutient le plus.', to: '/classement' },
        { Icon: BookOpen, title: 'Le blog nature', text: 'Un nouvel article chaque jour sur la faune et la flore, dans l\'onglet Blog.', href: 'https://naturedex.fr/api/blog' },
    ],
};

// Players who signed up after the news was published have nothing "new" to discover.
export const hasNews = (user) => !!user && user.newsSeen !== NEWS.id && !!user.joinedAt && new Date(user.joinedAt) < new Date(`${NEWS.id}T00:00:00+02:00`);
