
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "ai"))

from face_matching import get_face_embedding

import torch.nn.functional as F

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Supabase credentials missing")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_reports(table):
    response = (
        supabase.table(table)
        .select("id,case_number,image_url,status")
        .eq("status", "open")
        .execute()
    )
    return response.data or []


def get_embedding(bucket, image_path):
    image_bytes = (
        supabase.storage
        .from_(bucket)
        .download(image_path)
    )

    return get_face_embedding(image_bytes)


def main():
    missing_reports = get_reports("missing_reports")
    found_reports = get_reports("found_reports")

    print("\n===== REPORT MATCHING =====")
    print("Missing Reports:", len(missing_reports))
    print("Found Reports:", len(found_reports))

    missing_embeddings = []
    found_embeddings = []

    for report in missing_reports:
        if not report.get("image_url"):
            print(
                "Skipping missing report:",
                report["case_number"],
                "- No image path"
            )
            continue

        try:
            embedding = get_embedding(
                "missing-person-images",
                report["image_url"]
            )
            missing_embeddings.append((report, embedding))

            print(
                "Missing image processed:",
                report["case_number"]
            )

        except Exception as error:
            print(
                "Missing image error:",
                report["case_number"],
                str(error)
            )

    for report in found_reports:
        if not report.get("image_url"):
            print(
                "Skipping found report:",
                report["case_number"],
                "- No image path"
            )
            continue

        try:
            embedding = get_embedding(
                "found-person-images",
                report["image_url"]
            )
            found_embeddings.append((report, embedding))

            print(
                "Found image processed:",
                report["case_number"]
            )

        except Exception as error:
            print(
                "Found image error:",
                report["case_number"],
                str(error)
            )

    print("\n===== FACE SIMILARITY RESULTS =====")

    comparisons = 0

    for missing, missing_embedding in missing_embeddings:
        for found, found_embedding in found_embeddings:

            similarity = F.cosine_similarity(
                missing_embedding,
                found_embedding
            ).item()

            print(
                f"{missing['case_number']} <-> "
                f"{found['case_number']} | "
                f"Cosine Similarity: {similarity:.4f}"
            )

            comparisons += 1

    print("\nTotal comparisons:", comparisons)
    print("Note: Similarity is not identity verification.")


if __name__ == "__main__":
    main()
