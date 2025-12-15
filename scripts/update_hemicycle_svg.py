import requests
from bs4 import BeautifulSoup
import os

# Config
URL_PAGE = "https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle"
OUTPUT_SVG = "public/data/hemicycle_svg/hemicycle.svg"

def update_svg():
    print(f"Téléchargement de la page {URL_PAGE}...")
    headers = {'User-Agent': 'Mozilla/5.0...'}
    
    try:
        response = requests.get(URL_PAGE, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Recherche du SVG principal
        target_svg = None
        for svg in soup.find_all('svg'):
            # Critère : nombre d'éléments graphiques significatif
            if len(svg.find_all(['path', 'circle', 'g'])) > 300:
                target_svg = svg
                break
        
        if target_svg:
            print("✅ SVG trouvé ! Optimisation en cours...")
            
            # 1. NETTOYAGE LIENS & STYLES (Comme avant)
            for a_tag in target_svg.find_all('a'):
                g_tag = soup.new_tag("g")
                g_tag.attrs = a_tag.attrs
                g_tag.extend(a_tag.contents)
                a_tag.replace_with(g_tag)

            for seat in target_svg.find_all(['path', 'circle', 'rect']):
                if 'fill' not in seat.attrs: seat['fill'] = '#e0e0e0'
                if 'style' in seat.attrs: del seat['style']

            # 2. OPTIMISATION DU CADRAGE (NOUVEAU)
            # On supprime les attributs width/height fixes qui écrasent tout
            if 'width' in target_svg.attrs: del target_svg['width']
            if 'height' in target_svg.attrs: del target_svg['height']
            
            # On force une viewBox standard si celle d'origine est bizarre
            # L'hémicycle de l'AN a souvent une viewBox mal centrée.
            # Valeurs empiriques pour un bon centrage de cet hémicycle précis :
            # Essayons de ne pas toucher la viewBox d'origine d'abord,
            # mais si elle est absente, on en met une.
            if 'viewbox' not in target_svg.attrs and 'viewBox' not in target_svg.attrs:
                # Valeur approximative pour l'hémicycle AN standard
                target_svg['viewBox'] = "0 0 1100 600"
            
            # On ajoute un ID pour le CSS
            target_svg['id'] = "hemicycle-svg-content"
            
            # Sauvegarde
            os.makedirs(os.path.dirname(OUTPUT_SVG), exist_ok=True)
            with open(OUTPUT_SVG, "w", encoding="utf-8") as f:
                f.write(str(target_svg))
            print(f"SVG optimisé sauvegardé sous : {OUTPUT_SVG}")
            
        else:
            print("❌ Aucun SVG valide trouvé.")
            exit(1)

    except Exception as e:
        print(f"❌ Erreur : {e}")
        exit(1)

if __name__ == "__main__":
    update_svg()
