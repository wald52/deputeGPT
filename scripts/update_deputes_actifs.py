import json
import hashlib
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

# Force UTF-8 encoding for stdout/stderr to handle emojis on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

RESOURCE_ID = "092bd7bb-1543-405b-b53c-932ebb49bb8e"
BASE = f"https://tabular-api.data.gouv.fr/api/resources/{RESOURCE_ID}/data/"
OUT_DIR = "public/data/deputes_actifs"
BOOT_FILENAME_PREFIX = "boot-"
BOOT_FIELDS = (
    "id",
    "prenom",
    "nom",
    "groupe",
    "groupeNom",
    "groupeAbrev",
    "departementNom",
    "circo",
    "circonscription",
    "dateMaj",
)

# --- TABLE DE CORRESPONDANCE DES COULEURS (OFFICIEL/STABLE) ---
# Sert pour la légende et les cartes. L'hémicycle, lui, utilise ses propres couleurs par siège.
COULEURS_OFFICIELLES = {
    # Gauche
    "GDR": "#dd0000",   # Gauche Démocrate et Républicaine
    "LFI": "#cc2443", "LFI-NFP": "#cc2443", # La France Insoumise
    "SOC": "#ff8080",   # Socialistes
    "ECOS": "#77AA79", "ECO": "#77AA79", "EcoS": "#77AA79",    # Écologiste et Social (Vert)
    
    # Centre / Majorité
    "LIOT": "#e1a5e1",  # Libertés, Indépendants... (Violet)
    "DEM": "#ff9900",   # Les Démocrates (Orange)
    "EPR": "#ffeb00", "ENS": "#ffeb00", "RE": "#ffeb00", "Ensemble": "#ffeb00", # Ensemble pour la République (Jaune)
    "HOR": "#0001b8",   # Horizons & Indépendants (Bleu marine)

    # Droite
    "DR": "#0066cc", "LR": "#0066cc", # Droite Républicaine (Bleu)
    "UDDPLR": "#8D949A", "UDR": "#8D949A", "UED": "#8D949A", # Union des droites pour la République (Gris foncé)

    # Extrême Droite
    "RN": "#0d378a",    # Rassemblement National (Bleu très foncé)

    # Autres
    "NI": "#dddddd"     # Non Inscrits (Gris clair)
}

def fetch_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "deputeGPT-bot/1.0 (+https://github.com/wald52/deputeGPT)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTPError {e.code} {e.reason} on URL: {url}")
        print("Body truncated:", body[:500])
        raise

def canonical_bytes(rows) -> bytes:
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")

def read_latest_metadata(latest_path: str) -> dict:
    if not os.path.exists(latest_path):
        return {}
    try:
        with open(latest_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
            return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}

def format_circonscription(departement_nom, circo):
    if not departement_nom:
        return ""
    if circo in (None, ""):
        return departement_nom

    try:
        circo_num = int(circo)
        suffix = "1re" if circo_num == 1 else f"{circo_num}e"
        return f"{departement_nom} ({suffix} circonscription)"
    except (TypeError, ValueError):
        return f"{departement_nom} ({circo})"

def build_boot_rows(rows):
    boot_rows = []
    for row in rows:
        boot_row = {field: row.get(field) for field in BOOT_FIELDS if field not in {"groupeNom", "circonscription"}}
        boot_row["groupeNom"] = row.get("groupe")
        boot_row["circonscription"] = format_circonscription(row.get("departementNom"), row.get("circo"))
        boot_rows.append(boot_row)
    return boot_rows

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    latest_path = os.path.join(OUT_DIR, "latest.json")

    # 1) Récupération paginée
    url = BASE
    all_rows = []
    print("Début du téléchargement des données députés...")
    
    while url:
        print(f"GET: {url}")
        payload = fetch_json(url)
        all_rows.extend(payload.get("data", []))
        
        links = payload.get("links") or payload.get("link") or {}
        url = links.get("next")

    print(f"✅ {len(all_rows)} députés récupérés.")

    # 2) GÉNÉRATION AUTOMATIQUE DU FICHIER GROUPES (groupes.json)
    # C'est ici qu'on associe les couleurs pour la légende
    print("Génération du fichier groupes.json...")
    groupes_map = {}
    
    for d in all_rows:
        code = d.get('groupeAbrev')
        nom_complet = d.get('groupe')
        
        if code:
            if code not in groupes_map:
                # Recherche de la couleur (Directe ou par synonyme)
                color = COULEURS_OFFICIELLES.get(code, "#bdc3c7") # Gris si inconnu
                
                groupes_map[code] = {
                    "code": code,
                    "nom": nom_complet,
                    "seats": 0,
                    "couleur": color
                }
            groupes_map[code]["seats"] += 1

    # Conversion en liste et tri par nombre de sièges (décroissant)
    groupes_list = list(groupes_map.values())
    groupes_list.sort(key=lambda x: x['seats'], reverse=True)

    # Sauvegarde groupes.json
    groupes_path = os.path.join(OUT_DIR, "groupes.json")
    with open(groupes_path, 'w', encoding='utf-8') as f:
        json.dump(groupes_list, f, indent=2, ensure_ascii=False)
    print(f"✅ groupes.json généré avec {len(groupes_list)} groupes.")

    # 3) Hash + Versioning des députés (Logique existante)
    blob = canonical_bytes(all_rows)
    sha256 = hashlib.sha256(blob).hexdigest()
    latest_meta = read_latest_metadata(latest_path)
    prev_sha256 = latest_meta.get("sha256")

    boot_rows = build_boot_rows(all_rows)
    boot_blob = canonical_bytes(boot_rows)
    boot_sha256 = hashlib.sha256(boot_blob).hexdigest()

    current_utc = datetime.now(timezone.utc)
    should_write_full = prev_sha256 != sha256 or not latest_meta.get("version")
    version = latest_meta.get("version") if not should_write_full else "v" + current_utc.strftime("%Y-%m-%d")
    out_path = os.path.join(OUT_DIR, f"{version}.json")
    boot_filename = f"{BOOT_FILENAME_PREFIX}{version}.json"
    boot_path = os.path.join(OUT_DIR, boot_filename)

    if should_write_full or not os.path.exists(out_path):
        tmp = out_path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(blob)
        os.replace(tmp, out_path)
    else:
        print("Aucun changement détecté sur le fichier détaillé (sha256 identique).")

    tmp_boot = boot_path + ".tmp"
    with open(tmp_boot, "wb") as f:
        f.write(boot_blob)
    os.replace(tmp_boot, boot_path)

    tmp_latest = latest_path + ".tmp"
    with open(tmp_latest, "w", encoding="utf-8") as f:
        json.dump(
            {
                "version": version,
                "generated_at": current_utc.isoformat(),
                "sha256": sha256,
                "detail_path": f"{version}.json",
                "boot_path": boot_filename,
                "boot_sha256": boot_sha256,
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    os.replace(tmp_latest, latest_path)

    print(f"✅ Mise à jour terminée : {out_path} (SHA: {sha256})")
    print(f"✅ Artefact boot généré : {boot_path} (SHA: {boot_sha256})")
    return 0

if __name__ == "__main__":
    sys.exit(main())
