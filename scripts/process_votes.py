import json
import os
import glob
import re

# --- CONFIGURATION ---
DOSSIER_SCRUTINS = "./Scrutins/json"
DOSSIER_DEPUTES = "./public/data/deputes_actifs"
DIR_SORTIE_VOTES = "./public/data/votes"

# --- FONCTION HELPER POUR TROUVER LE DERNIER FICHIER ---
def trouver_dernier_fichier_deputes(dossier):
    # On cherche tous les fichiers qui ressemblent à vYYYY-MM-DD.json
    pattern = os.path.join(dossier, "v*.json")
    fichiers = glob.glob(pattern)
    
    if not fichiers:
        raise FileNotFoundError(f"Aucun fichier députés (v*.json) trouvé dans {dossier}")

    # On trie par ordre alphabétique inversé (le plus grand, donc la date la plus récente, en premier)
    # Ex: v2025-12-13.json > v2025-12-12.json
    fichiers.sort(reverse=True)
    
    dernier = fichiers[0]
    print(f"Fichier députés le plus récent identifié : {dernier}")
    return dernier

# --- 1. CHARGEMENT LISTE DEPUTES ---
if not os.path.exists(DIR_SORTIE_VOTES):
    os.makedirs(DIR_SORTIE_VOTES)

FICHIER_DEPUTES_BASE = trouver_dernier_fichier_deputes(DOSSIER_DEPUTES)

print(f"Chargement de la liste des députés depuis {FICHIER_DEPUTES_BASE}...")
with open(FICHIER_DEPUTES_BASE, 'r', encoding='utf-8') as f:
    liste_base = json.load(f)

# On prépare un dictionnaire pour stocker les votes temporairement
# Clé = ID acteur (PA1234), Valeur = liste de votes
votes_par_depute = {d['id']: [] for d in liste_base}

# --- 2. TRAITEMENT DES SCRUTINS ---
print("Analyse des milliers de scrutins...")
fichiers_scrutins = glob.glob(os.path.join(DOSSIER_SCRUTINS, "VTAN*.json"))

# Pour trier par numéro de scrutin (facultatif mais plus propre)
fichiers_scrutins.sort() 

count = 0
for chemin in fichiers_scrutins:
    count += 1
    if count % 500 == 0: print(f"Traitement... {count}/{len(fichiers_scrutins)}")
    
    with open(chemin, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
            scrutin = data['scrutin']
        except:
            continue # Fichier corrompu ou vide

    # Infos du scrutin
    info_vote = {
        'date': scrutin['dateScrutin'],
        'titre': scrutin['titre'],
        'sort': scrutin['sort']['code'], # adopté / rejeté
        'numero': scrutin['numero']
    }

    # Extraction des votants
    ventilation = scrutin['ventilationVotes']['organe']['groupes']['groupe']
    if isinstance(ventilation, dict): ventilation = [ventilation]

    for groupe in ventilation:
        nominatif = groupe['vote']['decompteNominatif']
        
        # Helper pour ajouter
        def ajouter(source, position):
            if not source: return
            votants = source.get('votant')
            if not votants: return
            if isinstance(votants, dict): votants = [votants]
            
            for v in votants:
                ref = v['acteurRef']
                if ref in votes_par_depute:
                    # On copie l'info du scrutin et on ajoute la position du député
                    v_data = info_vote.copy()
                    v_data['vote'] = position
                    votes_par_depute[ref].append(v_data)

        ajouter(nominatif.get('pours'), 'Pour')
        ajouter(nominatif.get('contres'), 'Contre')
        ajouter(nominatif.get('abstentions'), 'Abstention')

# --- 3. SAUVEGARDE INDIVIDUELLE ---
print("Génération des fichiers individuels...")

for dep_id, votes in votes_par_depute.items():
    # On trie les votes par date (récent en premier pour l'IA)
    votes.sort(key=lambda x: x['date'], reverse=True)
    
    chemin_fichier = os.path.join(DIR_SORTIE_VOTES, f"{dep_id}.json")
    with open(chemin_fichier, 'w', encoding='utf-8') as f:
        json.dump(votes, f, ensure_ascii=False)

# --- 4. SAUVEGARDE LISTE LEGERE (Optionnel) ---
# Si vous voulez garder v2025-12-12.json tel quel, pas besoin de ça.
# Mais c'est bien de s'assurer qu'il est propre.
print("Terminé !")
