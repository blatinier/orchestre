// Global variables
let allPieces = [];
let currentFilter = 'all';
let currentSearchTerm = '';

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
        displayPieces();
        updatePieceCount();
    } catch (error) {
        console.error('Error loading partitions:', error);
        showError();
    }
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
                <a href="${path}" class="download-button" target="_blank" rel="noopener noreferrer">
                    📄 Télécharger la partition
                </a>
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
            <h2 class="piece-title">${piece.titre}</h2>
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

        // Filter by search term
        const searchMatch = currentSearchTerm === '' ||
                           piece.titre.toLowerCase().includes(currentSearchTerm.toLowerCase());

        return instrumentMatch && searchMatch;
    });
}

// Update piece count
function updatePieceCount() {
    const pieceCount = document.getElementById('pieceCount');
    const filteredCount = filterPieces().length;
    const totalCount = allPieces.length;

    if (currentFilter === 'all' && currentSearchTerm === '') {
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

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    loadInstrumentPreference();
    setupEventListeners();
    loadPartitions();
});
