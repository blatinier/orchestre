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
    const instrumentsHTML = Object.entries(piece.instruments)
        .map(([instrument, path]) => `
            <a href="${path}" class="instrument-link" target="_blank" rel="noopener noreferrer">
                ${instrumentNames[instrument] || instrument}
            </a>
        `)
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

// Setup event listeners
function setupEventListeners() {
    // Filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));

            // Add active class to clicked button
            button.classList.add('active');

            // Update current filter
            currentFilter = button.dataset.instrument;

            // Update display
            displayPieces();
            updatePieceCount();
        });
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
    setupEventListeners();
    loadPartitions();
});
