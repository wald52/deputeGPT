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
  - `js/transformers.min.js`
  - `test-results/**`
  - `tmp/**`
  - `Scrutins/**` sauf tache pipeline donnees
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
- Runtime experimental Qwen3.5:
  - `js/ai/qwen35-runtime.js`
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
- Runtime IA navigateur: `transformers.js` + WebGPU.
- Chat stable: famille `Qwen3` ONNX.
- Chat experimental: famille `Qwen3.5` ONNX, facile a retirer si les tests ne sont pas convaincants.
- Service distant autorise: source `online` via Worker Cloudflare + AI Gateway, par defaut pour les demandes d'analyse.
- Les questions exactes doivent rester deterministes dans le navigateur, meme quand `online` est la source IA par defaut.
- Le service `online` ne doit jamais prendre la main sur les listes, comptages, periodes ou filtres exacts.
- Aucune cle API utilisateur n est requise pour le service `online` par defaut.
- Seules les demandes d'analyse peuvent envoyer un contexte court hors du navigateur.

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
- Experimental:
  - `Qwen3.5 0.8B`
  - `Qwen3.5 2B`
  - `Qwen3.5 4B`

### Contrats techniques
- `Qwen3` stable utilise `AutoTokenizer + Qwen3ForCausalLM`.
- `Qwen3.5` experimental utilise `AutoTokenizer + Qwen3_5*ForConditionalGeneration`.
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
- Les textes de loi sont une extension future, pas un prerequis de v1.

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
- Separation stable/experimental dans le catalogue des modeles.
- Quantifications separees pour `Qwen3.5`.
- Runtimes distincts pour `Qwen3` stable et `Qwen3.5` experimental.
- Manifeste RAG public et index semantique public prepares par `scripts/generate_semantic_index.py`.
- RAG semantique local experimental en opt-in avec selection utilisateur `single-vector` / `multi-vector`.
- Nettoyage des sorties pour supprimer les blocs de type `<think>`.
- Planificateur de route dans `js/domain/router.js`.
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
- Ajouter les textes de loi associes aux votes dans le pipeline serveur.
- Etendre le schema RAG pour lier `scrutin`, `texte_loi`, `amendement` et `article`.
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
