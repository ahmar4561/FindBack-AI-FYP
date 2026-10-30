
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SECRET_KEY")

if not url or not key:
    raise RuntimeError("Missing Supabase credentials")

supabase = create_client(url, key)

for table in ["missing_reports", "found_reports"]:
    print(f"\n===== {table.upper()} =====")

    try:
        response = (
            supabase.table(table)
            .select("*")
            .limit(1)
            .execute()
        )

        if not response.data:
            print("No reports found")
            continue

        report = response.data[0]

        print("Available columns:")
        for column in report.keys():
            print("-", column)

        print("\nImage-related fields:")
        for column, value in report.items():
            if any(word in column.lower() for word in [
                "photo", "image", "picture"
            ]):
                print(f"{column}: {value}")

    except Exception as error:
        print("ERROR:", str(error))
