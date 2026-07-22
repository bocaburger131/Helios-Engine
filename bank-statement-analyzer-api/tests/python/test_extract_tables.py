"""Structural layout-mode / typing-mode regression tests for extract_tables.py.

Run: python -m unittest tests.python.test_extract_tables -v (from bank-statement-analyzer-api/)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import extract_tables as et  # noqa: E402


class LayoutModeFromHeaderTests(unittest.TestCase):
    def test_single_amount_header_is_section_typed(self):
        self.assertEqual(
            et._layout_mode_from_header("date description amount"), "section_typed_3col"
        )

    def test_dual_amount_header_is_dual_amount(self):
        self.assertEqual(
            et._layout_mode_from_header(
                "date description deposits/credits withdrawals/debits ending daily balance"
            ),
            "dual_amount",
        )

    def test_amount_plus_dual_columns_is_dual_amount(self):
        # A header carrying both deposit and withdrawal roles wins over "amount".
        self.assertEqual(
            et._layout_mode_from_header("date amount deposits withdrawals"), "dual_amount"
        )

    def test_default_header_used_when_no_header_text(self):
        self.assertEqual(
            et._layout_mode_from_header(None, ["Date", "Description", "Amount"]),
            "section_typed_3col",
        )
        self.assertEqual(
            et._layout_mode_from_header(None, ["Date", "Deposits", "Withdrawals"]),
            "dual_amount",
        )


class ColumnBreaksTests(unittest.TestCase):
    def test_section_typed_caps_breaks_at_two(self):
        breaks = et._assign_column_breaks_v2(
            [36.0, 90.0, 480.0, 540.0], 612.0, layout_mode="section_typed_3col"
        )
        self.assertEqual(len(breaks), 2)
        self.assertEqual(breaks, [(36.0 + 90.0) / 2, (90.0 + 480.0) / 2])

    def test_dual_amount_uses_all_header_midpoints(self):
        xs = [36.0, 90.0, 300.0, 400.0, 500.0]
        breaks = et._assign_column_breaks_v2(xs, 612.0, layout_mode="dual_amount")
        self.assertEqual(len(breaks), len(xs) - 1)

    def test_section_typed_fallback_without_header_positions(self):
        breaks = et._assign_column_breaks_v2([], 612.0, layout_mode="section_typed_3col")
        self.assertEqual(len(breaks), 2)


class SectionVocabularyTests(unittest.TestCase):
    def test_detect_section_shared_vocabulary(self):
        self.assertEqual(et.detect_section("DEPOSITS AND ADDITIONS"), "deposits")
        self.assertEqual(et.detect_section("Electronic Deposits"), "electronic_deposits")
        self.assertEqual(et.detect_section("Checks Paid"), "checks")
        self.assertEqual(et.detect_section("Electronic Withdrawals"), "electronic_withdrawals")
        self.assertEqual(et.detect_section("Bank Fees"), "fees")
        self.assertIsNone(et.detect_section("regular row text"))

    def test_detect_section_keeps_current_when_no_header(self):
        self.assertEqual(et.detect_section("02/01 Zelle payment 500.00", "deposits"), "deposits")

    def test_txn_type_for_section(self):
        self.assertEqual(et.txn_type_for_section("deposits"), "CREDIT")
        self.assertEqual(et.txn_type_for_section("electronic_deposits"), "CREDIT")
        self.assertEqual(et.txn_type_for_section("checks"), "DEBIT")
        self.assertEqual(et.txn_type_for_section(None), "DEBIT")


class StrictAmountParsingTests(unittest.TestCase):
    def test_strict_rejects_bare_integers(self):
        self.assertIsNone(et.parse_money("1234", strict=True))
        self.assertIsNone(et.parse_money("32", strict=True))
        self.assertIsNone(et.parse_money("4101", strict=True))

    def test_strict_accepts_decimal_amounts(self):
        self.assertEqual(et.parse_money("500.00", strict=True), 500.0)
        self.assertEqual(et.parse_money("$1,234.56", strict=True), 1234.56)
        self.assertEqual(et.parse_money("(87.20)", strict=True), 87.20)

    def test_lenient_still_accepts_integers(self):
        self.assertEqual(et.parse_money("1234"), 1234.0)

    def test_check_number_not_amount(self):
        self.assertFalse(et.looks_like_amount_token("4101"))
        self.assertTrue(et.CHECK_NUMBER_RE.match("4101"))


class SectionTypedAmountPickTests(unittest.TestCase):
    def test_rightmost_amount_skips_check_number(self):
        cells = ["02/03", "4101", "Vendor payment", "100.00"]
        amt, desc = et.pick_section_typed_amount(cells, 0, None, "Vendor payment")
        self.assertEqual(amt, 100.0)
        self.assertIn("4101", desc)

    def test_section_typed_check_row_emits_debit_with_correct_amount(self):
        table = [
            ["Date", "Check", "Description", "Value"],
            ["02/03", "4101", "Vendor payment", "100.00"],
        ]
        rows = et.rows_from_table(table, "checks")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["amount"], 100.0)
        self.assertEqual(rows[0]["type"], "DEBIT")
        self.assertIn("4101", rows[0]["description"])


class HeaderOnlySectionTests(unittest.TestCase):
    def test_transaction_description_does_not_flip_section(self):
        table = [
            ["Date", "Description", "Amount"],
            ["02/01", "Card purchase at store", "50.00"],
            ["02/02", "Recurring subscription", "25.00"],
        ]
        rows = et.rows_from_table(table, "deposits")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["type"], "CREDIT")
        self.assertEqual(rows[1]["type"], "CREDIT")

    def test_section_header_row_updates_section_without_emitting(self):
        table = [
            ["Date", "Description", "Amount"],
            ["Checks Paid", "", ""],
            ["02/03", "4101", "100.00"],
        ]
        rows = et.rows_from_table(table, "deposits")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["type"], "DEBIT")


class _FakeMarkerPage:
    """Minimal pdfplumber page stub for marker-band segmentation tests."""

    def __init__(self, words: list[dict], height: float = 800.0):
        self._words = words
        self.height = height
        self.width = 612.0

    def extract_words(self, **_kwargs):
        return self._words


def _marker_word(text: str, top: float) -> dict:
    return {"text": text, "top": top, "x0": 10.0}


class MarkerSegmentationTests(unittest.TestCase):
    def test_marker_section_id_maps_shared_vocabulary(self):
        self.assertEqual(et.marker_section_id("deposits"), "deposits")
        self.assertEqual(et.marker_section_id("checks"), "checks")
        self.assertEqual(et.marker_section_id("electronicwithdrawals"), "electronic_withdrawals")
        self.assertEqual(et.marker_section_id("atmdebit"), "atm_debit")
        self.assertEqual(et.marker_section_id("fees"), "fees")
        self.assertEqual(et.marker_section_id("otherwithdrawals"), "other_withdrawals")
        self.assertIsNone(et.marker_section_id("summary"))
        self.assertIsNone(et.marker_section_id("disclosures"))

    def test_no_markers_returns_flag_false(self):
        page = _FakeMarkerPage([_marker_word("01/05", 100), _marker_word("500.00", 100)])
        bands, outgoing, has_markers = et.find_marker_bands(page, "deposits")
        self.assertFalse(has_markers)
        self.assertEqual(bands, [])
        self.assertEqual(outgoing, "deposits")

    def test_bands_between_start_and_end_markers(self):
        page = _FakeMarkerPage(
            [
                _marker_word("*start*deposits", 100),
                _marker_word("*end*deposits", 300),
                _marker_word("*start*checks", 320),
                _marker_word("*end*checks", 500),
            ]
        )
        bands, outgoing, has_markers = et.find_marker_bands(page, None)
        self.assertTrue(has_markers)
        self.assertEqual(len(bands), 2)
        self.assertEqual(bands[0], (100.0, 300.0, "deposits"))
        self.assertEqual(bands[1], (320.0, 500.0, "checks"))
        self.assertIsNone(outgoing)

    def test_open_section_carries_to_page_bottom_and_next_page(self):
        page = _FakeMarkerPage([_marker_word("*start*electronicwithdrawals", 200)], height=700)
        bands, outgoing, has_markers = et.find_marker_bands(page, None)
        self.assertTrue(has_markers)
        self.assertEqual(bands, [(200.0, 700.0, "electronic_withdrawals")])
        self.assertEqual(outgoing, "electronic_withdrawals")

    def test_incoming_section_covers_rows_above_first_marker(self):
        page = _FakeMarkerPage([_marker_word("*end*checks", 250)], height=700)
        bands, outgoing, has_markers = et.find_marker_bands(page, "checks")
        self.assertTrue(has_markers)
        self.assertEqual(bands, [(0.0, 250.0, "checks")])
        self.assertIsNone(outgoing)

    def test_summary_marker_span_excluded(self):
        page = _FakeMarkerPage(
            [
                _marker_word("*start*summary", 50),
                _marker_word("*end*summary", 180),
                _marker_word("*start*deposits", 200),
            ],
            height=700,
        )
        bands, outgoing, _has = et.find_marker_bands(page, None)
        self.assertEqual(bands, [(200.0, 700.0, "deposits")])
        self.assertEqual(outgoing, "deposits")


class RowsFromTableTypingTests(unittest.TestCase):
    def test_single_amount_table_types_from_section(self):
        table = [
            ["Date", "Description", "Amount"],
            ["02/01", "Zelle Payment From Client", "500.00"],
        ]
        rows = et.rows_from_table(table, "deposits")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["type"], "CREDIT")

        rows = et.rows_from_table(table, "checks")
        self.assertEqual(rows[0]["type"], "DEBIT")

    def test_dual_column_table_types_from_column(self):
        table = [
            ["Date", "Description", "Deposits/Credits", "Withdrawals/Debits"],
            ["01/05", "Payroll deposit", "300.00", ""],
            ["01/06", "POS debit store", "", "50.00"],
        ]
        rows = et.rows_from_table(table)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["type"], "CREDIT")
        self.assertEqual(rows[1]["type"], "DEBIT")

    def test_header_section_overrides_supplied_section(self):
        table = [
            ["CHECKS PAID", "DATE", "AMOUNT"],
            ["1001", "02/03", "100.00"],
        ]
        rows = et.rows_from_table(table, "deposits")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["type"], "DEBIT")


class RoleHintsTests(unittest.TestCase):
    def test_hints_fill_gaps_only(self):
        roles = {"date": None, "description": 1, "amount": None, "balance": None,
                 "deposits": None, "withdrawals": None}
        hinted = et.apply_role_hints(roles, {"dateIdx": 0, "descIdx": 5, "amountIdx": 2})
        self.assertEqual(hinted["date"], 0)
        self.assertEqual(hinted["amount"], 2)
        # Detected header role is never overridden by a hint.
        self.assertEqual(hinted["description"], 1)

    def test_no_hints_is_noop(self):
        roles = {"date": 0, "description": 1, "amount": 2, "balance": None,
                 "deposits": None, "withdrawals": None}
        self.assertEqual(et.apply_role_hints(roles, None), roles)


class LayoutProfileCliTests(unittest.TestCase):
    def test_all_layout_profiles_registered(self):
        self.assertEqual(
            set(et.LAYOUT_PROFILE_EXTRACTORS),
            {"txn_history_dual_amount", "multi_table_sections", "section_typed_activity", "generic"},
        )

    def test_legacy_bank_slugs_map_to_structural_profiles(self):
        self.assertEqual(et.LEGACY_BANK_TO_LAYOUT_PROFILE["wells"], "txn_history_dual_amount")
        self.assertEqual(et.LEGACY_BANK_TO_LAYOUT_PROFILE["regions"], "multi_table_sections")
        self.assertEqual(et.LEGACY_BANK_TO_LAYOUT_PROFILE["chase"], "section_typed_activity")

    def test_resolve_layout_profile_defaults_to_generic(self):
        # No args at all: structural generic, never a brand-derived layout.
        self.assertEqual(et.resolve_layout_profile(None, None), "generic")
        self.assertEqual(et.resolve_layout_profile("", ""), "generic")
        # Unknown bank slug also lands on generic.
        self.assertEqual(et.resolve_layout_profile(None, "mystery_bank"), "generic")

    def test_resolve_layout_profile_precedence(self):
        # Explicit profile wins over the bank slug.
        self.assertEqual(
            et.resolve_layout_profile("multi_table_sections", "wells"), "multi_table_sections"
        )
        # Legacy slug maps when no profile is given.
        self.assertEqual(et.resolve_layout_profile(None, "wells"), "txn_history_dual_amount")


def _word(text: str, x0: float) -> dict:
    return {"text": text, "x0": x0}


def _sample_rows() -> list[list[dict]]:
    """Synthetic body rows: date at x=10, description at x=60, amount at x=500."""
    return [
        [_word("01/05", 10), _word("ACME", 60), _word("PAYMENT", 120), _word("1,234.56", 500)],
        [_word("01/06", 10), _word("POS", 60), _word("DEBIT", 120), _word("87.20", 500)],
        [_word("01/07", 10), _word("PAYROLL", 60), _word("2,000.00", 500)],
    ]


class FallbackQualityGuardTests(unittest.TestCase):
    # Breaks at [50, 550] shove the x=500 amounts into the description cell (bleed 1.0);
    # breaks at [50, 450] isolate them in their own column (bleed 0.0).
    BAD_BREAKS = [50.0, 550.0]
    GOOD_BREAKS = [50.0, 450.0]

    def test_money_in_desc_ratio_scores_bleed(self):
        rows = _sample_rows()
        self.assertEqual(et._money_in_desc_ratio(rows, self.BAD_BREAKS), 1.0)
        self.assertEqual(et._money_in_desc_ratio(rows, self.GOOD_BREAKS), 0.0)

    def test_money_in_desc_ratio_zero_without_money_tokens(self):
        rows = [[_word("01/05", 10), _word("MEMO ONLY", 60)]]
        self.assertEqual(et._money_in_desc_ratio(rows, self.BAD_BREAKS), 0.0)

    def test_validate_column_breaks_fails_on_bleeding_breaks(self):
        rows = _sample_rows()
        self.assertFalse(et._validate_column_breaks(rows, self.BAD_BREAKS))
        self.assertTrue(et._validate_column_breaks(rows, self.GOOD_BREAKS))

    def test_choose_breaks_adopts_better_fallback(self):
        rows = _sample_rows()
        chosen = et._choose_breaks(rows, self.BAD_BREAKS, self.GOOD_BREAKS)
        self.assertEqual(chosen, self.GOOD_BREAKS)

    def test_choose_breaks_keeps_original_when_fallback_is_worse(self):
        rows = _sample_rows()
        chosen = et._choose_breaks(rows, self.GOOD_BREAKS, self.BAD_BREAKS)
        self.assertEqual(chosen, self.GOOD_BREAKS)

    def test_choose_breaks_keeps_original_on_tie_or_empty_fallback(self):
        rows = _sample_rows()
        self.assertEqual(
            et._choose_breaks(rows, self.GOOD_BREAKS, list(self.GOOD_BREAKS)), self.GOOD_BREAKS
        )
        self.assertEqual(et._choose_breaks(rows, self.BAD_BREAKS, []), self.BAD_BREAKS)


if __name__ == "__main__":
    unittest.main()
