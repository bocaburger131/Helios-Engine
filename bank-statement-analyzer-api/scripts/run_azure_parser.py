#!/usr/bin/env python3
"""
Standalone harness for the Azure Document Intelligence parser.

Runs ONLY scripts/azure_docintel_extract.py against one statement file — no
Marker/pdfplumber cascade, no Gemini categorization, no review workflow — so the
parsing section can be evaluated in isolation.

    export AZURE_DOCINTEL_ENDPOINT="https://<resource>.cognitiveservices.azure.com/"
    export AZURE_DOCINTEL_KEY="<key>"
    python scripts/run_azure_parser.py statements/chase.pdf
    python scripts/run_azure_parser.py statements/chase.pdf --out out/chase.azure.json

Prints the normalized JSON to stdout and a diagnostics summary to stderr.
Exit code 0 on success, 1 on failure.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from azure_docintel_extract import MODEL_ID, AzureExtractionError, extract


def summarize(result: dict, elapsed_ms: int) -> str:
    transactions = result.get("transactions") or []
    metadata = result.get("metadata") or {}
    azure = metadata.get("azure") or {}
    credits = [t for t in transactions if t.get("type") == "CREDIT"]
    debits = [t for t in transactions if t.get("type") == "DEBIT"]

    lines = [
        "--- Azure Document Intelligence diagnostics ---",
        f"model            : {metadata.get('modelId')}",
        f"api version      : {metadata.get('apiVersion')}",
        f"elapsed          : {elapsed_ms} ms",
        f"pages            : {metadata.get('pageCount')}",
        f"bank             : {azure.get('bankName')}",
        f"account holder   : {azure.get('accountHolderName')}",
        f"period           : {azure.get('statementStartDate')} -> {azure.get('statementEndDate')}",
        f"accounts         : {len(azure.get('accounts') or [])}",
        f"transactions     : {len(transactions)} ({len(credits)} credit / {len(debits)} debit)",
        f"credits total    : {round(sum(t['amount'] for t in credits), 2)}",
        f"debits total     : {round(sum(t['amount'] for t in debits), 2)}",
        f"opening balance  : {result.get('openingBalance')}",
        f"closing balance  : {result.get('closingBalance')}",
    ]

    opening = result.get("openingBalance")
    closing = result.get("closingBalance")
    if opening is not None and closing is not None:
        expected = round(opening + sum(t["amount"] for t in credits)
                         - sum(t["amount"] for t in debits), 2)
        lines.append(f"computed closing : {expected}")
        lines.append(f"reconcile delta  : {round(closing - expected, 2)}")

    for account in azure.get("accounts") or []:
        lines.append(
            f"  account {account.get('accountNumber')}: "
            f"begin={account.get('beginningBalance')} end={account.get('endingBalance')}"
        )

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("file_path", help="Path to statement PDF or image")
    parser.add_argument("--bank", default="", help="Bank profile slug recorded in metadata")
    parser.add_argument("--model", default=MODEL_ID, help=f"Model id (default: {MODEL_ID})")
    parser.add_argument("--out", help="Also write the normalized JSON to this path")
    parser.add_argument("--compact", action="store_true", help="Emit single-line JSON")
    args = parser.parse_args()

    started = time.monotonic()
    try:
        result = extract(args.file_path, bank=(args.bank or "").lower(), model_id=args.model)
    except AzureExtractionError as e:
        print(f"[azure-parser] {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 - report the failure instead of a traceback
        print(f"[azure-parser] {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    elapsed_ms = int((time.monotonic() - started) * 1000)

    payload = json.dumps(result) if args.compact else json.dumps(result, indent=2)
    print(payload)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(payload + "\n")
        print(f"[azure-parser] wrote {args.out}", file=sys.stderr)

    print(summarize(result, elapsed_ms), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
