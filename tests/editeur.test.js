import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editeur } from '../js/annotations/editeur.js';
import { Calque } from '../js/annotations/store.js';

const RATIO = 1.4;

// Pointer event as the viewer receives it; x/y are already relative to the page
function evenement(x, y, { pointerId = 1, button = 0, horsPage = false } = {}) {
    return { x, y, pointerId, button, horsPage, target: { closest: () => null }, preventDefault() {} };
}

function creer({ annotations = [], reponses = [] } = {}) {
    const calque = new Calque(annotations);
    const suivi = { enregistrements: 0, questions: [] };
    const editeur = new Editeur({
        calque,
        // The viewer's localiser: null off the pages, unless a gesture pins the page
        localiser: (e, num = null) => (e.horsPage && !num ? null : { num: num ?? 1, x: e.x, y: e.y, ratio: RATIO }),
        redessiner: () => {},
        enregistrer: () => { suivi.enregistrements++; },
        surEtat: () => {},
        demanderTexte: question => {
            suivi.questions.push(question);
            return reponses.shift() ?? null;
        }
    });
    editeur.activer(true);
    return { editeur, calque, suivi };
}

function toucher(editeur, x, y, options) {
    editeur.pointerDown(evenement(x, y, options));
    editeur.pointerUp(evenement(x, y, options));
}

function glisser(editeur, [x1, y1], [x2, y2], options) {
    editeur.pointerDown(evenement(x1, y1, options));
    editeur.pointerMove(evenement((x1 + x2) / 2, (y1 + y2) / 2, options));
    editeur.pointerMove(evenement(x2, y2, options));
    editeur.pointerUp(evenement(x2, y2, options));
}

test('un éditeur inactif ne pose rien', () => {
    const { editeur, calque } = creer();
    editeur.activer(false);
    editeur.choisirOutil('tire');
    toucher(editeur, 0.5, 0.5);
    assert.equal(calque.annotations.length, 0);
});

test('l\'outil Défiler ne pose rien', () => {
    const { editeur, calque } = creer();
    assert.equal(editeur.outil, 'defiler');
    toucher(editeur, 0.5, 0.5);
    assert.equal(calque.annotations.length, 0);
});

test('un toucher hors des pages ne pose rien', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('tire');
    toucher(editeur, 0.5, 0.5, { horsPage: true });
    assert.equal(calque.annotations.length, 0);
});

test('un signe ponctuel se pose là où le doigt se lève, avec la taille choisie', () => {
    const { editeur, calque, suivi } = creer();
    editeur.choisirOutil('tire');
    editeur.choisirTaille('l');
    editeur.pointerDown(evenement(0.5, 0.5));
    editeur.pointerMove(evenement(0.52, 0.51));
    editeur.pointerUp(evenement(0.52, 0.51));

    assert.equal(calque.annotations.length, 1);
    const [a] = calque.annotations;
    assert.deepEqual({ type: a.type, page: a.page, x: a.x, y: a.y, taille: a.taille }, { type: 'tire', page: 1, x: 0.52, y: 0.51, taille: 'l' });
    assert.equal(suivi.enregistrements, 1);
});

test('l\'outil reste actif pour enchaîner plusieurs signes', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('pousse');
    toucher(editeur, 0.1, 0.1);
    toucher(editeur, 0.2, 0.1);
    toucher(editeur, 0.3, 0.1);
    assert.deepEqual(calque.annotations.map(a => a.type), ['pousse', 'pousse', 'pousse']);
});

test('une liaison en dessous se trace en glissant', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('liaison_dessous');
    glisser(editeur, [0.6, 0.4], [0.3, 0.42]);
    const [a] = calque.annotations;
    assert.deepEqual(
        { type: a.type, sens: a.sens, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 },
        { type: 'liaison', sens: 'dessous', x1: 0.6, y1: 0.4, x2: 0.3, y2: 0.42 }
    );
});

test('un tracé trop court ne crée pas de soufflet', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('crescendo');
    glisser(editeur, [0.5, 0.5], [0.505, 0.5]);
    assert.equal(calque.annotations.length, 0);
});

test('un signe étirable tiré hors de la page reste sur la page', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('decrescendo');
    glisser(editeur, [0.8, 0.5], [1.4, 0.5]);
    assert.equal(calque.annotations[0].x2, 1);
});

test('pendant le tracé, l\'aperçu montre le signe sans l\'enregistrer', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('crescendo');
    editeur.pointerDown(evenement(0.2, 0.5));
    editeur.pointerMove(evenement(0.4, 0.5));
    const { annotations } = editeur.vue(calque.annotations);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].x2, 0.4);
    assert.equal(calque.annotations.length, 0);
});

test('le texte libre demande le texte, nettoyé', () => {
    const { editeur, calque, suivi } = creer({ reponses: ['  rit.  '] });
    editeur.choisirOutil('texte');
    toucher(editeur, 0.3, 0.3);
    assert.equal(suivi.questions.length, 1);
    assert.equal(calque.annotations[0].texte, 'rit.');
});

test('annuler la saisie du texte ne pose rien', () => {
    for (const reponse of [null, '   ']) {
        const { editeur, calque } = creer({ reponses: [reponse] });
        editeur.choisirOutil('texte');
        toucher(editeur, 0.3, 0.3);
        assert.equal(calque.annotations.length, 0, String(reponse));
    }
});

test('un second doigt est ignoré pendant un geste', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('crescendo');
    editeur.pointerDown(evenement(0.2, 0.5));
    toucher(editeur, 0.9, 0.9, { pointerId: 2 });
    editeur.pointerMove(evenement(0.5, 0.5));
    editeur.pointerUp(evenement(0.5, 0.5));
    assert.equal(calque.annotations.length, 1);
    assert.deepEqual([calque.annotations[0].x1, calque.annotations[0].x2], [0.2, 0.5]);
});

test('un geste annulé par le navigateur ne pose rien', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('crescendo');
    editeur.pointerDown(evenement(0.2, 0.5));
    editeur.pointerMove(evenement(0.5, 0.5));
    editeur.pointerCancel(evenement(0.5, 0.5));
    assert.equal(calque.annotations.length, 0);
    assert.equal(editeur.vue(calque.annotations).annotations.length, 0);
});

const TIRE = { id: 't', page: 1, type: 'tire', taille: 'm', x: 0.5, y: 0.5 };

test('la sélection prend le signe le plus proche et le déplace', () => {
    const { editeur, calque } = creer({ annotations: [TIRE] });
    editeur.choisirOutil('selection');
    glisser(editeur, [0.51, 0.5], [0.61, 0.4]);
    assert.equal(editeur.selectionId, 't');
    const a = calque.trouver('t');
    assert.ok(Math.abs(a.x - 0.6) < 1e-9 && Math.abs(a.y - 0.4) < 1e-9, JSON.stringify(a));
});

test('un signe déplacé hors de la page est ramené au bord', () => {
    const { editeur, calque } = creer({ annotations: [TIRE] });
    editeur.choisirOutil('selection');
    glisser(editeur, [0.5, 0.5], [1.3, -0.2]);
    assert.deepEqual([calque.trouver('t').x, calque.trouver('t').y], [1, 0]);
});

test('toucher le vide désélectionne', () => {
    const { editeur } = creer({ annotations: [TIRE] });
    editeur.choisirOutil('selection');
    toucher(editeur, 0.5, 0.5);
    assert.equal(editeur.selectionId, 't');
    toucher(editeur, 0.9, 0.9);
    assert.equal(editeur.selectionId, null);
});

test('la taille choisie s\'applique au signe sélectionné', () => {
    const { editeur, calque } = creer({ annotations: [TIRE] });
    editeur.choisirOutil('selection');
    toucher(editeur, 0.5, 0.5);
    editeur.choisirTaille('s');
    assert.equal(calque.trouver('t').taille, 's');
});

test('supprimer la sélection puis annuler la fait revenir', () => {
    const { editeur, calque } = creer({ annotations: [TIRE] });
    editeur.choisirOutil('selection');
    toucher(editeur, 0.5, 0.5);
    editeur.supprimerSelection();
    assert.equal(calque.annotations.length, 0);
    assert.equal(editeur.selectionId, null);
    editeur.annuler();
    assert.equal(calque.annotations.length, 1);
    editeur.retablir();
    assert.equal(calque.annotations.length, 0);
});

test('annulerGeste abandonne le signe en cours (second doigt posé pour zoomer)', () => {
    const { editeur, calque } = creer();
    editeur.choisirOutil('crescendo');
    editeur.pointerDown(evenement(0.2, 0.5));
    editeur.pointerMove(evenement(0.5, 0.5));
    editeur.annulerGeste();
    editeur.pointerUp(evenement(0.5, 0.5));
    assert.equal(calque.annotations.length, 0);
    assert.equal(editeur.vue(calque.annotations).annotations.length, 0);
});
