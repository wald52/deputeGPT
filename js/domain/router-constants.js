export const DEFAULT_CHAT_LIST_LIMIT = 12;

export const FOLLOW_UP_MARKERS = [
  'ces votes',
  'ceux-ci',
  'ceux la',
  'ceux-là',
  'les memes',
  'les mêmes',
  'parmi eux',
  'ces derniers',
  'ce resultat',
  'ce résultat',
  'ce vote',
  'ce scrutin',
  'ce texte',
  'ceux affiches',
  'ceux affichés',
  'et',
  'aussi',
  'par contre',
  'a l\'inverse',
  'à l\'inverse'
];

export const SUBJECT_MARKERS = [
  'sujet',
  'sujets',
  'theme',
  'themes',
  'thème',
  'thèmes',
  'sur quoi',
  'de quoi',
  'quel sujet',
  'quels sujets'
];

export const LIST_MARKERS = [
  'liste',
  'montre',
  'affiche',
  'donne',
  'quels votes',
  'quels sont les votes',
  'historique',
  'votes realises',
  'votes réalisés',
  'votes recents',
  'votes récents',
  'derniers votes'
];

export const ANALYSIS_MARKERS = [
  'favorable',
  'oppose',
  'opposé',
  'opposee',
  'opposée',
  'tendance',
  'position',
  'ligne',
  'analyse',
  'resume',
  'résume',
  'resumer',
  'résumer',
  'synthese',
  'synthèse',
  'que montrent',
  'globalement',
  'plutot',
  'plutôt',
  'est-elle pour',
  'est il pour',
  'est-il pour',
  'est elle pour'
];

export const THEME_KEYWORDS = {
  ecologie: ['ecologie', 'écologie', 'environnement', 'climat', 'carbone', 'biodiversite', 'biodiversité', 'transition energetique', 'transition énergétique', 'pollution de l air', 'qualite de l air', 'qualité de l air', 'nuisances locales', 'pfas', 'emissions de co2', 'émissions de co2'],
  energie: ['energie', 'énergie', 'nucleaire', 'nucléaire', 'electricite', 'électricité', 'renouvelable', 'renouvelables', 'charbon', 'gaz', 'facture d electricite', 'facture d électricité', 'prix du gaz', 'prix de l energie', 'prix de l énergie', 'carburant', 'carburants', 'essence', 'chauffage', 'superethanol', 'superethanol e85', 'e85', 'b100', 'biocarburant', 'biocarburants'],
  immigration: ['immigration', 'asile', 'etrangers', 'étrangers', 'titres de sejour', 'titres de séjour', 'frontieres', 'frontières', 'migrants', 'ame', 'aide medicale d etat', 'aide médicale d état', 'politique migratoire', 'cra', 'retention', 'rétention', 'sans papiers', 'regularisation', 'régularisation', 'decheance de nationalite', 'déchéance de nationalité'],
  retraites: ['retraite', 'retraites', 'pension', 'pensions', 'reforme des retraites', 'réforme des retraites', 'carrieres longues', 'carrières longues', 'metiers penibles', 'métiers pénibles', 'age legal', 'âge légal'],
  logement: ['logement', 'logements', 'loyer', 'loyers', 'locatif', 'sans-abrisme', 'sans abrisme', 'hebergement d urgence', 'hébergement d urgence', 'construction', 'batiment', 'bâtiment', 'renovation energetique', 'rénovation énergétique', 'maprimerenov', 'ma prime renov', 'marchands de sommeil'],
  'fin de vie': ['fin de vie', 'aide a mourir', 'aide à mourir', 'soins palliatifs', 'suicide assiste', 'suicide assisté', 'euthanasie'],
  sante: ['sante', 'santé', 'hopital', 'hôpital', 'medecin', 'médecin', 'securite sociale', 'sécurité sociale', 'hopitaux', 'hôpitaux', 'ald', 'arret maladie', 'arrêt maladie', 'deserts medicaux', 'déserts médicaux', 'cannabis therapeutique', 'cannabis thérapeutique', 'protections periodiques', 'protections périodiques'],
  agriculture: ['agriculture', 'agricole', 'agricoles', 'foncier agricole', 'paysans', 'acetamipride', 'acétamipride', 'loi duplomb', 'duplomb'],
  budget: ['budget', 'finances', 'fiscal', 'impot', 'impôts', 'taxe', 'taxes', 'plf', 'plfss', 'csg', 'revenus du capital', 'budget de l etat', 'budget de l état', 'budget de l\'etat', 'pouvoir d achat', 'pouvoir d’achat', 'inflation', 'menages modestes', 'ménages modestes', 'menages les plus modestes', 'ménages les plus modestes', 'classes moyennes'],
  pouvoir_achat: ['pouvoir d achat', 'pouvoir d’achat', 'inflation', 'facture', 'factures', 'prix', 'cout de la vie', 'coût de la vie', 'carburant', 'carburants', 'essence', 'chauffage', 'gaz', 'electricite', 'électricité', 'menages modestes', 'ménages modestes', 'menages les plus modestes', 'ménages les plus modestes', 'classes moyennes', 'smic', 'rsa', 'bouclier tarifaire'],
  securite: ['securite', 'sécurité', 'narcotrafic', 'police', 'transport', 'transports', 'sûreté', 'surete', 'messageries chiffrees', 'messageries chiffrées', 'antiterroriste', 'violences intrafamiliales'],
  education: ['education', 'éducation', 'ecole', 'école', 'universite', 'université', 'eleve', 'élève', 'harcelement scolaire', 'harcèlement scolaire', 'jeunesse', 'jeunes', 'etudiants', 'étudiants', 'apprentis', 'mineurs', 'decrochage scolaire', 'décrochage scolaire', 'bourses etudiantes', 'bourses étudiantes'],
  defense: ['defense', 'défense', 'armee', 'armée', 'armees', 'armées', 'militaire', 'militaires', 'forces armees', 'forces armées', 'ukraine', 'avoirs russes', 'russes geles', 'russes gelés', 'autonomie strategique', 'autonomie stratégique'],
  justice: ['justice', 'penal', 'pénal', 'penale', 'pénale', 'prison', 'prisons', 'magistrat', 'magistrats', 'tribunal', 'tribunaux', 'peines planchers', 'lanceurs d alerte', 'lanceurs d’alerte', 'protection de l enfance'],
  culture: ['culture', 'cultures', 'patrimoine', 'musee', 'musée', 'musees', 'musées', 'audiovisuel', 'creation', 'création'],
  numerique: ['numerique', 'numérique', 'intelligence artificielle', 'donnees', 'données', 'algorithme', 'algorithmes', 'cyberespace', 'plateforme', 'plateformes', 'souverainete numerique', 'souveraineté numérique', 'reseaux sociaux', 'réseaux sociaux', 'messageries chiffrees', 'messageries chiffrées'],
  emploi: ['emploi', 'emplois', 'chomage', 'chômage', 'travail', 'salariat', 'salarie', 'salarié', 'salaries', 'salariés'],
  europe: ['europe', 'union europeenne', 'union européenne', 'bruxelles', 'commission europeenne', 'commission européenne', 'parlement europeen', 'parlement européen', 'europeen', 'européen', 'europeenne', 'européenne'],
  'outre-mer': ['outre-mer', 'outre mer', 'dom-tom', 'dom tom', 'guadeloupe', 'martinique', 'guyane', 'la reunion', 'la réunion', 'mayotte', 'polynesie', 'polynésie', 'nouvelle-caledonie', 'nouvelle-calédonie'],
  handicap: ['handicap', 'handicaps', 'handicape', 'handicapé', 'handicapes', 'handicapés', 'handicapee', 'handicapée', 'handicapees', 'handicapées', 'accessibilite', 'accessibilité', 'inclusion'],
  egalite: ['egalite', 'égalité', 'discrimination', 'discriminations', 'racisme', 'sexisme', 'egalite femmes hommes', 'égalité femmes hommes', 'lgbt', 'lgbtq'],
  societe: ['famille', 'familles', 'politique familiale', 'natalite', 'natalité', 'bioethique', 'bioéthique', 'ivg', 'contraception', 'droits reproductifs', 'corrida'],
  institutions: ['assemblee', 'assemblée', 'democratie', 'démocratie', 'proportionnelle', 'referendum', 'référendum', 'vote assis et leve', 'vote assis et levé', 'hémicycle', 'hemicycle', 'vote obligatoire', 'participation citoyenne', 'decentralisation', 'pantouflage', 'parite', 'parité'],
  economie: ['commerce', 'commercial', 'commerciale', 'economie', 'économie', 'economique', 'économique', 'entreprise', 'entreprises', 'pme', 'industrie', 'croissance', 'consommation', 'reindustrialisation', 'intéressement', 'interessement', 'partage de la valeur'],
  mobilite: ['mobilite', 'mobilité', 'zfe', 'zones a faibles emissions', 'zones à faibles émissions', 'circulation', 'ferroviaire', 'automobile', 'route']
};

export const THEME_CATEGORY_ALIASES = {
  ecologie: ['environnement'],
  energie: ['environnement'],
  immigration: ['immigration'],
  retraites: [],
  logement: ['logement'],
  sante: ['sante'],
  agriculture: ['agriculture'],
  budget: ['fiscal'],
  pouvoir_achat: ['fiscal', 'travail'],
  securite: ['securite'],
  education: ['education'],
  societe: [],
  institutions: [],
  mobilite: ['transport']
};

export const ANALYSIS_STOPWORDS = new Set([
  'ainsi', 'alors', 'apres', 'avant', 'avec', 'cette', 'celui', 'celle', 'celles', 'ceux',
  'comment', 'contre', 'dans', 'depuis', 'depute', 'deputee', 'deputes', 'elles', 'entre',
  'est', 'estce', 'etre', 'globalement', 'leurs', 'mais', 'meme', 'moins', 'montre', 'montrent',
  'notre', 'nous', 'pour', 'pourquoi', 'quand', 'que', 'quel', 'quelle', 'quelles', 'quels',
  'question', 'sont', 'sur', 'tendance', 'toutes', 'tous', 'tres', 'une', 'vous', 'vote', 'votes'
]);

export const TARGET_QUERY_STOPWORDS = new Set([
  'article', 'articles', 'amendement', 'amendements', 'declaration', 'declarations',
  'motion', 'motions', 'projet', 'projets', 'proposition', 'propositions', 'resolution',
  'resolutions', 'loi', 'lois', 'traite', 'traites', 'texte', 'textes', 'lecture', 'lectures', 'premiere',
  'deuxieme', 'nouvelle', 'definitive', 'gouvernement', 'depute', 'deputee', 'deputes', 'pour',
  'ensemble', 'unique', 'appelant', 'portant', 'visant', 'relative', 'relatif', 'relatifs',
  'relatives', 'suivant', 'suivants'
]);

export const TARGET_QUERY_DISTINCTIVE_STOPWORDS = new Set([
  ...TARGET_QUERY_STOPWORDS,
  'application', 'constitution', 'commission', 'mixte', 'paritaire', 'examen', 'prioritaire'
]);
