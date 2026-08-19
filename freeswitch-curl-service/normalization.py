"""Normalization operations shared by the standalone XML lookup service."""

from __future__ import annotations

import re
from typing import Any


def apply_steps(raw: str, steps: list[dict[str, Any]] | None = None) -> str:
    value = raw
    for step in steps or []:
        operation = step.get("operation")
        if operation == "TRIM":
            value = value.strip()
        elif operation == "DIGITS_ONLY":
            value = re.sub(r"\D", "", value)
        elif operation == "STRIP_PLUS":
            value = value[1:] if value.startswith("+") else value
        elif operation == "ENSURE_PLUS":
            value = value if value.startswith("+") else f"+{value}"
        elif operation == "STRIP_PREFIX":
            prefix = str(step.get("value") or "")
            value = value[len(prefix) :] if prefix and value.startswith(prefix) else value
        elif operation == "ADD_PREFIX":
            value = f"{step.get('value') or ''}{value}"
        elif operation == "STRIP_LEADING_ONE":
            value = value[1:] if len(value) == 11 and value.startswith("1") else value
        elif operation == "ENSURE_LEADING_ONE":
            value = value if value.startswith("1") else f"1{value}"
        elif operation == "REGEX_REPLACE":
            pattern = step.get("pattern")
            if not pattern:
                raise ValueError("REGEX_REPLACE requires a pattern")
            value = re.sub(str(pattern), str(step.get("replacement") or ""), value)
        else:
            raise ValueError(f"Unsupported normalization operation: {operation}")
    return value


def xml_file_name(direction: str, normalized_number: str) -> str:
    if direction != "inbound" or not re.fullmatch(r"\+?\d{3,39}", normalized_number):
        raise ValueError("Invalid inbound XML lookup key")
    return f"inbound_{normalized_number}.xml"
