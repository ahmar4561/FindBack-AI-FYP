"""Automatic matching when a report is submitted."""

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from review_routes import db, get_current_user
from matching_engine import match_single


logger = logging.getLogger("findback.reports")

router = APIRouter(
    prefix="/reports",
    tags=["Report Matching"]
)


def _run(kind: str, report: dict):
    try:
        summary = match_single(kind, report)

        logger.info(
            "Auto-match for %s: %s",
            report.get("case_number"),
            summary
        )

    except Exception:
        logger.exception(
            "Automatic matching failed"
        )


@router.post("/{kind}/{report_id}/auto-match")
def auto_match(
    kind: Literal["missing", "found"],
    report_id: UUID,
    background: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """
    Automatically match a newly submitted report.

    Only the owner of the report can trigger matching.
    Candidate information is never returned to the reporter.
    All potential matches require human verification.
    """

    table = (
        "missing_reports"
        if kind == "missing"
        else "found_reports"
    )

    result = (
        db.table(table)
        .select("*")
        .eq("id", str(report_id))
        .eq("reporter_id", user["user_id"])
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="Report not found"
        )

    report = result.data[0]

    if report.get("status") != "open":
        return {
            "status": "ignored",
            "message": "Report is not open for matching"
        }

    background.add_task(
        _run,
        kind,
        report
    )

    return {
        "status": "accepted",
        "message": (
            "Report received. Candidate matches "
            "are reviewed by authorized staff."
        ),
    }