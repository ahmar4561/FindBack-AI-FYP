import logging

from fastapi import APIRouter, Depends, HTTPException

from review_routes import get_staff
from matching_engine import (
    match_reports,
    open_reports,
    FACE_THRESHOLD,
    ATTRIBUTE_THRESHOLD,
    COMBINED_THRESHOLD,
    W_FACE,
    W_ATTR,
)


logger = logging.getLogger("findback.face")

router = APIRouter(
    prefix="/admin",
    tags=["Face Recognition"]
)


def require_admin(
    staff: dict = Depends(get_staff)
):
    if staff["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    return staff


@router.post("/run-face-matching")
def run_face_matching(
    admin: dict = Depends(require_admin)
):
    """
    Admin-only face + attribute matching.

    The system creates potential candidate matches only.
    AI scores are similarities, not identity probabilities.

    Final identity confirmation always requires
    authorized human verification.
    """

    try:
        missing = open_reports(
            "missing_reports"
        )

        found = open_reports(
            "found_reports"
        )

        if not missing or not found:
            return {
                "status": "success",
                "message": "No open reports available",
                "missing_reports": len(missing),
                "found_reports": len(found),
                "created": 0,
                "updated": 0,
                "skipped_reviewed": 0,
                "below_threshold": 0,
                "images_processed": 0,
                "images_skipped": 0,
                "notifications_sent": 0,
            }

        summary = match_reports(
            missing,
            found,
            use_face=True
        )

        return {
            "status": "success",
            "message": (
                "Face and attribute matching completed"
            ),
            "missing_reports": len(missing),
            "found_reports": len(found),
            "images_processed": (
                summary["images_processed"]
            ),
            "images_skipped": (
                summary["images_skipped"]
            ),
            "created": summary["created"],
            "updated": summary["updated"],
            "skipped_reviewed": (
                summary["skipped_reviewed"]
            ),
            "below_threshold": (
                summary["below_threshold"]
            ),
            "notifications_sent": (
                summary["notifications_sent"]
            ),
            "thresholds": {
                "face": FACE_THRESHOLD,
                "attribute": ATTRIBUTE_THRESHOLD,
                "combined": COMBINED_THRESHOLD,
                "weights": {
                    "face": W_FACE,
                    "attribute": W_ATTR,
                },
            },
            "note": (
                "Scores are scaled similarities, "
                "not identity probabilities. "
                "Thresholds and weights are provisional. "
                "All candidates require independent "
                "human verification."
            ),
        }

    except Exception:
        logger.exception(
            "Face matching failed"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Face matching failed. "
                "Check backend logs."
            )
        )