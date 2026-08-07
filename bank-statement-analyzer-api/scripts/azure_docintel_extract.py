#!/usr/bin/env python3
"""
Azure AI Document Intelligence extraction sidecar (prebuilt-bankStatement.us).

Drop-in alternative to scripts/extract_tables.py: same CLI signature, same stdout
JSON contract, so it can be swapped in without touching the Node pipeline.

    python scripts/azure_docintel_extract.py <file_path> [--bank wells]

Stdout: single JSON object. Errors: stderr + exit 1.
Debug telemetry: stderr lines AZURE_DOCINTEL_DEBUG (never stdout).

Credentials come from the environment, never from arguments:
    AZURE_DOCINTEL_ENDPOINT   https://<resource>.cognitiveservices.azure.com/
    AZURE_DOCINTEL_KEY        resource API key

Install: pip install -r scripts/requirements-azure.txt
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import Any

MODEL_ID = "prebuilt-bankStatement.us"
ENDPOINT_ENV = "AZURE_DOCINTEL_ENDPOINT"
KEY_ENV = "AZURE_DOCINTEL_KEY"

# Mirrors extract_tables.PLUMBER/CHASE_ROW_AMOUNT_CAP so both engines gate rows alike.
ROW_AMOUNT_CAP = 250_000.0
ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
MDY_DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?")


class AzureExtractionError(RuntimeError):
    """Raised for configuration or service failures."""


def debug(message: str) -> None:
    print(f"AZURE_DOCINTEL_DEBUG {message}", file=sys.stderr)


# --------------------------------------------------------------------------- #
# Field access helpers
#
# DocumentField in azure-ai-documentintelligence is dict-backed, so the REST
# camelCase keys ("valueString", "valueCurrency", ...) work on both the SDK
# objects and on plain dicts decoded from JSON. Tests rely on the latter.
# --------------------------------------------------------------------------- #

def _get(obj: Any, key: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    try:
        return obj[key]
    except (TypeError, KeyError, IndexError):
        return getattr(obj, key, None)


def field(fields: Any, name: str) -> Any:
    return _get(fields, name)


def field_str(fields: Any, name: str) -> str | None:
    f = field(fields, name)
    if f is None:
        return None
    value = _get(f, "valueString")
    if value is None:
        value = _get(f, "content")
    text = str(value).strip() if value is not None else ""
    return text or None


def field_date(fields: Any, name: str) -> str | None:
    """Return an ISO YYYY-MM-DD date; the Node normalizer parses ISO first."""
    f = field(fields, name)
    if f is None:
        return None
    raw = _get(f, "valueDate") or _get(f, "content")
    return normalize_date(raw)


def normalize_date(raw: Any) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None

    iso = ISO_DATE_RE.match(text)
    if iso:
        return f"{iso.group(1)}-{iso.group(2)}-{iso.group(3)}"

    mdy = MDY_DATE_RE.match(text)
    if mdy:
        year = int(mdy.group(3)) if mdy.group(3) else None
        if year is None:
            # No year on the row: leave it MM/DD so the Node normalizer can
            # apply the statement's default year rather than guessing here.
            return f"{int(mdy.group(1)):02d}/{int(mdy.group(2)):02d}"
        if year < 100:
            year += 2000
        return f"{year:04d}-{int(mdy.group(1)):02d}-{int(mdy.group(2)):02d}"
    return None


def field_money(fields: Any, name: str) -> float | None:
    """Read a currency/number field as a positive float, or None."""
    f = field(fields, name)
    if f is None:
        return None

    amount = _get(_get(f, "valueCurrency"), "amount")
    if amount is None:
        amount = _get(f, "valueNumber")
    if amount is None:
        amount = parse_money(_get(f, "content"))
    if amount is None:
        return None

    try:
        value = abs(float(amount))
    except (TypeError, ValueError):
        return None
    return round(value, 2) if value >= 0.01 else None


def parse_money(token: Any) -> float | None:
    if token is None:
        return None
    s = str(token).strip().replace("$", "").replace(",", "")
    negative = s.startswith("(") and s.endswith(")")
    if negative:
        s = s[1:-1]
    try:
        return abs(float(s))
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# Normalization
# --------------------------------------------------------------------------- #

def normalize_transaction(txn_fields: Any) -> dict[str, Any] | None:
    """Map one Azure Transactions[] entry to a pipeline transaction row."""
    date = field_date(txn_fields, "Date")
    description = field_str(txn_fields, "Description")
    if not date or not description or len(description) < 2:
        return None

    deposit = field_money(txn_fields, "DepositAmount")
    withdrawal = field_money(txn_fields, "WithdrawalAmount")

    if deposit and withdrawal:
        # Ambiguous row: trust the larger side rather than emitting both.
        if deposit >= withdrawal:
            withdrawal = None
        else:
            deposit = None

    if deposit:
        amount, txn_type, section = deposit, "CREDIT", "deposits"
    elif withdrawal:
        amount, txn_type, section = withdrawal, "DEBIT", "withdrawals"
    else:
        return None

    if amount > ROW_AMOUNT_CAP:
        return None

    return {
        "date": date,
        "description": description,
        "amount": amount,
        "type": txn_type,
        "section": section,
    }


def normalize_account(account_fields: Any) -> dict[str, Any]:
    return {
        "accountNumber": field_str(account_fields, "AccountNumber"),
        "accountType": field_str(account_fields, "AccountType"),
        "beginningBalance": field_money(account_fields, "BeginningBalance"),
        "endingBalance": field_money(account_fields, "EndingBalance"),
        "totalServiceFees": field_money(account_fields, "TotalServiceFees"),
    }


def _sum_or_none(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(sum(present), 2) if present else None


def normalize_analyze_result(
    result: Any, *, bank: str = "", model_id: str = MODEL_ID
) -> dict[str, Any]:
    """Convert an AnalyzeResult (SDK object or decoded dict) to pipeline shape.

    Pure function with no SDK dependency so it can be exercised against
    recorded/mocked responses.
    """
    documents = _get(result, "documents") or []
    pages = _get(result, "pages") or []

    transactions: list[dict[str, Any]] = []
    accounts: list[dict[str, Any]] = []
    bank_name = account_holder = start_date = end_date = None

    for document in documents:
        fields = _get(document, "fields") or {}
        bank_name = bank_name or field_str(fields, "BankName")
        account_holder = account_holder or field_str(fields, "AccountHolderName")
        start_date = start_date or field_date(fields, "StatementStartDate")
        end_date = end_date or field_date(fields, "StatementEndDate")

        account_entries = _get(field(fields, "Accounts"), "valueArray") or []
        for account_entry in account_entries:
            account_fields = _get(account_entry, "valueObject") or {}
            accounts.append(normalize_account(account_fields))

            txn_entries = _get(field(account_fields, "Transactions"), "valueArray") or []
            for txn_entry in txn_entries:
                row = normalize_transaction(_get(txn_entry, "valueObject") or {})
                if row:
                    transactions.append(row)

    seen: set[tuple[Any, ...]] = set()
    deduped: list[dict[str, Any]] = []
    for t in transactions:
        key = (t["date"], t["description"], t["amount"], t["type"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(t)

    # Statements normally carry a single account; summing keeps multi-account
    # PDFs consistent with the merged transaction list.
    opening = _sum_or_none([a["beginningBalance"] for a in accounts])
    closing = _sum_or_none([a["endingBalance"] for a in accounts])

    page_telemetry = [
        {
            "page": _get(page, "pageNumber") or index,
            "rawRows": 0,
            "strategy": "azure",
            "tables": 0,
        }
        for index, page in enumerate(pages, start=1)
    ]

    return {
        "transactions": deduped,
        "openingBalance": opening,
        "closingBalance": closing,
        "metadata": {
            "pageCount": len(pages),
            "tablesExtracted": len(_get(result, "tables") or []),
            "engine": "azure-docintel",
            "bank": bank or (bank_name or "").lower() or "generic",
            "pageTelemetry": page_telemetry,
            "extractionStrategy": "azure-prebuilt-bankstatement",
            "modelId": model_id,
            "apiVersion": _get(result, "apiVersion"),
            "azure": {
                "bankName": bank_name,
                "accountHolderName": account_holder,
                "statementStartDate": start_date,
                "statementEndDate": end_date,
                "accounts": accounts,
            },
        },
    }


# --------------------------------------------------------------------------- #
# Azure call
# --------------------------------------------------------------------------- #

def build_client(endpoint: str | None = None, key: str | None = None) -> Any:
    endpoint = (endpoint or os.environ.get(ENDPOINT_ENV) or "").strip()
    key = (key or os.environ.get(KEY_ENV) or "").strip()
    missing = [
        name
        for name, value in ((ENDPOINT_ENV, endpoint), (KEY_ENV, key))
        if not value
    ]
    if missing:
        raise AzureExtractionError(f"Missing environment variable(s): {', '.join(missing)}")

    try:
        from azure.ai.documentintelligence import DocumentIntelligenceClient
        from azure.core.credentials import AzureKeyCredential
    except ImportError as exc:
        raise AzureExtractionError(
            "azure-ai-documentintelligence is not installed. "
            "Run: pip install -r scripts/requirements-azure.txt"
        ) from exc

    return DocumentIntelligenceClient(endpoint=endpoint, credential=AzureKeyCredential(key))


def analyze_document(file_path: str, *, client: Any = None, model_id: str = MODEL_ID) -> Any:
    """Run the prebuilt bank statement model against a local PDF/image."""
    if not os.path.isfile(file_path):
        raise AzureExtractionError(f"File not found: {file_path}")

    client = client or build_client()
    with open(file_path, "rb") as handle:
        poller = client.begin_analyze_document(model_id, body=handle)
    return poller.result()


def extract(
    file_path: str, *, bank: str = "", client: Any = None, model_id: str = MODEL_ID
) -> dict[str, Any]:
    """Analyze a statement and return it in the pipeline's parsed shape."""
    started = time.monotonic()
    result = analyze_document(file_path, client=client, model_id=model_id)
    elapsed_ms = int((time.monotonic() - started) * 1000)

    normalized = normalize_analyze_result(result, bank=bank, model_id=model_id)
    normalized["metadata"]["durationMs"] = elapsed_ms

    metadata = normalized["metadata"]
    debug(
        f"pages={metadata['pageCount']} accounts={len(metadata['azure']['accounts'])} "
        f"txns={len(normalized['transactions'])} model={model_id} duration_ms={elapsed_ms}"
    )
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract statement transactions via Azure AI Document Intelligence"
    )
    parser.add_argument("file_path", help="Path to statement PDF or image")
    parser.add_argument("--bank", default="", help="Bank profile slug recorded in metadata")
    parser.add_argument("--model", default=MODEL_ID, help=f"Model id (default: {MODEL_ID})")
    args = parser.parse_args()

    result = extract(args.file_path, bank=(args.bank or "").lower(), model_id=args.model)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 - sidecar contract: message on stderr, exit 1
        print(str(e), file=sys.stderr)
        sys.exit(1)
