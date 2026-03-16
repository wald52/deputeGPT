# AGENTS.md

## Resume du fil

### Objectif produit
- DeputeGPT est une application web statique qui aide un utilisateur a interroger les votes des deputes francais.
- Le cas d'usage central est: selectionner un depute, explorer ses votes, puis poser des questions factuelles ou analytiques sur ces votes.
- Le projet vise GitHub Pages en compte gratuit, avec GitHub Actions pour la preparation nocturne des donnees.

### Decisions d'architecture retenues
- Abandon total de MLC et WebLLM.
- Runtime IA navigateur: `transformers.js` + WebGPU.
- Chat stable: famille `Qwen3` ONNX.
- Chat experimental: famille `Qwen3.5` ONNX, a garder seulement si les tests sont vraiment bons.
- Backend distant optionnel autorise: `OpenRouter`, uniquement en opt-in explicite utilisateur.
- Le backend distant ne doit jamais remplacer silencieusement la voie locale par defaut.
- Toute cle API OpenRouter doit etre fournie par l'utilisateur, jamais committee dans le depot.
- En mode OpenRouter, seules les demandes d'analyse envoient un contexte court hors du navigateur.
- Le chat ne doit jamais utiliser un modele generatif comme modele d'embedding.
- Le telechargement d'un modele IA ne doit jamais etre silencieux: consentement explicite, taille affichee, dernier choix memorise localement.

### Strategie modeles retenue
- Source de verite UI: `public/data/model-catalog.json`.
- Modele par defaut: le plus petit profil stable teste en vrai dans l'app.
- Etat actuel du code:
  - stable: `Qwen3 0.6B`, `Qwen3 1.7B`, `Qwen3 4B`
  - experimental: `Qwen3.5 0.8B`, `Qwen3.5 2B`, `Qwen3.5 4B`
- Les quantifications doivent etre separees explicitement dans le catalogue.
- `Qwen3` stable utilise un chargement bas niveau via `AutoTokenizer + Qwen3ForCausalLM`.
- `Qwen3.5` experimental utilise `AutoTokenizer + Qwen3_5*ForConditionalGeneration`.
- Le mode par defaut est non-thinking:
  - `enable_thinking: false`
  - sortie finale uniquement
  - francais uniquement
- Un mode thinking optionnel peut etre active uniquement par les utilisateurs avances.
- Meme en mode thinking, l'UI ne doit jamais afficher le raisonnement interne (`<think>`).

### Strategie RAG retenue
- RAG par defaut cote navigateur: lexical/structure, pas d'embedding local obligatoire en v1.
- RAG semantique local: opt-in explicite en mode avance, jamais active par defaut.
- Le mode semantique propose deux strategies:
  - `single-vector` par defaut
  - `multi-vector` experimental en mode avance
- Chemin avance retenu: top lexical cote navigateur puis reranking semantique local sur un sous-ensemble court.
- Le navigateur doit exploiter les artefacts prepares a l'avance cote serveur.
- Le serveur prepare ses artefacts la nuit via GitHub Actions.
- Le serveur publie:
  - un manifeste RAG public
  - un index lexical public
  - un index semantique `single-vector`
  - un index semantique `multi-vector` experimental
- Le navigateur ne doit calculer localement que l'embedding de requete quand le mode semantique est active.
- L'indexation doit se faire au niveau du scrutin unique, pas du couple depute-vote.
- Le schema doit rester extensible pour accueillir plus tard:
  - `scrutin`
  - `texte_loi`
  - `amendement`
  - `article`
- Les textes de loi sont une extension future, pas un prerequis de v1.

### Regle produit la plus importante
- Ne pas tout envoyer au LLM.
- Les questions exactes ou tabulaires doivent etre traitees de maniere deterministe:
  - liste de votes
  - nombre de votes
  - tri
  - filtre par date
  - filtre par type de vote
  - sujets des votes deja affiches
- Le LLM doit servir seulement a la synthese finale sur un petit contexte deja filtre.

### Routeur de questions retenu
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

## Etat actuel du code

### Fichiers clefs
- UI principale: `index.html`
- Runtime applicatif: `js/app-runtime.js`
- Catalogue modeles: `public/data/model-catalog.json`
- Manifest RAG public: `public/data/rag/manifest.json`
- Index lexical historique: `public/data/search_index.json`
- Generation des artefacts RAG: `scripts/generate_semantic_index.py`

### Ce qui est deja implemente
- Chargement explicite du modele, avec consentement utilisateur.
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

### Modeles et inference
- Ne pas reintroduire MLC ou WebLLM sans decision explicite.
- Ne pas telecharger un modele automatiquement au chargement de la page.
- Garder `Qwen3` comme voie stable.
- Garder `Qwen3.5` comme voie experimentale, facile a retirer du catalogue.
- Le mode thinking est reserve au mode avance via opt-in explicite utilisateur.
- Ne pas promettre une quantification qui n'a pas ete testee dans l'application.
- Si `Qwen3 0.6B` reste insuffisant apres essais, monter le defaut vers `Qwen3 1.7B q4f16`.

### Reponses et UX
- Reponse factuelle d'abord, LLM ensuite.
- Si un resultat est trop large, demander une precision au lieu de broder.
- Toujours repondre en francais.
- Ne jamais afficher le raisonnement interne du modele.
- En analyse, citer des votes precis avec date.
- Si l'information manque, le dire clairement.
- Si un backend distant est utilise, l'UI doit l'indiquer clairement avant l'envoi.

### Donnees et RAG
- Ne pas utiliser le modele de chat comme modele d'embedding.
- L'embedding local experimental actuel doit rester sur un modele dedie, distinct du chat.
- Le mode `single-vector` doit rester la voie stable par defaut.
- Le mode `multi-vector` doit rester avance, experimental et explicitement choisi par l'utilisateur.
- Enrichir les scrutins cote serveur avec:
  - `summary`
  - `subject`
  - `theme`
  - `law_title` si disponible
  - `source_url`
- Conserver la separation:
  - documents globaux cote scrutin
  - mapping des votes par depute

### Infra et hebergement
- Cible d'hebergement: GitHub Pages gratuit.
- Traitement nocturne: GitHub Actions.
- Pas de backend runtime serveur pour le chat.
- Les gros poids de modeles ne doivent pas etre commites dans le depot.
- S'appuyer sur Hugging Face + cache navigateur pour les modeles.
- Si OpenRouter est active, l'appel doit partir directement du navigateur avec une cle utilisateur explicite.

## Actions a faire ensuite

### Priorite haute
- Enrichir les scrutins cote serveur avec `summary`, `subject`, `theme` et, plus tard, `law_title`.
- Tester en vrai `Qwen3 1.7B q4f16` sur les cas d'usage principaux pour decider si le defaut doit monter au-dessus de `0.6B`.
- Verifier dans le navigateur les cas suivants:
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

### Priorite plus tard
- Ajouter les textes de loi associes aux votes dans le pipeline serveur.
- Etendre le schema RAG pour lier `scrutin`, `texte_loi`, `amendement` et `article`.
- Retirer du catalogue les modeles experimentaux qui ne sont pas convaincants apres tests.

### Idees futures
- Citations plus visibles dans les reponses analytiques.
- Tests navigateur automatises ou smoke tests plus solides.
- Ajout de types de documents RAG supplementaires.

## Commandes utiles

```powershell
python -m http.server 8000
node --check js/app-runtime.js
python -m py_compile scripts/generate_semantic_index.py
python scripts/generate_semantic_index.py
```

## Note de maintenance
- Ce fichier est la source de verite unique pour le projet.
- Si une regle change, mettre a jour ce fichier en premier.
- Les anciens fichiers de documentation (PROJECT_SUMMARY.txt, etc.) ont ete fusionnes ici.
