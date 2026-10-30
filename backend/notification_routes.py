import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from review_routes import db, get_staff, get_current_user


logger = logging.getLogger("findback.notifications")


# =========================================================
# ROUTERS
# =========================================================

# Staff/admin notification routes
router = APIRouter(
    prefix="/admin/notifications",
    tags=["Staff Notifications"],
)

# Normal signed-in reporter/family notification routes
user_router = APIRouter(
    prefix="/notifications",
    tags=["My Notifications"],
)


# =========================================================
# MODELS
# =========================================================

class MarkReadRequest(BaseModel):
    notification_id: UUID


# =========================================================
# COMMON HELPERS
# =========================================================

def notification_error(action: str, error: Exception):
    logger.exception(
        "%s failed: %s",
        action,
        type(error).__name__,
    )

    raise HTTPException(
        status_code=500,
        detail=f"Unable to {action.lower()}",
    )


def create_staff_notification(
    recipient_id: str,
    notification_type: str,
    title: str,
    message: str,
    match_id: str | None = None,
    case_type: str = "demo",
):
    """
    Internal backend notification helper.

    This helper is used for both staff-facing and safe
    reporter-facing notification records.

    Do not include names, photos, addresses, locations,
    CNIC numbers, document contents or other sensitive
    personal information in notification messages.
    """

    if notification_type not in {
        "potential_match",
        "review_updated",
        "match_confirmed",
        "match_rejected",
        "recovery_updated",
    }:
        raise ValueError(
            "Unsupported notification type"
        )

    if case_type not in {
        "demo",
        "real",
    }:
        raise ValueError(
            "Unsupported case type"
        )

    response = (
        db.table("notifications")
        .insert(
            {
                "recipient_id": recipient_id,
                "match_id": match_id,
                "notification_type": notification_type,
                "case_type": case_type,
                "title": title,
                "message": message,
                "is_read": False,
            }
        )
        .execute()
    )

    if not response.data:
        raise RuntimeError(
            "Notification insert returned no data"
        )

    return response.data[0]


# =========================================================
# STAFF NOTIFICATIONS
# =========================================================

@router.get("")
def list_notifications(
    staff: dict = Depends(get_staff),
):
    """
    Return notifications belonging only to the
    authenticated staff member.

    Staff can see internal workflow notifications such as:
    - potential matches
    - review updates
    - confirmations
    - rejections
    - recovery updates
    """

    try:
        response = (
            db.table("notifications")
            .select("*")
            .eq(
                "recipient_id",
                staff["user_id"],
            )
            .order(
                "created_at",
                desc=True,
            )
            .limit(100)
            .execute()
        )

    except Exception as exc:
        notification_error(
            "Load notifications",
            exc,
        )

    notifications = response.data or []

    unread_count = sum(
        1
        for item in notifications
        if not item.get("is_read", False)
    )

    return {
        "status": "success",
        "total": len(notifications),
        "unread_count": unread_count,
        "notifications": notifications,
        "note": (
            "Showing up to 100 recent notifications."
        ),
    }


@router.get("/unread-count")
def get_unread_count(
    staff: dict = Depends(get_staff),
):
    try:
        response = (
            db.table("notifications")
            .select(
                "id",
                count="exact",
                head=True,
            )
            .eq(
                "recipient_id",
                staff["user_id"],
            )
            .eq(
                "is_read",
                False,
            )
            .execute()
        )

    except Exception as exc:
        notification_error(
            "Count unread notifications",
            exc,
        )

    return {
        "status": "success",
        "unread_count": response.count or 0,
    }


@router.post("/mark-read")
def mark_notification_read(
    payload: MarkReadRequest,
    staff: dict = Depends(get_staff),
):
    notification_id = str(
        payload.notification_id
    )

    try:
        existing = (
            db.table("notifications")
            .select("id,is_read")
            .eq(
                "id",
                notification_id,
            )
            .eq(
                "recipient_id",
                staff["user_id"],
            )
            .limit(1)
            .execute()
        )

    except Exception as exc:
        notification_error(
            "Load notification",
            exc,
        )

    if not existing.data:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    if existing.data[0]["is_read"]:
        return {
            "status": "success",
            "message": (
                "Notification already read"
            ),
        }

    try:
        updated = (
            db.table("notifications")
            .update(
                {
                    "is_read": True,
                    "read_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            )
            .eq(
                "id",
                notification_id,
            )
            .eq(
                "recipient_id",
                staff["user_id"],
            )
            .execute()
        )

    except Exception as exc:
        notification_error(
            "Mark notification read",
            exc,
        )

    if not updated.data:
        raise HTTPException(
            status_code=409,
            detail=(
                "Notification could not be updated"
            ),
        )

    return {
        "status": "success",
        "message": (
            "Notification marked as read"
        ),
    }


@router.post("/mark-all-read")
def mark_all_notifications_read(
    staff: dict = Depends(get_staff),
):
    try:
        response = (
            db.table("notifications")
            .update(
                {
                    "is_read": True,
                    "read_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            )
            .eq(
                "recipient_id",
                staff["user_id"],
            )
            .eq(
                "is_read",
                False,
            )
            .execute()
        )

    except Exception as exc:
        notification_error(
            "Mark all notifications read",
            exc,
        )

    return {
        "status": "success",
        "message": (
            "All notifications marked as read"
        ),
        "updated_count": len(
            response.data or []
        ),
    }


# =========================================================
# POTENTIAL MATCH STAFF NOTIFICATION
# =========================================================

def notify_staff_about_potential_match(
    match_id: str,
) -> int:
    """
    Notify admins/reviewers when AI creates a new
    potential match.

    IMPORTANT:
    Potential-match notifications are STAFF ONLY.

    The normal reporter/family user must not be told
    that AI has found a match before human verification.

    This does NOT mean identity is confirmed.
    """

    sent = 0

    try:
        staff_response = (
            db.table("admin_roles")
            .select("user_id,role")
            .in_(
                "role",
                ["admin", "reviewer"],
            )
            .execute()
        )

        recipients = {
            str(row["user_id"])
            for row in (
                staff_response.data or []
            )
            if row.get("user_id")
        }

        for recipient_id in recipients:

            try:
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
                        "potential_match",
                    )
                    .limit(1)
                    .execute()
                )

                if existing.data:
                    continue

                create_staff_notification(
                    recipient_id=recipient_id,
                    notification_type=(
                        "potential_match"
                    ),
                    title=(
                        "New Potential Match Detected"
                    ),
                    message=(
                        "AI matching identified a "
                        "possible missing/found report "
                        "candidate. Open Match Review "
                        "for human verification. "
                        "Identity is not confirmed."
                    ),
                    match_id=match_id,
                    case_type="demo",
                )

                sent += 1

            except Exception:
                logger.exception(
                    "Unable to notify "
                    "staff recipient"
                )

    except Exception:
        logger.exception(
            "Potential match notification "
            "process failed"
        )

    return sent


# =========================================================
# VERIFIED MATCH REPORTER NOTIFICATION
# =========================================================

def notify_reporter_about_verified_match(
    match_id: str,
    case_type: str = "demo",
) -> int:
    """
    Notify the missing-report owner only AFTER
    an authorized human has confirmed the match.

    No personal details about the found person are
    exposed in this notification.

    Potential or under-review matches must never
    trigger this reporter notification.
    """

    try:
        match = (
            db.table("matches")
            .select(
                "missing_report_id,match_status"
            )
            .eq(
                "id",
                match_id,
            )
            .limit(1)
            .execute()
        )

        if not match.data:
            return 0

        match_row = match.data[0]

        # Safety check:
        # Never notify the reporter unless the match
        # has actually been finalized as confirmed.
        if match_row.get("match_status") != "confirmed":
            logger.warning(
                "Reporter notification blocked for "
                "non-confirmed match %s",
                match_id,
            )
            return 0

        missing_report_id = (
            match_row.get(
                "missing_report_id"
            )
        )

        if not missing_report_id:
            return 0

        report = (
            db.table("missing_reports")
            .select("reporter_id")
            .eq(
                "id",
                missing_report_id,
            )
            .limit(1)
            .execute()
        )

        if not report.data:
            return 0

        recipient = (
            report.data[0].get(
                "reporter_id"
            )
        )

        if not recipient:
            return 0

        recipient = str(recipient)

        # Prevent duplicate confirmation alerts.
        existing = (
            db.table("notifications")
            .select("id")
            .eq(
                "recipient_id",
                recipient,
            )
            .eq(
                "match_id",
                match_id,
            )
            .eq(
                "notification_type",
                "match_confirmed",
            )
            .limit(1)
            .execute()
        )

        if existing.data:
            return 0

        create_staff_notification(
            recipient_id=recipient,
            notification_type="match_confirmed",
            title="Match Confirmation Recorded",
            message=(
                "Authorized staff have completed "
                "human verification for a possible "
                "match related to your report. "
                "Follow the official recovery process "
                "for any next steps. No private details "
                "are shown in this notification."
            ),
            match_id=match_id,
            case_type=case_type,
        )

        return 1

    except Exception:
        logger.exception(
            "Unable to notify reporter "
            "about verified match"
        )

        return 0


# =========================================================
# REPORTER / FAMILY NOTIFICATIONS
# =========================================================

@user_router.get("/mine")
def my_notifications(
    user: dict = Depends(get_current_user),
):
    """
    Return ONLY safe reporter/family-facing notifications
    for the currently signed-in user.

    IMPORTANT:
    The same account may also have an admin/reviewer role.

    Therefore this endpoint deliberately filters out
    internal staff workflow notifications.

    Reporter dashboard can see:
    - confirmed match updates
    - recovery updates

    Reporter dashboard cannot see:
    - potential_match
    - review_updated
    - match_rejected
    """

    try:
        response = (
            db.table("notifications")
            .select(
                "id,"
                "title,"
                "message,"
                "notification_type,"
                "is_read,"
                "created_at"
            )
            .eq(
                "recipient_id",
                user["user_id"],
            )
            .in_(
                "notification_type",
                [
                    "match_confirmed",
                    "recovery_updated",
                ],
            )
            .order(
                "created_at",
                desc=True,
            )
            .limit(50)
            .execute()
        )

    except Exception as exc:
        notification_error(
            "Load my notifications",
            exc,
        )

    return {
        "status": "success",
        "notifications": (
            response.data or []
        ),
    }