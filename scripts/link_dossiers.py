# -*- coding: utf-8 -*-
"""Chaînage scrutins -> dossiers législatifs (open data Assemblée nationale).

Télécharge le référentiel « Dossiers législatifs » de l'Assemblée nationale,
puis relie chaque scrutin (via l'index lexical RAG déjà publié) à son dossier
législatif. Produit public/data/dossiers/index.json, consommé ensuite par
scripts/generate_dossier_fiches.py et par le front (js/data/dossiers-repository.js).

Stratégie de chaînage, dans l'ordre :
1. overrides manuels (public/data/dossiers/overrides.json) ;
2. champ direct scrutin.objet.dossierLegislatif si les fichiers bruts
   Scrutins/json sont présents (contexte Global Update) ;
3. rapprochement de titres : extraction de la « queue » du titre du scrutin
   (projet de loi..., proposition de loi...), normalisation, containment puis
   Jaccard de tokens, départagé par la fenêtre de dates du dossier.

Usage :
    python scripts/link_dossiers.py [--stats] [--probe] [--limit N] [--skip-download]
"""

import argparse
import glob
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
from datetime import datetime, timedelta, timezone

import requests

LEGISLATURE = os.environ.get("AN_LEGISLATURE", "17")
DOSSIERS_ZIP_URL = os.environ.get(
    "AN_DOSSIERS_ZIP_URL",
    f"https://data.assemblee-nationale.fr/static/openData/repository/{LEGISLATURE}"
    "/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip",
)
DOSSIERS_WORK_DIR = "./DossiersLegislatifs"
DOSSIER_SCRUTINS = "./Scrutins/json"
FICHIER_LEXICAL_INDEX = "./public/data/rag/lexical_index.json"
FICHIER_INDEX_SORTIE = "./public/data/dossiers/index.json"
FICHIER_OVERRIDES = "./public/data/dossiers/overrides.json"
INDEX_SCHEMA_VERSION = 1

# Seuil de similarité Jaccard en-dessous duquel on refuse un rapprochement.
JACCARD_MIN = 0.6
# Fenêtre de tolérance autour des actes du dossier pour valider la date du scrutin.
DATE_WINDOW_BEFORE_DAYS = 45
DATE_WINDOW_AFTER_DAYS = 240

# Types de documents qui ancrent un dossier législatif dans un titre de scrutin.
DOSSIER_ANCHOR_PATTERNS = [
    r"projet de loi",
    r"proposition de r[ée]solution europ[ée]enne",
    r"proposition de r[ée]solution",
    r"proposition de loi",
]
# Titres sans dossier attendu (motions de censure, déclarations du Gouvernement...).
NO_DOSSIER_PATTERNS = [
    r"motion de censure",
    r"motion d'ajournement",
    r"motion r[ée]f[ée]rendaire",
    r"d[ée]claration du gouvernement",
    r"d[ée]claration de politique g[ée]n[ée]rale",
]

TITLE_STOPWORDS = {
    "le", "la", "les", "l", "de", "du", "des", "d", "un", "une", "et", "ou", "a", "au", "aux",
    "en", "pour", "par", "sur", "dans", "ce", "cette", "ces", "son", "sa", "ses", "qui", "que",
    "quoi", "dont", "avec", "sans", "sous", "entre", "vers", "est", "sont", "apres", "avant",
    "projet", "proposition", "loi", "resolution", "europeenne", "texte", "lecture", "premiere",
    "deuxieme", "nouvelle", "definitive", "ensemble", "article", "articles", "amendement",
    "amendements", "sous-amendement", "relatif", "relative", "relatifs", "relatives", "visant",
    "portant", "tendant", "modifiant", "application", "commission", "mixte", "paritaire",
    "adopte", "adoptee", "vue", "lue", "suite", "gouvernement", "senat", "assemblee", "nationale",
}


def log(message: str) -> None:
    print(message, flush=True)


def normalize_title(text: str) -> str:
    """Minuscules, sans accents, espaces normalisés."""
    text = str(text or "").lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("’", "'")
    text = re.sub(r"[^a-z0-9']+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_title_tokens(text: str) -> set:
    return {
        token
        for token in normalize_title(text).replace("'", " ").split()
        if len(token) > 3 and token not in TITLE_STOPWORDS
    }


def strip_trailing_stage(text: str) -> str:
    """Retire les mentions de lecture / texte de commission en fin de libellé."""
    cleaned = re.sub(r"\s*\([^)]*(?:lecture|texte|commission|engagement)[^)]*\)\.?\s*$", "", str(text or ""), flags=re.IGNORECASE)
    return cleaned.strip(" .")


def extract_dossier_anchor_query(titre: str):
    """Extrait la portion du titre de scrutin qui nomme le texte législatif.

    Retourne (query, kind) où kind vaut 'anchor' (dossier attendu),
    'no_dossier' (motion de censure, déclaration...) ou None (titre inclassable).
    """
    raw = re.sub(r"\s+", " ", str(titre or "")).strip()
    normalized = normalize_title(raw)

    for pattern in NO_DOSSIER_PATTERNS:
        if re.search(pattern, normalized):
            return None, "no_dossier"

    best_match = None
    for pattern in DOSSIER_ANCHOR_PATTERNS:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match and (best_match is None or match.start() < best_match.start()):
            best_match = match

    if not best_match:
        return None, None

    query = strip_trailing_stage(raw[best_match.start():])
    # Coupe les compléments de procédure qui suivent parfois le nom du texte.
    query = re.split(r"\s+\((?:n[o°]|deuxi[eè]me|nouvelle)", query)[0].strip(" .,;")
    return query, "anchor"


def parse_iso_date(value: str):
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", str(value or ""))
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y-%m-%d")
    except ValueError:
        return None


def download_and_extract_dossiers(work_dir: str, skip_download: bool = False) -> str:
    """Télécharge et extrait le zip Dossiers législatifs. Retourne le dossier extrait."""
    extract_dir = os.path.join(work_dir, "extracted")
    if skip_download and os.path.isdir(extract_dir):
        log(f"Réutilisation de l'extraction existante : {extract_dir}")
        return extract_dir

    os.makedirs(work_dir, exist_ok=True)
    log(f"Téléchargement de {DOSSIERS_ZIP_URL} ...")
    response = requests.get(DOSSIERS_ZIP_URL, timeout=180)
    response.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        archive.testzip()
        archive.extractall(extract_dir)

    log(f"Archive extraite dans {extract_dir}")
    return extract_dir


def iter_export_records(extract_dir: str):
    """Itère (kind, payload) avec kind in {'dossier', 'document'}.

    Tolère les deux dispositions connues de l'export open data :
    un gros JSON unique avec {"export": {...}} ou un fichier par entité.
    """
    json_files = glob.glob(os.path.join(extract_dir, "**", "*.json"), recursive=True)
    for path in sorted(json_files):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        if not isinstance(data, dict):
            continue

        export = data.get("export")
        if isinstance(export, dict):
            dossiers = (((export.get("dossiersLegislatifs") or {}).get("dossier")) or [])
            if isinstance(dossiers, dict):
                dossiers = [dossiers]
            for item in dossiers:
                payload = item.get("dossierParlementaire") if isinstance(item, dict) else None
                if isinstance(payload, dict):
                    yield "dossier", payload

            documents = (((export.get("textesLegislatifs") or {}).get("document")) or [])
            if isinstance(documents, dict):
                documents = [documents]
            for item in documents:
                if isinstance(item, dict):
                    yield "document", item
            continue

        if isinstance(data.get("dossierParlementaire"), dict):
            yield "dossier", data["dossierParlementaire"]
        elif isinstance(data.get("document"), dict):
            yield "document", data["document"]


TEXTE_REF_REGEX = re.compile(r"\b(?:PRJL|PION)AN[A-Z0-9]*\b")
DATE_REGEX = re.compile(r"\b(\d{4}-\d{2}-\d{2})")


def collect_actes_metadata(dossier: dict):
    """Parcours défensif de l'arbre des actes : dates, refs de textes, promulgation."""
    serialized = json.dumps(dossier.get("actesLegislatifs") or {}, ensure_ascii=False)
    dates = sorted(set(DATE_REGEX.findall(serialized)))
    texte_refs = sorted(set(TEXTE_REF_REGEX.findall(serialized)))
    promulgue = bool(re.search(r'"codeActe"\s*:\s*"[^"]*PROM', serialized)) or "promulgation" in serialized.lower()
    jo_match = re.search(r'"refJo[^"]*"\s*:\s*"([^"]+)"', serialized)
    return {
        "dateMin": dates[0] if dates else None,
        "dateMax": dates[-1] if dates else None,
        "texteRefs": texte_refs,
        "promulgue": promulgue,
        "refJo": jo_match.group(1) if jo_match else None,
    }


def build_dossier_record(payload: dict) -> dict:
    titre_dossier = payload.get("titreDossier") or {}
    titre = re.sub(r"\s+", " ", str(titre_dossier.get("titre") or "")).strip()
    titre_chemin = str(titre_dossier.get("titreChemin") or "").strip()
    procedure = ((payload.get("procedureParlementaire") or {}).get("libelle")) or ""
    actes = collect_actes_metadata(payload)

    # L'export de la legislature courante contient des dossiers herites de la
    # precedente (uid DLR5L16N...) : l'URL AN doit porter LEUR legislature,
    # sinon la page repond 503.
    uid = str(payload.get("uid") or "").strip()
    uid_legislature_match = re.search(r"L(\d+)N", uid)
    dossier_legislature = uid_legislature_match.group(1) if uid_legislature_match else LEGISLATURE
    an_url = (
        f"https://www.assemblee-nationale.fr/dyn/{dossier_legislature}/dossiers/{titre_chemin}"
        if titre_chemin
        else ""
    )

    return {
        "uid": str(payload.get("uid") or "").strip(),
        "titre": titre,
        "titreChemin": titre_chemin,
        "procedure": re.sub(r"\s+", " ", str(procedure)).strip(),
        "statut": "promulgue" if actes["promulgue"] else "en_cours",
        "anUrl": an_url,
        "texteRefs": actes["texteRefs"],
        "refJo": actes["refJo"],
        "dateMin": actes["dateMin"],
        "dateMax": actes["dateMax"],
        "normalizedTitle": normalize_title(titre),
        "titleTokens": sorted(extract_title_tokens(titre)),
    }


def load_dossiers(extract_dir: str):
    dossiers = {}
    documents = {}
    for kind, payload in iter_export_records(extract_dir):
        if kind == "dossier":
            record = build_dossier_record(payload)
            if record["uid"] and record["titre"]:
                dossiers[record["uid"]] = record
        else:
            uid = str(payload.get("uid") or "").strip()
            dossier_ref = str(payload.get("dossierRef") or "").strip()
            if uid and dossier_ref:
                documents[uid] = dossier_ref

    # Complète les refs de textes des dossiers à partir des documents.
    for texte_uid, dossier_ref in documents.items():
        dossier = dossiers.get(dossier_ref)
        if dossier is not None and texte_uid not in dossier["texteRefs"]:
            dossier["texteRefs"].append(texte_uid)

    for dossier in dossiers.values():
        dossier["texteRefs"] = sorted(set(dossier["texteRefs"]))

    log(f"Dossiers chargés : {len(dossiers)} (documents liés : {len(documents)})")
    return dossiers


def load_scrutins_from_lexical_index():
    with open(FICHIER_LEXICAL_INDEX, "r", encoding="utf-8") as f:
        index = json.load(f)

    scrutins = {}
    for numero, entry in (index.get("votes") or {}).items():
        scrutins[str(numero)] = {
            "titre": str(entry.get("titre") or ""),
            "date": str(entry.get("date") or ""),
        }
    log(f"Scrutins chargés depuis l'index lexical : {len(scrutins)}")
    return scrutins


def load_direct_dossier_refs():
    """Lit scrutin.objet.dossierLegislatif dans les fichiers bruts si présents."""
    refs = {}
    if not os.path.isdir(DOSSIER_SCRUTINS):
        return refs

    for path in glob.glob(os.path.join(DOSSIER_SCRUTINS, "VTAN*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                scrutin = (json.load(f) or {}).get("scrutin") or {}
        except Exception:
            continue

        numero = str(scrutin.get("numero") or "").strip()
        objet = scrutin.get("objet") or {}
        direct_ref = objet.get("dossierLegislatif")
        if isinstance(direct_ref, dict):
            direct_ref = direct_ref.get("uid") or direct_ref.get("dossierRef")
        direct_ref = str(direct_ref or "").strip()
        if numero and direct_ref:
            refs[numero] = direct_ref

    log(f"Références directes objet.dossierLegislatif trouvées : {len(refs)}")
    return refs


def load_overrides():
    if not os.path.exists(FICHIER_OVERRIDES):
        return {}
    try:
        with open(FICHIER_OVERRIDES, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {str(k): str(v) for k, v in (data or {}).items()}
    except Exception:
        log(f"⚠️ Overrides illisibles ({FICHIER_OVERRIDES}), ignorés.")
        return {}


def date_within_dossier_window(scrutin_date: str, dossier: dict) -> bool:
    date = parse_iso_date(scrutin_date)
    date_min = parse_iso_date(dossier.get("dateMin"))
    date_max = parse_iso_date(dossier.get("dateMax"))
    if date is None or (date_min is None and date_max is None):
        return True  # pas d'info : ne pas pénaliser
    lower = (date_min - timedelta(days=DATE_WINDOW_BEFORE_DAYS)) if date_min else None
    upper = (date_max + timedelta(days=DATE_WINDOW_AFTER_DAYS)) if date_max else None
    if lower and date < lower:
        return False
    if upper and date > upper:
        return False
    return True


def match_scrutin_to_dossier(query: str, scrutin_date: str, dossiers: dict):
    """Retourne (dossierId, method, confidence) ou (None, None, 0)."""
    normalized_query = normalize_title(strip_trailing_stage(query))
    query_tokens = extract_title_tokens(query)
    if not normalized_query:
        return None, None, 0.0

    containment_candidates = []
    jaccard_candidates = []

    for uid, dossier in dossiers.items():
        dossier_title = dossier["normalizedTitle"]
        if not dossier_title:
            continue

        if len(normalized_query) >= 25 and (
            normalized_query in dossier_title or dossier_title in normalized_query
        ):
            containment_candidates.append((uid, dossier))
            continue

        dossier_tokens = set(dossier["titleTokens"])
        if not query_tokens or not dossier_tokens:
            continue
        intersection = len(query_tokens & dossier_tokens)
        union = len(query_tokens | dossier_tokens)
        jaccard = intersection / union if union else 0.0
        if jaccard >= JACCARD_MIN:
            jaccard_candidates.append((jaccard, uid, dossier))

    dated_containment = [
        (uid, dossier)
        for uid, dossier in containment_candidates
        if date_within_dossier_window(scrutin_date, dossier)
    ] or containment_candidates
    if len(dated_containment) >= 1:
        # En cas de doublon (dossiers homonymes), on prend le plus proche par fenêtre de dates.
        uid, _ = dated_containment[0]
        confidence = 0.95 if len(dated_containment) == 1 else 0.8
        return uid, "title_containment", confidence

    jaccard_candidates.sort(key=lambda item: item[0], reverse=True)
    dated_jaccard = [
        item for item in jaccard_candidates if date_within_dossier_window(scrutin_date, item[2])
    ] or jaccard_candidates
    if dated_jaccard:
        jaccard, uid, _ = dated_jaccard[0]
        return uid, "title_match", round(jaccard, 3)

    return None, None, 0.0


def run_probe():
    """Imprime la structure d'un scrutin brut et d'un dossier pour lever les doutes de schéma."""
    scrutin_files = sorted(glob.glob(os.path.join(DOSSIER_SCRUTINS, "VTAN*.json")))
    if scrutin_files:
        with open(scrutin_files[0], "r", encoding="utf-8") as f:
            scrutin = (json.load(f) or {}).get("scrutin") or {}
        log(f"--- Sonde scrutin ({os.path.basename(scrutin_files[0])}) ---")
        log(f"Clés scrutin : {sorted(scrutin.keys())}")
        log(f"Clés scrutin.objet : {sorted((scrutin.get('objet') or {}).keys())}")
        log(f"objet.dossierLegislatif = {json.dumps((scrutin.get('objet') or {}).get('dossierLegislatif'), ensure_ascii=False)[:400]}")
    else:
        log("Sonde scrutin : aucun fichier Scrutins/json/VTAN*.json disponible localement.")

    extract_dir = download_and_extract_dossiers(DOSSIERS_WORK_DIR, skip_download=True)
    for kind, payload in iter_export_records(extract_dir):
        if kind == "dossier":
            log("--- Sonde dossierParlementaire ---")
            log(f"Clés : {sorted(payload.keys())}")
            log(f"uid = {payload.get('uid')}")
            log(f"titreDossier = {json.dumps(payload.get('titreDossier'), ensure_ascii=False)[:400]}")
            break


def main():
    parser = argparse.ArgumentParser(description="Chaînage scrutins -> dossiers législatifs")
    parser.add_argument("--stats", action="store_true", help="Affiche des statistiques détaillées")
    parser.add_argument("--probe", action="store_true", help="Imprime les schémas bruts puis sort")
    parser.add_argument("--limit", type=int, default=None, help="Limite le nombre de scrutins traités")
    parser.add_argument("--skip-download", action="store_true", help="Réutilise l'extraction existante")
    args = parser.parse_args()

    extract_dir = download_and_extract_dossiers(DOSSIERS_WORK_DIR, skip_download=args.skip_download)

    if args.probe:
        run_probe()
        return

    dossiers = load_dossiers(extract_dir)
    scrutins = load_scrutins_from_lexical_index()
    direct_refs = load_direct_dossier_refs()
    overrides = load_overrides()

    scrutin_links = {}
    dossier_scrutins = {}
    unmatched = []
    counters = {"override": 0, "field": 0, "title_containment": 0, "title_match": 0, "none": 0, "unmatched": 0}

    items = sorted(scrutins.items(), key=lambda kv: kv[0])
    if args.limit:
        items = items[: args.limit]

    for numero, scrutin in items:
        dossier_id = None
        method = None
        confidence = 0.0

        if numero in overrides:
            dossier_id, method, confidence = overrides[numero] or None, "override", 1.0
        elif numero in direct_refs and direct_refs[numero] in dossiers:
            dossier_id, method, confidence = direct_refs[numero], "field", 1.0
        else:
            query, kind = extract_dossier_anchor_query(scrutin["titre"])
            if kind == "no_dossier":
                method, confidence = "none", 1.0
            elif kind == "anchor" and query:
                dossier_id, matched_method, confidence = match_scrutin_to_dossier(
                    query, scrutin["date"], dossiers
                )
                method = matched_method
                if dossier_id is None:
                    method = "unmatched"
                    unmatched.append(numero)
            else:
                method = "unmatched"
                unmatched.append(numero)

        if dossier_id and dossier_id not in dossiers:
            log(f"⚠️ Scrutin {numero} : dossier {dossier_id} inconnu, ignoré.")
            dossier_id, method = None, "unmatched"
            unmatched.append(numero)

        counters[method or "unmatched"] = counters.get(method or "unmatched", 0) + 1
        scrutin_links[numero] = {
            "dossierId": dossier_id,
            "method": method,
            "confidence": round(float(confidence), 3),
        }
        if dossier_id:
            dossier_scrutins.setdefault(dossier_id, []).append(numero)

    linked_dossiers = {}
    for dossier_id, numeros in dossier_scrutins.items():
        dossier = dossiers[dossier_id]
        linked_dossiers[dossier_id] = {
            "titre": dossier["titre"],
            "titreChemin": dossier["titreChemin"],
            "procedure": dossier["procedure"],
            "statut": dossier["statut"],
            "anUrl": dossier["anUrl"],
            "texteRefs": dossier["texteRefs"],
            "refJo": dossier["refJo"],
            "legifranceUrl": None,
            "scrutinNumeros": sorted(numeros, key=lambda n: int(n) if n.isdigit() else 0),
        }

    matchable_total = sum(
        counters[key] for key in ("override", "field", "title_containment", "title_match", "unmatched")
    )
    matched_total = matchable_total - counters["unmatched"]
    match_rate = round(matched_total / matchable_total, 4) if matchable_total else 0.0

    payload = {
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "legislature": LEGISLATURE,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scrutins": scrutin_links,
        "dossiers": linked_dossiers,
        "unmatched": sorted(unmatched, key=lambda n: int(n) if n.isdigit() else 0),
        "stats": {
            "totalScrutins": len(scrutin_links),
            "totalDossiersLies": len(linked_dossiers),
            "matchRate": match_rate,
            "methods": counters,
        },
    }

    os.makedirs(os.path.dirname(FICHIER_INDEX_SORTIE), exist_ok=True)
    with open(FICHIER_INDEX_SORTIE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    log(
        f"Index dossiers écrit : {FICHIER_INDEX_SORTIE} — {len(linked_dossiers)} dossiers liés, "
        f"taux de match {match_rate:.1%} ({counters})"
    )

    if args.stats:
        log(json.dumps(payload["stats"], ensure_ascii=False, indent=2))
        log("Exemples de scrutins non appariés : " + ", ".join(payload["unmatched"][:20]))

    if matchable_total > 0 and match_rate < 0.5:
        log("⚠️ Taux de match anormalement bas (<50%) : vérifier le schéma open data.")
        sys.exit(1)


if __name__ == "__main__":
    main()
