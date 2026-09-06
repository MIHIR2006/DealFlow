FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install dependencies first for layer caching
COPY python_services/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY python_services/ .

EXPOSE 8001 8002

CMD ["python", "runner.py"]
