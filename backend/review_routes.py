import os
import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from supabase import create_client


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
    raise RuntimeError("Supabase configuration missing")


# Backend-only database client.
# Never expose the secret key in the frontend.
db = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

logger = logging.getLogger("findback.review")

router = APIRouter(
    prefix="/admin",
    tags=["Human Verification"]
)


class ReviewRequest(BaseModel):
    match_id: UUID

    decision: Literal[
        "under_review",
        "confirmed",
        "rejected"
    ]

    notes: str = Field(
        min_length=10,
        max_length=2000
    )

    identity_verification_method: Literal[
        "guardian_and_document",
        "authorized_agency",
        "self_consented_demo"
    ] | None = None

    verification_reference: str | None = Field(
        default=None,
        max_length=200
    )

    @field_validator("notes")
    @classmethod
    def validate_notes(cls, value: str):
        value = value.strip()

        if len(value) < 10:
            raise ValueError(
                "Review notes must contain at least 10 characters"
            )

        return value


# Any authenticated FindBack AI System user.
def get_current_user(
    authorization: str | None = Header(default=None)
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization token required"
        )

    scheme, separator, token = authorization.partition(" ")

    if (
        scheme.lower() != "bearer"
        or not separator
        or not token.strip()
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header"
        )

    try:
        auth_result = db.auth.get_user(token.strip())
        user = auth_result.user

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid session"
            )

    except HTTPException:
        raise

    except Exception:
        logger.exception("Authentication check failed")

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session"
        )

    return {
        "user_id": str(user.id)
    }


# Admin/reviewer authentication.
def get_staff(
    authorization: str | None = Header(default=None)
):
    user_data = get_current_user(authorization)

    try:
        role_result = (
            db.table("admin_roles")
            .select("role")
            .eq("user_id", user_data["user_id"])
            .limit(1)
            .execute()
        )

        role = (
            role_result.data[0]["role"]
            if role_result.data
            else None
        )

    except Exception:
        logger.exception("Staff role check failed")

        raise HTTPException(
            status_code=500,
            detail="Unable to check staff role"
        )

    if role not in ("admin", "reviewer"):
        raise HTTPException(
            status_code=403,
            detail="Staff access required"
        )

    return {
        "user_id": user_data["user_id"],
        "role": role
    }


def create_review_notification(
    recipient_id: str,
    match_id: str,
    decision: str,
    verification_method: str | None
):
    """
    Create an internal staff notification.

    Notification errors must not undo an already-saved review.
    """

    from notification_routes import create_staff_notification

    notification_types = {
        "under_review": "review_updated",
        "confirmed": "match_confirmed",
        "rejected": "match_rejected"
    }

    notification_type = notification_types[decision]

    if decision == "confirmed":
        case_type = (
            "demo"
            if verification_method == "self_consented_demo"
            else "real"
        )
    else:
        case_type = "demo"

    titles = {
        "under_review": "Match Under Review",
        "confirmed": "Match Confirmation Recorded",
        "rejected": "Match Rejected"
    }

    messages = {
        "under_review": (
            "A potential match has been moved to human review. "
            "Open Match Review for details."
        ),
        "confirmed": (
            "A match confirmation record has been saved. "
            "Additional safeguarding checks are required "
            "before any recovery action."
        ),
        "rejected": (
            "A potential match has been rejected after review. "
            "Open Match Review for details."
        )
    }

    if (
        decision == "confirmed"
        and verification_method == "self_consented_demo"
    ):
        messages["confirmed"] = (
            "FYP DEMO ONLY: A self-consented test match "
            "was confirmed for demonstration. "
            "No real-world identity or recovery "
            "authorization is implied."
        )

    return create_staff_notification(
        recipient_id=recipient_id,
        notification_type=notification_type,
        title=titles[decision],
        message=messages[decision],
        match_id=match_id,
        case_type=case_type
    )


@router.post("/review-match")
def review_match(
    payload: ReviewRequest,
    staff: dict = Depends(get_staff)
):
    match_id = str(payload.match_id)
    decision = payload.decision
    notes = payload.notes

    # Step 1: Fetch match.
    try:
        result = (
            db.table("matches")
            .select(
                "id,match_status,reviewed_by"
            )
            .eq("id", match_id)
            .limit(1)
            .execute()
        )

    except Exception:
        logger.exception("Match fetch failed")

        raise HTTPException(
            status_code=500,
            detail="Unable to load match"
        )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Match not found"
        )

    match = result.data[0]
    current_status = match["match_status"]

    # Final decisions cannot be overwritten.
    if current_status in ("confirmed", "rejected"):
        raise HTTPException(
            status_code=409,
            detail="This match is already finalized"
        )

    now = datetime.now(timezone.utc).isoformat()

    update_data = {
        "match_status": decision,
        "review_notes": notes,
        "reviewed_by": staff["user_id"],
        "reviewed_at": now
    }

    # Confirmation requires admin + independent verification record.
    if decision == "confirmed":

        if staff["role"] != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only an admin can confirm identity"
            )

        if current_status != "under_review":
            raise HTTPException(
                status_code=400,
                detail="Move match to Under Review first"
            )

        if not payload.identity_verification_method:
            raise HTTPException(
                status_code=422,
                detail="Identity verification method required"
            )

        reference = (
            payload.verification_reference or ""
        ).strip()

        if len(reference) < 5:
            raise HTTPException(
                status_code=422,
                detail="Verification reference required"
            )

        update_data.update({
            "identity_verification_method":
                payload.identity_verification_method,
            "identity_verified_by":
                staff["user_id"],
            "identity_verified_at":
                now
        })

        update_data["review_notes"] = (
            f"{notes}\n"
            f"Verification reference: {reference}"
        )

    # Save review safely.
    try:
        response = (
            db.table("matches")
            .update(update_data)
            .eq("id", match_id)
            .in_(
                "match_status",
                ["under_review"]
                if decision == "confirmed"
                else ["potential", "under_review"]
            )
            .execute()
        )

    except Exception:
        logger.exception("Match review update failed")

        raise HTTPException(
            status_code=500,
            detail="Unable to save review"
        )

    if not response.data:
        raise HTTPException(
            status_code=409,
            detail="Match changed. Refresh and retry."
        )

    # Internal staff notification.
    try:
        create_review_notification(
            recipient_id=staff["user_id"],
            match_id=match_id,
            decision=decision,
            verification_method=(
                payload.identity_verification_method
                if decision == "confirmed"
                else None
            )
        )

    except Exception:
        logger.exception(
            "Review saved, but staff notification failed"
        )

    # Notify the reporting family only after confirmation.
    if decision == "confirmed":
        try:
            from notification_routes import (
                notify_reporter_about_verified_match
            )

            notify_reporter_about_verified_match(
                match_id,
                (
                    "demo"
                    if payload.identity_verification_method
                    == "self_consented_demo"
                    else "real"
                )
            )

        except Exception:
            logger.exception(
                "Review saved, but reporter notification failed"
            )

    return {
        "status": "success",
        "message": "Review saved successfully",
        "match_id": match_id,
        "decision": decision,
        "reviewed_by": staff["user_id"],
        "reviewed_at": now,
        "recovery_status": (
            "pending_separate_safeguarding_review"
            if decision == "confirmed"
            else None
        )
    }