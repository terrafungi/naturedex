/**
 * The most famous Parcs & jardins cards (type 'place', import-places.mjs) double as Stades in the Duel.
 * Unlike the other Naturalistes there is no separate 'tcg:<key>' card: the place card itself is the
 * Stade (naturalists.mjs tags it with stats.trainer = key), so owning Yellowstone lets it into a deck.
 * Each one also has a Full art copy ('tcg:<key>:full', one rarity up), which counts as the same Stade.
 * rarity = the rarity of the place card; the effect grows with it (texts in tcg.mjs stadiumText):
 * epic +20 dégâts and −10 subis, legendary +30 / −10, secret +30 / −20 for the creatures of `boost`.
 */
const P = (qid, name, rarity, boost, img) => ({
    kind: 'stadium', park: true, qid, name, rarity, boost, img: `https://upload.wikimedia.org/wikipedia/commons/thumb/${img}`,
    n: rarity === 'epic' ? 20 : 30, guard: rarity === 'secret' ? 20 : 10,
});

export const PARKS = {
    // Secrètes
    marquises: P('Q172697', 'Îles Marquises', 'secret', ['ocean', 'ciel'], '9/95/HivaOa_BaieDesTraitres_20061110.jpg/500px-HivaOa_BaieDesTraitres_20061110.jpg'),
    baikal: P('Q5513', 'Lac Baïkal', 'secret', ['humide', 'montagne'], '0/00/Olkhon_Island_and_Lake_Baikal.jpg/500px-Olkhon_Island_and_Lake_Baikal.jpg'),
    yellowstone: P('Q351', 'Parc national de Yellowstone', 'secret', ['foret', 'prairie'], '8/89/Grand_Prismatic_Spring_2013.jpg/500px-Grand_Prismatic_Spring_2013.jpg'),
    // Légendaires
    galapagos: P('Q38095', 'Îles Galápagos', 'legendary', ['ocean', 'desert'], 'c/ce/Gal%C3%A1pagos_Islands_ESA23188644.jpeg/500px-Gal%C3%A1pagos_Islands_ESA23188644.jpeg'),
    victoria: P('Q43278', 'Chutes Victoria', 'legendary', ['humide', 'ciel'], '2/2d/Cataratas_Victoria%2C_Zambia-Zimbabue%2C_2018-07-27%2C_DD_05.jpg/500px-Cataratas_Victoria%2C_Zambia-Zimbabue%2C_2018-07-27%2C_DD_05.jpg'),
    olympe: P('Q80344', 'Mont Olympe', 'legendary', ['montagne', 'ciel'], 'c/c0/Mt_Olympus_aerial_2.jpg/500px-Mt_Olympus_aerial_2.jpg'),
    yosemite: P('Q180402', 'Parc national de Yosemite', 'legendary', ['montagne', 'foret'], 'e/ea/Half_Dome_with_Eastern_Yosemite_Valley_(50MP).jpg/500px-Half_Dome_with_Eastern_Yosemite_Valley_(50MP).jpg'),
    chaussee: P('Q106187', 'Chaussée des Géants', 'legendary', ['ocean', 'montagne'], "0/0a/Giant's_Causeway_(36834542085).jpg/500px-Giant's_Causeway_(36834542085).jpg"),
    tuileries: P('Q818517', 'Jardin des Tuileries', 'legendary', ['prairie', 'ciel'], 'f/fc/Grande_Roue_de_Paris_-_Louvre_et_Jardins_des_Tuileries.jpg/500px-Grande_Roue_de_Paris_-_Louvre_et_Jardins_des_Tuileries.jpg'),
    jardinplantes: P('Q730948', 'Jardin des plantes de Paris', 'legendary', ['prairie', 'foret'], "4/48/Paris_75005_Grande_Galerie_de_l'Evolution_20070804.jpg/500px-Paris_75005_Grande_Galerie_de_l'Evolution_20070804.jpg"),
    along: P('Q190128', "Baie d'Along", 'legendary', ['ocean', 'montagne'], 'e/e4/Halong_ensemble_(colour_corrected).jpg/500px-Halong_ensemble_(colour_corrected).jpg'),
    barriere: P('Q7343', 'Grande Barrière de corail', 'legendary', ['ocean'], '1/1b/GreatBarrierReef-EO.JPG/500px-GreatBarrierReef-EO.JPG'),
    bialowieza: P('Q192666', 'Forêt de Białowieża', 'legendary', ['foret', 'prairie'], '9/98/Wisent.jpg/500px-Wisent.jpg'),
    pantanal: P('Q157603', 'Pantanal', 'legendary', ['humide', 'prairie'], '6/6e/Pantanal%2C_south-central_South_America_5170.jpg/500px-Pantanal%2C_south-central_South_America_5170.jpg'),
    lencois: P('Q647777', 'Parc national des Lençóis Maranhenses', 'legendary', ['desert', 'humide'], 'a/a7/Len%C3%A7%C3%B3is_Maranhenses_2018.jpg/500px-Len%C3%A7%C3%B3is_Maranhenses_2018.jpg'),
    kruger: P('Q24451', 'Parc national Kruger', 'legendary', ['prairie', 'foret'], '1/16/Rhino%2C_Kruger_National_Park_(7826798766).jpg/500px-Rhino%2C_Kruger_National_Park_(7826798766).jpg'),
    serengeti: P('Q11812902', 'Parc national du Serengeti', 'legendary', ['prairie', 'desert'], '0/0b/Serengeti-Landscape-2012.JPG/500px-Serengeti-Landscape-2012.JPG'),
    tassili: P('Q190048', "Tassili n'Ajjer", 'legendary', ['desert', 'montagne'], 'f/fd/Tassili_Desert_Algeria.jpg/500px-Tassili_Desert_Algeria.jpg'),
    mercantour: P('Q1535042', 'Parc national du Mercantour', 'legendary', ['montagne', 'ciel'], '2/2f/Mont_Pelat_%2B_Lake_Allos_tour_19.jpg/500px-Mont_Pelat_%2B_Lake_Allos_tour_19.jpg'),
    // Épiques
    okavango: P('Q650872', "Delta de l'Okavango", 'epic', ['humide', 'prairie'], '6/61/Okavango11.jpg/500px-Okavango11.jpg'),
    bryce: P('Q219562', 'Parc national de Bryce Canyon', 'epic', ['desert', 'montagne'], '4/4d/USA_10654_Bryce_Canyon_Luca_Galuzzi_2007.jpg/500px-USA_10654_Bryce_Canyon_Luca_Galuzzi_2007.jpg'),
    vanoise: P('Q174250', 'Parc national de la Vanoise', 'epic', ['montagne', 'prairie'], '4/4d/Parc_Vanoise_Vue_vall%C3%A9e_Termignon.jpg/500px-Parc_Vanoise_Vue_vall%C3%A9e_Termignon.jpg'),
    cevennes: P('Q1368807', 'Parc national des Cévennes', 'epic', ['foret', 'montagne'], 'b/bf/Cevennes_Florac_Mimente_depuis_Causse_Mejean.jpg/500px-Cevennes_Florac_Mimente_depuis_Causse_Mejean.jpg'),
    sequoia: P('Q152660', 'Parc national de Sequoia', 'epic', ['foret', 'ciel'], '8/8e/Sequoia_National_Park%2C_California_(2011).jpg/500px-Sequoia_National_Park%2C_California_(2011).jpg'),
    everglades: P('Q274131', 'Parc national des Everglades', 'epic', ['humide', 'ocean'], '2/2a/Sunset_over_the_River_of_Grass%2C_NPSphoto%2C_G.Gardner_(9255157507).jpg/500px-Sunset_over_the_River_of_Grass%2C_NPSphoto%2C_G.Gardner_(9255157507).jpg'),
    plitvice: P('Q189849', 'Parc national des lacs de Plitvice', 'epic', ['humide', 'foret'], '9/9d/Plitvice_Lakes_National_Park_(2).jpg/500px-Plitvice_Lakes_National_Park_(2).jpg'),
    kew: P('Q188617', 'Jardins botaniques royaux de Kew', 'epic', ['prairie', 'foret'], 'd/d1/Kew_Gardens_Palm_House%2C_London_-_July_2009.jpg/500px-Kew_Gardens_Palm_House%2C_London_-_July_2009.jpg'),
    ecrins: P('Q476446', 'Parc national des Écrins', 'epic', ['montagne', 'ciel'], "9/97/Villar-d'Ar%C3%AAne_(Rif_de_la_Planche_1975_m.).JPG/500px-Villar-d'Ar%C3%AAne_(Rif_de_la_Planche_1975_m.).JPG"),
    banff: P('Q41858', 'Parc national Banff', 'epic', ['montagne', 'humide'], 'c/c5/Moraine_Lake_17092005.jpg/500px-Moraine_Lake_17092005.jpg'),
    paine: P('Q901646', 'Parc national Torres del Paine', 'epic', ['montagne', 'ciel'], '4/4d/Torres_del_Paine%2C_Laguna_Azul_09.jpg/500px-Torres_del_Paine%2C_Laguna_Azul_09.jpg'),
    versailles: P('Q2340684', 'Parc de Versailles', 'epic', ['prairie', 'humide'], "8/8f/Versailles_view_from_the_Parterre_d'eau.jpg/500px-Versailles_view_from_the_Parterre_d'eau.jpg"),
    grandcanyon: P('Q220289', 'Parc national du Grand Canyon', 'epic', ['desert', 'montagne'], '2/29/10_Grand_Canyon_Navajo_Point_viewpoint_terrace%2C_Grand_Canyon_National_Park%2C_USA_-_American_nature.jpg/500px-10_Grand_Canyon_Navajo_Point_viewpoint_terrace%2C_Grand_Canyon_National_Park%2C_USA_-_American_nature.jpg'),
    valleemort: P('Q242111', 'Parc national de la vallée de la Mort', 'epic', ['desert', 'ciel'], 'b/be/Aguereberry_Point_-_View_South_(3811736781).jpg/500px-Aguereberry_Point_-_View_South_(3811736781).jpg'),
    calanques: P('Q2600427', 'Parc national des Calanques', 'epic', ['ocean', 'ciel'], 'd/d7/En-Vau_calanque_1.jpg/500px-En-Vau_calanque_1.jpg'),
    portcros: P('Q388279', 'Parc national de Port-Cros', 'epic', ['ocean', 'foret'], '0/04/Port-cros-nature_1.jpg/500px-Port-cros-nature_1.jpg'),
    virunga: P('Q223589', 'Parc national des Virunga', 'epic', ['foret', 'montagne'], '0/07/Virunga_01.jpg/500px-Virunga_01.jpg'),
};
