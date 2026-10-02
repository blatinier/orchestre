import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    VERSION, PREFIXE_STOCKAGE, LONGUEUR_TEXTE_MAX,
    cheminPdfValide, urlDepuisChemin, cheminOfficiel, nouvelId, arrondirCoord,
    validerAnnotation, validerDocument, lireDocument, serialiser,
    chargerPersonnel, sauverPersonnel,
    Calque, annotationProche, deplacer
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
