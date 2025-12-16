import requests
from bs4 import BeautifulSoup
import json
import re
import os

URL_WIKI = "https://fr.wikipedia.org/wiki/Mod%C3%A8le:Infobox_Parti_politique_fran%C3%A7ais/couleurs/Documentation"
OUTPUT_FILE = "public/data/couleurs_groupes.json"

def clean_text(text):
    if not text: return ""
    return text.strip()

def extract_colors():
    print(f"Téléchargement de {URL_WIKI}...")
    
    # Headers pour éviter l'erreur 403
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    }

    try:
        response = requests.get(URL_WIKI, headers=headers, timeout=15)
        response.raise_for_status()
    except Exception as e:
        print(f"❌ Erreur téléchargement: {e}")
        return {}

    soup = BeautifulSoup(response.content, 'html.parser')
    colors_map = {}
    
    tables = soup.find_all("table", class_="wikitable")
    print(f"Analyse de {len(tables)} tableaux...")
    
    # Fonction locale pour ajouter les clés
    def add_keys(text_input, hex_value):
        # Nettoyage des séparateurs (point médian, puce, slash...)
        t = text_input.replace('\u00B7', ',').replace('\u2022', ',').replace('·', ',').replace('/', ',')
        parts = t.split(',')
        for p in parts:
            clean = p.strip()
            # On ignore les textes trop longs ou vides
            if clean and len(clean) < 20: 
                if clean not in colors_map: # Priorité au premier trouvé
                    colors_map[clean] = hex_value

    for table in tables:
        rows = table.find_all("tr")
        if not rows: continue
        
        # On parcourt les lignes de données
        for row in rows[1:]:
            cols = row.find_all(["td", "th"])
            if len(cols) < 3: continue
            
            # --- DÉTECTION INTELLIGENTE DE LA STRUCTURE ---
            # On récupère le texte des 3 premières colonnes potentielles
            txt_0 = clean_text(cols[0].get_text())
            txt_1 = clean_text(cols[1].get_text())
            txt_2 = clean_text(cols[2].get_text()) if len(cols) > 2 else ""

            final_code = ""
            final_hex = ""
            final_alias = ""

            # Cas B : Structure Décalée (Case Couleur, Code, Hex, ...) -> C'est votre cas !
            if re.match(r'^#[0-9A-Fa-f]{6}$', txt_2):
                final_code = txt_1      # Le code est en 2ème position
                final_hex = txt_2       # Le hex est en 3ème position
                final_alias = clean_text(cols[-1].get_text()) # Alias toujours à la fin

            # Cas A : Structure Standard (Code, Hex, ...) -> Cas classique
            elif re.match(r'^#[0-9A-Fa-f]{6}$', txt_1):
                final_code = txt_0
                final_hex = txt_1
                final_alias = clean_text(cols[-1].get_text())

            else:
                continue # Pas une ligne de couleur valide

            # --- ENREGISTREMENT ---
            add_keys(final_code, final_hex)
            add_keys(final_alias, final_hex)

    # Overrides de sécurité (au cas où)
    OVERRIDES = {
        "GDR": "#dd0000", "LFI-NFP": "#cc2443", "EcoS": "#00c000", 
        "EPR": "#ffeb00", "DR": "#0066cc", "UDR": "#162561"
    }
    colors_map.update(OVERRIDES)
    
    return colors_map

if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    colors = extract_colors()
    
    # Mode Secours si échec
    if not colors:
        print("⚠️ Scraping échoué. Génération d'un fichier de secours.")
        colors = {
            "GDR": "#dd0000", "LFI": "#cc2443", "SOC": "#ff8080", 
            "ECO": "#00c000", "EPR": "#ffeb00", "RN": "#0d378a", 
            "DR": "#0066cc", "UDR": "#162561", "NI": "#dddddd"
        }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(colors, f, indent=2, ensure_ascii=False)
    
    print(f"✅ {len(colors)} couleurs prêtes dans {OUTPUT_FILE}")
