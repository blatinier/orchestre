# Orchestre à Cordes - Site Web des Partitions

Ce site web permet de consulter et télécharger les partitions de l'orchestre à cordes.

## Structure du projet

```
orchestre/
├── index.html              # Page principale
├── partitions.json         # Données des partitions (généré automatiquement)
├── css/
│   └── style.css          # Styles du site
├── js/
│   └── app.js             # Logique JavaScript
└── partitions/            # Dossier contenant tous les PDF
    └── Nord Deux Sèvres/
        ├── Violon 1/
        ├── Violon 2/
        ├── Violon 3/
        ├── Violoncelle 1/
        └── Violoncelle 2/
```

## Utilisation

### Ouvrir le site

Ouvrez simplement le fichier `index.html` dans votre navigateur web.

### Fonctionnalités

1. **Recherche** : Utilisez la barre de recherche pour trouver un morceau par son titre
2. **Filtres** : Cliquez sur un instrument pour voir uniquement les morceaux disponibles pour cet instrument
3. **Téléchargement** : Cliquez sur le bouton d'un instrument pour télécharger la partition PDF

### Ajouter de nouvelles partitions

1. Ajoutez les fichiers PDF dans les dossiers d'instruments appropriés
2. Régénérez le fichier `partitions.json` en exécutant le script Python :

```bash
cd ~/git/orchestre
python3 generate_json.py
```

3. Rechargez la page dans votre navigateur

## Caractéristiques du design

- Design coloré et joyeux avec un dégradé de fond
- Polices élégantes (Cormorant Garamond et Crimson Text)
- Interface responsive (s'adapte aux mobiles et tablettes)
- Animations fluides et transitions agréables
- Boutons de filtres interactifs
- Recherche en temps réel

## Compatibilité

Le site fonctionne avec tous les navigateurs modernes :
- Chrome/Edge (version récente)
- Firefox (version récente)
- Safari (version récente)

## Nombre de morceaux

Actuellement : **16 morceaux** dans la bibliothèque
