# AGENTS.md

## Lecture ultra-courte pour Codex

### Objectif de ce fichier
- Ce fichier est la source de verite unique du projet.
- Il doit aider Codex a ouvrir seulement les fichiers utiles, dans le bon ordre, avec un budget de contexte limite.
- Garder le cap produit: reponses factuelles d'abord, LLM seulement pour la synthese sur petit contexte.

### Regle de travail la plus importante
- Ne pas explorer le depot largement par defaut.
- Commencer petit, confirmer l'hypothese, puis elargir seulement si necessaire.

### Budget de contexte par defaut
- Phase 1:
  - lire cette section `Lecture ultra-courte pour Codex`
  - lire les fichiers explicitement cites par l'utilisateur
  - faire une recherche ciblee par nom de symbole, erreur, ou feature
  - ouvrir au maximum 3 fichiers
- Phase 2:
  - si la solution reste floue, ouvrir au maximum 3 fichiers supplementaires
  - privilegier les modules specialises plutot que les gros points d'entree
- Phase 3:
  - n'elargir davantage que si un blocage concret l'exige
  - dire brievement pourquoi le scope s'elargit

### Ordre d'exploration
1. Lire cette section puis la section `Routage rapide par tache`.
2. Si l'utilisateur cite un fichier, commencer par lui.
3. Sinon, choisir l'entree la plus probable dans la matrice `tache -> fichiers`.
4. Faire une recherche ciblee avant d'ouvrir un gros fichier.
5. Ouvrir de preference les modules petits et specialises.
6. N'ouvrir `index.html` ou `js/app-runtime.js` qu'en dernier recours si un module plus precis ne suffit pas.

### Quand s'arreter d'explorer
- Des qu'une hypothese testable ou un plan d'edition credible existe.
- Des qu'un petit ensemble de fichiers responsables est identifie.
- Des qu'une correction locale semble possible sans lire le reste du depot.

### Quand elargir le scope
- L'appel de fonction ou le flux traverse plusieurs couches clairement distinctes.
- La source du bug est probablement dans l'orchestration plutot que dans le module cible.
- Le changement touche un contrat de donnees, une API interne, ou une cle de configuration partagee.
- Une verification simple montre que l'hypothese initiale est fausse.

### Zones couteuses a eviter par defaut
- Ne pas lire en entier:
  - `public/data/votes/**`
  - `public/data/deputes_photos/**`
  - `public/data/deputes_actifs/v*.json`
  - `public/data/search_index.json`
  - `public/data/rag/**` sauf manifeste ou besoin explicite
  - `public/data/dossiers/fiches/**` sauf un echantillon cible
  - `js/transformers.min.js`
  - `test-results/**`
  - `tmp/**`
  - `Scrutins/**` sauf tache pipeline donnees
  - `DossiersLegislatifs/**` sauf tache pipeline donnees
- Pour les donnees, preferer:
  - le schema implicite dans les repositories
  - les manifests
  - un petit echantillon cible

### Heuristiques d'exploration
- Chercher un symbole ou un mot-cle avant de lire un fichier complet.
- Preferer un fichier de domaine ou de UI specialise a un fichier d'orchestration general.
- Si plusieurs fichiers semblent plausibles, commencer par le plus petit et le plus proche du comportement demande.
- Ne pas rouvrir un fichier deja lu sauf besoin reel.
- Ne pas scanner tous les tests. Lire seulement les tests lies a la feature ou au bug.
- Si la demande est purement conceptuelle, repondre d'abord avec le contexte deja disponible avant de lire du code supplementaire.

### Format de travail attendu
- Toujours repondre en francais.
- Donner d'abord la reponse factuelle ou le diagnostic court.
- N'ajouter du contexte technique detaille que s'il sert directement la solution.
- Si l'information manque, le dire clairement.

## Routage rapide par tache

### Produit et boot general
- Boot app / wiring general:
  - `js/core/app-bootstrap.js`
  - `js/app.js`
  - `js/app-runtime.js` en dernier recours
- Layout global / script inline / structure HTML:
  - `index.html`

### Chat, modeles et inference
- Chargement modele / consentement / options:
  - `js/ai/model-loader.js`
  - `js/ai/model-selection.js`
  - `js/ai/model-ui-facade.js`
  - `js/ui/chat/consent-modal.js`
- Runtime local stable Qwen3:
  - `js/ai/qwen3-runtime.js`
- Runtime distant `online` via Worker Cloudflare:
  - `js/ai/online-runtime.js`
- Nettoyage de sortie / suppression `<think>`:
  - `js/ai/answer-sanitizer.js`
- Catalogue modeles:
  - `public/data/model-catalog.json`
  - `js/data/model-catalog-repository.js`
  - `js/ai/fallback-model-catalog.js`

### Routage des questions et reponses deterministes
- Routeur principal:
  - `js/domain/router.js`
  - `js/domain/router-primitives.js`
  - `js/domain/router-constants.js`
- Classification / detection d'intention:
  - `js/domain/intent-classifier.js`
  - `js/domain/intent-detectors.js`
- Scope et references de suivi (`ces votes`, `ceux-ci`, `les derniers`):
  - `js/domain/scope-resolver.js`
  - `js/domain/clarification-resolution.js`
- Reponses deterministes:
  - `js/domain/deterministic-router.js`
  - `js/domain/deterministic-responses.js`
- Construction du contexte analytique:
  - `js/domain/analysis-context.js`
  - `js/domain/analysis-ranking.js`

### Donnees et repositories
- Votes:
  - `js/data/votes-repository.js`
- Deputes:
  - `js/data/deputes-repository.js`
- Groupes:
  - `js/data/groupes-repository.js`
- Index lexical:
  - `js/data/search-index-repository.js`
- Dossiers legislatifs et fiches de lois:
  - `js/data/dossiers-repository.js`

### UI specialisee
- Controleur principal du chat:
  - `js/ui/chat/chat-controller.js`
- Composer / envoi:
  - `js/ui/chat/chat-composer.js`
- Rendu chat:
  - `js/ui/chat/chat-renderer.js`
- Pagination / affichage progressif:
  - `js/ui/chat/chat-pagination-controller.js`
- Gestion du scope affiche:
  - `js/ui/chat/chat-scope-controller.js`
- Panneaux annexes:
  - `js/ui/search-panel.js`
  - `js/ui/depute-panel.js`
  - `js/ui/hemicycle-panel.js`

### Etat, stockage et historique
- Etat global:
  - `js/core/state.js`
- Stockage local:
  - `js/core/storage.js`
- Historique de chat:
  - `js/core/chat-history-persistence.js`
  - `js/core/chat-history-provider.js`
  - `js/chat-history.js`

### RAG et recherche semantique
- Runtime semantique local:
  - `js/ai/semantic-rag-runtime.js`
- Manifest public:
  - `public/data/rag/manifest.json`
- Pipeline generation artefacts:
  - `scripts/generate_semantic_index.py`
- Ne lire les artefacts JSON volumineux que si la tache concerne explicitement leur contenu.

### Pipeline donnees et maintenance
- Traitement principal des votes:
  - `scripts/process_votes.py`
- Regeneration semantique:
  - `scripts/generate_semantic_index.py`
- Chainage scrutins -> dossiers legislatifs:
  - `scripts/link_dossiers.py`
- Fiches d'analyse des lois (LLM en CI):
  - `scripts/generate_dossier_fiches.py`
  - `.github/workflows/dossier_analysis.yml`
- Regressions routeur:
  - `scripts/run_router_regression.js`
- Audit question bank:
  - `scripts/audit_question_bank.js`

## Resume produit

### Objectif produit
- DeputeGPT est une application web statique pour interroger les votes des deputes francais.
- Cas d'usage central:
  - selectionner un depute
  - explorer ses votes
  - poser des questions factuelles ou analytiques sur ces votes
- Cible d'hebergement:
  - GitHub Pages gratuit
  - GitHub Actions pour la preparation nocturne des donnees

### Regle produit cardinale
- Ne pas tout envoyer au LLM.
- Les questions exactes, tabulaires ou filtrables doivent etre traitees de maniere deterministe.
- Le LLM ne sert qu'a la synthese finale sur un petit contexte deja filtre.

## Decisions d'architecture retenues

### Inference et backends
- Abandon total de MLC et WebLLM.
  - Pourquoi: leur seul avantage (debit de decodage brut, kernels TVM pre-compiles) ne sert pas notre usage, ou le LLM ne fait que la synthese finale sur un petit contexte deja filtre. Ce qui compte ici, c'est le TTFT et le poids de telechargement, pas le throughput, et MLC n'y gagne rien (poids quantifies comparables, WebGPU mobile aussi limite).
  - Couts de MLC pour un site statique sans backend: format proprietaire a recompiler par couple (modele, quantization) avec la toolchain `mlc_llm`/TVM au lieu de pointer un repo HF ONNX; second moteur WebGPU a maintenir en plus de celui des embeddings RAG; perte de l'integration Hugging Face (`AutoTokenizer`, `apply_chat_template`, modeles ONNX publies tot par `onnx-community`).
  - Conclusion: reprendre WebLLM serait un retour en arriere.
- Runtime IA navigateur: `transformers.js` (canal stable, derniere version publiee) + WebGPU.
- Chat stable: famille `Qwen3` ONNX. C'est la seule voie d'inference locale (la voie experimentale `Qwen3.5` a ete retiree).
- Service distant autorise: source `online` via Worker Cloudflare + AI Gateway, par defaut pour les demandes d'analyse.
- Les questions exactes doivent rester deterministes dans le navigateur, meme quand `online` est la source IA par defaut.
- Le service `online` ne doit jamais prendre la main sur les listes, comptages, periodes ou filtres exacts.
- Aucune cle API utilisateur n est requise pour le service `online` par defaut.
- Seules les demandes d'analyse peuvent envoyer un contexte court hors du navigateur.
- Le Worker supporte le streaming SSE (`body.stream: true` sur `/analysis`):
  il pipe le flux de l'AI Gateway avec les metadonnees en en-tetes
  `x-deputegpt-*`. Le front (`js/ai/online-runtime.js`) streame via
  `options.onToken` et le chat affiche la reponse au fil des tokens
  (sanitisation `answer-sanitizer` en fin de flux). Le chemin non-streame
  reste inchange (retrocompatible).
- Latence percue: prechauffage des index (lexical + dossiers) des la selection
  d'un depute; contexte d'analyse reduit a 12 votes pour les analyses ciblees
  (theme ou texte precis), 18 sinon.

### Chargement modele et UX
- Aucun telechargement de modele ne doit etre silencieux.
- Consentement explicite obligatoire.
- Taille du modele visible.
- Dernier choix memorise localement.
- La source IA par defaut pour les analyses est `online`.
- Le modele local reste disponible uniquement sur activation explicite utilisateur.
- Le mode par defaut est non-thinking:
  - `enable_thinking: false`
  - sortie finale uniquement
  - francais uniquement
- Le mode thinking est reserve au mode avance via opt-in explicite.
- Meme en mode thinking, l'UI ne doit jamais afficher le raisonnement interne (`<think>`).

## Strategie modeles retenue

### Source de verite
- Source de verite UI: `public/data/model-catalog.json`.
- Les quantifications doivent etre separees explicitement dans le catalogue.

### Etat actuel
- Stable:
  - `Qwen3 0.6B`
  - `Qwen3 1.7B`
  - `Qwen3 4B`

### Contrats techniques
- `Qwen3` stable utilise `AutoTokenizer + Qwen3ForCausalLM`.
- Ne pas promettre une quantification qui n'a pas ete testee dans l'application.
- Si `Qwen3 0.6B` reste insuffisant apres essais, monter le defaut vers `Qwen3 1.7B q4f16`.

## Strategie RAG retenue

### Principes
- RAG par defaut cote navigateur: lexical/structure, sans embedding local obligatoire en v1.
- RAG semantique local: opt-in explicite en mode avance, jamais active par defaut.
- Le mode semantique propose:
  - `single-vector` par defaut
  - `multi-vector` experimental en mode avance
- Chemin avance retenu:
  - top lexical cote navigateur
  - reranking semantique local sur un sous-ensemble court

### Artefacts et indexation
- Le navigateur exploite des artefacts prepares cote serveur.
- Le serveur prepare ses artefacts la nuit via GitHub Actions.
- Le serveur publie:
  - un manifeste RAG public
  - un index lexical public
  - un index semantique `single-vector`
  - un index semantique `multi-vector` experimental
- Le navigateur ne calcule localement que l'embedding de requete quand le mode semantique est actif.
- L'indexation se fait au niveau du scrutin unique, pas du couple depute-vote.
- Le chat ne doit jamais utiliser un modele generatif comme modele d'embedding.
- L'embedding local experimental doit rester sur un modele dedie, distinct du chat.

### Extensibilite schema
- Le schema doit rester extensible pour accueillir plus tard:
  - `scrutin`
  - `texte_loi`
  - `amendement`
  - `article`

### Dossiers legislatifs et fiches de lois (implemente)
- Chainage scrutin -> dossier legislatif publie dans
  `public/data/dossiers/index.json` (genere par `scripts/link_dossiers.py`:
  champ direct si present, sinon rapprochement de titres avec `method` et
  `confidence`; overrides manuels dans `public/data/dossiers/overrides.json`).
- Fiches d'analyse « second ordre » par dossier dans
  `public/data/dossiers/fiches/{dossierId}.json` + index leger
  `public/data/dossiers/fiches_index.json` (generes par
  `scripts/generate_dossier_fiches.py` via un endpoint OpenAI-compatible,
  par defaut NVIDIA NIM; secret GitHub `NVIDIA_NIM_API_KEY`, jamais de cle
  dans le depot; workflow dedie `.github/workflows/dossier_analysis.yml`,
  cron 02h30, avant le Global Update).
- Chaque fiche contient: objectif affiche, mecanismes concrets sources
  (article/citation), `verdictIncitations` avec enum stricte
  `incitations_alignees | incitations_mitigees | incitations_opposees | indetermine`,
  justification sourcee, points de vigilance, sources officielles, hash du
  texte source et metadonnees modele.
- Regle editoriale: tout contenu de fiche affiche a l'utilisateur doit porter
  le disclaimer « analyse generee automatiquement par IA » et des liens vers
  les sources officielles. En cas de doute, le verdict est `indetermine`.
- Les textes de loi complets ne sont jamais commites: seuls les extraits
  analysés transitent par la CI, les fiches restent de petits JSON.
- L'index lexical RAG porte `law_title` et `dossier_id` par scrutin
  (superposition idempotente dans `generate_semantic_index.py`, degradation
  gracieuse si l'index dossiers est absent). MiniSearch indexe `law_title`
  (boost 2.5) et stocke `dossier_id`.
- Le contexte d'analyse LLM inclut jusqu'a 2 fiches de loi dominantes
  (section `FICHES DE LOI` du prompt, `ANALYSIS_CONTEXT_FICHE_LIMIT`) avec une
  garde de budget a 22 000 caracteres pour rester sous la limite du Worker
  (24 000, question comprise). Les fiches sont retirees avant les votes en cas
  de depassement.
- Generation incrementale: une fiche a jour (`analysisVersion` + `statut`
  inchanges) n'est pas regeneree; debit limite pour les quotas gratuits
  (`--rpm`, `--max-calls`, `--time-budget-min`), backfill via
  `workflow_dispatch` avec `max_calls`.

## Routeur de questions retenu

### Execution
- Etape 1: resoudre le scope
  - tout l'historique du depute actif
  - dernier ensemble affiche
  - sous-ensemble filtre
- Etape 2: construire un plan d'execution normalise
  - `questionType`
  - `candidateStrategy`
  - `requiresLlm`
  - `responseMode`
  - `unsupportedReason`
- Etape 3: deduire l'action externe
  - `deterministic`
  - `analysis_rag`
  - `clarify`

### Classification d'intention a score
- `classifyIntent` n'est plus un premier-motif-gagnant: chaque detecteur produit un
  candidat `{kind, score, signal}`, des ajustements contextuels departagent, et
  `intent.confidence` reflete la marge reelle entre les deux meilleurs candidats.
- Les scores de base reproduisent l'ordre historique de priorite des detecteurs;
  ne changer un score qu'avec la banque de questions au vert.
- Un intensificateur (`vraiment`, `reellement`, `en realite`, `au fond`,
  `incitations`...) penalise `subjects` et pousse vers `analysis` des qu'un ancrage
  concret existe (theme, texte cible, suivi).
- Sur un suivi elliptique (`et sur l'immigration ?`, `et en 2024 ?`), le routeur
  herite du `questionType` du dernier plan (`session.lastPlan`) via
  `scope.inheritedQuestionType`, seulement si la question n'apporte qu'un nouveau
  filtre et ne porte aucun signal explicite.
- Une question composite (texte cible + theme hors du texte) conserve les deux
  filtres: le texte domine, le theme ne restreint que si l'intersection est non vide.
- Les questions d'impact (`renforce`, `affaiblit`, `ameliore`...) avec un theme
  detectable declenchent une clarification de mode (`needs_mode`), plus jamais un
  simple `unsupported`; sans theme, elles restent `unsupported`.
- `cette loi` est un marqueur de suivi: sans contexte, la question part en
  `needs_context`.
- Intention `law_critique` (critique d'un texte precis: titre trompeur,
  incitations, "vraiment bonne pour..."): exige un `queryText` explicite,
  action `deterministic` avec `candidateStrategy: law_critique_lookup`.
  Le handler resout le dossier via `js/data/dossiers-repository.js`, charge la
  fiche, affiche verdict + justification + mecanismes + disclaimer + sources,
  et liste les votes du depute sur le texte. Sans fiche: votes + message clair.
  Sans dossier ni vote: clarification.
- Le mode response-first accepte `options.canRunAnalysis` (source `online`
  configuree ou modele local charge) pour ne plus rabattre les questions
  d'analyse vers `list` quand aucun generateur n'est encore charge.

### Memoire de session
- La session navigateur doit memoriser:
  - `activeDeputeId`
  - `lastResultVoteIds`
  - `lastResultQuery`
  - `lastFilters`
  - `lastSort`
  - `lastLimit`
  - `lastTheme`
  - `lastDateRange`
  - `lastPlan`
- Les references du type `ces votes`, `ceux-ci`, `les derniers` doivent reutiliser `lastResultVoteIds`.

## Ce qui est deja implemente
- Chargement explicite du modele avec consentement utilisateur.
- Separation stable/experimental dans le catalogue des modeles (le statut `experimental` reste utilise par la source `online`).
- Runtime local unique `Qwen3` stable sur `transformers.js` (canal stable).
- Manifeste RAG public et index semantique public prepares par `scripts/generate_semantic_index.py`.
- RAG semantique local experimental en opt-in avec selection utilisateur `single-vector` / `multi-vector`.
- Nettoyage des sorties pour supprimer les blocs de type `<think>`.
- Planificateur de route dans `js/domain/router.js`.
- Classification d'intention a score dans `js/domain/intent-classifier.js`
  (candidats + confiance, intensificateurs d'analyse, heritage du type de
  question sur suivi elliptique).
- Reponses deterministes pour:
  - listes
  - comptages
  - sujets
- Memoire de session pour les suivis du type `ces votes`.
- Analyse LLM reservee aux demandes interpretatives.

## Regles a respecter par la suite

### Reponses et UX
- Reponse factuelle d'abord, LLM ensuite.
- Si un resultat est trop large, demander une precision au lieu de broder.
- En analyse, citer des votes precis avec date.
- Si l'information manque, le dire clairement.
- Si un backend distant est utilise, l'UI doit l'indiquer clairement avant l'envoi.
- Eviter les lignes horizontales pour separer des composants visuels; preferer l'espacement, les cartes et les contrastes de fond.

### Donnees et enrichissement
- Enrichir les scrutins cote serveur avec:
  - `summary`
  - `subject`
  - `theme`
  - `law_title` si disponible
  - `source_url`
- Conserver la separation:
  - documents globaux cote scrutin
  - mapping des votes par depute

### Infra
- Pas de backend applicatif classique pour le chat.
- Le seul composant distant autorise en runtime est le Worker Cloudflare du service `online`.
- Les gros poids de modeles ne doivent pas etre commites dans le depot.
- S'appuyer sur Hugging Face + cache navigateur pour les modeles.
- Si le service `online` est actif, l appel doit passer par le Worker Cloudflare configure dans `public/data/model-catalog.json`.

## Priorites actuelles

### Priorite haute
- Enrichir les scrutins cote serveur avec `summary`, `subject`, `theme` et plus tard `law_title`.
- Tester en vrai `Qwen3 1.7B q4f16` sur les cas d'usage principaux pour decider si le defaut doit monter au-dessus de `0.6B`.
- Verifier dans le navigateur:
  - liste large -> demande de precision
  - liste bornee -> rendu deterministe
  - suivi `ces votes` -> reutilisation du dernier resultat
  - analyse thematique -> contexte court + synthese en francais
  - mode semantique desactive -> aucun chargement d'embedding
  - mode `single-vector` actif -> chargement explicite du seul modele d'embedding dedie
  - mode `multi-vector` actif -> chargement explicite du meme modele dedie + du bon artefact

### Priorite moyenne
- Ajouter une pagination ou un affichage progressif pour les grandes listes de votes.
- Ajouter des citations plus visibles dans les reponses analytiques.
- Nettoyer le vieux script inline desactive encore present dans `index.html`.
- Nettoyer les restes obsoletes non Markdown lies a WebLLM si plus rien ne les utilise.

### Plus tard
- Etendre le schema RAG pour lier finement `amendement` et `article` (les
  liens `scrutin` -> `texte_loi` sont couverts par les dossiers/fiches).
- Ajouter les liens Legifrance des lois promulguees dans les fiches.
- Retirer du catalogue les modeles experimentaux qui ne sont pas convaincants apres tests.

## Commandes utiles

```powershell
python -m http.server 8000
node --check js/app-runtime.js
python -m py_compile scripts/generate_semantic_index.py
python scripts/generate_semantic_index.py
```

## Note de maintenance
- Si une regle change, mettre a jour ce fichier en premier.
- Les anciens fichiers de documentation fusionnes ici ne doivent pas etre reintroduits comme source de verite parallele.
