FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TORCH_HOME=/app/.cache/torch

WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
# CPU wheels avoid unnecessary CUDA libraries in a web server image.
RUN pip install torch==2.2.2 torchvision==0.17.2 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r /app/backend/requirements.txt

COPY backend /app/backend
COPY ai /app/ai
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
