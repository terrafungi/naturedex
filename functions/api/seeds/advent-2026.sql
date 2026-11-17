-- Calendrier de l'Avent 2026 : 24 cartes événement (source='event'), jamais tirées au hasard.
BEGIN;
WITH d(day, base, name, art, rarity, note) AS (VALUES
 (1, 977,   NULL,               NULL,   NULL, 'Le sapin de Noël historique : c''est lui qu''on décorait déjà en Alsace au XVIe siècle.'),
 (2, 26254, NULL,               NULL,   NULL, 'Ses feuilles piquantes et ses baies rouges ornent couronnes et cartes de vœux depuis l''Antiquité.'),
 (3, 21960, NULL,               'holo', NULL, 'Sous le gui, on s''embrasse : une tradition héritée des druides qui le croyaient sacré.'),
 (4, 1679,  NULL,               NULL,   NULL, 'L''oiseau des cartes de Noël : il chante tout l''hiver et s''approche des jardins enneigés.'),
 (5, 961,   NULL,               NULL,   NULL, 'Mandarines et clémentines : le fruit rare et précieux qu''on glissait dans les souliers.'),
 (6, 1019,  NULL,               'holo', NULL, 'L''épice des pains d''épices, du vin chaud et des biscuits de Noël.'),
 (7, 22102, 'Rose de Noël',     NULL,   NULL, 'L''hellébore noir fleurit en plein hiver, parfois sous la neige, autour de Noël.'),
 (8, 26496, 'Étoile de Noël',   'holo', NULL, 'Le poinsettia, venu du Mexique : ses bractées rouges en étoile annoncent les fêtes.'),
 (9, 960,   NULL,               NULL,   NULL, 'Sans lui, ni chocolat chaud, ni bûche, ni papillotes.'),
 (10, 39501,'Lagopède alpin',   NULL,   NULL, 'Il devient blanc comme neige en hiver pour disparaître dans les montagnes.'),
 (11, 1715, NULL,               'holo', NULL, 'Sa poitrine rouge vif illumine les haies givrées de décembre.'),
 (12, 1060, NULL,               'full', NULL, 'Le sapin de Noël le plus vendu : ses aiguilles ne tombent presque pas.'),
 (13, 27153,NULL,               NULL,   NULL, 'Le clou de girofle piqué dans l''orange : le parfum des maisons à Noël.'),
 (14, 1441, NULL,               NULL,   NULL, 'Il a caché ses noisettes à l''automne et les retrouve sous la neige.'),
 (15, 987,  'Châtaignier',      'holo', NULL, 'Chaud les marrons ! Les châtaignes grillées des marchés de Noël.'),
 (16, 1443, 'Hermine',          NULL,   NULL, 'Son pelage d''hiver d''un blanc pur bordait les manteaux des rois.'),
 (17, 1456, NULL,               'holo', NULL, 'La monture des Rois mages, venus d''Orient à travers le désert.'),
 (18, 21512,NULL,               NULL,   NULL, 'L''encens, l''un des trois présents offerts par les Rois mages.'),
 (19, 25536,NULL,               'holo', NULL, 'La myrrhe, deuxième présent des Rois mages, une résine précieuse.'),
 (20, 139235,NULL,              'full', NULL, 'L''or, le troisième présent des Rois mages.'),
 (21, 1453, NULL,               'holo', NULL, 'Le renard du Grand Nord, voisin de l''atelier du père Noël.'),
 (22, 1743, NULL,               'full', NULL, 'La chouette blanche de l''Arctique veille sur les nuits polaires.'),
 (23, 1433, 'Renne',            'full', 'legendary', 'Le renne tire le traîneau du père Noël à travers le ciel de la nuit de Noël.')
)
INSERT INTO cards (qid, name, sci_name, type, rarity, views, image_url, thumb_url, extract, wiki_url, iucn, stats, num, gbif_key, source, art, base_id)
SELECT 'avent-2026-' || lpad(d.day::text, 2, '0'), coalesce(d.name, b.name), b.sci_name, b.type, coalesce(d.rarity, b.rarity), b.views,
       b.image_url, b.thumb_url, b.extract, b.wiki_url, b.iucn,
       (b.stats - 'zoom' - 'rotate') || jsonb_build_object('event', 'avent-2026', 'day', d.day, 'note', d.note),
       156591 + d.day, b.gbif_key, 'event', d.art, b.id
FROM d JOIN cards b ON b.id = d.base
ON CONFLICT (qid) DO NOTHING;

INSERT INTO cards (qid, name, sci_name, type, rarity, views, image_url, thumb_url, extract, wiki_url, stats, num, source, art)
VALUES
 ('avent-2026-24', 'Père Noël', 'Pater natalis', 'mammal', 'legendary', 0,
  'https://naturedex.fr/media/cards/avent-2026/pere-noel-normal.jpg', 'https://naturedex.fr/media/cards/avent-2026/pere-noel-normal-500.jpg',
  'Le père Noël vit au Grand Nord, entouré de ses rennes et des animaux de la forêt. La nuit du 24 décembre, il parcourt le monde en traîneau pour déposer les cadeaux au pied des sapins.',
  'https://fr.wikipedia.org/wiki/P%C3%A8re_No%C3%ABl',
  '{"hp":240,"atk":120,"def":150,"spd":110,"biome":"montagne","focus":[50,40],"event":"avent-2026","day":24,"note":"Le 24 décembre, il est en route : joyeux Noël !"}', 156615, 'event', NULL),
 ('avent-2026-24-secret', 'Père Noël', 'Pater natalis', 'mammal', 'secret', 0,
  'https://naturedex.fr/media/cards/avent-2026/pere-noel-secret.jpg', 'https://naturedex.fr/media/cards/avent-2026/pere-noel-secret-500.jpg',
  'Le père Noël vit au Grand Nord, entouré de ses rennes et des animaux de la forêt. La nuit du 24 décembre, il parcourt le monde en traîneau pour déposer les cadeaux au pied des sapins.',
  'https://fr.wikipedia.org/wiki/P%C3%A8re_No%C3%ABl',
  '{"hp":260,"atk":135,"def":160,"spd":125,"biome":"montagne","focus":[50,40],"event":"avent-2026","day":24,"secret":true,"note":"La version secrète : le traîneau sous les aurores boréales. Une chance sur dix !"}', 156616, 'event', 'full')
ON CONFLICT (qid) DO NOTHING;
COMMIT;
