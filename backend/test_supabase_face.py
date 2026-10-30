
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Import FaceNet from AI folder
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "ai"))

from face_matching import compare_faces

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SECRET_KEY")

if not url or not key:
    raise RuntimeError("Supabase credentials missing")

supabase = create_client(url, key)


def find_first_image(bucket, folder=""):
    """Find an image inside a private bucket."""

    items = supabase.storage.from_(bucket).list(
        path=folder
    )

    for item in items:
        name = item["name"]
        path = f"{folder}/{name}" if folder else name

        # Image file
        if name.lower().endswith(
            (".jpg", ".jpeg", ".png", ".webp")
        ):
            return path

        # Folder
        if item.get("id") is None:
            result = find_first_image(bucket, path)

            if result:
                return result

    return None


def download_private_image(bucket, path):
    """Download image bytes without making it public."""

    return supabase.storage.from_(bucket).download(path)


def main():
    missing_bucket = "missing-person-images"
    found_bucket = "found-person-images"

    print("\nFinding Missing Person image...")
    missing_path = find_first_image(missing_bucket)

    print("Finding Found Person image...")
    found_path = find_first_image(found_bucket)

    if not missing_path:
        print("ERROR: Missing Person image not found")
        return

    if not found_path:
        print("ERROR: Found Person image not found")
        return

    print("Missing image found:", missing_path)
    print("Found image found:", found_path)

    print("\nDownloading private images...")

    missing_image = download_private_image(
        missing_bucket,
        missing_path
    )

    found_image = download_private_image(
        found_bucket,
        found_path
    )

    print("Images downloaded successfully!")

    print("\nRunning FaceNet AI Matching...")

    result = compare_faces(
        missing_image,
        found_image
    )

    print("\n===== System RESULT =====")
    print("Cosine Similarity:", result["cosine_similarity"])
    print("Face Score:", result["face_score"])
    print("Note:", result["note"])


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("ERROR:", str(error))
