import requests
from bs4 import BeautifulSoup
import os
import re
import json
import html
import sys

# Force UTF-8 encoding for stdout/stderr to handle emojis on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Config
URL_PAGE = "https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle"
OUTPUT_SVG = "public/data/hemicycle_svg/hemicycle.svg"
OUTPUT_COLORS = "public/data/hemicycle_svg/sieges_couleurs.json"

def update_hemicycle_data():
    print(f"Téléchargement de la page {URL_PAGE}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(URL_PAGE, headers=headers)
        response.raise_for_status()
        content = response.text
        
        soup = BeautifulSoup(content, 'html.parser')
        
        # --- 1. EXTRACTION DU SVG ---
        target_svg = None
        # On cherche un SVG qui a beaucoup de chemins (l'hémicycle)
        for svg in soup.find_all('svg'):
            if len(svg.find_all(['path', 'circle', 'g'])) > 300:
                target_svg = svg
                break
        
        if target_svg:
            print("✅ SVG trouvé ! Nettoyage...")
            
            # Suppression des liens parasites
            for a_tag in target_svg.find_all('a'):
                g_tag = soup.new_tag("g")
                g_tag.attrs = a_tag.attrs
                g_tag.extend(a_tag.contents)
                a_tag.replace_with(g_tag)
            
            # Standardisation des styles
            for seat in target_svg.find_all(['path', 'circle', 'rect']):
                if 'style' in seat.attrs: del seat['style']
                seat['fill'] = '#e0e0e0' # Gris neutre de base
                
                # Cas spécial : Le Perchoir (Président)
                if seat.get('id') == 'ppresident':
                    seat['id'] = 'pPRESIDENT'

            # ViewBox et Dimensions
            if 'width' in target_svg.attrs: del target_svg['width']
            if 'height' in target_svg.attrs: del target_svg['height']
            if 'viewbox' not in target_svg.attrs and 'viewBox' not in target_svg.attrs:
                target_svg['viewBox'] = "0 0 1100 600" 
                
            target_svg['id'] = "hemicycle-svg-content"
            
            os.makedirs(os.path.dirname(OUTPUT_SVG), exist_ok=True)
            with open(OUTPUT_SVG, "w", encoding="utf-8") as f:
                f.write(str(target_svg))
            print(f"SVG sauvegardé : {OUTPUT_SVG}")
        else:
            print("❌ Erreur: SVG non trouvé.")

        # --- 2. EXTRACTION DES COULEURS DES SIÈGES ---
        print("Extraction des couleurs officielles...")
        
        sieges_map = {}
        
        # MÉTHODE A : Via attribut data-siegedata (Le plus fiable sur la page actuelle)
        # On cherche n'importe quel élément ayant cet attribut
        elements_with_data = soup.find_all(attrs={"data-siegedata": True})
        
        if elements_with_data:
            print(f"Trouvé {len(elements_with_data)} élément(s) avec data-siege.")
            try:
                raw_json = elements_with_data[0]["data-siegedata"]
                # Décodage des entités HTML (&quot; -> ")
                clean_json = html.unescape(raw_json)
                data = json.loads(clean_json)
                
                # Le JSON est sous la forme : {"10": {"couleur": "ABCDEF"}, ...}
                count = 0
                for num, infos in data.items():
                    if isinstance(infos, dict) and "couleur" in infos:
                        color = infos["couleur"]
                        # S'assurer que la couleur commence par #
                        if not color.startswith('#'):
                            color = "#" + color
                        # Standardisation de l'ID pour le président
                        if num == 'president':
                            num = 'PRESIDENT'
                            
                        sieges_map[num] = color
                        count += 1
                print(f"Méthode data-siege : {count} couleurs trouvées.")
            except Exception as e:
                print(f"Erreur parsing data-siege : {e}")

        # MÉTHODE B : Fallback Regex (Si la structure HTML change)
        if len(sieges_map) < 100:
            print("Tentative Regex de secours...")
            # Pattern souple :  "123" ... : ... { ... "couleur" ... : ... "ABCDEF"
            pattern = r'["\']?(\d+)["\']?\s*:\s*\{[^}]*?["\']?couleur["\']?\s*:\s*["\']?([0-9A-Fa-f]{6})["\']?'
            matches = re.findall(pattern, content)
            
            for num, color in matches:
                sieges_map[num] = "#" + color
            print(f"Méthode Regex : {len(matches)} correspondances.")

        # SAUVEGARDE
        if len(sieges_map) > 100:
            os.makedirs(os.path.dirname(OUTPUT_COLORS), exist_ok=True)
            with open(OUTPUT_COLORS, "w", encoding="utf-8") as f:
                json.dump(sieges_map, f, indent=2)
            print(f"✅ SUCCÈS : {len(sieges_map)} couleurs de sièges sauvegardées.")
        else:
            print("❌ ÉCHEC : Trop peu de couleurs trouvées. Vérifiez le format de la page.")

    except Exception as e:
        print(f"❌ Erreur critique : {e}")
        exit(1)

if __name__ == "__main__":
    update_hemicycle_data()
