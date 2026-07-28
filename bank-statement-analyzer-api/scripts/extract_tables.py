#!/usr/bin/env python3
"""
Spatial table extraction for bank statements (pdfplumber).
Stdout: single JSON object. Errors: stderr + exit 1.
Debug telemetry: stderr lines PDFPLUMBER_DEBUG (never stdout).
Usage: python extract_tables.py <pdf_path> [--bank wells]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

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
TXN_HISTORY_RE = re.compile(r"transaction\s+history", re.I)
CONTINUED_HEADER_RE = re.compile(
    r"deposits?\s*/\s*credits?|withdrawals?\s*/\s*debits?|ending\s+daily\s+balance",
    re.I,
)
REGIONS_ACTIVITY_RE = re.compile(
    r"electronic\s+deposits|deposits?\s*&\s*credits?|deposits?\s+and\s+additions?|"
    r"withdrawals?|checks?\s+paid|card\s+purch|recurring\s+",
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

Y_TOLERANCE = 4
HEADER_WORDS_RE = re.compile(r"date|deposit|credit|withdraw|debit|description|balance", re.I)
_COL_BUCKET_PT = 4.0  # histogram resolution in PDF points


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
    roles: dict[str, int | None] = {
        "date": None,
        "description": None,
        "deposits": None,
        "withdrawals": None,
        "amount": None,
        "balance": None,
    }
    for i, h in enumerate(header):
        nh = normalize_header(h)
        if not nh:
            continue
        if roles["date"] is None and ("date" in nh or DATE_RE.match(nh)):
            roles["date"] = i
        elif "deposit" in nh or ("credit" in nh and "debit" not in nh):
            roles["deposits"] = i
        elif "withdraw" in nh or "debit" in nh:
            roles["withdrawals"] = i
        elif ("ending" in nh and "balance" in nh) or nh == "balance" or "daily balance" in nh:
            roles["balance"] = i
        elif "description" in nh or "detail" in nh:
            roles["description"] = i
        elif "amount" in nh:
            roles["amount"] = i
    if roles["description"] is None:
        for i, h in enumerate(header):
            nh = normalize_header(h)
            if (
                nh
                and "date" not in nh
                and "deposit" not in nh
                and "withdraw" not in nh
                and "amount" not in nh
                and "balance" not in nh
            ):
                roles["description"] = i
                break
    return roles


CHASE_ROW_AMOUNT_CAP = 250_000.0
ROUTING_BLEED_RE = re.compile(r"\b\d{9,}\b")


def emit_wells_row(
    date: str,
    description: str,
    amount: float,
    txn_type: str,
    out: list[dict[str, Any]],
    section: str | None = None,
) -> None:
    desc = description.strip()
    if not desc or len(desc) < 2:
        return
    if SUMMARY_RE.search(desc):
        return
    if BALANCE_ARTIFACT_RE.match(desc):
        return
    if amount > CHASE_ROW_AMOUNT_CAP:
        return
    if ROUTING_BLEED_RE.search(desc) and (
        amount > 25_000 or re.search(r"\b(?:trn|trace|orig\s+co|ind\s+name)\b", desc, re.I)
    ):
        return
    row: dict[str, Any] = {
        "date": date,
        "description": desc,
        "amount": round(-amount if txn_type == "DEBIT" else amount, 2),
        "type": txn_type,
    }
    if section:
        row["section"] = section
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
    table: list[list[str | None]], section_id: str
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
            continue

        desc_idx = roles["description"]
        description = cells[desc_idx] if desc_idx is not None and desc_idx < len(cells) else ""
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
        if roles["deposits"] is not None and roles["deposits"] < len(cells):
            dep_amt = parse_money(cells[roles["deposits"]])
        if roles["withdrawals"] is not None and roles["withdrawals"] < len(cells):
            wd_amt = parse_money(cells[roles["withdrawals"]])
        if dep_amt is None and wd_amt is None and roles["amount"] is not None:
            amt = parse_money(cells[roles["amount"]])
            if amt is not None:
                emit_wells_row(date, description, amt, txn_type, txns, row_section)
                continue

        if dep_amt is None and wd_amt is None:
            for i, cell in enumerate(cells):
                if i == date_idx:
                    continue
                amt = parse_money(cell)
                if amt is not None:
                    emit_wells_row(date, description or row_line, amt, txn_type, txns, row_section)
                    break
            continue

        if dep_amt is not None:
            emit_wells_row(date, description, dep_amt, "CREDIT", txns, row_section or "deposits")
        if wd_amt is not None:
            emit_wells_row(date, description, wd_amt, "DEBIT", txns, row_section or section_id)

    return txns


def rows_from_table(table: list[list[str | None]]) -> list[dict[str, Any]]:
    if not table or len(table) < 2:
        return []
    header = [str(c or "").strip() for c in table[0]]
    roles = column_roles(header)
    txns: list[dict[str, Any]] = []
    last_date = ""

    for raw_row in table[1:]:
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
            continue

        desc_idx = roles["description"]
        description = cells[desc_idx] if desc_idx is not None and desc_idx < len(cells) else ""
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
        if dep_amt is None and wd_amt is None and roles["amount"] is not None:
            amt = parse_money(cells[roles["amount"]])
            if amt is not None:
                emit_wells_row(date, description, amt, "DEBIT", txns)
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
                if roles["deposits"] is not None and roles["withdrawals"] is not None:
                    txn_type = "CREDIT" if _i <= roles["deposits"] else "DEBIT"
                elif roles["withdrawals"] is not None and _i >= roles["withdrawals"]:
                    txn_type = "DEBIT"
                else:
                    txn_type = "CREDIT"
                emit_wells_row(date, description or row_line, amt, txn_type, txns)
            elif len(money_cells) >= 2:
                money_cells.sort(key=lambda x: x[0])
                # At most deposit + withdrawal; ignore trailing balance column
                dep_fb = money_cells[0][1]
                wd_fb = money_cells[1][1] if len(money_cells) > 1 else None
                if dep_fb is not None and dep_fb >= 0.01:
                    emit_wells_row(date, description, dep_fb, "CREDIT", txns)
                if wd_fb is not None and wd_fb >= 0.01:
                    emit_wells_row(date, description, wd_fb, "DEBIT", txns)
            continue

        if dep_amt is not None:
            emit_wells_row(date, description, dep_amt, "CREDIT", txns)
        if wd_amt is not None:
            emit_wells_row(date, description, wd_amt, "DEBIT", txns)

    return txns


def count_data_rows(tables: list[list[list[str | None]]]) -> int:
    total = 0
    for table in tables:
        if table and len(table) > 1:
            total += len(table) - 1
    return total


def extract_tables_from_page(page: Any, settings: dict[str, Any]) -> list[list[list[str | None]]]:
    try:
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


def _find_header_row(rows: list[list[dict[str, Any]]]) -> tuple[int, list[float]] | None:
    for idx, row in enumerate(rows[:8]):
        text = " ".join(_word_text(w) for w in row).lower()
        if HEADER_WORDS_RE.search(text) and ("deposit" in text or "credit" in text) and (
            "withdraw" in text or "debit" in text
        ):
            xs = sorted(float(w.get("x0", 0)) for w in row)
            return idx, xs
    return None


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
    col = 0
    for b in breaks:
        if x0 >= b:
            col += 1
        else:
            break
    return min(col, len(breaks))


def _row_words_to_cells(row: list[dict[str, Any]], breaks: list[float]) -> list[str]:
    if not row:
        return []
    max_col = len(breaks) + 1
    cells = [""] * max_col
    for w in sorted(row, key=lambda x: float(x.get("x0", 0))):
        col = _word_to_cell_index(float(w.get("x0", 0)), breaks)
        t = _word_text(w)
        if not t:
            continue
        if cells[col]:
            cells[col] += " " + t
        else:
            cells[col] = t
    return [c.strip() for c in cells]


def table_from_words(
    page: Any, *, default_header: list[str] | None = None, bank: str = ""
) -> list[list[str | None]] | None:
    try:
        words = page.extract_words(use_text_flow=True) or []
    except Exception:
        try:
            words = page.extract_words() or []
        except Exception:
            return None
    if not words:
        return None

    word_rows = _cluster_words_into_rows(words)
    if not word_rows:
        return None

    page_width = float(getattr(page, "width", 0) or 612)
    header_info = _find_header_row(word_rows)
    data_start = 0
    breaks: list[float]

    if header_info:
        header_idx, header_xs = header_info
        # Prefer dynamic boundary detection; fall back to header-derived or static breaks
        dynamic_breaks = detect_column_boundaries(page)
        breaks = dynamic_breaks if dynamic_breaks else _assign_column_breaks(header_xs, page_width, bank=bank)
        # Emit telemetry so JS can see which path was taken
        print(
            f"COLUMN_DEBUG page=? dynamic_breaks={len(dynamic_breaks)} "
            f"final_breaks={len(breaks)} source={'dynamic' if dynamic_breaks else 'header'}",
            file=sys.stderr,
        )
        header_cells = _row_words_to_cells(word_rows[header_idx], breaks)
        table: list[list[str | None]] = [header_cells]
        data_start = header_idx + 1
    else:
        dynamic_breaks = detect_column_boundaries(page)
        breaks = dynamic_breaks if dynamic_breaks else _assign_column_breaks([], page_width, bank=bank)
        print(
            f"COLUMN_DEBUG page=? dynamic_breaks={len(dynamic_breaks)} "
            f"final_breaks={len(breaks)} source={'dynamic' if dynamic_breaks else 'fallback'}",
            file=sys.stderr,
        )
        fallback = default_header or [
            "Date",
            "Description",
            "Deposits/Credits",
            "Withdrawals/Debits",
            "Ending daily balance",
        ]
        table = [fallback]

    for row in word_rows[data_start:]:
        line = " ".join(_word_text(w) for w in row)
        if not line.strip():
            continue
        if re.search(r"^totals?\b", line, re.I):
            break
        if SUMMARY_RE.search(line) and not DATE_RE.search(line.split()[0] if line.split() else ""):
            continue
        cells = _row_words_to_cells(row, breaks)
        if any(cells):
            table.append(cells)

    if len(table) < 2:
        return None
    return table


def extract_page_rows(
    page: Any, page_index: int, *, bank: str = ""
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cascade: text tables -> words -> lines."""
    txns: list[dict[str, Any]] = []
    tables_text = extract_tables_from_page(page, TABLE_SETTINGS_TEXT)
    raw_rows = count_data_rows(tables_text)
    strategy = "text"
    table_count = len(tables_text)

    for table in tables_text:
        if table:
            txns.extend(rows_from_table(table))

    if raw_rows > 0 and not txns:
        word_table = table_from_words(page, bank=bank)
        if word_table:
            strategy = "words_retry"
            table_count = max(table_count, 1)
            txns.extend(rows_from_table(word_table))

    if raw_rows == 0 and not txns:
        word_table = table_from_words(page, bank=bank)
        if word_table:
            strategy = "words"
            table_count = 1
            raw_rows = max(0, len(word_table) - 1)
            txns.extend(rows_from_table(word_table))

    if raw_rows == 0 and not txns:
        tables_lines = extract_tables_from_page(page, TABLE_SETTINGS_LINES)
        raw_rows = count_data_rows(tables_lines)
        strategy = "lines"
        table_count = len(tables_lines)
        for table in tables_lines:
            if table:
                txns.extend(rows_from_table(table))

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
    if re.search(r"\bSUMMARY\b", text, re.I) and re.search(r"beginning\s+balance", text, re.I):
        return False
    return in_zone and bool(re.search(r"\d{1,2}/\d{1,2}", text))


def extract_regions(pdf_path: str) -> dict[str, Any]:
    transactions: list[dict[str, Any]] = []
    tables_extracted = 0
    in_zone = False
    full_text_parts: list[str] = []
    page_count = 0
    page_telemetry: list[dict[str, Any]] = []
    strategies_used: set[str] = set()

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append(text)
            if (
                REGIONS_ACTIVITY_RE.search(text)
                or re.search(r"deposits?\s*&\s*credits?", text, re.I)
                or (
                    re.search(r"\bSUMMARY\b", text, re.I)
                    and re.search(r"beginning\s+balance", text, re.I)
                )
            ):
                in_zone = True

            if not page_in_regions_zone(text, in_zone):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_page_rows(page, page_index)
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

    return {
        "transactions": deduped,
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
        r"beginning balance(?:\s+on\s+\d{1,2}/\d{1,2})?\s*\$?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    )
    m_close = re.search(
        r"ending balance(?:\s+on\s+\d{1,2}/\d{1,2})?\s*\$?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    )
    if m_open:
        opening = parse_money(m_open.group(1))
    if m_close:
        closing = parse_money(m_close.group(1))
    return opening, closing


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
            txns.extend(rows_from_table_chase(table, section_id))

    if raw_rows > 0 and not txns:
        word_table = table_from_words_chase(page)
        if word_table:
            strategy = "words_retry"
            table_count = max(table_count, 1)
            txns.extend(rows_from_table_chase(word_table, section_id))

    if raw_rows == 0 and not txns:
        word_table = table_from_words_chase(page)
        if word_table:
            strategy = "words"
            table_count = 1
            raw_rows = max(0, len(word_table) - 1)
            txns.extend(rows_from_table_chase(word_table, section_id))

    if raw_rows == 0 and not txns:
        tables_lines = extract_tables_from_page(page, TABLE_SETTINGS_LINES)
        raw_rows = count_data_rows(tables_lines)
        strategy = "lines"
        table_count = len(tables_lines)
        for table in tables_lines:
            if table:
                txns.extend(rows_from_table_chase(table, section_id))

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

    return {
        "transactions": deduped,
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
    transactions: list[dict[str, Any]] = []
    tables_extracted = 0
    in_zone = False
    full_text_parts: list[str] = []
    page_count = 0
    page_telemetry: list[dict[str, Any]] = []
    strategies_used: set[str] = set()

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append(text)
            if GENERIC_ACTIVITY_RE.search(text) or (
                re.search(r"beginning\s+balance", text, re.I)
                and re.search(r"ending\s+balance", text, re.I)
            ):
                in_zone = True

            if not page_in_generic_zone(text, in_zone):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_page_rows(page, page_index)
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

    return {
        "transactions": deduped,
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
    transactions: list[dict[str, Any]] = []
    tables_extracted = 0
    in_history = False
    full_text_parts: list[str] = []
    page_count = 0
    page_telemetry: list[dict[str, Any]] = []
    strategies_used: set[str] = set()

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page_index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            full_text_parts.append(text)
            if TXN_HISTORY_RE.search(text):
                in_history = True

            if not page_in_history_zone(text, in_history):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_page_rows(page, page_index, bank="wells")
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

    return {
        "transactions": deduped,
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
    parser.add_argument("--bank", default="wells", help="Bank profile (wells)")
    args = parser.parse_args()

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
