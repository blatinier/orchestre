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
