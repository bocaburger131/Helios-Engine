#!/usr/bin/env python3
"""
Smoke tests for scripts/azure_docintel_extract.py.

Uses stdlib unittest with a mocked Azure response — no SDK install and no live
credentials required.

    python -m unittest discover -s tests/python -v
"""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from azure_docintel_extract import (  # noqa: E402
    AzureExtractionError,
    build_client,
    extract,
    normalize_analyze_result,
    normalize_date,
    normalize_transaction,
)


def currency(amount: float) -> dict:
    return {"type": "currency", "valueCurrency": {"amount": amount, "currencyCode": "USD"}}


def txn(date: str, description: str, deposit=None, withdrawal=None) -> dict:
    fields = {"Date": {"valueDate": date}, "Description": {"valueString": description}}
    if deposit is not None:
        fields["DepositAmount"] = currency(deposit)
    if withdrawal is not None:
        fields["WithdrawalAmount"] = currency(withdrawal)
    return {"valueObject": fields}


def analyze_result() -> dict:
    return {
        "apiVersion": "2024-11-30",
        "pages": [{"pageNumber": 1}, {"pageNumber": 2}],
        "tables": [],
        "documents": [
            {
                "fields": {
                    "BankName": {"valueString": "Wells Fargo"},
                    "AccountHolderName": {"valueString": "ACME LLC"},
                    "StatementStartDate": {"valueDate": "2026-01-01"},
                    "StatementEndDate": {"valueDate": "2026-01-31"},
                    "Accounts": {
                        "valueArray": [
                            {
                                "valueObject": {
                                    "AccountNumber": {"valueString": "1234567890"},
                                    "BeginningBalance": currency(1000.00),
                                    "EndingBalance": currency(1350.25),
                                    "Transactions": {
                                        "valueArray": [
                                            txn("2026-01-05", "CLIENT WIRE IN", deposit=500.00),
                                            txn("2026-01-09", "CHECK 1042", withdrawal=149.75),
                                            # Duplicate of the wire above.
                                            txn("2026-01-05", "CLIENT WIRE IN", deposit=500.00),
                                            # No amount on either side.
                                            txn("2026-01-11", "MEMO ONLY"),
                                        ]
                                    },
                                }
                            }
                        ]
                    },
                }
            }
        ],
    }


class FakePoller:
    def __init__(self, result):
        self._result = result

    def result(self):
        return self._result


class FakeClient:
    def __init__(self, result):
        self._result = result
        self.calls = []

    def begin_analyze_document(self, model_id, body=None):
        self.calls.append((model_id, body))
        return FakePoller(self._result)


class NormalizeAnalyzeResultTest(unittest.TestCase):
    def setUp(self):
        self.result = normalize_analyze_result(analyze_result(), bank="wells")

    def test_emits_pipeline_shape(self):
        self.assertEqual(
            set(self.result),
            {"transactions", "openingBalance", "closingBalance", "metadata"},
        )

    def test_keeps_only_rows_with_an_amount_and_dedupes(self):
        self.assertEqual(
            self.result["transactions"],
            [
                {
                    "date": "2026-01-05",
                    "description": "CLIENT WIRE IN",
                    "amount": 500.0,
                    "type": "CREDIT",
                    "section": "deposits",
                },
                {
                    "date": "2026-01-09",
                    "description": "CHECK 1042",
                    "amount": 149.75,
                    "type": "DEBIT",
                    "section": "withdrawals",
                },
            ],
        )

    def test_amounts_are_positive_with_type_carrying_the_sign(self):
        # The Node normalizer (plumberRowNormalizer) applies the sign.
        for row in self.result["transactions"]:
            self.assertGreater(row["amount"], 0)
            self.assertIn(row["type"], ("CREDIT", "DEBIT"))

    def test_balances_come_from_the_accounts_array(self):
        self.assertEqual(self.result["openingBalance"], 1000.00)
        self.assertEqual(self.result["closingBalance"], 1350.25)

    def test_metadata_matches_sidecar_contract(self):
        metadata = self.result["metadata"]
        self.assertEqual(metadata["engine"], "azure-docintel")
        self.assertEqual(metadata["bank"], "wells")
        self.assertEqual(metadata["pageCount"], 2)
        self.assertEqual(metadata["extractionStrategy"], "azure-prebuilt-bankstatement")
        self.assertEqual(len(metadata["pageTelemetry"]), 2)
        self.assertEqual(
            metadata["pageTelemetry"][0],
            {"page": 1, "rawRows": 0, "strategy": "azure", "tables": 0},
        )

    def test_header_fields_are_preserved(self):
        azure = self.result["metadata"]["azure"]
        self.assertEqual(azure["bankName"], "Wells Fargo")
        self.assertEqual(azure["accountHolderName"], "ACME LLC")
        self.assertEqual(azure["statementStartDate"], "2026-01-01")
        self.assertEqual(azure["statementEndDate"], "2026-01-31")
        self.assertEqual(azure["accounts"][0]["accountNumber"], "1234567890")

    def test_empty_result_is_handled(self):
        empty = normalize_analyze_result({})
        self.assertEqual(empty["transactions"], [])
        self.assertIsNone(empty["openingBalance"])
        self.assertIsNone(empty["closingBalance"])
        self.assertEqual(empty["metadata"]["pageCount"], 0)

    def test_multiple_accounts_are_merged(self):
        payload = analyze_result()
        accounts = payload["documents"][0]["fields"]["Accounts"]["valueArray"]
        accounts.append(
            {
                "valueObject": {
                    "AccountNumber": {"valueString": "999"},
                    "BeginningBalance": currency(200.00),
                    "EndingBalance": currency(250.00),
                    "Transactions": {
                        "valueArray": [txn("2026-01-15", "SAVINGS INTEREST", deposit=50.00)]
                    },
                }
            }
        )
        merged = normalize_analyze_result(payload)
        self.assertEqual(len(merged["transactions"]), 3)
        self.assertEqual(merged["openingBalance"], 1200.00)
        self.assertEqual(merged["closingBalance"], 1600.25)


class NormalizeTransactionTest(unittest.TestCase):
    def test_ambiguous_row_keeps_the_larger_side(self):
        row = normalize_transaction(
            {
                "Date": {"valueDate": "2026-02-01"},
                "Description": {"valueString": "ADJUSTMENT"},
                "DepositAmount": currency(10.00),
                "WithdrawalAmount": currency(90.00),
            }
        )
        self.assertEqual(row["type"], "DEBIT")
        self.assertEqual(row["amount"], 90.00)

    def test_row_above_the_amount_cap_is_dropped(self):
        self.assertIsNone(
            normalize_transaction(
                {
                    "Date": {"valueDate": "2026-02-01"},
                    "Description": {"valueString": "HUGE"},
                    "DepositAmount": currency(250_001.00),
                }
            )
        )

    def test_row_without_a_date_is_dropped(self):
        self.assertIsNone(
            normalize_transaction(
                {"Description": {"valueString": "NO DATE"}, "DepositAmount": currency(5.00)}
            )
        )

    def test_falls_back_to_content_when_typed_value_is_absent(self):
        row = normalize_transaction(
            {
                "Date": {"content": "03/07/2026"},
                "Description": {"content": "ACH CREDIT"},
                "DepositAmount": {"content": "$1,234.56"},
            }
        )
        self.assertEqual(row["date"], "2026-03-07")
        self.assertEqual(row["amount"], 1234.56)


class NormalizeDateTest(unittest.TestCase):
    def test_iso_passthrough(self):
        self.assertEqual(normalize_date("2026-04-02T00:00:00Z"), "2026-04-02")

    def test_two_digit_year(self):
        self.assertEqual(normalize_date("4/2/26"), "2026-04-02")

    def test_yearless_date_stays_month_day(self):
        # Left for the Node normalizer to resolve against the statement year.
        self.assertEqual(normalize_date("4/2"), "04/02")

    def test_unparseable(self):
        self.assertIsNone(normalize_date("not a date"))


class ExtractTest(unittest.TestCase):
    def test_extract_uses_the_prebuilt_bank_statement_model(self):
        client = FakeClient(analyze_result())
        result = extract(__file__, bank="wells", client=client)

        self.assertEqual(client.calls[0][0], "prebuilt-bankStatement.us")
        self.assertEqual(len(result["transactions"]), 2)
        self.assertIn("durationMs", result["metadata"])

    def test_missing_file_raises(self):
        with self.assertRaises(AzureExtractionError):
            extract("does-not-exist.pdf", client=FakeClient(analyze_result()))

    def test_missing_credentials_raise_before_any_network_call(self):
        with self.assertRaises(AzureExtractionError) as ctx:
            build_client(endpoint="", key="")
        self.assertIn("AZURE_DOCINTEL_ENDPOINT", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
