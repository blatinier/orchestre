# Visionneuse de partitions et annotations musicales — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ouvrir les partitions PDF dans le site et y poser des signes musicaux (archets, liaisons, nuances, soufflets…), sur deux couches : officielle (fichier commité) et personnelle (navigateur).

**Architecture:** Une page `viewer.html` affiche le PDF avec PDF.js (canvas par page) et superpose à chaque page un `<svg>` dont le `viewBox` fait 1000 unités de large : les annotations sont stockées en coordonnées relatives (0–1) et dessinées dans cet espace, donc le zoom ne redessine que le canvas. La logique (catalogue de signes, validation, stockage, annuler/rétablir, géométrie) est en modules ES purs testés sous Node ; le DOM est confiné à `viewer.js` et `editeur.js`.

**Tech Stack:** HTML/CSS/JS natifs (modules ES, pas de build), PDF.js 4.10.38 via cdnjs, `node --test` (Node 20) pour les tests.

**Spec:** `docs/superpowers/specs/2026-10-01-visionneuse-annotations-design.md`

## Global Constraints

- Site 100 % statique : aucun serveur, aucun compte, aucune dépendance npm à l'exécution.
- PDF.js chargé depuis `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/` (`pdf.min.mjs`, `pdf.worker.min.mjs`).
- Les PDF d'origine ne sont jamais modifiés.
- Format de données : `{ "version": 1, "pdf": "<chemin>", "annotations": [...] }`, coordonnées dans [0, 1], `page` ≥ 1, `taille` ∈ `s|m|l` (défaut `m`).
- Couche officielle : `partitions/<…>/X.pdf` → `annotations/<…>/X.json`. Couche personnelle : clé `localStorage` `orchestre_annotations:<chemin du pdf>`.
- Couleurs : officielles en bleu (lecture seule), personnelles en rouge (éditables).
- Le paramètre `?pdf=` n'est accepté que s'il désigne un `.pdf` sous `partitions/`, sans segment `..`.
- Textes visibles en français ; noms de fichiers/fonctions en français comme le spec (`symboles.js`, `store.js`, `editeur.js`) ; commentaires en anglais comme `app.js`.
- Commits en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ne rien pousser ni déployer : le dépôt est sur GitHub, toute publication relève de l'utilisateur.

## Review Focus

1. Noms de fichiers avec espaces, accents, apostrophes, virgules ou `#` (« Pirates des Caraïbes », « Höh' ») : le lien vers la visionneuse, le chargement du PDF et du `.json` officiel doivent tous fonctionner. → tests `urlDepuisChemin` (Task 2), `encodeURIComponent` dans `app.js` (Task 7).
2. Lien trafiqué `viewer.html?pdf=../…`, `?pdf=https://…`, `?pdf=` vide : refus avec message, aucun chargement. → tests `cheminPdfValide` (Task 2).
3. Texte libre contenant `<script>`, `&` ou des guillemets (saisi ou importé) : affiché tel quel, jamais interprété. → test d'échappement `rendreAnnotation` (Task 1).
4. Liaison tracée de droite à gauche avec « dessus » : doit quand même s'arrondir vers le haut. → test géométrie liaison (Task 1).
5. Données `localStorage` corrompues ou signe déplacé hors de la page : pas de plantage, données ignorées avec avertissement ; signe ramené au bord. → tests `chargerPersonnel` et `deplacer` (Tasks 2–3).

---

## Fichiers

| Fichier | Statut | Responsabilité |
|---|---|---|
| `package.json` | créer | `"type": "module"` + script `test` (outillage de test uniquement) |
| `js/annotations/symboles.js` | créer | Catalogue des signes, onglets, outils de palette, rendu SVG (chaînes) |
| `js/annotations/store.js` | créer | Chemins, validation, (dé)sérialisation, stockage local, `Calque` (annuler/rétablir), géométrie (sélection, déplacement) |
| `js/annotations/editeur.js` | créer | Outils et gestes (Pointer Events) ; ne touche pas au SVG |
| `viewer.html`, `css/viewer.css` | créer | Page de la visionneuse |
| `js/viewer.js` | créer | PDF.js, pages, zoom, calques, palette, menu export/import |
| `tests/symboles.test.js`, `tests/store.test.js` | créer | Tests `node --test` |
| `js/app.js`, `css/style.css` | modifier | Liens vers la visionneuse + lien « ⬇ PDF » |
| `README.md` | modifier | Documentation |

---

### Task 1: Catalogue et rendu des signes

**Files:**
- Create: `package.json`
- Create: `js/annotations/symboles.js`
- Test: `tests/symboles.test.js`

**Interfaces:**
- Consumes: rien.
- Produces :
  - `LARGEUR_REFERENCE: number` (= 1000) — largeur du `viewBox` de chaque page.
  - `TAILLES: { s: number, m: number, l: number }` — demi-hauteur d'un signe en fraction de largeur de page.
  - `ONGLETS: Array<{ id: string, libelle: string }>`
  - `SYMBOLES: Record<type, { onglet: string, libelle: string, nature: 'ponctuel'|'etirable', dessin: Function }>`
  - `OUTILS: Array<{ id: string, type: string, onglet: string, libelle: string, valeurs: object }>` — un bouton de palette par entrée (la liaison en donne deux : `liaison_dessus`, `liaison_dessous`).
  - `echapperXml(texte: string): string`
  - `rendreAnnotation(annotation, hauteur: number, { selectionnee?: boolean }): string` — `<g data-id=…>` en unités de page (largeur 1000, hauteur `hauteur`).
  - `apercuOutil(outil): string` — `<svg>` 32×32 pour le bouton de palette.

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "orchestre",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Écrire les tests qui échouent** — `tests/symboles.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SYMBOLES, OUTILS, ONGLETS, LARGEUR_REFERENCE, TAILLES,
    rendreAnnotation, apercuOutil, echapperXml
} from '../js/annotations/symboles.js';

const TYPES_ATTENDUS = [
    'tire', 'pousse', 'reprise', 'talon', 'pointe', 'milieu',
    'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'fp',
    'crescendo', 'decrescendo', 'cresc_texte', 'dim_texte',
    'liaison',
    'staccato', 'tenuto', 'accent', 'point_orgue', 'pizz', 'arco',
    'doigt_0', 'doigt_1', 'doigt_2', 'doigt_3', 'doigt_4',
    'corde_1', 'corde_2', 'corde_3', 'corde_4',
    'lunettes', 'cesure', 'texte'
];

function exemple(type) {
    const nature = SYMBOLES[type].nature;
    const base = { id: 'x', page: 1, type, taille: 'm' };
    if (nature === 'ponctuel') return { ...base, x: 0.5, y: 0.5, texte: 'rit.' };
    return { ...base, x1: 0.2, y1: 0.5, x2: 0.4, y2: 0.5, sens: 'dessus' };
}

// Extract the numbers of the first <path d="..."> in a rendering
function nombresDuChemin(svg) {
    const d = svg.match(/<path d="([^"]+)"/)[1];
    return d.match(/-?\d+(\.\d+)?/g).map(Number);
}

test('le catalogue contient exactement les signes du spec', () => {
    assert.deepEqual(Object.keys(SYMBOLES).sort(), [...TYPES_ATTENDUS].sort());
});

test('chaque signe appartient à un onglet existant et a une nature valide', () => {
    const onglets = new Set(ONGLETS.map(o => o.id));
    for (const [type, s] of Object.entries(SYMBOLES)) {
        assert.ok(onglets.has(s.onglet), `${type} : onglet ${s.onglet}`);
        assert.ok(['ponctuel', 'etirable'].includes(s.nature), type);
    }
});

test('seuls liaison et soufflets sont étirables', () => {
    const etirables = Object.keys(SYMBOLES).filter(t => SYMBOLES[t].nature === 'etirable').sort();
    assert.deepEqual(etirables, ['crescendo', 'decrescendo', 'liaison']);
});

test('chaque type produit un rendu non vide portant son id', () => {
    for (const type of TYPES_ATTENDUS) {
        const svg = rendreAnnotation(exemple(type), 1400);
        assert.match(svg, /^<g data-id="x"/, type);
        assert.ok(svg.length > 30, type);
    }
});

test('un type inconnu ne produit rien', () => {
    assert.equal(rendreAnnotation({ id: 'x', page: 1, type: 'inconnu', x: 0.5, y: 0.5 }, 1400), '');
});

test('un signe ponctuel est placé en unités de page et mis à l\'échelle de sa taille', () => {
    const svg = rendreAnnotation({ id: 'a', page: 1, type: 'tire', x: 0.25, y: 0.5, taille: 'l' }, 1400);
    const u = TAILLES.l * LARGEUR_REFERENCE;
    assert.ok(svg.includes(`transform="translate(250 700) scale(${u})"`), svg);
});

test('la taille par défaut est m', () => {
    const svg = rendreAnnotation({ id: 'a', page: 1, type: 'tire', x: 0.5, y: 0.5 }, 1000);
    assert.ok(svg.includes(`scale(${TAILLES.m * LARGEUR_REFERENCE})`), svg);
});

test('la sélection ajoute la classe selectionnee', () => {
    const svg = rendreAnnotation(exemple('tire'), 1000, { selectionnee: true });
    assert.match(svg, /class="selectionnee"/);
});

test('le texte libre est échappé', () => {
    const svg = rendreAnnotation({ id: 'a', page: 1, type: 'texte', x: 0.5, y: 0.5, texte: '<script>alert("x")</script> & co' }, 1000);
    assert.ok(!svg.includes('<script>'), svg);
    assert.ok(svg.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co'), svg);
});

test('l\'id est échappé', () => {
    const svg = rendreAnnotation({ ...exemple('tire'), id: '"><img>' }, 1000);
    assert.ok(svg.startsWith('<g data-id="&quot;&gt;&lt;img&gt;"'), svg);
});

test('echapperXml échappe les cinq caractères spéciaux', () => {
    assert.equal(echapperXml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('une liaison dessus s\'arrondit vers le haut, même tracée de droite à gauche', () => {
    for (const [x1, x2] of [[0.2, 0.4], [0.4, 0.2]]) {
        const svg = rendreAnnotation({ id: 'a', page: 1, type: 'liaison', x1, y1: 0.5, x2, y2: 0.5, sens: 'dessus' }, 1000);
        const [, y1, , cy, , y2] = nombresDuChemin(svg);   // M x1 y1 Q cx cy x2 y2
        assert.ok(cy < y1 && cy < y2, svg);
    }
});

test('une liaison dessous s\'arrondit vers le bas', () => {
    const svg = rendreAnnotation({ id: 'a', page: 1, type: 'liaison', x1: 0.4, y1: 0.5, x2: 0.2, y2: 0.5, sens: 'dessous' }, 1000);
    const [, y1, , cy] = nombresDuChemin(svg);
    assert.ok(cy > y1, svg);
});

test('un crescendo est fermé au départ et ouvert à l\'arrivée', () => {
    const svg = rendreAnnotation({ id: 'a', page: 1, type: 'crescendo', x1: 0.2, y1: 0.5, x2: 0.4, y2: 0.5 }, 1000);
    const [ax, ay, px, py, bx, by] = nombresDuChemin(svg);  // M ouverture+ L pointe L ouverture-
    assert.deepEqual([px, py], [200, 500]);
    assert.deepEqual([ax, bx], [400, 400]);
    assert.ok(ay < 500 && by > 500);
});

test('un decrescendo est ouvert au départ et fermé à l\'arrivée', () => {
    const svg = rendreAnnotation({ id: 'a', page: 1, type: 'decrescendo', x1: 0.2, y1: 0.5, x2: 0.4, y2: 0.5 }, 1000);
    const [ax, , px, py, bx] = nombresDuChemin(svg);
    assert.deepEqual([px, py], [400, 500]);
    assert.deepEqual([ax, bx], [200, 200]);
});

test('OUTILS : un bouton par signe, deux pour la liaison', () => {
    const ids = OUTILS.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('liaison_dessus') && ids.includes('liaison_dessous'));
    assert.ok(!ids.includes('liaison'));
    assert.equal(OUTILS.length, TYPES_ATTENDUS.length + 1);
    assert.deepEqual(OUTILS.find(o => o.id === 'liaison_dessous').valeurs, { sens: 'dessous' });
});

test('apercuOutil produit un svg pour chaque outil', () => {
    for (const outil of OUTILS) {
        assert.match(apercuOutil(outil), /^<svg [^>]*viewBox="-3 -3 6 6"/, outil.id);
    }
});
```

- [ ] **Step 3: Lancer les tests pour vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/js/annotations/symboles.js'`

- [ ] **Step 4: Écrire l'implémentation** — `js/annotations/symboles.js`

```js
// Catalogue of the musical signs that can be placed on a score.
//
// Each page overlay is an SVG whose viewBox is LARGEUR_REFERENCE units wide, so
// signs are drawn once in page units and CSS scales them with the zoom.
// Point signs are drawn in a unit space roughly spanning -1..1 around their
// anchor, then translated and scaled; stretched signs (slurs, hairpins) are
// drawn directly in page units between their two end points.

export const LARGEUR_REFERENCE = 1000;

// Half-height of a sign, as a fraction of the page width
export const TAILLES = { s: 0.005, m: 0.0075, l: 0.011 };

export const ONGLETS = [
    { id: 'archet', libelle: 'Archet' },
    { id: 'nuances', libelle: 'Nuances' },
    { id: 'evolution', libelle: 'Évolution' },
    { id: 'liaisons', libelle: 'Liaisons' },
    { id: 'articulations', libelle: 'Articulations' },
    { id: 'doigtes', libelle: 'Doigtés' },
    { id: 'reperes', libelle: 'Repères' }
];

export function echapperXml(texte) {
    return String(texte)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Keep the generated SVG short and stable
function n(valeur) {
    return Math.round(valeur * 100) / 100;
}

const TRAIT = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

// Text centred on the anchor, in unit space
function texte(contenu, { italique = false, gras = false, taille = 2 } = {}) {
    return `<text x="0" y="0" font-size="${taille}" text-anchor="middle" dominant-baseline="central"`
        + ` font-family="'Times New Roman', Times, serif"`
        + (italique ? ' font-style="italic"' : '')
        + (gras ? ' font-weight="bold"' : '')
        + ` fill="currentColor" stroke="none">${echapperXml(contenu)}</text>`;
}

function ponctuel(onglet, libelle, dessin) {
    return { onglet, libelle, nature: 'ponctuel', dessin };
}

function etirable(onglet, libelle, dessin) {
    return { onglet, libelle, nature: 'etirable', dessin };
}

function nuance(nom) {
    return ponctuel('nuances', nom, () => texte(nom, { italique: true, gras: true, taille: 2.4 }));
}

function mot(onglet, libelle, contenu, options) {
    return ponctuel(onglet, libelle, () => texte(contenu, options));
}

// Unit vector perpendicular to p1 -> p2 (rotated a quarter turn clockwise on screen,
// i.e. pointing up the page for a left-to-right segment)
function normale(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const longueur = Math.hypot(dx, dy) || 1;
    return { nx: dy / longueur, ny: -dx / longueur, longueur };
}

function liaison(p1, p2, u, annotation) {
    // Always curve relative to the left end, so "dessus" stays above whatever the drag direction
    const [gauche, droite] = p1.x <= p2.x ? [p1, p2] : [p2, p1];
    const { nx, ny, longueur } = normale(gauche, droite);
    const sens = annotation.sens === 'dessous' ? -1 : 1;
    // The curve peaks halfway to its control point
    const fleche = Math.min(longueur * 0.25, 3 * u) * 2 * sens;
    const cx = (gauche.x + droite.x) / 2 + nx * fleche;
    const cy = (gauche.y + droite.y) / 2 + ny * fleche;
    return `<path d="M ${n(gauche.x)} ${n(gauche.y)} Q ${n(cx)} ${n(cy)} ${n(droite.x)} ${n(droite.y)}" ${TRAIT} stroke-width="${n(u * 0.18)}"/>`;
}

function soufflet(ouvertAuDepart) {
    return (p1, p2, u) => {
        const { nx, ny } = normale(p1, p2);
        const ouverture = ouvertAuDepart ? p1 : p2;
        const pointe = ouvertAuDepart ? p2 : p1;
        const demi = u * 0.8;
        return `<path d="M ${n(ouverture.x + nx * demi)} ${n(ouverture.y + ny * demi)}`
            + ` L ${n(pointe.x)} ${n(pointe.y)}`
            + ` L ${n(ouverture.x - nx * demi)} ${n(ouverture.y - ny * demi)}" ${TRAIT} stroke-width="${n(u * 0.15)}"/>`;
    };
}

export const SYMBOLES = {
    // Archet
    tire: ponctuel('archet', 'Tiré', () =>
        `<path d="M -1 0.8 V -0.6 H 1 V 0.8" ${TRAIT} stroke-width="0.25"/>`
        + `<path d="M -1 -0.6 H 1" ${TRAIT} stroke-width="0.5"/>`),
    pousse: ponctuel('archet', 'Poussé', () =>
        `<path d="M -0.8 -1 L 0 1 L 0.8 -1" ${TRAIT} stroke-width="0.25"/>`),
    reprise: ponctuel('archet', 'Reprise d\'archet', () =>
        `<circle cx="0" cy="-0.5" r="0.4" fill="currentColor"/>`
        + `<path d="M 0.35 -0.4 Q 0.35 0.5 -0.3 1" ${TRAIT} stroke-width="0.22"/>`),
    talon: mot('archet', 'Talon', 'Talon', { italique: true, taille: 1.6 }),
    pointe: mot('archet', 'Pointe', 'Pte', { italique: true, taille: 1.6 }),
    milieu: mot('archet', 'Milieu', 'M', { italique: true, taille: 1.6 }),

    // Nuances
    ppp: nuance('ppp'),
    pp: nuance('pp'),
    p: nuance('p'),
    mp: nuance('mp'),
    mf: nuance('mf'),
    f: nuance('f'),
    ff: nuance('ff'),
    fff: nuance('fff'),
    sfz: nuance('sfz'),
    fp: nuance('fp'),

    // Évolution
    crescendo: etirable('evolution', 'Crescendo', soufflet(false)),
    decrescendo: etirable('evolution', 'Decrescendo', soufflet(true)),
    cresc_texte: mot('evolution', 'cresc.', 'cresc.', { italique: true, taille: 1.8 }),
    dim_texte: mot('evolution', 'dim.', 'dim.', { italique: true, taille: 1.8 }),

    // Liaisons
    liaison: etirable('liaisons', 'Liaison', liaison),

    // Articulations
    staccato: ponctuel('articulations', 'Staccato', () =>
        '<circle cx="0" cy="0" r="0.35" fill="currentColor"/>'),
    tenuto: ponctuel('articulations', 'Tenuto', () =>
        `<path d="M -0.9 0 H 0.9" ${TRAIT} stroke-width="0.3"/>`),
    accent: ponctuel('articulations', 'Accent', () =>
        `<path d="M -1 -0.6 L 1 0 L -1 0.6" ${TRAIT} stroke-width="0.25"/>`),
    point_orgue: ponctuel('articulations', 'Point d\'orgue', () =>
        `<path d="M -1.2 0.6 A 1.2 1.2 0 0 1 1.2 0.6" ${TRAIT} stroke-width="0.22"/>`
        + '<circle cx="0" cy="0.25" r="0.28" fill="currentColor"/>'),
    pizz: mot('articulations', 'Pizz.', 'pizz.', { italique: true, taille: 1.8 }),
    arco: mot('articulations', 'Arco', 'arco', { italique: true, taille: 1.8 }),

    // Doigtés
    doigt_0: mot('doigtes', 'Doigt 0', '0', { taille: 1.8 }),
    doigt_1: mot('doigtes', 'Doigt 1', '1', { taille: 1.8 }),
    doigt_2: mot('doigtes', 'Doigt 2', '2', { taille: 1.8 }),
    doigt_3: mot('doigtes', 'Doigt 3', '3', { taille: 1.8 }),
    doigt_4: mot('doigtes', 'Doigt 4', '4', { taille: 1.8 }),
    corde_1: mot('doigtes', 'Corde I (Mi)', 'I', { taille: 1.8 }),
    corde_2: mot('doigtes', 'Corde II (La)', 'II', { taille: 1.8 }),
    corde_3: mot('doigtes', 'Corde III (Ré)', 'III', { taille: 1.8 }),
    corde_4: mot('doigtes', 'Corde IV (Sol)', 'IV', { taille: 1.8 }),

    // Repères
    lunettes: mot('reperes', 'Attention (lunettes)', '👓', { taille: 2.2 }),
    cesure: ponctuel('reperes', 'Césure', () =>
        `<path d="M -0.9 0.9 L -0.1 -0.9 M 0.1 0.9 L 0.9 -0.9" ${TRAIT} stroke-width="0.25"/>`),
    texte: ponctuel('reperes', 'Texte libre', annotation =>
        texte(annotation.texte ?? '', { italique: true, taille: 1.8 }))
};

// One palette button per sign; a slur gets one button per side
export const OUTILS = Object.entries(SYMBOLES).flatMap(([type, symbole]) => {
    if (type === 'liaison') {
        return [
            { id: 'liaison_dessus', type, onglet: symbole.onglet, libelle: 'Liaison au-dessus', valeurs: { sens: 'dessus' } },
            { id: 'liaison_dessous', type, onglet: symbole.onglet, libelle: 'Liaison en dessous', valeurs: { sens: 'dessous' } }
        ];
    }
    return [{ id: type, type, onglet: symbole.onglet, libelle: symbole.libelle, valeurs: {} }];
});

export function rendreAnnotation(annotation, hauteur, { selectionnee = false } = {}) {
    const symbole = SYMBOLES[annotation.type];
    if (!symbole) {
        return '';
    }

    const u = (TAILLES[annotation.taille] ?? TAILLES.m) * LARGEUR_REFERENCE;
    const debut = `<g data-id="${echapperXml(annotation.id ?? '')}"${selectionnee ? ' class="selectionnee"' : ''}`;

    if (symbole.nature === 'ponctuel') {
        const x = n(annotation.x * LARGEUR_REFERENCE);
        const y = n(annotation.y * hauteur);
        return `${debut} transform="translate(${x} ${y}) scale(${u})">${symbole.dessin(annotation)}</g>`;
    }

    const p1 = { x: annotation.x1 * LARGEUR_REFERENCE, y: annotation.y1 * hauteur };
    const p2 = { x: annotation.x2 * LARGEUR_REFERENCE, y: annotation.y2 * hauteur };
    return `${debut}>${symbole.dessin(p1, p2, u, annotation)}</g>`;
}

// Small icon for a palette button
export function apercuOutil(outil) {
    const symbole = SYMBOLES[outil.type];
    const annotation = { type: outil.type, ...outil.valeurs, texte: 'abc' };
    const contenu = symbole.nature === 'ponctuel'
        ? symbole.dessin(annotation)
        : symbole.dessin({ x: -2.4, y: 0 }, { x: 2.4, y: 0 }, 1, annotation);
    return `<svg viewBox="-3 -3 6 6" width="32" height="32" aria-hidden="true">${contenu}</svg>`;
}
```

- [ ] **Step 5: Lancer les tests**

Run: `npm test`
Expected: PASS, tous les tests de `tests/symboles.test.js`.

- [ ] **Step 6: Commit**

```bash
git add package.json js/annotations/symboles.js tests/symboles.test.js
git commit -m "Ajouter le catalogue des signes musicaux et leur rendu SVG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chemins, validation, sérialisation et stockage local

**Files:**
- Create: `js/annotations/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: `SYMBOLES` (Task 1).
- Produces :
  - `VERSION = 1`, `PREFIXE_STOCKAGE = 'orchestre_annotations:'`, `LONGUEUR_TEXTE_MAX = 200`
  - `cheminPdfValide(chemin: unknown): boolean`
  - `urlDepuisChemin(chemin: string): string` — encode chaque segment.
  - `cheminOfficiel(cheminPdf: string): string`
  - `nouvelId(): string`
  - `arrondirCoord(v: number): number` — borne à [0, 1] et arrondit à 4 décimales.
  - `validerAnnotation(brute): object | null`
  - `validerDocument(doc): { pdf: string|null, annotations: object[], rejetees: number }` — lève `Error` si le document est refusé en entier.
  - `lireDocument(texte: string)` — idem, depuis du JSON.
  - `serialiser(cheminPdf: string, annotations: object[]): string`
  - `chargerPersonnel(stockage: Storage|null, cheminPdf): { annotations, rejetees, corrompu? }`
  - `sauverPersonnel(stockage: Storage|null, cheminPdf, annotations): boolean`

- [ ] **Step 1: Écrire les tests qui échouent** — `tests/store.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    VERSION, PREFIXE_STOCKAGE, LONGUEUR_TEXTE_MAX,
    cheminPdfValide, urlDepuisChemin, cheminOfficiel, nouvelId, arrondirCoord,
    validerAnnotation, validerDocument, lireDocument, serialiser,
    chargerPersonnel, sauverPersonnel
} from '../js/annotations/store.js';

const PDF = 'partitions/Nord Deux Sèvres/Violon 1/Bohemian Rhapsody, violon 1.pdf';

// Minimal in-memory Storage
function stockageMemoire(initial = {}) {
    const donnees = new Map(Object.entries(initial));
    return {
        getItem: k => (donnees.has(k) ? donnees.get(k) : null),
        setItem: (k, v) => donnees.set(k, String(v)),
        removeItem: k => donnees.delete(k),
        donnees
    };
}

test('cheminPdfValide accepte un PDF sous partitions/', () => {
    assert.equal(cheminPdfValide(PDF), true);
    assert.equal(cheminPdfValide("partitions/Nord Deux Sèvres/V1-V2-Vcelle - 13 - Allein Gott in der Höh' sei Ehr' (Bach).pdf"), true);
    assert.equal(cheminPdfValide('partitions/a/B.PDF'), true);
});

test('cheminPdfValide refuse les chemins dangereux ou absents', () => {
    for (const chemin of [
        null, undefined, '', 42,
        'partitions/../secret.pdf',
        'partitions/./a.pdf',
        'partitions//a.pdf',
        '/partitions/a.pdf',
        'https://exemple.com/partitions/a.pdf',
        'javascript:alert(1)//partitions/a.pdf',
        'partitions/a.txt',
        'partitions\\..\\a.pdf',
        'autre/a.pdf'
    ]) {
        assert.equal(cheminPdfValide(chemin), false, String(chemin));
    }
});

test('urlDepuisChemin encode chaque segment mais garde les /', () => {
    assert.equal(
        urlDepuisChemin("partitions/Nord Deux Sèvres/Höh' #1, a?b.pdf"),
        "partitions/Nord%20Deux%20S%C3%A8vres/H%C3%B6h'%20%231%2C%20a%3Fb.pdf"
    );
});

test('cheminOfficiel reproduit le chemin sous annotations/', () => {
    assert.equal(cheminOfficiel(PDF), 'annotations/Nord Deux Sèvres/Violon 1/Bohemian Rhapsody, violon 1.json');
    assert.equal(cheminOfficiel('partitions/a/B.PDF'), 'annotations/a/B.json');
});

test('nouvelId produit des identifiants distincts', () => {
    const ids = new Set(Array.from({ length: 500 }, nouvelId));
    assert.equal(ids.size, 500);
});

test('arrondirCoord borne et arrondit', () => {
    assert.equal(arrondirCoord(-0.2), 0);
    assert.equal(arrondirCoord(1.7), 1);
    assert.equal(arrondirCoord(0.123456), 0.1235);
});

test('validerAnnotation nettoie un signe ponctuel valide', () => {
    assert.deepEqual(
        validerAnnotation({ id: 'a1', page: 2, type: 'tire', x: 0.1, y: 0.2, taille: 'l', inconnu: 'x' }),
        { id: 'a1', page: 2, type: 'tire', taille: 'l', x: 0.1, y: 0.2 }
    );
});

test('validerAnnotation complète les valeurs par défaut', () => {
    const a = validerAnnotation({ page: 1, type: 'liaison', x1: 0, y1: 0, x2: 1, y2: 1, taille: 'xxl' });
    assert.equal(a.taille, 'm');
    assert.equal(a.sens, 'dessus');
    assert.equal(typeof a.id, 'string');
    assert.ok(a.id.length > 0);
});

test('validerAnnotation rejette les annotations invalides', () => {
    for (const brute of [
        null, 'texte',
        { page: 1, type: 'inconnu', x: 0.5, y: 0.5 },
        { page: 0, type: 'tire', x: 0.5, y: 0.5 },
        { page: 1.5, type: 'tire', x: 0.5, y: 0.5 },
        { page: 1, type: 'tire', x: 1.2, y: 0.5 },
        { page: 1, type: 'tire', x: '0.5', y: 0.5 },
        { page: 1, type: 'tire', y: 0.5 },
        { page: 1, type: 'liaison', x1: 0, y1: 0, x2: 1 },
        { page: 1, type: 'texte', x: 0.5, y: 0.5, texte: '   ' },
        { page: 1, type: 'texte', x: 0.5, y: 0.5 }
    ]) {
        assert.equal(validerAnnotation(brute), null, JSON.stringify(brute));
    }
});

test('validerAnnotation tronque le texte libre', () => {
    const a = validerAnnotation({ page: 1, type: 'texte', x: 0.5, y: 0.5, texte: `  ${'x'.repeat(500)}  ` });
    assert.equal(a.texte.length, LONGUEUR_TEXTE_MAX);
});

test('validerDocument écarte les annotations invalides une à une', () => {
    const resultat = validerDocument({
        version: VERSION,
        pdf: PDF,
        annotations: [
            { id: 'a', page: 1, type: 'tire', x: 0.5, y: 0.5 },
            { id: 'b', page: 1, type: 'inconnu', x: 0.5, y: 0.5 },
            { id: 'c', page: 1, type: 'p', x: 0.2, y: 0.2 }
        ]
    });
    assert.equal(resultat.pdf, PDF);
    assert.deepEqual(resultat.annotations.map(a => a.id), ['a', 'c']);
    assert.equal(resultat.rejetees, 1);
});

test('validerDocument renomme les ids en double', () => {
    const { annotations } = validerDocument({
        version: VERSION,
        annotations: [
            { id: 'a', page: 1, type: 'tire', x: 0.5, y: 0.5 },
            { id: 'a', page: 1, type: 'p', x: 0.2, y: 0.2 }
        ]
    });
    assert.equal(annotations[0].id, 'a');
    assert.notEqual(annotations[1].id, 'a');
});

test('validerDocument refuse un document non reconnu', () => {
    for (const doc of [null, [], {}, { version: 2, annotations: [] }, { version: VERSION }, { version: VERSION, annotations: {} }]) {
        assert.throws(() => validerDocument(doc), /non reconnu/, JSON.stringify(doc));
    }
});

test('lireDocument refuse du JSON invalide', () => {
    assert.throws(() => lireDocument('{pas du json'), /illisible/);
});

test('serialiser puis lireDocument redonne les mêmes annotations', () => {
    const annotations = [
        { id: 'a', page: 1, type: 'tire', taille: 'm', x: 0.5, y: 0.5 },
        { id: 'b', page: 2, type: 'liaison', taille: 's', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.2, sens: 'dessous' },
        { id: 'c', page: 1, type: 'texte', taille: 'l', x: 0.4, y: 0.6, texte: 'rit.' }
    ];
    const texte = serialiser(PDF, annotations);
    assert.equal(JSON.parse(texte).version, VERSION);
    const relu = lireDocument(texte);
    assert.equal(relu.pdf, PDF);
    assert.deepEqual(relu.annotations, annotations);
    assert.equal(relu.rejetees, 0);
});

test('chargerPersonnel sans stockage ou sans données renvoie une couche vide', () => {
    assert.deepEqual(chargerPersonnel(null, PDF), { annotations: [], rejetees: 0 });
    assert.deepEqual(chargerPersonnel(stockageMemoire(), PDF), { annotations: [], rejetees: 0 });
});

test('chargerPersonnel signale des données corrompues sans planter', () => {
    const stockage = stockageMemoire({ [PREFIXE_STOCKAGE + PDF]: '{cassé' });
    assert.deepEqual(chargerPersonnel(stockage, PDF), { annotations: [], rejetees: 0, corrompu: true });
});

test('chargerPersonnel survit à un stockage qui lève une exception', () => {
    const stockage = { getItem() { throw new Error('SecurityError'); } };
    assert.deepEqual(chargerPersonnel(stockage, PDF), { annotations: [], rejetees: 0 });
});

test('sauverPersonnel puis chargerPersonnel redonne les annotations', () => {
    const stockage = stockageMemoire();
    const annotations = [{ id: 'a', page: 1, type: 'tire', taille: 'm', x: 0.5, y: 0.5 }];
    assert.equal(sauverPersonnel(stockage, PDF, annotations), true);
    assert.ok(stockage.donnees.has(PREFIXE_STOCKAGE + PDF));
    assert.deepEqual(chargerPersonnel(stockage, PDF).annotations, annotations);
});

test('sauverPersonnel efface la clé quand la couche est vide', () => {
    const stockage = stockageMemoire({ [PREFIXE_STOCKAGE + PDF]: 'x' });
    assert.equal(sauverPersonnel(stockage, PDF, []), true);
    assert.equal(stockage.donnees.has(PREFIXE_STOCKAGE + PDF), false);
});

test('sauverPersonnel renvoie false si le stockage est absent ou plein', () => {
    assert.equal(sauverPersonnel(null, PDF, []), false);
    const plein = { setItem() { throw new Error('QuotaExceededError'); }, removeItem() {} };
    assert.equal(sauverPersonnel(plein, PDF, [{ id: 'a', page: 1, type: 'p', x: 0, y: 0 }]), false);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/js/annotations/store.js'`

- [ ] **Step 3: Écrire l'implémentation** — `js/annotations/store.js`

```js
// Annotation data: paths, validation, (de)serialisation and browser storage.
// No DOM access here, so everything can be tested under Node.

import { SYMBOLES } from './symboles.js';

export const VERSION = 1;
export const PREFIXE_STOCKAGE = 'orchestre_annotations:';
export const LONGUEUR_TEXTE_MAX = 200;

const TAILLES_VALIDES = ['s', 'm', 'l'];
const DOSSIER_PARTITIONS = 'partitions/';
const DOSSIER_ANNOTATIONS = 'annotations/';

// Only PDFs of the library may be opened by the viewer, whatever the shared link says
export function cheminPdfValide(chemin) {
    if (typeof chemin !== 'string') return false;
    if (!chemin.startsWith(DOSSIER_PARTITIONS) || !/\.pdf$/i.test(chemin)) return false;
    if (chemin.includes('\\')) return false;
    return !chemin.split('/').some(segment => segment === '' || segment === '.' || segment === '..');
}

// File names hold spaces, accents, commas, apostrophes...: encode each segment, keep the slashes
export function urlDepuisChemin(chemin) {
    return chemin.split('/').map(encodeURIComponent).join('/');
}

// partitions/<...>/X.pdf -> annotations/<...>/X.json
export function cheminOfficiel(cheminPdf) {
    return DOSSIER_ANNOTATIONS + cheminPdf.slice(DOSSIER_PARTITIONS.length).replace(/\.pdf$/i, '.json');
}

export function nouvelId() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function borne(valeur, min, max) {
    return Math.min(max, Math.max(min, valeur));
}

// Page coordinates live in [0, 1]; four decimals is far below a pixel
export function arrondirCoord(valeur) {
    return Math.round(borne(valeur, 0, 1) * 10000) / 10000;
}

function estCoord(valeur) {
    return typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0 && valeur <= 1;
}

// Return a clean copy of an annotation, or null if it cannot be displayed
export function validerAnnotation(brute) {
    if (!brute || typeof brute !== 'object') return null;

    const symbole = SYMBOLES[brute.type];
    if (!symbole) return null;
    if (!Number.isInteger(brute.page) || brute.page < 1) return null;

    const propre = {
        id: typeof brute.id === 'string' && brute.id ? brute.id : nouvelId(),
        page: brute.page,
        type: brute.type,
        taille: TAILLES_VALIDES.includes(brute.taille) ? brute.taille : 'm'
    };

    const coordonnees = symbole.nature === 'ponctuel' ? ['x', 'y'] : ['x1', 'y1', 'x2', 'y2'];
    for (const cle of coordonnees) {
        if (!estCoord(brute[cle])) return null;
        propre[cle] = brute[cle];
    }

    if (brute.type === 'liaison') {
        propre.sens = brute.sens === 'dessous' ? 'dessous' : 'dessus';
    }

    if (brute.type === 'texte') {
        if (typeof brute.texte !== 'string' || !brute.texte.trim()) return null;
        propre.texte = brute.texte.trim().slice(0, LONGUEUR_TEXTE_MAX);
    }

    return propre;
}

// Invalid annotations are dropped one by one; an unknown document is refused whole
export function validerDocument(doc) {
    if (!doc || typeof doc !== 'object' || doc.version !== VERSION || !Array.isArray(doc.annotations)) {
        throw new Error('Fichier d\'annotations non reconnu');
    }

    const ids = new Set();
    const annotations = [];
    let rejetees = 0;

    for (const brute of doc.annotations) {
        const annotation = validerAnnotation(brute);
        if (!annotation) {
            rejetees++;
            continue;
        }
        if (ids.has(annotation.id)) {
            annotation.id = nouvelId();
        }
        ids.add(annotation.id);
        annotations.push(annotation);
    }

    return { pdf: typeof doc.pdf === 'string' ? doc.pdf : null, annotations, rejetees };
}

export function lireDocument(texte) {
    let doc;
    try {
        doc = JSON.parse(texte);
    } catch {
        throw new Error('Fichier d\'annotations illisible (JSON invalide)');
    }
    return validerDocument(doc);
}

export function serialiser(cheminPdf, annotations) {
    return JSON.stringify({ version: VERSION, pdf: cheminPdf, annotations }, null, 2);
}

// `stockage` is window.localStorage, or null when the browser refuses it
export function chargerPersonnel(stockage, cheminPdf) {
    const vide = { annotations: [], rejetees: 0 };
    if (!stockage) return vide;

    let texte;
    try {
        texte = stockage.getItem(PREFIXE_STOCKAGE + cheminPdf);
    } catch {
        return vide;
    }
    if (texte === null) return vide;

    try {
        const { annotations, rejetees } = lireDocument(texte);
        return { annotations, rejetees };
    } catch {
        return { ...vide, corrompu: true };
    }
}

export function sauverPersonnel(stockage, cheminPdf, annotations) {
    if (!stockage) return false;

    try {
        if (annotations.length === 0) {
            stockage.removeItem(PREFIXE_STOCKAGE + cheminPdf);
        } else {
            stockage.setItem(PREFIXE_STOCKAGE + cheminPdf, serialiser(cheminPdf, annotations));
        }
        return true;
    } catch {
        return false;
    }
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS (symboles + store).

- [ ] **Step 5: Commit**

```bash
git add js/annotations/store.js tests/store.test.js
git commit -m "Valider, sérialiser et enregistrer les annotations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Calque (annuler/rétablir) et géométrie de sélection

**Files:**
- Modify: `js/annotations/store.js` (ajout en fin de fichier)
- Test: `tests/store.test.js` (ajout en fin de fichier)

**Interfaces:**
- Consumes: `borne` et `arrondirCoord` internes à `store.js` (Task 2).
- Produces :
  - `class Calque` : `constructor(annotations = [])`, getter `annotations` (tableau à traiter en lecture seule), getters `peutAnnuler`, `peutRetablir`, méthodes `ajouter(annotation)`, `modifier(id, champs)`, `supprimer(id)`, `remplacer(annotations)`, `annuler(): boolean`, `retablir(): boolean`, `trouver(id): object|undefined`.
  - `annotationProche(annotations, page, x, y, ratio, seuil): object|null` — `ratio` = hauteur/largeur de la page ; distances mesurées en largeurs de page.
  - `deplacer(annotation, dx, dy): object` — champs de coordonnées à fusionner, bornés à la page.

- [ ] **Step 1: Ajouter les tests qui échouent** — fin de `tests/store.test.js`

Ajouter `Calque, annotationProche, deplacer` à l'import existant en tête du fichier, puis :

```js
const A = { id: 'a', page: 1, type: 'tire', taille: 'm', x: 0.5, y: 0.5 };
const B = { id: 'b', page: 1, type: 'p', taille: 'm', x: 0.2, y: 0.2 };

test('Calque : ajouter, modifier, supprimer', () => {
    const calque = new Calque([A]);
    calque.ajouter(B);
    assert.deepEqual(calque.annotations.map(a => a.id), ['a', 'b']);
    calque.modifier('a', { x: 0.6 });
    assert.equal(calque.trouver('a').x, 0.6);
    calque.supprimer('a');
    assert.deepEqual(calque.annotations.map(a => a.id), ['b']);
});

test('Calque : ne garde pas de référence aux objets fournis', () => {
    const source = { ...A };
    const calque = new Calque([source]);
    source.x = 0.9;
    assert.equal(calque.trouver('a').x, 0.5);
});

test('Calque : annuler et rétablir', () => {
    const calque = new Calque([A]);
    assert.equal(calque.peutAnnuler, false);
    calque.ajouter(B);
    calque.modifier('a', { x: 0.7 });
    assert.equal(calque.annuler(), true);
    assert.equal(calque.trouver('a').x, 0.5);
    assert.equal(calque.annuler(), true);
    assert.deepEqual(calque.annotations.map(a => a.id), ['a']);
    assert.equal(calque.annuler(), false);
    assert.equal(calque.retablir(), true);
    assert.equal(calque.retablir(), true);
    assert.equal(calque.trouver('a').x, 0.7);
    assert.equal(calque.retablir(), false);
});

test('Calque : une nouvelle action efface le futur', () => {
    const calque = new Calque();
    calque.ajouter(A);
    calque.annuler();
    calque.ajouter(B);
    assert.equal(calque.peutRetablir, false);
    assert.deepEqual(calque.annotations.map(a => a.id), ['b']);
});

test('Calque : modifier ou supprimer un id inconnu ne crée pas d\'étape', () => {
    const calque = new Calque([A]);
    calque.modifier('zzz', { x: 0 });
    calque.supprimer('zzz');
    assert.equal(calque.peutAnnuler, false);
});

test('Calque : remplacer est annulable', () => {
    const calque = new Calque([A]);
    calque.remplacer([]);
    assert.equal(calque.annotations.length, 0);
    calque.annuler();
    assert.deepEqual(calque.annotations.map(a => a.id), ['a']);
});

test('Calque : l\'historique est limité à 100 étapes', () => {
    const calque = new Calque();
    for (let i = 0; i < 150; i++) calque.ajouter({ ...A, id: `n${i}` });
    let etapes = 0;
    while (calque.annuler()) etapes++;
    assert.equal(etapes, 100);
});

test('annotationProche trouve le signe le plus proche sur la bonne page', () => {
    const liste = [A, B, { ...A, id: 'autrePage', page: 2 }];
    assert.equal(annotationProche(liste, 1, 0.51, 0.5, 1.4, 0.03).id, 'a');
    assert.equal(annotationProche(liste, 1, 0.8, 0.8, 1.4, 0.03), null);
    assert.equal(annotationProche(liste, 2, 0.5, 0.5, 1.4, 0.03).id, 'autrePage');
});

test('annotationProche tient compte du ratio de la page en hauteur', () => {
    // 0.02 de hauteur sur une page 1.5 fois plus haute que large = 0.03 de largeur
    assert.equal(annotationProche([A], 1, 0.5, 0.52, 1.5, 0.025), null);
    assert.equal(annotationProche([A], 1, 0.5, 0.52, 1.5, 0.035).id, 'a');
});

test('annotationProche mesure la distance au segment d\'un signe étirable', () => {
    const liaison = { id: 'l', page: 1, type: 'liaison', x1: 0.2, y1: 0.5, x2: 0.6, y2: 0.5 };
    assert.equal(annotationProche([liaison], 1, 0.4, 0.51, 1, 0.02).id, 'l');
    assert.equal(annotationProche([liaison], 1, 0.7, 0.5, 1, 0.02), null);
});

test('annotationProche préfère le signe posé en dernier à égalité', () => {
    const dessus = { ...A, id: 'dessus' };
    assert.equal(annotationProche([A, dessus], 1, 0.5, 0.5, 1, 0.02).id, 'dessus');
});

test('deplacer décale un signe ponctuel et le garde sur la page', () => {
    assert.deepEqual(deplacer(A, 0.1, -0.2), { x: 0.6, y: 0.3 });
    assert.deepEqual(deplacer(A, 0.9, -0.9), { x: 1, y: 0 });
});

test('deplacer décale un signe étirable sans le déformer au bord', () => {
    const liaison = { id: 'l', page: 1, type: 'liaison', x1: 0.7, y1: 0.5, x2: 0.9, y2: 0.6 };
    assert.deepEqual(deplacer(liaison, 0.5, 0), { x1: 0.8, y1: 0.5, x2: 1, y2: 0.6 });
    assert.deepEqual(deplacer(liaison, 0, -0.9), { x1: 0.7, y1: 0, x2: 0.9, y2: 0.1 });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'Calque'`

- [ ] **Step 3: Écrire l'implémentation** — fin de `js/annotations/store.js`

```js
const HISTORIQUE_MAX = 100;

// One editable layer with undo/redo. Every change replaces the array, so a
// history step is simply the previous array.
export class Calque {
    #annotations;
    #passe = [];
    #futur = [];

    constructor(annotations = []) {
        this.#annotations = annotations.map(a => ({ ...a }));
    }

    // Read-only: change it through the methods below
    get annotations() {
        return this.#annotations;
    }

    get peutAnnuler() {
        return this.#passe.length > 0;
    }

    get peutRetablir() {
        return this.#futur.length > 0;
    }

    trouver(id) {
        return this.#annotations.find(a => a.id === id);
    }

    #appliquer(nouvelles) {
        this.#passe.push(this.#annotations);
        if (this.#passe.length > HISTORIQUE_MAX) {
            this.#passe.shift();
        }
        this.#futur = [];
        this.#annotations = nouvelles;
    }

    ajouter(annotation) {
        this.#appliquer([...this.#annotations, { ...annotation }]);
    }

    modifier(id, champs) {
        if (!this.trouver(id)) return;
        this.#appliquer(this.#annotations.map(a => (a.id === id ? { ...a, ...champs } : a)));
    }

    supprimer(id) {
        if (!this.trouver(id)) return;
        this.#appliquer(this.#annotations.filter(a => a.id !== id));
    }

    remplacer(annotations) {
        this.#appliquer(annotations.map(a => ({ ...a })));
    }

    annuler() {
        if (!this.peutAnnuler) return false;
        this.#futur.push(this.#annotations);
        this.#annotations = this.#passe.pop();
        return true;
    }

    retablir() {
        if (!this.peutRetablir) return false;
        this.#passe.push(this.#annotations);
        this.#annotations = this.#futur.pop();
        return true;
    }
}

function distanceSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const carre = dx * dx + dy * dy;
    const t = carre === 0 ? 0 : borne(((px - ax) * dx + (py - ay) * dy) / carre, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// `ratio` is page height / page width, so both axes are measured in page widths.
// On a tie the sign placed last (drawn on top) wins.
export function annotationProche(annotations, page, x, y, ratio, seuil) {
    let meilleure = null;
    let meilleureDistance = seuil;

    for (const annotation of annotations) {
        if (annotation.page !== page) continue;

        const distance = 'x' in annotation
            ? Math.hypot(annotation.x - x, (annotation.y - y) * ratio)
            : distanceSegment(x, y * ratio, annotation.x1, annotation.y1 * ratio, annotation.x2, annotation.y2 * ratio);

        if (distance <= meilleureDistance) {
            meilleure = annotation;
            meilleureDistance = distance;
        }
    }

    return meilleure;
}

// Coordinates to merge into an annotation moved by (dx, dy); it never leaves the page,
// and a stretched sign keeps its shape against the edge
export function deplacer(annotation, dx, dy) {
    if ('x' in annotation) {
        return { x: arrondirCoord(annotation.x + dx), y: arrondirCoord(annotation.y + dy) };
    }

    const { x1, y1, x2, y2 } = annotation;
    const ddx = borne(dx, -Math.min(x1, x2), 1 - Math.max(x1, x2));
    const ddy = borne(dy, -Math.min(y1, y2), 1 - Math.max(y1, y2));
    return {
        x1: arrondirCoord(x1 + ddx),
        y1: arrondirCoord(y1 + ddy),
        x2: arrondirCoord(x2 + ddx),
        y2: arrondirCoord(y2 + ddy)
    };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/annotations/store.js tests/store.test.js
git commit -m "Ajouter l'historique d'annulation et la sélection des signes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Visionneuse en lecture (PDF, zoom, calques)

**Files:**
- Create: `viewer.html`
- Create: `css/viewer.css`
- Create: `js/viewer.js`

**Interfaces:**
- Consumes: `cheminPdfValide`, `urlDepuisChemin`, `cheminOfficiel`, `lireDocument`, `chargerPersonnel`, `sauverPersonnel`, `Calque` (Tasks 2–3) ; `rendreAnnotation`, `LARGEUR_REFERENCE` (Task 1).
- Produces (internes à `viewer.js`, utilisés par les Tasks 5–6) :
  - `etat` : `{ cheminPdf, pdf, pages, zoom, officielles, calque, stockage, editeur, alerteSauvegarde }`
  - `etat.pages[i]` : `{ num, pdfPage, element, canvas, svg, ratio, largeurRendue, tache }`
  - `redessinerCalques(num)`, `redessinerTout()`, `enregistrer()`, `avertir(message)`.
  - DOM : chaque page est un `div.page[data-page=N]` contenant `canvas` puis `svg.calques-page` ; ce SVG contient `g.calque-officiel` puis `g.calque-perso`.

Choix d'interaction (précise le spec) : le pincement pour zoomer est le **zoom natif du navigateur** (non bloqué par le `meta viewport`) ; les boutons +/− redessinent la partition nette à la nouvelle taille.

- [ ] **Step 1: Créer `viewer.html`**

Tous les contrôles sont présents dès maintenant ; la palette et le menu sont branchés aux Tasks 5 et 6.

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Partition - Orchestre à Cordes</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/viewer.css">
</head>
<body>
    <header class="barre">
        <a href="index.html" class="bouton" id="retour" title="Retour à la liste" aria-label="Retour à la liste">←</a>
        <h1 id="titre" class="titre">Partition</h1>
        <div class="barre-actions">
            <button class="bouton" id="zoomMoins" title="Dézoomer" aria-label="Dézoomer">−</button>
            <button class="bouton" id="zoomPlus" title="Zoomer" aria-label="Zoomer">+</button>
            <a class="bouton" id="telecharger" title="Télécharger le PDF" download>⬇ PDF</a>
            <button class="bouton" id="basculerAnnoter" aria-pressed="false" title="Annoter" aria-label="Annoter">✏️</button>
            <div class="menu">
                <button class="bouton" id="ouvrirMenu" aria-haspopup="true" aria-expanded="false" title="Plus d'options" aria-label="Plus d'options">⋯</button>
                <div class="menu-liste" id="menuListe" hidden>
                    <button id="exporter">Exporter mes annotations</button>
                    <button id="importer">Importer des annotations</button>
                    <button id="effacer">Tout effacer</button>
                </div>
            </div>
        </div>
    </header>

    <div class="calques">
        <label><input type="checkbox" id="voirOfficiel" checked> <span class="pastille officiel"></span> Officielles</label>
        <label><input type="checkbox" id="voirPerso" checked> <span class="pastille perso"></span> Mes annotations</label>
    </div>

    <div id="bandeau" class="bandeau" hidden></div>

    <main id="pages" class="pages"></main>

    <div id="palette" class="palette" hidden>
        <div class="palette-onglets" id="onglets" role="tablist"></div>
        <div class="palette-outils" id="outils"></div>
        <div class="palette-actions">
            <button class="outil" data-outil="defiler" title="Faire défiler" aria-label="Faire défiler">✋</button>
            <button class="outil" data-outil="selection" title="Sélectionner / déplacer" aria-label="Sélectionner / déplacer">👆</button>
            <div class="tailles" id="tailles">
                <button data-taille="s" title="Petits signes">S</button>
                <button data-taille="m" title="Signes moyens" class="actif">M</button>
                <button data-taille="l" title="Grands signes">L</button>
            </div>
            <button id="annuler" title="Annuler" aria-label="Annuler" disabled>↶</button>
            <button id="retablir" title="Rétablir" aria-label="Rétablir" disabled>↷</button>
            <button id="supprimer" title="Supprimer le signe sélectionné" aria-label="Supprimer le signe sélectionné" disabled>🗑</button>
        </div>
    </div>

    <input type="file" id="fichierImport" accept=".json,application/json" hidden>

    <script type="module" src="js/viewer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Créer `css/viewer.css`**

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --accent: #e17055;
    --officiel: #0984e3;
    --perso: #d63031;
    --fond: #f1ece4;
    --texte: #2d3436;
}

body {
    font-family: 'Crimson Text', serif;
    background: var(--fond);
    color: var(--texte);
    min-height: 100vh;
}

/* Top bar */
.barre {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.titre {
    flex: 1;
    min-width: 0;
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.4rem;
    color: var(--accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.barre-actions {
    display: flex;
    gap: 6px;
    align-items: center;
}

.bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 40px;
    padding: 0 10px;
    border: 2px solid #fdcb6e;
    border-radius: 20px;
    background: white;
    color: var(--accent);
    font: 600 1.1rem 'Crimson Text', serif;
    text-decoration: none;
    cursor: pointer;
}

.bouton:hover,
.bouton[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
}

/* Overflow menu */
.menu {
    position: relative;
}

.menu-liste {
    position: absolute;
    right: 0;
    top: 46px;
    display: flex;
    flex-direction: column;
    min-width: 230px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    overflow: hidden;
}

.menu-liste[hidden] {
    display: none;
}

.menu-liste button {
    padding: 12px 16px;
    border: none;
    background: none;
    text-align: left;
    font: 1.05rem 'Crimson Text', serif;
    cursor: pointer;
}

.menu-liste button:hover {
    background: #fff4e6;
}

/* Layer toggles */
.calques {
    display: flex;
    gap: 20px;
    justify-content: center;
    padding: 8px 16px;
    font-size: 1rem;
}

.calques label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
}

.pastille {
    width: 12px;
    height: 12px;
    border-radius: 50%;
}

.pastille.officiel { background: var(--officiel); }
.pastille.perso { background: var(--perso); }

/* Warnings */
.bandeau {
    margin: 0 16px 8px;
    padding: 10px 14px;
    border-radius: 10px;
    background: #ffeaa7;
    font-size: 1rem;
}

/* Pages */
.pages {
    padding: 8px 8px 160px;
    overflow-x: auto;
}

.page {
    position: relative;
    margin: 0 auto 16px;
    background: white;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.page canvas,
.page svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.calque-officiel { color: var(--officiel); }
.calque-perso { color: var(--perso); }

.masquer-officiel .calque-officiel,
.masquer-perso .calque-perso {
    display: none;
}

.selectionnee {
    filter: drop-shadow(0 0 2px #fdcb6e) drop-shadow(0 0 2px #fdcb6e);
}

.message {
    max-width: 600px;
    margin: 60px auto;
    text-align: center;
    font-size: 1.3rem;
}

.message a {
    color: var(--accent);
}
```

- [ ] **Step 3: Créer `js/viewer.js`**

```js
// Score viewer: PDF.js renders each page on a canvas, and an SVG overlay
// (LARGEUR_REFERENCE units wide) shows the official and personal annotations.

import {
    cheminPdfValide, urlDepuisChemin, cheminOfficiel, lireDocument,
    chargerPersonnel, sauverPersonnel, Calque
} from './annotations/store.js';
import { rendreAnnotation, LARGEUR_REFERENCE } from './annotations/symboles.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PAS_ZOOM = 1.25;
const LARGEUR_MAX = 900;
// Pages this close to the screen are rendered ahead of scrolling
const MARGE_RENDU = 600;

const etat = {
    cheminPdf: null,
    pdf: null,
    pages: [],
    zoom: 1,
    officielles: [],
    calque: new Calque(),
    stockage: obtenirStockage(),
    editeur: null,
    alerteSauvegarde: false
};

// localStorage throws in some private modes: treat that as "no storage"
function obtenirStockage() {
    try {
        const stockage = window.localStorage;
        stockage.setItem('orchestre_test', '1');
        stockage.removeItem('orchestre_test');
        return stockage;
    } catch {
        return null;
    }
}

function avertir(message) {
    const bandeau = document.getElementById('bandeau');
    const ligne = document.createElement('p');
    ligne.textContent = message;
    bandeau.append(ligne);
    bandeau.hidden = false;
}

function afficherErreur(message, urlPdf) {
    const pages = document.getElementById('pages');
    pages.innerHTML = '';
    const bloc = document.createElement('div');
    bloc.className = 'message';
    const texte = document.createElement('p');
    texte.textContent = message;
    bloc.append(texte);
    const lien = document.createElement('a');
    if (urlPdf) {
        lien.href = urlPdf;
        lien.textContent = 'Télécharger le PDF';
    } else {
        lien.href = 'index.html';
        lien.textContent = 'Retour à la liste des partitions';
    }
    const ligne = document.createElement('p');
    ligne.append(lien);
    bloc.append(ligne);
    pages.append(bloc);
}

// ---- Layers ----

function redessinerCalques(num) {
    const page = etat.pages[num - 1];
    if (!page) return;

    const hauteur = LARGEUR_REFERENCE * page.ratio;
    const vue = etat.editeur
        ? etat.editeur.vue(etat.calque.annotations)
        : { annotations: etat.calque.annotations, selectionId: null };

    const officielles = etat.officielles
        .filter(a => a.page === num)
        .map(a => rendreAnnotation(a, hauteur))
        .join('');
    const personnelles = vue.annotations
        .filter(a => a.page === num)
        .map(a => rendreAnnotation(a, hauteur, { selectionnee: a.id === vue.selectionId }))
        .join('');

    page.svg.innerHTML = `<g class="calque-officiel">${officielles}</g><g class="calque-perso">${personnelles}</g>`;
}

function redessinerTout() {
    etat.pages.forEach(page => redessinerCalques(page.num));
}

function chargerCalquePerso() {
    if (!etat.stockage) {
        avertir('Ce navigateur ne permet pas d\'enregistrer : vos annotations ne seront pas conservées. Pensez à les exporter (menu ⋯).');
    }
    const { annotations, rejetees, corrompu } = chargerPersonnel(etat.stockage, etat.cheminPdf);
    if (corrompu) {
        avertir('Vos annotations enregistrées pour cette partition étaient illisibles et n\'ont pas pu être chargées.');
    } else if (rejetees) {
        avertir(`${rejetees} de vos annotations étaient illisibles et ont été ignorées.`);
    }
    etat.calque = new Calque(annotations);
}

function enregistrer() {
    const ok = sauverPersonnel(etat.stockage, etat.cheminPdf, etat.calque.annotations);
    if (!ok && etat.stockage && !etat.alerteSauvegarde) {
        etat.alerteSauvegarde = true;
        avertir('Enregistrement impossible (stockage du navigateur plein ?) : exportez vos annotations pour ne pas les perdre.');
    }
}

async function chargerOfficielles() {
    let reponse;
    try {
        reponse = await fetch(urlDepuisChemin(cheminOfficiel(etat.cheminPdf)), { cache: 'no-cache' });
    } catch (erreur) {
        console.warn('Annotations officielles indisponibles :', erreur);
        return;
    }

    // No official file for this score: nothing to show
    if (reponse.status === 404) return;
    if (!reponse.ok) {
        avertir('Les annotations officielles n\'ont pas pu être chargées.');
        return;
    }

    try {
        const { annotations, rejetees } = lireDocument(await reponse.text());
        etat.officielles = annotations;
        if (rejetees) {
            avertir(`${rejetees} annotation(s) officielle(s) illisible(s) ont été ignorées.`);
        }
    } catch {
        avertir('Les annotations officielles de cette partition sont illisibles et ont été ignorées.');
        return;
    }

    redessinerTout();
}

// ---- Pages ----

function largeurPage() {
    const disponible = document.getElementById('pages').clientWidth - 16;
    return Math.round(Math.min(disponible, LARGEUR_MAX) * etat.zoom);
}

function dimensionner(page) {
    const largeur = largeurPage();
    page.element.style.width = `${largeur}px`;
    page.element.style.height = `${Math.round(largeur * page.ratio)}px`;
}

async function rendrePage(page) {
    const largeur = largeurPage();
    if (page.largeurRendue === largeur) return;
    page.largeurRendue = largeur;
    page.tache?.cancel();

    const echelle = (largeur / page.pdfPage.getViewport({ scale: 1 }).width) * (window.devicePixelRatio || 1);
    const vue = page.pdfPage.getViewport({ scale: echelle });
    page.canvas.width = Math.floor(vue.width);
    page.canvas.height = Math.floor(vue.height);

    page.tache = page.pdfPage.render({ canvasContext: page.canvas.getContext('2d'), viewport: vue });
    try {
        await page.tache.promise;
    } catch (erreur) {
        if (erreur?.name !== 'RenderingCancelledException') {
            console.error(`Page ${page.num} :`, erreur);
        }
    }
}

function estProcheDeLaVue(page) {
    const rect = page.element.getBoundingClientRect();
    return rect.bottom > -MARGE_RENDU && rect.top < window.innerHeight + MARGE_RENDU;
}

async function preparerPages() {
    const conteneur = document.getElementById('pages');
    const observateur = new IntersectionObserver(entrees => {
        entrees
            .filter(entree => entree.isIntersecting)
            .forEach(entree => rendrePage(etat.pages[Number(entree.target.dataset.page) - 1]));
    }, { rootMargin: `${MARGE_RENDU}px 0px` });

    for (let num = 1; num <= etat.pdf.numPages; num++) {
        const pdfPage = await etat.pdf.getPage(num);
        const vue = pdfPage.getViewport({ scale: 1 });
        const ratio = vue.height / vue.width;

        const element = document.createElement('div');
        element.className = 'page';
        element.dataset.page = num;
        const canvas = document.createElement('canvas');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'calques-page');
        svg.setAttribute('viewBox', `0 0 ${LARGEUR_REFERENCE} ${LARGEUR_REFERENCE * ratio}`);
        element.append(canvas, svg);
        conteneur.append(element);

        const page = { num, pdfPage, element, canvas, svg, ratio, largeurRendue: 0, tache: null };
        etat.pages.push(page);
        dimensionner(page);
        redessinerCalques(num);
        observateur.observe(element);
    }
}

// Resize every page, keep the reading position, re-render what is on screen
function appliquerZoom() {
    const racine = document.documentElement;
    const position = window.scrollY / Math.max(racine.scrollHeight, 1);
    etat.pages.forEach(dimensionner);
    window.scrollTo(window.scrollX, position * racine.scrollHeight);
    etat.pages.filter(estProcheDeLaVue).forEach(rendrePage);
}

function changerZoom(facteur) {
    etat.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, etat.zoom * facteur));
    appliquerZoom();
}

// ---- Controls ----

function installerControles() {
    document.getElementById('zoomPlus').addEventListener('click', () => changerZoom(PAS_ZOOM));
    document.getElementById('zoomMoins').addEventListener('click', () => changerZoom(1 / PAS_ZOOM));

    let attente = null;
    window.addEventListener('resize', () => {
        clearTimeout(attente);
        attente = setTimeout(appliquerZoom, 200);
    });

    document.getElementById('voirOfficiel').addEventListener('change', e => {
        document.body.classList.toggle('masquer-officiel', !e.target.checked);
    });
    document.getElementById('voirPerso').addEventListener('change', e => {
        document.body.classList.toggle('masquer-perso', !e.target.checked);
    });

    // Coming from the list: go back to it with its filters intact
    document.getElementById('retour').addEventListener('click', e => {
        if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
            e.preventDefault();
            history.back();
        }
    });
}

async function ouvrir() {
    installerControles();

    const chemin = new URLSearchParams(window.location.search).get('pdf');
    if (!cheminPdfValide(chemin)) {
        afficherErreur('Partition introuvable : le lien est invalide.', null);
        return;
    }

    etat.cheminPdf = chemin;
    const url = urlDepuisChemin(chemin);
    const nom = chemin.split('/').pop().replace(/\.pdf$/i, '');
    document.getElementById('titre').textContent = nom;
    document.title = `${nom} - Orchestre à Cordes`;
    document.getElementById('telecharger').href = url;

    chargerCalquePerso();

    try {
        const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
        pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
        etat.pdf = await pdfjs.getDocument(url).promise;
    } catch (erreur) {
        console.error('Ouverture du PDF impossible :', erreur);
        afficherErreur('Impossible d\'afficher cette partition ici.', url);
        return;
    }

    await preparerPages();
    chargerOfficielles();
}

ouvrir();
```

- [ ] **Step 4: Vérifier que les tests unitaires passent toujours**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Vérifier dans un navigateur**

Préparer une couche officielle de test (dans le scratchpad, **pas** dans le dépôt) puis servir le site :

```bash
SCRATCH=/tmp/claude-1000/-home-blatinier-git-perso-orchestre/e4c0f680-3d56-4897-8d42-67cc112f6513/scratchpad
rm -rf "$SCRATCH/site" && mkdir -p "$SCRATCH/site"
cp -r index.html viewer.html css js partitions partitions.json "$SCRATCH/site/"
mkdir -p "$SCRATCH/site/annotations/Nord Deux Sèvres/Violon 1"
cat > "$SCRATCH/site/annotations/Nord Deux Sèvres/Violon 1/Bohemian Rhapsody, violon 1.json" <<'EOF'
{ "version": 1, "pdf": "partitions/Nord Deux Sèvres/Violon 1/Bohemian Rhapsody, violon 1.pdf",
  "annotations": [
    { "id": "o1", "page": 1, "type": "tire", "x": 0.3, "y": 0.2, "taille": "l" },
    { "id": "o2", "page": 1, "type": "liaison", "x1": 0.35, "y1": 0.25, "x2": 0.55, "y2": 0.25, "sens": "dessus", "taille": "l" },
    { "id": "o3", "page": 1, "type": "crescendo", "x1": 0.3, "y1": 0.3, "x2": 0.6, "y2": 0.3, "taille": "l" },
    { "id": "o4", "page": 1, "type": "mf", "x": 0.25, "y": 0.3, "taille": "l" }
  ] }
EOF
(cd "$SCRATCH/site" && python3 -m http.server 8765 >/dev/null 2>&1 &)
sleep 1
chromium --headless=new --disable-gpu --window-size=1000,1300 --virtual-time-budget=10000 \
  --screenshot="$SCRATCH/lecture.png" \
  "http://localhost:8765/viewer.html?pdf=partitions%2FNord%20Deux%20S%C3%A8vres%2FViolon%201%2FBohemian%20Rhapsody%2C%20violon%201.pdf"
```

Ouvrir `$SCRATCH/lecture.png` (outil Read). Expected : barre en haut, première page de la partition affichée, tiré + liaison arrondie vers le haut + soufflet + « mf » en bleu.

Puis capturer aussi `viewer.html?pdf=..%2Fsecret.pdf` → Expected : « Partition introuvable : le lien est invalide. » ; et un PDF de conducteur (`V1-V2-Vcelle - 13 - Allein Gott in der Höh' sei Ehr' (Bach).pdf`, encodé avec `encodeURIComponent`) → Expected : partition affichée.

Si le worker PDF.js échoue (console « Setting up fake worker »), ce n'est pas bloquant : PDF.js rend alors dans le fil principal.

- [ ] **Step 6: Commit**

```bash
git add viewer.html css/viewer.css js/viewer.js
git commit -m "Afficher les partitions et leurs annotations dans une visionneuse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mode Annoter (outils, gestes, palette)

**Files:**
- Create: `js/annotations/editeur.js`
- Modify: `js/viewer.js` (imports, nouvelles fonctions palette, appel dans `ouvrir`)
- Modify: `css/viewer.css` (ajout en fin de fichier)

**Interfaces:**
- Consumes: `SYMBOLES`, `OUTILS`, `ONGLETS`, `apercuOutil` (Task 1) ; `annotationProche`, `deplacer`, `arrondirCoord`, `nouvelId`, `LONGUEUR_TEXTE_MAX`, `Calque` (Tasks 2–3) ; `etat`, `redessinerCalques`, `redessinerTout`, `enregistrer` (Task 4).
- Produces : `class Editeur` :
  - `constructor({ calque, localiser, redessiner, enregistrer, surEtat })` où `localiser(event, num = null) → { num, x, y, ratio } | null` (coordonnées relatives non bornées ; `num` impose la page de référence), `redessiner(num | null)` (`null` = toutes), `enregistrer()`, `surEtat()`.
  - propriétés `actif: boolean`, `outil: 'defiler' | 'selection' | <id d'OUTILS>`, `taille: 's'|'m'|'l'`, `selectionId: string|null`.
  - méthodes `activer(bool)`, `choisirOutil(id)`, `choisirTaille(t)`, `supprimerSelection()`, `annuler()`, `retablir()`, `vue(annotations) → { annotations, selectionId }`, `pointerDown(e)`, `pointerMove(e)`, `pointerUp(e)`, `pointerCancel(e)`.

Choix d'interaction (précise le spec) : en mode Annoter, l'outil ✋ **Défiler** (outil par défaut) laisse le doigt faire défiler la partition ; 👆 Sélection et les signes captent le doigt (`touch-action: none`) pour poser ou déplacer sans faire défiler.

- [ ] **Step 1: Créer `js/annotations/editeur.js`**

```js
// Annotation editing: tools and pointer gestures. This module never touches the
// SVG; the viewer asks `vue()` what to draw, including gestures in progress.

import { SYMBOLES, OUTILS } from './symboles.js';
import { annotationProche, deplacer, arrondirCoord, nouvelId, LONGUEUR_TEXTE_MAX } from './store.js';

// In page widths
const SEUIL_SELECTION = 0.025;
const SEUIL_GLISSER = 0.004;
const LONGUEUR_MIN_ETIRABLE = 0.012;

export class Editeur {
    actif = false;
    outil = 'defiler';
    taille = 'm';
    selectionId = null;

    #calque;
    #localiser;
    #redessiner;
    #enregistrer;
    #surEtat;
    // { pointerId, num, mode: 'deplacer'|'poser'|'etirer', depart, courant, id?, outil? }
    #geste = null;

    constructor({ calque, localiser, redessiner, enregistrer, surEtat }) {
        this.#calque = calque;
        this.#localiser = localiser;
        this.#redessiner = redessiner;
        this.#enregistrer = enregistrer;
        this.#surEtat = surEtat;
    }

    activer(actif) {
        this.actif = actif;
        this.#geste = null;
        this.selectionId = null;
        this.#redessiner(null);
        this.#surEtat();
    }

    choisirOutil(id) {
        this.outil = id;
        this.selectionId = null;
        this.#redessiner(null);
        this.#surEtat();
    }

    // With a sign selected, the size buttons resize it
    choisirTaille(taille) {
        this.taille = taille;
        if (this.selectionId) {
            this.#calque.modifier(this.selectionId, { taille });
            this.#enregistrer();
            this.#redessiner(null);
        }
        this.#surEtat();
    }

    supprimerSelection() {
        if (!this.selectionId) return;
        this.#calque.supprimer(this.selectionId);
        this.selectionId = null;
        this.#apresChangement();
    }

    annuler() {
        if (this.#calque.annuler()) this.#apresChangement();
    }

    retablir() {
        if (this.#calque.retablir()) this.#apresChangement();
    }

    #apresChangement() {
        if (this.selectionId && !this.#calque.trouver(this.selectionId)) {
            this.selectionId = null;
        }
        this.#enregistrer();
        this.#redessiner(null);
        this.#surEtat();
    }

    // What the personal layer should show right now
    vue(annotations) {
        const geste = this.#geste;
        let liste = annotations;

        if (geste?.mode === 'deplacer') {
            const dx = geste.courant.x - geste.depart.x;
            const dy = geste.courant.y - geste.depart.y;
            liste = liste.map(a => (a.id === geste.id ? { ...a, ...deplacer(a, dx, dy) } : a));
        } else if (geste?.mode === 'poser' && geste.outil.type !== 'texte') {
            liste = [...liste, this.#nouvellePonctuelle(geste)];
        } else if (geste?.mode === 'etirer') {
            liste = [...liste, this.#nouvelleEtirable(geste)];
        }

        return { annotations: liste, selectionId: this.selectionId };
    }

    #base(geste) {
        return { id: nouvelId(), page: geste.num, type: geste.outil.type, taille: this.taille, ...geste.outil.valeurs };
    }

    #nouvellePonctuelle(geste) {
        return { ...this.#base(geste), x: arrondirCoord(geste.courant.x), y: arrondirCoord(geste.courant.y) };
    }

    #nouvelleEtirable(geste) {
        return {
            ...this.#base(geste),
            x1: arrondirCoord(geste.depart.x),
            y1: arrondirCoord(geste.depart.y),
            x2: arrondirCoord(geste.courant.x),
            y2: arrondirCoord(geste.courant.y)
        };
    }

    pointerDown(event) {
        if (!this.actif || this.outil === 'defiler' || this.#geste || event.button > 0) return;

        const position = this.#localiser(event);
        if (!position) return;
        event.preventDefault();

        if (this.outil === 'selection') {
            const cible = annotationProche(this.#calque.annotations, position.num, position.x, position.y, position.ratio, SEUIL_SELECTION);
            this.selectionId = cible?.id ?? null;
            if (cible) {
                this.#geste = { pointerId: event.pointerId, num: position.num, mode: 'deplacer', id: cible.id, depart: position, courant: position };
            }
        } else {
            const outil = OUTILS.find(o => o.id === this.outil);
            const mode = SYMBOLES[outil.type].nature === 'ponctuel' ? 'poser' : 'etirer';
            this.#geste = { pointerId: event.pointerId, num: position.num, mode, outil, depart: position, courant: position };
        }

        // Capture on the page element: the SVG children are redrawn during the gesture
        if (this.#geste) {
            event.target.closest('.page')?.setPointerCapture(event.pointerId);
        }
        this.#redessiner(position.num);
        this.#surEtat();
    }

    pointerMove(event) {
        const geste = this.#geste;
        if (!geste || event.pointerId !== geste.pointerId) return;
        geste.courant = this.#localiser(event, geste.num);
        this.#redessiner(geste.num);
    }

    pointerUp(event) {
        const geste = this.#geste;
        if (!geste || event.pointerId !== geste.pointerId) return;
        this.#geste = null;
        geste.courant = this.#localiser(event, geste.num);

        const dx = geste.courant.x - geste.depart.x;
        const dy = geste.courant.y - geste.depart.y;
        const distance = Math.hypot(dx, dy * geste.courant.ratio);
        let change = false;

        if (geste.mode === 'deplacer' && distance > SEUIL_GLISSER) {
            this.#calque.modifier(geste.id, deplacer(this.#calque.trouver(geste.id), dx, dy));
            change = true;
        } else if (geste.mode === 'poser') {
            const annotation = this.#nouvellePonctuelle(geste);
            if (annotation.type === 'texte') {
                const saisie = window.prompt('Texte à ajouter :');
                annotation.texte = (saisie ?? '').trim().slice(0, LONGUEUR_TEXTE_MAX);
            }
            if (annotation.type !== 'texte' || annotation.texte) {
                this.#calque.ajouter(annotation);
                change = true;
            }
        } else if (geste.mode === 'etirer' && distance > LONGUEUR_MIN_ETIRABLE) {
            this.#calque.ajouter(this.#nouvelleEtirable(geste));
            change = true;
        }

        if (change) {
            this.#apresChangement();
        } else {
            this.#redessiner(geste.num);
            this.#surEtat();
        }
    }

    pointerCancel(event) {
        const geste = this.#geste;
        if (!geste || event.pointerId !== geste.pointerId) return;
        this.#geste = null;
        this.#redessiner(geste.num);
    }
}
```

- [ ] **Step 2: Brancher l'éditeur dans `js/viewer.js`**

2a. Remplacer l'import de `symboles.js` et ajouter celui de l'éditeur, en tête de fichier :

```js
import { rendreAnnotation, apercuOutil, LARGEUR_REFERENCE, ONGLETS, OUTILS } from './annotations/symboles.js';
import { Editeur } from './annotations/editeur.js';
```

2b. Ajouter cette section juste avant `// ---- Controls ----` :

```js
// ---- Annotate mode ----

// Pointer position relative to a page (to page `num` when given, so a gesture
// keeps its page even when the finger slides off it)
function localiser(event, num = null) {
    const page = num
        ? etat.pages[num - 1]
        : etat.pages[Number(event.target.closest?.('.page')?.dataset.page) - 1];
    if (!page) return null;

    const rect = page.element.getBoundingClientRect();
    return {
        num: page.num,
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
        ratio: page.ratio
    };
}

function afficherOnglet(id) {
    document.querySelectorAll('#onglets [data-onglet]').forEach(bouton => {
        bouton.classList.toggle('actif', bouton.dataset.onglet === id);
        bouton.setAttribute('aria-selected', String(bouton.dataset.onglet === id));
    });
    document.querySelectorAll('#outils [data-outil]').forEach(bouton => {
        bouton.hidden = bouton.dataset.onglet !== id;
    });
}

function majPalette() {
    const editeur = etat.editeur;
    document.querySelectorAll('#palette [data-outil]').forEach(bouton => {
        bouton.classList.toggle('actif', bouton.dataset.outil === editeur.outil);
    });
    document.querySelectorAll('#tailles [data-taille]').forEach(bouton => {
        bouton.classList.toggle('actif', bouton.dataset.taille === editeur.taille);
    });
    document.getElementById('annuler').disabled = !etat.calque.peutAnnuler;
    document.getElementById('retablir').disabled = !etat.calque.peutRetablir;
    document.getElementById('supprimer').disabled = !editeur.selectionId;
    document.body.classList.toggle('outil-defiler', editeur.outil === 'defiler');
}

function installerEditeur() {
    etat.editeur = new Editeur({
        calque: etat.calque,
        localiser,
        redessiner: num => (num ? redessinerCalques(num) : redessinerTout()),
        enregistrer,
        surEtat: majPalette
    });

    document.getElementById('onglets').innerHTML = ONGLETS
        .map(o => `<button role="tab" data-onglet="${o.id}">${o.libelle}</button>`)
        .join('');
    document.getElementById('outils').innerHTML = OUTILS
        .map(o => `<button class="outil" data-outil="${o.id}" data-onglet="${o.onglet}" title="${o.libelle}" aria-label="${o.libelle}">${apercuOutil(o)}</button>`)
        .join('');
    afficherOnglet(ONGLETS[0].id);

    document.getElementById('onglets').addEventListener('click', e => {
        const bouton = e.target.closest('[data-onglet]');
        if (bouton) afficherOnglet(bouton.dataset.onglet);
    });
    document.getElementById('palette').addEventListener('click', e => {
        const outil = e.target.closest('[data-outil]');
        const taille = e.target.closest('[data-taille]');
        if (outil) etat.editeur.choisirOutil(outil.dataset.outil);
        if (taille) etat.editeur.choisirTaille(taille.dataset.taille);
    });
    document.getElementById('annuler').addEventListener('click', () => etat.editeur.annuler());
    document.getElementById('retablir').addEventListener('click', () => etat.editeur.retablir());
    document.getElementById('supprimer').addEventListener('click', () => etat.editeur.supprimerSelection());

    const basculer = document.getElementById('basculerAnnoter');
    basculer.addEventListener('click', () => {
        const actif = !etat.editeur.actif;
        basculer.setAttribute('aria-pressed', String(actif));
        document.getElementById('palette').hidden = !actif;
        document.body.classList.toggle('annotation-active', actif);
        // Editing an invisible layer would be confusing
        if (actif) {
            document.getElementById('voirPerso').checked = true;
            document.body.classList.remove('masquer-perso');
        }
        etat.editeur.activer(actif);
    });

    const pages = document.getElementById('pages');
    pages.addEventListener('pointerdown', e => etat.editeur.pointerDown(e));
    pages.addEventListener('pointermove', e => etat.editeur.pointerMove(e));
    pages.addEventListener('pointerup', e => etat.editeur.pointerUp(e));
    pages.addEventListener('pointercancel', e => etat.editeur.pointerCancel(e));

    document.addEventListener('keydown', e => {
        if (!etat.editeur.actif || e.target.closest?.('input, textarea')) return;
        const commande = e.ctrlKey || e.metaKey;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            etat.editeur.supprimerSelection();
        } else if (commande && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            etat.editeur.annuler();
        } else if (commande && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
            e.preventDefault();
            etat.editeur.retablir();
        }
    });

    majPalette();
}
```

2c. Dans `ouvrir()`, juste après la ligne `chargerCalquePerso();`, ajouter :

```js
    installerEditeur();
```

- [ ] **Step 3: Ajouter les styles de la palette** — fin de `css/viewer.css`

```css
/* Annotate mode: signs and selection capture the finger, the scroll tool lets it scroll */
.annotation-active:not(.outil-defiler) .page {
    touch-action: none;
    cursor: crosshair;
}

.palette {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    background: white;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.15);
    padding: 6px 8px 10px;
}

.palette[hidden] {
    display: none;
}

.palette-onglets,
.palette-outils,
.palette-actions {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 4px 0;
}

.palette-onglets button {
    flex-shrink: 0;
    padding: 4px 12px;
    border: none;
    border-radius: 14px;
    background: #f1ece4;
    font: 1rem 'Crimson Text', serif;
    cursor: pointer;
}

.palette-onglets button.actif {
    background: var(--accent);
    color: white;
}

.palette button.outil,
.palette-actions > button,
.tailles button {
    flex-shrink: 0;
    min-width: 44px;
    height: 44px;
    border: 2px solid #dfe6e9;
    border-radius: 10px;
    background: white;
    color: var(--perso);
    font: 600 1.1rem 'Crimson Text', serif;
    cursor: pointer;
}

.palette button.outil[hidden] {
    display: none;
}

.palette button.actif {
    border-color: var(--accent);
    background: #fff4e6;
}

.palette button:disabled {
    opacity: 0.35;
    cursor: default;
}

.tailles {
    display: flex;
    gap: 2px;
    margin: 0 8px;
}
```

- [ ] **Step 4: Vérifier que les tests unitaires passent toujours**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Vérifier dans un navigateur**

Recopier les fichiers dans le site du scratchpad (`cp -r viewer.html css js "$SCRATCH/site/"`) et ouvrir `http://localhost:8765/viewer.html?pdf=…Bohemian…` dans un navigateur (ou piloter Chromium headless via Playwright si disponible). Vérifier, en vidant `localStorage` avant :
1. ✏️ ouvre la palette, outil ✋ actif, la molette fait défiler.
2. Onglet Archet → Tiré → clic sur la page : un ⊓ rouge apparaît ; trois clics = trois signes.
3. Onglet Liaisons → Liaison au-dessus → glisser de droite à gauche : arc vers le haut.
4. Évolution → Crescendo → glisser : soufflet fermé au départ.
5. Repères → Texte libre → clic → saisir `<b>rit.</b>` : texte affiché littéralement.
6. 👆 → clic sur un signe (halo jaune) → glisser : il suit ; L : il grossit ; 🗑 : il disparaît.
7. ↶ / ↷ et Ctrl+Z / Ctrl+Shift+Z annulent et rétablissent.
8. Recharger la page : les signes personnels sont toujours là ; les officiels bleus ne sont pas sélectionnables.
9. Décocher « Mes annotations » : les rouges disparaissent ; ✏️ les fait réapparaître.

- [ ] **Step 6: Commit**

```bash
git add js/annotations/editeur.js js/viewer.js css/viewer.css
git commit -m "Annoter les partitions avec la palette de signes musicaux

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Menu ⋯ — export, import, tout effacer

**Files:**
- Modify: `js/viewer.js`

**Interfaces:**
- Consumes: `serialiser`, `lireDocument` (Task 2) ; `etat`, `enregistrer`, `redessinerTout` (Task 4) ; `majPalette` (Task 5).
- Produces : `installerMenu()` appelée dans `ouvrir()`.

- [ ] **Step 1: Ajouter `serialiser` à l'import de `store.js`** en tête de `js/viewer.js` :

```js
import {
    cheminPdfValide, urlDepuisChemin, cheminOfficiel, lireDocument, serialiser,
    chargerPersonnel, sauverPersonnel, Calque
} from './annotations/store.js';
```

- [ ] **Step 2: Ajouter cette section** juste avant `// ---- Controls ----` :

```js
// ---- Menu: export / import / clear ----

function nomFichierAnnotations() {
    return etat.cheminPdf.split('/').pop().replace(/\.pdf$/i, '.json');
}

function exporter() {
    const blob = new Blob([serialiser(etat.cheminPdf, etat.calque.annotations)], { type: 'application/json' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = nomFichierAnnotations();
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

function apresRemplacement() {
    etat.editeur.selectionId = null;
    enregistrer();
    redessinerTout();
    majPalette();
}

async function importer(fichier) {
    let doc;
    try {
        doc = lireDocument(await fichier.text());
    } catch (erreur) {
        alert(`Import impossible : ${erreur.message}.`);
        return;
    }

    if (doc.pdf && doc.pdf !== etat.cheminPdf
        && !confirm(`Ce fichier a été créé pour une autre partition :\n${doc.pdf}\n\nL'importer quand même ?`)) {
        return;
    }
    const actuelles = etat.calque.annotations.length;
    if (actuelles > 0
        && !confirm(`Remplacer vos ${actuelles} annotation(s) par les ${doc.annotations.length} du fichier ?`)) {
        return;
    }

    etat.calque.remplacer(doc.annotations);
    apresRemplacement();
    if (doc.rejetees) {
        alert(`${doc.rejetees} annotation(s) illisible(s) ont été ignorées.`);
    }
}

function effacer() {
    const actuelles = etat.calque.annotations.length;
    if (actuelles === 0) return;
    if (!confirm(`Effacer vos ${actuelles} annotation(s) sur cette partition ?`)) return;
    etat.calque.remplacer([]);
    apresRemplacement();
}

function installerMenu() {
    const bouton = document.getElementById('ouvrirMenu');
    const liste = document.getElementById('menuListe');
    const fichier = document.getElementById('fichierImport');

    const fermer = () => {
        liste.hidden = true;
        bouton.setAttribute('aria-expanded', 'false');
    };

    bouton.addEventListener('click', e => {
        e.stopPropagation();
        liste.hidden = !liste.hidden;
        bouton.setAttribute('aria-expanded', String(!liste.hidden));
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.menu')) fermer();
    });

    document.getElementById('exporter').addEventListener('click', () => {
        fermer();
        exporter();
    });
    document.getElementById('importer').addEventListener('click', () => {
        fermer();
        fichier.click();
    });
    fichier.addEventListener('change', () => {
        if (fichier.files[0]) importer(fichier.files[0]);
        // Allow importing the same file again
        fichier.value = '';
    });
    document.getElementById('effacer').addEventListener('click', () => {
        fermer();
        effacer();
    });
}
```

- [ ] **Step 3: Dans `ouvrir()`**, juste après `installerEditeur();`, ajouter :

```js
    installerMenu();
```

- [ ] **Step 4: Vérifier que les tests unitaires passent toujours**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Vérifier dans un navigateur**

Recopier les fichiers dans le site du scratchpad, puis :
1. Poser 3 signes → ⋯ → Exporter : un fichier `Bohemian Rhapsody, violon 1.json` est téléchargé ; il contient `"version": 1`, le bon `"pdf"` et les 3 annotations.
2. Tout effacer → confirmer : plus rien ; ↶ les fait revenir.
3. Importer le fichier exporté → confirmer le remplacement : les 3 signes reviennent.
4. Ouvrir une autre partition, importer ce même fichier : la confirmation « créé pour une autre partition » apparaît.
5. Importer un fichier texte quelconque renommé en `.json` : « Import impossible : Fichier d'annotations illisible (JSON invalide). »
6. Copier le fichier exporté vers `$SCRATCH/site/annotations/Nord Deux Sèvres/Violon 1/` et recharger : les signes apparaissent aussi en bleu (couche officielle).

- [ ] **Step 6: Commit**

```bash
git add js/viewer.js
git commit -m "Exporter, importer et effacer ses annotations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ouvrir la visionneuse depuis la liste + documentation

**Files:**
- Modify: `js/app.js` — `createPieceCard` (lignes ~145–196)
- Modify: `css/style.css` — après le bloc `.instrument-link::after` (fin de la section instruments, ~ligne 420)
- Modify: `README.md`

**Interfaces:**
- Consumes: l'URL `viewer.html?pdf=<chemin encodé>` (Task 4).
- Produces : rien pour les autres tâches.

- [ ] **Step 1: Ajouter le helper dans `js/app.js`**, juste avant `// Create a piece card` :

```js
// Scores open in the in-site viewer; the raw PDF stays one click away
function viewerUrl(path) {
    return `viewer.html?pdf=${encodeURIComponent(path)}`;
}
```

- [ ] **Step 2: Carte d'un seul instrument** — dans `createPieceCard`, remplacer :

```js
                    <a href="${path}" class="download-button" target="_blank" rel="noopener noreferrer">
                        📄 Télécharger la partition
                    </a>
```

par :

```js
                    <a href="${viewerUrl(path)}" class="download-button">
                        🎼 Ouvrir la partition
                    </a>
                    <a href="${path}" class="share-button" download>
                        ⬇ PDF
                    </a>
```

- [ ] **Step 3: Grille de tous les instruments** — dans `createPieceCard`, remplacer le `return` du `.map(([instrument, path]) => { ... })` :

```js
            return `
                <a href="${path}" class="instrument-link" target="_blank" rel="noopener noreferrer" style="border-color: ${color}; color: ${color};">
                    <span class="instrument-badge-inline" style="background-color: ${color};"></span>
                    ${instrumentNames[instrument] || instrument}
                </a>
            `;
```

par :

```js
            const name = instrumentNames[instrument] || instrument;
            return `
                <div class="instrument-item">
                    <a href="${viewerUrl(path)}" class="instrument-link" style="border-color: ${color}; color: ${color};">
                        <span class="instrument-badge-inline" style="background-color: ${color};"></span>
                        ${name}
                    </a>
                    <a href="${path}" class="instrument-download" download title="Télécharger le PDF ${name}" aria-label="Télécharger le PDF ${name}" style="border-color: ${color}; color: ${color};">⬇</a>
                </div>
            `;
```

- [ ] **Step 4: Styles** — dans `css/style.css`, remplacer `content: ' 📄';` (règle `.instrument-link::after`) par `content: ' 🎼';`, puis ajouter après cette règle :

```css
.instrument-item {
    display: flex;
    gap: 6px;
}

.instrument-item .instrument-link {
    flex: 1;
}

.instrument-download {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    background: white;
    border: 2px solid;
    border-radius: 10px;
    text-decoration: none;
    font-size: 1.1rem;
    transition: transform 0.2s ease;
}

.instrument-download:hover {
    transform: scale(1.08);
}

/* The "⬇ PDF" link reuses the share button look */
a.share-button {
    text-decoration: none;
}
```

- [ ] **Step 5: Mettre à jour `README.md`**

5a. Dans « Structure du projet », remplacer le bloc d'arborescence par :

```
orchestre/
├── index.html              # Liste des partitions
├── viewer.html             # Visionneuse + annotations
├── partitions.json         # Données des partitions (généré automatiquement)
├── css/
│   ├── style.css          # Styles de la liste
│   └── viewer.css         # Styles de la visionneuse
├── js/
│   ├── app.js             # Logique de la liste
│   ├── viewer.js          # Visionneuse (PDF.js), palette, export/import
│   └── annotations/
│       ├── symboles.js    # Catalogue des signes musicaux et leur dessin
│       ├── store.js       # Format, validation, stockage, annuler/rétablir
│       └── editeur.js     # Outils et gestes d'annotation
├── annotations/           # Annotations officielles (.json), même arborescence que partitions/
├── tests/                 # Tests (node --test)
└── partitions/            # Dossier contenant tous les PDF
    └── Nord Deux Sèvres/
        ├── V1-V2-Vcelle - *.pdf   # Conducteurs : plusieurs pupitres par PDF
        ├── Violon 1/
        ├── Violon 2/
        ├── Violon 3/
        ├── Violoncelle 1/
        └── Violoncelle 2/
```

5b. Remplacer la section « ### Ouvrir le site » par :

````markdown
### Ouvrir le site

Le site doit être servi par un petit serveur web (ouvrir `index.html` en double-cliquant
ne permet pas de charger les partitions) :

```bash
cd ~/git/perso/orchestre
python3 -m http.server 8000
```

puis ouvrez <http://localhost:8000> dans votre navigateur.
````

5c. Dans « ### Fonctionnalités », remplacer le point 4 par :

```markdown
4. **Lecture** : cliquez sur un instrument pour ouvrir la partition dans le site ; le bouton ⬇ télécharge le PDF
5. **Annotations** : dans la visionneuse, ✏️ ouvre la palette des signes (voir ci-dessous)
```

5d. Ajouter, avant « ## Caractéristiques du design » :

````markdown
### Annoter une partition

Dans la visionneuse, le bouton ✏️ passe en mode **Annoter** et affiche la palette :

- **Signes ponctuels** (tiré ⊓, poussé V, nuances, doigtés…) : choisissez-le, puis touchez la
  partition. L'outil reste actif pour en poser plusieurs.
- **Liaisons et soufflets** : glissez du point de départ au point d'arrivée.
- ✋ fait défiler la partition sans rien poser ; 👆 sélectionne un signe pour le déplacer,
  changer sa taille (S / M / L) ou le supprimer (🗑) ; ↶ / ↷ annulent et rétablissent.

Vos annotations (en **rouge**) sont enregistrées **dans votre navigateur**, sur cet appareil
seulement. Pour les sauvegarder ou les passer à quelqu'un : menu ⋯ → **Exporter mes
annotations** (fichier `.json`), puis **Importer des annotations** sur l'autre appareil.

### Publier des annotations officielles

Les annotations officielles (en **bleu**, non modifiables) sont vues par tout le monde.
Pour les publier :

1. Annotez la partition dans la visionneuse, puis menu ⋯ → **Exporter mes annotations**
2. Placez le fichier obtenu dans `annotations/`, en reproduisant le chemin du PDF :

   | PDF | Fichier d'annotations officielles |
   | --- | --- |
   | `partitions/Nord Deux Sèvres/Violon 1/Bohemian Rhapsody, violon 1.pdf` | `annotations/Nord Deux Sèvres/Violon 1/Bohemian Rhapsody, violon 1.json` |

3. Commitez le fichier : les annotations apparaissent pour tout le monde.

Un conducteur (`V1-V2-Vcelle - …pdf`) n'a qu'un seul fichier d'annotations, partagé par
tous les pupitres qui le lisent. Si un PDF est renommé, renommez aussi son `.json`.

### Lancer les tests

```bash
npm test
```
````

- [ ] **Step 6: Vérifier**

Run: `npm test`
Expected: PASS.

Recopier les fichiers dans le site du scratchpad puis capturer `index.html` :

```bash
cp -r index.html css js "$SCRATCH/site/"
chromium --headless=new --disable-gpu --window-size=1200,1400 --virtual-time-budget=5000 \
  --screenshot="$SCRATCH/liste.png" "http://localhost:8765/index.html"
```

Expected : chaque instrument a son bouton 🎼 et un petit ⬇ à côté. Dans un navigateur : cliquer sur « Violon 1 » de « Pirates des Caraïbes » ouvre la visionneuse sur le bon PDF (nom avec tréma) ; ⬇ télécharge le PDF ; le bouton ← revient à la liste avec les filtres conservés. Avec « Mon instrument : Violon 1 », la carte montre « 🎼 Ouvrir la partition » et « ⬇ PDF ».

Arrêter le serveur de test : `pkill -f "http.server 8765"`.

- [ ] **Step 7: Commit**

```bash
git add js/app.js css/style.css README.md
git commit -m "Ouvrir les partitions dans la visionneuse depuis la liste

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
