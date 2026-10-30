import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client

from recovery_routes import router as recovery_router

from notification_routes import (
    router as notification_router,
    user_router as user_notification_router,
)

from face_routes import router as face_router

from review_routes import (
    router as review_router,
    get_staff,
)

from report_routes import router as report_router

from matching import calculate_attribute_score

from matching_engine import (
    match_reports,
    open_reports,
    ATTRIBUTE_THRESHOLD,
)


# =========================================================
# ENVIRONMENT CONFIGURATION
# =========================================================

load_dotenv()

logger = logging.getLogger("findback")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
    raise RuntimeError(
        "Supabase environment variables are missing."
    )


# Backend-only Supabase client.
# Never expose the secret key to the frontend.
supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="FindBack AI System API",
    description=(
        "Backend API for FindBack AI System - "
        "Missing Person Identification and "
        "Safe Recovery System"
    ),
    version="1.4.0",
)


# =========================================================
# ROUTERS
# =========================================================

app.include_router(review_router)

app.include_router(face_router)

app.include_router(recovery_router)

app.include_router(notification_router)

# Reporter/family notification API.
app.include_router(
    user_notification_router
)

# Automatic report matching API.
app.include_router(
    report_router
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",

        # Add production frontend domain here
        # when the system is deployed.
        # Example:
        # "https://your-domain.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ADMIN AUTHORIZATION
# =========================================================

def require_admin(
    staff: dict = Depends(get_staff),
):
    """
    Reuse Supabase JWT authentication and
    admin_roles validation from review_routes.
    """

    if staff["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )

    return staff


# =========================================================
# BASIC ENDPOINTS
# =========================================================

@app.get("/")
def root():
    return {
        "message": (
            "FindBack AI System Backend is running"
        ),
        "status": "success",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
    }


# =========================================================
# SUPABASE CONNECTION TEST
# ADMIN ONLY
# =========================================================

@app.get("/test-supabase")
def test_supabase(
    admin: dict = Depends(require_admin),
):
    try:
        response = (
            supabase
            .table("missing_reports")
            .select("id,case_number")
            .limit(1)
            .execute()
        )

        return {
            "status": "success",
            "message": (
                "FastAPI successfully connected "
                "to Supabase"
            ),
            "data": response.data,
        }

    except Exception:
        logger.exception(
            "Supabase connection test failed"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Supabase connection test failed"
            ),
        )


# =========================================================
# ATTRIBUTE MATCHING TEST
# ADMIN ONLY
# =========================================================

@app.get("/test-attribute-match")
def test_attribute_match(
    admin: dict = Depends(require_admin),
):
    """
    Development/testing endpoint.

    Compares one missing report with one
    found report using descriptive attributes.
    """

    try:
        missing_response = (
            supabase
            .table("missing_reports")
            .select("*")
            .limit(1)
            .execute()
        )

        found_response = (
            supabase
            .table("found_reports")
            .select("*")
            .limit(1)
            .execute()
        )

        if not missing_response.data:
            return {
                "status": "error",
                "message": (
                    "No missing report found"
                ),
            }

        if not found_response.data:
            return {
                "status": "error",
                "message": (
                    "No found report found"
                ),
            }

        missing = missing_response.data[0]
        found = found_response.data[0]

        attribute_score = (
            calculate_attribute_score(
                missing,
                found,
            )
        )

        return {
            "status": "success",
            "missing_case": (
                missing["case_number"]
            ),
            "found_case": (
                found["case_number"]
            ),
            "attribute_score": (
                attribute_score
            ),
            "note": (
                "Attribute score is a similarity "
                "measure, not identity proof."
            ),
        }

    except Exception:
        logger.exception(
            "Attribute matching test failed"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Attribute matching test failed"
            ),
        )


# =========================================================
# ATTRIBUTE MATCHING ENGINE
# ADMIN ONLY
# =========================================================

@app.post("/run-matching")
def run_matching(
    admin: dict = Depends(require_admin),
):
    """
    Run descriptive-attribute matching across
    all currently open reports.

    Matching logic is centralized inside
    matching_engine.py.

    AI only creates potential candidates.
    Human verification is required.
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
                "message": (
                    "No open reports available "
                    "for matching"
                ),
                "missing_reports": len(missing),
                "found_reports": len(found),
                "matches_created": 0,
                "matches_existing": 0,
                "matches_below_threshold": 0,
                "notifications_sent": 0,
                "attribute_threshold": (
                    ATTRIBUTE_THRESHOLD
                ),
            }

        summary = match_reports(
            missing,
            found,
            use_face=False,
        )

        return {
            "status": "success",
            "message": (
                "Attribute matching completed"
            ),
            "missing_reports": len(missing),
            "found_reports": len(found),

            "matches_created": (
                summary["created"]
            ),

            "matches_existing": (
                summary["updated"]
                + summary["skipped_reviewed"]
            ),

            "matches_below_threshold": (
                summary["below_threshold"]
            ),

            "notifications_sent": (
                summary["notifications_sent"]
            ),

            "attribute_threshold": (
                ATTRIBUTE_THRESHOLD
            ),

            "note": (
                "Matches are potential candidates "
                "only. Scores are similarity "
                "measures, not identity "
                "probabilities. Independent human "
                "verification is required."
            ),
        }

    except Exception:
        logger.exception(
            "Attribute matching engine failed"
        )

        raise HTTPException(
            status_code=500,
            detail="Matching engine failed",
        )