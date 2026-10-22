import { Camera, Sparkles, Sprout, Users } from 'lucide-react';

// « Nouveautés » pop-up shown once per account at the next visit. To announce new features,
// replace the items and give NEWS a new id (the date): every player who joined before it sees it once.
export const NEWS = {
    id: '2026-10-22',
    title: 'Nouveau : Sur le terrain',
    items: [
        { Icon: Camera, title: 'Photographie la vraie nature', text: "Prends en photo une plante, un animal ou un champignon : l'IA reconnaît l'espèce et ta photo devient une carte de terrain unique.", to: '/terrain' },
        { Icon: Sprout, title: 'De 30 à 150 graines', text: "Selon la rareté de l'espèce, 5 observations récompensées par jour, et la carte offerte si tu ne l'as pas encore.", to: '/terrain' },
        { Icon: Sparkles, title: 'Sois le premier', text: 'Première observation NatureDex d\'une espèce ? +50 graines et ton pseudo sur l\'observation n°1.', to: '/terrain' },
        { Icon: Users, title: 'Le carnet de la communauté', text: 'Découvre les photos des autres naturalistes, et les tiennes sur la fiche de chaque espèce.', to: '/terrain' },
    ],
};

// Players who signed up after the news was published have nothing "new" to discover.
export const hasNews = (user) => !!user && user.newsSeen !== NEWS.id && !!user.joinedAt && new Date(user.joinedAt) < new Date(`${NEWS.id}T00:00:00+02:00`);
