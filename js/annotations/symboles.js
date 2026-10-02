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
