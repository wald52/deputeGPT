#!/usr/bin/env python3
"""
generate_semantic_index.py
Genere les artefacts RAG lexicaux publics pour DeputeGPT.

L'artefact primaire est public/data/rag/lexical_index.json.
Le fichier public/data/search_index.json reste un miroir legacy optionnel
pour compatibilite temporaire avec les anciens chemins.
"""

import json
import os
import glob
import re
import hashlib
from collections import defaultdict
from typing import Dict, List, Sequence
import numpy as np
import sys
from datetime import datetime, timezone

# Force UTF-8 encoding for stdout/stderr to handle emojis on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# --- CONFIGURATION ---
DOSSIER_SCRUTINS = "./Scrutins/json"
FICHIER_LEXICAL_INDEX = "./public/data/rag/lexical_index.json"
FICHIER_SEMANTIC_INDEX = "./public/data/rag/semantic_index.json"
FICHIER_SEMANTIC_MULTIVECTOR_INDEX = "./public/data/rag/semantic_multivector_index.json"
FICHIER_LEGACY_SEARCH_INDEX = "./public/data/search_index.json"
FICHIER_RAG_MANIFEST = "./public/data/rag/manifest.json"
INDEX_SCHEMA_VERSION = 2
RAG_MANIFEST_SCHEMA_VERSION = 3
SEMANTIC_INDEX_SCHEMA_VERSION = 2
SEMANTIC_MULTIVECTOR_INDEX_SCHEMA_VERSION = 2
SEMANTIC_BROWSER_MODEL_ID = "Xenova/multilingual-e5-small"
SEMANTIC_PYTHON_MODEL_ID = "intfloat/multilingual-e5-small"
SEMANTIC_MODEL_ID = "multilingual-e5-small"
SEMANTIC_MODEL_FAMILY = "e5"
SEMANTIC_MODEL_USAGE = "asymmetric_retrieval"
SEMANTIC_QUERY_PREFIX = "query: "
SEMANTIC_DOCUMENT_PREFIX = "passage: "
SEMANTIC_MODEL_TASK = "feature-extraction"
SEMANTIC_MODEL_POOLING = "mean"
SEMANTIC_MODEL_NORMALIZE = True
SEMANTIC_MODEL_EXPECTED_DIMENSION = 384
SEMANTIC_MODEL_MAX_LENGTH = 512
SEMANTIC_MODEL_ESTIMATED_DOWNLOAD_MB = 120
SEMANTIC_VECTOR_SCALE = 127
SEMANTIC_MULTI_VECTOR_MODEL_ID = "multilingual-e5-small-multi-vector"
SEMANTIC_MULTI_VECTOR_SLOT_WEIGHTS = {
    "subject_summary": 1.0,
    "title_keywords": 0.94,
}

# Catégories thématiques pour classification
CATEGORIES = {
    "fiscal": ["impôt", "taxe", "budget", "finance", "fiscal", "cotisation", "prélèvement", "TVA", "ISF"],
    "social": ["social", "retraite", "chômage", "allocat", "RSA", "santé", "sécurité sociale", "protection", "solidarité", "handicap"],
    "immigration": ["immigration", "étranger", "migratoire", "asile", "nationalité", "séjour", "frontière", "titre de séjour"],
    "sécurité": ["sécurité", "police", "gendarmerie", "pénal", "criminalité", "délinquance", "prison", "justice", "terrorisme"],
    "environnement": ["environnement", "écologie", "climat", "énergie", "carbone", "nucléaire", "renouvelable", "biodiversité", "pollution"],
    "éducation": ["éducation", "école", "enseignement", "université", "étudiant", "formation", "apprentissage"],
    "logement": ["logement", "immobilier", "locatif", "HLM", "propriétaire", "loyer", "habitat"],
    "travail": ["travail", "emploi", "entreprise", "salaire", "licenciement", "CDI", "CDD", "chômage partiel"],
    "agriculture": ["agriculture", "agricole", "paysan", "fermier", "élevage", "agroalimentaire", "PAC"],
    "défense": ["défense", "armée", "militaire", "guerre", "OTAN", "Ukraine"],
    "outre-mer": ["outre-mer", "Mayotte", "Réunion", "Guadeloupe", "Martinique", "Guyane", "Nouvelle-Calédonie"],
    "santé": ["santé", "hôpital", "médecin", "médicament", "ARS", "soin", "patient", "maladie"],
    "transport": ["transport", "SNCF", "aérien", "routier", "ferroviaire", "mobilité"],
    "numérique": ["numérique", "internet", "données", "cybersécurité", "IA", "intelligence artificielle"],
}

# Synonymes courants pour enrichir l'index
SYNONYMES = {
    "logement": ["immobilier", "habitat", "HLM", "locatif", "propriété"],
    "immigration": ["migratoire", "étranger", "asile", "séjour"],
    "santé": ["médical", "hôpital", "soin", "patient"],
    "budget": ["finance", "fiscal", "dépenses", "recettes"],
    "environnement": ["écologie", "climat", "vert", "durable"],
    "sécurité": ["police", "sûreté", "ordre public"],
    "travail": ["emploi", "salariat", "professionnel"],
    "retraite": ["pension", "vieillesse", "seniors"],
}


def normalize_text(text: str) -> str:
    """Normalise le texte pour la recherche."""
    text = text.lower()
    # Supprimer les caractères spéciaux mais garder les accents
    text = re.sub(r'[^\w\sàâäéèêëïîôùûüçœæ]', ' ', text)
    return text


def clean_label(text: str) -> str:
    """Nettoie un libelle en supprimant les blancs parasites."""
    return re.sub(r'\s+', ' ', str(text or '')).strip()


def strip_stage_suffix(text: str) -> str:
    """Retire les suffixes de stage legislatif de fin de libelle."""
    cleaned = clean_label(text)
    cleaned = re.sub(r'\s*\((?:première|deuxième|nouvelle)\s+lecture[^)]*\)\.?$', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*\(texte[^)]*\)\.?$', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip(' .')


def extract_keywords_from_title(titre: str) -> List[str]:
    """Extrait les mots-clés significatifs d'un titre de scrutin."""
    # Mots à ignorer (stopwords français)
    stopwords = {
        "le", "la", "les", "de", "du", "des", "un", "une", "et", "ou", "à", "au", "aux",
        "en", "pour", "par", "sur", "dans", "ce", "cette", "ces", "son", "sa", "ses",
        "qui", "que", "quoi", "dont", "où", "avec", "sans", "sous", "entre", "vers",
        "chez", "est", "sont", "être", "avoir", "fait", "faire", "après", "avant",
        "article", "premier", "deuxième", "première", "seconde", "lecture", "projet",
        "proposition", "loi", "amendement", "texte", "commission", "mixte", "paritaire",
        "relatif", "relative", "visant", "portant", "modifiant", "application", "alinéa"
    }
    
    normalized = normalize_text(titre)
    words = normalized.split()
    
    # Garder les mots significatifs (> 3 caractères, pas dans stopwords)
    keywords = []
    for word in words:
        if len(word) > 3 and word not in stopwords:
            keywords.append(word)
    
    # Limiter à 10 mots-clés max
    return list(set(keywords))[:10]


def classify_vote(titre: str) -> str:
    """Classifie un vote dans une catégorie thématique."""
    titre_lower = titre.lower()
    
    scores = {}
    for category, terms in CATEGORIES.items():
        score = sum(1 for term in terms if term.lower() in titre_lower)
        if score > 0:
            scores[category] = score
    
    if scores:
        return max(scores, key=scores.get)
    return "autre"


def generate_summary(titre: str, category: str) -> str:
    """Génère un résumé court du vote."""
    # Extraire la partie principale du titre
    # Ex: "l'ensemble de la proposition de loi visant à..." -> "proposition de loi visant à..."
    
    patterns = [
        r"(?:l'ensemble de |l'|la |le |)?(proposition de loi .+?)(?:\(première|\(deuxième|\(texte|$)",
        r"(?:l'|la |le |)?(projet de loi .+?)(?:\(première|\(deuxième|\(texte|$)",
        r"(?:l'|la |le |)?(amendement .+?)(?:\(première|\(deuxième|$)",
        r"(?:l'|la |le |)?(motion .+?)(?:\(|$)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, titre, re.IGNORECASE)
        if match:
            summary = match.group(1).strip()
            if len(summary) > 100:
                summary = summary[:97] + "..."
            return summary
    
    # Fallback: nettoyer et tronquer le titre
    summary = re.sub(r'\([^)]*\)', '', titre).strip()
    if len(summary) > 100:
        summary = summary[:97] + "..."
    return summary


def extract_subject(scrutin: Dict) -> str:
    """Extrait un sujet lisible et plus stable que le titre brut."""
    objet = scrutin.get('objet') or {}
    candidate = (
        objet.get('libelle')
        or scrutin.get('titre')
        or ''
    )
    subject = strip_stage_suffix(candidate)
    return subject or clean_label(scrutin.get('titre', ''))


def build_scrutin_source_url(scrutin: Dict) -> str:
    """Construit l'URL officielle d'un scrutin sur le site de l'Assemblee nationale."""
    legislature = clean_label(scrutin.get('legislature'))
    numero = clean_label(scrutin.get('numero'))

    if not legislature or not numero:
        return ''

    return f"https://www.assemblee-nationale.fr/dyn/{legislature}/scrutins/{numero}"


def is_vote_entry_complete(entry: Dict) -> bool:
    """Indique si une entree existante peut etre conservee telle quelle."""
    if not isinstance(entry, dict):
        return False

    required_keys = ('titre', 'keywords', 'category', 'theme', 'summary', 'subject', 'source_url', 'date', 'sort', 'uid')
    if any(key not in entry for key in required_keys):
        return False

    if not isinstance(entry.get('keywords'), list):
        return False

    return True


def get_synonyms(keywords: List[str]) -> List[str]:
    """Récupère les synonymes pour les mots-clés."""
    all_synonyms = set()
    for kw in keywords:
        for base_word, syns in SYNONYMES.items():
            if base_word in kw or kw in base_word:
                all_synonyms.update(syns)
    return list(all_synonyms)


def load_existing_index() -> Dict:
    """Charge l'index existant en priorisant l'artefact RAG primaire."""
    for path in (FICHIER_LEXICAL_INDEX, FICHIER_LEGACY_SEARCH_INDEX):
        if not os.path.exists(path):
            continue

        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            continue

    return {"votes": {}, "inverted_index": {}, "lastUpdate": ""}


def write_json(path: str, payload: Dict) -> None:
    """Ecrit un JSON UTF-8 avec indentation."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def compute_sha256(path: str) -> str:
    """Calcule le hash SHA256 d'un fichier."""
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def build_semantic_document_text(vote_id: str, entry: Dict) -> str:
    """Assemble un texte de reference pour un encodage semantique par scrutin."""
    parts = [
        entry.get("subject", ""),
        entry.get("summary", ""),
        entry.get("titre", ""),
        entry.get("theme", "") or entry.get("category", ""),
        " ".join(entry.get("keywords", [])[:20]),
        f"scrutin {vote_id}"
    ]
    return "\n".join(part for part in parts if part).strip()


def quantize_normalized_embedding(vector: np.ndarray) -> List[int]:
    """Quantifie un vecteur normalise dans l'intervalle [-127, 127]."""
    clipped = np.clip(vector, -1.0, 1.0)
    return np.rint(clipped * SEMANTIC_VECTOR_SCALE).astype(np.int16).tolist()


def apply_semantic_prefix(text: str, prefix: str) -> str:
    """Ajoute un prefixe de retrieval asymetrique sans le dupliquer."""
    cleaned = clean_label(text)
    normalized_prefix = str(prefix or "").strip()
    if not normalized_prefix:
        return cleaned

    canonical_prefix = normalized_prefix if normalized_prefix.endswith(" ") else f"{normalized_prefix} "
    compact_prefix = canonical_prefix.rstrip()

    if not cleaned:
        return compact_prefix

    lowered_cleaned = cleaned.lower()
    lowered_compact_prefix = compact_prefix.lower()
    if lowered_cleaned.startswith(lowered_compact_prefix):
        suffix = cleaned[len(compact_prefix):].lstrip()
        return f"{canonical_prefix}{suffix}".rstrip() if suffix else compact_prefix

    return f"{canonical_prefix}{cleaned}"


class E5MeanPoolingEncoder:
    """Encodeur E5 explicite via AutoTokenizer + AutoModel + mean pooling + L2."""

    def __init__(self, model_name: str = SEMANTIC_PYTHON_MODEL_ID):
        try:
            import torch
            from transformers import AutoModel, AutoTokenizer
        except ImportError:
            raise RuntimeError("transformers et torch sont requis pour generer les artefacts E5")

        self.torch = torch
        self.model_name = model_name
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        print(f"🧭 Chargement du modele semantique {model_name} ({self.device})...")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name)
        self.model.to(self.device)
        self.model.eval()

    def _average_pool(self, last_hidden_state, attention_mask):
        mask = attention_mask[..., None].bool()
        masked_hidden_state = last_hidden_state.masked_fill(~mask, 0.0)
        token_counts = attention_mask.sum(dim=1, keepdim=True).clamp(min=1)
        return masked_hidden_state.sum(dim=1) / token_counts

    def encode(
        self,
        texts: Sequence[str],
        batch_size: int = 64,
        show_progress_bar: bool = True,
        normalize_embeddings: bool = True,
        convert_to_numpy: bool = True
    ):
        if not texts:
            if convert_to_numpy:
                return np.zeros((0, SEMANTIC_MODEL_EXPECTED_DIMENSION), dtype=np.float32)
            return self.torch.empty((0, SEMANTIC_MODEL_EXPECTED_DIMENSION))

        outputs = []
        total_batches = (len(texts) + batch_size - 1) // batch_size

        with self.torch.no_grad():
            for batch_index, start in enumerate(range(0, len(texts), batch_size), start=1):
                batch_texts = list(texts[start:start + batch_size])
                encoded_inputs = self.tokenizer(
                    batch_texts,
                    max_length=SEMANTIC_MODEL_MAX_LENGTH,
                    padding=True,
                    truncation=True,
                    return_tensors="pt"
                )
                encoded_inputs = {
                    key: value.to(self.device)
                    for key, value in encoded_inputs.items()
                }

                model_output = self.model(**encoded_inputs)
                embeddings = self._average_pool(model_output.last_hidden_state, encoded_inputs["attention_mask"])

                if normalize_embeddings:
                    embeddings = self.torch.nn.functional.normalize(embeddings, p=2, dim=1)

                if convert_to_numpy:
                    outputs.append(embeddings.cpu().numpy())
                else:
                    outputs.append(embeddings.cpu())

                if show_progress_bar:
                    print(f"  Encodage semantique {batch_index}/{total_batches}")

        if convert_to_numpy:
            return np.concatenate(outputs, axis=0)

        return self.torch.cat(outputs, dim=0)


def load_semantic_encoder(model_name: str = SEMANTIC_PYTHON_MODEL_ID):
    """Charge le modele d'encodage semantique dedie."""
    try:
        return E5MeanPoolingEncoder(model_name)
    except Exception as error:
        print(f"⚠️ Modele semantique indisponible ({error}), artefacts semantiques ignores")
        return None


def encode_semantic_texts(model, texts: List[str], prefix: str = SEMANTIC_DOCUMENT_PREFIX) -> np.ndarray:
    """Encode une liste de textes en embeddings normalises."""
    prepared_texts = [apply_semantic_prefix(text, prefix) for text in texts]
    embeddings = model.encode(
        prepared_texts,
        batch_size=64,
        show_progress_bar=True,
        normalize_embeddings=SEMANTIC_MODEL_NORMALIZE,
        convert_to_numpy=True
    )

    if len(embeddings.shape) != 2 or embeddings.shape[0] != len(texts):
        raise RuntimeError("Encodage semantique invalide: dimensions inattendues")

    return embeddings


def build_multivector_sections(vote_id: str, entry: Dict) -> List[Dict]:
    """Construit une representation multi-vector legere par sections de scrutin."""
    theme_label = entry.get("theme", "") or entry.get("category", "")
    keywords = " ".join(entry.get("keywords", [])[:20])

    return [
        {
            "slot": "subject_summary",
            "text": "\n".join(part for part in [
                entry.get("subject", ""),
                entry.get("summary", ""),
                theme_label,
                f"scrutin {vote_id}"
            ] if part).strip()
        },
        {
            "slot": "title_keywords",
            "text": "\n".join(part for part in [
                entry.get("titre", ""),
                keywords,
                theme_label,
                f"scrutin {vote_id}"
            ] if part).strip()
        }
    ]


def build_semantic_model_descriptor(model_id: str, python_model_id: str, dimension: int, strategy: str) -> Dict:
    """Construit le descripteur de modele semantique publie dans les artefacts."""
    descriptor = {
        "id": model_id,
        "family": SEMANTIC_MODEL_FAMILY,
        "usage": SEMANTIC_MODEL_USAGE,
        "python_model_id": python_model_id,
        "browser_model_id": SEMANTIC_BROWSER_MODEL_ID,
        "pythonModelId": python_model_id,
        "browserModelId": SEMANTIC_BROWSER_MODEL_ID,
        "task": SEMANTIC_MODEL_TASK,
        "queryPrefix": SEMANTIC_QUERY_PREFIX,
        "documentPrefix": SEMANTIC_DOCUMENT_PREFIX,
        "query_prefix": SEMANTIC_QUERY_PREFIX,
        "document_prefix": SEMANTIC_DOCUMENT_PREFIX,
        "pooling": SEMANTIC_MODEL_POOLING,
        "normalize": SEMANTIC_MODEL_NORMALIZE,
        "dimension": int(dimension),
        "estimated_download_mb": SEMANTIC_MODEL_ESTIMATED_DOWNLOAD_MB,
        "estimatedDownloadMb": SEMANTIC_MODEL_ESTIMATED_DOWNLOAD_MB,
        "vector_scale": SEMANTIC_VECTOR_SCALE,
        "vectorScale": SEMANTIC_VECTOR_SCALE,
        "strategy": strategy
    }

    if strategy == "multi_vector_sections":
        descriptor["slot_weights"] = SEMANTIC_MULTI_VECTOR_SLOT_WEIGHTS
        descriptor["slotWeights"] = SEMANTIC_MULTI_VECTOR_SLOT_WEIGHTS
        descriptor["aggregation"] = "max"

    return descriptor


def build_manifest_model_payload(model_payload: Dict | None, default_model_id: str, notes: str) -> Dict:
    """Construit la projection publique du modele semantique pour le manifest."""
    payload = model_payload or {}
    return {
        "id": payload.get("id", default_model_id),
        "family": payload.get("family", SEMANTIC_MODEL_FAMILY),
        "usage": payload.get("usage", SEMANTIC_MODEL_USAGE),
        "pythonModelId": payload.get("pythonModelId") or payload.get("python_model_id", SEMANTIC_PYTHON_MODEL_ID),
        "browserModelId": payload.get("browserModelId") or payload.get("browser_model_id", SEMANTIC_BROWSER_MODEL_ID),
        "task": payload.get("task", SEMANTIC_MODEL_TASK),
        "queryPrefix": payload.get("queryPrefix") or payload.get("query_prefix", SEMANTIC_QUERY_PREFIX),
        "documentPrefix": payload.get("documentPrefix") or payload.get("document_prefix", SEMANTIC_DOCUMENT_PREFIX),
        "pooling": payload.get("pooling", SEMANTIC_MODEL_POOLING),
        "normalize": payload.get("normalize", SEMANTIC_MODEL_NORMALIZE),
        "dimension": int(payload.get("dimension", SEMANTIC_MODEL_EXPECTED_DIMENSION)),
        "estimatedDownloadMb": payload.get("estimatedDownloadMb") or payload.get("estimated_download_mb", SEMANTIC_MODEL_ESTIMATED_DOWNLOAD_MB),
        "notes": notes
    }


def generate_semantic_index(index: Dict, model=None, model_name: str = SEMANTIC_PYTHON_MODEL_ID) -> Dict | None:
    """Genere un artefact single-vector quantifie pour le reranking local."""
    encoder = model or load_semantic_encoder(model_name)
    if encoder is None:
        return None

    vote_items = sorted(
        index.get("votes", {}).items(),
        key=lambda item: int(item[0]) if str(item[0]).isdigit() else str(item[0])
    )

    if not vote_items:
        return None

    texts = [build_semantic_document_text(vote_id, entry) for vote_id, entry in vote_items]
    embeddings = encode_semantic_texts(encoder, texts)

    votes = {}
    for (vote_id, _entry), vector in zip(vote_items, embeddings):
        votes[vote_id] = {
            "embedding": quantize_normalized_embedding(vector)
        }

    return {
        "schemaVersion": SEMANTIC_INDEX_SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "model": build_semantic_model_descriptor(SEMANTIC_MODEL_ID, model_name, int(embeddings.shape[1]), "single_vector"),
        "votes": votes
    }


def generate_semantic_multivector_index(index: Dict, model=None, model_name: str = SEMANTIC_PYTHON_MODEL_ID) -> Dict | None:
    """Genere un artefact multi-vector leger par sections de scrutin."""
    encoder = model or load_semantic_encoder(model_name)
    if encoder is None:
        return None

    vote_items = sorted(
        index.get("votes", {}).items(),
        key=lambda item: int(item[0]) if str(item[0]).isdigit() else str(item[0])
    )

    if not vote_items:
        return None

    section_mappings = []
    texts = []

    for vote_id, entry in vote_items:
        for section in build_multivector_sections(vote_id, entry):
            if not section.get("text"):
                continue
            section_mappings.append({
                "vote_id": vote_id,
                "slot": section["slot"]
            })
            texts.append(section["text"])

    if not texts:
        return None

    embeddings = encode_semantic_texts(encoder, texts)
    votes = defaultdict(lambda: {"vectors": []})

    for mapping, vector in zip(section_mappings, embeddings):
        votes[mapping["vote_id"]]["vectors"].append({
            "slot": mapping["slot"],
            "embedding": quantize_normalized_embedding(vector)
        })

    return {
        "schemaVersion": SEMANTIC_MULTIVECTOR_INDEX_SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "model": {
            **build_semantic_model_descriptor(
                SEMANTIC_MULTI_VECTOR_MODEL_ID,
                model_name,
                int(embeddings.shape[1]),
                "multi_vector_sections"
            ),
            "vector_count_per_document": len(SEMANTIC_MULTI_VECTOR_SLOT_WEIGHTS)
        },
        "votes": dict(votes)
    }


def build_rag_manifest(index: Dict) -> Dict:
    """Construit le manifest RAG public."""
    lexical_size = os.path.getsize(FICHIER_LEXICAL_INDEX) if os.path.exists(FICHIER_LEXICAL_INDEX) else 0
    lexical_sha256 = compute_sha256(FICHIER_LEXICAL_INDEX) if os.path.exists(FICHIER_LEXICAL_INDEX) else ""
    semantic_size = os.path.getsize(FICHIER_SEMANTIC_INDEX) if os.path.exists(FICHIER_SEMANTIC_INDEX) else 0
    semantic_sha256 = compute_sha256(FICHIER_SEMANTIC_INDEX) if os.path.exists(FICHIER_SEMANTIC_INDEX) else ""
    semantic_multivector_size = os.path.getsize(FICHIER_SEMANTIC_MULTIVECTOR_INDEX) if os.path.exists(FICHIER_SEMANTIC_MULTIVECTOR_INDEX) else 0
    semantic_multivector_sha256 = compute_sha256(FICHIER_SEMANTIC_MULTIVECTOR_INDEX) if os.path.exists(FICHIER_SEMANTIC_MULTIVECTOR_INDEX) else ""

    semantic_payload = None
    if os.path.exists(FICHIER_SEMANTIC_INDEX):
        try:
            with open(FICHIER_SEMANTIC_INDEX, 'r', encoding='utf-8') as f:
                semantic_payload = json.load(f)
        except Exception:
            semantic_payload = None

    semantic_multivector_payload = None
    if os.path.exists(FICHIER_SEMANTIC_MULTIVECTOR_INDEX):
        try:
            with open(FICHIER_SEMANTIC_MULTIVECTOR_INDEX, 'r', encoding='utf-8') as f:
                semantic_multivector_payload = json.load(f)
        except Exception:
            semantic_multivector_payload = None

    semantic_artifact = None
    if semantic_payload:
        semantic_artifact = {
            "path": "semantic_index.json",
            "bytes": semantic_size,
            "sha256": semantic_sha256,
            "quantization": "int8",
            "vectorDimension": semantic_payload.get("model", {}).get("dimension"),
            "valueScale": semantic_payload.get("model", {}).get("vector_scale", SEMANTIC_VECTOR_SCALE)
        }

    semantic_multivector_artifact = None
    if semantic_multivector_payload:
        semantic_multivector_artifact = {
            "path": "semantic_multivector_index.json",
            "bytes": semantic_multivector_size,
            "sha256": semantic_multivector_sha256,
            "quantization": "int8",
            "vectorDimension": semantic_multivector_payload.get("model", {}).get("dimension"),
            "valueScale": semantic_multivector_payload.get("model", {}).get("vector_scale", SEMANTIC_VECTOR_SCALE),
            "vectorsPerDocument": semantic_multivector_payload.get("model", {}).get("vector_count_per_document")
        }

    single_vector_mode = None
    if semantic_payload and semantic_artifact:
        single_vector_mode = {
            "id": "single_vector",
            "label": "Single-vector",
            "strategy": semantic_payload.get("model", {}).get("strategy", "single_vector"),
            "default": True,
            "experimental": False,
            "notes": "Voie stable par defaut. Un vecteur dense par scrutin avec encodeur E5 multilingue dedie.",
            "model": build_manifest_model_payload(
                semantic_payload.get("model"),
                SEMANTIC_MODEL_ID,
                "Mode stable dedie au reranking local avec retrieval asymetrique query/passage."
            ),
            "artifact": semantic_artifact
        }

    multi_vector_mode = None
    if semantic_multivector_payload and semantic_multivector_artifact:
        multi_vector_mode = {
            "id": "multi_vector",
            "label": "Multi-vector",
            "strategy": semantic_multivector_payload.get("model", {}).get("strategy", "multi_vector_sections"),
            "default": False,
            "experimental": True,
            "notes": "Mode avance experimental. Plusieurs vecteurs par scrutin avec le meme encodeur E5 multilingue dedie.",
            "model": build_manifest_model_payload(
                semantic_multivector_payload.get("model"),
                SEMANTIC_MULTI_VECTOR_MODEL_ID,
                "Mode experimental multi-vector par sections de scrutin avec retrieval asymetrique query/passage."
            ),
            "artifact": semantic_multivector_artifact
        }

    return {
        "schemaVersion": RAG_MANIFEST_SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "documentType": "scrutin",
        "stats": {
            "totalDocuments": index.get("stats", {}).get("totalVotes", 0),
            "totalKeywords": index.get("stats", {}).get("totalKeywords", 0)
        },
        "embeddingModel": build_manifest_model_payload(
            semantic_payload.get("model") if semantic_payload else None,
            SEMANTIC_MODEL_ID,
            "Voie stable par defaut pour le reranking semantique local opt-in."
        ),
        "semanticModes": {
            "single_vector": single_vector_mode,
            "multi_vector": multi_vector_mode
        },
        "artifacts": {
            "lexicalIndex": {
                "path": "lexical_index.json",
                "bytes": lexical_size,
                "sha256": lexical_sha256
            },
            "semanticIndex": semantic_artifact,
            "semanticMultivectorIndex": semantic_multivector_artifact
        }
    }


def process_scrutins_with_bge(use_bge: bool = True) -> Dict:
    """Traite tous les scrutins et génère l'index."""
    print("🔍 Analyse des scrutins...")
    
    # Charger l'index existant
    existing_index = load_existing_index()
    existing_votes = existing_index.get("votes", {})
    
    votes = {}
    inverted_index = defaultdict(set)
    
    # Copier les votes existants
    votes = existing_index.get("votes", {})
    for numero, data in votes.items():
        if not is_vote_entry_complete(data):
            continue

        for kw in data.get("keywords", []):
            inverted_index[kw].add(numero)
    
    # Trouver les fichiers de scrutins
    fichiers_scrutins = glob.glob(os.path.join(DOSSIER_SCRUTINS, "VTAN*.json"))
    fichiers_scrutins.sort()
    
    print(f"📁 {len(fichiers_scrutins)} fichiers de scrutins trouvés")
    
    # Optionnel: charger BGE-M3 pour enrichissement sémantique
    embedder = None
    if use_bge:
        try:
            from FlagEmbedding import BGEM3FlagModel
            print("🧠 Chargement de BGE-M3...")
            embedder = BGEM3FlagModel('BAAI/bge-m3', use_fp16=True)
            print("✅ BGE-M3 chargé")
        except ImportError:
            print("⚠️ FlagEmbedding non installé, utilisation du mode basique")
            embedder = None
        except Exception as e:
            print(f"⚠️ Erreur chargement BGE-M3: {e}")
            embedder = None
    
    candidate_terms = []
    candidate_embeddings = None

    if embedder:
        print("🧠 Préparation des candidats sémantiques...")
        candidates_set = set()
        # Collecter les termes de catégories
        for cat, terms in CATEGORIES.items():
            candidates_set.add(cat)
            candidates_set.update(terms)
        # Collecter les synonymes
        for term, syns in SYNONYMES.items():
            candidates_set.add(term)
            candidates_set.update(syns)
        
        candidate_terms = list(candidates_set)
        
        try:
            # Encodage en batch de tous les candidats
            output = embedder.encode(candidate_terms)
            candidate_embeddings = output['dense_vecs']
            print(f"✅ {len(candidate_terms)} termes candidats vectorisés")
        except Exception as e:
            print(f"⚠️ Erreur vectorisation candidats: {e}")
            embedder = None

    new_count = 0
    for i, chemin in enumerate(fichiers_scrutins):
        if (i + 1) % 500 == 0:
            print(f"  Traitement... {i+1}/{len(fichiers_scrutins)}")
        
        try:
            with open(chemin, 'r', encoding='utf-8') as f:
                data = json.load(f)
                scrutin = data.get('scrutin', {})
        except:
            continue
        
        numero = str(scrutin.get('numero', ''))
        if not numero:
            continue
        
        # Skip si déjà indexé
        existing_entry = existing_votes.get(numero)
        if is_vote_entry_complete(existing_entry):
            continue
        
        titre = scrutin.get('titre', '')
        date = scrutin.get('dateScrutin', '')
        sort = scrutin.get('sort', {}).get('code', '')
        uid = scrutin.get('uid', '')
        subject = extract_subject(scrutin)
        source_url = build_scrutin_source_url(scrutin)
        
        # Extraction des mots-clés
        keywords = extract_keywords_from_title(titre)
        
        # Classification
        category = classify_vote(titre)
        
        # Résumé
        summary = generate_summary(titre, category)
        
        # Synonymes
        synonyms = get_synonyms(keywords)
        
        # Enrichissement BGE-M3 (si disponible)
        if embedder is not None and candidate_embeddings is not None:
            try:
                # Encodage du titre
                output = embedder.encode([titre])
                titre_vec = output['dense_vecs'][0]
                
                # Similarité Cosine (produit scalaire si normalisé, ici simple dot product)
                # Note: BGE-M3 dense vecs ne sont pas toujours normalisés, mais pour ranking ça suffit
                scores = np.dot(candidate_embeddings, titre_vec)
                
                # Prendre les 3 meilleurs
                top_k_indices = np.argsort(scores)[-3:][::-1]
                
                for idx in top_k_indices:
                    score = scores[idx]
                    term = candidate_terms[idx]
                    
                    # Seuil arbitraire de pertinence (à ajuster)
                    if score > 0.4:
                        # Éviter les doublons
                        if term not in keywords and term not in synonyms:
                            synonyms.append(term)
            except Exception as e:
                # En cas d'erreur ponctuelle, on continue sans planter
                pass
        
        # Ajouter au dictionnaire
        votes[numero] = {
            "uid": uid,
            "titre": titre,
            "keywords": keywords + synonyms,
            "category": category,
            "theme": category,
            "summary": summary,
            "subject": subject,
            "source_url": source_url,
            "date": date,
            "sort": sort
        }
        
        # Index inversé
        for kw in keywords + synonyms:
            inverted_index[kw.lower()].add(numero)
        
        new_count += 1
    
    print(f"✅ {new_count} nouveaux scrutins indexés")
    print(f"📊 Total: {len(votes)} scrutins dans l'index")
    
    # Convertir les sets en listes pour JSON
    inverted_index_json = {k: list(v) for k, v in inverted_index.items()}
    
    return {
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "votes": votes,
        "inverted_index": inverted_index_json,
        "lastUpdate": __import__('datetime').datetime.now().isoformat()[:10],
        "stats": {
            "totalVotes": len(votes),
            "totalKeywords": len(inverted_index_json)
        }
    }


def main():
    """Point d'entrée principal."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Genere les artefacts RAG publics")
    parser.add_argument('--no-bge', action='store_true', help="Désactiver BGE-M3")
    parser.add_argument('--no-semantic', action='store_true', help="Desactiver l'artefact semantique")
    parser.add_argument('--test', action='store_true', help="Mode test (10 scrutins)")
    parser.add_argument(
        '--no-legacy-mirror',
        action='store_true',
        help="Ne pas ecrire le miroir legacy public/data/search_index.json"
    )
    args = parser.parse_args()
    
    # Vérifier que le dossier existe
    if not os.path.exists(DOSSIER_SCRUTINS):
        print(f"❌ Dossier {DOSSIER_SCRUTINS} introuvable")
        print("   Exécutez d'abord le téléchargement des scrutins")
        return
    
    # Générer l'index
    index = process_scrutins_with_bge(use_bge=not args.no_bge)

    semantic_index = None
    semantic_multivector_index = None
    if args.no_semantic:
        print("ℹ️ Artefact semantique desactive pour cette execution")
    else:
        semantic_encoder = load_semantic_encoder()
        if semantic_encoder is None:
            raise RuntimeError("Impossible de charger l encodeur semantique multilingual-e5-small")

        semantic_index = generate_semantic_index(index, model=semantic_encoder)
        semantic_multivector_index = generate_semantic_multivector_index(index, model=semantic_encoder)
        if semantic_index is None or semantic_multivector_index is None:
            raise RuntimeError("Generation incomplete des artefacts semantiques E5")

        if semantic_index:
            write_json(FICHIER_SEMANTIC_INDEX, semantic_index)
            print(f"💾 Index semantique RAG sauvegarde dans {FICHIER_SEMANTIC_INDEX}")
        if semantic_multivector_index:
            write_json(FICHIER_SEMANTIC_MULTIVECTOR_INDEX, semantic_multivector_index)
            print(f"💾 Index semantique multi-vector sauvegarde dans {FICHIER_SEMANTIC_MULTIVECTOR_INDEX}")

    # Sauvegarder l'artefact RAG primaire puis le manifest public.
    write_json(FICHIER_LEXICAL_INDEX, index)
    write_json(FICHIER_RAG_MANIFEST, build_rag_manifest(index))

    print(f"💾 Index lexical RAG sauvegarde dans {FICHIER_LEXICAL_INDEX}")
    print(f"💾 Manifest RAG sauvegarde dans {FICHIER_RAG_MANIFEST}")

    if args.no_legacy_mirror:
        print("ℹ️ Miroir legacy public/data/search_index.json desactive pour cette execution")
    else:
        write_json(FICHIER_LEGACY_SEARCH_INDEX, index)
        print(f"💾 Miroir legacy sauvegarde dans {FICHIER_LEGACY_SEARCH_INDEX}")

    # Stats
    lexical_size_kb = os.path.getsize(FICHIER_LEXICAL_INDEX) / 1024
    print(f"📏 Taille index lexical RAG: {lexical_size_kb:.1f} Ko")

    if semantic_index and os.path.exists(FICHIER_SEMANTIC_INDEX):
        semantic_size_kb = os.path.getsize(FICHIER_SEMANTIC_INDEX) / 1024
        print(f"📏 Taille index semantique RAG: {semantic_size_kb:.1f} Ko")

    if semantic_multivector_index and os.path.exists(FICHIER_SEMANTIC_MULTIVECTOR_INDEX):
        semantic_multivector_size_kb = os.path.getsize(FICHIER_SEMANTIC_MULTIVECTOR_INDEX) / 1024
        print(f"📏 Taille index semantique multi-vector: {semantic_multivector_size_kb:.1f} Ko")

    if os.path.exists(FICHIER_LEGACY_SEARCH_INDEX):
        legacy_size_kb = os.path.getsize(FICHIER_LEGACY_SEARCH_INDEX) / 1024
        print(f"📏 Taille miroir legacy: {legacy_size_kb:.1f} Ko")


if __name__ == "__main__":
    main()
