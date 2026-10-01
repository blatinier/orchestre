# Visionneuse de partitions et annotations musicales — Conception

Date : 2026-10-01

## Objectif

Permettre de **consulter les partitions PDF directement dans le site** (au lieu
de les télécharger) et de **les annoter avec les signes du violon** : coups
d'archet, liaisons, nuances, soufflets crescendo/decrescendo, articulations,
doigtés, repères.

## Contraintes

- Le site reste **statique** (hébergé depuis le dépôt GitHub), sans serveur, sans comptes.
- Utilisable sur **ordinateur, tablette et téléphone** (souris, doigt, stylet).
- Les **PDF d'origine ne sont jamais modifiés**.
- Pas d'outil de build : modules JavaScript natifs, comme le site actuel.

## Deux couches d'annotations

| Couche | Qui l'écrit | Où elle vit | Affichage |
|---|---|---|---|
| **Officielle** | Le chef / chef de pupitre | Fichier `.json` commité dans le dépôt | Bleu, lecture seule |
| **Personnelle** | Chaque musicien | `localStorage` du navigateur | Rouge, modifiable |

Chaque couche peut être masquée indépendamment.

**Publication de la couche officielle :** le chef annote dans sa couche
personnelle, exporte le `.json`, et le mainteneur le dépose dans
`annotations/` puis commite. Aucune publication en direct.

Les annotations sont rattachées au **fichier PDF**, pas au morceau : un
conducteur (`V1-V2-Vcelle - …pdf`) partagé par plusieurs pupitres porte donc
les mêmes annotations pour tous ces pupitres.

## Visionneuse

- Les boutons d'instrument des cartes ouvrent `viewer.html?pdf=<chemin du pdf>`
  au lieu du PDF brut. Un lien « ⬇ PDF » reste disponible pour télécharger.
- L'URL de la visionneuse est partageable ; le bouton retour du navigateur
  ramène à la liste.
- Pages empilées verticalement, pleine largeur ; zoom +/− et pincement
  (tactile) ; rendu paresseux des pages à l'approche du défilement.
- **Mode Lecture** (par défaut) : aucune modification possible.
- **Mode Annoter** (bouton ✏️) : affiche la palette en bas de l'écran.

### Interaction en mode Annoter

- **Signe ponctuel** : choisir dans la palette, toucher la partition → posé.
  L'outil reste actif pour enchaîner.
- **Signe étirable** (liaison, soufflet) : glisser du point de départ au point d'arrivée.
- **Outil sélection** : toucher un signe pour le déplacer ou le supprimer (🗑).
- **Annuler / Rétablir**.
- **Taille** des signes : petite / moyenne / grande (`s` / `m` / `l`).
- Seule la couche personnelle est éditable.

### Menu ⋯

- Exporter mes annotations (`.json`)
- Importer des annotations (`.json`) — remplace la couche personnelle après confirmation
- Tout effacer (avec confirmation)

## Catalogue des signes

Palette organisée en onglets.

| Onglet | Signes (`type`) | Nature |
|---|---|---|
| Archet | tiré ⊓ (`tire`), poussé V (`pousse`), reprise d'archet ʼ (`reprise`), talon (`talon`), pointe (`pointe`), milieu (`milieu`) | ponctuel |
| Nuances | `ppp`, `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff`, `sfz`, `fp` | ponctuel |
| Évolution | soufflet crescendo (`crescendo`), soufflet decrescendo (`decrescendo`) | étirable |
| Évolution | texte « cresc. » (`cresc_texte`), « dim. » (`dim_texte`) | ponctuel |
| Liaisons | liaison (`liaison`, avec `sens` = `dessus` ou `dessous`) | étirable |
| Articulations | staccato (`staccato`), tenuto (`tenuto`), accent (`accent`), point d'orgue (`point_orgue`), pizz. (`pizz`), arco (`arco`) | ponctuel |
| Doigtés | `doigt_0` … `doigt_4`, cordes `corde_1` … `corde_4` (I–IV) | ponctuel |
| Repères | lunettes 👓 (`lunettes`), césure // (`cesure`), texte libre (`texte`, champ `texte`) | ponctuel |

Rendu : tous les signes sont dessinés en **SVG maison** (pas de police musicale
externe) ; les nuances et textes en serif italique gras. La courbure d'une
liaison est calculée à partir de la distance entre ses extrémités ; un
soufflet suit la direction du geste.

Ajouter un signe = ajouter une entrée au catalogue (`js/annotations/symboles.js`).

## Format des données

Identique pour l'export, l'import, le fichier officiel et le stockage local.

```json
{
  "version": 1,
  "pdf": "partitions/Nord Deux Sèvres/Violon 1/Bohemian Rhapsody, violon 1.pdf",
  "annotations": [
    { "id": "a1", "page": 1, "type": "tire", "x": 0.42, "y": 0.31, "taille": "m" },
    { "id": "a2", "page": 1, "type": "liaison", "x1": 0.20, "y1": 0.50, "x2": 0.35, "y2": 0.50, "sens": "dessus", "taille": "m" },
    { "id": "a3", "page": 2, "type": "texte", "x": 0.10, "y": 0.80, "texte": "rit.", "taille": "m" }
  ]
}
```

- Coordonnées **relatives à la page**, entre 0 et 1 (indépendantes du zoom et de l'écran).
- `page` commence à 1.
- Signe ponctuel : `x`, `y`. Signe étirable : `x1`, `y1`, `x2`, `y2`.
- `taille` vaut `s`, `m` ou `l` (défaut `m`).
- `version` permet de faire évoluer le format.

### Emplacements

- Couche officielle : chemin du PDF reproduit sous `annotations/`, extension `.json`.
  `partitions/Nord Deux Sèvres/Violon 1/X.pdf` → `annotations/Nord Deux Sèvres/Violon 1/X.json`.
  Absence du fichier (404) = pas de couche officielle.
- Couche personnelle : clé `localStorage` `orchestre_annotations:<chemin du pdf>`.

### Validation (import et fichier officiel)

Une annotation est rejetée si : `type` inconnu du catalogue, `page` non entier
≥ 1, coordonnée manquante ou hors de [0, 1], `texte` vide pour `type: texte`.
Les annotations invalides sont écartées individuellement (le reste est
conservé) et leur nombre est signalé. Un fichier sans `version` connue ou sans
tableau `annotations` est refusé en entier.

## Architecture du code

| Fichier | Rôle |
|---|---|
| `viewer.html`, `css/viewer.css` | Page de la visionneuse |
| `js/viewer.js` | Chargement de PDF.js (cdnjs, ES module + worker), rendu des pages, zoom, rendu paresseux, calques SVG par page |
| `js/annotations/symboles.js` | Catalogue : pour chaque `type`, libellé, onglet, nature (ponctuel/étirable), fonction de rendu SVG |
| `js/annotations/store.js` | Logique pure (sans DOM) : chargement/sauvegarde, export/import, validation, pile annuler/rétablir, conversion coordonnées |
| `js/annotations/editeur.js` | Outils, gestes (Pointer Events), sélection, déplacement, suppression |
| `js/app.js` (modifié) | Boutons d'instrument → visionneuse ; lien « ⬇ PDF » |
| `README.md` (modifié) | Utilisation, publication des annotations officielles, serveur local |

`store.js` et `symboles.js` ne dépendent pas du DOM navigateur pour leur
logique (le rendu SVG produit des chaînes ou des descriptions d'éléments),
afin d'être testables sous Node.

## Gestion des erreurs

- **PDF introuvable / illisible** : message dans la visionneuse + lien de téléchargement direct.
- **Fichier officiel malformé** : ignoré, petit avertissement, la partition s'affiche.
- **`localStorage` indisponible** (navigation privée, quota) : bandeau « vos
  annotations ne seront pas conservées » ; l'export reste possible.
- **Import d'un fichier dont `pdf` diffère** du PDF ouvert : confirmation demandée.
- **Paramètre `pdf` absent ou hors de `partitions/`** : message d'erreur, lien retour à la liste.

## Tests

- `node --test` sur `store.js` et `symboles.js` : validation, aller-retour
  export/import, annuler/rétablir, conversion de coordonnées, chemin du fichier
  officiel, chaque `type` du catalogue produit un rendu.
- Vérification manuelle dans un navigateur via `python3 -m http.server` :
  ouverture d'un PDF, pose/déplacement/suppression de chaque nature de signe,
  zoom, persistance après rechargement, export puis import, affichage d'une
  couche officielle.

## Hors périmètre

- Impression / export d'un PDF annoté (possible plus tard avec pdf-lib).
- Crayon à main levée.
- Publication en direct de la couche officielle (backend, comptes).
- Signes spécifiques au violoncelle (pouce…) — le catalogue les accueillera.
