import unittest

from app.main import ledger_postings


def signed_total(entries: list[tuple[str, str, int]]) -> int:
    return sum(amount if direction == "debit" else -amount for _, direction, amount in entries)


class AccountingTests(unittest.TestCase):
    def test_payment_is_balanced_and_uses_integer_floor_for_fee(self) -> None:
        entries = ledger_postings(1999, "creator-1", "payment", 1000)
        self.assertEqual(signed_total(entries), 0)
        self.assertIn(("platform:commission_revenue", "credit", 199), entries)
        self.assertIn(("creator_payable:creator-1", "credit", 1800), entries)

    def test_refund_exactly_reverses_payment(self) -> None:
        payment = ledger_postings(1999, "creator-1", "payment", 1000)
        refund = ledger_postings(1999, "creator-1", "refund", 1000)
        net: dict[str, int] = {}
        for account, direction, amount in payment + refund:
            net[account] = net.get(account, 0) + (amount if direction == "debit" else -amount)
        self.assertEqual(net, {"cash:clearing": 0, "creator_payable:creator-1": 0, "platform:commission_revenue": 0})


if __name__ == "__main__":
    unittest.main()
