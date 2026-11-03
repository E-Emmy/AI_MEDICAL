"""Hugging Face Space entry point: Gradio on ZeroGPU hardware.

ZeroGPU (the free GPU option on Spaces) only runs Gradio Spaces, so this serves the same tests as
server.py through a Gradio API instead of plain HTTP. The Next.js app calls it with @gradio/client
when MODEL_SPACE is set; see docs/DEPLOYMENT.md.

  analyze(image, test_id, secret) -> {"status": ..., "body": ...}, the same as POST /tests/<test_id>
  tests(secret)                   -> {"status": ..., "body": ...}, the same as GET /tests
"""
import hmac
import os

# ZeroGPU emulates CUDA outside @spaces.GPU functions, so models are placed on "cuda" at startup.
os.environ.setdefault("DEVICE", "cuda")

import gradio as gr
import spaces
from PIL import Image, UnidentifiedImageError

import server

# Models load once at startup, before any request; loading inside a GPU call would repeat it every time.
server._preload()


def _allowed(secret):
    return not server.SECRET or hmac.compare_digest(secret or "", server.SECRET)


@spaces.GPU(duration=60)
def _run(test_id, image):
    return server.run_matching(image) if test_id == "auto" else server.run_test(test_id, image)


def analyze(image, test_id, secret):
    if not _allowed(secret):
        return {"status": 401, "body": {"error": "Missing or wrong secret."}}
    if test_id != "auto" and test_id not in server.TESTS:
        return {"status": 404, "body": {"error": "Unknown test."}}
    if not image or not 0 < os.path.getsize(image) <= server.MAX_BYTES:
        return {"status": 400, "body": {"error": "Send one image of up to 25 MB."}}
    try:
        img = Image.open(image).convert("RGB")
    except UnidentifiedImageError:
        return {"status": 400, "body": {"error": "The file isn't an image this server can read."}}
    try:
        status, body = _run(test_id, img)
    except Exception as e:  # includes running out of daily ZeroGPU quota
        return {"status": 500, "body": {"error": f"The model failed: {e}"}}
    return {"status": status, "body": body}


def tests(secret):
    if not _allowed(secret):
        return {"status": 401, "body": {"error": "Missing or wrong secret."}}
    return {"status": 200, "body": server.list_tests()}


with gr.Blocks(title="ScanLens model server") as demo:
    gr.Markdown("# ScanLens model server\nUsed by the ScanLens app. Requests need the server secret.")
    # A file, not gr.Image, so the scan reaches the models byte for byte without being re-encoded.
    # No file_types: the app uploads a blob without a file name, and analyze() checks it is an image.
    image = gr.File(label="Scan image", type="filepath")
    test_id = gr.Dropdown(["auto", *server.TESTS], value="auto", label="Test")
    secret = gr.Textbox(label="Secret", type="password")
    with gr.Row():
        run_button = gr.Button("Analyse", variant="primary")
        tests_button = gr.Button("List tests")
    out = gr.JSON(label="Result")
    run_button.click(analyze, [image, test_id, secret], out, api_name="analyze")
    tests_button.click(tests, [secret], out, api_name="tests")

if __name__ == "__main__":
    demo.queue().launch(max_file_size="25mb")
