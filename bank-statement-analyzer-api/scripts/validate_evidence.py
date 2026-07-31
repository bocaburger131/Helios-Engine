#!/usr/bin/env python3
"""Validate dropped_rows / uncertain_assignments evidence against the shared schema.

Usage:
  python scripts/extract_tables.py statement.pdf | python scripts/validate_evidence.py
  python scripts/validate_evidence.py path/to/evidence.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("jsonschema is required: pip install jsonschema", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "src" / "services" / "extraction" / "rescueEvidenceSchema.json"


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    if len(sys.argv) > 1:
        payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        payload = json.load(sys.stdin)

    errors: list[str] = []
    for i, row in enumerate(payload.get("dropped_rows") or []):
        try:
            jsonschema.validate(
                row,
                {
                    "$ref": "#/definitions/droppedRow",
                    "definitions": schema["definitions"],
                },
            )
        except jsonschema.ValidationError as exc:
            errors.append(f"dropped_rows[{i}]: {exc.message}")

    for i, row in enumerate(payload.get("uncertain_assignments") or []):
        try:
            jsonschema.validate(
                row,
                {
                    "$ref": "#/definitions/uncertainAssignment",
                    "definitions": schema["definitions"],
                },
            )
        except jsonschema.ValidationError as exc:
            errors.append(f"uncertain_assignments[{i}]: {exc.message}")

    if errors:
        print(f"EVIDENCE_SCHEMA_FAIL count={len(errors)}", file=sys.stderr)
        for err in errors[:20]:
            print(err, file=sys.stderr)
        return 1

    print(
        "EVIDENCE_SCHEMA_OK "
        f"dropped={len(payload.get('dropped_rows') or [])} "
        f"uncertain={len(payload.get('uncertain_assignments') or [])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
