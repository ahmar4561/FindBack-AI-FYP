import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from review_routes import db, get_staff


logger = logging.getLogger("findback.recovery")

router = APIRouter(
    prefix="/admin/recovery",
    tags=["Recovery Case Management"],
)


RecoveryStatus = Literal[
    "pending_coordination",
    "agency_contacted",
    "safeguarding_review",
    "resolved",
    "closed_unresolved",
]

CaseType = Literal["demo", "real"]


# =========================================================
# AUTHORIZATION
# =========================================================

def require_admin(
    staff: dict = Depends(get_staff),
):
    if staff["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )

    return staff


# =========================================================
# REQUEST MODELS
# =========================================================

class CreateRecoveryRequest(BaseModel):
    match_id: UUID
    notes: str = Field(
        min_length=10,
        max_length=2000,
    )

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str):
        value = value.strip()

        if len(value) < 10:
            raise ValueError(
                "At least 10 characters required"
            )

        return value


class UpdateRecoveryRequest(BaseModel):
    case_id: UUID
    case_status: RecoveryStatus
    notes: str = Field(
        min_length=10,
        max_length=2000,
    )

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str):
        value = value.strip()

        if len(value) < 10:
            raise ValueError(
                "At least 10 characters required"
            )

        return value


# =========================================================
# COMMON HELPERS
# =========================================================

def utc_now():
    return datetime.now(
        timezone.utc
    ).isoformat()


def database_error(
    action: str,
    error: Exception,
):
    logger.exception(
        "%s failed: %s",
        action,
        type(error).__name__,
    )

    raise HTTPException(
        status_code=500,
        detail=f"Unable to {action.lower()}",
    )


def classify_case_type(
    match: dict,
) -> CaseType:
    """
    Self-consented verification is demo-only.

    Other supported verification methods are
    classified as real workflow records.

    This classification is NOT proof of physical
    recovery or handover authorization.
    """

    method = match.get(
        "identity_verification_method"
    )

    if method == "self_consented_demo":
        return "demo"

    if method in {
        "guardian_and_document",
        "authorized_agency",
    }:
        return "real"

    raise HTTPException(
        status_code=409,
        detail=(
            "Unsupported identity verification method"
        ),
    )


# =========================================================
# REPORTER RECOVERY NOTIFICATION
# =========================================================

def notify_reporter_about_recovery_update(
    recovery_case: dict,
    new_status: str,
) -> int:
    """
    Notify the missing-report owner when an authorized
    admin changes the recovery coordination status.

    Internal notes, locations, names, document details
    and other sensitive information are NOT included.

    This is a workflow/status notification only.
    """

    try:
        match_id = recovery_case.get(
            "match_id"
        )

        if not match_id:
            return 0

        match_result = (
            db.table("matches")
            .select(
                "id,missing_report_id,match_status"
            )
            .eq(
                "id",
                match_id,
            )
            .limit(1)
            .execute()
        )

        if not match_result.data:
            return 0

        match = match_result.data[0]

        # Recovery notifications should only exist
        # for a human-confirmed match.
        if match.get("match_status") != "confirmed":
            logger.warning(
                "Recovery notification blocked for "
                "non-confirmed match %s",
                match_id,
            )
            return 0

        missing_report_id = match.get(
            "missing_report_id"
        )

        if not missing_report_id:
            return 0

        report_result = (
            db.table("missing_reports")
            .select("reporter_id")
            .eq(
                "id",
                missing_report_id,
            )
            .limit(1)
            .execute()
        )

        if not report_result.data:
            return 0

        recipient_id = (
            report_result.data[0].get(
                "reporter_id"
            )
        )

        if not recipient_id:
            return 0

        recipient_id = str(
            recipient_id
        )

        case_type = recovery_case.get(
            "case_type",
            "real",
        )

        # Safe user-facing messages.
        # Never expose admin coordination notes.
        messages = {
            "pending_coordination": (
                "A recovery coordination record has "
                "been opened for your verified case. "
                "This status does not authorize physical "
                "recovery, transfer, or handover."
            ),
            "agency_contacted": (
                "The recovery coordination status for "
                "your verified case has been updated. "
                "Coordination activity has been recorded "
                "by authorized staff."
            ),
            "safeguarding_review": (
                "Your verified case has moved to the "
                "safeguarding review stage. Authorized "
                "staff are reviewing the next safe steps."
            ),
            "closed_unresolved": (
                "The recovery coordination record has "
                "been closed without a verified resolution. "
                "Contact authorized staff if further "
                "assistance is required."
            ),
            "resolved": (
                "The recovery coordination record has "
                "been marked resolved following the "
                "authorized safeguarding process."
            ),
        }

        message = messages.get(
            new_status
        )

        if not message:
            return 0

        if case_type == "demo":
            message = (
                "FYP DEMO ONLY: "
                + message
                + " No real-world recovery or handover "
                "authorization is implied."
            )

        # Avoid duplicate recovery notifications
        # for the same match + exact status message.
        existing = (
            db.table("notifications")
            .select("id")
            .eq(
                "recipient_id",
                recipient_id,
            )
            .eq(
                "match_id",
                match_id,
            )
            .eq(
                "notification_type",
                "recovery_updated",
            )
            .eq(
                "message",
                message,
            )
            .limit(1)
            .execute()
        )

        if existing.data:
            return 0

        from notification_routes import (
            create_staff_notification,
        )

        create_staff_notification(
            recipient_id=recipient_id,
            notification_type=(
                "recovery_updated"
            ),
            title=(
                "Recovery Coordination Update"
            ),
            message=message,
            match_id=match_id,
            case_type=case_type,
        )

        return 1

    except Exception:
        logger.exception(
            "Unable to notify reporter about "
            "recovery update"
        )

        return 0


# =========================================================
# CREATE RECOVERY CASE
# =========================================================

@router.post("/create")
def create_recovery_case(
    payload: CreateRecoveryRequest,
    admin: dict = Depends(require_admin),
):
    match_id = str(
        payload.match_id
    )

    try:
        result = (
            db.table("matches")
            .select(
                "id,"
                "match_status,"
                "identity_verified_at,"
                "identity_verified_by,"
                "identity_verification_method"
            )
            .eq(
                "id",
                match_id,
            )
            .limit(1)
            .execute()
        )

    except Exception as exc:
        database_error(
            "Load match",
            exc,
        )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Match not found",
        )

    match = result.data[0]

    if (
        match["match_status"] != "confirmed"
        or not match.get(
            "identity_verified_at"
        )
        or not match.get(
            "identity_verified_by"
        )
        or not match.get(
            "identity_verification_method"
        )
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Match must have a completed "
                "verification record before "
                "coordination can be opened."
            ),
        )

    case_type = classify_case_type(
        match
    )

    try:
        existing = (
            db.table("recovery_cases")
            .select("id")
            .eq(
                "match_id",
                match_id,
            )
            .limit(1)
            .execute()
        )

    except Exception as exc:
        database_error(
            "Check recovery case",
            exc,
        )

    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=(
                "Recovery case already exists "
                "for this match"
            ),
        )

    try:
        response = (
            db.table("recovery_cases")
            .insert(
                {
                    "match_id": match_id,
                    "case_type": case_type,
                    "case_status": (
                        "pending_coordination"
                    ),
                    "assigned_staff_id": (
                        admin["user_id"]
                    ),
                    "coordination_notes": (
                        payload.notes
                    ),
                }
            )
            .execute()
        )

    except Exception:
        logger.exception(
            "Recovery creation failed"
        )

        raise HTTPException(
            status_code=409,
            detail=(
                "Could not create recovery case. "
                "Check for an existing case or "
                "database error."
            ),
        )

    if not response.data:
        raise HTTPException(
            status_code=500,
            detail=(
                "Recovery case was not returned"
            ),
        )

    case = response.data[0]

    try:
        db.table(
            "recovery_case_events"
        ).insert(
            {
                "recovery_case_id": case["id"],
                "performed_by": admin["user_id"],
                "previous_status": None,
                "new_status": (
                    "pending_coordination"
                ),
                "notes": payload.notes,
            }
        ).execute()

    except Exception:
        logger.exception(
            "Initial audit event failed"
        )

        try:
            (
                db.table("recovery_cases")
                .delete()
                .eq(
                    "id",
                    case["id"],
                )
                .execute()
            )

        except Exception:
            logger.exception(
                "Recovery rollback failed"
            )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to complete audited case "
                "creation. Check case state before "
                "retrying."
            ),
        )

    # Notify reporter safely after successful,
    # audited case creation.
    notification_sent = (
        notify_reporter_about_recovery_update(
            case,
            "pending_coordination",
        )
    )

    return {
        "status": "success",
        "message": (
            "Demo recovery case created"
            if case_type == "demo"
            else (
                "Recovery coordination case created"
            )
        ),
        "case": case,
        "case_type": case_type,
        "reporter_notification_sent": (
            notification_sent
        ),
        "note": (
            "This is a DEMO tracking record only."
            if case_type == "demo"
            else (
                "This is a coordination record only. "
                "It does not authorize physical "
                "recovery or handover."
            )
        ),
    }


# =========================================================
# LIST RECOVERY CASES
# =========================================================

@router.get("/cases")
def list_recovery_cases(
    admin: dict = Depends(require_admin),
):
    try:
        response = (
            db.table("recovery_cases")
            .select("*")
            .order(
                "created_at",
                desc=True,
            )
            .execute()
        )

    except Exception as exc:
        database_error(
            "List recovery cases",
            exc,
        )

    cases = response.data or []

    demo_cases = [
        case
        for case in cases
        if case.get("case_type") == "demo"
    ]

    real_cases = [
        case
        for case in cases
        if case.get("case_type") == "real"
    ]

    return {
        "status": "success",
        "total": len(cases),
        "demo_total": len(demo_cases),
        "real_total": len(real_cases),
        "cases": cases,
    }


# =========================================================
# RECOVERY CASE HISTORY
# =========================================================

@router.get("/cases/{case_id}/history")
def recovery_case_history(
    case_id: UUID,
    admin: dict = Depends(require_admin),
):
    try:
        case_result = (
            db.table("recovery_cases")
            .select("id")
            .eq(
                "id",
                str(case_id),
            )
            .limit(1)
            .execute()
        )

        if not case_result.data:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Recovery case not found"
                ),
            )

        response = (
            db.table(
                "recovery_case_events"
            )
            .select("*")
            .eq(
                "recovery_case_id",
                str(case_id),
            )
            .order(
                "created_at",
                desc=True,
            )
            .execute()
        )

    except HTTPException:
        raise

    except Exception as exc:
        database_error(
            "Load recovery history",
            exc,
        )

    return {
        "status": "success",
        "events": response.data or [],
    }


# =========================================================
# ALLOWED STATUS TRANSITIONS
# =========================================================

ALLOWED_TRANSITIONS = {
    "pending_coordination": {
        "agency_contacted",
        "closed_unresolved",
    },
    "agency_contacted": {
        "safeguarding_review",
        "closed_unresolved",
    },
    "safeguarding_review": {
        "resolved",
        "closed_unresolved",
    },
    "resolved": set(),
    "closed_unresolved": set(),
}


# =========================================================
# UPDATE RECOVERY CASE
# =========================================================

@router.post("/update")
def update_recovery_case(
    payload: UpdateRecoveryRequest,
    admin: dict = Depends(require_admin),
):
    case_id = str(
        payload.case_id
    )

    try:
        response = (
            db.table("recovery_cases")
            .select("*")
            .eq(
                "id",
                case_id,
            )
            .limit(1)
            .execute()
        )

    except Exception as exc:
        database_error(
            "Load recovery case",
            exc,
        )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Recovery case not found",
        )

    case = response.data[0]

    previous = case["case_status"]
    target = payload.case_status

    case_type = case.get(
        "case_type",
        "real",
    )

    if target not in ALLOWED_TRANSITIONS.get(
        previous,
        set(),
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Invalid status transition: "
                f"{previous} to {target}"
            ),
        )

    # Neither demo nor real records can currently
    # be marked resolved until an authorized
    # safeguarding/handover procedure exists.
    if target == "resolved":
        raise HTTPException(
            status_code=409,
            detail=(
                "Resolution is disabled until an "
                "authorized safeguarding and handover "
                "verification procedure is implemented."
            ),
        )

    update_data = {
        "case_status": target,
        "coordination_notes": (
            payload.notes
        ),
        "updated_at": utc_now(),
    }

    if target == "closed_unresolved":
        update_data["resolution_notes"] = (
            payload.notes
        )

    try:
        updated = (
            db.table("recovery_cases")
            .update(
                update_data
            )
            .eq(
                "id",
                case_id,
            )
            .eq(
                "case_status",
                previous,
            )
            .execute()
        )

    except Exception as exc:
        database_error(
            "Update recovery case",
            exc,
        )

    if not updated.data:
        raise HTTPException(
            status_code=409,
            detail=(
                "Case changed. Refresh and retry."
            ),
        )

    try:
        db.table(
            "recovery_case_events"
        ).insert(
            {
                "recovery_case_id": case_id,
                "performed_by": (
                    admin["user_id"]
                ),
                "previous_status": previous,
                "new_status": target,
                "notes": payload.notes,
            }
        ).execute()

    except Exception:
        logger.exception(
            "Recovery audit event failed"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Status may have changed but audit "
                "logging failed. Refresh and contact "
                "an administrator."
            ),
        )

    updated_case = updated.data[0]

    # Notify reporter only AFTER both the case update
    # and audit event have succeeded.
    notification_sent = (
        notify_reporter_about_recovery_update(
            updated_case,
            target,
        )
    )

    return {
        "status": "success",
        "message": (
            "Recovery case updated"
        ),
        "case": updated_case,
        "case_type": case_type,
        "reporter_notification_sent": (
            notification_sent
        ),
    }