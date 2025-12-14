import requests
import re
import os
from bs4 import BeautifulSoup

# Configuration
URL_PAGE = "https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle"
OUTPUT_SVG = "public/data/hemicycle_svg/hemicycle.svg" # Racine du repo (comme votre fichier actuel)

def update_svg():
    print(f"Téléchargement de la page {URL_PAGE}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(URL_PAGE, headers=headers)
        response.raise_for_status()
        
        print("Extraction du SVG...")
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Le SVG est souvent dans une div avec une classe spécifique comme "hemicycle-view"
        # Ou alors on prend le premier grand SVG de la page.
        # Sur la page actuelle, le SVG principal a souvent un ID ou une classe reconnaissable.
        # On cherche le SVG qui contient beaucoup d'éléments (pour éviter les icones)
        svgs = soup.find_all('svg')
        target_svg = None
        
        for svg in svgs:
            # Critère simple : un plan d'hémicycle a au moins 500 sièges (cercles ou paths)
            nb_elements = len(svg.find_all(['path', 'circle', 'g']))
            if nb_elements > 300:
                target_svg = svg
                break
        
        if target_svg:
            print("✅ SVG de l'hémicycle trouvé !")
            
            # OPTIONNEL : Nettoyage / Ajout de style par défaut
            # On peut ajouter width="100%" height="auto" pour assurer la compatibilité CSS
            target_svg['width'] = "100%"
            target_svg['height'] = "auto"
            target_svg['id'] = "hemicycle-svg-content" # ID utile pour le CSS
            
            # Sauvegarde
            os.makedirs(os.path.dirname(OUTPUT_SVG), exist_ok=True)
            with open(OUTPUT_SVG, "w", encoding="utf-8") as f:
                f.write(str(target_svg))
            print(f"SVG sauvegardé sous : {OUTPUT_SVG}")
            
        else:
            print("❌ Aucun SVG complexe trouvé dans la page.")
            exit(1)

    except Exception as e:
        print(f"❌ Erreur critique : {e}")
        exit(1)

if __name__ == "__main__":
    update_svg()
