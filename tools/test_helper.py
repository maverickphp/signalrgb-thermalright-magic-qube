"""Checks the helper's digit masks without touching hardware: python tools/test_helper.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helper"))
from magic_qube_helper import ALWAYS_ON, INDICATORS, lit_mask  # noqa: E402

base = set(ALWAYS_ON)

# "54": tens digit 5 = a c d f g, units digit 4 = b c f g (wire order c d e g b a f, 3 LEDs each).
lit = lit_mask("cpu_temp", 54) - base - set(INDICATORS["cpu_temp"])
tens = {i - 21 for i in lit if 21 <= i < 42}
units = {i for i in lit if i < 21}
seg = lambda s: set(range("cdegbaf".index(s) * 3, "cdegbaf".index(s) * 3 + 3))  # noqa: E731
assert tens == set().union(*map(seg, "acdfg")), tens
assert units == set().union(*map(seg, "bcfg")), units

# Single digit: no leading zero on the tens digit.
assert not any(21 <= i < 42 for i in lit_mask("gpu_load", 7))
# Out of range values clamp to 99; missing values show only the indicator, border and strip.
assert lit_mask("cpu_load", 140) == lit_mask("cpu_load", 99)
assert lit_mask("gpu_temp", None) == base | set(INDICATORS["gpu_temp"])
# Only the active metric's indicator is lit.
assert not set(INDICATORS["gpu_temp"]) & lit_mask("cpu_temp", 54)
print("all helper checks passed")
