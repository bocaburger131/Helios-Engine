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

DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}(?:/\d{2,4})?$")
DATE_PREFIX_RE = re.compile(r"^(\d{1,2}/\d{1,2}(?:/\d{2,4})?)\s+(.+)$")
MONEY_TAIL_RE = re.compile(r"([\d,]+\.\d{2})\s*$")
MONEY_PAREN_RE = re.compile(r"\(([\d,]+\.\d{2})\)\s*$")
SUMMARY_RE = re.compile(
    r"deposits?/credits?|withdrawals?/debits?|beginning balance|ending balance|"
    r"activity summary|opening balance|closing balance|total deposits",
    re.I,
)
TXN_HISTORY_RE = re.compile(r"transaction\s+history", re.I)


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


def infer_type(description: str, amount: float, is_paren: bool) -> str:
    d = description.lower()
    if is_paren or amount < 0:
        return "DEBIT"
    if re.search(r"\bdeposit\b|\bcredit\b|\brefund\b", d):
        return "CREDIT"
    if re.search(r"\bwithdraw|\bdebit\b|\bfee\b|\bcheck\b|\bpayment\b|\bnsf\b", d):
        return "DEBIT"
    return "DEBIT" if is_paren else "CREDIT"


def parse_txn_line(line: str) -> dict[str, Any] | None:
    s = " ".join(line.split()).strip()
    if not s or SUMMARY_RE.search(s):
        return None
    if len(s) < 8:
        return None

    date_raw = ""
    rest = s
    parts = s.split()
    if parts and DATE_RE.match(parts[0]):
        date_raw = parts[0]
        rest = s[len(date_raw) :].strip()
    else:
        m = DATE_PREFIX_RE.match(s)
        if not m:
            return None
        date_raw = m.group(1)
        rest = m.group(2).strip()

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

    txn_type = infer_type(desc, amount, is_paren)
    return {
        "date": date_raw,
        "dateRaw": date_raw,
        "description": desc,
        "amount": amount,
        "type": txn_type,
        "section": "ocr",
    }


def extract_pdf(pdf_path: str, dpi: int = 200, min_embedded_chars: int = 40) -> dict[str, Any]:
    transactions: list[dict[str, Any]] = []
    full_text_parts: list[str] = []
    page_telemetry: list[dict[str, Any]] = []
    in_history = False
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
            if TXN_HISTORY_RE.search(text):
                in_history = True

            page_txns: list[dict[str, Any]] = []
            if in_history or TXN_HISTORY_RE.search(text):
                for line in text.splitlines():
                    txn = parse_txn_line(line)
                    if txn:
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

    seen: set[tuple] = set()
    deduped: list[dict[str, Any]] = []
    for t in transactions:
        key = (t.get("date"), t.get("description"), t.get("amount"), t.get("type"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(t)

    return {
        "transactions": deduped,
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
    parser.add_argument("--bank", default="generic", help="Bank hint (telemetry only)")
    parser.add_argument("--dpi", type=int, default=200)
    args = parser.parse_args()

    result = extract_pdf(args.pdf_path, dpi=args.dpi)
    result["metadata"]["bank"] = args.bank
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
