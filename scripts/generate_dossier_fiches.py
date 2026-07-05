# -*- coding: utf-8 -*-
"""Génération des fiches d'analyse « second ordre » des dossiers législatifs.

Pour chaque dossier lié à des scrutins (public/data/dossiers/index.json), le
script récupère le texte officiel sur assemblee-nationale.fr (exposé des motifs
+ dispositif), puis demande à un LLM (endpoint OpenAI-compatible, par défaut
NVIDIA NIM) une fiche structurée : objectif affiché, mécanismes concrets, et
verdict explicite sur l'alignement des incitations réelles avec l'objectif
affiché. Les fiches sont écrites dans public/data/dossiers/fiches/{uid}.json,
avec un index léger public/data/dossiers/fiches_index.json pour le front.

Conçu pour le quota gratuit NIM : débit limité (--rpm), plafond d'appels par
run (--max-calls), budget temps (--time-budget-min), reprise incrémentale
(les fiches à jour sont sautées). Échec d'un dossier = non bloquant ; le run
n'échoue que sur une erreur systémique (clé invalide, zéro succès).

Env : ANALYSIS_API_KEY (obligatoire), ANALYSIS_API_BASE_URL, ANALYSIS_API_MODEL.
Usage : python scripts/generate_dossier_fiches.py [--limit N] [--dry-run] ...
"""

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup

# v2 : invalide les fiches generees sur des PDF illisibles (runs des 04-05/07).
ANALYSIS_VERSION = 2
FICHE_SCHEMA_VERSION = 1

# Les variables de workflow non definies arrivent en CHAINE VIDE (pas absentes) :
# `or` applique le defaut dans les deux cas.
# call_llm ajoute lui-meme /chat/completions : on tolere une URL complete
# (comme dans les exemples NVIDIA) en retirant ce suffixe s'il est present.
API_BASE_URL = re.sub(
    r"/chat/completions/?$",
    "",
    (os.environ.get("ANALYSIS_API_BASE_URL") or "https://integrate.api.nvidia.com/v1").rstrip("/"),
).rstrip("/")
API_MODEL = os.environ.get("ANALYSIS_API_MODEL") or "minimaxai/minimax-m3"
API_KEY = os.environ.get("ANALYSIS_API_KEY", "")
API_PROVIDER_LABEL = os.environ.get("ANALYSIS_API_PROVIDER") or "nvidia-nim"

FICHIER_INDEX_DOSSIERS = "./public/data/dossiers/index.json"
DIR_FICHES = "./public/data/dossiers/fiches"
FICHIER_FICHES_INDEX = "./public/data/dossiers/fiches_index.json"

SOURCE_TEXT_MAX_CHARS = 15000
LLM_MAX_TOKENS = 8192
# Extraction factuelle de JSON structure : temperature basse par defaut
# (1.0 est le reglage « creatif » des exemples NVIDIA, inadapte ici).
LLM_TEMPERATURE = float(os.environ.get("ANALYSIS_API_TEMPERATURE") or "0.2")
HTTP_TIMEOUT_SECONDS = 60
MAX_RETRIES = 5

VERDICTS_VALIDES = (
    "incitations_alignees",
    "incitations_mitigees",
    "incitations_opposees",
    "indetermine",
)

DISCLAIMER = (
    "Analyse générée automatiquement par IA à partir du texte officiel. "
    "À vérifier sur les sources citées."
)

SYSTEM_PROMPT = """Tu es un analyste législatif rigoureux et impartial.
On te fournit le titre, l'objectif affiché et le texte (exposé des motifs et articles) d'un texte de loi français.
Ta mission est une analyse de second ordre :
1. Résume l'objectif AFFICHÉ du texte (titre + exposé des motifs).
2. Identifie les mécanismes CONCRETS créés par les articles (obligations, taxes, subventions, dérogations, seuils, sanctions...).
3. Détermine si les incitations réellement créées par ces mécanismes vont dans le sens de l'objectif affiché, ou dans le sens opposé (exemple : une "loi climat" qui, en pratique, augmenterait les émissions de CO2).

Règles strictes :
- Appuie-toi UNIQUEMENT sur le texte fourni. Ne complète jamais avec des connaissances externes.
- Chaque mécanisme cité doit référencer un article ou citer un court passage du texte fourni.
- En cas de doute ou de texte insuffisant, verdict "indetermine".
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{
  "objectifAffiche": "string (2-3 phrases max)",
  "mecanismesCles": [
    { "resume": "string", "articleRef": "string (ex: art. 3) ou null", "citation": "string (courte citation du texte) ou null" }
  ],
  "verdictIncitations": "incitations_alignees | incitations_mitigees | incitations_opposees | indetermine",
  "justificationVerdict": "string sourcée (3-5 phrases citant les mécanismes)",
  "pointsDeVigilance": ["string"],
  "themes": ["string (thèmes courts en minuscules)"]
}"""


def log(message: str) -> None:
    print(message, flush=True)


def load_dossiers_index():
    """Retourne l'index des dossiers, ou None s'il n'a pas encore été généré."""
    if not os.path.exists(FICHIER_INDEX_DOSSIERS):
        return None
    with open(FICHIER_INDEX_DOSSIERS, "r", encoding="utf-8") as f:
        return json.load(f)


def fiche_path(dossier_id: str) -> str:
    return os.path.join(DIR_FICHES, f"{dossier_id}.json")


def load_existing_fiche(dossier_id: str):
    path = fiche_path(dossier_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def fiche_is_current(fiche: dict, dossier: dict) -> bool:
    if not isinstance(fiche, dict):
        return False
    return (
        fiche.get("analysisVersion") == ANALYSIS_VERSION
        and fiche.get("statut") == dossier.get("statut")
    )


def clean_page_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    text = re.sub(r"\n{2,}", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def focus_on_expose_des_motifs(text: str) -> str:
    """Recentre le texte sur l'exposé des motifs et le dispositif quand ils sont repérables."""
    match = re.search(r"expos[ée] des motifs", text, flags=re.IGNORECASE)
    if match and match.start() > 200:
        text = text[match.start():]
    return text


FETCH_HEADERS = {
    "User-Agent": "deputeGPT-pipeline",
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
}
PDF_MAX_PAGES = 60


def extract_pdf_text(payload: bytes):
    """Extrait le texte d'un PDF (les textes AN sont souvent servis en PDF)."""
    try:
        from io import BytesIO

        from pypdf import PdfReader
    except Exception as error:
        log(f"  ⚠️ pypdf indisponible ({error}) : PDF ignoré.")
        return None

    try:
        reader = PdfReader(BytesIO(payload))
        pages = [page.extract_text() or "" for page in reader.pages[:PDF_MAX_PAGES]]
        text = re.sub(r"\n{2,}", "\n", "\n".join(pages))
        return text.strip()
    except Exception as error:
        log(f"  ⚠️ Extraction PDF impossible : {error}")
        return None


def is_mostly_readable(text: str) -> bool:
    """Rejette le binaire déguisé en texte : jamais de bruit vers le LLM."""
    if not text:
        return False
    sample = text[:4000]
    printable = sum(1 for ch in sample if ch.isprintable() or ch in "\n\t")
    letters = sum(1 for ch in sample if ch.isalpha() or ch.isspace())
    return printable / len(sample) >= 0.9 and letters / len(sample) >= 0.55


def fetch_document_text(url: str, session: requests.Session):
    """Télécharge une URL AN et retourne son texte lisible (HTML ou PDF), ou None."""
    response = session.get(url, timeout=HTTP_TIMEOUT_SECONDS, headers=FETCH_HEADERS)
    response.raise_for_status()

    content_type = (response.headers.get("Content-Type") or "").lower()
    payload = response.content or b""
    if "pdf" in content_type or payload[:5] == b"%PDF-":
        return extract_pdf_text(payload)

    return clean_page_text(response.text)


def fetch_dossier_source_text(dossier: dict, session: requests.Session):
    """Retourne (texte, texteUrl). Essaie la page du texte, sinon la page du dossier."""
    an_url = dossier.get("anUrl") or ""
    dossier_html = None
    if an_url:
        try:
            response = session.get(an_url, timeout=HTTP_TIMEOUT_SECONDS, headers=FETCH_HEADERS)
            response.raise_for_status()
            dossier_html = response.text
        except Exception as error:
            log(f"  ⚠️ Page dossier inaccessible ({an_url}) : {error}")

    texte_url = None
    if dossier_html:
        links = re.findall(r"/dyn/\d+/textes/[a-z0-9_\-]+", dossier_html)
        seen = []
        for link in links:
            if link not in seen:
                seen.append(link)
        if seen:
            # Le dernier texte listé correspond en général à la version la plus récente.
            texte_url = "https://www.assemblee-nationale.fr" + seen[-1]

    if texte_url:
        try:
            text = fetch_document_text(texte_url, session)
            if text:
                text = focus_on_expose_des_motifs(text)
                if len(text) > 500 and is_mostly_readable(text):
                    return text[:SOURCE_TEXT_MAX_CHARS], texte_url
                log("  ⚠️ Texte du dossier illisible ou trop court, repli sur la page dossier.")
        except Exception as error:
            log(f"  ⚠️ Page texte inaccessible ({texte_url}) : {error}")

    if dossier_html:
        text = clean_page_text(dossier_html)
        if len(text) > 500 and is_mostly_readable(text):
            return text[:SOURCE_TEXT_MAX_CHARS], an_url

    return None, None


class RateLimiter:
    def __init__(self, rpm: int):
        self.min_interval = 60.0 / max(1, rpm)
        self.last_call = 0.0

    def wait(self):
        elapsed = time.monotonic() - self.last_call
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_call = time.monotonic()


class AuthError(RuntimeError):
    pass


class ClientRequestError(RuntimeError):
    """Erreur 4xx de l'API : la requete est refusee, inutile de reessayer telle quelle."""

    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"HTTP {status} : {body}")


# Certains modeles servis par NIM refusent le role "system" (HTTP 400) :
# la sonde de demarrage bascule alors ce drapeau et le prompt systeme est
# fusionne dans le message utilisateur.
SYSTEM_MERGE = False


def build_llm_messages(system_prompt: str, user_content: str):
    if SYSTEM_MERGE:
        return [{"role": "user", "content": f"{system_prompt}\n\n---\n\n{user_content}"}]
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]


def call_llm(messages, limiter: RateLimiter, session: requests.Session, max_tokens: int = LLM_MAX_TOKENS) -> str:
    url = f"{API_BASE_URL}/chat/completions"
    payload = {
        "model": API_MODEL,
        "messages": messages,
        "temperature": LLM_TEMPERATURE,
        "max_tokens": max_tokens,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        limiter.wait()
        try:
            response = session.post(url, json=payload, headers=headers, timeout=HTTP_TIMEOUT_SECONDS)
        except (requests.exceptions.MissingSchema, requests.exceptions.InvalidURL) as error:
            # Erreur de configuration, pas d'erreur reseau : inutile de reessayer.
            raise AuthError(f"URL API invalide ({url}) : {error}")
        except requests.RequestException as error:
            if attempt == MAX_RETRIES:
                raise
            delay = min(60, 2 ** attempt) + random.uniform(0, 1)
            log(f"  ⚠️ Erreur réseau LLM ({error}), nouvel essai dans {delay:.0f}s")
            time.sleep(delay)
            continue

        if response.status_code in (401, 403):
            raise AuthError(f"Authentification refusée par l'API ({response.status_code}).")

        if response.status_code == 429 or response.status_code >= 500:
            if attempt == MAX_RETRIES:
                response.raise_for_status()
            retry_after = response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else min(60, 2 ** attempt)
            delay += random.uniform(0, 1)
            log(f"  ⚠️ HTTP {response.status_code}, nouvel essai dans {delay:.0f}s")
            time.sleep(delay)
            continue

        if response.status_code >= 400:
            # Le corps de la reponse contient la raison exacte (modele inconnu,
            # parametre refuse, role system non supporte...) : on la remonte.
            body_excerpt = re.sub(r"\s+", " ", str(response.text or "")).strip()[:300]
            raise ClientRequestError(response.status_code, body_excerpt)

        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        content = ((choices[0].get("message") or {}).get("content")) if choices else None
        if not content:
            raise RuntimeError("Réponse LLM vide.")
        return content

    raise RuntimeError("Appels LLM épuisés.")


def parse_fiche_json(raw_answer: str):
    """Extrait et valide le JSON de la réponse LLM. Retourne dict ou None."""
    # Les modèles raisonneurs (minimax-m3, deepseek-r1...) peuvent émettre un
    # bloc de réflexion avant la réponse : on le retire avant d'extraire le JSON.
    text = re.sub(r"<think>.*?</think>", "", raw_answer, flags=re.DOTALL).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
    except Exception:
        return None

    if not isinstance(parsed, dict):
        return None
    if parsed.get("verdictIncitations") not in VERDICTS_VALIDES:
        return None
    if not str(parsed.get("objectifAffiche") or "").strip():
        return None
    if not str(parsed.get("justificationVerdict") or "").strip():
        return None

    mecanismes = parsed.get("mecanismesCles")
    if not isinstance(mecanismes, list):
        return None
    parsed["mecanismesCles"] = [
        {
            "resume": str(item.get("resume") or "").strip(),
            "articleRef": (str(item.get("articleRef")).strip() if item.get("articleRef") else None),
            "citation": (str(item.get("citation")).strip() if item.get("citation") else None),
        }
        for item in mecanismes
        if isinstance(item, dict) and str(item.get("resume") or "").strip()
    ]
    parsed["pointsDeVigilance"] = [
        str(item).strip() for item in (parsed.get("pointsDeVigilance") or []) if str(item).strip()
    ]
    parsed["themes"] = [
        str(item).strip().lower() for item in (parsed.get("themes") or []) if str(item).strip()
    ]
    return parsed


def build_user_prompt(dossier_id: str, dossier: dict, source_text: str) -> str:
    return (
        f"DOSSIER LÉGISLATIF : {dossier.get('titre')}\n"
        f"Identifiant : {dossier_id}\n"
        f"Procédure : {dossier.get('procedure') or 'inconnue'}\n"
        f"Statut : {dossier.get('statut')}\n\n"
        f"TEXTE OFFICIEL (tronqué à {SOURCE_TEXT_MAX_CHARS} caractères) :\n"
        f"{source_text}"
    )


def generate_fiche(dossier_id: str, dossier: dict, limiter: RateLimiter, session: requests.Session):
    source_text, texte_url = fetch_dossier_source_text(dossier, session)
    if not source_text:
        log("  ⚠️ Aucun texte source exploitable, dossier sauté.")
        return None, 0

    messages = build_llm_messages(SYSTEM_PROMPT, build_user_prompt(dossier_id, dossier, source_text))

    calls_used = 0
    parsed = None
    for attempt in range(2):
        raw_answer = call_llm(messages, limiter, session)
        calls_used += 1
        parsed = parse_fiche_json(raw_answer)
        if parsed:
            break
        log("  ⚠️ JSON invalide, nouvel essai avec rappel de format.")
        messages.append({"role": "assistant", "content": raw_answer[:2000]})
        messages.append({
            "role": "user",
            "content": "Ta réponse n'était pas un JSON valide au format demandé. "
                       "Réponds uniquement avec l'objet JSON demandé, sans aucun texte autour.",
        })

    if not parsed:
        log("  ❌ Impossible d'obtenir un JSON valide pour ce dossier.")
        return None, calls_used

    fiche = {
        "schemaVersion": FICHE_SCHEMA_VERSION,
        "analysisVersion": ANALYSIS_VERSION,
        "dossierId": dossier_id,
        "generatedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": {
            "provider": API_PROVIDER_LABEL,
            "id": API_MODEL,
            "baseUrl": API_BASE_URL,
        },
        "titre": dossier.get("titre"),
        "statut": dossier.get("statut"),
        "sources": {
            "dossierAn": dossier.get("anUrl") or None,
            "texteAn": texte_url,
            "legifrance": dossier.get("legifranceUrl"),
        },
        "objectifAffiche": parsed["objectifAffiche"],
        "mecanismesCles": parsed["mecanismesCles"][:6],
        "verdictIncitations": parsed["verdictIncitations"],
        "justificationVerdict": parsed["justificationVerdict"],
        "pointsDeVigilance": parsed["pointsDeVigilance"][:5],
        "themes": parsed["themes"][:5],
        "scrutinsCles": (dossier.get("scrutinNumeros") or [])[-4:],
        "disclaimer": DISCLAIMER,
        "sourceTextHash": "sha256:" + hashlib.sha256(source_text.encode("utf-8")).hexdigest(),
    }
    return fiche, calls_used


def write_fiche(fiche: dict) -> None:
    os.makedirs(DIR_FICHES, exist_ok=True)
    with open(fiche_path(fiche["dossierId"]), "w", encoding="utf-8") as f:
        json.dump(fiche, f, ensure_ascii=False, indent=1)


def probe_llm_configuration(limiter: RateLimiter, session: requests.Session) -> None:
    """Valide la configuration LLM par un appel minimal avant la boucle.

    Echoue vite et clairement sur une erreur systemique (cle, modele, parametre)
    au lieu de marteler tous les dossiers. Bascule automatiquement en mode
    « system fusionne » si le modele refuse le role system.
    """
    global SYSTEM_MERGE

    def run_probe():
        return call_llm(
            build_llm_messages("Tu réponds uniquement OK.", "Réponds uniquement OK."),
            limiter,
            session,
            max_tokens=16,
        )

    try:
        run_probe()
        log(f"✅ Sonde LLM OK ({API_MODEL} @ {API_BASE_URL}).")
        return
    except ClientRequestError as error:
        if error.status == 400 and not SYSTEM_MERGE and re.search(r"system", error.body, re.IGNORECASE):
            log(f"⚠️ Le modèle semble refuser le rôle system ({error.body}) : bascule en message unique.")
            SYSTEM_MERGE = True
            run_probe()
            log(f"✅ Sonde LLM OK en mode message unique ({API_MODEL}).")
            return
        raise


def rebuild_fiches_index() -> dict:
    """Reconstruit l'index léger des fiches à partir des fichiers sur disque."""
    entries = {}
    if os.path.isdir(DIR_FICHES):
        for name in sorted(os.listdir(DIR_FICHES)):
            if not name.endswith(".json"):
                continue
            try:
                with open(os.path.join(DIR_FICHES, name), "r", encoding="utf-8") as f:
                    fiche = json.load(f)
            except Exception:
                continue
            dossier_id = fiche.get("dossierId")
            if not dossier_id:
                continue
            entries[dossier_id] = {
                "titre": fiche.get("titre"),
                "verdictIncitations": fiche.get("verdictIncitations"),
                "statut": fiche.get("statut"),
                "generatedAt": fiche.get("generatedAt"),
                "themes": fiche.get("themes") or [],
            }

    payload = {
        "schemaVersion": FICHE_SCHEMA_VERSION,
        "generatedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalFiches": len(entries),
        "fiches": entries,
    }
    os.makedirs(os.path.dirname(FICHIER_FICHES_INDEX), exist_ok=True)
    with open(FICHIER_FICHES_INDEX, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Génération des fiches d'analyse des dossiers")
    parser.add_argument("--limit", type=int, default=None, help="Nombre max de dossiers à traiter")
    parser.add_argument("--max-calls", type=int, default=150, help="Plafond d'appels LLM par run")
    parser.add_argument("--rpm", type=int, default=20, help="Requêtes LLM max par minute")
    parser.add_argument("--time-budget-min", type=int, default=25, help="Budget temps total en minutes")
    parser.add_argument("--dossier", type=str, default=None, help="Traiter uniquement ce dossierId")
    parser.add_argument("--dry-run", action="store_true", help="N'appelle pas le LLM, liste le travail à faire")
    args = parser.parse_args()

    if not API_KEY and not args.dry_run:
        log("ANALYSIS_API_KEY absent : rien à faire (configurer le secret pour activer les fiches).")
        rebuild_fiches_index()
        return

    if not API_BASE_URL.startswith(("http://", "https://")):
        log(f"❌ ANALYSIS_API_BASE_URL invalide : « {API_BASE_URL} » (une URL http(s) est attendue).")
        sys.exit(1)

    index = load_dossiers_index()
    if index is None:
        log(f"Index dossiers absent ({FICHIER_INDEX_DOSSIERS}) : lancez d'abord scripts/link_dossiers.py.")
        rebuild_fiches_index()
        return

    dossiers = index.get("dossiers") or {}
    if args.dossier:
        dossiers = {k: v for k, v in dossiers.items() if k == args.dossier}

    # Priorité aux dossiers les plus récents (numéro de scrutin le plus élevé).
    def recency_key(item):
        numeros = item[1].get("scrutinNumeros") or []
        return max((int(n) for n in numeros if str(n).isdigit()), default=0)

    ordered = sorted(dossiers.items(), key=recency_key, reverse=True)

    todo = []
    for dossier_id, dossier in ordered:
        if fiche_is_current(load_existing_fiche(dossier_id), dossier):
            continue
        todo.append((dossier_id, dossier))

    log(f"Dossiers à traiter : {len(todo)} / {len(dossiers)} (fiches à jour sautées)")
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for dossier_id, dossier in todo[:50]:
            log(f"  - {dossier_id} : {dossier.get('titre', '')[:90]}")
        rebuild_fiches_index()
        return

    limiter = RateLimiter(args.rpm)
    session = requests.Session()

    try:
        probe_llm_configuration(limiter, session)
    except (AuthError, ClientRequestError) as error:
        log(f"❌ Sonde LLM en échec, configuration à corriger avant tout traitement : {error}")
        sys.exit(1)
    except Exception as error:
        log(f"❌ Sonde LLM en échec ({error}).")
        sys.exit(1)

    started_at = time.monotonic()
    calls_used = 0
    successes = 0
    failures = 0
    consecutive_client_errors = 0

    for dossier_id, dossier in todo:
        if calls_used >= args.max_calls:
            log(f"Plafond d'appels atteint ({args.max_calls}), arrêt propre.")
            break
        if (time.monotonic() - started_at) > args.time_budget_min * 60:
            log(f"Budget temps atteint ({args.time_budget_min} min), arrêt propre.")
            break

        log(f"▶ {dossier_id} : {dossier.get('titre', '')[:90]}")
        try:
            fiche, used = generate_fiche(dossier_id, dossier, limiter, session)
            calls_used += used
            if fiche:
                write_fiche(fiche)
                successes += 1
                consecutive_client_errors = 0
                log(f"  ✅ Fiche écrite (verdict : {fiche['verdictIncitations']})")
            else:
                failures += 1
        except AuthError as error:
            log(f"❌ Erreur d'authentification : {error}")
            sys.exit(1)
        except ClientRequestError as error:
            failures += 1
            consecutive_client_errors += 1
            log(f"  ⚠️ Requête refusée par l'API : {error}")
            if consecutive_client_errors >= 3:
                log("❌ 3 refus consécutifs de l'API : problème de configuration probable, arrêt du run.")
                rebuild_fiches_index()
                sys.exit(1)
        except Exception as error:
            failures += 1
            log(f"  ⚠️ Échec non bloquant : {error}")

    payload = rebuild_fiches_index()
    log(
        f"Terminé : {successes} fiche(s) générée(s), {failures} échec(s), "
        f"{calls_used} appel(s) LLM, index fiches : {payload['totalFiches']} entrées."
    )

    if todo and successes == 0 and calls_used > 0:
        log("❌ Aucun succès sur ce run alors que des appels ont été tentés.")
        sys.exit(1)


if __name__ == "__main__":
    main()
