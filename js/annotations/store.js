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

// An accent can be one character (NFC, what a keyboard types) or a letter plus a
// combining mark (NFD, what macOS file names often hold): try the path as given,
// then the other form
export function variantesUnicode(chemin) {
    return [...new Set([chemin, chemin.normalize('NFC'), chemin.normalize('NFD')])];
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

    // Own keys only: "constructor" or "__proto__" must not pass for a sign
    if (!Object.hasOwn(SYMBOLES, brute.type)) return null;
    const symbole = SYMBOLES[brute.type];
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
