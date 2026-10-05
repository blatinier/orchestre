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
    'corde_1', 'corde_2', 'corde_3', 'corde_4', 'pouce',
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

test('un nom hérité d\'Object ne produit rien et ne plante pas', () => {
    for (const type of ['constructor', '__proto__', 'toString']) {
        assert.equal(rendreAnnotation({ id: 'x', page: 1, type, x1: 0, y1: 0, x2: 1, y2: 1 }, 1000), '', type);
    }
});

test('le pouce est un doigté', () => {
    assert.equal(SYMBOLES.pouce.onglet, 'doigtes');
    assert.equal(SYMBOLES.pouce.nature, 'ponctuel');
});

test('les infobulles des cordes valent pour le violon et le violoncelle', () => {
    assert.equal(SYMBOLES.corde_1.libelle, 'Corde I (Mi au violon, La au violoncelle)');
    assert.equal(SYMBOLES.corde_4.libelle, 'Corde IV (Sol au violon, Do au violoncelle)');
});
