#!/usr/bin/env python3
"""
Script to generate partitions.json from PDF files in the partitions directory.
Run this script whenever you add new partitions to update the website.

Usage:
    python3 generate_json.py
"""

import os
import json
import re
from pathlib import Path

def generate_partitions_json():
    # Base directory
    base_dir = Path(__file__).parent / 'partitions'

    if not base_dir.exists():
        print(f"Error: Directory {base_dir} does not exist")
        return

    # Collect all PDF files
    pdf_files = list(base_dir.rglob('*.pdf'))

    # Dictionary to store pieces
    pieces = {}

    # Process each PDF
    for pdf_path in pdf_files:
        filename = pdf_path.name
        parent_dir = pdf_path.parent.name

        # Skip files in root directory (combined scores)
        if parent_dir in ['partitions', 'Nord Deux Sèvres']:
            continue

        # Map folder names to instrument keys
        instrument_map = {
            'Violon 1': 'violon1',
            'Violon 2': 'violon2',
            'Violon 3': 'violon3',
            'Violoncelle 1': 'violoncelle1',
            'Violoncelle 2': 'violoncelle2'
        }

        if parent_dir not in instrument_map:
            continue

        instrument_key = instrument_map[parent_dir]

        # Extract piece name from filename
        # Remove instrument-specific parts from the name
        piece_name = filename.replace('.pdf', '')

        # Normalize the piece name by removing instrument indicators
        piece_name = re.sub(r',?\s*(violon|violoncelle|cello|basse)\s*\d*\.?$', '', piece_name, flags=re.IGNORECASE)
        piece_name = re.sub(r',?\s*violon\s+\d+$', '', piece_name, flags=re.IGNORECASE)
        piece_name = piece_name.strip(', ')

        # Capitalize first letter
        if piece_name:
            piece_name = piece_name[0].upper() + piece_name[1:]

        # Get relative path from orchestre directory
        rel_path = pdf_path.relative_to(Path(__file__).parent)

        # Add to pieces dictionary
        if piece_name not in pieces:
            pieces[piece_name] = {}

        pieces[piece_name][instrument_key] = str(rel_path).replace('\\', '/')

    # Convert to JSON format
    morceaux = []
    for titre, instruments in sorted(pieces.items()):
        morceaux.append({
            'titre': titre,
            'instruments': instruments
        })

    # Create JSON structure
    data = {'morceaux': morceaux}

    # Write to file
    output_path = Path(__file__).parent / 'partitions.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✓ Created {output_path}")
    print(f"✓ Found {len(morceaux)} pieces")
    print(f"\nPieces by instrument availability:")

    # Count pieces by number of instruments
    instrument_count = {}
    for piece in morceaux:
        count = len(piece['instruments'])
        instrument_count[count] = instrument_count.get(count, 0) + 1

    for count in sorted(instrument_count.keys()):
        print(f"  {instrument_count[count]} piece(s) with {count} instrument(s)")

    print(f"\nSample pieces:")
    for i, piece in enumerate(morceaux[:5]):
        instruments_list = ', '.join([f"{k}" for k in piece['instruments'].keys()])
        print(f"  - {piece['titre']}: [{instruments_list}]")

if __name__ == '__main__':
    generate_partitions_json()
