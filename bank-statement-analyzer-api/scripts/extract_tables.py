#!/usr/bin/env python3
"""
Spatial table extraction for bank statements (pdfplumber).
Stdout: single JSON object. Errors: stderr + exit 1.
Debug telemetry: stderr lines PDFPLUMBER_DEBUG (never stdout).
Usage: python extract_tables.py <pdf_path> [--bank generic]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    import jsonschema
except ImportError:
    jsonschema = None  # type: ignore[assignment]

try:
    _SCHEMA_PATH = Path(__file__).resolve().parents[1] / "src" / "services" / "extraction" / "rescueEvidenceSchema.json"
    _EVIDENCE_SCHEMA = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    _SCHEMA_AVAILABLE = jsonschema is not None
except (ImportError, FileNotFoundError, json.JSONDecodeError):
    _SCHEMA_AVAILABLE = False

try:
    import pdfplumber
except ImportError:
    print("pdfplumber is not installed. Run: pip install -r scripts/requirements.txt", file=sys.stderr)
    sys.exit(1)

DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}(?:/\d{2,4})?$")
DATE_PREFIX_RE = re.compile(r"^(\d{1,2}/\d{1,2})(?:/\d{2,4})?\s+(.+)$", re.I)
MONEY_RE = re.compile(r"^\(?\$?\s*([\d,]+\.\d{2})\)?$")
SUMMARY_RE = re.compile(
    r"deposits?/credits?|withdrawals?/debits?|beginning balance|ending balance|"
    r"activity summary|opening balance|closing balance|total deposits|"
    r"average ledg|minimum dai|totals?\s+\$|total service|"
    r"cash deposited?\s*\(\$|transactions?\s+\$",
    re.I,
)
# Row descriptions that are just balance-value artifacts, not real transactions
BALANCE_ARTIFACT_RE = re.compile(
    r"^\d{1,2}/\d{1,2}$"  # e.g. "1/28" — date fragment from balance bleed
)
# Reference numbers misread as transaction descriptions
REFERENCE_NUMBER_RE = re.compile(r"^\d{4,}$")  # e.g. "6932", "0136034", "012425", "250105"
# Continuation-line fragments — address pieces, reference IDs, and card suffixes
# that are never standalone transactions.  These survive row splitting when
# pdfplumber clusters multi-line descriptions into separate rows.
CONT_FRAGMENT_RE = re.compile(
    r"^(?:"
    r"\d{4,}"  # Already caught by REFERENCE_NUMBER_RE above, double-insurance
    r"|(?:Card\s+\d{4})"  # "Card 6932"
    r"|(?:Ref#\d+)"  # "Ref#20241130..."
    r"|(?:Mid\d{5,})"  # "Mid8043227969"
    r"|(?:\d{3,}\s+(?:Main|Oak|Elm|Park|Lake|Bay|Pine|Maple|Cedar|1st|2nd|3rd|4th|5th|6th|7th|8th|9th)\s+(?:St|Ave|Rd|Dr|Blvd|Ln|Ct|Way|Pl))"  # "1483 Main St"
    r"|(?:[A-Z][a-z]+\s+(?:FL|TX|CA|NY|IL|PA|OH|GA|NC|MI|NJ|VA|WA|AZ|MA|TN|IN|MO|MD|WI|CO|MN|SC|AL|LA|KY|OR|OK|CT|IA|MS|AR|KS|UT|NV|NM|NE|WV|ID|HI|NH|ME|MT|RI|DE|SD|ND|AK|VT|WY|DC))"  # "Dunedin FL"
    r")$",
    re.IGNORECASE,
)
TXN_HISTORY_RE = re.compile(r"transaction\s+history", re.I)
CONTINUED_HEADER_RE = re.compile(
    r"deposits?\s*/\s*credits?|withdrawals?\s*/\s*debits?|ending\s+daily\s+balance|"
    r"deposits?\s*(?:&|and)\s*credits?\s*\(\s*continued\s*\)|"
    r"withdrawals?\s*\(\s*continued\s*\)|"
    r"checks?\s*\(\s*continued\s*\)|"
    r"fees?\s*\(\s*continued\s*\)",
    re.I,
)
REGIONS_ACTIVITY_RE = re.compile(
    r"electronic\s+deposits|deposits?\s*&\s*credits?|deposits?\s+and\s+additions?|"
    r"deposits?\s*(?:&|and)\s*credits?\s*\(\s*continued\s*\)|"
    r"withdrawals?(?:\s*\(\s*continued\s*\))?|checks?\s+paid|card\s+purch|recurring\s+",
    re.I,
)

TABLE_SETTINGS_TEXT = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
    "intersection_tolerance": 15,
    "snap_tolerance": 3,
}

TABLE_SETTINGS_LINES = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "intersection_tolerance": 5,
    "snap_tolerance": 3,
}

# Template-learned column breaks (x-coordinates) → pdfplumber explicit vertical strategy.
_EXPLICIT_VERTICAL_LINES: list[float] | None = None

# Template-learned row breaks (y-coordinates) → pdfplumber explicit horizontal strategy.
_EXPLICIT_HORIZONTAL_LINES: list[float] | None = None

Y_TOLERANCE = 4
HEADER_WORDS_RE = re.compile(r"date|deposit|credit|withdraw|debit|description|balance", re.I)
_COL_BUCKET_PT = 4.0  # histogram resolution in PDF points

# ── Header-anchored column layout ───────────────────────────────────────────
# Canonical column aliases — matched case-insensitively against header text.
# Each alias maps to a logical column role. Only the BEST match per column wins.
HEADER_ALIASES: dict[str, re.Pattern[str]] = {
    "date": re.compile(r"^date$|^post\w*\s*date$", re.I),
    "description": re.compile(r"^desc(?:ription)?$|^detail$|^transaction\s+description$|^memo$|^narrative$", re.I),
    "check_number": re.compile(r"^check\s*(?:no|num|#|number)?$|^chk\s*#?$|^item\s*#?$", re.I),
    "deposits": re.compile(r"^deposits?(?:\s*(?:/|&|and)\s*credits?)?$|^credits?$|^additions?$", re.I),
    "withdrawals": re.compile(r"^withdrawals?(?:\s*(?:/|&|and)\s*debits?)?$|^debits?$|^payments?$|^charges?$", re.I),
    "amount": re.compile(r"^amount$|^total$", re.I),
    "balance": re.compile(r"^(?:ending\s+)?(?:daily\s+)?balance$|^running\s+balance$|^ledger\s+balance$", re.I),
}

# Canonical column roles in left-to-right order.  The array index is the
# preferred output position; -1 means \"no column assigned yet\".
CANONICAL_COLS: list[str] = [
    "date", "check_number", "description", "deposits", "withdrawals", "amount", "balance",
]

# Maximum supported logical columns before we emit COLUMN_LAYOUT_UNCERTAIN.
MAX_LOGICAL_COLS = 8

# Section heading detection — running page state
# Bare-heading variants use re.MULTILINE so a heading can be found anywhere in a
# multi-line page text (e.g. "WITHDRAWALS (CONTINUED)" mid-page). Row-level
# detection passes a single line, where ^ anchors the line start naturally.
SECTION_HEADING_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "deposits",
        re.compile(
            r"deposits?\s*(?:/|&|and)\s*(?:credits?|additions?)(?:\s*\(\s*CONTINUED\s*\))?|"
            r"electronic\s+deposits|"
            r"\bdeposits?(?:\s*\(\s*CONTINUED\s*\))?\b",
            re.I | re.M,
        ),
    ),
    (
        "withdrawals",
        re.compile(
            r"withdrawals?\s*(?:/|&|and)\s*(?:debits?|payments?)(?:\s*\(\s*CONTINUED\s*\))?|"
            r"electronic\s+withdrawals|"
            r"\bwithdrawals?(?:\s*\(\s*CONTINUED\s*\))?\b",
            re.I | re.M,
        ),
    ),
    (
        "checks",
        re.compile(
            r"checks?\s*(?:paid|written|cleared)(?:\s*\(\s*CONTINUED\s*\))?|"
            r"summary\s+of\s+checks|"
            r"\bchecks?(?:\s*\(\s*CONTINUED\s*\))?\b",
            re.I | re.M,
        ),
    ),
    (
        "balance_summary",
        re.compile(r"daily\s+balance\s+summary|balance\s+summary|ledger\s+balance", re.I),
    ),
    (
        "fees",
        re.compile(
            r"(?:^|\n)\s*fees?(?:\s*\(\s*CONTINUED\s*\))?\b|"
            r"service\s+(?:charges?|fees?)(?:\s*\(\s*CONTINUED\s*\))?|"
            r"monthly\s+fee",
            re.I | re.M,
        ),
    ),
    ("returned_items", re.compile(r"returned\s+(?:items?|checks?|deposits?)|nsf\s+items?", re.I)),
    ("adjustments", re.compile(r"adjustments?|miscellaneous\s+(?:debits?|credits?)", re.I)),
    ("primary_activity", re.compile(r"(?:account|transaction)\s+(?:activity|history|detail)", re.I)),
]

SUMMARY_HEADINGS_RE = re.compile(
    r"^(?:totals?|summary|activity\s+summary|statement\s+summary)\\s*$",
    re.I,
)


def detect_section_heading(line: str, current: str) -> str:
    """Detect section heading from a text line. Returns the section ID or current if no heading matched."""
    if not line or not line.strip():
        return current
    stripped = line.strip()
    if SUMMARY_HEADINGS_RE.match(stripped):
        return "summary_only"
    for section_id, pattern in SECTION_HEADING_PATTERNS:
        if pattern.search(stripped):
            return section_id
    return current


def _matches_any_section_pattern(line: str) -> bool:
    """True when a line matches any non-summary section heading pattern.

    Used to identify heading rows (short lines like "WITHDRAWALS (CONTINUED)")
    so they update the running section instead of being parsed as transactions.
    """
    if not line or not line.strip():
        return False
    for section_id, pattern in SECTION_HEADING_PATTERNS:
        if pattern.search(line.strip()):
            return True
    return False


def detect_money_column_boundaries(page: Any) -> list[tuple[float, float]]:
    """Find real money columns by right-edge clustering of currency tokens.

    Bank statement money columns are right-aligned: every amount in a column
    shares the same right edge (x1). Clustering strict money tokens by x1
    separates deposits/withdrawals/balance columns even when the header row
    is missing, split, or worded differently than the known aliases.

    Returns [(xmin, xmax), ...] per money column, sorted left-to-right.
    Only columns within 90pt of the rightmost column are kept — this drops
    far-left SUMMARY tables, check-echo tables, and daily-balance tables
    that are not the transaction money columns. Falls back to [] when the
    page has no reliable money columns (caller then uses density detection).
    """
    try:
        words = page.extract_words() or []
    except Exception:
        return []
    if len(words) < 6:
        return []
    money: list[tuple[float, float]] = []
    for w in words:
        t = str(w.get("text", "")).strip()
        if MONEY_RE.match(t):
            try:
                money.append((float(w["x0"]), float(w["x1"])))
            except (KeyError, ValueError):
                continue
    if len(money) < 3:
        return []
    money.sort(key=lambda m: m[1])
    clusters: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    prev_x1: float | None = None
    for m in money:
        if prev_x1 is not None and m[1] - prev_x1 > 6.0:
            if len(cur) >= 3:
                clusters.append(cur)
            cur = []
        cur.append(m)
        prev_x1 = m[1]
    if len(cur) >= 3:
        clusters.append(cur)
    if not clusters:
        return []
    rightmost = max(m[1] for cl in clusters for m in cl)
    ranges: list[tuple[float, float]] = []
    for cl in clusters:
        x1_max = max(m[1] for m in cl)
        if rightmost - x1_max <= 90.0:
            ranges.append((min(m[0] for m in cl), x1_max))
    ranges.sort(key=lambda r: r[0])
    return ranges


def _detect_date_column_right(page: Any) -> float | None:
    """Right edge of the date column (max x1 over MM/DD tokens) + small pad."""
    try:
        words = page.extract_words() or []
    except Exception:
        return None
    xs = [
        float(w["x1"])
        for w in words
        if DATE_RE.match(str(w.get("text", "")).strip())
    ]
    return (max(xs) + 2.0) if xs else None


_MONEY_COL_HEADERS: dict[int, list[str]] = {
    1: ["Date", "Description", "Amount"],
    2: ["Date", "Description", "Deposits/Credits", "Withdrawals/Debits"],
    3: ["Date", "Description", "Deposits/Credits", "Withdrawals/Debits", "Ending daily balance"],
}


def _layout_from_money_columns(
    money_ranges: list[tuple[float, float]],
    page: Any,
    page_width: float,
) -> tuple[list[float], list[tuple[float, float]], list[str]]:
    """Build (breaks, col_ranges, header) from money-anchored column ranges.

    The first money column is the leftmost amount column; its left boundary is
    the description/amount split. Boundaries between money columns sit at the
    midpoint of the gap between adjacent columns' extents.
    """
    n = len(money_ranges)
    date_right = _detect_date_column_right(page) or (page_width * 0.15)
    first_money_left = money_ranges[0][0] - 4.0
    boundaries = [date_right, first_money_left]
    for i in range(1, n):
        boundaries.append((money_ranges[i - 1][1] + money_ranges[i][0]) / 2.0)
    breaks = boundaries[:n + 1]
    col_ranges: list[tuple[float, float]] = []
    prev = 0.0
    for b in breaks:
        col_ranges.append((prev, b))
        prev = b
    col_ranges.append((prev, page_width))
    header = _MONEY_COL_HEADERS.get(n, _MONEY_COL_HEADERS[1])
    return breaks, col_ranges, header


def _fold_check_number(description: str, roles: Any, cells: list[str]) -> str:
    """Append the check number to a bare 'Check' description.

    Wells lays checks as "<date> <check_no> Check <amount> <balance>". The
    parser's description column yields only "Check", so two genuinely distinct
    checks that share (date, amount) — e.g. #2404 & #2405 both $1,934.00 on
    12/20, or a 2nd same-amount check on the same day — collapse into one at the
    final (date, description, amount, type) dedup. Folding the number in keeps
    each check unique and traceable.
    """
    if not description or not re.match(r"^check\b", description.strip(), re.I):
        return description
    cn_idx = roles.get("check_number") if isinstance(roles, dict) else None
    if cn_idx is not None and cn_idx < len(cells):
        cn = str(cells[cn_idx]).strip()
        if cn.isdigit():
            return f"Check {cn}"
    # Fallback: Wells activity pages label the check-number column just "Number"
    # (not aliased to check_number), so roles may miss it. Scan for a standalone
    # digit run in the cells — the check number — excluding money/date cells.
    for c in cells:
        cs = str(c).strip()
        if cs.isdigit() and 2 <= len(cs) <= 8 and not DATE_RE.match(cs) and not MONEY_RE.match(cs):
            return f"Check {cs}"
    return description


def _parse_checks_row(row: list[dict[str, Any]]) -> list[tuple[str, str, str]]:
    """Split a 2-column check-table row into (date, check_no, amount) sub-rows.

    Check tables on Regions-style statements lay TWO check entries per row
    (\"04/01 5247 225.49 04/01 10505 124.43\"). Words are consumed in visual
    order: date -> check number (digit run) -> amount, repeated. Tokens that
    are neither (e.g. the '*' break-in-sequence marker) are skipped.
    """
    words = sorted(row, key=lambda w: (float(w.get("top", 0)), float(w.get("x0", 0))))
    texts = [_word_text(w) for w in words]
    out: list[tuple[str, str, str]] = []
    d: str | None = None
    c: str | None = None
    a: str | None = None
    for t in texts:
        if d is None and DATE_RE.match(t):
            d = t
        elif d is not None and c is None and t.isdigit():
            c = t
        elif d is not None and MONEY_RE.match(t):
            a = t
        if d is not None and a is not None:
            out.append((d, c or "", a))
            d = c = a = None
    return out


def classify_header_cell(cell_text: str) -> str | None:
    """Map a single header cell to its canonical column role.  Returns None when no alias matches."""
    nh = cell_text.strip().lower()
    if not nh:
        return None
    # Quick numeric guard — a column with only a number is not a heading
    if re.match(r"^\\d+$", nh):
        return None
    for role, pattern in HEADER_ALIASES.items():
        if pattern.match(nh):
            return role
    return None


def resolve_header_layout(header_cells: list[str], page_width: float) -> dict[str, Any] | None:
    """Given header cells and page width, return a resolved layout dict or None.

    Returns:
        {col_ranges: [(role, x_min, x_max), ...], col_count: int, uncertain: bool}
    where col_ranges are in left-to-right order with x_min/x_max in PDF points.
    """
    if not header_cells:
        return None

    # Use x0 positions of header words rather than inferred midpoints.
    # Since we only have head cell TEXT here, we use the relative position
    # within the cells array.  Column boundaries are derived from the header's
    # own column breaks (see _assign_column_breaks for the actual x positions).
    roles_found: list[str] = []
    for cell in header_cells:
        role = classify_header_cell(cell)
        roles_found.append(role or "")

    # Must have at least date + description + one amount column
    has_date = any(r == "date" for r in roles_found)
    has_desc = any(r == "description" for r in roles_found)
    has_amount = any(r in ("deposits", "withdrawals", "amount") for r in roles_found)
    has_balance = any(r == "balance" for r in roles_found)

    if not (has_date and has_desc and has_amount):
        return None

    logical_count = sum(1 for r in roles_found if r)
    if logical_count > MAX_LOGICAL_COLS:
        return {"col_count": logical_count, "col_ranges": [], "uncertain": True}

    return {
        "col_count": logical_count,
        "has_balance": has_balance,
        "roles": roles_found,
        "uncertain": False,
    }


def debug_page(page_index: int, raw_row_count: int, strategy: str, table_count: int) -> None:
    print(
        f"PDFPLUMBER_DEBUG page={page_index} raw_rows={raw_row_count} "
        f"strategy={strategy} tables={table_count}",
        file=sys.stderr,
    )


def debug_chase_page(
    page_index: int,
    section_id: str,
    txns: list[dict[str, Any]],
    raw_row_count: int,
    strategy: str,
    table_count: int,
) -> None:
    credits = sum(1 for t in txns if t.get("type") == "CREDIT")
    debits = sum(1 for t in txns if t.get("type") == "DEBIT")
    print(
        f"PDFPLUMBER_DEBUG page={page_index} section={section_id} credits={credits} "
        f"debits={debits} strategy={strategy} txn_rows={len(txns)} raw_rows={raw_row_count} "
        f"tables={table_count}",
        file=sys.stderr,
    )


def parse_money(token: str) -> float | None:
    if not token:
        return None
    s = str(token).strip().replace("$", "").replace(",", "")
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1]
    try:
        v = float(s)
        return v if v >= 0.01 else None
    except ValueError:
        return None


def is_summary_row(cells: list[str]) -> bool:
    line = " ".join(c for c in cells if c).strip()
    return bool(line and SUMMARY_RE.search(line))


def split_leading_date(cell: str) -> tuple[str, str]:
    """Wells rows often merge date + check + description in the first column."""
    s = str(cell or "").strip()
    if not s:
        return "", ""
    if DATE_RE.match(s):
        return s, ""
    m = DATE_PREFIX_RE.match(s)
    if m:
        return m.group(1), (m.group(2) or "").strip()
    return "", s


def normalize_header(cell: str) -> str:
    return re.sub(r"\s+", " ", (cell or "").strip().lower())


def column_roles(header: list[str]) -> dict[str, int | None]:
    """Map header cells to canonical column roles using the shared classifier."""
    roles: dict[str, int | None] = {
        "date": None,
        "check_number": None,
        "description": None,
        "deposits": None,
        "withdrawals": None,
        "amount": None,
        "balance": None,
    }
    for i, h in enumerate(header):
        role = classify_header_cell(h)
        if role and roles.get(role) is None:
            roles[role] = i
    # Fallback for description: assign first unclassified non-numeric column
    if roles["description"] is None:
        for i, h in enumerate(header):
            nh = normalize_header(h)
            if nh and not any(roles.get(r) == i for r in roles if r != "description"):
                if not re.match(r"^\\d+$", nh):
                    roles["description"] = i
                    break
    # If check_number not found but a column has description-like text with "check" in it, keep it
    if roles["check_number"] is None:
        for i, h in enumerate(header):
            nh = normalize_header(h)
            if "check" in nh or "#" in nh:
                roles["check_number"] = i
                break
    return roles


CHASE_ROW_AMOUNT_CAP = 250_000.0
ROUTING_BLEED_RE = re.compile(r"\b\d{8,}\b")
NOISE_DESC_RE = re.compile(r"^\d{1,4}(\s+\d{1,4}){0,3}$")

# ── Evidence capture (AI rescue sidecar) ────────────────────────────────────
_DROPPED_ROWS: list[dict[str, Any]] = []
_UNCERTAIN_ASSIGNMENTS: list[dict[str, Any]] = []
_RAW_WORD_ROWS: list[dict[str, Any]] = []
_EMITTED_DROPS: set[tuple] = set()


def reset_evidence() -> None:
    global _DROPPED_ROWS, _UNCERTAIN_ASSIGNMENTS, _RAW_WORD_ROWS, _EMITTED_DROPS
    _DROPPED_ROWS = []
    _UNCERTAIN_ASSIGNMENTS = []
    _RAW_WORD_ROWS = []
    _EMITTED_DROPS = set()


def _words_to_schema(words: Any) -> list[dict[str, Any]]:
    """Normalize word evidence into the shared {text,x0,x1,top,bottom} schema shape."""
    out: list[dict[str, Any]] = []
    if not words:
        return out
    for w in words:
        if isinstance(w, dict) and "text" in w:
            out.append(
                {
                    "text": str(w.get("text") or ""),
                    "x0": float(w.get("x0", 0) or 0),
                    "x1": float(w.get("x1", 0) or 0),
                    "top": float(w.get("top", 0) or 0),
                    "bottom": float(w.get("bottom", 0) or 0),
                }
            )
        elif isinstance(w, str) and w.strip():
            # Cell text without geometry — still valid enough for schema + grounding-lite
            out.append({"text": w.strip(), "x0": 0.0, "x1": 0.0, "top": 0.0, "bottom": 0.0})
    return out


def record_dropped_row(
    *,
    page: int = 0,
    drop_reason: str,
    amount: float | None = None,
    date: str = "",
    description: str = "",
    words: Any = None,
    nearest_date: str | None = None,
    parent_row_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Append a schema-ready dropped-row evidence record for AI rescue.

    Dedupes by (drop_reason, page, description, amount) so multiple parser
    paths (pre-merge failure + rows_from_table) cannot double-emit the same
    row into rescue.
    """
    dedupe_key = (drop_reason, int(page or 0), str(description), amount)
    if dedupe_key in _EMITTED_DROPS:
        return
    _EMITTED_DROPS.add(dedupe_key)

    ev: dict[str, Any] = {
        "page": int(page or 0),
        "drop_reason": drop_reason,
    }
    if amount is not None:
        try:
            ev["amount"] = float(amount)
        except (TypeError, ValueError):
            pass
    if date:
        ev["date"] = str(date)
    if description:
        ev["description"] = str(description)
    schema_words = _words_to_schema(words)
    if schema_words:
        ev["words"] = schema_words
    if nearest_date:
        ev["nearest_date"] = str(nearest_date)
    if parent_row_id is not None:
        ev["parent_row_id"] = int(parent_row_id)
    if extra:
        for k, v in extra.items():
            if v is not None:
                ev[k] = v
    _DROPPED_ROWS.append(ev)


def _validate_evidence() -> None:
    """Validate dropped_rows and uncertain_assignments against the shared
    rescue evidence schema.  Logs warnings on violations; never raises
    (fail-open — a schema violation must never block extraction)."""
    if not _SCHEMA_AVAILABLE:
        return
    assert jsonschema is not None
    evidence = {
        "dropped_rows": _DROPPED_ROWS,
        "uncertain_assignments": _UNCERTAIN_ASSIGNMENTS,
    }
    errors: list[str] = []
    for i, row in enumerate(evidence.get("dropped_rows") or []):
        try:
            jsonschema.validate(
                row,
                {"$ref": "#/definitions/droppedRow", "definitions": _EVIDENCE_SCHEMA["definitions"]},
            )
        except jsonschema.ValidationError as exc:
            errors.append(f"dropped_rows[{i}]: {exc.message}")
    for i, row in enumerate(evidence.get("uncertain_assignments") or []):
        try:
            jsonschema.validate(
                row,
                {"$ref": "#/definitions/uncertainAssignment", "definitions": _EVIDENCE_SCHEMA["definitions"]},
            )
        except jsonschema.ValidationError as exc:
            errors.append(f"uncertain_assignments[{i}]: {exc.message}")
    if errors:
        print(f"[EVIDENCE] schema violations count={len(errors)}", file=sys.stderr)
        for err in errors[:5]:
            print(f"  {err}", file=sys.stderr)


# ---- Generic transaction-type detection (institution-agnostic) ----

# ── Section-based sign semantics ────────────────────────────────────────────
# Debit sections: transactions in these sections default to DEBIT.
_DEBIT_SECTIONS: frozenset[str] = frozenset({
    "withdrawals", "checks", "fees", "returned_items", "adjustments",
    "electronic_withdrawals", "atm_debit", "other_withdrawals",
})
_CREDIT_SECTIONS: frozenset[str] = frozenset({"deposits"})

# Text markers for explicit sign indication
_DEBIT_TEXT_MARKERS: re.Pattern[str] = re.compile(
    r"^\s*\(.*\)\s*$|^\s*-\s*\d|\bDR\b", re.IGNORECASE,
)
_CREDIT_TEXT_MARKERS: re.Pattern[str] = re.compile(r"\bCR\b", re.IGNORECASE)


def resolve_sign(
    *,
    section_id: str,
    roles: dict[str, int | None],
    col_index: int | None,
    cell_text: str,
    has_separate_deposit_withdrawal: bool,
) -> str:
    """Determine CREDIT vs DEBIT using the ordered priority chain.

    1. Section semantics  2. Column headers  3. Text markers  4. Positional default
    Balance delta is NEVER applied here — it's corroboration only in Node.js.
    """
    # Priority 1: Section semantics
    if section_id in _CREDIT_SECTIONS:
        return "CREDIT"
    if section_id in _DEBIT_SECTIONS:
        return "DEBIT"

    # Priority 2: Column headers
    if col_index is not None:
        if roles.get("deposits") == col_index:
            return "CREDIT"
        if roles.get("withdrawals") == col_index:
            return "DEBIT"

    # Priority 3: Text markers
    if cell_text and _DEBIT_TEXT_MARKERS.search(cell_text):
        return "DEBIT"
    if cell_text and _CREDIT_TEXT_MARKERS.search(cell_text):
        return "CREDIT"

    # Priority 4: Positional fallback
    if has_separate_deposit_withdrawal and col_index is not None:
        dep_idx = roles.get("deposits")
        wd_idx = roles.get("withdrawals")
        if dep_idx is not None and wd_idx is not None:
            return "CREDIT" if col_index <= dep_idx else "DEBIT"
    return "CREDIT"


# Description keywords that override a naive "CREDIT" classification.
# These are applied for ALL banks — Chase, Wells Fargo, Regions, and generics.
_DEBIT_DESC_KEYWORDS: re.Pattern[str] = re.compile(
    r"\b(?:"
    r"withdrawal|purchase|payment|fee\b|debit|transfer\s+(?:to|from)\b"
    r"|ach\s+debit|service\s+charge|overdraft|nsf|wire\s+out"
    r"|pos\s+(?:purchase|debit)|recurring\s+payment"
    r"|atm\s+withdrawal|cash\s+ewithdrawal|overdraft\s+fee"
    r")",
    re.IGNORECASE,
)

# "check" is ambiguous (can be deposited or written). Use a narrow pattern:
# check number + no deposit context nearby.
_DEBIT_CHECK_DESC: re.Pattern[str] = re.compile(
    r"\bcheck\s*#?\s*\d+\b",
    re.IGNORECASE,
)

# Wells phrases that read like credits ("Deposited...") but are money LEAVING
# the account: a cashed check against the balance, or a previously-credited
# deposit item that bounced and is being clawed back. When the parser has
# already placed the amount in the withdrawals column (DEBIT), these must NOT
# be flipped to CREDIT by the generic "deposit" keyword.
_STRONG_DEBIT_DESC: re.Pattern[str] = re.compile(
    r"deposited\s+or\s+cashed\s+check"
    r"|deposited\s+item\s+ret",
    re.IGNORECASE,
)

# Strong, unambiguous debit phrases: these OVERRIDE even a confident deposit
# column (a genuine mis-columned withdrawal). Unlike the generic debit keyword
# set, this deliberately excludes ambiguous words like "payment"/"overdraft"
# that legitimately appear in incoming (credit) descriptions.
_STRONG_DEBIT_ONLY: re.Pattern[str] = re.compile(
    r"withdrawal\s+made\s+in\s+a\s+branch"
    r"|atm\s+withdrawal"
    r"|purchase\s+authorized"
    r"|business\s+to\s+business\s+ach\s+debit"
    r"|\bach\s+debit\b",
    re.IGNORECASE,
)

# Description keywords that confirm a "CREDIT" classification even with weak signals.
_CREDIT_DESC_KEYWORDS: re.Pattern[str] = re.compile(
    r"\b(?:"
    r"deposit|credit|refund|instant\s+pmt|edi\s+payment"
    r"|ach\s+credit|wire\s+in|transfer\s+from|reversal"
    r"|atm\s+check\s+deposit"
    r")",
    re.IGNORECASE,
)


def _infer_txn_type_desc(description: str, current_type: str, column_confident: bool = False) -> str:
    """Override transaction type based on description keywords.
    Institution-agnostic — works for ALL banks, not just Wells Fargo.

    When column_confident is True, the amount came from an explicit
    deposit/withdrawal column; only STRONG, unambiguous debit words may flip a
    credit (protecting column-placed credits whose descriptions merely contain
    ambiguous words like "payment"/"overdraft").
    """
    if not description:
        return current_type
    if current_type == "CREDIT" and _DEBIT_DESC_KEYWORDS.search(description):
        # Avoid overriding known credits (e.g., "ACH Credit" should not become DEBIT)
        if not _CREDIT_DESC_KEYWORDS.search(description):
            # Column is authoritative: only flip on a STRONG debit word.
            if column_confident and not _STRONG_DEBIT_ONLY.search(description):
                return current_type
            return "DEBIT"
    # Narrow check-number pattern (only when not in a deposit context)
    if current_type == "CREDIT" and _DEBIT_CHECK_DESC.search(description):
        if not re.search(r"\bdeposit", description, re.I):
            return "DEBIT"
    if current_type == "DEBIT" and not _DEBIT_DESC_KEYWORDS.search(description):
        # Never flip a correctly-placed withdrawal back to CREDIT when the
        # description is a Wells strong-debit phrase ("Deposited OR Cashed
        # Check", "Deposited Item Retn Unpaid") — the leading "Deposited"
        # otherwise trips the generic credit keyword.
        if _STRONG_DEBIT_DESC.search(description):
            return current_type
        if _CREDIT_DESC_KEYWORDS.search(description):
            return "CREDIT"
    return current_type


def emit_transaction_row(
    date: str,
    description: str,
    amount: float,
    txn_type: str,
    out: list[dict[str, Any]],
    section: str | None = None,
    balance: float | None = None,
    *,
    page: int = 0,
    y: float = 0.0,
    raw_cells: list[str] | None = None,
    source_hash: str = "",
    column_confident: bool = False,
) -> None:
    """Emit a single transaction row with full provenance.

    Sign rules are applied by the CALLER (rows_from_table) using the ordered
    priority chain. This function applies description-keyword correction last."""
    desc = description.strip()

    if not desc or len(desc) < 2:
        record_dropped_row(
            page=page,
            drop_reason="empty_description",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    if SUMMARY_RE.search(desc):
        record_dropped_row(
            page=page,
            drop_reason="summary_match",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    if BALANCE_ARTIFACT_RE.match(desc):
        record_dropped_row(
            page=page,
            drop_reason="balance_artifact",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    if REFERENCE_NUMBER_RE.match(desc):
        record_dropped_row(
            page=page,
            drop_reason="reference_number",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    # Wells "Summary of checks written" GRID debris: the check-number matrix
    # gets misparsed into a bogus row whose description is the grid footer
    # "Gap in check sequence." This exact phrase never appears in a real
    # transaction description.
    if re.search(r"gap\s+in\s+check\s+sequence", desc, re.I):
        record_dropped_row(
            page=page,
            drop_reason="summary_match",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    # Checks-paid GRID row debris: the "Summary of checks" matrix produces rows
    # whose description is a run of "<amount> <m/d>" pairs (the printed
    # amount/date grid) optionally trailing into check numbers. Real transaction
    # descriptions never START with "amount date amount date". Require at least
    # two such money+date pairs to avoid catching legit rows that merely open
    # with an amount.
    if re.match(r"^\s*\d[\d,]*\.\d{2}\s+\d{1,2}/\d{1,2}\s+\d[\d,]*\.\d{2}\s+\d{1,2}/\d{1,2}\b", desc):
        record_dropped_row(
            page=page,
            drop_reason="summary_match",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    if amount > CHASE_ROW_AMOUNT_CAP:
        record_dropped_row(
            page=page,
            drop_reason="amount_cap",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    if ROUTING_BLEED_RE.search(desc) and (
        amount > 25_000 or re.search(r"\b(?:trn|trace|orig\s+co|ind\s+name)\b", desc, re.I)
    ):
        record_dropped_row(
            page=page,
            drop_reason="routing_bleed",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return
    # Daily-balance grid bleed often lands as short numeric noise ("37 37").
    if NOISE_DESC_RE.match(desc) and amount > 1_000:
        record_dropped_row(
            page=page,
            drop_reason="noise_desc",
            amount=amount,
            date=date,
            description=desc,
            words=raw_cells,
        )
        return

    # When the amount came from an explicit deposit/withdrawal column
    # (column_confident), that positional signal is authoritative for AMBIGUOUS
    # keywords: don't let "payment"/"overdraft"/generic "fee" flip a
    # column-placed credit (e.g. "Overdraft Protection From ...", "Giant Oil,
    # Inc. Payment ... Armani Food Mart" — both incoming, deposit column).
    # Strong, unambiguous debit words (e.g. "Withdrawal Made In A Branch/Store")
    # still correct mis-columned rows.
    txn_type = _infer_txn_type_desc(desc, txn_type, column_confident=column_confident)

    signed_amount = round(-amount if txn_type == "DEBIT" else amount, 2)
    # Source hash: stable fingerprint from transaction identity
    src_hash = hashlib.md5(
        f"{date}|{desc[:60]}|{signed_amount}".encode()
    ).hexdigest()[:12]
    # Row fingerprint: full content hash for dedup
    row_fp = hashlib.md5(
        f"{date}|{desc}|{signed_amount}|{txn_type}|{section or ''}".encode()
    ).hexdigest()[:16]

    row: dict[str, Any] = {
        "date": date,
        "description": desc,
        "amount": signed_amount,
        "type": txn_type,
        "page": page,
        "y": round(y, 2),
        "sourceHash": src_hash,
        "rowFingerprint": row_fp,
    }
    if section:
        row["section"] = section
    if balance is not None:
        row["balance"] = round(balance, 2)
    if raw_cells:
        row["rawCells"] = [c for c in raw_cells if c]
    out.append(row)


def chase_txn_type_for_section(section_id: str) -> str:
    return "CREDIT" if section_id == "deposits" else "DEBIT"


CHASE_SECTION_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("deposits", re.compile(r"deposits?\s+and\s+additions?", re.I)),
    ("checks", re.compile(r"checks?\s*paid", re.I)),
    ("electronic_withdrawals", re.compile(r"electronic\s+withdrawals?", re.I)),
    ("atm_debit", re.compile(r"atm\s+(?:&|and)\s+debit", re.I)),
    ("fees", re.compile(r"(?:^|\s)fees?\b", re.I)),
    ("other_withdrawals", re.compile(r"other\s+withdrawals?", re.I)),
]


def detect_chase_section(text: str, current: str = "deposits") -> str:
    t = text or ""
    if re.search(r"deposits?\s+and\s+additions?", t, re.I):
        return "deposits"
    if re.search(r"checks?\s*paid", t, re.I):
        return "checks"
    if re.search(r"electronic\s+withdrawals?", t, re.I):
        return "electronic_withdrawals"
    if re.search(r"(?:^|\n)\s*atm\s+(?:&|and)\s+debit", t, re.I):
        return "atm_debit"
    if re.search(r"other\s+withdrawals?", t, re.I):
        return "other_withdrawals"
    if re.search(r"(?:^|\n)\s*fees?\s*(?:\n|$)", t, re.I):
        return "fees"
    return current


def section_id_from_table_header(header: list[str]) -> str | None:
    joined = " ".join(header).lower()
    if re.search(r"deposits?\s+and\s+additions?|deposits?\s*/\s*credits?", joined):
        return "deposits"
    if re.search(r"checks?\s*paid", joined):
        return "checks"
    if re.search(r"electronic\s+withdrawals?", joined):
        return "electronic_withdrawals"
    if re.search(r"other\s+withdrawals?", joined):
        return "other_withdrawals"
    if re.search(r"atm\s+(?:&|and)\s+debit", joined):
        return "atm_debit"
    if re.search(r"\bfee?s?\b", joined):
        return "fees"
    return None


def rows_from_table_chase(
    table: list[list[str | None]], section_id: str, *, page_no: int = 0
) -> list[dict[str, Any]]:
    if not table or len(table) < 2:
        return []
    header = [str(c or "").strip() for c in table[0]]
    header_section = section_id_from_table_header(header)
    if header_section:
        section_id = header_section
    roles = column_roles(header)
    txns: list[dict[str, Any]] = []
    last_date = ""
    default_type = chase_txn_type_for_section(section_id)

    for raw_row in table[1:]:
        cells = [str(c or "").strip() for c in raw_row]
        if not any(cells):
            continue
        if is_summary_row(cells):
            continue

        row_line = " ".join(cells)
        row_section = section_id
        if roles["amount"] is not None and roles["deposits"] is None and roles["withdrawals"] is None:
            row_section = section_id
        elif roles["deposits"] is not None or roles["withdrawals"] is not None:
            if header_section:
                row_section = section_id
            else:
                detected = detect_chase_section(row_line, section_id)
                row_section = detected if detected != section_id else section_id
        txn_type = chase_txn_type_for_section(row_section)

        date_idx = roles["date"]
        balance_idx = roles["balance"]
        date_cell = cells[date_idx] if date_idx is not None and date_idx < len(cells) else ""
        date = ""
        date_tail = ""
        if date_cell and DATE_RE.match(date_cell.strip()):
            date = date_cell.strip()
            last_date = date
        elif date_cell:
            date, date_tail = split_leading_date(date_cell)
            if date:
                last_date = date
        if not date and last_date:
            date = last_date
        if not date:
            for cell in cells:
                d, tail = split_leading_date(cell)
                if d:
                    date = d
                    date_tail = tail or date_tail
                    last_date = d
                    break
        if not date:
            # No usable date — record for ROW_MERGE rescue if row carries money.
            money_vals = [parse_money(c) for c in cells if c]
            money_vals = [m for m in money_vals if m is not None]
            if money_vals:
                record_dropped_row(
                    page=0,
                    drop_reason="no_date",
                    amount=money_vals[0],
                    description=row_line[:120],
                    words=cells,
                    nearest_date=last_date or None,
                )
            continue

        desc_idx = roles["description"]
        description = cells[desc_idx] if desc_idx is not None and desc_idx < len(cells) else ""
        description = _fold_check_number(description, roles, cells)
        if date_tail:
            description = f"{date_tail} {description}".strip()
        if not description:
            parts = []
            for i, c in enumerate(cells):
                if i == date_idx:
                    continue
                if roles["deposits"] == i or roles["withdrawals"] == i or roles["amount"] == i or balance_idx == i:
                    continue
                if c and not MONEY_RE.match(c) and not DATE_RE.match(c):
                    parts.append(c)
            description = " ".join(parts)

        dep_amt = None
        wd_amt = None
        if roles["deposits"] is not None and roles["deposits"] < len(cells):
            dep_amt = parse_money(cells[roles["deposits"]])
        if roles["withdrawals"] is not None and roles["withdrawals"] < len(cells):
            wd_amt = parse_money(cells[roles["withdrawals"]])
        # Extract running balance for sign inference
        row_balance = parse_money(cells[balance_idx]) if balance_idx is not None and balance_idx < len(cells) else None
        if dep_amt is None and wd_amt is None and roles["amount"] is not None:
            amt = parse_money(cells[roles["amount"]])
            if amt is not None:
                emit_transaction_row(date, description, amt, txn_type, txns, row_section, balance=row_balance, page=page_no)
                continue

        if dep_amt is None and wd_amt is None:
            for i, cell in enumerate(cells):
                if i == date_idx or i == balance_idx:
                    continue
                amt = parse_money(cell)
                if amt is not None:
                    emit_transaction_row(date, description or row_line, amt, txn_type, txns, row_section, balance=row_balance, page=page_no)
                    break
            continue

        if dep_amt is not None:
            emit_transaction_row(date, description, dep_amt, "CREDIT", txns, row_section or "deposits", balance=row_balance, page=page_no, column_confident=True)
        if wd_amt is not None:
            emit_transaction_row(date, description, wd_amt, "DEBIT", txns, row_section or section_id, balance=row_balance, page=page_no, column_confident=True)

    return txns


def rows_from_table(
    table: list[list[str | None]],
    *,
    section_id: str = "unknown",
    page_no: int = 0,
    row_sections: list[str] | None = None,
    checks_ledger: set[tuple[str, int]] | None = None,
) -> list[dict[str, Any]]:
    if not table or len(table) < 2:
        return []
    header = [str(c or "").strip() for c in table[0]]
    roles = column_roles(header)
    txns: list[dict[str, Any]] = []
    last_date = ""

    for row_idx, raw_row in enumerate(table[1:]):
        row_sec = row_sections[row_idx] if row_sections is not None and row_idx < len(row_sections) else section_id
        cells = [str(c or "").strip() for c in raw_row]
        if not any(cells):
            continue
        if is_summary_row(cells):
            continue

        date_idx = roles["date"]
        date_cell = cells[date_idx] if date_idx is not None and date_idx < len(cells) else ""
        date = ""
        date_tail = ""
        if date_cell and DATE_RE.match(date_cell.strip()):
            date = date_cell.strip()
            last_date = date
        elif date_cell:
            date, date_tail = split_leading_date(date_cell)
            if date:
                last_date = date
        if not date and last_date:
            date = last_date
        if not date:
            for cell in cells:
                d, tail = split_leading_date(cell)
                if d:
                    date = d
                    date_tail = tail or date_tail
                    last_date = d
                    break
        if not date:
            money_vals = [parse_money(c) for c in cells if c]
            money_vals = [m for m in money_vals if m is not None]
            if money_vals:
                record_dropped_row(
                    page=0,
                    drop_reason="no_date",
                    amount=money_vals[0],
                    description=" ".join(c for c in cells if c)[:120],
                    words=cells,
                    nearest_date=last_date or None,
                )
            continue

        desc_idx = roles["description"]
        description = cells[desc_idx] if desc_idx is not None and desc_idx < len(cells) else ""
        description = _fold_check_number(description, roles, cells)
        if date_tail:
            description = f"{date_tail} {description}".strip()
        if not description:
            parts = []
            for i, c in enumerate(cells):
                if i == date_idx:
                    continue
                if roles["deposits"] == i or roles["withdrawals"] == i or roles["amount"] == i:
                    continue
                if c and not MONEY_RE.match(c) and not DATE_RE.match(c):
                    parts.append(c)
            description = " ".join(parts)

        dep_amt = None
        wd_amt = None
        balance_idx = roles["balance"]
        if roles["deposits"] is not None and roles["deposits"] < len(cells):
            dep_amt = parse_money(cells[roles["deposits"]])
        if roles["withdrawals"] is not None and roles["withdrawals"] < len(cells):
            wd_amt = parse_money(cells[roles["withdrawals"]])
        # Extract running balance for sign inference
        row_balance = None
        if balance_idx is not None and balance_idx < len(cells):
            row_balance = parse_money(cells[balance_idx])
            # Fallback: balance column detected but empty — scan rightward
            if row_balance is None:
                for j in range(balance_idx + 1, len(cells)):
                    row_balance = parse_money(cells[j])
                    if row_balance is not None:
                        break
        if dep_amt is None and wd_amt is None and roles["amount"] is not None:
            amt = parse_money(cells[roles["amount"]])
            if amt is not None:
                # Single amount column: the section decides the sign
                # (deposits -> CREDIT, everything else -> DEBIT).
                txn_type = "CREDIT" if row_sec in _CREDIT_SECTIONS else "DEBIT"
                emit_transaction_row(date, description, amt, txn_type, txns, section=row_sec, balance=row_balance, page=page_no)
            continue

        if dep_amt is None and wd_amt is None:
            row_line = " ".join(cells)
            money_cells: list[tuple[int, float]] = []
            last_col_idx = len(cells) - 1
            for i, cell in enumerate(cells):
                if i == date_idx or i == balance_idx:
                    continue
                if roles["deposits"] == i or roles["withdrawals"] == i or roles["amount"] == i:
                    continue
                # Wells 5-col: last column is Ending daily balance when role not detected
                if balance_idx is None and roles["deposits"] is not None and roles["withdrawals"] is not None:
                    if i == last_col_idx and len(cells) >= 4:
                        continue
                amt = parse_money(cell)
                if amt is not None:
                    money_cells.append((i, amt))
            if len(money_cells) == 1:
                _i, amt = money_cells[0]
                has_sep = roles["deposits"] is not None and roles["withdrawals"] is not None
                if _TRACE_ROWS:
                    print(f"TRACE_ROW date={date} money_cells=[{money_cells}] has_sep={has_sep} section={row_sec} cells={cells}", file=sys.stderr)
                txn_type = resolve_sign(
                    section_id=row_sec,
                    roles=roles,
                    col_index=_i,
                    cell_text=cells[_i] if _i < len(cells) else "",
                    has_separate_deposit_withdrawal=has_sep,
                )
                emit_transaction_row(date, description or row_line, amt, txn_type, txns,
                                     section=row_sec, balance=row_balance,
                                     raw_cells=cells, page=page_no)
            elif len(money_cells) >= 2:
                money_cells.sort(key=lambda x: x[0])
                dep_fb = money_cells[0][1]
                wd_fb = money_cells[1][1] if len(money_cells) > 1 else None
                if dep_fb is not None and dep_fb >= 0.01:
                    # Guard: first money cell could be a running balance if balance_idx is the same
                    if balance_idx is None or money_cells[0][0] != balance_idx:
                        emit_transaction_row(date, description, dep_fb, "CREDIT", txns,
                                             section=row_sec, balance=row_balance,
                                             raw_cells=cells, page=page_no)
                if wd_fb is not None and wd_fb >= 0.01:
                    if balance_idx is None or money_cells[1][0] != balance_idx:
                        emit_transaction_row(date, description, wd_fb, "DEBIT", txns,
                                             section=row_sec, balance=row_balance,
                                             raw_cells=cells, page=page_no)
            continue

        if dep_amt is not None:
            if _TRACE_ROWS:
                print(f"TRACE_ROW date={date} dep_amt={dep_amt} wd_amt=None bal={row_balance} section={row_sec} col_dep={roles['deposits']} col_wd={roles['withdrawals']} cells={cells}", file=sys.stderr)
            emit_transaction_row(date, description, dep_amt, "CREDIT", txns, section=row_sec, balance=row_balance, page=page_no, column_confident=True)
        if wd_amt is not None:
            if _TRACE_ROWS:
                print(f"TRACE_ROW date={date} dep_amt=None wd_amt={wd_amt} bal={row_balance} section={row_sec} col_dep={roles['deposits']} col_wd={roles['withdrawals']} cells={cells}", file=sys.stderr)
            emit_transaction_row(date, description, wd_amt, "DEBIT", txns, section=row_sec, balance=row_balance, page=page_no, column_confident=True)

    # Echo guard for CHECKS-section rows: a check whose (date, amount) already
    # existed in the document ledger BEFORE this page is a duplicate listing
    # (Wells "Summary of checks written" echoes of checks already in the
    # activity history pages 2-9) — never double-count it. Same-page collisions
    # (e.g. an EB-to-Checking transfer that happens to share date+amount with a
    # physical check) are NOT filtered — they are distinct transactions on
    # Regions-style statements. Mirrors the Node-tier CHECK_SUMMARY_REF logic.
    if checks_ledger is not None:
        kept: list[dict[str, Any]] = []
        for t in txns:
            # Dedup summary-section ("checks") rows against the document ledger
            # by (date, amount). Paired same-amount checks are preserved earlier
            # in the pipeline by folding the check NUMBER into the activity-row
            # description (see _fold_check_number) so the main content dedup
            # keeps them distinct; this echo guard only removes the Wells
            # "Summary of checks" echoes that repeat activity-history checks.
            key = (t.get("date"), int(round(abs(t.get("amount", 0)) * 100)))
            if t.get("section") == "checks" and key in checks_ledger:
                continue
            kept.append(t)
            if t.get("section") == "checks":
                checks_ledger.add(key)
        return kept
    return txns


def count_data_rows(tables: list[list[list[str | None]]]) -> int:
    total = 0
    for table in tables:
        if table and len(table) > 1:
            total += len(table) - 1
    return total


def extract_tables_from_page(page: Any, settings: dict[str, Any]) -> list[list[list[str | None]]]:
    try:
        if _EXPLICIT_VERTICAL_LINES or _EXPLICIT_HORIZONTAL_LINES:
            # Template-learned breaks → pdfplumber explicit strategy.
            # Convert bare x-coordinates into full-height pdfplumber line dicts.
            v_lines = (
                [{"x0": float(x), "x1": float(x), "top": 0, "bottom": float(page.height)}
                 for x in _EXPLICIT_VERTICAL_LINES]
                if _EXPLICIT_VERTICAL_LINES else None
            )
            h_lines = (
                [{"x0": 0, "x1": float(page.width), "top": float(y), "bottom": float(y)}
                 for y in _EXPLICIT_HORIZONTAL_LINES]
                if _EXPLICIT_HORIZONTAL_LINES else None
            )
            settings = {
                **settings,
                "vertical_strategy": "explicit" if v_lines else settings.get("vertical_strategy", "text"),
                "horizontal_strategy": "explicit" if h_lines else settings.get("horizontal_strategy", "text"),
            }
            if v_lines:
                settings["explicit_vertical_lines"] = v_lines
            if h_lines:
                settings["explicit_horizontal_lines"] = h_lines
        return page.extract_tables(table_settings=settings) or []
    except Exception:
        return []


def _word_text(w: dict[str, Any]) -> str:
    return str(w.get("text") or "").strip()


def _cluster_words_into_rows(words: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (float(w.get("top", 0)), float(w.get("x0", 0))))
    rows: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    row_top: float | None = None

    for w in sorted_words:
        top = float(w.get("top", 0))
        if row_top is None or abs(top - row_top) <= Y_TOLERANCE:
            if row_top is None:
                row_top = top
            current.append(w)
        else:
            if current:
                rows.append(current)
            current = [w]
            row_top = top
    if current:
        rows.append(current)
    return rows


def _cluster_words_by_explicit_rows(
    words: list[dict[str, Any]], h_lines: list[float]
) -> list[list[dict[str, Any]]]:
    """Group words into rows using explicit horizontal line y-coordinates.

    When AI-provided explicit horizontal lines exist, they define hard
    row boundaries. Each word is assigned to the band between two
    consecutive y-coordinates (or above the first / below the last).
    This bypasses the Y_TOLERANCE whitespace clustering entirely.
    """
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (float(w.get("top", 0)), float(w.get("x0", 0))))
    rows: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_band_top = -float("inf")

    for w in sorted_words:
        top = float(w.get("top", 0))
        # Find which band this word falls into
        band_top = -float("inf")
        for i, y in enumerate(h_lines):
            if top <= y + 1:  # 1pt tolerance for word height
                band_top = y
                break
        else:
            band_top = h_lines[-1] if h_lines else -float("inf")

        if band_top == current_band_top:
            current.append(w)
        else:
            if current:
                rows.append(current)
            current = [w]
            current_band_top = band_top
    if current:
        rows.append(current)
    return rows


def collect_raw_word_rows(page: Any, page_no: int) -> None:
    """Append every word on the page, clustered into visual lines, to _RAW_WORD_ROWS.

    This is the RAW_WORD fallback tier (Automatic-Mode equivalent). It is
    emitted only when the deterministic extractors produce an empty ledger,
    so unknown layouts still surface their full word inventory with bbox
    coordinates for the RAW_LEDGER AI reconstruction mode.
    """
    global _RAW_WORD_ROWS
    try:
        words = page.extract_words() or []
    except Exception:
        return
    if not words:
        return
    if _EXPLICIT_HORIZONTAL_LINES:
        rows = _cluster_words_by_explicit_rows(words, _EXPLICIT_HORIZONTAL_LINES)
    else:
        rows = _cluster_words_into_rows(words)
    for row_index, row in enumerate(rows):
        _RAW_WORD_ROWS.append(
            {
                "page": int(page_no),
                "row_index": int(row_index),
                "line_text": " ".join(_word_text(w) for w in row),
                "words": _words_to_schema(row),
            }
        )


def _find_header_row(word_rows: list[list[dict[str, Any]]]) -> tuple[int, list[float], list[str]] | None:
    """Find the column-header row(s) using single-line then two-line detection.

    Bank-agnostic: works for single-line headers (Chase, generic) and two-line
    headers (Wells Fargo: "Check Deposits/ Withdrawals/ Ending daily" +
    "Date Number Description Credits Debits balance").

    Returns (row_index, x0_positions, classified_roles) for the field-definition
    line (the second line in a two-line header), or None.
    """
    max_rows = min(30, len(word_rows))

    # ── Phase 1: single-line detection (fast path) ──
    for idx in range(max_rows):
        cells = [_word_text(w) for w in word_rows[idx]]
        roles = [classify_header_cell(c) or "" for c in cells]
        has_date = any(r == "date" for r in roles)
        has_amount = any(r in ("deposits", "withdrawals", "amount") for r in roles)
        if has_date and has_amount:
            # Guard: reject if this looks like a printed-totals line
            text = " ".join(cells).lower()
            if re.search(r"[\d,]+\\.\\d{2}", text):
                continue
            xs = sorted(float(w.get("x0", 0)) for w in word_rows[idx])
            return idx, xs, roles

    # ── Phase 2: two-line pair detection ──
    # Wells Fargo and similar banks split the header across two lines:
    #   Line 1: "Check   Deposits/Credits   Withdrawals/Debits   Ending daily balance"
    #   Line 2: "Date    Number  Description   Credits   Debits   balance"
    # Score adjacent row pairs for header-like structure.
    LINE1_TOKENS: set[str] = {"check", "deposits", "credits", "withdrawals",
                                "debits", "ending", "balance", "daily"}
    LINE2_TOKENS: set[str] = {"date", "description", "number",
                                "credits", "debits", "balance", "amount"}

    best_score = 0.0
    best_pair: tuple[int, int, list[float], list[str]] | None = None

    for i in range(max_rows - 1):
        r1 = word_rows[i]
        r2 = word_rows[i + 1]
        t1 = " ".join(_word_text(w) for w in r1).lower()
        t2 = " ".join(_word_text(w) for w in r2).lower()

        # ── Guardrails ──
        if re.search(r"[\d,]+\\.\\d{2}", t1) or re.search(r"[\d,]+\\.\\d{2}", t2):
            continue  # printed totals
        if re.search(r"(?:beginning|opening|ending|closing)\\s+balance", t1, re.I):
            continue  # balance summary
        if re.search(r"^\\s*(?:totals?|summary)\\b", t1, re.I):
            continue  # section summary
        if re.search(r"^\\s*(?:totals?|summary)\\b", t2, re.I):
            continue

        # ── Line 1 scoring ──
        l1_hits = sum(1 for tok in LINE1_TOKENS if tok in t1)
        if l1_hits < 2:
            continue  # must have at least 2 category tokens

        # ── Line 2 scoring ──
        cells2 = [_word_text(w) for w in r2]
        roles2 = [classify_header_cell(c) or "" for c in cells2]
        has_date2 = any(r == "date" for r in roles2)
        has_desc2 = any(r == "description" for r in roles2)
        has_amount2 = any(r in ("deposits", "withdrawals", "amount") for r in roles2)
        if not (has_date2 and has_desc2 and has_amount2):
            continue

        # ── Vertical gap ──
        r1_bottom = max(float(w.get("bottom", 0)) for w in r1)
        r2_top = min(float(w.get("top", 0)) for w in r2)
        gap = r2_top - r1_bottom
        gap_ok = 0 <= gap <= 20

        # ── X-alignment ──
        r2_xs = sorted(float(w.get("x0", 0)) for w in r2)
        date_leftmost = r2_xs and r2_xs[0] < 100

        # ── Composite score ──
        score = (l1_hits * 2.0 +
                 (3.0 if has_date2 else 0) +
                 (2.0 if has_desc2 else 0) +
                 (2.0 if has_amount2 else 0) +
                 (2.0 if gap_ok else 0) +
                 (1.0 if date_leftmost else 0))

        if score > best_score:
            best_score = score
            r2_xs_sorted = sorted(float(w.get("x0", 0)) for w in r2)
            best_pair = (i + 1, i, r2_xs_sorted, roles2)

    if best_pair is not None:
        row2_idx, _row1_idx, xs, roles = best_pair
        print(
            f"HEADER_DETECT type=two_line line2_row={row2_idx} "
            f"score={best_score:.1f} roles={roles}",
            file=sys.stderr,
        )
        return row2_idx, xs, roles

    # ── Phase 3: weak fallback ──
    for idx in range(max_rows):
        text = " ".join(_word_text(w) for w in word_rows[idx]).lower()
        if HEADER_WORDS_RE.search(text) and ("deposit" in text or "credit" in text) and (
            "withdraw" in text or "debit" in text
        ):
            if re.search(r"[\d,]+\\.\\d{2}", text):
                continue
            if re.search(r"(?:beginning|opening|ending|closing)\\s+balance", text, re.I):
                continue
            xs = sorted(float(w.get("x0", 0)) for w in word_rows[idx])
            print(
                f"HEADER_DETECT type=weak_fallback row={idx} text=\"{text[:80]}\"",
                file=sys.stderr,
            )
            return idx, xs, []
    return None


# Per-document state: first header-bearing page provides a template for continuation pages.
_continuation_template: dict[str, Any] | None = None


def reset_continuation_template() -> None:
    global _continuation_template
    _continuation_template = None


def set_continuation_template(template: dict[str, Any] | None) -> None:
    global _continuation_template
    _continuation_template = template


def detect_column_boundaries(page: Any) -> list[float]:
    """
    Build an X-coordinate histogram from every word on the page and find
    natural column-gap positions dynamically.

    Returns a list of break-point X values (between columns), sorted ascending.
    Falls back to an empty list when insufficient words are found.
    """
    try:
        words = page.extract_words() or []
    except Exception:
        return []

    if len(words) < 6:
        return []

    page_width = float(getattr(page, "width", 0) or 612)
    bucket_count = max(1, int(page_width / _COL_BUCKET_PT))
    histogram: list[int] = [0] * bucket_count

    for w in words:
        try:
            bucket = min(int(float(w["x0"]) / _COL_BUCKET_PT), bucket_count - 1)
            histogram[bucket] += 1
        except (KeyError, ValueError, ZeroDivisionError):
            continue

    # A gap bucket is one where the word-density drops to zero (or near-zero)
    # and it sits between two denser regions.
    gaps: list[float] = []
    in_gap = False
    gap_start = 0
    for i, count in enumerate(histogram):
        if count == 0 and not in_gap:
            in_gap = True
            gap_start = i
        elif count > 0 and in_gap:
            # midpoint of the gap → column break
            gap_mid = (gap_start + i) / 2.0 * _COL_BUCKET_PT
            # ignore gaps in the left/right margin (< 5 % or > 95 % of page width)
            if 0.05 * page_width < gap_mid < 0.95 * page_width:
                gaps.append(gap_mid)
            in_gap = False

    # Keep only breaks that produce columns at least 40 pt wide
    filtered: list[float] = []
    prev = 0.0
    for g in gaps:
        if g - prev >= 40.0:
            filtered.append(g)
            prev = g

    # Require at least 2 breaks (3 columns) to trust the result
    return filtered if len(filtered) >= 2 else []


# ── Schema collapsing for geometric clustering fallback ───────────────────────
# Supported logical schemas as (column_count, column_names).
SUPPORTED_SCHEMAS: list[tuple[int, list[str]]] = [
    (5, ["date", "check_number", "description", "deposits", "withdrawals", "balance"]),
    (4, ["date", "description", "deposits", "withdrawals", "balance"]),
    (3, ["date", "description", "amount"]),
]


def collapse_to_schema(raw_breaks: list[float], page_width: float) -> tuple[list[float], int] | None:
    """Collapse raw geometric cluster breaks into the best-matching supported schema.

    Returns (breaks, schema_index) or None if no schema fits.
    The schema_index is the index into SUPPORTED_SCHEMAS (0=5-col, 1=4-col, 2=3-col).
    """
    raw_cols = len(raw_breaks) + 1  # breaks delimit columns
    if raw_cols < 3:
        return None

    # Find the closest supported schema by column count
    best_schema: tuple[int, list[str]] | None = None
    best_dist = 999
    for cols, names in SUPPORTED_SCHEMAS:
        target_breaks = cols - 1  # N columns → N-1 breaks
        dist = abs(raw_cols - cols)
        if dist < best_dist:
            best_dist = dist
            best_schema = (cols, names)

    if best_schema is None:
        return None

    target_cols, _ = best_schema
    target_breaks = target_cols - 1

    if raw_cols == target_cols:
        return (raw_breaks, SUPPORTED_SCHEMAS.index(best_schema))

    # Collapse: merge adjacent columns to reduce count.
    # Strategy: merge the narrowest adjacent pair iteratively.
    breaks = list(raw_breaks)
    while len(breaks) + 1 > target_cols:
        # Find narrowest gap between adjacent breaks
        best_merge = 0
        best_width = float("inf")
        for i in range(len(breaks) - 1):
            width = breaks[i + 1] - breaks[i]
            if width < best_width:
                best_width = width
                best_merge = i
        # Remove the break between the narrowest pair
        breaks.pop(best_merge)

    return (breaks, SUPPORTED_SCHEMAS.index(best_schema))


def _assign_column_breaks(header_xs: list[float], page_width: float, *, bank: str = "") -> list[float]:
    if len(header_xs) >= 4:
        breaks = []
        for i in range(len(header_xs) - 1):
            breaks.append((header_xs[i] + header_xs[i + 1]) / 2)
        return breaks
    if bank == "wells":
        return [72.0, 320.0, 420.0, 520.0]
    # Fallback Wells-ish bands (fractions of page width)
    w = page_width or 612
    return [w * 0.12, w * 0.55, w * 0.72, w * 0.88]


def _word_to_cell_index(x0: float, breaks: list[float]) -> int:
    """Assign word to column using midpoint breaks (legacy fallback)."""
    col = 0
    for b in breaks:
        if x0 >= b:
            col += 1
        else:
            break
    return min(col, len(breaks))


# Module-level column tolerance override (set via --column-tolerance CLI flag).
# Default 10.0: applied to left edge of money columns (description index >= 2)
# to capture right-aligned amounts that start slightly before header text.
_COLUMN_TOLERANCE: float = 12.0

# Row-level tracing flag (set via --trace-rows CLI flag).
# When True, emits per-token column assignment and per-row field
# selection to stderr for debugging column misassignment.
_TRACE_ROWS: bool = False

# Column diagnostic flag (set via --diagnose-columns CLI flag).
# When True, emits per-page monetary token census and boundary-distance
# logging to stderr for debugging column misassignment.
_DIAGNOSE_COLUMNS: bool = False
_BOUNDARY_THRESHOLD_PT: float = 5.0  # tokens within this distance of a column edge are flagged


def _run_column_diagnostics(
    page_num: int,
    words: list[dict[str, Any]],
    col_ranges: list[tuple[float, float]],
    header_roles: list[str],
) -> dict[str, Any]:
    """Monetary token census + boundary-distance logging for one page."""
    import sys as _sys
    
    census: dict[str, int] = {
        "moneyTokensDetected": 0,
        "assignedToDeposit": 0,
        "assignedToWithdrawal": 0,
        "assignedToAmount": 0,
        "assignedToBalance": 0,
        "assignedToDescription": 0,
        "assignedToOther": 0,
        "unassignedMoneyTokens": 0,
    }
    boundary_tokens: list[dict[str, Any]] = []
    
    for w in words:
        t = str(w.get("text", "")).strip()
        if not MONEY_RE.match(t):
            continue
        census["moneyTokensDetected"] += 1
        
        x0 = float(w.get("x0", 0))
        # Assign to column
        col = _word_to_cell_by_range(x0, col_ranges)
        role = header_roles[col] if col < len(header_roles) else "?"
        
        if role == "deposits":
            census["assignedToDeposit"] += 1
        elif role == "withdrawals":
            census["assignedToWithdrawal"] += 1
        elif role == "amount":
            census["assignedToAmount"] += 1
        elif role == "balance":
            census["assignedToBalance"] += 1
        elif role == "description":
            census["assignedToDescription"] += 1
        else:
            census["assignedToOther"] += 1
        
        # Boundary-distance check
        distances = []
        for i, (xmin, xmax) in enumerate(col_ranges):
            if xmin <= x0 < xmax:
                dist_left = x0 - xmin
                dist_right = xmax - x0
                distances.append((i, "left", dist_left))
                distances.append((i, "right", dist_right))
                break
        # Check all ranges for proximity
        near = []
        for i, (xmin, xmax) in enumerate(col_ranges):
            d = min(abs(x0 - xmin), abs(x0 - xmax))
            if d <= _BOUNDARY_THRESHOLD_PT:
                role_i = header_roles[i] if i < len(header_roles) else "?"
                near.append({"col": i, "role": role_i, "dist": round(d, 1)})
        
        if near:
            assigned_role = role
            boundary_tokens.append({
                "x0": round(x0, 1),
                "text": t,
                "assignedTo": assigned_role,
                "near": near,
            })
    
    # Emit census
    print(f"CENSUS page={page_num} {census}", file=_sys.stderr)
    
    # Emit boundary tokens
    for bt in boundary_tokens[:30]:  # cap at 30 per page
        near_str = ", ".join(
            f"col{n['col']}({n['role']})@{n['dist']}pt"
            for n in bt["near"]
        )
        print(f"BOUNDARY page={page_num} x0={bt['x0']} assigned={bt['assignedTo']} text={bt['text']!r} near=[{near_str}]", file=_sys.stderr)
    
    return {"census": census, "boundaryCount": len(boundary_tokens)}


def _compute_col_ranges(header_xs: list[float], page_width: float, *, tolerance: float | None = None) -> list[tuple[float, float]]:
    """Compute column ranges from header word x0 positions.

    Returns [(x_min, x_max), ...]. Tolerance is applied only to the LEFT edge
    of money columns (deposits, withdrawals, balance) where right-aligned data
    numbers start slightly before the header's centered text.

    When _EXPLICIT_VERTICAL_LINES is set, those x-coordinates are used as
    hard column boundaries, bypassing all whitespace-guessing logic.
    """
    if _EXPLICIT_VERTICAL_LINES:
        xs = sorted(_EXPLICIT_VERTICAL_LINES)
        ranges = [(0.0, float(xs[0]))]
        for i in range(len(xs) - 1):
            ranges.append((float(xs[i]), float(xs[i + 1])))
        ranges.append((float(xs[-1]), float(page_width)))
        return ranges
    if not header_xs or len(header_xs) < 2:
        return []
    _tol = _COLUMN_TOLERANCE if tolerance is None else tolerance
    xs = sorted(header_xs)
    ranges = []
    for i in range(len(xs) - 1):
        # Only columns at index >= 2 (description onwards) get tolerance
        # on their left edge. Right edges are always strict to prevent overlap.
        left = max(0.0, xs[i] - _tol) if i >= 2 else xs[i]
        right = xs[i + 1]
        ranges.append((left, right))
    # Balance column: tolerance on left, page_width on right
    ranges.append((max(0.0, xs[-1] - _tol), page_width))
    return ranges


# Maximum overlap between adjacent column ranges for range-based assignment.
# When two ranges overlap, the first-match rule assigns words to the earlier
# column. This is acceptable because money values appear rightmost.
_COL_RANGE_OVERLAP_PT = 10.0  # same as tolerance, harmless


def _word_to_cell_by_range(x0: float, ranges: list[tuple[float, float]], *, token_text: str = "", trace_alt: list[str] | None = None) -> int:
    """Assign word to column using pre-computed column ranges.
    
    Uses range containment first (x0 inside range), then falls back to
    closest-center matching. This handles tolerance overlap correctly:
    a word that falls in only one range goes there; a word in overlapping
    ranges goes to the column whose center is nearest.
    
    When _TRACE_ROWS is True and token_text is provided, emits trace to stderr.
    trace_alt, if provided, is a list of alternative column names.
    """
    containing = [i for i, (xmin, xmax) in enumerate(ranges) if xmin <= x0 < xmax]
    chosen = -1
    reason = ""
    if len(containing) == 1:
        chosen = containing[0]
        reason = "contained"
    elif len(containing) > 1:
        # Multiple overlapping ranges — prefer the RIGHTMOST column.
        # Money values are right-aligned; when a number falls in the overlap
        # zone (balance <-> withdrawals), it belongs to the right column.
        chosen = max(containing)
        reason = f"rightmost_of_{containing}"
    else:
        # x0 outside all ranges — closest center overall
        best_col = 0
        best_dist = float("inf")
        for i, (xmin, xmax) in enumerate(ranges):
            center = (xmin + xmax) / 2
            dist = abs(x0 - center)
            if dist < best_dist:
                best_dist = dist
                best_col = i
        chosen = best_col
        reason = f"closest_center(dist={best_dist:.1f})"
    
    if _TRACE_ROWS and token_text:
        alt_str = ""
        if trace_alt and chosen < len(trace_alt):
            alt_str = f" alt={[trace_alt[c] for c in containing if c != chosen]}"
        print(f"TRACE_TOKEN x0={x0:7.1f} col={chosen} reason={reason}{alt_str} text={token_text!r}", file=sys.stderr)
    
    return chosen


def _pre_merge_continuation_rows(
    word_rows: list[list[dict[str, Any]]],
    data_start: int,
    *,
    page: int = 0,
) -> tuple[list[list[dict[str, Any]]], list[dict[str, Any]]]:
    """Merge continuation rows into previous logical rows BEFORE cell assembly.

    A continuation row lacks a date-bearing first word and sits vertically close
    to the previous row.  Merging at the word level preserves per-word provenance
    (x0/x1/top/bottom) so that _row_words_to_cells receives complete logical rows.

    Rows that LOOK like continuations (no date, carry money) but fail the merge
    guardrails (gap too large, summary/total/header shape) are emitted into
    _DROPPED_ROWS with ROW_MERGE rescue context: words, amount, nearest_date,
    parent_row_id, page, top.

    Returns (merged_rows, merge_log) where each merge_log entry records:
        {page, y_range, section_id, merge_reason, original_row_count, merged_row_count}
    """
    if not word_rows or data_start >= len(word_rows):
        return word_rows, []

    merged: list[list[dict[str, Any]]] = []
    merge_log: list[dict[str, Any]] = []
    last_date: str | None = None

    for i, row in enumerate(word_rows):
        # Pass through header rows unchanged
        if i < data_start:
            merged.append(row)
            continue

        line_text = " ".join(_word_text(w) for w in row).strip()
        if not line_text:
            merged.append(row)
            continue

        # ── Guardrail: summary / totals ──
        if SUMMARY_RE.search(line_text) and not DATE_RE.search(
            line_text.split()[0] if line_text.split() else ""
        ):
            merged.append(row)
            continue

        # ── Guardrail: header-like row ──
        if re.match(
            r"^(?:deposits?|withdrawals?|checks?)\s+(?:/|&|and)",
            line_text,
            re.I,
        ):
            merged.append(row)
            continue

        # ── Guardrail: totals row ──
        if re.search(r"^totals?\b", line_text, re.I):
            merged.append(row)
            continue

        # ── Date detection ──
        first_word = _word_text(row[0]) if row else ""
        # Allow date as mm/dd or mm/dd/yy at the start, or a leading date prefix
        has_date = bool(DATE_RE.match(first_word)) or bool(
            re.match(r"^\d{1,2}/\d{1,2}", first_word)
        )
        if has_date:
            last_date = first_word

        # ── Guardrail: known transaction-like shape ──
        # Check-number-only lines ("2351", "2358 *") — these are check register
        # entries, not continuations.  Do NOT merge them.
        looks_like_check = bool(re.match(r"^\d{3,5}\s*\*?\s*$", first_word))
        if looks_like_check:
            merged.append(row)
            continue

        # ── Vertical proximity check ──
        vert_gap = 0.0
        prev_bottom = 0.0
        curr_top = 0.0
        if merged and row and merged[-1]:
            prev_bottom = max(
                float(w.get("bottom", 0)) for w in merged[-1]
            )
            curr_top = min(float(w.get("top", 0)) for w in row)
            vert_gap = curr_top - prev_bottom

        # Max vertical gap for merging: 2× typical line spacing (~24pt).
        # Larger gaps indicate a new section or unrelated row.
        MAX_MERGE_GAP = 30.0

        # ── Merge decision ──
        if (
            not has_date
            and merged
            and 0 <= vert_gap <= MAX_MERGE_GAP
        ):
            # Continuation row — merge words into previous logical row.
            merged[-1].extend(row)
            merge_log.append({
                "page": page,
                "y_range": [prev_bottom, curr_top],
                "merge_reason": f"no_date_vertical_continuation(gap={vert_gap:.1f}pt)",
                "original_row_count": len(word_rows),
                "merged_row_count": len(merged),
                "continuation_text": line_text[:80],
            })
            continue

        # ── ROW_MERGE rescue evidence: continuation-like but not owned ──
        # Row has no date but carries money → it may be a continuation fragment
        # that deterministic pre-merge could not own (gap too large, no parent,
        # or blocked by a guardrail). Emit it so AI rescue can test a merge.
        if not has_date and not looks_like_check:
            money_vals = [parse_money(_word_text(w)) for w in row if _word_text(w)]
            money_vals = [m for m in money_vals if m is not None]
            if money_vals:
                parent_row_id = None
                # Find the most recent emitted logical row index (0-based in word_rows)
                for pi in range(i - 1, -1, -1):
                    if pi >= data_start and any(_word_text(w) for w in word_rows[pi]):
                        parent_row_id = pi - data_start
                        break
                record_dropped_row(
                    page=page,
                    drop_reason="no_date",
                    amount=money_vals[0],
                    description=line_text[:120],
                    words=row,
                    nearest_date=last_date or None,
                    parent_row_id=parent_row_id,
                    extra={
                        "top": round(curr_top, 2),
                        "vert_gap_pt": round(vert_gap, 1),
                        "premerge_failure": (
                            "gap_exceeds_max" if vert_gap > MAX_MERGE_GAP
                            else ("no_parent" if not merged else "guardrail")
                        ),
                    },
                )

        merged.append(row)

    return merged, merge_log


def _row_words_to_cells(
    row: list[dict[str, Any]],
    breaks: list[float],
    *,
    col_ranges: list[tuple[float, float]] | None = None,
    page: int = 0,
) -> list[str]:
    """Convert a row of word objects to cell strings.
    
    When col_ranges is provided, uses range-based column assignment
    (preferred — avoids midpoint clipping). Falls back to midpoint breaks
    when col_ranges is None (legacy / dynamic detection path).
    """
    if not row:
        return []
    num_cols = len(col_ranges) if col_ranges else len(breaks) + 1
    cells = [""] * num_cols
    for w in sorted(row, key=lambda x: (float(x.get("top", 0)), float(x.get("x0", 0)))):
        x0 = float(w.get("x0", 0))
        t = _word_text(w)
        if col_ranges:
            col = _word_to_cell_by_range(x0, col_ranges, token_text=t)
            if t and MONEY_RE.match(t) and col < len(col_ranges):
                col_range = col_ranges[col]
                dist_left = x0 - col_range[0]
                dist_right = col_range[1] - x0
                boundary_dist = min(dist_left, dist_right)
                if boundary_dist < _BOUNDARY_THRESHOLD_PT:
                    alt_col = col + 1 if dist_right < dist_left else col - 1
                    if 0 <= alt_col < len(col_ranges):
                        _UNCERTAIN_ASSIGNMENTS.append({
                            "page": page,
                            "reason": "column_boundary",
                            "token": {
                                "text": t,
                                "x0": x0,
                                "x1": float(w.get("x1", 0)),
                                "top": float(w.get("top", 0)),
                                "bottom": float(w.get("bottom", 0)),
                            },
                            "assigned_column": col,
                            "alternative_column": alt_col,
                            "distance_to_boundary_pt": round(boundary_dist, 1),
                            "column_ranges": [[float(a), float(b)] for a, b in col_ranges],
                        })
        else:
            col = _word_to_cell_index(x0, breaks)
        col = min(col, num_cols - 1)
        if not t:
            continue
        cells[col] = (cells[col] + " " + t).strip() if cells[col] else t
    return [c.strip() for c in cells]


def table_from_words_with_sections(
    page: Any,
    *,
    default_header: list[str] | None = None,
    bank: str = "",
    section_id: str = "unknown",
    checks_ledger: set[tuple[str, int]] | None = None,
) -> tuple[list[list[str | None]] | None, list[str] | None]:
    """Build a table from word rows, tracking the section of every data row.

    Returns (table, row_sections) where row_sections[i] is the section for
    table[i + 1]. Section headings update a running section; rows under a
    CHECKS heading are split into (date, check_no, amount) sub-rows (two per
    physical row for 2-column check tables). Rows in balance_summary sections
    are skipped. checks_ledger (optional, document-level (date, cents) set)
    is updated with every emitted row so the Node-tier echo guard has the
    ledger state.
    """
    try:
        words = page.extract_words(use_text_flow=True) or []
    except Exception:
        try:
            words = page.extract_words() or []
        except Exception:
            return (None, None)
    if not words:
        return (None, None)

    if _EXPLICIT_HORIZONTAL_LINES:
        word_rows = _cluster_words_by_explicit_rows(words, _EXPLICIT_HORIZONTAL_LINES)
    else:
        word_rows = _cluster_words_into_rows(words)
    if not word_rows:
        return (None, None)

    page_width = float(getattr(page, "width", 0) or 612)
    header_info = _find_header_row(word_rows)
    data_start = 0
    breaks: list[float]
    col_ranges: list[tuple[float, float]] | None = None
    money_header_override: list[str] | None = None

    if header_info:
        header_idx, header_xs, header_roles = header_info
        # Validate layout before committing to it
        header_cells = [_word_text(w) for w in word_rows[header_idx]]
        layout = resolve_header_layout(header_cells, page_width)

        if layout and layout.get("uncertain"):
            # COLUMN_LAYOUT_UNCERTAIN — abort, do not produce false candidates
            print(
                f"COLUMN_LAYOUT_UNCERTAIN page=? cols={layout.get('col_count', 0)} "
                f"reason=too_many_columns",
                file=sys.stderr,
            )
            return (None, None)

        if layout is None:
            # Header found but layout validation failed — prefer inherited
            # columns from the section-start page (CONTINUED pages) over
            # re-clustering, which often drops mappedCount to 0.
            print(
                f"COLUMN_LAYOUT_UNCERTAIN page=? reason=invalid_header "
                f"header={header_cells[:4]}",
                file=sys.stderr,
            )
            if _continuation_template is not None:
                ct = _continuation_template
                header_xs = ct.get("breaks", [])
                breaks = _assign_column_breaks(header_xs, page_width, bank=bank)
                col_ranges = ct.get("col_ranges")
                source = "continuation"
                syn_header = [""] * (len(col_ranges) if col_ranges else len(breaks) + 1)
                table = [syn_header]
                data_start = header_idx  # keep section heading / noise above data
                # Fall through to row loop with inherited columns.
            else:
                money_layout = detect_money_column_boundaries(page)
                if money_layout and len(money_layout) <= 3:
                    breaks, col_ranges, money_header_override = _layout_from_money_columns(
                        money_layout, page, page_width
                    )
                    source = "money_clusters"
                else:
                    dynamic_breaks = detect_column_boundaries(page)
                    breaks = dynamic_breaks if dynamic_breaks else _assign_column_breaks(header_xs, page_width, bank=bank)
                    source = "dynamic" if dynamic_breaks else "header_degraded"
                if money_header_override is None:
                    col_ranges = _compute_col_ranges(header_xs, page_width) if header_info else None
                    if col_ranges and _continuation_template is not None:
                        _continuation_template["col_ranges"] = col_ranges
                        _continuation_template["header_roles"] = header_roles
                if money_header_override is not None:
                    table = [money_header_override]
                else:
                    header_cells_out = _row_words_to_cells(word_rows[header_idx], breaks, col_ranges=col_ranges)
                    table = [header_cells_out]
                data_start = header_idx + 1
        else:
            # Valid layout — use header-derived breaks
            header_breaks = _assign_column_breaks(header_xs, page_width, bank=bank)
            dynamic_breaks = detect_column_boundaries(page)
            if len(header_breaks) >= 3:
                breaks = header_breaks
                source = "header"
            elif dynamic_breaks:
                breaks = dynamic_breaks
                source = "dynamic"
            else:
                breaks = header_breaks
                source = "header"
            set_continuation_template({"breaks": header_xs, "roles": header_roles, "layout": layout})

            # Compute column ranges from header positions for range-based assignment
            if money_header_override is None:
                col_ranges = _compute_col_ranges(header_xs, page_width) if header_info else None
                if col_ranges and _continuation_template is not None:
                    _continuation_template["col_ranges"] = col_ranges
                    _continuation_template["header_roles"] = header_roles

            # Run column diagnostics on the first data-bearing page that has a header
            if _DIAGNOSE_COLUMNS and header_info and col_ranges:
                page_num = int(getattr(page, 'page_number', 0) or 0)
                _run_column_diagnostics(page_num, words, col_ranges, header_roles)

            if money_header_override is not None:
                table = [money_header_override]
            else:
                header_cells_out = _row_words_to_cells(word_rows[header_idx], breaks, col_ranges=col_ranges)
                table = [header_cells_out]
            data_start = header_idx + 1
    elif _continuation_template is not None:
        ct = _continuation_template
        header_xs = ct.get("breaks", [])
        breaks = _assign_column_breaks(header_xs, page_width, bank=bank)
        col_ranges = ct.get("col_ranges")
        source = "continuation"
        syn_header = [""] * (len(col_ranges) if col_ranges else len(breaks) + 1)
        table = [syn_header]
    else:
        # No header detected — try money-anchored columns first, then density.
        money_layout = detect_money_column_boundaries(page)
        if money_layout and len(money_layout) <= 3:
            breaks, col_ranges, money_header_override = _layout_from_money_columns(
                money_layout, page, page_width
            )
            source = "money_clusters"
            table = [money_header_override]
        else:
            dynamic_breaks = detect_column_boundaries(page)
            if dynamic_breaks:
                # Tolerant clustering: collapse raw breaks to a supported schema
                collapsed = collapse_to_schema(dynamic_breaks, page_width)
                if collapsed:
                    breaks, schema_idx = collapsed
                    source = "dynamic_collapsed"
                else:
                    breaks = _assign_column_breaks([], page_width, bank=bank)
                    source = "fallback"
            else:
                breaks = _assign_column_breaks([], page_width, bank=bank)
                source = "fallback"
            fallback = default_header or [
                "Date",
                "Description",
                "Deposits/Credits",
                "Withdrawals/Debits",
                "Ending daily balance",
            ]
            table = [fallback]

    print(
        f"COLUMN_DEBUG page=? header_breaks=0 final_breaks={len(breaks)} source={source}",
        file=sys.stderr,
    )

    # Pre-merge continuation rows BEFORE cell assembly.
    # Continuation rows (no date, vertically close) have their words merged
    # into the previous logical row so that _row_words_to_cells receives
    # complete transaction rows with proper column assignments.
    merged_word_rows, merge_log = _pre_merge_continuation_rows(
        word_rows, data_start,
        page=int(getattr(page, 'page_number', 0) or 0),
    )
    if merge_log:
        for entry in merge_log:
            print(
                f"ROW_MERGE page=? reason={entry['merge_reason']} "
                f"gap={entry['y_range'][1]-entry['y_range'][0]:.1f}pt "
                f"text=\"{entry['continuation_text']}\"",
                file=sys.stderr,
            )

    row_sections: list[str] = []
    row_section = section_id
    after_totals = False
    page_no = int(getattr(page, 'page_number', 0) or 0)
    for row in merged_word_rows[data_start:]:
        line = " ".join(_word_text(w) for w in row)
        if not line.strip():
            continue
        # A "Total ..." line ends the current section's data. Content after it
        # is only re-admitted when a new section heading appears (e.g. a CHECKS
        # table after "Total Withdrawals"). The heading can ride the same
        # pre-merged row as the total line ("Total Withdrawals $X CHECKS").
        if re.search(r"^totals?\b", line, re.I):
            after_totals = True
            # The totals line can carry the NEXT section's heading on the same
            # pre-merged row ("Total Deposits & Credits $X WITHDRAWALS"). Prefer
            # the section that differs from the current one — the totals line
            # mentioning its own section is not a transition.
            for sec_id, pat in SECTION_HEADING_PATTERNS:
                if sec_id != row_section and pat.search(line):
                    row_section = sec_id
                    after_totals = False
                    break
            continue
        parts = line.split()
        leading_date = bool(parts and DATE_RE.match(parts[0]))
        if not leading_date:
            detected = detect_section_heading(line, row_section)
            if detected == "summary_only" or _matches_any_section_pattern(line):
                row_section = detected
                after_totals = False
                continue
            if SUMMARY_RE.search(line):
                continue
        if after_totals:
            continue
        if row_section == "balance_summary":
            continue
        if row_section == "checks":
            for d, c, a in _parse_checks_row(row):
                table.append([d, f"Check {c}" if c else d, a])
                row_sections.append("checks")
            continue
        cells = _row_words_to_cells(
            row, breaks, col_ranges=col_ranges,
            page=page_no,
        )
        if any(cells):
            table.append(cells)
            row_sections.append(row_section)

    if len(table) < 2:
        return (None, None)
    return (table, row_sections)


def table_from_words(
    page: Any, *, default_header: list[str] | None = None, bank: str = "", section_id: str = "unknown"
) -> list[list[str | None]] | None:
    """Legacy wrapper — returns the table only (callers that don't need sections)."""
    table, _ = table_from_words_with_sections(
        page, default_header=default_header, bank=bank, section_id=section_id
    )
    return table


def _merge_balances_by_amount(
    txns: list[dict[str, Any]], word_txns: list[dict[str, Any]]
) -> None:
    """Merge balance from word_txns into txns by matching transaction amounts.

    table_from_words and extract_tables_from_page produce different row counts
    (word clustering vs text-column detection). Amounts are identical for the
    same underlying transactions — match by abs(amount) within a positional window.

    Institution-agnostic: works for ALL banks.
    """
    if not word_txns:
        return
    from collections import defaultdict

    # Build lookup: {rounded_amount: [(index, balance)]} for word transactions
    word_by_amt: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for i, wt in enumerate(word_txns):
        bal = wt.get("balance")
        if bal is None:
            continue
        key = int(round(abs(wt.get("amount", 0)), 2) * 100)
        word_by_amt[key].append((i, bal))

    WINDOW = 10  # rows before/after to search for a match
    matched: set[int] = set()

    # Pass 1: exact amount match within window
    for ti, txn in enumerate(txns):
        if txn.get("balance") is not None:
            continue
        amt_key = int(round(abs(txn.get("amount", 0)), 2) * 100)
        candidates = word_by_amt.get(amt_key)
        if not candidates:
            continue
        best_wi, best_bal = min(candidates, key=lambda wb: abs(wb[0] - ti))
        if abs(best_wi - ti) <= WINDOW and best_wi not in matched:
            txn["balance"] = best_bal
            matched.add(best_wi)

    # Pass 2: index-based fallback for rows still missing balance.
    # Only use word_txn balances that haven't been consumed by Pass 1.
    wi = 0
    for ti, txn in enumerate(txns):
        if txn.get("balance") is not None:
            continue
        while wi < len(word_txns):
            if wi not in matched and word_txns[wi].get("balance") is not None:
                break
            wi += 1
        if wi < len(word_txns) and abs(wi - ti) <= WINDOW:
            txn["balance"] = word_txns[wi]["balance"]
            matched.add(wi)
            wi += 1


def extract_page_rows(
    page: Any, page_index: int, *, bank: str = "", section_id: str = "unknown",
    checks_ledger: set[tuple[str, int]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cascade: text tables -> words -> lines."""
    txns: list[dict[str, Any]] = []
    tables_text = extract_tables_from_page(page, TABLE_SETTINGS_TEXT)
    raw_rows = count_data_rows(tables_text)
    strategy = "text"
    table_count = len(tables_text)

    # Check if text strategy produced a table with a detectable header.
    # If the header is empty (all columns None), skip to table_from_words
    # which has proper header detection via _find_header_row.
    text_header_ok = False
    for table in tables_text:
        if table and len(table) > 0:
            hdr = [str(c or "").strip() for c in table[0]]
            roles = column_roles(hdr)
            if roles["date"] is not None or roles["deposits"] is not None or roles["withdrawals"] is not None:
                text_header_ok = True
                break

    if text_header_ok:
        for table in tables_text:
            if table:
                txns.extend(rows_from_table(table, section_id=section_id, page_no=page_index, checks_ledger=checks_ledger))
    else:
        # Header not detected in text table — skip directly to table_from_words
        txns = []

    # ---- Balance-aware extraction fallback ----
    # When text extraction produces no balance data (common with pdfplumber's
    # bad header detection), prefer table_from_words which has proper header
    # detection including the balance column. Only use text results when
    # table_from_words produces fewer transactions.
    if txns and not any(t.get("balance") is not None for t in txns):
        word_table, word_sections = table_from_words_with_sections(page, bank=bank, checks_ledger=checks_ledger)
        if word_table and len(word_table) > 1:
            word_txns = rows_from_table(word_table, page_no=page_index, row_sections=word_sections, checks_ledger=checks_ledger)
            word_bal = sum(1 for t in word_txns if t.get("balance") is not None)
            # Always prefer word extraction when it has balance data.
            # Balance-sequence inference needs consecutive balances — table_from_words
            # provides them on every row where the header is properly detected.
            if word_bal > 0:
                txns = word_txns
                strategy = "words_balance"
            else:
                # Merge by amount as fallback
                _merge_balances_by_amount(txns, word_txns)

    if raw_rows > 0 and not txns:
        word_table, word_sections = table_from_words_with_sections(
            page, bank=bank, section_id=section_id, checks_ledger=checks_ledger
        )
        if word_table:
            strategy = "words_retry"
            table_count = max(table_count, 1)
            txns.extend(rows_from_table(word_table, section_id=section_id, page_no=page_index, row_sections=word_sections, checks_ledger=checks_ledger))

    if raw_rows == 0 and not txns:
        word_table, word_sections = table_from_words_with_sections(page, bank=bank, checks_ledger=checks_ledger)
        if word_table:
            strategy = "words"
            table_count = 1
            raw_rows = max(0, len(word_table) - 1)
            txns.extend(rows_from_table(word_table, page_no=page_index, row_sections=word_sections, checks_ledger=checks_ledger))

    if raw_rows == 0 and not txns:
        tables_lines = extract_tables_from_page(page, TABLE_SETTINGS_LINES)
        raw_rows = count_data_rows(tables_lines)
        strategy = "lines"
        table_count = len(tables_lines)
        for table in tables_lines:
            if table:
                txns.extend(rows_from_table(table, section_id=section_id, page_no=page_index, checks_ledger=checks_ledger))

    debug_page(page_index, raw_rows, strategy, table_count)
    telemetry = {
        "page": page_index,
        "rawRows": raw_rows,
        "strategy": strategy,
        "tables": table_count,
        "txnRows": len(txns),
    }
    return txns, telemetry


def page_in_history_zone(text: str, in_history: bool) -> bool:
    if TXN_HISTORY_RE.search(text):
        return True
    if in_history and CONTINUED_HEADER_RE.search(text):
        return True
    return in_history and bool(re.search(r"\d{1,2}/\d{1,2}", text))


def page_in_regions_zone(text: str, in_zone: bool) -> bool:
    if REGIONS_ACTIVITY_RE.search(text):
        return True
    if CONTINUED_HEADER_RE.search(text) and in_zone:
        return True
    if re.search(r"\bSUMMARY\b", text, re.I) and re.search(r"beginning\s+balance", text, re.I):
        return False
    return in_zone and bool(re.search(r"\d{1,2}/\d{1,2}", text))


def extract_regions(pdf_path: str) -> dict[str, Any]:
    reset_evidence()
    reset_continuation_template()
    transactions: list[dict[str, Any]] = []
    tables_extracted = 0
    in_zone = False
    full_text_parts: list[str] = []
    page_count = 0
    page_telemetry: list[dict[str, Any]] = []
    strategies_used: set[str] = set()
    section_id = "deposits"

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append(text)
            collect_raw_word_rows(page, page_index)
            if (
                REGIONS_ACTIVITY_RE.search(text)
                or CONTINUED_HEADER_RE.search(text)
                or re.search(r"deposits?\s*&\s*credits?", text, re.I)
                or (
                    re.search(r"\bSUMMARY\b", text, re.I)
                    and re.search(r"beginning\s+balance", text, re.I)
                )
            ):
                in_zone = True

            detected = detect_section_heading(text, section_id)
            if detected != section_id:
                section_id = detected

            if not page_in_regions_zone(text, in_zone):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_page_rows(
                page,
                page_index,
                bank="regions",
                section_id=section_id,
                checks_ledger=(
                    {(t.get("date"), int(round(abs(t.get("amount", 0)) * 100))) for t in transactions}
                    if transactions else set()
                ),
            )
            page_telemetry.append(telemetry)
            strategies_used.add(telemetry["strategy"])
            tables_extracted += telemetry.get("tables", 0)
            transactions.extend(page_txns)

    combined = "\n".join(full_text_parts)
    opening, closing = parse_summary_balances(combined)
    m_dep = re.search(
        r"deposits?\s*(?:&|and)\s*credits?\s*\$?\s*([\d,]+\.\d{2})",
        combined,
        re.I,
    )
    m_wd = re.search(
        r"withdrawals?\s*(?:\/|and)\s*debits?\s*-?\s*\$?\s*([\d,]+\.\d{2})",
        combined,
        re.I,
    )

    seen = set()
    deduped: list[dict[str, Any]] = []
    for t in transactions:
        key = (t.get("date"), t.get("description"), t.get("amount"), t.get("type"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(t)

    extraction_strategy = "+".join(sorted(strategies_used - {"skipped"})) or "none"

    _validate_evidence()

    return {
        "transactions": deduped,
        "dropped_rows": _DROPPED_ROWS,
        "uncertain_assignments": _UNCERTAIN_ASSIGNMENTS,
        "raw_word_rows": _RAW_WORD_ROWS if not deduped else [],
        "openingBalance": opening,
        "closingBalance": closing,
        "metadata": {
            "pageCount": page_count,
            "tablesExtracted": tables_extracted,
            "engine": "pdfplumber",
            "bank": "regions",
            "pageTelemetry": page_telemetry,
            "extractionStrategy": extraction_strategy,
            "printedDeposits": parse_money(m_dep.group(1)) if m_dep else None,
            "printedWithdrawals": parse_money(m_wd.group(1)) if m_wd else None,
        },
    }


def parse_summary_balances(text: str) -> tuple[float | None, float | None]:
    opening = closing = None
    m_open = re.search(
        r"beginning balance(?:\s+on\s+\d{1,2}/\d{1,2})?\s*(-?\s*\$?\s*-?[\d,]+\.\d{2})",
        text,
        re.I,
    )
    m_close = re.search(
        r"ending balance(?:\s+on\s+\d{1,2}/\d{1,2})?\s*(-?\s*\$?\s*-?[\d,]+\.\d{2})",
        text,
        re.I,
    )
    if m_open:
        opening = _parse_signed_balance(m_open.group(1))
    if m_close:
        closing = _parse_signed_balance(m_close.group(1))
    return opening, closing


def _parse_signed_balance(token: str) -> float | None:
    """Parse a balance that may be negative (e.g. an overdrawn ending balance
    "-$608.74"). Unlike parse_money, this accepts values <= 0 and preserves the
    sign — required for statements that close negative."""
    if not token:
        return None
    s = str(token).strip().replace("$", "").replace(",", "").replace(" ", "")
    neg = s.count("-") % 2 == 1
    s = s.replace("-", "")
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1]
        neg = True
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


CHASE_ACTIVITY_RE = re.compile(
    r"deposits?\s+and\s+additions?|checks?\s*paid|electronic\s+withdrawals?|"
    r"atm\s+(?:&|and)\s+debit|other\s+withdrawals?|business\s+complete\s+checking|"
    r"\*start\*deposits|\*start\*checks|\*start\*electronic",
    re.I,
)

CHASE_START_ACTIVITY_RE = re.compile(
    r"\*start\*(?:deposits|checks|electronic|summary)",
    re.I,
)


def page_in_chase_zone(text: str, in_zone: bool) -> bool:
    if CHASE_ACTIVITY_RE.search(text) or CHASE_START_ACTIVITY_RE.search(text):
        return True
    if re.search(r"deposits?\s+and\s+additions?", text, re.I) and re.search(
        r"beginning\s+balance", text, re.I
    ):
        return False
    return in_zone and bool(re.search(r"\d{1,2}/\d{1,2}", text))


CHASE_WORDS_DEFAULT_HEADER = ["Date", "Description", "Amount"]


def table_from_words_chase(page: Any) -> list[list[str | None]] | None:
    return table_from_words(page, default_header=CHASE_WORDS_DEFAULT_HEADER)


def extract_chase_page_rows(
    page: Any, page_index: int, section_id: str
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Same cascade as extract_page_rows but section-aware CREDIT/DEBIT."""
    page_text = page.extract_text() or ""
    section_id = detect_chase_section(page_text, section_id)
    txns: list[dict[str, Any]] = []
    tables_text = extract_tables_from_page(page, TABLE_SETTINGS_TEXT)
    raw_rows = count_data_rows(tables_text)
    strategy = "text"
    table_count = len(tables_text)

    for table in tables_text:
        if table:
            txns.extend(rows_from_table_chase(table, section_id, page_no=page_index))

    if raw_rows > 0 and not txns:
        word_table = table_from_words_chase(page)
        if word_table:
            strategy = "words_retry"
            table_count = max(table_count, 1)
            txns.extend(rows_from_table_chase(word_table, section_id, page_no=page_index))

    if raw_rows == 0 and not txns:
        word_table = table_from_words_chase(page)
        if word_table:
            strategy = "words"
            table_count = 1
            raw_rows = max(0, len(word_table) - 1)
            txns.extend(rows_from_table_chase(word_table, section_id, page_no=page_index))

    if raw_rows == 0 and not txns:
        tables_lines = extract_tables_from_page(page, TABLE_SETTINGS_LINES)
        raw_rows = count_data_rows(tables_lines)
        strategy = "lines"
        table_count = len(tables_lines)
        for table in tables_lines:
            if table:
                txns.extend(rows_from_table_chase(table, section_id, page_no=page_index))

    debug_chase_page(page_index, section_id, txns, raw_rows, strategy, table_count)
    telemetry = {
        "page": page_index,
        "rawRows": raw_rows,
        "strategy": strategy,
        "tables": table_count,
        "txnRows": len(txns),
        "sectionId": section_id,
        "creditRows": sum(1 for t in txns if t.get("type") == "CREDIT"),
        "debitRows": sum(1 for t in txns if t.get("type") == "DEBIT"),
    }
    return txns, telemetry


def parse_chase_summary_balances(text: str) -> tuple[float | None, float | None]:
    opening = closing = None
    m_open = re.search(
        r"beginning\s+balance(?:\s*\d+)?\s*-?\s*\$?\s*-?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    )
    m_close = re.search(
        r"ending\s+balance(?:\s*\d+)?\s*-?\s*\$?\s*-?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    )
    if m_open:
        opening = parse_money(m_open.group(1))
    if m_close:
        closing = parse_money(m_close.group(1))
    return opening, closing


def extract_chase(pdf_path: str) -> dict[str, Any]:
    reset_evidence()
    transactions: list[dict[str, Any]] = []
    tables_extracted = 0
    in_zone = False
    section_id = "deposits"
    full_text_parts: list[str] = []
    page_count = 0
    page_telemetry: list[dict[str, Any]] = []
    strategies_used: set[str] = set()

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append(text)
            collect_raw_word_rows(page, page_index)
            if (
                CHASE_ACTIVITY_RE.search(text)
                or CHASE_START_ACTIVITY_RE.search(text)
                or (
                    re.search(r"beginning\s+balance", text, re.I)
                    and re.search(r"deposits?\s+and\s+additions?", text, re.I)
                )
            ):
                in_zone = True
            section_id = detect_chase_section(text, section_id)

            if not page_in_chase_zone(text, in_zone):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_chase_page_rows(page, page_index, section_id)
            page_telemetry.append(telemetry)
            strategies_used.add(telemetry["strategy"])
            tables_extracted += telemetry.get("tables", 0)
            transactions.extend(page_txns)

    combined = "\n".join(full_text_parts)
    opening, closing = parse_chase_summary_balances(combined)
    dep_matches = list(
        re.finditer(
            r"Total\s+Deposits?\s+and\s+Additions?\s+\$?\s*([\d,]+\.\d{2})",
            combined,
            re.I,
        )
    )
    m_dep = dep_matches[-1] if dep_matches else None
    m_wd = re.search(
        r"electronic\s+withdrawals?\s*-?\s*\$?\s*([\d,]+\.\d{2})",
        combined,
        re.I,
    )
    if not m_wd:
        m_wd = re.search(
            r"(?:checks?\s*paid|withdrawals?)\s*-?\s*\$?\s*([\d,]+\.\d{2})",
            combined,
            re.I,
        )

    seen = set()
    deduped: list[dict[str, Any]] = []
    for t in transactions:
        key = (t.get("date"), t.get("description"), t.get("amount"), t.get("type"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(t)

    extraction_strategy = "+".join(sorted(strategies_used - {"skipped"})) or "none"

    _validate_evidence()

    return {
        "transactions": deduped,
        "dropped_rows": _DROPPED_ROWS,
        "uncertain_assignments": _UNCERTAIN_ASSIGNMENTS,
        "raw_word_rows": _RAW_WORD_ROWS if not deduped else [],
        "openingBalance": opening,
        "closingBalance": closing,
        "metadata": {
            "pageCount": page_count,
            "tablesExtracted": tables_extracted,
            "engine": "pdfplumber",
            "bank": "chase",
            "pageTelemetry": page_telemetry,
            "extractionStrategy": extraction_strategy,
            "printedDeposits": parse_money(m_dep.group(1)) if m_dep else None,
            "printedWithdrawals": parse_money(m_wd.group(1)) if m_wd else None,
        },
    }


GENERIC_ACTIVITY_RE = re.compile(
    r"transaction|deposit|withdraw|debit|credit|balance|activity|"
    r"checking|savings|statement",
    re.I,
)


def page_in_generic_zone(text: str, in_zone: bool) -> bool:
    if GENERIC_ACTIVITY_RE.search(text):
        return True
    if re.search(r"\bSUMMARY\b", text, re.I) and re.search(r"beginning\s+balance", text, re.I):
        return False
    return in_zone and bool(re.search(r"\d{1,2}/\d{1,2}", text))


def extract_generic(pdf_path: str) -> dict[str, Any]:
    """Universal digital PDF: full extract_page_rows cascade per activity page."""
    reset_evidence()
    transactions: list[dict[str, Any]] = []
    tables_extracted = 0
    in_zone = False
    full_text_parts: list[str] = []
    page_count = 0
    page_telemetry: list[dict[str, Any]] = []
    strategies_used: set[str] = set()
    section_id = "primary_activity"

    reset_continuation_template()
    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append(text)
            collect_raw_word_rows(page, page_index)
            if GENERIC_ACTIVITY_RE.search(text) or (
                re.search(r"beginning\s+balance", text, re.I)
                and re.search(r"ending\s+balance", text, re.I)
            ):
                in_zone = True
            
            detected = detect_section_heading(text, section_id)
            if detected != section_id:
                section_id = detected

            if not page_in_generic_zone(text, in_zone):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_page_rows(
                page, page_index, section_id=section_id,
                checks_ledger=(
                    {(t.get("date"), int(round(abs(t.get("amount", 0)) * 100))) for t in transactions}
                    if transactions else set()
                ),
            )
            page_telemetry.append(telemetry)
            strategies_used.add(telemetry["strategy"])
            tables_extracted += telemetry.get("tables", 0)
            transactions.extend(page_txns)

    combined = "\n".join(full_text_parts)
    opening, closing = parse_summary_balances(combined)

    seen = set()
    deduped: list[dict[str, Any]] = []
    for t in transactions:
        key = (t.get("date"), t.get("description"), t.get("amount"), t.get("type"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(t)

    extraction_strategy = "+".join(sorted(strategies_used - {"skipped"})) or "none"

    _validate_evidence()

    return {
        "transactions": deduped,
        "dropped_rows": _DROPPED_ROWS,
        "uncertain_assignments": _UNCERTAIN_ASSIGNMENTS,
        "raw_word_rows": _RAW_WORD_ROWS if not deduped else [],
        "openingBalance": opening,
        "closingBalance": closing,
        "metadata": {
            "pageCount": page_count,
            "tablesExtracted": tables_extracted,
            "engine": "pdfplumber",
            "bank": "generic",
            "pageTelemetry": page_telemetry,
            "extractionStrategy": extraction_strategy,
        },
    }


def extract_wells(pdf_path: str) -> dict[str, Any]:
    reset_evidence()
    transactions: list[dict[str, Any]] = []
    tables_extracted = 0
    in_history = False
    full_text_parts: list[str] = []
    page_count = 0
    page_telemetry: list[dict[str, Any]] = []
    strategies_used: set[str] = set()

    reset_continuation_template()
    section_id = "primary_activity"
    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append(text)
            collect_raw_word_rows(page, page_index)
            if TXN_HISTORY_RE.search(text):
                in_history = True
            
            # Detect section heading from page text
            detected = detect_section_heading(text, section_id)
            if detected != section_id:
                section_id = detected

            if not page_in_history_zone(text, in_history):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_page_rows(
                page, page_index, bank="wells", section_id=section_id,
                checks_ledger=(
                    {(t.get("date"), int(round(abs(t.get("amount", 0)) * 100))) for t in transactions}
                    if transactions else set()
                ),
            )
            page_telemetry.append(telemetry)
            strategies_used.add(telemetry["strategy"])
            tables_extracted += telemetry.get("tables", 0)
            # Skip duplicate check-register rows — checks already appear in main body.
            # Wells Fargo confirms: "checks listed are also displayed in the
            # preceding Transaction history"
            if section_id not in ("checks", "summary_only"):
                transactions.extend(page_txns)

    combined = "\n".join(full_text_parts)
    opening, closing = parse_summary_balances(combined)

    # Document-level checks echo guard: a summary ("checks" section) row whose
    # (date, amount) matches any activity-history row is a Wells "Summary of
    # checks" echo of a check already counted in the transaction history — drop
    # it. Catches same-page echoes the per-page ledger misses (activity check and
    # its summary echo can share a page, so the page-start ledger snapshot does
    # not yet contain the activity row).
    _activity_keys = {
        (t.get("date"), int(round(abs(t.get("amount", 0)) * 100)))
        for t in transactions
        if t.get("section") != "checks"
    }
    if _activity_keys:
        _pruned: list[dict[str, Any]] = []
        for t in transactions:
            if t.get("section") == "checks":
                k = (t.get("date"), int(round(abs(t.get("amount", 0)) * 100)))
                if k in _activity_keys:
                    continue
            _pruned.append(t)
        transactions = _pruned

    seen = set()
    deduped: list[dict[str, Any]] = []
    for t in transactions:
        key = (t.get("date"), t.get("description"), t.get("amount"), t.get("type"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(t)

    extraction_strategy = "+".join(sorted(strategies_used - {"skipped"})) or "none"

    # Post-close trim: if the LAST balance-bearing row equals the printed closing
    # balance, the ledger is provably complete at that point — any rows after it
    # are post-close extraction artifacts (check-grid debris, out-of-sequence
    # re-reads of the summary zone). Drop them. Conservative: only fires when a
    # printed closing exists and a real checkpoint matches it to the cent.
    if closing is not None:
        last_bal_idx = None
        for i in range(len(deduped) - 1, -1, -1):
            if deduped[i].get("balance") is not None:
                last_bal_idx = i
                break
        if (last_bal_idx is not None
                and last_bal_idx < len(deduped) - 1
                and abs(deduped[last_bal_idx]["balance"] - closing) < 0.005):
            for t in deduped[last_bal_idx + 1:]:
                record_dropped_row(
                    page=int(t.get("page", 0) or 0),
                    drop_reason="summary_match",
                    amount=float(t.get("amount", 0) or 0),
                    date=str(t.get("date", "") or ""),
                    description=str(t.get("description", "") or ""),
                    words=None,
                )
            deduped = deduped[:last_bal_idx + 1]

    _validate_evidence()

    return {
        "transactions": deduped,
        "dropped_rows": _DROPPED_ROWS,
        "uncertain_assignments": _UNCERTAIN_ASSIGNMENTS,
        "raw_word_rows": _RAW_WORD_ROWS if not deduped else [],
        "openingBalance": opening,
        "closingBalance": closing,
        "metadata": {
            "pageCount": page_count,
            "tablesExtracted": tables_extracted,
            "engine": "pdfplumber",
            "bank": "wells",
            "pageTelemetry": page_telemetry,
            "extractionStrategy": extraction_strategy,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract statement tables to JSON")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--bank", default="generic", help="Bank profile (generic, wells, regions, chase)")
    parser.add_argument(
        "--column-tolerance", type=float, default=None,
        help="Override column range tolerance (default 10.0). Higher values capture right-aligned amounts earlier."
    )
    parser.add_argument(
        "--trace-rows", action="store_true", default=False,
        help="Emit per-token column assignment and per-row field selection to stderr."
    )
    parser.add_argument(
        "--diagnose-columns", action="store_true", default=False,
        help="Emit per-page monetary token census and boundary-distance logging to stderr."
    )
    parser.add_argument(
        "--explicit-vertical-lines", default=None,
        help='JSON array of x-coordinates (PDF points) for pdfplumber explicit vertical strategy, e.g. \'[72, 310, 540]\'.'
    )
    parser.add_argument(
        "--explicit-horizontal-lines", default=None,
        help='JSON array of y-coordinates (PDF points) for pdfplumber explicit horizontal strategy, e.g. \'[120, 350, 580]\'.'
    )
    args = parser.parse_args()

    if args.column_tolerance is not None:
        import sys as _sys
        _mod = _sys.modules[__name__]
        _mod._COLUMN_TOLERANCE = args.column_tolerance

    if args.trace_rows:
        import sys as _sys
        _mod = _sys.modules[__name__]
        _mod._TRACE_ROWS = True

    if args.diagnose_columns:
        import sys as _sys
        _mod = _sys.modules[__name__]
        _mod._DIAGNOSE_COLUMNS = True

    if args.explicit_vertical_lines:
        import json as _json
        import sys as _sys
        _mod = _sys.modules[__name__]
        try:
            lines = _json.loads(args.explicit_vertical_lines)
        except ValueError as e:
            print(f"invalid --explicit-vertical-lines JSON: {e}", file=_sys.stderr)
            _sys.exit(2)
        if not isinstance(lines, list) or not all(
            isinstance(x, (int, float)) and not isinstance(x, bool) for x in lines
        ):
            print("--explicit-vertical-lines must be a JSON array of numbers", file=_sys.stderr)
            _sys.exit(2)
        _mod._EXPLICIT_VERTICAL_LINES = [float(x) for x in lines]
        print(
            f"PDFPLUMBER_DEBUG explicit_vertical_lines={_mod._EXPLICIT_VERTICAL_LINES}",
            file=_sys.stderr,
        )

    if args.explicit_horizontal_lines:
        import json as _json
        import sys as _sys
        _mod = _sys.modules[__name__]
        try:
            hlines = _json.loads(args.explicit_horizontal_lines)
        except ValueError as e:
            print(f"invalid --explicit-horizontal-lines JSON: {e}", file=_sys.stderr)
            _sys.exit(2)
        if not isinstance(hlines, list) or not all(
            isinstance(x, (int, float)) and not isinstance(x, bool) for x in hlines
        ):
            print("--explicit-horizontal-lines must be a JSON array of numbers", file=_sys.stderr)
            _sys.exit(2)
        _mod._EXPLICIT_HORIZONTAL_LINES = [float(x) for x in hlines]
        print(
            f"PDFPLUMBER_DEBUG explicit_horizontal_lines={_mod._EXPLICIT_HORIZONTAL_LINES}",
            file=_sys.stderr,
        )

    bank = (args.bank or "wells").lower()
    if bank in ("wells", "wells_fargo", "wellsfargo"):
        result = extract_wells(args.pdf_path)
    elif bank in ("regions", "regions_bank"):
        result = extract_regions(args.pdf_path)
    elif bank in ("chase", "chase_business", "jpmorgan", "jpmorgan_chase"):
        result = extract_chase(args.pdf_path)
    elif bank in ("generic", "default", "unknown"):
        result = extract_generic(args.pdf_path)
    else:
        result = extract_generic(args.pdf_path)

    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
