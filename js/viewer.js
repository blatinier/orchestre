// Score viewer: PDF.js renders each page on a canvas, and an SVG overlay
// (LARGEUR_REFERENCE units wide) shows the official and personal annotations.

import {
    cheminPdfValide, urlDepuisChemin, cheminOfficiel, lireDocument,
    chargerPersonnel, sauverPersonnel, Calque
} from './annotations/store.js';
import { rendreAnnotation, LARGEUR_REFERENCE } from './annotations/symboles.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PAS_ZOOM = 1.25;
const LARGEUR_MAX = 900;
// Pages this close to the screen are rendered ahead of scrolling
const MARGE_RENDU = 600;

const etat = {
    cheminPdf: null,
    pdf: null,
    pages: [],
    zoom: 1,
    officielles: [],
    calque: new Calque(),
    stockage: obtenirStockage(),
    editeur: null,
    alerteSauvegarde: false
};

// localStorage throws in some private modes: treat that as "no storage"
function obtenirStockage() {
    try {
        const stockage = window.localStorage;
        stockage.setItem('orchestre_test', '1');
        stockage.removeItem('orchestre_test');
        return stockage;
    } catch {
        return null;
    }
}

function avertir(message) {
    const bandeau = document.getElementById('bandeau');
    const ligne = document.createElement('p');
    ligne.textContent = message;
    bandeau.append(ligne);
    bandeau.hidden = false;
}

function afficherErreur(message, urlPdf) {
    const pages = document.getElementById('pages');
    pages.innerHTML = '';
    const bloc = document.createElement('div');
    bloc.className = 'message';
    const texte = document.createElement('p');
    texte.textContent = message;
    bloc.append(texte);
    const lien = document.createElement('a');
    if (urlPdf) {
        lien.href = urlPdf;
        lien.textContent = 'Télécharger le PDF';
    } else {
        lien.href = 'index.html';
        lien.textContent = 'Retour à la liste des partitions';
    }
    const ligne = document.createElement('p');
    ligne.append(lien);
    bloc.append(ligne);
    pages.append(bloc);
}

// ---- Layers ----

function redessinerCalques(num) {
    const page = etat.pages[num - 1];
    if (!page) return;

    const hauteur = LARGEUR_REFERENCE * page.ratio;
    const vue = etat.editeur
        ? etat.editeur.vue(etat.calque.annotations)
        : { annotations: etat.calque.annotations, selectionId: null };

    const officielles = etat.officielles
        .filter(a => a.page === num)
        .map(a => rendreAnnotation(a, hauteur))
        .join('');
    const personnelles = vue.annotations
        .filter(a => a.page === num)
        .map(a => rendreAnnotation(a, hauteur, { selectionnee: a.id === vue.selectionId }))
        .join('');

    page.svg.innerHTML = `<g class="calque-officiel">${officielles}</g><g class="calque-perso">${personnelles}</g>`;
}

function redessinerTout() {
    etat.pages.forEach(page => redessinerCalques(page.num));
}

function chargerCalquePerso() {
    if (!etat.stockage) {
        avertir('Ce navigateur ne permet pas d\'enregistrer : vos annotations ne seront pas conservées. Pensez à les exporter (menu ⋯).');
    }
    const { annotations, rejetees, corrompu } = chargerPersonnel(etat.stockage, etat.cheminPdf);
    if (corrompu) {
        avertir('Vos annotations enregistrées pour cette partition étaient illisibles et n\'ont pas pu être chargées.');
    } else if (rejetees) {
        avertir(`${rejetees} de vos annotations étaient illisibles et ont été ignorées.`);
    }
    etat.calque = new Calque(annotations);
}

function enregistrer() {
    const ok = sauverPersonnel(etat.stockage, etat.cheminPdf, etat.calque.annotations);
    if (!ok && etat.stockage && !etat.alerteSauvegarde) {
        etat.alerteSauvegarde = true;
        avertir('Enregistrement impossible (stockage du navigateur plein ?) : exportez vos annotations pour ne pas les perdre.');
    }
}

async function chargerOfficielles() {
    let reponse;
    try {
        reponse = await fetch(urlDepuisChemin(cheminOfficiel(etat.cheminPdf)), { cache: 'no-cache' });
    } catch (erreur) {
        console.warn('Annotations officielles indisponibles :', erreur);
        return;
    }

    // No official file for this score: nothing to show
    if (reponse.status === 404) return;
    if (!reponse.ok) {
        avertir('Les annotations officielles n\'ont pas pu être chargées.');
        return;
    }

    try {
        const { annotations, rejetees } = lireDocument(await reponse.text());
        etat.officielles = annotations;
        if (rejetees) {
            avertir(`${rejetees} annotation(s) officielle(s) illisible(s) ont été ignorées.`);
        }
    } catch {
        avertir('Les annotations officielles de cette partition sont illisibles et ont été ignorées.');
        return;
    }

    redessinerTout();
}

// ---- Pages ----

function largeurPage() {
    const disponible = document.getElementById('pages').clientWidth - 16;
    return Math.round(Math.min(disponible, LARGEUR_MAX) * etat.zoom);
}

function dimensionner(page) {
    const largeur = largeurPage();
    page.element.style.width = `${largeur}px`;
    page.element.style.height = `${Math.round(largeur * page.ratio)}px`;
}

async function rendrePage(page) {
    const largeur = largeurPage();
    if (page.largeurRendue === largeur) return;
    page.largeurRendue = largeur;
    page.tache?.cancel();

    const echelle = (largeur / page.pdfPage.getViewport({ scale: 1 }).width) * (window.devicePixelRatio || 1);
    const vue = page.pdfPage.getViewport({ scale: echelle });
    page.canvas.width = Math.floor(vue.width);
    page.canvas.height = Math.floor(vue.height);

    page.tache = page.pdfPage.render({ canvasContext: page.canvas.getContext('2d'), viewport: vue });
    try {
        await page.tache.promise;
    } catch (erreur) {
        if (erreur?.name !== 'RenderingCancelledException') {
            console.error(`Page ${page.num} :`, erreur);
        }
    }
}

function estProcheDeLaVue(page) {
    const rect = page.element.getBoundingClientRect();
    return rect.bottom > -MARGE_RENDU && rect.top < window.innerHeight + MARGE_RENDU;
}

async function preparerPages() {
    const conteneur = document.getElementById('pages');
    const observateur = new IntersectionObserver(entrees => {
        entrees
            .filter(entree => entree.isIntersecting)
            .forEach(entree => rendrePage(etat.pages[Number(entree.target.dataset.page) - 1]));
    }, { rootMargin: `${MARGE_RENDU}px 0px` });

    for (let num = 1; num <= etat.pdf.numPages; num++) {
        const pdfPage = await etat.pdf.getPage(num);
        const vue = pdfPage.getViewport({ scale: 1 });
        const ratio = vue.height / vue.width;

        const element = document.createElement('div');
        element.className = 'page';
        element.dataset.page = num;
        const canvas = document.createElement('canvas');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'calques-page');
        svg.setAttribute('viewBox', `0 0 ${LARGEUR_REFERENCE} ${LARGEUR_REFERENCE * ratio}`);
        element.append(canvas, svg);
        conteneur.append(element);

        const page = { num, pdfPage, element, canvas, svg, ratio, largeurRendue: 0, tache: null };
        etat.pages.push(page);
        dimensionner(page);
        redessinerCalques(num);
        observateur.observe(element);
    }
}

// Resize every page, keep the reading position, re-render what is on screen
function appliquerZoom() {
    const racine = document.documentElement;
    const position = window.scrollY / Math.max(racine.scrollHeight, 1);
    etat.pages.forEach(dimensionner);
    window.scrollTo(window.scrollX, position * racine.scrollHeight);
    etat.pages.filter(estProcheDeLaVue).forEach(rendrePage);
}

function changerZoom(facteur) {
    etat.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, etat.zoom * facteur));
    appliquerZoom();
}

// ---- Controls ----

function installerControles() {
    document.getElementById('zoomPlus').addEventListener('click', () => changerZoom(PAS_ZOOM));
    document.getElementById('zoomMoins').addEventListener('click', () => changerZoom(1 / PAS_ZOOM));

    let attente = null;
    window.addEventListener('resize', () => {
        clearTimeout(attente);
        attente = setTimeout(appliquerZoom, 200);
    });

    document.getElementById('voirOfficiel').addEventListener('change', e => {
        document.body.classList.toggle('masquer-officiel', !e.target.checked);
    });
    document.getElementById('voirPerso').addEventListener('change', e => {
        document.body.classList.toggle('masquer-perso', !e.target.checked);
    });

    // Coming from the list: go back to it with its filters intact
    document.getElementById('retour').addEventListener('click', e => {
        if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
            e.preventDefault();
            history.back();
        }
    });
}

async function ouvrir() {
    installerControles();

    const chemin = new URLSearchParams(window.location.search).get('pdf');
    if (!cheminPdfValide(chemin)) {
        afficherErreur('Partition introuvable : le lien est invalide.', null);
        return;
    }

    etat.cheminPdf = chemin;
    const url = urlDepuisChemin(chemin);
    const nom = chemin.split('/').pop().replace(/\.pdf$/i, '');
    document.getElementById('titre').textContent = nom;
    document.title = `${nom} - Orchestre à Cordes`;
    document.getElementById('telecharger').href = url;

    chargerCalquePerso();

    try {
        const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
        pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
        etat.pdf = await pdfjs.getDocument(url).promise;
    } catch (erreur) {
        console.error('Ouverture du PDF impossible :', erreur);
        afficherErreur('Impossible d\'afficher cette partition ici.', url);
        return;
    }

    await preparerPages();
    chargerOfficielles();
}

ouvrir();
