
import os
import sys
from pathlib import Path

import torch.nn.functional as F
from dotenv import load_dotenv
from supabase import create_client

from matching import calculate_attribute_score

load_dotenv()

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "ai"))

from face_matching import get_face_embedding

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SECRET_KEY")

if not url or not key:
    raise RuntimeError("Supabase credentials missing")

supabase = create_client(url, key)


def get_reports(table):
    response = (
        supabase.table(table)
        .select("*")
        .eq("status", "open")
        .execute()
    )
    return response.data or []


def get_embedding(bucket, path):
    image_bytes = (
        supabase.storage
        .from_(bucket)
        .download(path)
    )
    return get_face_embedding(image_bytes)


def main():
    missing_reports = get_reports("missing_reports")
    found_reports = get_reports("found_reports")

    # Generate embeddings once per image
    missing_embeddings = []
    found_embeddings = []

    for report in missing_reports:
        path = report.get("image_url")
        if not path:
            continue

        try:
            embedding = get_embedding(
                "missing-person-images", path
            )
            missing_embeddings.append((report, embedding))
        except Exception as error:
            print("Missing image skipped:", report["case_number"], error)

    for report in found_reports:
        path = report.get("image_url")
        if not path:
            continue

        try:
            embedding = get_embedding(
                "found-person-images", path
            )
            found_embeddings.append((report, embedding))
        except Exception as error:
            print("Found image skipped:", report["case_number"], error)

    created = 0
    updated = 0
    skipped = 0

    for missing, missing_emb in missing_embeddings:
        for found, found_emb in found_embeddings:

            similarity = F.cosine_similarity(
                missing_emb, found_emb
            ).item()

            attribute_score = calculate_attribute_score(
                missing, found
            )

            # Store only non-negative cosine similarity
            # scaled for display. Not a probability.
            face_score = round(
                max(0.0, similarity) * 100, 2
            )

            # No validated combined score yet.
            existing = (
                supabase.table("matches")
                .select("id,match_status")
                .eq("missing_report_id", missing["id"])
                .eq("found_report_id", found["id"])
                .limit(1)
                .execute()
            )

            data = {
                "face_score": face_score,
                "attribute_score": attribute_score,
                "combined_score": None
            }

            if existing.data:
                match = existing.data[0]

                if match["match_status"] != "potential":
                    skipped += 1
                    continue

                (
                    supabase.table("matches")
                    .update(data)
                    .eq("id", match["id"])
                    .eq("match_status", "potential")
                    .execute()
                )
                updated += 1

            else:
                data.update({
                    "missing_report_id": missing["id"],
                    "found_report_id": found["id"],
                    "match_status": "potential"
                })

                supabase.table("matches").insert(data).execute()
                created += 1

            print(
                f"{missing['case_number']} <-> "
                f"{found['case_number']} | "
                f"Face: {face_score:.2f} | "
                f"Attributes: {attribute_score:.2f}"
            )

    print("\n===== SAVE COMPLETE =====")
    print("Created:", created)
    print("Updated:", updated)
    print("Skipped reviewed:", skipped)
    print("Note: No identities have been verified.")


if __name__ == "__main__":
    main()
