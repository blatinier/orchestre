import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echelleRendu, PIXELS_MAX } from '../js/rendu.js';

// A4 portrait in PDF points
const A4 = { largeurPdf: 595, ratio: 842 / 595 };

function pixels(echelle, { largeurPdf, ratio }) {
    const largeur = largeurPdf * echelle;
    return largeur * largeur * ratio;
}

test('échelle nette (largeur CSS × densité de l\'écran) quand le canvas reste raisonnable', () => {
    assert.equal(echelleRendu({ ...A4, largeurCss: 595, dpr: 2 }), 2);
});

test('échelle plafonnée pour qu\'un canvas ne dépasse pas PIXELS_MAX', () => {
    // iPad zoomé au maximum : 2400 px CSS × densité 2
    const echelle = echelleRendu({ ...A4, largeurCss: 2400, dpr: 2 });
    assert.ok(echelle < (2400 / 595) * 2);
    assert.ok(pixels(echelle, A4) <= PIXELS_MAX + 1);
    assert.ok(pixels(echelle, A4) > PIXELS_MAX * 0.99);
});

test('densité d\'écran absente comptée comme 1', () => {
    assert.equal(echelleRendu({ ...A4, largeurCss: 595, dpr: undefined }), 1);
});

test('PIXELS_MAX reste sous la limite d\'un canvas iOS (16,7 Mpx)', () => {
    assert.ok(PIXELS_MAX <= 16_777_216 / 3);
});
