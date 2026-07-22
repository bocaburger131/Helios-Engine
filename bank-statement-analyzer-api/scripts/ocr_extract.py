#!/usr/bin/env python3
"""
Scan-mode extraction: PyMuPDF render + Tesseract OCR → transaction JSON.
Stdout: same shape as extract_tables.py for normalizePlumberJson.
Stderr: OCR_DEBUG telemetry lines.
Usage: python ocr_extract.py <pdf_path> [--bank wells] [--dpi 200]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF missing: pip install -r scripts/requirements-ocr.txt", file=sys.stderr)
    sys.exit(1)

try:
    import pytesseract
    from PIL import Image
except ImportError:
    print("pytesseract/Pillow missing: pip install -r scripts/requirements-ocr.txt", file=sys.stderr)
    sys.exit(1)

# Windows: tesseract installs outside PATH by default — probe well-known locations.
if sys.platform == "win32":
    import os
    import shutil

    if not shutil.which("tesseract"):
        for candidate in (
            os.environ.get("TESSERACT_PATH"),
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ):
            if candidate and os.path.isfile(candidate):
                pytesseract.pytesseract.tesseract_cmd = candidate
                break

DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}(?:/\d{2,4})?$")
DATE_PREFIX_RE = re.compile(r"^(\d{1,2}/\d{1,2}(?:/\d{2,4})?)\s+(.+)$")
MONEY_TAIL_RE = re.compile(r"([\d,]+\.\d{2})\s*$")
MONEY_PAREN_RE = re.compile(r"\(([\d,]+\.\d{2})\)\s*$")
SUMMARY_RE = re.compile(
    r"deposits?/credits?|withdrawals?/debits?|beginning balance|ending balance|"
    r"activity summary|opening balance|closing balance|total deposits|"
    r"total checks|total other withdrawals|previous balance|new balance",
    re.I,
)
TXN_HISTORY_RE = re.compile(r"transaction\s+history", re.I)
# Column headers / section titles that mark an activity table (Truist, generic OCR layouts).
TXN_TABLE_HINT_RE = re.compile(
    r"DATE\s+DESCRIPTION\s+AMOUNT|"
    r"withdrawals?,?\s+debits?\s+and\s+service\s+charges|"
    r"deposits?,?\s+credits?\s+and\s+interest|"
    r"account\s+activity|checks\s+presented|other\s+withdrawals",
    re.I,
)


def debug_page(page_index: int, text_len: int, ocr_used: bool, txn_rows: int) -> None:
    print(
        f"OCR_DEBUG page={page_index} text_len={text_len} ocr_used={ocr_used} txn_rows={txn_rows}",
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


def parse_summary_balances(text: str) -> tuple[float | None, float | None]:
    opening = closing = None
    m_open = re.search(
        r"beginning balance(?:\s+on\s+\d{1,2}/\d{1,2})?\s*\$?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    ) or re.search(
        r"(?:previous|prior)\s+balance(?:\s+as\s+of\s+[\d/]+)?\s*=?\s*\$?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    )
    m_close = re.search(
        r"ending balance(?:\s+on\s+\d{1,2}/\d{1,2})?\s*\$?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    ) or re.search(
        r"(?:new|current)\s+balance(?:\s+as\s+of\s+[\d/]+)?\s*=?\s*\$?\s*([\d,]+\.\d{2})",
        text,
        re.I,
    )
    if m_open:
        opening = parse_money(m_open.group(1))
    if m_close:
        closing = parse_money(m_close.group(1))
    return opening, closing


def ocr_page(page: fitz.Page, dpi: int) -> str:
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    return pytesseract.image_to_string(img, config="--psm 6")


def page_text(page: fitz.Page, dpi: int, min_embedded_chars: int) -> tuple[str, bool]:
    embedded = (page.get_text("text") or "").strip()
    if len(embedded) >= min_embedded_chars:
        return embedded, False
    return ocr_page(page, dpi), True


def infer_type(description: str, amount: float, is_paren: bool, section_role: str | None = None) -> str:
    d = description.lower()
    if is_paren or amount < 0:
        return "DEBIT"
    if section_role == "debit":
        return "DEBIT"
    if section_role == "credit":
        return "CREDIT"
    if re.search(r"\bdeposit\b|\bcredit\b|\brefund\b", d):
        return "CREDIT"
    if re.search(r"\bwithdraw|\bdebit\b|\bfee\b|\bcheck\b|\bpayment\b|\bnsf\b", d):
        return "DEBIT"
    return "DEBIT" if is_paren else "CREDIT"


# Section headers that fix the sign of unsigned rows beneath them (Truist-style).
SECTION_ROLE_RES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^checks\b|DATE\s+CHECK\s*#", re.I), "debit"),
    (re.compile(r"other\s+withdrawals?,?\s+debits?|withdrawals?,?\s+debits?\s+and\s+service", re.I), "debit"),
    (re.compile(r"deposits?,?\s+credits?\s+and\s+interest|deposits?\s+and\s+(?:other\s+)?credits?", re.I), "credit"),
]


def section_role_for_line(line: str) -> str | None:
    s = " ".join(line.split()).strip()
    if not s or len(s) > 80:
        return None
    for pattern, role in SECTION_ROLE_RES:
        if pattern.search(s):
            return role
    return None


def parse_txn_line(
    line: str,
    section_role: str | None = None,
    fallback_date: str | None = None,
) -> dict[str, Any] | None:
    s = " ".join(line.split()).strip()
    if not s or SUMMARY_RE.search(s):
        return None
    if len(s) < 8:
        return None

    date_raw = ""
    rest = s
    parts = s.split()
    m_prefix = re.match(r"^(\d{1,2}/\d{1,2}(?:/\d{2,4})?)[_\W]*\s+(.+)$", s)
    if parts and DATE_RE.match(parts[0]):
        date_raw = parts[0]
        rest = s[len(date_raw) :].strip()
    elif m_prefix:
        date_raw = m_prefix.group(1)
        rest = m_prefix.group(2).strip()
    elif parts and re.match(r"^[O0oQ][O0-9]{1,3}$", parts[0]):
        # OCR-garbled leading date (e.g. "O77" for "07/17"): recover from an
        # embedded MM-DD(-YY) date in the description, else reuse the previous
        # row's date (garbled rows sit inside a dated table run).
        m_embed = re.search(r"\b(\d{2})[-/](\d{2})(?:[-/]\d{2})?\b", s)
        if m_embed:
            date_raw = f"{m_embed.group(1)}/{m_embed.group(2)}"
        elif fallback_date:
            date_raw = fallback_date
        else:
            return None
        rest = s[len(parts[0]) :].strip()
    else:
        return None

    is_paren = bool(MONEY_PAREN_RE.search(rest))
    m_money = MONEY_PAREN_RE.search(rest) or MONEY_TAIL_RE.search(rest)
    if not m_money:
        return None
    amount = parse_money(m_money.group(1))
    if amount is None:
        return None

    desc = rest[: m_money.start()].strip(" -\t")
    if not desc or len(desc) < 2:
        return None

    txn_type = infer_type(desc, amount, is_paren, section_role)
    return {
        "date": date_raw,
        "dateRaw": date_raw,
        "description": desc,
        "amount": amount,
        "type": txn_type,
        "section": "ocr",
    }


def assign_row_indexes(transactions: list[dict[str, Any]]) -> None:
    """Unique per-row index so identical same-day rows survive downstream dedupe."""
    for i, txn in enumerate(transactions):
        txn["rowIndex"] = i


def extract_pdf(pdf_path: str, dpi: int = 200, min_embedded_chars: int = 40) -> dict[str, Any]:
    transactions: list[dict[str, Any]] = []
    full_text_parts: list[str] = []
    page_telemetry: list[dict[str, Any]] = []
    in_history = False
    current_role: str | None = None
    last_date: str | None = None
    ocr_pages = 0
    page_count = 0

    doc = fitz.open(pdf_path)
    try:
        page_count = len(doc)
        for page_index, page in enumerate(doc, start=1):
            text, ocr_used = page_text(page, dpi, min_embedded_chars)
            if ocr_used:
                ocr_pages += 1
            full_text_parts.append(text)
            if TXN_HISTORY_RE.search(text) or TXN_TABLE_HINT_RE.search(text):
                in_history = True

            page_txns: list[dict[str, Any]] = []
            if in_history:
                for line in text.splitlines():
                    role = section_role_for_line(line)
                    if role is not None:
                        current_role = role
                        continue
                    txn = parse_txn_line(line, current_role, last_date)
                    if txn:
                        last_date = txn["date"]
                        page_txns.append(txn)

            debug_page(page_index, len(text), ocr_used, len(page_txns))
            page_telemetry.append(
                {
                    "page": page_index,
                    "textLen": len(text),
                    "ocrUsed": ocr_used,
                    "txnRows": len(page_txns),
                }
            )
            transactions.extend(page_txns)
    finally:
        doc.close()

    combined = "\n".join(full_text_parts)
    opening, closing = parse_summary_balances(combined)

    # No exact-dedupe: repeated identical rows (e.g. two same-day ATM withdrawals
    # of the same amount) are legitimate; printed totals validate downstream.
    assign_row_indexes(transactions)
    return {
        "transactions": transactions,
        "openingBalance": opening,
        "closingBalance": closing,
        "metadata": {
            "pageCount": page_count,
            "engine": "pymupdf-tesseract",
            "ocrPages": ocr_pages,
            "pageTelemetry": page_telemetry,
            "extractionStrategy": "ocr_text_lines",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="OCR bank statement PDF to JSON")
    parser.add_argument("pdf_path")
    parser.add_argument(
        "--layout-profile", default="", help="Structural layout profile (telemetry only)"
    )
    parser.add_argument(
        "--bank", default="generic", help="Deprecated bank hint (telemetry only)"
    )
    parser.add_argument("--dpi", type=int, default=200)
    args = parser.parse_args()

    result = extract_pdf(args.pdf_path, dpi=args.dpi)
    result["metadata"]["layoutProfile"] = args.layout_profile or args.bank
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
