# Questions routeur

Ce dossier sert a suivre les questions utilisateur pour ameliorer le routeur sans les stocker dans le prompt.

## Fichiers
- `question-bank.jsonl` : une question par ligne, avec `family`, `topic`, `template_id`, `canonical_group` et `status`.
- `router-templates.json` : attente par `template_id` (`expected_route_action`, `expected_intent_kind`, `clarify_reason`).
- `question-bank-overrides.json` : exceptions par `id` quand un meme `template_id` melange en pratique des cas supportes, des cas hors perimetre ou des cas contextuels.
- `../../docs/questions-brutes.md` : archive brute des formulations recues.

## Statuts
- `new`
- `deduped`
- `mapped`
- `covered`

## Regle simple
- On garde toujours la formulation brute.
- On regroupe ensuite les paraphrases sous un meme `template_id`.
- `canonical_group` regroupe les formulations quasi equivalentes a l'interieur d'un meme theme.
- On n'ajoute une logique de routeur qu'apres avoir repere une vraie famille de questions recurrente.
- Les gros blocs repetitifs peuvent etre conserves en gabarits parametrables dans `questions-brutes.md` pour garder un corpus lisible.

## Audit
- Le script `../../scripts/audit_question_bank.js` verifie `route.action`, `intent.kind` et les morceaux de `scope.filters` declares dans les attentes.
- Les questions hors perimetre ou sans contexte doivent maintenant aller vers `expected_route_action: "clarify"` avec un motif explicite (`unsupported`, `needs_context`, `too_broad`).
- `docs/questions-brutes.md` reste une archive de formulations. Les puces non instanciees ou purement rhetoriques ne deviennent pas des cas de test tant qu elles n ont pas d entree structuree dans `question-bank.jsonl`.
