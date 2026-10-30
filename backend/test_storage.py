
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SECRET_KEY")

if not url or not key:
    raise RuntimeError("Supabase credentials missing")

supabase = create_client(url, key)

buckets = [
    "missing-person-images",
    "found-person-images"
]

for bucket in buckets:
    print(f"\n===== {bucket} =====")

    try:
        folders = supabase.storage.from_(bucket).list()

        for folder in folders:
            folder_name = folder["name"]

            print("\nFolder:", folder_name)

            files = supabase.storage.from_(bucket).list(
                path=folder_name
            )

            for file in files:
                file_name = file["name"]

                full_path = f"{folder_name}/{file_name}"

                print("Image path:", full_path)

    except Exception as error:
        print("ERROR:", str(error))
