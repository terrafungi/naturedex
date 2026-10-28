import { Link } from 'react-router-dom';

// Data controller (a private individual) — required by the GDPR (art. 13).
const EDITOR = 'NatureDex';
const CONTACT = 'contact@naturedex.fr';
const UPDATED = '28 octobre 2026';

function Section({ title, children }) {
    return (
        <section className="mt-8">
            <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
            <div className="mt-3 space-y-3 text-ink-soft leading-relaxed">{children}</div>
        </section>
    );
}

const Mail = () => <a className="underline text-white hover:text-[#a8f0c6]" href={`mailto:${CONTACT}`}>{CONTACT}</a>;

export default function Privacy() {
    return (
        <div className="max-w-3xl mx-auto px-4 py-10">
            <p className="uppercase tracking-[0.25em] text-xs font-bold text-brass-deep">NatureDex</p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white mt-1">Politique de confidentialité</h1>
            <p className="mt-2 text-sm text-ink-soft">Dernière mise à jour : {UPDATED}</p>

            <Section title="Qui sommes-nous ?">
                <p>
                    {EDITOR} (naturedex.fr) est un jeu de cartes nature édité à titre personnel par son créateur, responsable du traitement de vos données.
                    Pour toute question ou demande concernant vos données : <Mail />.
                </p>
                <p>
                    Le site est hébergé par Amazon Web Services EMEA SARL (38 avenue John F. Kennedy, L-1855 Luxembourg), via la plateforme OpenKBS,
                    dans des centres de données situés dans l'Union européenne (Francfort).
                </p>
            </Section>

            <Section title="Les données que nous collectons">
                <p>NatureDex collecte le minimum : <b className="text-white">pas d'adresse e-mail, pas de nom réel, pas de date de naissance</b>.</p>
                <ul className="list-disc pl-5 space-y-2">
                    <li><b className="text-white">Compte</b> : pseudo et mot de passe (stocké uniquement sous forme chiffrée, illisible même pour nous), date d'inscription, parrain éventuel.</li>
                    <li><b className="text-white">Jeu</b> : cartes, collection, graines, pépites, jardin, combats, quiz, défis, trophées, avatar, vitrines, enchères.</li>
                    <li><b className="text-white">Échanges entre joueurs</b> : amis, messages privés, offres d'échange et cadeaux, conservés pour que vous puissiez les relire.</li>
                    <li>
                        <b className="text-white">Mode terrain</b> : les photos que vous prenez d'êtres vivants. Les métadonnées (EXIF) sont supprimées dans votre téléphone avant l'envoi.
                        Si vous l'autorisez, votre position est envoyée arrondie à environ 11 km ; une fois l'observation validée, seule la région (ou le pays pour les espèces menacées) est conservée.
                        Les photos validées sont visibles par les autres joueurs. Ne photographiez pas de personnes : les photos avec un visage reconnaissable sont refusées.
                    </li>
                    <li><b className="text-white">Exploration</b> : si vous activez la carte, votre dernière position connue est enregistrée (une seule, remplacée à chaque mise à jour, jamais d'historique de trajet) pour faire apparaître les espèces autour de vous et empêcher la triche.</li>
                    <li><b className="text-white">Achats</b> : le paiement est réalisé sur la page sécurisée de Stripe. Nous ne voyons ni ne stockons votre carte bancaire ; nous conservons l'historique des achats (pack, montant, date, référence Stripe), y compris les dons aux associations.</li>
                    <li><b className="text-white">Pubs récompensées</b> : nous enregistrons le nombre de pubs regardées par jour, pour appliquer la limite quotidienne.</li>
                </ul>
            </Section>

            <Section title="Pourquoi et sur quelle base">
                <ul className="list-disc pl-5 space-y-2">
                    <li>Faire fonctionner le jeu et votre compte : exécution du service que vous demandez en vous inscrivant.</li>
                    <li>Gérer les achats et le Pass Naturaliste : exécution du contrat, et obligations comptables pour l'historique des achats.</li>
                    <li>Lutter contre la triche et les abus (limites quotidiennes, signalements de photos) : intérêt légitime à garder un jeu équitable.</li>
                    <li>Afficher des publicités Google personnalisées : votre consentement, demandé par le message de Google avant toute pub.</li>
                </ul>
                <p>Nous ne vendons jamais vos données et ne faisons aucun suivi statistique (pas de Google Analytics ni outil équivalent).</p>
            </Section>

            <Section title="Publicité Google AdSense et cookies">
                <p>
                    Sur la page Booster, vous pouvez regarder une vidéo publicitaire pour gagner un booster. Ces publicités sont fournies par Google AdSense,
                    qui peut utiliser des cookies et identifiants pour diffuser et mesurer les annonces, et les personnaliser si vous l'acceptez.
                    Le choix vous est proposé par le message de consentement de Google ; vous pouvez le modifier à tout moment depuis ce message.
                </p>
                <p>
                    En savoir plus : <a className="underline text-white" href="https://policies.google.com/technologies/partner-sites?hl=fr" target="_blank" rel="noreferrer">comment Google utilise les données des sites partenaires</a>.
                    Vous pouvez aussi désactiver la personnalisation des annonces sur <a className="underline text-white" href="https://adssettings.google.com" target="_blank" rel="noreferrer">adssettings.google.com</a>.
                </p>
                <p>
                    NatureDex lui-même ne dépose aucun cookie. Il enregistre seulement dans votre navigateur (stockage local) votre jeton de connexion et quelques préférences
                    (son, localisation du mode terrain, association choisie…), indispensables au fonctionnement du jeu.
                </p>
            </Section>

            <Section title="Services tiers">
                <ul className="list-disc pl-5 space-y-2">
                    <li><b className="text-white">Amazon Web Services</b> (via OpenKBS) : hébergement du site, de la base de données et des photos, dans l'Union européenne.</li>
                    <li><b className="text-white">Stripe</b> : paiements.</li>
                    <li><b className="text-white">Google</b> : identification des espèces sur les photos du mode terrain (Gemini, la photo et la position arrondie lui sont envoyées), publicités AdSense, polices d'écriture (Google Fonts).</li>
                    <li><b className="text-white">OpenStreetMap / Nominatim</b> : nom de la région à partir de la position arrondie ; <b className="text-white">OpenFreeMap</b> : fonds de carte de l'exploration.</li>
                    <li><b className="text-white">Wikipédia / Wikimedia Commons</b> : images et textes des cartes, chargés depuis leurs serveurs.</li>
                </ul>
                <p>Certains de ces services (Google, Stripe) peuvent traiter des données hors de l'Union européenne, avec les garanties prévues par le RGPD (clauses contractuelles types, cadre de protection des données UE–États-Unis).</p>
            </Section>

            <Section title="Combien de temps">
                <ul className="list-disc pl-5 space-y-2">
                    <li>Votre compte et vos données de jeu : tant que le compte existe. Une session de connexion dure 60 jours.</li>
                    <li>Photos du mode terrain : jusqu'à ce que vous les supprimiez ou que votre compte soit supprimé.</li>
                    <li>Historique des achats : 10 ans (obligation comptable), même après suppression du compte.</li>
                </ul>
            </Section>

            <Section title="Vos droits">
                <p>
                    Vous pouvez accéder à vos données, les corriger, les supprimer, en demander une copie, vous opposer à un traitement ou retirer votre consentement.
                    Pour supprimer votre compte et toutes vos données de jeu, ou pour toute autre demande, écrivez à <Mail /> depuis l'adresse de votre choix en indiquant votre pseudo :
                    nous répondons sous un mois.
                </p>
                <p>
                    Vous pouvez aussi déposer une réclamation auprès de la CNIL : <a className="underline text-white" href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">cnil.fr/plaintes</a>.
                </p>
            </Section>

            <Section title="Mineurs">
                <p>
                    NatureDex est ouvert à tous. Les moins de 15 ans doivent avoir l'accord d'un parent pour s'inscrire et pour accepter les publicités personnalisées,
                    et les moins de 18 ans doivent demander l'autorisation d'un parent avant tout achat.
                </p>
            </Section>

            <p className="mt-10 text-sm"><Link to="/" className="underline text-ink-soft hover:text-white">← Retour à l'accueil</Link></p>
        </div>
    );
}
