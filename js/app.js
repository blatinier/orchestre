// Global variables
let allPieces = [];
let currentFilter = 'all';
let currentSearchTerm = '';
let currentYear = 'all';

// Instrument name mapping
const instrumentNames = {
    'violon1': 'Violon 1',
    'violon2': 'Violon 2',
    'violon3': 'Violon 3',
    'violoncelle1': 'Violoncelle 1',
    'violoncelle2': 'Violoncelle 2'
};

// Instrument colors for badges
const instrumentColors = {
    'violon1': '#e74c3c',
    'violon2': '#e67e22',
    'violon3': '#f39c12',
    'violoncelle1': '#3498db',
    'violoncelle2': '#9b59b6'
};

// LocalStorage key
const STORAGE_KEY = 'orchestre_instrument_preference';

// Load partitions data
async function loadPartitions() {
    try {
        const response = await fetch('partitions.json');
        const data = await response.json();
        allPieces = data.morceaux;
        buildYearFilter();
        displayPieces();
        updatePieceCount();
    } catch (error) {
        console.error('Error loading partitions:', error);
        showError();
    }
}

// A year stored in partitions.json is the start of a school year: 2024 -> "2024/2025"
function formatSchoolYear(annee) {
    return `${annee}/${annee + 1}`;
}

// Collect every year present in the data, most recent first
function getAvailableYears() {
    const years = new Set();
    allPieces.forEach(piece => {
        (piece.annees || []).forEach(annee => years.add(annee));
    });
    return Array.from(years).sort((a, b) => b - a);
}

// Build the year filter row (hidden when no piece has a year yet)
function buildYearFilter() {
    const wrapper = document.getElementById('yearFilter');
    const buttons = document.getElementById('yearButtons');
    const years = getAvailableYears();

    // A shared link may point at a year nobody plays anymore
    if (currentYear !== 'all' && !years.includes(currentYear)) {
        currentYear = 'all';
    }

    if (years.length === 0) {
        wrapper.hidden = true;
        return;
    }

    wrapper.hidden = false;
    buttons.innerHTML = [
        `<button class="filter-btn${currentYear === 'all' ? ' active' : ''}" data-year="all">Toutes</button>`,
        ...years.map(annee =>
            `<button class="filter-btn${currentYear === annee ? ' active' : ''}" data-year="${annee}">${formatSchoolYear(annee)}</button>`
        )
    ].join('');
}

// Display pieces
function displayPieces() {
    const piecesList = document.getElementById('piecesList');
    const filteredPieces = filterPieces();

    if (filteredPieces.length === 0) {
        piecesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎻</div>
                <div class="empty-state-text">Aucun morceau trouvé</div>
            </div>
        `;
        return;
    }

    piecesList.innerHTML = filteredPieces.map(piece => createPieceCard(piece)).join('');
}

// Share a piece
function sharePiece(titre, instrument) {
    const url = new URL(window.location.href);
    url.searchParams.set('morceau', titre);
    if (instrument && instrument !== 'all') {
        url.searchParams.set('instrument', instrument);
    }
    if (currentYear !== 'all') {
        url.searchParams.set('annee', currentYear);
    }

    const shareUrl = url.toString();

    // Use Web Share API if available, otherwise copy to clipboard
    if (navigator.share) {
        navigator.share({
            title: `${titre} - ${instrument !== 'all' ? instrumentNames[instrument] : 'Orchestre à Cordes'}`,
            text: `Partition : ${titre}`,
            url: shareUrl
        }).catch(err => console.log('Erreur lors du partage:', err));
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('Lien copié dans le presse-papier !');
        }).catch(err => {
            console.error('Erreur lors de la copie:', err);
            // Final fallback: show the URL
            prompt('Copiez ce lien:', shareUrl);
        });
    }
}

// Render the years a piece is played, oldest first
function createYearBadges(piece) {
    const annees = piece.annees || [];
    if (annees.length === 0) {
        return '';
    }

    const badges = [...annees]
        .sort((a, b) => a - b)
        .map(annee => `<span class="year-badge">${formatSchoolYear(annee)}</span>`)
        .join('');

    return `<div class="piece-years">${badges}</div>`;
}

// Create a piece card
function createPieceCard(piece) {
    // If a specific instrument is selected, show only that instrument's download
    if (currentFilter !== 'all' && piece.instruments[currentFilter]) {
        const path = piece.instruments[currentFilter];
        const color = instrumentColors[currentFilter];
        return `
            <div class="piece-card">
                <div class="piece-header">
                    <h2 class="piece-title">${piece.titre}</h2>
                    <span class="instrument-badge" style="background-color: ${color};">
                        ${instrumentNames[currentFilter]}
                    </span>
                </div>
                ${createYearBadges(piece)}
                <div class="piece-actions">
                    <a href="${path}" class="download-button" target="_blank" rel="noopener noreferrer">
                        📄 Télécharger la partition
                    </a>
                    <button class="share-button" onclick="sharePiece('${piece.titre.replace(/'/g, "\\'")}', '${currentFilter}')">
                        🔗 Partager
                    </button>
                </div>
            </div>
        `;
    }

    // Otherwise, show all available instruments with color badges
    const instrumentsHTML = Object.entries(piece.instruments)
        .map(([instrument, path]) => {
            const color = instrumentColors[instrument];
            return `
                <a href="${path}" class="instrument-link" target="_blank" rel="noopener noreferrer" style="border-color: ${color}; color: ${color};">
                    <span class="instrument-badge-inline" style="background-color: ${color};"></span>
                    ${instrumentNames[instrument] || instrument}
                </a>
            `;
        })
        .join('');

    return `
        <div class="piece-card">
            <div class="piece-header-with-share">
                <h2 class="piece-title">${piece.titre}</h2>
                <button class="share-button-small" onclick="sharePiece('${piece.titre.replace(/'/g, "\\'")}', 'all')">
                    🔗
                </button>
            </div>
            ${createYearBadges(piece)}
            <div class="instruments-grid">
                ${instrumentsHTML}
            </div>
        </div>
    `;
}

// Filter pieces based on current filter and search term
function filterPieces() {
    return allPieces.filter(piece => {
        // Filter by instrument
        const instrumentMatch = currentFilter === 'all' ||
                               piece.instruments.hasOwnProperty(currentFilter);

        // Filter by year played
        const yearMatch = currentYear === 'all' ||
                          (piece.annees || []).includes(currentYear);

        // Filter by search term
        const searchMatch = currentSearchTerm === '' ||
                           piece.titre.toLowerCase().includes(currentSearchTerm.toLowerCase());

        return instrumentMatch && yearMatch && searchMatch;
    });
}

// Update piece count
function updatePieceCount() {
    const pieceCount = document.getElementById('pieceCount');
    const filteredCount = filterPieces().length;
    const totalCount = allPieces.length;

    if (currentFilter === 'all' && currentSearchTerm === '' && currentYear === 'all') {
        pieceCount.textContent = `${totalCount} morceau${totalCount > 1 ? 'x' : ''} disponible${totalCount > 1 ? 's' : ''}`;
    } else {
        pieceCount.textContent = `${filteredCount} morceau${filteredCount > 1 ? 'x' : ''} trouvé${filteredCount > 1 ? 's' : ''} sur ${totalCount}`;
    }
}

// Show error message
function showError() {
    const piecesList = document.getElementById('piecesList');
    piecesList.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-text">Erreur lors du chargement des partitions</div>
        </div>
    `;
}

// Load saved instrument preference
function loadInstrumentPreference() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const { instrument, remember } = JSON.parse(saved);
            if (remember) {
                currentFilter = instrument;
                const select = document.getElementById('myInstrument');
                const checkbox = document.getElementById('rememberInstrument');
                if (select) select.value = instrument;
                if (checkbox) checkbox.checked = true;
                return true;
            }
        } catch (e) {
            console.error('Error loading preference:', e);
        }
    }
    return false;
}

// Save instrument preference
function saveInstrumentPreference(instrument, remember) {
    if (remember) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ instrument, remember }));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Instrument selector
    const instrumentSelect = document.getElementById('myInstrument');
    const rememberCheckbox = document.getElementById('rememberInstrument');

    instrumentSelect.addEventListener('change', (e) => {
        currentFilter = e.target.value;
        saveInstrumentPreference(currentFilter, rememberCheckbox.checked);
        displayPieces();
        updatePieceCount();
    });

    rememberCheckbox.addEventListener('change', (e) => {
        saveInstrumentPreference(currentFilter, e.target.checked);
    });

    // Year filter buttons
    const yearButtons = document.getElementById('yearButtons');
    yearButtons.addEventListener('click', (e) => {
        const button = e.target.closest('.filter-btn');
        if (!button) return;

        currentYear = button.dataset.year === 'all' ? 'all' : Number(button.dataset.year);
        yearButtons.querySelectorAll('.filter-btn')
            .forEach(other => other.classList.toggle('active', other === button));
        displayPieces();
        updatePieceCount();
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value;
        displayPieces();
        updatePieceCount();
    });

    // Clear search on Escape
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            currentSearchTerm = '';
            displayPieces();
            updatePieceCount();
        }
    });
}

// Handle URL parameters for sharing
function handleSharedLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const morceau = urlParams.get('morceau');
    const instrument = urlParams.get('instrument');
    const annee = Number(urlParams.get('annee'));

    if (Number.isInteger(annee) && annee > 0) {
        currentYear = annee;
    }

    if (instrument) {
        currentFilter = instrument;
        const select = document.getElementById('myInstrument');
        if (select) select.value = instrument;
    }

    if (morceau) {
        currentSearchTerm = morceau;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = morceau;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    handleSharedLink();
    loadInstrumentPreference();
    setupEventListeners();
    loadPartitions();
});
