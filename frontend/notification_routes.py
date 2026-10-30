
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from review_routes import db, get_staff


logger = logging.getLogger("findback.notifications")

router = APIRouter(
    prefix="/admin/notifications",
    tags=["Staff Notifications"]
)


class MarkReadRequest(BaseModel):
    notification_id: UUID


def notification_error(action: str, error: Exception):
    logger.exception(
        "%s failed: %s",
        action,
        type(error).__name__
    )
    raise HTTPException(
        status_code=500,
        detail=f"Unable to {action.lower()}"
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
    Internal backend helper.

    Never expose this function as a public endpoint.
    Do not include names, photos, addresses or other
    sensitive person information in notifications.
    """

    if notification_type not in {
        "potential_match",
        "review_updated",
        "match_confirmed",
        "match_rejected",
        "recovery_updated",
    }:
        raise ValueError("Unsupported notification type")

    if case_type not in {"demo", "real"}:
        raise ValueError("Unsupported case type")

    response = (
        db.table("notifications")
        .insert({
            "recipient_id": recipient_id,
            "match_id": match_id,
            "notification_type": notification_type,
            "case_type": case_type,
            "title": title,
            "message": message,
            "is_read": False,
        })
        .execute()
    )

    if not response.data:
        raise RuntimeError("Notification insert returned no data")

    return response.data[0]


@router.get("")
def list_notifications(
    staff: dict = Depends(get_staff)
):
    """
    Return only notifications belonging to
    the authenticated staff member.
    """

    try:
        response = (
            db.table("notifications")
            .select("*")
            .eq("recipient_id", staff["user_id"])
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )

    except Exception as exc:
        notification_error("Load notifications", exc)

    notifications = response.data or []

    unread_count = sum(
        1 for item in notifications
        if not item.get("is_read", False)
    )

    return {
        "status": "success",
        "total": len(notifications),
        "unread_count": unread_count,
        "notifications": notifications,
        "note": "Showing up to 100 recent notifications."
    }


@router.get("/unread-count")
def get_unread_count(
    staff: dict = Depends(get_staff)
):
    try:
        response = (
            db.table("notifications")
            .select("id", count="exact", head=True)
            .eq("recipient_id", staff["user_id"])
            .eq("is_read", False)
            .execute()
        )

    except Exception as exc:
        notification_error("Count unread notifications", exc)

    return {
        "status": "success",
        "unread_count": response.count or 0
    }


@router.post("/mark-read")
def mark_notification_read(
    payload: MarkReadRequest,
    staff: dict = Depends(get_staff)
):
    from datetime import datetime, timezone

    notification_id = str(payload.notification_id)

    try:
        existing = (
            db.table("notifications")
            .select("id,is_read")
            .eq("id", notification_id)
            .eq("recipient_id", staff["user_id"])
            .limit(1)
            .execute()
        )

    except Exception as exc:
        notification_error("Load notification", exc)

    if not existing.data:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    if existing.data[0]["is_read"]:
        return {
            "status": "success",
            "message": "Notification already read"
        }

    try:
        updated = (
            db.table("notifications")
            .update({
                "is_read": True,
                "read_at": datetime.now(
                    timezone.utc
                ).isoformat()
            })
            .eq("id", notification_id)
            .eq("recipient_id", staff["user_id"])
            .execute()
        )

    except Exception as exc:
        notification_error("Mark notification read", exc)

    if not updated.data:
        raise HTTPException(
            status_code=409,
            detail="Notification could not be updated"
        )

    return {
        "status": "success",
        "message": "Notification marked as read"
    }


@router.post("/mark-all-read")
def mark_all_notifications_read(
    staff: dict = Depends(get_staff)
):
    from datetime import datetime, timezone

    try:
        response = (
            db.table("notifications")
            .update({
                "is_read": True,
                "read_at": datetime.now(
                    timezone.utc
                ).isoformat()
            })
            .eq("recipient_id", staff["user_id"])
            .eq("is_read", False)
            .execute()
        )

    except Exception as exc:
        notification_error("Mark all notifications read", exc)

    return {
        "status": "success",
        "message": "All notifications marked as read",
        "updated_count": len(response.data or [])
    }
