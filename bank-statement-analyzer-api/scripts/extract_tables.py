#!/usr/bin/env python3
"""
Spatial table extraction for bank statements (pdfplumber).
Stdout: single JSON object. Errors: stderr + exit 1.
Debug telemetry: stderr lines PDFPLUMBER_DEBUG (never stdout).
Usage: python extract_tables.py <pdf_path> [--layout-profile generic] [--bank wells (deprecated)]
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
CHECK_NUMBER_RE = re.compile(r"^\d{2,6}\s*[\^*]?$")
THOUSAND_COMMA_RE = re.compile(r"\d,\d{3}")
SUMMARY_RE = re.compile(
    r"deposits?/credits?|withdrawals?/debits?|beginning balance|ending balance|"
    r"activity summary|opening balance|closing balance|total deposits",
    re.I,
)
TXN_HISTORY_RE = re.compile(r"transaction\s+history", re.I)
CONTINUED_HEADER_RE = re.compile(
    r"deposits?\s*/\s*credits?|withdrawals?\s*/\s*debits?|ending\s+daily\s+balance",
    re.I,
)
REGIONS_ACTIVITY_RE = re.compile(
    r"electronic\s+deposits|deposits?\s*&\s*credits?|deposits?\s+and\s+additions?|"
    r"withdrawals?|checks?\s+(?:cleared|paid)|card\s+purch|recurring\s+",
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


def looks_like_amount_token(token: str) -> bool:
    """True when a cell looks like currency, not a bare reference/check number."""
    s = str(token or "").strip()
    if not s or CHECK_NUMBER_RE.match(s):
        return False
    if MONEY_RE.match(s):
        return True
    if "$" in s:
        return True
    if re.search(r"\.\d{2}", s):
        return True
    if THOUSAND_COMMA_RE.search(s):
        return True
    if s.startswith("(") and s.endswith(")"):
        return True
    return False


def parse_money(token: str, *, strict: bool = False) -> float | None:
    if not token:
        return None
    s = str(token).strip()
    if strict and not looks_like_amount_token(s):
        return None
    # Peel ref digits glued onto a thousands-grouped amount: "86439833,000.00" → 3000.00
    bare = s.replace("$", "").replace("(", "").replace(")", "").strip()
    glued = re.match(r"^(\d{4,}),(\d{3}\.\d{2})$", bare)
    if glued:
        before, after = glued.group(1), glued.group(2)
        candidates: list[float] = []
        for take in (1, 2, 3):
            if len(before) < take:
                continue
            dollars = before[-take:]
            if take > 1 and dollars.startswith("0"):
                continue
            try:
                v = float((dollars + "," + after).replace(",", ""))
            except ValueError:
                continue
            if 0.01 <= v <= ROW_AMOUNT_CAP:
                candidates.append(v)
        if candidates:
            return min(candidates)
    normalized = s.replace("$", "").replace(",", "")
    if normalized.startswith("(") and normalized.endswith(")"):
        normalized = normalized[1:-1]
    try:
        v = float(normalized)
        return v if v >= 0.01 else None
    except ValueError:
        return None


def is_likely_section_header_row(cells: list[str]) -> bool:
    """Section headers have no transaction date and no strict amount."""
    line = " ".join(c for c in cells if c).strip()
    if not line or len(line) > 120:
        return False
    for cell in cells:
        stripped = cell.strip()
        if DATE_RE.match(stripped) or DATE_PREFIX_RE.match(stripped):
            return False
        if parse_money(stripped, strict=True) is not None:
            return False
    return detect_section(line, None) is not None


def pick_section_typed_amount(
    cells: list[str],
    date_idx: int | None,
    balance_idx: int | None,
    description: str,
) -> tuple[float | None, str]:
    """Prefer the rightmost strict money token; fold check numbers into description."""
    amount_idx: int | None = None
    amount: float | None = None
    for i in range(len(cells) - 1, -1, -1):
        if i == date_idx or i == balance_idx:
            continue
        amt = parse_money(cells[i].strip(), strict=True)
        if amt is not None:
            amount_idx = i
            amount = amt
            break
    if amount is None:
        return None, description

    check_parts: list[str] = []
    for i, cell in enumerate(cells):
        if i in (date_idx, balance_idx, amount_idx):
            continue
        stripped = cell.strip()
        if CHECK_NUMBER_RE.match(stripped):
            check_parts.append(stripped)

    desc = description
    if check_parts:
        desc = f"{' '.join(check_parts)} {desc}".strip()
    return amount, desc


def is_summary_row(cells: list[str]) -> bool:
    line = " ".join(c for c in cells if c).strip()
    return bool(line and SUMMARY_RE.search(line))


def split_leading_date(cell: str) -> tuple[str, str]:
    """Rows often merge date + check + description into the first column; split the leading date off."""
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


ROW_AMOUNT_CAP = 250_000.0
ROUTING_BLEED_RE = re.compile(r"\b\d{8,}\b")
NOISE_DESC_RE = re.compile(r"^\d{1,4}(\s+\d{1,4}){0,3}$")
EASY_STEPS_RE = re.compile(r"Easy\s+Steps\s+to\s+Balance", re.I)
DAILY_BALANCE_SUMMARY_RE = re.compile(r"DAILY\s+BALANCE\s+SUMMARY", re.I)
# Space-insensitive summary phrases: table extraction can split words mid-token
# ("Total Depos its and Additions"), which evades SUMMARY_RE.
COMPACT_SUMMARY_RE = re.compile(
    r"totaldeposits|totalwithdrawals|totalelectronic|totalchecks|totalatm|"
    r"totalfees|totalother|totalcard|beginningbalance|endingbalance|"
    r"openingbalance|closingbalance",
    re.I,
)
# Section-total rows sometimes survive with a truncated label ("M & Debit Card
# Withdrawals", bare "Withdrawals"). Totals carry no digits in their label;
# real transactions almost always do (card numbers, refs, dates, amounts in
# overdraft details). Plural section-label tails with no digits are totals.
SECTION_TOTAL_TAILS = (
    "withdrawals",
    "depositsandadditions",
    "deposits",
    "additions",
    "checkspaid",
    "fees",
)


def is_section_total_desc(desc: str) -> bool:
    if re.search(r"\d", desc):
        return False
    compact = re.sub(r"[^a-z&]", "", desc.lower())
    if not compact or len(compact) > 40:
        return False
    return any(compact.endswith(t) for t in SECTION_TOTAL_TAILS)


def emit_row(
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
    if COMPACT_SUMMARY_RE.search(re.sub(r"\s+", "", desc)):
        return
    if is_section_total_desc(desc):
        return
    if amount > ROW_AMOUNT_CAP:
        return
    # Reference/trace digits alongside an implausibly large amount indicate
    # numeric bleed; small amounts with trace digits are legitimate ACH rows.
    if ROUTING_BLEED_RE.search(desc) and amount > 25_000:
        return
    # Daily-balance grid bleed often lands as short numeric noise ("37 37").
    if NOISE_DESC_RE.match(desc) and amount > 1_000:
        return
    row: dict[str, Any] = {
        "date": date,
        "description": desc,
        "amount": round(amount, 2),
        "type": txn_type,
    }
    if section:
        row["section"] = section
    out.append(row)


SECTION_CREDIT_IDS = {"deposits", "electronic_deposits", "credits", "returned_checks"}


def txn_type_for_section(section_id: str | None) -> str:
    return "CREDIT" if section_id in SECTION_CREDIT_IDS else "DEBIT"


def detect_section(text: str, current: str | None = None) -> str | None:
    """Rolling section id from section-header phrasing (shared vocabulary, all layouts)."""
    t = text or ""
    if re.search(r"electronic\s+deposits?", t, re.I):
        return "electronic_deposits"
    if re.search(r"deposits?\s+and\s+additions?|deposits?\s*(?:&|and)\s*credits?", t, re.I):
        return "deposits"
    # Returned checks are credits — must precede generic checks paid.
    if re.search(r"returned\s+checks?", t, re.I):
        return "returned_checks"
    if re.search(r"electronic\s+withdrawals?", t, re.I):
        return "electronic_withdrawals"
    if re.search(r"checks?\s*(?:paid|cleared)", t, re.I):
        return "checks"
    if re.search(r"(?:^|\n)\s*atm\s+(?:&|and)\s+debit", t, re.I):
        return "atm_debit"
    # Prefer explicit WITHDRAWALS section header over body "Card Purchase" noise.
    if re.search(r"(?:^|\n)\s*withdrawals?\b", t, re.I):
        return "withdrawals"
    if re.search(r"other\s+withdrawals?", t, re.I):
        return "other_withdrawals"
    if re.search(r"card\s+purch|recurring\s+", t, re.I):
        return "card"
    if re.search(r"withdrawals?\s*(?:\([^)]*\))?", t, re.I):
        return "withdrawals"
    if re.search(r"bank\s+fees?|service\s+charges?", t, re.I):
        return "fees"
    if re.search(r"(?:^|\n)\s*fees?\s*(?:\n|$)", t, re.I):
        return "fees"
    if re.search(r"(?:^|\n)\s*checks?\s*(?:\n|$)", t, re.I):
        return "checks"
    return current


def section_id_from_table_header(header: list[str]) -> str | None:
    joined = " ".join(header).lower()
    if re.search(r"deposits?\s+and\s+additions?|deposits?\s*/\s*credits?|deposits?\s*&\s*credits?", joined):
        return "deposits"
    if re.search(r"electronic\s+deposits?", joined):
        return "electronic_deposits"
    if re.search(r"checks?\s*(?:cleared|paid)", joined):
        return "checks"
    if re.search(r"electronic\s+withdrawals?", joined):
        return "electronic_withdrawals"
    if re.search(r"other\s+withdrawals?", joined):
        return "other_withdrawals"
    if re.search(r"atm\s+(?:&|and)\s+debit", joined):
        return "atm_debit"
    if re.search(r"\bfee?s?\b|service\s+charges?", joined):
        return "fees"
    if re.search(r"withdrawals?\s*(?:\/|and)\s*debits?", joined):
        return "withdrawals"
    return None


ROLE_HINT_KEYS = {
    "dateIdx": "date",
    "descIdx": "description",
    "amountIdx": "amount",
    "balanceIdx": "balance",
    "creditIdx": "deposits",
    "debitIdx": "withdrawals",
}


def apply_role_hints(
    roles: dict[str, int | None], role_hints: dict[str, Any] | None
) -> dict[str, int | None]:
    """Fill role gaps from template column hints. Hints never override detected headers."""
    if not role_hints:
        return roles
    for hint_key, role_key in ROLE_HINT_KEYS.items():
        v = role_hints.get(hint_key)
        if roles.get(role_key) is None and isinstance(v, (int, float)) and int(v) >= 0:
            roles[role_key] = int(v)
    return roles


def rows_from_table(
    table: list[list[str | None]],
    section_id: str | None = None,
    *,
    role_hints: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Unified row parser. Typing mode derives from column roles:
    single Amount column -> section typing; deposit/withdraw columns -> column typing.
    """
    if not table or len(table) < 2:
        return []
    header = [str(c or "").strip() for c in table[0]]
    header_section = section_id_from_table_header(header)
    if header_section:
        section_id = header_section
    roles = apply_role_hints(column_roles(header), role_hints)
    txns: list[dict[str, Any]] = []
    last_date = ""

    for raw_row in table[1:]:
        cells = [str(c or "").strip() for c in raw_row]
        if not any(cells):
            continue
        if is_summary_row(cells):
            continue

        row_line = " ".join(cells)
        if header_section:
            row_section = section_id
        elif is_likely_section_header_row(cells):
            detected = detect_section(row_line, section_id)
            if detected:
                section_id = detected
            continue
        else:
            row_section = section_id
        txn_type = txn_type_for_section(row_section) if row_section else "DEBIT"

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
                emit_row(date, description, amt, txn_type, txns, row_section)
            continue

        if dep_amt is None and wd_amt is None:
            if row_section:
                amt, description = pick_section_typed_amount(
                    cells, date_idx, balance_idx, description
                )
                if amt is not None:
                    emit_row(date, description or row_line, amt, txn_type, txns, row_section)
                continue
            money_cells: list[tuple[int, float]] = []
            last_col_idx = len(cells) - 1
            for i, cell in enumerate(cells):
                if i == date_idx or i == balance_idx:
                    continue
                if roles["deposits"] == i or roles["withdrawals"] == i or roles["amount"] == i:
                    continue
                # Dual-amount layouts: last column is the daily balance when role not detected
                if balance_idx is None and roles["deposits"] is not None and roles["withdrawals"] is not None:
                    if i == last_col_idx and len(cells) >= 4:
                        continue
                amt = parse_money(cell)
                if amt is not None:
                    money_cells.append((i, amt))
            if len(money_cells) == 1:
                _i, amt = money_cells[0]
                if row_section:
                    emit_row(
                        date,
                        description or row_line,
                        amt,
                        txn_type_for_section(row_section),
                        txns,
                        row_section,
                    )
                else:
                    if roles["deposits"] is not None and roles["withdrawals"] is not None:
                        txn_type = "CREDIT" if _i <= roles["deposits"] else "DEBIT"
                    elif roles["withdrawals"] is not None and _i >= roles["withdrawals"]:
                        txn_type = "DEBIT"
                    else:
                        txn_type = "CREDIT"
                    emit_row(date, description or row_line, amt, txn_type, txns)
            elif len(money_cells) >= 2:
                money_cells.sort(key=lambda x: x[0])
                if row_section:
                    # section-typed: take penultimate money cell when trailing is balance
                    amt = (
                        money_cells[-2][1]
                        if len(money_cells) >= 2 and balance_idx is None
                        else money_cells[-1][1]
                    )
                    emit_row(
                        date,
                        description or row_line,
                        amt,
                        txn_type_for_section(row_section),
                        txns,
                        row_section,
                    )
                else:
                    # dual layout without roles: at most deposit + withdrawal;
                    # ignore trailing balance column
                    dep_fb = money_cells[0][1]
                    wd_fb = money_cells[1][1] if len(money_cells) > 1 else None
                    if len(money_cells) >= 3:
                        dep_fb = money_cells[0][1]
                        wd_fb = money_cells[1][1]
                    if dep_fb is not None and dep_fb >= 0.01:
                        emit_row(date, description, dep_fb, "CREDIT", txns)
                    if wd_fb is not None and wd_fb >= 0.01:
                        emit_row(date, description, wd_fb, "DEBIT", txns)
            continue

        # Section-aware dual columns: never emit the opposite column inside a
        # typed section (balance/OCR often lands in the empty column → inflation).
        credit_section = (row_section or "") in SECTION_CREDIT_IDS or (
            row_section == "deposits"
        )
        debit_section = bool(row_section) and not credit_section
        if credit_section:
            if dep_amt is not None:
                emit_row(date, description, dep_amt, "CREDIT", txns, row_section or "deposits")
            continue
        if debit_section:
            if wd_amt is not None:
                emit_row(date, description, wd_amt, "DEBIT", txns, row_section or section_id)
            elif dep_amt is not None and wd_amt is None:
                # Some layouts print a single Amount column mis-detected as deposits.
                emit_row(date, description, dep_amt, "DEBIT", txns, row_section or section_id)
            continue

        if dep_amt is not None:
            emit_row(date, description, dep_amt, "CREDIT", txns, row_section or "deposits")
        if wd_amt is not None:
            emit_row(date, description, wd_amt, "DEBIT", txns, row_section or section_id)

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


def _find_header_row(rows: list[list[dict[str, Any]]]) -> tuple[int, list[float], str] | None:
    """Locate a column header row. Matches dual-amount headers (deposit+withdraw)
    and single-amount headers (date+amount). Returns (row index, sorted x0s, header text)."""
    for idx, row in enumerate(rows[:8]):
        text = " ".join(_word_text(w) for w in row).lower()
        if not HEADER_WORDS_RE.search(text):
            continue
        has_credit_col = "deposit" in text or "credit" in text
        has_debit_col = "withdraw" in text or "debit" in text
        has_amount_col = "amount" in text
        is_dual = has_credit_col and has_debit_col
        is_single_amount = has_amount_col and not is_dual and "date" in text
        if is_dual or is_single_amount:
            xs = sorted(float(w.get("x0", 0)) for w in row)
            return idx, xs, text
    return None


def _layout_mode_from_header(
    header_text: str | None, default_header: list[str] | None = None
) -> str:
    """Derive the structural layout mode from header content (never a bank brand).
    section_typed_3col: single Amount column, transaction type comes from the section.
    dual_amount: separate deposit and withdrawal columns, type comes from the column."""
    text = (header_text or " ".join(default_header or [])).lower()
    has_dual = ("deposit" in text or "credit" in text) and ("withdraw" in text or "debit" in text)
    if "amount" in text and not has_dual:
        return "section_typed_3col"
    return "dual_amount"


def _gap_cluster_breaks(header_xs: list[float], page_width: float, *, max_breaks: int = 4) -> list[float]:
    xs = sorted(set(float(x) for x in header_xs if x is not None))
    if len(xs) < 2:
        w = page_width or 612
        return [w * 0.12, w * 0.55, w * 0.72, w * 0.88][:max_breaks]
    gaps: list[tuple[float, float]] = []
    for i in range(len(xs) - 1):
        gaps.append((xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) / 2))
    gaps.sort(reverse=True, key=lambda g: g[0])
    breaks = sorted(mid for _, mid in gaps[:max_breaks])
    return breaks


def _assign_column_breaks_v2(
    header_xs: list[float], page_width: float, *, layout_mode: str = "dual_amount"
) -> list[float]:
    if layout_mode == "section_typed_3col":
        if len(header_xs) >= 3:
            breaks = []
            for i in range(min(2, len(header_xs) - 1)):
                breaks.append((header_xs[i] + header_xs[i + 1]) / 2)
            return breaks
        w = page_width or 612
        return [w * 0.18, w * 0.72]
    if len(header_xs) >= 4:
        breaks = []
        for i in range(len(header_xs) - 1):
            breaks.append((header_xs[i] + header_xs[i + 1]) / 2)
        return breaks
    return _gap_cluster_breaks(header_xs, page_width, max_breaks=4)


_MONEY_CELL_RE = re.compile(r"\(?\$?\s*[\d,]+\.\d{2}\)?")


def _money_in_desc_ratio(
    word_rows: list[list[dict[str, Any]]], breaks: list[float], *, desc_col: int = 1
) -> float:
    """Bleed score: fraction of money tokens landing in the description column.
    Lower is better; 0.0 when no money tokens are present."""
    money_in_desc = 0
    money_total = 0
    for row in word_rows:
        cells = _row_words_to_cells(row, breaks)
        for idx, cell in enumerate(cells):
            if not cell or not _MONEY_CELL_RE.search(cell):
                continue
            money_total += 1
            if idx == desc_col:
                money_in_desc += 1
    if money_total == 0:
        return 0.0
    return money_in_desc / money_total


def _validate_column_breaks(
    word_rows: list[list[dict[str, Any]]], breaks: list[float], *, desc_col: int = 1
) -> bool:
    return _money_in_desc_ratio(word_rows, breaks, desc_col=desc_col) <= 0.30


def _choose_breaks(
    word_rows: list[list[dict[str, Any]]],
    primary: list[float],
    fallback: list[float],
    *,
    desc_col: int = 1,
) -> list[float]:
    """Quality-compare guard: adopt the fallback break set only when it measurably
    reduces money-in-description bleed on the same sample; otherwise keep the
    original breaks (a blind swap can be worse than the failure it fixes)."""
    if not fallback:
        return primary
    primary_bleed = _money_in_desc_ratio(word_rows, primary, desc_col=desc_col)
    fallback_bleed = _money_in_desc_ratio(word_rows, fallback, desc_col=desc_col)
    return fallback if fallback_bleed < primary_bleed else primary


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
    page: Any, *, default_header: list[str] | None = None
) -> tuple[list[list[str | None]], dict[str, Any]] | None:
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
        header_idx, header_xs, header_text = header_info
        layout_mode = _layout_mode_from_header(header_text)
        breaks = _assign_column_breaks_v2(header_xs, page_width, layout_mode=layout_mode)
        sample_rows = word_rows[header_idx + 1 : header_idx + 12]
        if not _validate_column_breaks(sample_rows, breaks):
            fallback = _gap_cluster_breaks(
                header_xs, page_width, max_breaks=2 if layout_mode == "section_typed_3col" else 4
            )
            breaks = _choose_breaks(sample_rows, breaks, fallback)
        header_cells = _row_words_to_cells(word_rows[header_idx], breaks)
        table: list[list[str | None]] = [header_cells]
        data_start = header_idx + 1
    else:
        fallback = default_header or [
            "Date",
            "Description",
            "Deposits/Credits",
            "Withdrawals/Debits",
            "Ending daily balance",
        ]
        layout_mode = _layout_mode_from_header(None, fallback)
        breaks = _assign_column_breaks_v2([], page_width, layout_mode=layout_mode)
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
    return table, {"columnBreaks": breaks, "layoutMode": layout_mode}


def _unpack_word_table(
    result: tuple[list[list[str | None]], dict[str, Any]] | list[list[str | None]] | None,
) -> tuple[list[list[str | None]] | None, dict[str, Any]]:
    if result is None:
        return None, {}
    if isinstance(result, tuple):
        return result[0], result[1] if len(result) > 1 else {}
    return result, {}


def extract_page_rows(
    page: Any,
    page_index: int,
    *,
    section_id: str | None = None,
    role_hints: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cascade: text tables -> words -> lines."""
    txns: list[dict[str, Any]] = []
    tables_text = extract_tables_from_page(page, TABLE_SETTINGS_TEXT)
    raw_rows = count_data_rows(tables_text)
    strategy = "text"
    table_count = len(tables_text)

    for table in tables_text:
        if table:
            txns.extend(rows_from_table(table, section_id, role_hints=role_hints))

    word_meta: dict[str, Any] = {}

    if raw_rows > 0 and not txns:
        word_table, word_meta = _unpack_word_table(table_from_words(page))
        if word_table:
            strategy = "words_retry"
            table_count = max(table_count, 1)
            txns.extend(rows_from_table(word_table, section_id, role_hints=role_hints))

    if raw_rows == 0 and not txns:
        word_table, word_meta = _unpack_word_table(table_from_words(page))
        if word_table:
            strategy = "words"
            table_count = 1
            raw_rows = max(0, len(word_table) - 1)
            txns.extend(rows_from_table(word_table, section_id, role_hints=role_hints))

    if raw_rows == 0 and not txns:
        tables_lines = extract_tables_from_page(page, TABLE_SETTINGS_LINES)
        raw_rows = count_data_rows(tables_lines)
        strategy = "lines"
        table_count = len(tables_lines)
        for table in tables_lines:
            if table:
                txns.extend(rows_from_table(table, section_id, role_hints=role_hints))

    debug_page(page_index, raw_rows, strategy, table_count)
    telemetry = {
        "page": page_index,
        "rawRows": raw_rows,
        "strategy": strategy,
        "tables": table_count,
        "txnRows": len(txns),
    }
    if word_meta.get("columnBreaks"):
        telemetry["columnBreaks"] = word_meta["columnBreaks"]
        telemetry["layoutMode"] = word_meta.get("layoutMode")
    return txns, telemetry


def page_in_history_zone(text: str, in_history: bool) -> bool:
    if TXN_HISTORY_RE.search(text):
        return True
    if in_history and CONTINUED_HEADER_RE.search(text):
        return True
    return in_history and bool(re.search(r"\d{1,2}/\d{1,2}", text))


def _regions_txn_quality(txns: list[dict[str, Any]]) -> float:
    """Higher is better: prefer long descriptions and avoid balance-grid noise."""
    if not txns:
        return -1.0
    score = 0.0
    for t in txns:
        desc = str(t.get("description") or "")
        amt = float(t.get("amount") or 0)
        if NOISE_DESC_RE.match(desc):
            score -= 5.0
            continue
        if len(desc) >= 24:
            score += 2.0
        elif len(desc) >= 12:
            score += 1.0
        elif len(desc) >= 6:
            score += 0.2
        else:
            score -= 1.5
        if amt > 100_000:
            score -= 1.0
    return score + min(len(txns), 40) * 0.05


def find_regions_phrase_bands(
    page: Any, incoming_section: str | None
) -> tuple[list[tuple[float, float, str]], str | None]:
    """Split a Regions page into vertical bands by DEPOSITS/WITHDRAWALS/CHECKS headers.

    Mixed pages (deposits ending + withdrawals starting) must not share one section_id.
    """
    try:
        words = page.extract_words() or []
    except Exception:
        height = float(getattr(page, "height", 0) or 0)
        if incoming_section:
            return [(0.0, height, incoming_section)], incoming_section
        return [], incoming_section

    rows = _cluster_words_into_rows(words)
    events: list[tuple[float, str | None]] = []
    for row in rows:
        if not row:
            continue
        text = " ".join(_word_text(w) for w in row).strip()
        top = float(row[0].get("top", 0))
        if re.match(r"DEPOSITS\s*(?:&|AND)\s*CREDITS(?:\s*\(CONTINUED\))?\s*$", text, re.I):
            events.append((top, "deposits"))
        elif re.match(r"WITHDRAWALS(?:\s*\(CONTINUED\))?\s*$", text, re.I):
            events.append((top, "withdrawals"))
        elif re.match(r"CHECKS(?:\s*\(CONTINUED\))?\s*$", text, re.I):
            events.append((top, "checks"))
        elif re.match(r"DAILY\s+BALANCE\s+SUMMARY\b", text, re.I):
            events.append((top, None))
        elif re.match(r"Easy\s+Steps\s+to\s+Balance", text, re.I):
            events.append((top, None))

    height = float(getattr(page, "height", 0) or 0)
    if not events:
        if incoming_section:
            return [(0.0, height, incoming_section)], incoming_section
        return [], incoming_section

    bands: list[tuple[float, float, str]] = []
    current = incoming_section
    prev_top = 0.0
    for top, sec in events:
        if current and (top - prev_top) > 8.0:
            bands.append((prev_top, top, current))
        current = sec
        prev_top = top
    if current and (height - prev_top) > 8.0:
        bands.append((prev_top, height, current))

    outgoing = current if current else incoming_section
    return bands, outgoing


def _extract_regions_band(
    page: Any, section_id: str
) -> tuple[list[dict[str, Any]], dict[str, Any], int]:
    """Extract one section band; prefer section_typed word columns."""
    tables_text = extract_tables_from_page(page, TABLE_SETTINGS_TEXT)
    raw_rows = count_data_rows(tables_text)
    text_txns: list[dict[str, Any]] = []
    for table in tables_text:
        if table:
            text_txns.extend(rows_from_table(table, section_id))

    word_table, word_meta = _unpack_word_table(table_from_words_section_typed(page))
    word_txns: list[dict[str, Any]] = []
    if word_table:
        word_txns = rows_from_table(word_table, section_id)

    txns: list[dict[str, Any]] = []
    strategy = "text"
    if word_txns:
        wq = _regions_txn_quality(word_txns)
        tq = _regions_txn_quality(text_txns)
        if not text_txns or wq + 1.0 >= tq:
            txns = word_txns
            strategy = "words_section_typed"
        else:
            txns = text_txns
            strategy = "text"
    elif text_txns:
        txns = text_txns
        strategy = "text"
    elif raw_rows == 0:
        word_table2, word_meta2 = _unpack_word_table(table_from_words(page))
        if word_table2:
            strategy = "words_dual"
            raw_rows = max(0, len(word_table2) - 1)
            txns = rows_from_table(word_table2, section_id)
            word_meta = word_meta2 or word_meta

    return txns, {"strategy": strategy, "word_meta": word_meta or {}, "raw_rows": raw_rows}, raw_rows


def extract_regions_page_rows(
    page: Any, page_index: int, section_id: str
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    page_text = page.extract_text() or ""
    # Balancing worksheet is not a transaction page (mentions "withdrawals" as noise).
    if EASY_STEPS_RE.search(page_text) and not re.search(
        r"^\s*(?:DEPOSITS|WITHDRAWALS|CHECKS)\b", page_text, re.I | re.M
    ):
        debug_page(page_index, 0, "easy_steps_skip", 0)
        return [], {
            "page": page_index,
            "rawRows": 0,
            "strategy": "easy_steps_skip",
            "tables": 0,
            "txnRows": 0,
            "sectionId": section_id,
        }

    bands, outgoing = find_regions_phrase_bands(page, section_id)
    # Text CHECKS grid is parsed from pdf-parse text in JS — skip plumber checks bands
    # to avoid double-count / daily-balance bleed on check pages.
    bands = [(t, b, s) for (t, b, s) in bands if s and s != "checks"]
    if not bands:
        debug_page(page_index, 0, "no_txn_bands", 0)
        return [], {
            "page": page_index,
            "rawRows": 0,
            "strategy": "no_txn_bands",
            "tables": 0,
            "txnRows": 0,
            "sectionId": outgoing or section_id,
        }

    all_txns: list[dict[str, Any]] = []
    strategies: list[str] = []
    raw_rows_total = 0
    word_meta: dict[str, Any] = {}
    width = float(getattr(page, "width", 0) or 612)
    height = float(getattr(page, "height", 0) or 0)

    for top, bottom, band_section in bands:
        try:
            cropped = page.crop((0, max(0.0, top - 2), width, min(height, bottom + 2)))
        except Exception:
            cropped = page
        band_txns, meta, raw_rows = _extract_regions_band(cropped, band_section)
        # Ensure section tag matches the band (rows_from_table may inherit wrong id).
        for t in band_txns:
            t["section"] = band_section
            t["type"] = txn_type_for_section(band_section)
        all_txns.extend(band_txns)
        strategies.append(meta.get("strategy") or "text")
        raw_rows_total += raw_rows
        if meta.get("word_meta"):
            word_meta = meta["word_meta"]

    strategy = "+".join(dict.fromkeys(strategies)) or "text"
    debug_page(page_index, raw_rows_total, strategy, len(bands))
    telemetry = {
        "page": page_index,
        "rawRows": raw_rows_total,
        "strategy": strategy,
        "tables": len(bands),
        "txnRows": len(all_txns),
        "sectionId": outgoing or section_id,
        "bands": [s for _, _, s in bands],
    }
    if word_meta.get("columnBreaks"):
        telemetry["columnBreaks"] = word_meta["columnBreaks"]
        telemetry["layoutMode"] = word_meta.get("layoutMode")
    return all_txns, telemetry


def page_in_regions_zone(text: str, in_zone: bool) -> bool:
    if REGIONS_ACTIVITY_RE.search(text):
        return True
    if re.search(r"\bSUMMARY\b", text, re.I) and re.search(r"beginning\s+balance", text, re.I):
        return False
    if in_zone and re.search(r"\(CONTINUED\)", text, re.I):
        return True
    return in_zone and bool(re.search(r"\d{1,2}/\d{1,2}", text))


def extract_regions(pdf_path: str) -> dict[str, Any]:
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

            page_txns, telemetry = extract_regions_page_rows(page, page_index, section_id)
            # Carry forward the outgoing section for CONTINUED pages without a new header.
            section_id = telemetry.get("sectionId") or section_id
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
            **_aggregate_column_breaks(page_telemetry),
        },
    }


def _aggregate_column_breaks(page_telemetry: list[dict[str, Any]]) -> dict[str, Any]:
    for telemetry in reversed(page_telemetry):
        breaks = telemetry.get("columnBreaks")
        if breaks:
            return {
                "columnBreaks": breaks,
                "layoutMode": telemetry.get("layoutMode"),
            }
    return {}


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


SECTION_TYPED_3COL_HEADER = ["Date", "Description", "Amount"]


def table_from_words_section_typed(
    page: Any,
) -> tuple[list[list[str | None]], dict[str, Any]] | None:
    return table_from_words(page, default_header=SECTION_TYPED_3COL_HEADER)


MARKER_EVENT_RE = re.compile(r"\*(start|end)\*([a-z0-9_]+)", re.I)
MIN_MARKER_BAND_HEIGHT = 4.0


def marker_section_id(name: str) -> str | None:
    """Map an embedded marker name to the shared section vocabulary (generic,
    keyword-based — never a bank brand). Non-transactional markers map to None."""
    n = (name or "").lower()
    if "summary" in n:
        return None
    if "deposit" in n:
        return "deposits"
    if "check" in n:
        return "checks"
    if "electronic" in n:
        return "electronic_withdrawals"
    if "atm" in n:
        return "atm_debit"
    if "fee" in n:
        return "fees"
    if "withdraw" in n:
        return "other_withdrawals"
    return None


def find_marker_bands(
    page: Any, incoming_section: str | None
) -> tuple[list[tuple[float, float, str]], str | None, bool]:
    """Segment a page vertically by embedded *start*/*end* markers in the text layer.

    Returns (bands, outgoing_section, has_markers). Each band is
    (top, bottom, section_id); rows outside any marked transactional section
    are excluded (headers, footers, disclosures, summary blocks).
    """
    try:
        words = page.extract_words() or []
    except Exception:
        return [], incoming_section, False

    events: list[tuple[float, str, str]] = []
    for w in words:
        m = MARKER_EVENT_RE.search(str(w.get("text") or ""))
        if not m:
            continue
        events.append((float(w.get("top", 0.0)), m.group(1).lower(), m.group(2).lower()))
    if not events:
        return [], incoming_section, False

    events.sort(key=lambda e: e[0])
    height = float(getattr(page, "height", 0) or 0)
    bands: list[tuple[float, float, str]] = []
    current: str | None = incoming_section
    prev_top = 0.0
    for top, kind, name in events:
        if current and top - prev_top > MIN_MARKER_BAND_HEIGHT:
            bands.append((prev_top, top, current))
        current = marker_section_id(name) if kind == "start" else None
        prev_top = top
    if current and height - prev_top > MIN_MARKER_BAND_HEIGHT:
        bands.append((prev_top, height, current))
    return bands, current, True


def _section_rows_cascade(
    page: Any, section_id: str | None
) -> tuple[list[dict[str, Any]], int, str, int, dict[str, Any]]:
    """Extraction cascade for one page/region: text tables -> words retry -> words -> lines."""
    txns: list[dict[str, Any]] = []
    tables_text = extract_tables_from_page(page, TABLE_SETTINGS_TEXT)
    raw_rows = count_data_rows(tables_text)
    strategy = "text"
    table_count = len(tables_text)
    word_meta: dict[str, Any] = {}

    for table in tables_text:
        if table:
            txns.extend(rows_from_table(table, section_id))

    if raw_rows > 0 and not txns:
        word_table, word_meta = _unpack_word_table(table_from_words_section_typed(page))
        if word_table:
            strategy = "words_retry"
            table_count = max(table_count, 1)
            txns.extend(rows_from_table(word_table, section_id))

    if raw_rows == 0 and not txns:
        word_table, word_meta = _unpack_word_table(table_from_words_section_typed(page))
        if word_table:
            strategy = "words"
            table_count = 1
            raw_rows = max(0, len(word_table) - 1)
            txns.extend(rows_from_table(word_table, section_id))

    if raw_rows == 0 and not txns:
        tables_lines = extract_tables_from_page(page, TABLE_SETTINGS_LINES)
        raw_rows = count_data_rows(tables_lines)
        strategy = "lines"
        table_count = len(tables_lines)
        for table in tables_lines:
            if table:
                txns.extend(rows_from_table(table, section_id))

    return txns, raw_rows, strategy, table_count, word_meta


def extract_chase_page_rows(
    page: Any, page_index: int, section_id: str | None
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Same cascade as extract_page_rows but section-aware CREDIT/DEBIT.
    Embedded *start*/*end* markers, when present, are the authoritative
    in-page section boundaries; phrase detection is the fallback."""
    page_text = page.extract_text() or ""
    bands, outgoing, has_markers = find_marker_bands(page, section_id)

    if has_markers:
        txns: list[dict[str, Any]] = []
        raw_rows = 0
        table_count = 0
        strategies: set[str] = set()
        word_meta: dict[str, Any] = {}
        page_width = float(getattr(page, "width", 0) or 0)
        page_height = float(getattr(page, "height", 0) or 0)
        for top, bottom, band_section in bands:
            t0 = max(0.0, top)
            t1 = min(page_height, bottom)
            if t1 - t0 <= MIN_MARKER_BAND_HEIGHT:
                continue
            try:
                # within_bbox keeps only fully-contained objects so a row that
                # straddles a band boundary is never captured by both bands.
                region = page.within_bbox((0, t0, page_width, t1))
            except Exception:
                region = None
            if region is None:
                continue
            band_txns, band_raw, band_strategy, band_tables, band_meta = _section_rows_cascade(
                region, band_section
            )
            txns.extend(band_txns)
            raw_rows += band_raw
            table_count += band_tables
            strategies.add(band_strategy)
            if band_meta.get("columnBreaks"):
                word_meta = band_meta

        display_section = bands[-1][2] if bands else (section_id or "none")
        strategy = (
            "markers+" + "+".join(sorted(strategies)) if strategies else "markers"
        )
        debug_chase_page(
            page_index, display_section or "none", txns, raw_rows, strategy, table_count
        )
        telemetry = {
            "page": page_index,
            "rawRows": raw_rows,
            "strategy": strategy,
            "tables": table_count,
            "txnRows": len(txns),
            "sectionId": display_section,
            "outgoingSection": outgoing,
            "markerBands": len(bands),
            "creditRows": sum(1 for t in txns if t.get("type") == "CREDIT"),
            "debitRows": sum(1 for t in txns if t.get("type") == "DEBIT"),
        }
        if word_meta.get("columnBreaks"):
            telemetry["columnBreaks"] = word_meta["columnBreaks"]
            telemetry["layoutMode"] = word_meta.get("layoutMode")
        return txns, telemetry

    section_id = detect_section(page_text, section_id)
    txns, raw_rows, strategy, table_count, word_meta = _section_rows_cascade(
        page, section_id
    )

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
    if word_meta.get("columnBreaks"):
        telemetry["columnBreaks"] = word_meta["columnBreaks"]
        telemetry["layoutMode"] = word_meta.get("layoutMode")
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
            section_id = detect_section(text, section_id)

            if not page_in_chase_zone(text, in_zone):
                debug_page(page_index, 0, "skipped", 0)
                page_telemetry.append(
                    {"page": page_index, "rawRows": 0, "strategy": "skipped", "tables": 0}
                )
                continue

            page_txns, telemetry = extract_chase_page_rows(page, page_index, section_id)
            # Marker pages report their outgoing section; carry it across pages
            # (None means the last section closed with an *end* marker).
            if telemetry.get("markerBands") is not None:
                section_id = telemetry.get("outgoingSection")
            page_telemetry.append(telemetry)
            strategies_used.add(telemetry["strategy"])
            tables_extracted += telemetry.get("tables", 0)
            for t in page_txns:
                t["_page"] = page_index
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

    # Cross-page dedup only: the per-page cascade is exclusive (one strategy
    # per band/page), so identical rows on the SAME page are genuine repeat
    # transactions (e.g. two equal card purchases) and must be kept.
    seen_pages: dict[tuple[Any, ...], set[Any]] = {}
    deduped: list[dict[str, Any]] = []
    for t in transactions:
        page_no = t.pop("_page", None)
        key = (t.get("date"), t.get("description"), t.get("amount"), t.get("type"))
        pages = seen_pages.setdefault(key, set())
        if pages and page_no not in pages:
            continue
        pages.add(page_no)
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
            **_aggregate_column_breaks(page_telemetry),
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


def extract_generic(pdf_path: str, column_hints: dict[str, Any] | None = None) -> dict[str, Any]:
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

            # Sections resolve inside rows_from_table (table headers + row text);
            # no page-level section state: mixed-section pages would mistype rows.
            page_txns, telemetry = extract_page_rows(
                page, page_index, role_hints=column_hints
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
            **({"columnHints": column_hints} if column_hints else {}),
            **_aggregate_column_breaks(page_telemetry),
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
            "bank": "wells",
            "pageTelemetry": page_telemetry,
            "extractionStrategy": extraction_strategy,
        },
    }


# Structural layout profiles: each entry point differs only in page-zone gating,
# printed-totals regexes, and default section state — never in shared parsing logic.
LAYOUT_PROFILE_EXTRACTORS = {
    "txn_history_dual_amount": lambda path, hints: extract_wells(path),
    "multi_table_sections": lambda path, hints: extract_regions(path),
    "section_typed_activity": lambda path, hints: extract_chase(path),
    "generic": extract_generic,
}

def resolve_layout_profile(layout_profile: str | None, bank: str | None) -> str:
    """CLI profile resolution: explicit --layout-profile wins, then a legacy
    --bank slug mapping; with neither, the structural generic extractor."""
    profile = (layout_profile or "").strip().lower()
    if profile:
        return profile
    bank_slug = (bank or "").strip().lower()
    return LEGACY_BANK_TO_LAYOUT_PROFILE.get(bank_slug, "generic")


# Back-compat: legacy --bank slugs map onto structural layout profiles.
LEGACY_BANK_TO_LAYOUT_PROFILE = {
    "wells": "txn_history_dual_amount",
    "wells_fargo": "txn_history_dual_amount",
    "wellsfargo": "txn_history_dual_amount",
    "regions": "multi_table_sections",
    "regions_bank": "multi_table_sections",
    "chase": "section_typed_activity",
    "chase_business": "section_typed_activity",
    "jpmorgan": "section_typed_activity",
    "jpmorgan_chase": "section_typed_activity",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract statement tables to JSON")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument(
        "--layout-profile",
        default="",
        help="Structural layout profile: " + ", ".join(LAYOUT_PROFILE_EXTRACTORS),
    )
    parser.add_argument(
        "--bank",
        default="",
        help="Deprecated bank slug (mapped to a layout profile); prefer --layout-profile",
    )
    parser.add_argument(
        "--column-hints",
        default="",
        help="JSON column index hints from vision layout (dateIdx, descIdx, amountIdx, ...)",
    )
    args = parser.parse_args()

    column_hints = None
    if args.column_hints:
        try:
            column_hints = json.loads(args.column_hints)
        except json.JSONDecodeError:
            column_hints = None

    profile = resolve_layout_profile(args.layout_profile, args.bank)
    extractor = LAYOUT_PROFILE_EXTRACTORS.get(profile, extract_generic)
    result = extractor(args.pdf_path, column_hints)

    if isinstance(result.get("metadata"), dict):
        result["metadata"]["layoutProfile"] = profile
        if column_hints:
            result["metadata"]["columnHints"] = column_hints

    # Stable per-document row index keeps legitimate identical transactions
    # (same date/amount/description) distinct through downstream dedupe.
    for idx, txn in enumerate(result.get("transactions") or []):
        if isinstance(txn, dict):
            txn.setdefault("rowIndex", idx)

    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
