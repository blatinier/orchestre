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
        ├── V1-V2-Vcelle - *.pdf   # Conducteurs : plusieurs pupitres par PDF
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
3. **Filtre par année scolaire** : Cliquez sur une année scolaire (ex. `2026/2027`) pour ne voir que le répertoire joué cette saison-là
4. **Téléchargement** : Cliquez sur le bouton d'un instrument pour télécharger la partition PDF

### Ajouter de nouvelles partitions

1. Ajoutez les fichiers PDF dans les dossiers d'instruments appropriés
2. Régénérez le fichier `partitions.json` en exécutant le script Python :

```bash
cd ~/git/orchestre
python3 generate_json.py
```

3. Rechargez la page dans votre navigateur

**Le titre du morceau est déduit du nom de fichier.** `generate_json.py` retire
la mention d'instrument seulement si elle est **à la fin** du nom. Deux fichiers
donnent donc le même morceau tant qu'il ne reste que le titre après nettoyage :

| Nom de fichier                            | Titre obtenu           |
| ----------------------------------------- | ---------------------- |
| `Mendelssohn-Schumann violon 3.pdf`       | `Mendelssohn-Schumann` |
| `Mendelssohn-Schumann violoncelle.pdf`    | `Mendelssohn-Schumann` |
| `Mendelssohn-Schumann violoncelle, basse.pdf` | `Mendelssohn-Schumann violoncelle` ❌ |

Le dernier cas crée un morceau en double, parce que seul « , basse » est retiré.
Si un morceau apparaît deux fois sur le site, c'est presque toujours ça : corrigez
le **nom du fichier**, pas le JSON — une fusion faite à la main dans
`partitions.json` est défaite à la prochaine régénération.

### Ajouter un conducteur (plusieurs pupitres dans un seul PDF)

Certains PDF contiennent plusieurs parties sur la même partition. Ils ne vont pas
dans un dossier d'instrument : posez-les **à la racine** de la collection
(`partitions/Nord Deux Sèvres/`) et listez les pupitres en préfixe du nom, suivis
de ` - ` :

```
partitions/Nord Deux Sèvres/V1-V2-Vcelle - Allein zu dir, Herr Jesu Christ.pdf
```

Ce morceau apparaîtra sous **Violon 1**, **Violon 2** et **Violoncelle 1** à la
fois, chaque bouton téléchargeant ce même PDF. Le titre est ce qui suit ` - `.

Codes reconnus : `V1`, `V2`, `V3`, `Vcelle` (= Violoncelle 1), `Vcelle1`,
`Vcelle2`. La casse n'importe pas.

Si un PDF n'est ni dans un dossier d'instrument ni nommé selon cette convention,
`generate_json.py` le **signale** au lieu de l'ignorer en silence :

```
⚠ PDF ignored - no instrument found (wrong folder, or missing
  "V1-V2-Vcelle - " prefix for a combined score):
    - Nord Deux Sèvres/Mon fichier.pdf
```

### Renseigner les années de jeu

Les années où un morceau est joué ne peuvent pas être déduites des fichiers PDF :
elles sont saisies à la main dans `partitions.json`, via un champ optionnel `annees`.

Ce sont des **années scolaires**. On saisit un seul nombre, l'année de **début** ;
le site affiche l'année scolaire complète :

| Saisi dans le JSON | Affiché sur le site |
| ------------------ | ------------------- |
| `2024`             | `2024/2025`         |
| `2025`             | `2025/2026`         |
| `2026`             | `2026/2027`         |

Autrement dit, la saison qui commence en septembre 2026 se note `2026`.

```json
{
  "titre": "Volontary and march",
  "annees": [2024, 2025, 2026],
  "instruments": {
    "violon3": "partitions/Nord Deux Sèvres/Violon 3/Volontary and march, violon 3.pdf"
  }
}
```

- Un morceau joué une seule saison n'a qu'une année : `"annees": [2024]`, affichée `2024/2025`
- Un morceau sans champ `annees` n'apparaît que sous « Toutes les années »
- Les boutons d'années du site sont générés à partir des années présentes dans
  le fichier : la ligne de filtres disparaît si aucun morceau n'a d'année
- Les liens de partage utilisent l'année de début (`?annee=2024`), pas la forme affichée

`generate_json.py` relit le `partitions.json` existant et **reporte les années**
à chaque régénération, donc ajouter des PDF ne les efface pas. Si un morceau est
renommé ou supprimé, le script prévient que ses années ont été perdues :

```
⚠ Years dropped - these titles no longer exist (renamed or removed PDF?):
    - Ancien titre: [2024, 2025]
```

Dans ce cas, remettez les années sur le nouveau titre à la main.

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

Actuellement : **18 morceaux** dans la bibliothèque
