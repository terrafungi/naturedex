import { Flag, Images, ScanEye } from 'lucide-react';

// « Nouveautés » pop-up shown once per account at the next visit. To announce new features,
// replace the items and give NEWS a new id (the date): every player who joined before it sees it once.
export const NEWS = {
    id: '2026-11-17',
    title: 'Le recadrage des images : ce qu\'il faut savoir',
    items: [
        { Icon: Images, title: 'Des photos de partout', text: 'Les images des cartes viennent de photographes et de naturalistes du monde entier, dans tous les formats. Le recadrage ne sera donc pas toujours parfait.', to: '/collection' },
        { Icon: ScanEye, title: 'On garde l\'essentiel', text: 'Quand l\'animal ou la plante ne rentre pas en entier dans la carte, on privilégie ce qui compte : la tête, la fleur, ou la composition de la photo.', to: '/collection' },
        { Icon: Flag, title: 'Continue de signaler', text: 'Une image vraiment ratée ? Ouvre la carte et touche « Image mal cadrée ? Signaler » : on regarde chaque signalement.', to: '/collection' },
    ],
};

// Players who signed up after the news was published have nothing "new" to discover.
export const hasNews = (user) => !!user && user.newsSeen !== NEWS.id && !!user.joinedAt && new Date(user.joinedAt) < new Date(`${NEWS.id}T00:00:00+02:00`);
