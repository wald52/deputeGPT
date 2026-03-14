import json
import os
import re
import logging
from collections import defaultdict
from datetime import datetime

# Configuration des logs
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

def get_latest_deputes_file(directory):
    """Trouve le fichier de députés le plus récent dans le répertoire spécifié."""
    if not os.path.exists(directory):
        raise FileNotFoundError(f"Le répertoire {directory} n'existe pas")
    
    # Expression régulière pour les fichiers au format vYYYY-MM-DD.json
    pattern = re.compile(r'v(\d{4}-\d{2}-\d{2})\.json$')
    latest_date = None
    latest_file = None
    
    for filename in os.listdir(directory):
        match = pattern.search(filename)
        if match:
            try:
                file_date = datetime.strptime(match.group(1), '%Y-%m-%d').date()
                if latest_date is None or file_date > latest_date:
                    latest_date = file_date
                    latest_file = filename
            except ValueError:
                continue
    
    if latest_file is None:
        raise FileNotFoundError("Aucun fichier de députés valide trouvé")
    
    return os.path.join(directory, latest_file)

# Chemins des fichiers
DEPUTES_ACTIFS_PATH = get_latest_deputes_file("public/data/deputes_actifs")
SIEGES_COULEURS_PATH = "public/data/hemicycle_svg/sieges_couleurs.json"
GROUPES_PATH = "public/data/deputes_actifs/groupes.json"
PLACES_MAPPING_PATH = "public/data/place_mapping/places_mapping.json"

def main():
    logging.info("Début du script de mise à jour des couleurs des groupes")

    # Vérifier l'existence des fichiers
    for path in [DEPUTES_ACTIFS_PATH, SIEGES_COULEURS_PATH, GROUPES_PATH, PLACES_MAPPING_PATH]:
        if not os.path.exists(path):
            logging.error(f"Le fichier {path} n'existe pas ou est inaccessible")
            return

    # Lire le fichier des députés actifs
    try:
        with open(DEPUTES_ACTIFS_PATH, 'r', encoding='utf-8') as f:
            deputes_data = json.load(f)
        logging.info(f"Fichier {DEPUTES_ACTIFS_PATH} lu avec succès")
    except Exception as e:
        logging.error(f"Erreur lors de la lecture du fichier {DEPUTES_ACTIFS_PATH}: {e}")
        return

    # Lire le fichier des sièges et couleurs
    try:
        with open(SIEGES_COULEURS_PATH, 'r', encoding='utf-8') as f:
            sieges_couleurs = json.load(f)
        logging.info(f"Fichier {SIEGES_COULEURS_PATH} lu avec succès")
    except Exception as e:
        logging.error(f"Erreur lors de la lecture du fichier {SIEGES_COULEURS_PATH}: {e}")
        return

    # Lire le fichier de mapping des places
    try:
        with open(PLACES_MAPPING_PATH, 'r', encoding='utf-8') as f:
            places_mapping = json.load(f)
        logging.info(f"Fichier {PLACES_MAPPING_PATH} lu avec succès")
    except Exception as e:
        logging.error(f"Erreur lors de la lecture du fichier {PLACES_MAPPING_PATH}: {e}")
        return

    # Lire le fichier des groupes
    try:
        with open(GROUPES_PATH, 'r', encoding='utf-8') as f:
            groupes_data = json.load(f)
        logging.info(f"Fichier {GROUPES_PATH} lu avec succès")
    except Exception as e:
        logging.error(f"Erreur lors de la lecture du fichier {GROUPES_PATH}: {e}")
        return

    # Créer un dictionnaire pour stocker les couleurs par groupe
    couleurs_par_groupe = defaultdict(list)

    # Afficher des exemples pour le débogage
    logging.debug("=== EXEMPLES DE DONNÉES ===")
    
    # Afficher quelques exemples de mapping de places
    logging.debug("\nExemples de mapping de places (matricule -> siège):")
    for i, (matricule, siege) in enumerate(places_mapping.items()):
        if i >= 3:  # Afficher seulement les 3 premiers
            break
        logging.debug(f"  {matricule} -> {siege}")
    
    # Afficher quelques exemples de couleurs de sièges
    logging.debug("\nExemples de couleurs de sièges (siège -> couleur):")
    for i, (siege, couleur) in enumerate(sieges_couleurs.items()):
        if i >= 3:  # Afficher seulement les 3 premiers
            break
        logging.debug(f"  Siège {siege} -> {couleur}")
    
    # Afficher quelques exemples de députés
    logging.debug("\nExemples de députés (matricule, groupe, circonscription):")
    for i, depute in enumerate(deputes_data):
        if i >= 3:  # Afficher seulement les 3 premiers
            break
        matricule = depute.get('id', 'inconnu')
        groupe = depute.get('groupeAbrev', 'inconnu')
        circo = depute.get('circo', 'inconnu')
        logging.debug(f"  {matricule} -> groupe={groupe}, circo={circo}")
    
    # Parcourir les députés et associer les couleurs des sièges aux groupes
    for depute in deputes_data:
        groupe = depute.get('groupeAbrev')
        matricule = depute.get('id')
        
        if not groupe or not matricule:
            logging.debug(f"Député sans groupe ou matricule: {depute}")
            continue
            
        # Obtenir le numéro de siège à partir du matricule
        siege = places_mapping.get(matricule)
        if not siege:
            logging.debug(f"Aucun siège trouvé pour le matricule {matricule} (groupe {groupe})")
            continue
            
        # Obtenir la couleur du siège
        couleur = sieges_couleurs.get(str(siege))
        if couleur:
            couleurs_par_groupe[groupe].append(couleur)
            logging.debug(f"Trouvé: groupe={groupe}, matricule={matricule}, siège={siege}, couleur={couleur}")
        else:
            logging.debug(f"Aucune couleur trouvée pour le siège {siege} (matricule {matricule}, groupe {groupe})")

    # Pour chaque groupe, déterminer la couleur la plus fréquente
    couleurs_dominantes = {}
    for groupe, couleurs in couleurs_par_groupe.items():
        if couleurs:
            # Trouver la couleur la plus fréquente
            couleur_dominante = max(set(couleurs), key=couleurs.count)
            couleurs_dominantes[groupe] = couleur_dominante
            logging.debug(f"Couleur dominante pour {groupe}: {couleur_dominante} (basée sur {len(couleurs)} sièges)")

    logging.info(f"Couleurs déterminées pour {len(couleurs_dominantes)} groupes")

    # Mettre à jour les couleurs dans le fichier des groupes
    groupes_mis_a_jour = 0
    for groupe in groupes_data:
        code = groupe.get('code')
        if code in couleurs_dominantes:
            nouvelle_couleur = couleurs_dominantes[code]
            if groupe.get('couleur') != nouvelle_couleur:
                groupe['couleur'] = nouvelle_couleur
                groupes_mis_a_jour += 1
                logging.debug(f"Mise à jour de la couleur pour {code}: {nouvelle_couleur}")

    # Sauvegarder les modifications
    try:
        with open(GROUPES_PATH, 'w', encoding='utf-8') as f:
            json.dump(groupes_data, f, indent=2, ensure_ascii=False)
        logging.info(f"{groupes_mis_a_jour} groupes mis à jour avec succès dans {GROUPES_PATH}")
    except Exception as e:
        logging.error(f"Erreur lors de l'écriture du fichier {GROUPES_PATH}: {e}")
        return

if __name__ == "__main__":
    main()