# Deploying ScanLens

This covers where each part of ScanLens runs when it's online, what that costs, how to switch to the paid
setup planned for the competition, and what was changed in the code to make deployment possible and why.
Local setup is in the [README](../README.md).

Prices and limits below were checked on **2 November 2026**. Hugging Face changed its free tier in 2026
without much notice, so check the linked pricing pages before relying on them.

## Where each part runs

| Part | Where | Plan | Cost |
|---|---|---|---|
| Web app (Next.js) | Vercel | Hobby | $0 |
| Database, sign-in, image storage | Supabase | Free | $0 |
| Model server (`model-server/`) | Hugging Face Space | **Now:** Gradio on ZeroGPU (free). **Competition:** Docker on CPU (PRO) | $0 now, about $9/month with PRO |

The model server can't run on Vercel: PyTorch and the seven models need several GB of disk and memory,
far beyond Vercel's function size limit, and Vercel functions stop after each request, so the models
would reload every time.

## Two setups for the model server

The same code supports both. Which one the app uses is decided only by environment variables, so
switching doesn't need a code change.

### A. Now: Gradio Space on ZeroGPU (free)

- **Why:** on a free Hugging Face account, Docker Spaces and the CPU Basic hardware are now marked
  "Paid". ZeroGPU, a shared GPU, is the only free option, and it only runs Gradio Spaces.
- **How it runs:** `model-server/app.py` wraps the same functions as `server.py` in a Gradio API. The
  app calls it with the `@gradio/client` package.
- **Limits:**
  - **Daily GPU quota.** Every analysis is charged to the account whose `HF_TOKEN` the app sends.
    A free account gets **5 minutes of GPU time a day**, which resets 24 hours after first use.
    A scan check with one test takes a few seconds on the GPU, so expect roughly 50–100 analyses a day.
    When the quota runs out, analyses fail with a quota message until it resets.
  - **Queue.** Free accounts have medium priority in the shared GPU queue, so there can be a wait.
  - **Eligibility.** Free accounts can host up to 2 ZeroGPU Spaces, and only if the account has a
    verified email and is more than 30 days old.
  - **Sleep.** An unused Space goes to sleep. The first request afterwards waits while it restarts and
    reloads the models, which takes a few minutes, and may fail; retry after it's up.

### B. Competition: Docker Space on CPU (Hugging Face PRO)

- **Why:** no daily quota and no GPU queue, and it runs `server.py` exactly as it runs locally. PRO
  unlocks Docker Spaces and CPU Basic hardware (2 vCPU, 16 GB RAM), enough for all seven models.
- **Cost:** PRO is about **$9/month** per account ([pricing](https://huggingface.co/pricing)). Cancel
  after the competition if it's no longer needed.
- **Trade-off:** on 2 CPUs, each heatmap takes several seconds. Running every chest X-ray test at once
  (the "Not sure" option) can take 30–40 seconds, close to the app's 60-second limit per analysis.
  If that becomes a problem, either pay for faster Space hardware, or stay on ZeroGPU and use PRO's
  larger GPU quota instead (see the note below the steps).

## Payment log

Record every payment here, so the team knows what is being paid for, by whom, and when to cancel.

| Date | Service | Plan | Amount | Paid by | Why | Cancel or review by |
|---|---|---|---|---|---|---|
| — | — | — | — | — | No payments yet; everything runs on free tiers. | — |

Costs that could come up:

| Service | What | Price | When it would be needed |
|---|---|---|---|
| Hugging Face PRO | Subscription | about $9/month | Setup B for the competition, or a larger ZeroGPU quota (40 min/day) |
| Hugging Face credits | ZeroGPU time beyond the daily quota (PRO only) | $1 per 10 minutes of GPU time | Heavy use on setup A with PRO |
| Hugging Face Space hardware | Faster CPU or a dedicated GPU, billed per hour | see [pricing](https://huggingface.co/pricing) | If setup B is too slow |
| Vercel Pro | Team features, longer function time limits | see [pricing](https://vercel.com/pricing) | Only if Hobby's limits or terms become a problem |
| Supabase Pro | More storage and database space | see [pricing](https://supabase.com/pricing) | Only if the free tier's limits are reached |

## Deploying setup A (now)

### 1. Create the Space

At [huggingface.co/new-space](https://huggingface.co/new-space):

- **Space name:** `scanlens-models`
- **SDK:** Gradio, Blank template
- **Hardware:** ZeroGPU
- **Visibility:** Public. The app reaches a public Space without a login, and the secret below stops
  anyone else from using it.

### 2. Add the secrets

In the Space, **Settings → Variables and secrets → New secret**:

| Name | Value |
|---|---|
| `HF_TOKEN` | A "Read" token from an account that accepted the terms of [google/medsiglip-448](https://huggingface.co/google/medsiglip-448) |
| `MODEL_SERVER_SECRET` | A long random string, e.g. from `openssl rand -hex 32` |

### 3. Upload the model server

The upload needs a token with **write** access (huggingface.co → Settings → Access Tokens).

```bash
cd model-server
.venv/bin/hf auth login
.venv/bin/hf upload devYoda/scanlens-models . --repo-type space \
  --exclude ".venv/*" "references/*" "__pycache__/*"
```

The Space builds, then downloads and loads the models, which takes several minutes. It's ready when the
logs show `Ready: chest-ct-lung-cancer`. To check it by hand, open the Space, paste the secret, and
press **List tests**.

### 4. Deploy the web app on Vercel

Import the GitHub repository into Vercel, then in **Settings → Environment Variables** add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase → Project Settings → API |
| `MODEL_SPACE` | `devYoda/scanlens-models` |
| `MODEL_SERVER_SECRET` | The same value as in the Space |
| `HF_TOKEN` | A token from the account whose GPU quota should be used |

Redeploy after adding them. Finally, in Supabase → **Authentication → URL Configuration**, set the
Site URL to the Vercel address (e.g. `https://scanlens.vercel.app`) so sign-up email links point there.

## Switching to setup B (competition)

1. Subscribe to [Hugging Face PRO](https://huggingface.co/subscribe/pro) and add the payment to the
   [payment log](#payment-log).
2. Create a new Space, e.g. `scanlens-models-cpu`, with **SDK: Docker** and **Hardware: CPU Basic**.
   Add the same two secrets as in setup A.
3. In `model-server/README.md`, replace the header's SDK lines

   ```yaml
   sdk: gradio
   sdk_version: 5.50.0
   python_version: "3.10"
   app_file: app.py
   ```

   with

   ```yaml
   sdk: docker
   app_port: 7860
   ```

   then upload as in step 3 of setup A, to the new Space's name. The Space builds from
   `model-server/Dockerfile`, which runs `server.py`.
4. In Vercel, **delete** `MODEL_SPACE` and add
   `MODEL_SERVER_URL` = `https://devyoda-scanlens-models-cpu.hf.space` (the Space's direct URL, shown
   under the Space's **⋮ → Embed this Space**). Keep `MODEL_SERVER_SECRET`. Redeploy.
5. Run a sample scan from the deployed app to check it works. Keep the ZeroGPU Space as a fallback:
   switching back is only step 4 in reverse.

**Alternative with PRO:** keep setup A and change nothing in the code. PRO raises the ZeroGPU quota from
5 to 40 minutes a day, with top queue priority, and allows paying for extra time with credits. That's
faster than CPU, but a busy day can still run out of quota.

## What changed for deployment, and why

| Change | Files | Why |
|---|---|---|
| The server's address comes from `HOST` (default `127.0.0.1`) | `model-server/server.py` | A hosted server must listen on `0.0.0.0` to accept outside connections. Local use is unchanged. |
| A shared secret, `MODEL_SERVER_SECRET`, checked on every request | `server.py`, `app.py`, `lib/modelServer.ts` | Once public, anyone could otherwise send images and use up the GPU quota or compute. Off when unset, so local use is unchanged. |
| The app no longer sends `HF_TOKEN` to `server.py` | `app/api/analyze/route.ts` | It was sent as an `Authorization` header that the server never checked. Sending a token to a server that doesn't need it only risks leaking it. |
| The app sends `HF_TOKEN` to Hugging Face when using the ZeroGPU Space | `lib/modelServer.ts` | ZeroGPU charges each call to the caller's account. Without a token, calls use the anonymous quota (2 minutes a day) instead of the account's 5. |
| Models can run on a GPU, picked with `DEVICE` (default `cpu`) | `server.py` | ZeroGPU needs models placed on `cuda` at startup. The scan check's text side is now worked out on the CPU once, so only images go to the GPU. |
| New Gradio entry point | `model-server/app.py` | ZeroGPU only runs Gradio Spaces. It reuses `server.py`'s functions, so both setups give identical results. |
| One module for reaching the model server | `lib/modelServer.ts` (new), `app/api/*/route.ts` | Lets the app talk to either the Gradio Space or plain HTTP, chosen by `MODEL_SPACE`, so switching setups needs no code change. |
| New dependency `@gradio/client` 1.19.1 | `package.json` | The official client for calling a Gradio Space. 1.19.1 is the version matching Gradio 5. |
| `transformers` 4.46.3 → 4.57.6 | `model-server/requirements.txt` | Gradio needs a newer `huggingface-hub` than 4.46 allows. 4.57.6 is the last 4.x; 5.x needs Python 3.11 and PyTorch 2.6+, which can't run on Intel Macs. Checked locally on the sample scans: same scan types and findings. |
| `torch` 2.9.1 on Linux, still 2.2.2 on Intel Macs | `requirements.txt`, `requirements-intel-mac.txt`, `Dockerfile` | ZeroGPU only supports PyTorch 2.8 and later, and rejects an older torch anywhere in `requirements.txt`, even behind a platform marker. Intel Macs can't go above 2.2.2, so their pins are in a separate file. |
| Gradio 5.50.0, not the newest 6.x | `model-server/README.md` | Gradio 6 needs `huggingface-hub` 1.x, which `transformers` 4.x doesn't allow (see above). |
| CPU-only PyTorch in the Docker image | `model-server/Dockerfile` | The default Linux PyTorch also installs several GB of GPU libraries a CPU Space can't use. |
| Space settings in a README header | `model-server/README.md` | Hugging Face reads a Space's SDK and settings from its README. |
