import requests
import re
import html
import json
import os
import sys

# Force UTF-8 encoding for stdout/stderr to handle emojis on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 1. Configuration
URL_PAGE = "https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle"
OUTPUT_FILE = "public/data/place_mapping/places_mapping.json"

print(f"Téléchargement de la page {URL_PAGE}...")

try:
    # 2. Récupération de la page en ligne
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    response = requests.get(URL_PAGE, headers=headers)
    response.raise_for_status()
    content = response.text

    # 3. Extraction (Même logique que le test local)
    print("Analyse du contenu...")
    content_decoded = html.unescape(content)
    
    # Regex : cherche "123":{..."tooltipUrl":".../PA123456"}
    pattern = re.compile(r'"(\d+)":\{[^}]*acteur-presentation\\/([^"]+)"\}')
    matches = pattern.findall(content_decoded)
    
    if not matches:
        print("⚠️ AUCUNE correspondance trouvée ! La structure du site a peut-être changé.")
        exit(1) # Force l'erreur pour voir le log dans Github Actions

    mapping = {}
    for seat_num, depute_id in matches:
        mapping[depute_id] = seat_num

    print(f"✅ Trouvé {len(mapping)} correspondances siège <-> député.")

    # 4. Sauvegarde dans le dossier public/data
    # On s'assure que le dossier existe
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=2)

    print(f"Fichier sauvegardé : {OUTPUT_FILE}")

except Exception as e:
    print(f"❌ Erreur critique : {e}")
    exit(1)
