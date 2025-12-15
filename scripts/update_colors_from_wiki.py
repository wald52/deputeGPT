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
    
    # 1. HEADERS NAVIGATEUR (Evite l'erreur 403 de Wiki)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
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
    
    for table in tables:
        rows = table.find_all("tr")
        if not rows: continue
        
        headers_row = rows[0].find_all("th")
        if not headers_row: continue
        
        headers_text = [th.get_text(strip=True).lower() for th in headers_row]
        
        try:
            idx_code = -1
            idx_hex = -1
            idx_autres = -1
            
            for i, h in enumerate(headers_text):
                if "code" in h and "hex" not in h: idx_code = i
                if "hex" in h: idx_hex = i
                if "autres codes" in h: idx_autres = i
            
            if idx_code == -1 or idx_hex == -1: continue

            for row in rows[1:]:
                cols = row.find_all(["td", "th"])
                if len(cols) <= max(idx_code, idx_hex): continue
                
                raw_code = clean_text(cols[idx_code].get_text())
                raw_hex = clean_text(cols[idx_hex].get_text())
                
                # Validation Hex
                if not re.match(r'^#[0-9A-Fa-f]{6}$', raw_hex): continue

                # --- 2. FONCTION DE DECOUPAGE ROBUSTE (Gère le · et les virgules) ---
                def add_keys(text_input):
                    # On remplace tous les séparateurs bizarres par des virgules
                    # \u00B7 est le point médian (·), \u2022 est la puce (•)
                    t = text_input.replace('\u00B7', ',').replace('\u2022', ',').replace('·', ',').replace('/', ',')
                    parts = t.split(',')
                    
                    for p in parts:
                        clean = p.strip()
                        # On filtre les titres parasites ou vides
                        if clean and len(clean) < 20: 
                            if clean not in colors_map:
                                colors_map[clean] = raw_hex

                # On ajoute le code principal
                add_keys(raw_code)
                
                # On ajoute les synonymes
                if idx_autres != -1 and len(cols) > idx_autres:
                    raw_autres = clean_text(cols[idx_autres].get_text())
                    add_keys(raw_autres)

        except Exception as e:
            print(f"⚠️ Erreur tableau : {e}")
            continue

    # 3. OVERRIDES MANUELS (Au cas où Wiki n'est pas à jour sur un truc précis)
    OVERRIDES = {
        "GDR": "#dd0000",
        "LFI-NFP": "#cc2443",
        "EcoS": "#00c000",
        "EPR": "#ffeb00", 
        "DR": "#0066cc",
        "UDR": "#162561"
    }
    colors_map.update(OVERRIDES)
    return colors_map

if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    colors = extract_colors()
    
    # 4. MODE SECOURS (Anti-plantage GitHub Actions)
    if not colors:
        print("⚠️ Scraping échoué. Génération d'un fichier de secours.")
        colors = {
            "GDR": "#dd0000", "LFI": "#cc2443", "SOC": "#ff8080", 
            "ECO": "#00c000", "EPR": "#ffeb00", "DEM": "#ff9900", 
            "HOR": "#0001b8", "DR": "#0066cc", "RN": "#0d378a", 
            "UDR": "#162561", "NI": "#dddddd"
        }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(colors, f, indent=2, ensure_ascii=False)
    
    print(f"✅ {len(colors)} couleurs prêtes dans {OUTPUT_FILE}")
