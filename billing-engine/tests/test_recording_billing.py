import pytest
from decimal import Decimal
from datetime import datetime, date, timedelta
from recording_billing import billed_seconds, run_recording_billing

def test_billed_seconds():
    # 0 seconds
    assert billed_seconds(0, 60, 60) == 0
    # under initial
    assert billed_seconds(30, 60, 60) == 60
    # exact initial
    assert billed_seconds(60, 60, 60) == 60
    # over initial
    assert billed_seconds(61, 60, 60) == 120
    assert billed_seconds(119, 60, 60) == 120
    assert billed_seconds(120, 60, 60) == 120
    assert billed_seconds(121, 60, 60) == 180
