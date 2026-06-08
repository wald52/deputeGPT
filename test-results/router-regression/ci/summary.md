# Regression routeur - ci

- Cas totaux: 20159
- Echecs: 4544
- Taux d'echec global: 22.54%

## Repartition par categorie

- analysis_theme: 552/576 en echec (95.83%)
- bounded_list_deterministic: 0/576 en echec (0.00%)
- closed_date_fr: 0/576 en echec (0.00%)
- closed_date_month_year: 0/576 en echec (0.00%)
- closed_date_numeric: 0/576 en echec (0.00%)
- closed_vote_negative: 1/576 en echec (0.17%)
- closed_vote_positive: 1/576 en echec (0.17%)
- document_target: 1/9 en echec (11.11%)
- explicit_depute_reset: 563/2304 en echec (24.44%)
- follow_up_day: 18/1152 en echec (1.56%)
- follow_up_month: 606/1132 en echec (53.53%)
- follow_up_recent: 12/3450 en echec (0.35%)
- follow_up_short_vote: 0/1744 en echec (0.00%)
- large_list_paginated: 0/576 en echec (0.00%)
- open_date_exact: 0/576 en echec (0.00%)
- scrutin_exists_without_local_vote: 3/576 en echec (0.52%)
- scrutin_missing_globally: 0/576 en echec (0.00%)
- theme_closed_question: 553/576 en echec (96.01%)
- theme_filter: 553/576 en echec (96.01%)
- ui_pagination_metadata: 576/576 en echec (100.00%)
- ui_scope_action: 1105/2304 en echec (47.96%)

## Top 10 des patterns de bugs

- 1656 cas: filter.theme:fin de vie->null
- 552 cas: action:analysis_rag->deterministic
- 552 cas: source:depute_all->explicit_filter
- 313 cas: action:deterministic->clarify
- 299 cas: filter.queryText:projet de loi portant transposition de l'avenant n° 3 du 25 fevrier 2026 au protocole d'accord du 10 novembre 2023 relatif a l'assurance chomage->projet de loi portant transposition de l'avenant n° 3
- 106 cas: displayed.missing:5719,5720,5721,5722,5723,5724,5725,5726,5727,5728,5729,5688
- 51 cas: metadata.references.missing:7304,7305,7306,7307,7308
- 28 cas: metadata.references.missing:7271,7272,7273,7274,7275
- 25 cas: metadata.references.missing:7272,7273,7274,7275,7276
- 24 cas: metadata.references.missing:7295,7296,7297,7298,7299

## Exemples representatifs

- ui_pagination_metadata__PA1008 (ui_pagination_metadata, PA1008)
  Question: 5 derniers votes
  Pattern: metadata.references.missing:7259,7260,6753,6736,6527
  Codes: missing_vote_ids, reason_missing
- theme_list__PA1008__fin de vie (theme_filter, PA1008)
  Question: montre les votes sur la fin de vie
  Pattern: filter.theme:fin de vie->null
  Codes: scope_mismatch, missing_vote_ids, missing_vote_ids, unexpected_vote_ids, unexpected_vote_ids
- theme_closed__PA1008__fin de vie (theme_closed_question, PA1008)
  Question: est-ce que ce depute a vote sur la fin de vie ?
  Pattern: filter.theme:fin de vie->null
  Codes: scope_mismatch, missing_vote_ids, missing_vote_ids, unexpected_vote_ids, unexpected_vote_ids
- theme_analysis__PA1008__fin de vie (analysis_theme, PA1008)
  Question: quelle est sa position sur la fin de vie ?
  Pattern: action:analysis_rag->deterministic
  Codes: action_mismatch, intent_mismatch, scope_mismatch, result_kind_mismatch
- explicit_depute_reset__PA1008__fin_de_vie (explicit_depute_reset, PA1008)
  Question: est-ce que ce depute a vote sur la fin de vie ?
  Pattern: filter.theme:fin de vie->null
  Codes: scope_mismatch, missing_vote_ids, missing_vote_ids, unexpected_vote_ids, unexpected_vote_ids
- ui_scope_clear_theme__PA1008__fin de vie (ui_scope_action, PA1008)
  Question: montre les votes sur la fin de vie
  Pattern: displayed.missing:5728,5729,5688,5689,5690,5691,5692,5693,5694,5695,5696,5697
  Codes: missing_vote_ids, missing_vote_ids, unexpected_vote_ids, unexpected_vote_ids
- ui_scope_clear_theme__PA1008__fin de vie (ui_scope_action, PA1008)
  Question: Retirer le thème
  Pattern: source:depute_all->explicit_filter
  Codes: follow_up_scope_mismatch, scope_mismatch, scope_mismatch, scope_mismatch
- ui_pagination_metadata__PA1567 (ui_pagination_metadata, PA1567)
  Question: 5 derniers votes
  Pattern: metadata.references.missing:7304,7305,7306,7307,7308
  Codes: missing_vote_ids, reason_missing
- theme_list__PA1567__fin de vie (theme_filter, PA1567)
  Question: montre les votes sur la fin de vie
  Pattern: filter.theme:fin de vie->null
  Codes: scope_mismatch, missing_vote_ids, missing_vote_ids, unexpected_vote_ids, unexpected_vote_ids
- theme_closed__PA1567__fin de vie (theme_closed_question, PA1567)
  Question: est-ce que ce depute a vote sur la fin de vie ?
  Pattern: filter.theme:fin de vie->null
  Codes: scope_mismatch, missing_vote_ids, missing_vote_ids, unexpected_vote_ids, unexpected_vote_ids

## Couverture documentaire

- Types couverts: amendement, article, declaration, loi, motion, projet_de_loi, proposition_de_loi, resolution, traite
- Types manquants: aucun
