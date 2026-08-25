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

def load_existing_annees(output_path):
    """Read the years already recorded in partitions.json.

    Years are added by hand and cannot be derived from the PDF files, so they
    must be carried over every time this script regenerates the JSON.
    """
    if not output_path.exists():
        return {}

    try:
        with open(output_path, encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"⚠ Could not read {output_path.name} ({e}) - years would be lost, aborting")
        raise

    return {
        piece['titre']: piece['annees']
        for piece in data.get('morceaux', [])
        if piece.get('annees')
    }


def compact_annees(json_text):
    """Keep each years array on a single line so the file stays easy to hand-edit."""
    def collapse(match):
        years = re.findall(r'\d+', match.group(1))
        return '"annees": [' + ', '.join(years) + ']'

    return re.sub(r'"annees": \[([^\]]*)\]', collapse, json_text)


def generate_partitions_json():
    # Base directory
    base_dir = Path(__file__).parent / 'partitions'
    output_path = Path(__file__).parent / 'partitions.json'

    # Hand-written years, preserved across regenerations
    existing_annees = load_existing_annees(output_path)

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
        piece = {'titre': titre}
        if titre in existing_annees:
            piece['annees'] = existing_annees[titre]
        piece['instruments'] = instruments
        morceaux.append(piece)

    # Never drop years silently: a renamed or removed PDF loses its title
    orphans = sorted(set(existing_annees) - set(pieces))
    if orphans:
        print("⚠ Years dropped - these titles no longer exist (renamed or removed PDF?):")
        for titre in orphans:
            print(f"    - {titre}: {existing_annees[titre]}")
        print()

    # Create JSON structure
    data = {'morceaux': morceaux}

    # Write to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(compact_annees(json.dumps(data, ensure_ascii=False, indent=2)) + '\n')

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
