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
