
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SECRET_KEY")

if not url or not key:
    raise RuntimeError("Supabase credentials missing")

supabase = create_client(url, key)

tables = {
    "missing_reports": "missing-person-images",
    "found_reports": "found-person-images"
}

for table, bucket in tables.items():

    print(f"\n===== {table.upper()} =====")

    try:
        response = (
            supabase.table(table)
            .select("id,case_number,image_url,status")
            .execute()
        )

        reports = response.data or []

        total = len(reports)
        with_images = 0
        without_images = 0

        for report in reports:

            case = report.get("case_number")
            image_path = report.get("image_url")
            status = report.get("status")

            if image_path:
                with_images += 1
                image_status = "IMAGE PATH AVAILABLE"
            else:
                without_images += 1
                image_status = "IMAGE PATH MISSING"

            print(
                f"Case: {case} | "
                f"Status: {status} | "
                f"{image_status}"
            )

        print("\nSUMMARY")
        print("Total reports:", total)
        print("Reports with images:", with_images)
        print("Reports without images:", without_images)

    except Exception as error:
        print("ERROR:", str(error))
