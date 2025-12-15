import json, hashlib, os, sys, urllib.request
from datetime import datetime, timezone
import urllib.error

RESOURCE_ID = "092bd7bb-1543-405b-b53c-932ebb49bb8e"
BASE = f"https://tabular-api.data.gouv.fr/api/resources/{RESOURCE_ID}/data/"
OUT_DIR = "public/data/deputes_actifs"

# Définition des couleurs connues (Table de correspondance)
def load_official_colors():
    """Charge les couleurs depuis le fichier généré par le scraping Wiki"""
    path = "public/data/couleurs_groupes.json"
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                colors = json.load(f)
                # On peut garder quelques valeurs par défaut de sécurité ici si on veut
                # au cas où le scraping wiki échoue ou est incomplet
                defaults = {"NI": "#dddddd", "DIV": "#dddddd"}
                defaults.update(colors)
                return defaults
        except Exception as e:
            print(f"⚠️ Erreur lecture couleurs: {e}")
    
    print("⚠️ Fichier couleurs introuvable, usage d'un set minimal.")
    return {
        "GDR": "#dd0000", "LFI": "#cc2443", "SOC": "#ff8080", 
        "ECO": "#00c000", "EPR": "#ffeb00", "RN": "#0d378a", "DR": "#0066cc"
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
        print("Body (first 1000 chars):", body[:1000])
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

    COULEURS_OFFICIELLES = load_official_colors()
    print(f"Couleurs chargées : {len(COULEURS_OFFICIELLES)} nuances disponibles.")
    
    latest_path = os.path.join(OUT_DIR, "latest.json")

    # 1) Récupération paginée des députés
    url = BASE
    all_rows = []
    while url:
        print("GET:", url)
        payload = fetch_json(url)
        all_rows.extend(payload.get("data", []))
        
        links = payload.get("links") or payload.get("link") or {}
        url = links.get("next")

    # --- AJOUT: GÉNÉRATION DU FICHIER GROUPES.JSON ---
    # On profite d'avoir la liste à jour pour extraire les groupes
    print("Génération du fichier groupes.json...")
    groupes_map = {}
    
    for d in all_rows:
        code = d.get('groupeAbrev')
        nom_complet = d.get('groupe')
        
        if code: # Sécurité si code vide
            if code not in groupes_map:
                groupes_map[code] = {
                    "code": code,
                    "nom": nom_complet,
                    "seats": 0,
                    "couleur": COULEURS_OFFICIELLES.get(code, "#bdc3c7") # Couleur ou Gris par défaut
                }
            groupes_map[code]["seats"] += 1

    # Transformation en liste et tri par nombre de sièges (décroissant)
    groupes_list = list(groupes_map.values())
    groupes_list.sort(key=lambda x: x['seats'], reverse=True)

    # Sauvegarde du fichier groupes.json TOUJOURS (même si hash députés identique, c'est pas grave)
    groupes_path = os.path.join(OUT_DIR, "groupes.json")
    with open(groupes_path, 'w', encoding='utf-8') as f:
        json.dump(groupes_list, f, indent=2, ensure_ascii=False)
    print(f"✅ Groupes sauvegardés : {len(groupes_list)} groupes trouvés.")
    # --------------------------------------------------

    # 2) Hash + comparaison avec latest (Logique existante pour les députés)
    blob = canonical_bytes(all_rows)
    sha256 = hashlib.sha256(blob).hexdigest()
    prev_sha256 = read_latest_sha256(latest_path)

    if prev_sha256 == sha256:
        print("No change detected on deputes list (sha256 identical).")
        return 0

    # 3) Écriture nouvelle version députés
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

    print(f"Updated Deputes: {out_path} rows={len(all_rows)} sha256={sha256}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
