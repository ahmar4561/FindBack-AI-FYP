
import io
import torch
import torch.nn.functional as F
from PIL import Image, UnidentifiedImageError
from facenet_pytorch import MTCNN, InceptionResnetV1

device = torch.device("cpu")

mtcnn = MTCNN(
    image_size=160,
    margin=20,
    keep_all=False,
    device=device
)

model = InceptionResnetV1(
    pretrained="vggface2"
).eval().to(device)


def get_face_embedding(image_source):
    """
    Accepts:
    - Local image file path
    - Image bytes downloaded from Supabase
    - PIL Image
    """

    if isinstance(image_source, bytes):
        image = Image.open(
            io.BytesIO(image_source)
        ).convert("RGB")

    elif isinstance(image_source, Image.Image):
        image = image_source.convert("RGB")

    else:
        image = Image.open(
            image_source
        ).convert("RGB")

    face = mtcnn(image)

    if face is None:
        raise ValueError("No face detected in the supplied image.")

    with torch.no_grad():
        embedding = model(
            face.unsqueeze(0).to(device)
        )

    return F.normalize(
        embedding,
        p=2,
        dim=1
    )


def compare_faces(image_source_1, image_source_2):
    embedding_1 = get_face_embedding(image_source_1)
    embedding_2 = get_face_embedding(image_source_2)

    similarity = F.cosine_similarity(
        embedding_1,
        embedding_2
    ).item()

    return {
        "cosine_similarity": round(similarity, 4),
        "face_score": round(similarity * 100, 2),
        "note": "Similarity is not identity verification."
    }
