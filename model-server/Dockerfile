# For Hugging Face Spaces (Docker SDK). Spaces runs the container as user 1000 and sends traffic to port 7860.
FROM python:3.11-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    HOST=0.0.0.0 PORT=7860 PYTHONUNBUFFERED=1
WORKDIR /home/user/app

# CPU-only torch first: the default Linux wheel pulls in several GB of CUDA libraries a CPU Space can't use.
RUN pip install --no-cache-dir --user torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user server.py references.json ./

EXPOSE 7860
CMD ["python", "server.py"]
