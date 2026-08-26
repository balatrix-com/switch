"""Parse FreeSWITCH mod_json_cdr payloads into a canonical call leg."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import unquote


Direction = Literal["INBOUND", "OUTBOUND"]
LegRole = Literal["A", "B"]


def decoded(value: Any) -> str | None:
    if value is None:
        return None
    text = unquote(str(value)).strip()
    return text or None


def first_value(*values: Any) -> str | None:
    for value in values:
        result = decoded(value)
        if result is not None:
            return result
    return None


def integer(value: Any) -> int | None:
    text = decoded(value)
    if text is None:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def epoch_datetime(value: Any) -> datetime | None:
    epoch = integer(value)
    if not epoch or epoch <= 0:
        return None
    return datetime.fromtimestamp(epoch, tz=timezone.utc)


def normalize_direction(value: Any) -> Direction | None:
    text = (decoded(value) or "").upper()
    if text == "INBOUND":
        return "INBOUND"
    if text == "OUTBOUND":
        return "OUTBOUND"
    return None


def caller_profile(payload: dict[str, Any]) -> dict[str, Any]:
    callflow = payload.get("callflow")
    if not isinstance(callflow, list) or not callflow:
        return {}
    entry = callflow[0]
    if not isinstance(entry, dict):
        return {}
    profile = entry.get("caller_profile")
    return profile if isinstance(profile, dict) else {}


@dataclass(slots=True)
class CdrLeg:
    payload: dict[str, Any]
    leg_uuid: str
    session_uuid: str
    leg_role: LegRole
    switch_name: str | None
    core_uuid: str | None
    direction: Direction | None
    direction_source: str | None
    customer_id: str | None
    source_ip: str | None
    source_port: int | None
    caller_number: str | None
    destination_number: str | None
    route_id: str | None
    customer_number_id: str | None
    customer_endpoint_id: str | None
    carrier_id: str | None
    carrier_endpoint_id: str | None
    started_at: datetime | None
    answered_at: datetime | None
    bridged_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int | None
    billsec: int | None
    answered: bool
    hangup_cause: str | None
    hangup_cause_q850: int | None
    sip_hangup_disposition: str | None


def parse_cdr(payload: dict[str, Any], query_uuid: str | None = None) -> CdrLeg:
    if not isinstance(payload, dict):
        raise ValueError("CDR payload must be a JSON object")

    variables = payload.get("variables")
    variables = variables if isinstance(variables, dict) else {}
    channel_data = payload.get("channel_data")
    channel_data = channel_data if isinstance(channel_data, dict) else {}
    profile = caller_profile(payload)

    leg_uuid = first_value(variables.get("uuid"), profile.get("uuid"), query_uuid)
    if not leg_uuid:
        raise ValueError("CDR does not contain a leg UUID")

    originator_uuid = first_value(
        variables.get("originating_leg_uuid"),
        variables.get("originator"),
    )
    leg_role: LegRole = "B" if originator_uuid and originator_uuid != leg_uuid else "A"
    if leg_role == "A" and (decoded(channel_data.get("direction")) or "").lower() == "outbound":
        # An originated channel without an explicit originator field is still a B-leg.
        leg_role = "B"

    explicit_session = first_value(variables.get("billing_session_id"))
    if explicit_session:
        session_uuid = explicit_session
    elif leg_role == "B":
        session_uuid = first_value(
            originator_uuid,
            variables.get("call_uuid"),
            variables.get("signal_bond"),
        ) or leg_uuid
    else:
        session_uuid = leg_uuid

    direction_candidates = (
        ("billing_direction", variables.get("billing_direction")),
        ("X-Call-Direction", variables.get("sip_h_X-Call-Direction")),
        ("X-Call-Direction", variables.get("variable_sip_h_X-Call-Direction")),
    )
    direction: Direction | None = None
    direction_source: str | None = None
    for source, candidate in direction_candidates:
        direction = normalize_direction(candidate)
        if direction:
            direction_source = source
            break

    caller_number = first_value(
        variables.get("effective_caller_id_number"),
        variables.get("caller_id_number"),
        variables.get("sip_from_user"),
        profile.get("caller_id_number"),
        profile.get("ani"),
    )
    destination_number = first_value(
        variables.get("billing_normalized_number"),
        variables.get("sip_to_user"),
        profile.get("destination_number"),
    )

    billsec = integer(variables.get("billsec"))
    answered_at = epoch_datetime(variables.get("answer_epoch"))
    answered = bool(
        answered_at
        or (billsec is not None and billsec > 0)
        or (decoded(variables.get("endpoint_disposition")) or "").upper() == "ANSWER"
    )

    return CdrLeg(
        payload=payload,
        leg_uuid=leg_uuid,
        session_uuid=session_uuid,
        leg_role=leg_role,
        switch_name=decoded(payload.get("switchname")),
        core_uuid=decoded(payload.get("core-uuid")),
        direction=direction,
        direction_source=direction_source,
        customer_id=decoded(variables.get("billing_customer_id")),
        source_ip=first_value(
            variables.get("sip_h_X-Source-IP"),
            variables.get("variable_sip_h_X-Source-IP"),
            profile.get("network_addr"),
        ),
        source_port=integer(
            first_value(
                variables.get("sip_h_X-Source-Port"),
                variables.get("variable_sip_h_X-Source-Port"),
            )
        ),
        caller_number=caller_number,
        destination_number=destination_number,
        route_id=decoded(variables.get("billing_route_id")),
        customer_number_id=decoded(variables.get("billing_customer_number_id")),
        customer_endpoint_id=decoded(variables.get("billing_customer_endpoint_id")),
        carrier_id=decoded(variables.get("billing_carrier_id")),
        carrier_endpoint_id=decoded(variables.get("billing_carrier_endpoint_id")),
        started_at=epoch_datetime(variables.get("start_epoch")),
        answered_at=answered_at,
        bridged_at=epoch_datetime(variables.get("bridge_epoch")),
        ended_at=epoch_datetime(variables.get("end_epoch")),
        duration_seconds=integer(variables.get("duration")),
        billsec=billsec,
        answered=answered,
        hangup_cause=decoded(variables.get("hangup_cause")),
        hangup_cause_q850=integer(variables.get("hangup_cause_q850")),
        sip_hangup_disposition=decoded(variables.get("sip_hangup_disposition")),
    )

