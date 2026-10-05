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
    #demanderTexte;
    // { pointerId, num, mode: 'deplacer'|'poser'|'etirer', depart, courant, id?, outil? }
    #geste = null;

    // `demanderTexte(question)` returns the typed text, or null when cancelled
    constructor({ calque, localiser, redessiner, enregistrer, surEtat, demanderTexte = question => window.prompt(question) }) {
        this.#calque = calque;
        this.#localiser = localiser;
        this.#redessiner = redessiner;
        this.#enregistrer = enregistrer;
        this.#surEtat = surEtat;
        this.#demanderTexte = demanderTexte;
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
                const saisie = this.#demanderTexte('Texte à ajouter :');
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
        this.annulerGeste();
    }

    // Drop the gesture in progress, e.g. when a second finger comes down to zoom
    annulerGeste() {
        const geste = this.#geste;
        if (!geste) return;
        this.#geste = null;
        this.#redessiner(geste.num);
    }
}
