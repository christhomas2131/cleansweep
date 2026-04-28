"""
CleanSweep license key generator.

Usage: py -3.12 tools/generate_keys.py [count]
Default count: 100

Generates keys in CSWEEP-XXXX-XXXX-XXXX-XXXX format and writes them
to licenses_unsold.txt at the project root.

To "sell" a key:
1. Cut a line from licenses_unsold.txt
2. Email it to the buyer
3. Append it to licenses_sold.txt with the buyer's info:
   CSWEEP-AAAA-BBBB-CCCC-DDDD,buyer@email.com,2026-04-25
"""

import secrets
import string
import sys
import os
from pathlib import Path

CHARS = string.ascii_uppercase + string.digits  # no lowercase, no special


def generate_key():
    parts = [''.join(secrets.choice(CHARS) for _ in range(4)) for _ in range(4)]
    return 'CSWEEP-' + '-'.join(parts)


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 100

    project_root = Path(__file__).parent.parent
    unsold_path = project_root / 'licenses_unsold.txt'
    sold_path = project_root / 'licenses_sold.txt'

    # Read existing keys (in case script is run multiple times)
    existing = set()
    if unsold_path.exists():
        existing.update(line.strip() for line in unsold_path.read_text().splitlines() if line.strip())
    if sold_path.exists():
        for line in sold_path.read_text().splitlines():
            if line.strip() and not line.startswith('#'):
                existing.add(line.split(',')[0].strip())

    new_keys = set()
    while len(new_keys) < count:
        k = generate_key()
        if k not in existing and k not in new_keys:
            new_keys.add(k)

    # Append to unsold file
    write_mode = 'a' if unsold_path.exists() and unsold_path.stat().st_size > 0 else 'w'
    with open(unsold_path, write_mode) as f:
        if write_mode == 'w':
            f.write('# CleanSweep license keys — UNSOLD\n')
            f.write('# Format: CSWEEP-XXXX-XXXX-XXXX-XXXX (one per line)\n')
            f.write('# When you sell one: cut from this file, paste with buyer info into licenses_sold.txt\n\n')
        for k in sorted(new_keys):
            f.write(k + '\n')

    # Initialize sold file with header if it doesn't exist
    if not sold_path.exists():
        sold_path.write_text(
            '# CleanSweep license keys — SOLD\n'
            '# Format: KEY,buyer_email,date_sold,notes\n'
            '# Example: CSWEEP-A1B2-C3D4-E5F6-G7H8,jdoe@example.com,2026-04-25,first sale\n\n'
        )

    total_unsold = sum(
        1 for line in unsold_path.read_text().splitlines()
        if line.strip() and not line.startswith('#')
    )
    print(f'Generated {len(new_keys)} new keys.')
    print(f'Total in unsold file: {total_unsold}')
    print(f'Unsold file: {unsold_path}')
    print(f'Sold file:   {sold_path}')


if __name__ == '__main__':
    main()
