# ScanLens

ScanLens is a web app that analyses medical images (chest X-rays, bone and knee X-rays, brain MRI, chest CT, retina photos and skin lesion photos) with open AI models. You upload a scan, it checks what kind of scan it is, runs every test made for that scan type, and shows the results with a heatmap of where each model looked. A clinician can then agree or disagree with each result.

It is decision support for research and demos, not a diagnostic device. The models are small open models from Hugging Face and make mistakes; every result needs a qualified person to review it.

## What it does

- **Upload** a PNG, JPG or uncompressed DICOM, or pick one of the built-in sample scans from public datasets.
- **DICOM:** single and multi-frame files, a frame slider, CT viewing windows (lung, soft tissue, bone, brain), the header facts that matter (modality, body part, slice thickness, pixel spacing), and identifying header fields (name, ID, dates, hospital, staff) blanked in the copy that gets uploaded.
- **Crop and cover text** before uploading, so names, dates and ID numbers never leave the browser.
- **Scan check:** works out whether the image is a chest X-ray, bone X-ray, knee X-ray, brain MRI, chest CT, retina photo, skin lesion photo or something else, and refuses to run a test on the wrong kind of image.
- **Tests:** ten models (pneumonia, COVID-19, 14 chest conditions, tuberculosis, bone fracture, knee osteoarthritis grade, brain tumour, lung cancer, diabetic retinopathy, skin lesions). Run one, or let the app run every test that matches the scan. Each test's description in the app states its known limits.
- **Heatmaps:** circles up to three areas that most changed each model's answer, and warns when no single area explains the result.
- **Clinician review:** Agree / Disagree / Unsure with a note on each result.
- **Zoom:** click a scan to open it full screen; scroll, pinch, drag, or show exact pixels. The image is only enlarged, never AI-upscaled, because upscaling can invent detail.
- **Patient cases:** group a patient's scans under an anonymous reference, see them on a timeline, and compare any two side by side with what changed between them.
- **Report PDF:** a one-page report with the scan, heatmap, results, reviews and a plain-language summary, saved through the browser's Save as PDF.
- **Second opinion:** a read-only share link to one scan, its results and reviews, valid for 7 days and revocable.
- **Plain-language summary:** fixed, reviewed sentences that explain each result for a patient, ready to copy.
- **Overview:** the latest scan, results waiting for review, and how often clinicians agreed with the models, in light or dark mode.

## How it fits together

```
Browser (Next.js pages)
   │  uploads the image to Supabase Storage, then calls /api/analyze
   ▼
Next.js API routes (app/api/*)          Supabase
   │  downloads the image, forwards it   ├─ Auth (email + password)
   ▼                                     ├─ Postgres: analyses, reviews, cases, shares
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
| Model server | Python 3.9+, PyTorch (2.2 on Intel Macs, 2.9 elsewhere), Hugging Face `transformers` 4.57, Pillow; standard-library HTTP server locally, Gradio on Hugging Face Spaces |
| Models | Google MedSigLIP-448 (scan check) and ten open classifiers from Hugging Face (listed in `model-server/server.py`) |

## Setting it up

You need Node.js 20 or newer, Python 3.9 or newer, a free [Supabase](https://supabase.com) project and a free [Hugging Face](https://huggingface.co) account. The models need about 6 GB of disk space.

### 1. Install the web app

```bash
npm install
```

### 2. Set up Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and run it. This creates the `analyses`, `reviews`, `cases` and `shares` tables, their security rules, the function behind share links, and the private `scans` storage bucket.
3. In **Authentication → Providers → Email**, either keep email confirmation on (new users must click a link) or turn it off for quick local testing.

If your project was created from an older `schema.sql`, run only the migrations it's missing, in order: `supabase/migrations/002_reviews_and_delete.sql`, then `003_cases_and_shares.sql`. Without 003 the app still analyses scans, but cases and share links stay switched off.

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
.venv/bin/pip install -r requirements.txt   # Intel Mac: -r requirements-intel-mac.txt
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

## Deploying

The web app runs on Vercel and the model server on a Hugging Face Space. Steps, costs, the payment log
and the plan for the competition are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project layout

```
app/
  page.tsx              Overview: latest scan, review queue, agreement, all results
  upload/page.tsx       Upload, DICOM frames and windows, crop/cover, samples, case, choose a test
  scan/[id]/page.tsx    One scan: results, heatmaps, reviews, summary, case, share, delete
  scan/[id]/report/     Printable report (Save as PDF)
  cases/                Patient cases, timeline and side-by-side comparison
  share/[token]/        Read-only shared scan, no sign-in
  login/page.tsx        Sign in and sign up
  api/analyze/route.ts  Sends an uploaded scan to the model server and saves the results
  api/tests/route.ts    Lists the tests the model server offers
components/             UI pieces (Stage is the scan with floating readouts; ScanImage draws scans, marks and
                        heatmaps; ZoomView is the full-screen zoom; ImageEditor crops and covers)
lib/                    Supabase client, session hook, DICOM reading, formatting, shared types
  analysis.ts           Loads a scan's results, reviews and case; also for share links
  summary.ts            The plain-language patient summary
  modelServer.ts        Calls the model server, locally over HTTP or on Hugging Face Spaces
model-server/
  server.py             The model server: scan check, tests, heatmaps
  app.py                The same server as a Gradio app, for a Hugging Face Space on ZeroGPU
  Dockerfile, README.md Hugging Face Space settings (README.md's header)
  references.json       Example-scan fingerprints the scan check compares against
  build_references.py   Rebuilds references.json from public datasets
  build_samples.py      Rebuilds the sample scans in public/samples/
public/samples/         Sample scans and their dataset labels (samples.json)
supabase/               Database schema and migrations
docs/                   Developer documentation
```

## Things to know

- **Privacy.** Only use anonymised scans, such as the samples or public datasets. Never upload images showing a patient's name or details; use **Crop or cover text** if an image has any.
- **Keys stay server-side.** The Hugging Face token and the model server secret are only read by the API routes and the model server; the browser never sees them.
- **Speed.** On a laptop CPU, the scan check takes about 5 seconds and each heatmap 8–12 seconds, so running every chest X-ray test takes around 30–40 seconds.
- **Model quality.** The test models are small community models. Some react to the image as a whole rather than the disease (the app flags this). See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md#known-limitations).
- **DICOM.** Only uncompressed, single-frame DICOM is supported.
- **Licences.** Check each model's and dataset's licence before any use beyond research and demos.
