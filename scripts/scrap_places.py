import re
import html
import json

# 1. Lire le fichier HTML source
with open('Situez-votre-depute-dans-l-hemicycle-Assemblee-nationale.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 2. Extraire la structure JSON encodée
# On cherche le pattern "NUMERO":{... "PAxxxx"}
# On nettoie d'abord les entités HTML (&quot; -> ")
content_decoded = html.unescape(content)

# Regex pour trouver : "123":{"couleur":..., "tooltipUrl":".../PA123456"}
# On capture le numéro de siège (group 1) et l'ID du député (group 2)
pattern = re.compile(r'"(\d+)":\{[^}]*acteur-presentation\\/([^"]+)"\}')

matches = pattern.findall(content_decoded)

mapping = {}
for seat_num, depute_id in matches:
    mapping[depute_id] = seat_num

print(f"Trouvé {len(mapping)} correspondances siège <-> député.")

# 3. Sauvegarder en JSON
with open('public/data/places_mapping.json', 'w', encoding='utf-8') as f:
    json.dump(mapping, f, indent=2)

print("Fichier 'places_mapping.json' créé avec succès !")
