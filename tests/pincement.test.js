import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesurer, zoomApresPincement, defilementAncre } from '../js/pincement.js';

const doigt = (clientX, clientY) => ({ clientX, clientY });

test('mesurer donne l\'écart et le centre de deux doigts', () => {
    assert.deepEqual(mesurer(doigt(100, 100), doigt(400, 500)), { distance: 500, centre: { x: 250, y: 300 } });
});

test('écarter les doigts zoome dans la même proportion', () => {
    assert.equal(zoomApresPincement(1, 200, 300, 0.5, 3), 1.5);
});

test('rapprocher les doigts dézoome', () => {
    assert.equal(zoomApresPincement(2, 400, 200, 0.5, 3), 1);
});

test('le zoom reste entre ses limites', () => {
    assert.equal(zoomApresPincement(2, 100, 1000, 0.5, 3), 3);
    assert.equal(zoomApresPincement(1, 1000, 10, 0.5, 3), 0.5);
});

test('deux doigts posés au même endroit ne cassent rien', () => {
    assert.equal(zoomApresPincement(1.5, 0, 200, 0.5, 3), 1.5);
});

test('le point pincé reste sous les doigts après le zoom', () => {
    // Content point 1000 px from the top of the score, under fingers at 300 px on screen,
    // zoomed by 2: it is now 2000 px down, so the scroll must be 1700
    assert.equal(defilementAncre(1000, 2, 300), 1700);
});

test('le défilement ne devient jamais négatif', () => {
    assert.equal(defilementAncre(100, 0.5, 300), 0);
});
