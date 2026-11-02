# ScanLens

ScanLens is a web app that analyses medical scans (chest X-rays, bone X-rays, brain MRI and chest CT) with open AI models. You upload a scan, it checks what kind of scan it is, runs every test made for that scan type, and shows the results with a heatmap of where each model looked. A clinician can then agree or disagree with each result.

It is decision support for research and demos, not a diagnostic device. The models are small open models from Hugging Face and make mistakes; every result needs a qualified person to review it.

## What it does

- **Upload** a PNG, JPG or uncompressed DICOM, or pick one of the built-in sample scans from public datasets.
- **Crop and cover text** before uploading, so names, dates and ID numbers never leave the browser.
- **Scan check:** works out whether the image is a chest X-ray, bone X-ray, brain MRI, chest CT or something else, and refuses to run a test on the wrong kind of image.
- **Tests:** six models (pneumonia, COVID-19, 14 chest conditions, bone fracture, brain tumour, lung cancer). Run one, or let the app run every test that matches the scan.
- **Heatmaps:** circles up to three areas that most changed each model's answer, and warns when no single area explains the result.
- **Clinician review:** Agree / Disagree / Unsure with a note on each result.
- **Dashboard:** past scans, results and confidence, in light or dark mode.

## How it fits together

```
Browser (Next.js pages)
   │  uploads the image to Supabase Storage, then calls /api/analyze
   ▼
Next.js API routes (app/api/*)          Supabase
   │  downloads the image, forwards it   ├─ Auth (email + password)
   ▼                                     ├─ Postgres: analyses, reviews (row-level security)
Python model server (model-server/)     └─ Storage: private "scans" bucket
   │  scan check (MedSigLIP) → tests (ViT/Swin classifiers) → heatmaps
   ▼
Results saved to Supabase, shown on /scan/[id]
```

More detail, including how to add a new test, is in [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

## Tools used

| Part | Tools |
|---|---|
| Web app | Next.js 15 (App Router), React 19, TypeScript, plain CSS with light/dark design tokens |
| Accounts and data | Supabase: Auth, Postgres with row-level security, Storage |
| DICOM | `dicom-parser`, converted to PNG in the browser |
| Model server | Python 3.9+, PyTorch 2.2, Hugging Face `transformers` 4.46, Pillow; standard-library HTTP server |
| Models | Google MedSigLIP-448 (scan check) and six open classifiers from Hugging Face (listed in `model-server/server.py`) |

## Setting it up

You need Node.js 20 or newer, Python 3.9 or newer, a free [Supabase](https://supabase.com) project and a free [Hugging Face](https://huggingface.co) account. The models need about 6 GB of disk space.

### 1. Install the web app

```bash
npm install
```

### 2. Set up Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and run it. This creates the `analyses` and `reviews` tables, their security rules, and the private `scans` storage bucket.
3. In **Authentication → Providers → Email**, either keep email confirmation on (new users must click a link) or turn it off for quick local testing.

If your project was created from an older `schema.sql`, run `supabase/migrations/002_reviews_and_delete.sql` instead of the whole file.

### 3. Get a Hugging Face token

1. Create a token at huggingface.co → **Settings → Access Tokens** (type "Read").
2. Open [google/medsiglip-448](https://huggingface.co/google/medsiglip-448) while signed in and accept its terms. Without this, the scan check can't download.

### 4. Add your keys

```bash
cp .env.example .env.local
```

Fill in the Supabase URL and anon key (Supabase → **Project Settings → API**) and your Hugging Face token. Never commit `.env.local`.

### 5. Start the model server

```bash
cd model-server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -u server.py
```

It listens on http://127.0.0.1:8000. The first start downloads every model (several GB), which can take a while; later starts load from the cache in under a minute. Leave it running in its own terminal.

After the first download you can start it without contacting Hugging Face:

```bash
HF_HUB_OFFLINE=1 .venv/bin/python -u server.py
```

### 6. Start the web app

In a second terminal, from the project root:

```bash
npm run dev
```

Open http://localhost:3000, create an account, and try a sample scan. If port 3000 is in use, run `npx next dev -p 3001`.

## Project layout

```
app/
  page.tsx              Dashboard: recent scans and all results
  upload/page.tsx       Upload, crop/cover, sample gallery, choose a test
  scan/[id]/page.tsx    Results for one scan: heatmaps, reviews, delete
  login/page.tsx        Sign in and sign up
  api/analyze/route.ts  Sends an uploaded scan to the model server and saves the results
  api/tests/route.ts    Lists the tests the model server offers
components/             UI pieces (ScanImage draws scans, marks and heatmaps; ImageEditor crops and covers)
lib/                    Supabase client, session hook, DICOM conversion, formatting, shared types
model-server/
  server.py             The model server: scan check, tests, heatmaps
  references.json       Example-scan fingerprints the scan check compares against
  build_references.py   Rebuilds references.json from public datasets
  build_samples.py      Rebuilds the sample scans in public/samples/
public/samples/         Sample scans and their dataset labels (samples.json)
supabase/               Database schema and migrations
docs/                   Developer documentation
```

## Things to know

- **Privacy.** Only use anonymised scans, such as the samples or public datasets. Never upload images showing a patient's name or details; use **Crop or cover text** if an image has any.
- **Keys stay server-side.** The Hugging Face token is only read by the API route and the model server; the browser never sees it.
- **Speed.** On a laptop CPU, the scan check takes about 5 seconds and each heatmap 8–12 seconds, so running every chest X-ray test takes around 30–40 seconds.
- **Model quality.** The test models are small community models. Some react to the image as a whole rather than the disease (the app flags this). See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md#known-limitations).
- **DICOM.** Only uncompressed, single-frame DICOM is supported.
- **Licences.** Check each model's and dataset's licence before any use beyond research and demos.
