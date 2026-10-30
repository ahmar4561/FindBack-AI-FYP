from pathlib import Path
from face_matching import compare_faces

BASE_DIR = Path(__file__).resolve().parent

image1 = BASE_DIR / "test_images" / "person1.jpg"
image2 = BASE_DIR / "test_images" / "person2.jpg"

if not image1.exists() or not image2.exists():
    print("ERROR: Test images not found!")
else:
    try:
        result = compare_faces(str(image1), str(image2))

        print("\n===== FindBack AI System Face Matching =====")
        print("Cosine Similarity:", result["cosine_similarity"])
        print("Face Score:", result["face_score"])
        print("Note:", result["note"])

    except Exception as e:
        print("ERROR:", str(e))