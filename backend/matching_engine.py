"""
Shared matching engine for FindBack AI System.

One place computes face score, attribute score and combined score,
applies thresholds and saves potential matches. Scores are similarity
measures, not probabilities, and never confirm identity.
"""

import os
import sys
import logging
from pathlib import Path

import torch.nn.functional as F

from matching import calculate_attribute_score
from review_routes import db


logger = logging.getLogger("findback.engine")


AI_DIR = Path(__file__).resolve().parent.parent / "ai"

if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))


def _env(name, default):
    return float(os.getenv(name, default))


# Provisional values.
# Final values will be calibrated using the consent-based dataset
# through ai/evaluate.py.
ATTRIBUTE_THRESHOLD = _env("ATTRIBUTE_THRESHOLD", 60)
FACE_THRESHOLD = _env("FACE_THRESHOLD", 55)
COMBINED_THRESHOLD = _env("COMBINED_THRESHOLD", 55)

W_FACE = _env("W_FACE", 0.7)
W_ATTR = _env("W_ATTR", 0.3)


_cache = {}


def combined_score(face, attr):
    if face is None or attr is None:
        return None

    return round(
        W_FACE * face + W_ATTR * attr,
        2
    )


def is_candidate(face, attr, combined):
    return (
        (face is not None and face >= FACE_THRESHOLD)
        or
        (attr is not None and attr >= ATTRIBUTE_THRESHOLD)
        or
        (combined is not None and combined >= COMBINED_THRESHOLD)
    )


def get_embedding(bucket, path):
    key = (bucket, path)

    if key not in _cache:
        from face_matching import get_face_embedding

        image_bytes = db.storage.from_(bucket).download(path)

        _cache[key] = get_face_embedding(image_bytes)

    return _cache[key]


def face_score_of(emb_a, emb_b):
    sim = F.cosine_similarity(
        emb_a,
        emb_b
    ).item()

    return round(
        max(0.0, min(1.0, sim)) * 100,
        2
    )


def save_pair(missing, found, face, attr):
    """
    Save or update a potential match.

    Possible actions:
    created
    updated
    skipped_reviewed
    below_threshold
    """

    existing = (
        db.table("matches")
        .select(
            "id,match_status,face_score,attribute_score"
        )
        .eq(
            "missing_report_id",
            missing["id"]
        )
        .eq(
            "found_report_id",
            found["id"]
        )
        .limit(1)
        .execute()
    )

    if existing.data:
        match = existing.data[0]

        # Never overwrite a match that has already been reviewed.
        if match["match_status"] != "potential":
            return "skipped_reviewed", None

        face_final = (
            face
            if face is not None
            else match.get("face_score")
        )

        attr_final = (
            attr
            if attr is not None
            else match.get("attribute_score")
        )

        result = (
            db.table("matches")
            .update(
                {
                    "face_score": face_final,
                    "attribute_score": attr_final,
                    "combined_score": combined_score(
                        face_final,
                        attr_final
                    ),
                }
            )
            .eq(
                "id",
                match["id"]
            )
            .eq(
                "match_status",
                "potential"
            )
            .execute()
        )

        return (
            "updated"
            if result.data
            else "skipped_reviewed"
        ), match["id"]

    combined = combined_score(
        face,
        attr
    )

    if not is_candidate(
        face,
        attr,
        combined
    ):
        return "below_threshold", None

    result = (
        db.table("matches")
        .insert(
            {
                "missing_report_id": missing["id"],
                "found_report_id": found["id"],
                "face_score": face,
                "attribute_score": attr,
                "combined_score": combined,
                "match_status": "potential",
            }
        )
        .execute()
    )

    if not result.data:
        logger.warning(
            "Match insert returned no data"
        )

        return "below_threshold", None

    return (
        "created",
        str(result.data[0]["id"])
    )


def match_reports(
    missing_reports,
    found_reports,
    use_face=True
):
    summary = {
        "created": 0,
        "updated": 0,
        "skipped_reviewed": 0,
        "below_threshold": 0,
        "images_processed": 0,
        "images_skipped": 0,
        "notifications_sent": 0,
    }

    missing_embeddings = {}
    found_embeddings = {}

    if use_face:
        for reports, bucket, store in (
            (
                missing_reports,
                "missing-person-images",
                missing_embeddings,
            ),
            (
                found_reports,
                "found-person-images",
                found_embeddings,
            ),
        ):
            for report in reports:

                if not report.get("image_url"):
                    summary["images_skipped"] += 1
                    continue

                try:
                    store[report["id"]] = get_embedding(
                        bucket,
                        report["image_url"]
                    )

                    summary["images_processed"] += 1

                except Exception as exc:
                    summary["images_skipped"] += 1

                    logger.exception(
                        "Unable to process image for %s | "
                        "bucket=%s | image_url=%s | error=%s",
                        report.get("case_number"),
                        bucket,
                        report.get("image_url"),
                        exc,
                    )

    for missing in missing_reports:

        for found in found_reports:

            face = None

            if (
                use_face
                and missing["id"] in missing_embeddings
                and found["id"] in found_embeddings
            ):
                face = face_score_of(
                    missing_embeddings[missing["id"]],
                    found_embeddings[found["id"]],
                )

            attr = calculate_attribute_score(
                missing,
                found
            )

            action, match_id = save_pair(
                missing,
                found,
                face,
                attr
            )

            summary[action] += 1

            if action == "created":

                try:
                    from notification_routes import (
                        notify_staff_about_potential_match
                    )

                    summary["notifications_sent"] += (
                        notify_staff_about_potential_match(
                            match_id
                        )
                    )

                except Exception:
                    logger.exception(
                        "Match saved, but notification failed"
                    )

    return summary


def open_reports(table):
    result = (
        db.table(table)
        .select("*")
        .eq("status", "open")
        .execute()
    )

    return result.data or []


def match_single(kind, report):
    """
    Match one newly submitted report against
    all open reports of the opposite type.
    """

    if kind == "missing":
        return match_reports(
            [report],
            open_reports("found_reports")
        )

    return match_reports(
        open_reports("missing_reports"),
        [report]
    )