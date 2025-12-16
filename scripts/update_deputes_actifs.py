import json
import hashlib
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

RESOURCE_ID = "092bd7bb-1543-405b-b53c-932ebb49bb8e"
BASE = f"https://tabular-api.data.gouv.fr/api/resources/{RESOURCE_ID}/data/"
OUT_DIR = "public/data/deputes_actifs"

# --- TABLE DE CORRESPONDANCE DES COULEURS (OFFICIEL/STABLE) ---
# Sert pour la légende et les cartes. L'hémicycle, lui, utilise ses propres couleurs par siège.
COULEURS_OFFICIELLES = {
    # Gauche
    "GDR": "#dd0000",   # Gauche Démocrate et Républicaine
    "LFI": "#cc2443", "LFI-NFP": "#cc2443", # La France Insoumise
    "SOC": "#ff8080",   # Socialistes
    "ECO": "#00c000", "EcoS": "#00c000",    # Ecologistes
    
    # Centre / Majorité
    "LIOT": "#e1a5e1",  # Libertés, Indépendants... (Violet)
    "DEM": "#ff9900",   # MoDem (Orange)
    "EPR": "#ffeb00", "ENS": "#ffeb00", "RE": "#ffeb00", "Ensemble": "#ffeb00", # Renaissance (Jaune)
    "HOR": "#0001b8",   # Horizons (Bleu marine)

    # Droite
    "DR": "#0066cc", "LR": "#0066cc", # Droite Républicaine (Bleu)
    "UDR": "#162561", "UED": "#162561", # Union des Droites (Bleu foncé)

    # Extrême Droite
    "RN": "#0d378a",    # Rassemblement National

    # Autres
    "NI": "#dddddd"     # Non Inscrits (Gris)
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

def read_latest_sha256(latest_path: str) -> str | None:
    if not os.path.exists(latest_path):
        return None
    try:
        with open(latest_path, "r", encoding="utf-8") as f:
            return json.load(f).get("sha256")
    except Exception:
        return None

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
    prev_sha256 = read_latest_sha256(latest_path)

    if prev_sha256 == sha256:
        print("Aucun changement détecté (sha256 identique).")
        # On ne quitte pas forcément ici si on veut forcer la regénération de groupes.json
        # mais pour le versioning des députés, on s'arrête.
        return 0

    # Écriture nouvelle version
    version = "v" + datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_path = os.path.join(OUT_DIR, f"{version}.json")

    tmp = out_path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(blob)
    os.replace(tmp, out_path)

    tmp_latest = latest_path + ".tmp"
    with open(tmp_latest, "w", encoding="utf-8") as f:
        json.dump(
            {"version": version, "generated_at": datetime.now(timezone.utc).isoformat(), "sha256": sha256},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    os.replace(tmp_latest, latest_path)

    print(f"✅ Mise à jour terminée : {out_path} (SHA: {sha256})")
    return 0

if __name__ == "__main__":
    sys.exit(main())
