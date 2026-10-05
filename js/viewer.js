// Score viewer: PDF.js renders each page on a canvas, and an SVG overlay
// (LARGEUR_REFERENCE units wide) shows the official and personal annotations.

import {
    cheminPdfValide, urlDepuisChemin, cheminOfficiel, lireDocument, serialiser,
    chargerPersonnel, sauverPersonnel, Calque
} from './annotations/store.js';
import { rendreAnnotation, apercuOutil, LARGEUR_REFERENCE, ONGLETS, OUTILS } from './annotations/symboles.js';
import { Editeur } from './annotations/editeur.js';
import { echelleRendu } from './rendu.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PAS_ZOOM = 1.25;
const LARGEUR_MAX = 900;
// Pages this close to the screen are rendered ahead of scrolling
const MARGE_RENDU = 600;
// Pages further than this from the screen give their canvas memory back
const MARGE_LIBERATION = 3000;

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

    try {
        const echelle = echelleRendu({
            largeurCss: largeur,
            largeurPdf: page.pdfPage.getViewport({ scale: 1 }).width,
            ratio: page.ratio,
            dpr: window.devicePixelRatio
        });
        const vue = page.pdfPage.getViewport({ scale: echelle });
        page.canvas.width = Math.floor(vue.width);
        page.canvas.height = Math.floor(vue.height);

        page.tache = page.pdfPage.render({ canvasContext: page.canvas.getContext('2d'), viewport: vue });
        await page.tache.promise;
    } catch (erreur) {
        if (erreur?.name === 'RenderingCancelledException') return;
        console.error(`Page ${page.num} :`, erreur);
        // Not drawn: the next scroll, zoom or resize retries it
        if (page.largeurRendue === largeur) {
            page.largeurRendue = 0;
        }
    }
}

// Tablets have little canvas memory: drop the bitmap, it is re-rendered when scrolled back to
function liberer(page) {
    page.tache?.cancel();
    page.canvas.width = 0;
    page.canvas.height = 0;
    page.largeurRendue = 0;
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
    const liberation = new IntersectionObserver(entrees => {
        entrees
            .filter(entree => !entree.isIntersecting)
            .forEach(entree => liberer(etat.pages[Number(entree.target.dataset.page) - 1]));
    }, { rootMargin: `${MARGE_LIBERATION}px 0px` });

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
        liberation.observe(element);
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

// ---- Annotate mode ----

// Pointer position relative to a page (to page `num` when given, so a gesture
// keeps its page even when the finger slides off it)
function localiser(event, num = null) {
    const page = num
        ? etat.pages[num - 1]
        : etat.pages[Number(event.target.closest?.('.page')?.dataset.page) - 1];
    if (!page) return null;

    const rect = page.element.getBoundingClientRect();
    return {
        num: page.num,
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
        ratio: page.ratio
    };
}

function afficherOnglet(id) {
    document.querySelectorAll('#onglets [data-onglet]').forEach(bouton => {
        bouton.classList.toggle('actif', bouton.dataset.onglet === id);
        bouton.setAttribute('aria-selected', String(bouton.dataset.onglet === id));
    });
    document.querySelectorAll('#outils [data-outil]').forEach(bouton => {
        bouton.hidden = bouton.dataset.onglet !== id;
    });
}

function majPalette() {
    const editeur = etat.editeur;
    document.querySelectorAll('#palette [data-outil]').forEach(bouton => {
        bouton.classList.toggle('actif', bouton.dataset.outil === editeur.outil);
    });
    document.querySelectorAll('#tailles [data-taille]').forEach(bouton => {
        bouton.classList.toggle('actif', bouton.dataset.taille === editeur.taille);
    });
    document.getElementById('annuler').disabled = !etat.calque.peutAnnuler;
    document.getElementById('retablir').disabled = !etat.calque.peutRetablir;
    document.getElementById('supprimer').disabled = !editeur.selectionId;
    document.body.classList.toggle('outil-defiler', editeur.outil === 'defiler');
}

function installerEditeur() {
    etat.editeur = new Editeur({
        calque: etat.calque,
        localiser,
        redessiner: num => (num ? redessinerCalques(num) : redessinerTout()),
        enregistrer,
        surEtat: majPalette
    });

    document.getElementById('onglets').innerHTML = ONGLETS
        .map(o => `<button role="tab" data-onglet="${o.id}">${o.libelle}</button>`)
        .join('');
    document.getElementById('outils').innerHTML = OUTILS
        .map(o => `<button class="outil" data-outil="${o.id}" data-onglet="${o.onglet}" title="${o.libelle}" aria-label="${o.libelle}">${apercuOutil(o)}</button>`)
        .join('');
    afficherOnglet(ONGLETS[0].id);

    document.getElementById('onglets').addEventListener('click', e => {
        const bouton = e.target.closest('[data-onglet]');
        if (bouton) afficherOnglet(bouton.dataset.onglet);
    });
    document.getElementById('palette').addEventListener('click', e => {
        const outil = e.target.closest('[data-outil]');
        const taille = e.target.closest('[data-taille]');
        if (outil) etat.editeur.choisirOutil(outil.dataset.outil);
        if (taille) etat.editeur.choisirTaille(taille.dataset.taille);
    });
    document.getElementById('annuler').addEventListener('click', () => etat.editeur.annuler());
    document.getElementById('retablir').addEventListener('click', () => etat.editeur.retablir());
    document.getElementById('supprimer').addEventListener('click', () => etat.editeur.supprimerSelection());

    const basculer = document.getElementById('basculerAnnoter');
    basculer.addEventListener('click', () => {
        const actif = !etat.editeur.actif;
        basculer.setAttribute('aria-pressed', String(actif));
        document.getElementById('palette').hidden = !actif;
        document.body.classList.toggle('annotation-active', actif);
        // Editing an invisible layer would be confusing
        if (actif) {
            document.getElementById('voirPerso').checked = true;
            document.body.classList.remove('masquer-perso');
        }
        etat.editeur.activer(actif);
    });

    const pages = document.getElementById('pages');
    pages.addEventListener('pointerdown', e => etat.editeur.pointerDown(e));
    pages.addEventListener('pointermove', e => etat.editeur.pointerMove(e));
    pages.addEventListener('pointerup', e => etat.editeur.pointerUp(e));
    pages.addEventListener('pointercancel', e => etat.editeur.pointerCancel(e));

    document.addEventListener('keydown', e => {
        if (!etat.editeur.actif || e.target.closest?.('input, textarea')) return;
        const commande = e.ctrlKey || e.metaKey;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            etat.editeur.supprimerSelection();
        } else if (commande && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            etat.editeur.annuler();
        } else if (commande && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
            e.preventDefault();
            etat.editeur.retablir();
        }
    });

    majPalette();
}

// ---- Menu: export / import / clear ----

function nomFichierAnnotations() {
    return etat.cheminPdf.split('/').pop().replace(/\.pdf$/i, '.json');
}

function exporter() {
    const blob = new Blob([serialiser(etat.cheminPdf, etat.calque.annotations)], { type: 'application/json' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = nomFichierAnnotations();
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

function apresRemplacement() {
    etat.editeur.selectionId = null;
    enregistrer();
    redessinerTout();
    majPalette();
}

async function importer(fichier) {
    let doc;
    try {
        doc = lireDocument(await fichier.text());
    } catch (erreur) {
        alert(`Import impossible : ${erreur.message}.`);
        return;
    }

    if (doc.pdf && doc.pdf !== etat.cheminPdf
        && !confirm(`Ce fichier a été créé pour une autre partition :\n${doc.pdf}\n\nL'importer quand même ?`)) {
        return;
    }
    const actuelles = etat.calque.annotations.length;
    if (actuelles > 0
        && !confirm(`Remplacer vos ${actuelles} annotation(s) par les ${doc.annotations.length} du fichier ?`)) {
        return;
    }

    etat.calque.remplacer(doc.annotations);
    apresRemplacement();
    if (doc.rejetees) {
        alert(`${doc.rejetees} annotation(s) illisible(s) ont été ignorées.`);
    }
}

function effacer() {
    const actuelles = etat.calque.annotations.length;
    if (actuelles === 0) return;
    if (!confirm(`Effacer vos ${actuelles} annotation(s) sur cette partition ?`)) return;
    etat.calque.remplacer([]);
    apresRemplacement();
}

function installerMenu() {
    const bouton = document.getElementById('ouvrirMenu');
    const liste = document.getElementById('menuListe');
    const fichier = document.getElementById('fichierImport');

    const fermer = () => {
        liste.hidden = true;
        bouton.setAttribute('aria-expanded', 'false');
    };

    bouton.addEventListener('click', e => {
        e.stopPropagation();
        liste.hidden = !liste.hidden;
        bouton.setAttribute('aria-expanded', String(!liste.hidden));
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.menu')) fermer();
    });

    document.getElementById('exporter').addEventListener('click', () => {
        fermer();
        exporter();
    });
    document.getElementById('importer').addEventListener('click', () => {
        fermer();
        fichier.click();
    });
    fichier.addEventListener('change', () => {
        if (fichier.files[0]) importer(fichier.files[0]);
        // Allow importing the same file again
        fichier.value = '';
    });
    document.getElementById('effacer').addEventListener('click', () => {
        fermer();
        effacer();
    });
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
    installerEditeur();
    installerMenu();

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
