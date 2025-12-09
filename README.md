# 🇫🇷 DéputéGPT

**Interrogez une IA WebGPU sur les votes des députés français**

DéputéGPT est une application web qui utilise **WebGPU** et le modèle **Mistral ONNX** pour analyser et répondre aux questions sur les votes des députés de l'Assemblée Nationale française.

![Screenshot](https://via.placeholder.com/800x400/667eea/ffffff?text=DéputéGPT+Screenshot)

## 🚀 Fonctionnalités

- ✅ **WebGPU natif** - Inférence IA ultra-rapide directement dans le navigateur
- ✅ **Mistral 3B ONNX** - Modèle de langage optimisé pour la performance
- ✅ **Hémicycle interactif** - Visualisation SVG des 577 sièges avec couleurs politiques
- ✅ **Données réelles** - API officielle de l'Assemblée Nationale
- ✅ **RAG (Retrieval-Augmented Generation)** - Réponses basées uniquement sur les votes du député
- ✅ **Recherche avancée** - Par nom, groupe politique, ou circonscription
- ✅ **100% client-side** - Aucun serveur backend requis

## 🎯 Démo en ligne

👉 **[Essayer DéputéGPT](https://wald52.github.io/deputegpt/)**

## 📋 Prérequis

### Navigateurs compatibles WebGPU

| Navigateur | Version minimale | Statut |
|-----------|------------------|--------|
| Chrome / Edge | 113+ | ✅ Recommandé |
| Firefox | Nightly (activé manuellement) | ⚠️ Expérimental |
| Safari | 18+ (Apple Silicon) | ✅ Stable |

### Configuration matérielle recommandée

- **GPU** : Carte graphique compatible Vulkan/Metal/DirectX 12
- **RAM** : 8 GB minimum (16 GB recommandé)
- **VRAM** : 4 GB minimum pour le modèle quantifié
- **Connexion** : Haut débit (téléchargement initial ~1-2 GB)

## 🛠️ Installation locale

### Option 1: Serveur local simple

```bash
# Cloner le repository
git clone https://github.com/wald52/deputegpt.git
cd deputegpt

# Lancer un serveur HTTP local (Python 3)
python -m http.server 8000

# Ou avec Node.js
npx http-server -p 8000

# Ouvrir dans le navigateur
open http://localhost:8000
```

### Option 2: GitHub Pages

1. Forkez ce repository
2. Allez dans **Settings > Pages**
3. Sélectionnez la branche `main` et dossier `/root`
4. Sauvegardez et attendez le déploiement (~2 min)
5. Accédez à `https://wald52.github.io/deputegpt/`

## 📖 Utilisation

### 1. Sélectionner un député

- **Par recherche** : Tapez un nom, groupe politique, ou circonscription
- **Par l'hémicycle** : Cliquez sur un point coloré représentant un siège

### 2. Poser une question

Exemples de questions :
- "Quelle est sa position sur l'écologie ?"
- "A-t-il voté pour la réforme des retraites ?"
- "Combien de fois a-t-il voté contre son groupe ?"
- "Résume ses votes sur l'économie"

### 3. Analyser la réponse

L'IA répond **uniquement** en se basant sur les votes enregistrés dans la base de données.

## 🏗️ Architecture technique

```
deputegpt/
│
├── index.html          # Application complète (HTML + CSS + JS)
├── README.md           # Cette documentation
├── LICENSE             # Licence MIT
└── .gitignore          # Fichiers Git à ignorer
```

### Technologies utilisées

- **Frontend** : HTML5, CSS3 (Grid, Flexbox), Vanilla JavaScript
- **IA** : [transformers.js v3](https://github.com/xenova/transformers.js) (WebGPU)
- **Modèle** : [Mistral-3B-ONNX](https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512-ONNX)
- **API Données** : [data.assemblee-nationale.fr](https://data.assemblee-nationale.fr)
- **Visualisation** : SVG généré dynamiquement

## 🔧 Configuration avancée

### Changer le modèle ONNX

Dans `index.html`, ligne ~450 :

```javascript
generator = await pipeline(
    'text-generation',
    'mistralai/Ministral-3-3B-Instruct-2512-ONNX', // Votre modèle ici
    { 
        device: 'webgpu',
        dtype: 'q4' // q4, q8, fp16, fp32
    }
);
```

### Optimiser les performances

- **Réduire max_new_tokens** : Ligne ~520 → `max_new_tokens: 100`
- **Changer la quantification** : `dtype: 'q4'` (rapide) vs `'fp16'` (précis)
- **Limiter le cache** : `env.useBrowserCache = false;`

## 📊 Sources de données

### API Assemblée Nationale

- **Votes** : `https://data.assemblee-nationale.fr/travaux-parlementaires/votes`
- **Députés** : `https://data.assemblee-nationale.fr/api/v1/acteurs`
- **Documentation** : [data.assemblee-nationale.fr](https://data.assemblee-nationale.fr)

### Fallback données de démonstration

Si l'API est inaccessible, l'application utilise des données générées aléatoirement pour la démonstration.

## 🤝 Contribution

Les contributions sont les bienvenues ! Voici comment participer :

1. **Fork** le projet
2. Créez une **branche** (`git checkout -b feature/amélioration`)
3. **Committez** vos changements (`git commit -m 'Ajout de...'`)
4. **Pushez** sur la branche (`git push origin feature/amélioration`)
5. Ouvrez une **Pull Request**

### Idées d'amélioration

- [ ] Ajouter les votes du Sénat
- [ ] Graphiques d'évolution des votes
- [ ] Export PDF des réponses
- [ ] Mode comparaison de députés
- [ ] Thème sombre
- [ ] Support multilingue (EN, ES)
- [ ] Historique des conversations

## ⚠️ Limitations connues

- **Premier chargement lent** : Le téléchargement du modèle ONNX (1-2 GB) peut prendre plusieurs minutes
- **WebGPU requis** : Ne fonctionne pas sur les navigateurs sans support WebGPU
- **Données limitées** : Seuls les votes récents sont disponibles via l'API
- **Qualité des réponses** : Dépend de la richesse des données de vote disponibles

## 📄 Licence

Ce projet est sous licence **MIT** - voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🙏 Remerciements

- **Assemblée Nationale** pour l'Open Data
- **Mistral AI** pour le modèle ONNX
- **Hugging Face** pour transformers.js
- **Communauté WebGPU** pour les retours et tests

## 📞 Contact

- **GitHub** : [@wald52](https://github.com/wald52)
- **Issues** : [Signaler un bug](https://github.com/wald52/deputegpt/issues)

---

⭐ **Si ce projet vous plaît, n'hésitez pas à lui donner une étoile !**

Made with ❤️ and WebGPU in France 🇫🇷
