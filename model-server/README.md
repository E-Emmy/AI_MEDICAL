---
title: ScanLens Model Server
emoji: 🩻
colorFrom: blue
colorTo: gray
sdk: gradio
sdk_version: 5.50.0
python_version: "3.10"
app_file: app.py
pinned: false
---

The model server for ScanLens. The header above configures it as a Hugging Face Space
(Gradio on ZeroGPU hardware). To run it as a Docker Space instead, see docs/DEPLOYMENT.md
in the ScanLens repository.

Set these as Space secrets (Settings > Variables and secrets):

- `HF_TOKEN`: a read token from an account that accepted the terms of `google/medsiglip-448`.
- `MODEL_SERVER_SECRET`: a long random string; set the same value in the Next.js app.

Models download and load on startup, which takes a few minutes.
