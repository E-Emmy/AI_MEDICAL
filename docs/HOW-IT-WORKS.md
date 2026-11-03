# How ScanLens works

This guide is for developers working on ScanLens. It covers what happens when a scan is analysed, where the data lives, how to add a test, and what's known to be weak. Setup steps are in the [README](../README.md).

## The life of an analysis

1. **Choosing an image** (`app/upload/page.tsx`). The browser turns every image into a PNG: DICOM through `lib/dicom.ts`, JPG through a canvas. Sample scans are fetched from `public/samples/`. Nothing has been uploaded yet.
2. **Crop or cover text** (`components/ImageEditor.tsx`, optional). The user draws boxes; on "Apply changes" a canvas paints the covered boxes solid black and crops, and the result replaces the PNG. Edits are baked into the pixels, not layered on top. An edited DICOM's original `.dcm` file is not uploaded, because it still holds the parts the user removed.
3. **Upload.** The PNG goes to the private Supabase Storage bucket `scans` at `<user id>/<random uuid>.png`. Storage rules only allow a user to touch their own folder.
4. **Analyse** (`app/api/analyze/route.ts`). The browser calls `POST /api/analyze` with the image path, the test id (`auto` means every matching test) and, for samples, the sample id. The route:
   - checks the Supabase session and that the path is in the user's own folder,
   - downloads the image from Storage as that user,
   - sends the PNG to the model server through `lib/modelServer.ts`: as raw bytes to `MODEL_SERVER_URL/tests/<test id>`, or to the Space's `/analyze` API when `MODEL_SPACE` is set (see [DEPLOYMENT.md](DEPLOYMENT.md)),
   - saves **one `analyses` row per test**, all with the same `image_path`, and returns the first row's id.
5. **Model server** (`model-server/server.py`):
   - **Scan check.** MedSigLIP turns the image into an embedding and compares it with the average embedding of real example scans of each type (`references.json`). The closest type wins if its similarity is at least `MIN_SCAN_SCORE` (0.58). Text descriptions catch other images (ultrasound, photos, screenshots). If the check fails, or the scan type doesn't match the chosen test, the server returns **422** with an explanation, and the app shows it.
   - **Tests.** Each test is a Hugging Face image classifier. The image is converted to greyscale first, because tinted images fooled the models.
   - **Grids of slices.** If the image is a montage (rows and columns of slices separated by dark gaps), `find_slices` cuts it into slices and the test runs on each one. The slices with a finding come back as `regions` (boxes in image pixels) and the result gets `slices: { count, flagged }`. The models were trained on single slices: on a whole grid the brain model called a visible tumour "No Tumor", but tested slice by slice it flagged the right row.
   - **Heatmap.** For any result that isn't "normal", the server greys out blocks of an 8 × 8 grid one position at a time and measures how much the model's confidence drops (in log-odds). The largest drops are where the model looked; up to three are circled. If no area matters, the result gets `heatmap_note: "diffuse"` and the app warns that the model is reacting to the image as a whole.
6. **Results** (`app/scan/[id]/page.tsx`). Loads the opened row and every row with the same `image_path`, then shows each test's result, the heatmap toggle, the clinician review and "Delete this scan".

## Model server API

By default the server listens only on `127.0.0.1` with no authentication. When `MODEL_SERVER_SECRET` is set, every request must send it in an `X-Server-Secret` header, or it gets `401`. `HOST=0.0.0.0` makes it reachable from outside; only do that with a secret set.

On the ZeroGPU Space, `app.py` offers the same thing through Gradio: `/analyze` (image, test id, secret) and `/tests` (secret), each returning `{ status, body }` with the status and body below.

| Request | Response |
|---|---|
| `GET /tests` | `[{ id, name, scan, scan_name, model, about, ready }]` |
| `POST /tests/<id>` (body: image bytes) | `200 { results: [Result], scan_check }`, or `422 { error, scan_check }` |
| `POST /tests/auto` (body: image bytes) | Same, with one `Result` per test that matches the scan type |

```jsonc
// Result
{
  "test": { "id": "chest-xray-pneumonia", "name": "Pneumonia", "scan": "chest-xray", "scan_name": "chest X-ray" },
  "model": "nickmuchi/vit-finetuned-chest-xray-pneumonia",
  "predictions": [{ "label": "PNEUMONIA", "score": 0.97 }, { "label": "NORMAL", "score": 0.03 }],
  "heatmap": {
    "label": "PNEUMONIA",
    "grid": [[0.1, 0.4, ...], ...],                         // 8 rows × 8, 0–1, relative to the strongest cell
    "peaks": [{ "x": 0.31, "y": 0.69, "strength": 1 }],     // circle centres as fractions of width/height
    "peak": { "x": 0.31, "y": 0.69 },                       // older format, kept for old analyses
    "drop": 2.4                                             // largest confidence drop, in log-odds
  },
  "heatmap_note": null,                                     // or "diffuse"
  // Only for grids of slices:
  "slices": { "count": 20, "flagged": 4 },
  "regions": [{ "label": "Meningioma", "score": 1.0, "box": { "xmin": 16, "ymin": 217, "xmax": 76, "ymax": 285 } }]
}
// scan_check
{ "scan": "chest-xray", "name": "chest X-ray", "score": 0.84, "clear": true }
```

Try it without the web app:

```bash
curl -s --data-binary @public/samples/chest-xray-pneumonia.jpg http://127.0.0.1:8000/tests/auto | python3 -m json.tool
```

## Data

All tables use row-level security: each user can only see and change their own rows. The full schema is in `supabase/schema.sql`; changes made after the first version are also in `supabase/migrations/`.

**`analyses`**: one row per test run on a scan.

| Column | Meaning |
|---|---|
| `image_path`, `dicom_path` | Files in the `scans` bucket. Rows from the same upload share `image_path`. |
| `model`, `top_label`, `top_score`, `predictions` | What the model said. |
| `regions` | Bounding boxes from detection models (none of the current tests produce any). |
| `raw` | JSON: `test`, `scan_check`, `heatmap`, `heatmap_note`, and `sample` (the dataset's known answer) for sample scans. New per-result information goes here, so it needs no schema change. |

**`reviews`**: a clinician's verdict on one analysis (`agree`, `disagree` or `unsure`) plus an optional note. Keyed by `analysis_id`; deleting the analysis deletes the review.

**Storage `scans`**: private. Files are read through signed links that expire after 10 minutes.

## Adding a test

1. Find an image-classification model on Hugging Face that has **safetensors** weights (the server refuses pickle `.bin` weights, which can run code when loaded) and a licence that allows your use. If it only has `.bin` files, look in its Community tab for an automatic "Adding safetensors variant" pull request and use that as the revision (for example `refs/pr/1`).
2. Add an entry to `TESTS` in `model-server/server.py`:
   ```python
   "knee-xray-arthritis": {
       "name": "Knee arthritis", "scan": "bone-xray", "scoring": "softmax",
       "model": "someone/knee-oa-model", "revision": "main",
       "about": "One sentence a user will understand.",
   },
   ```
   - `scan` must be one of the keys in `SCANS`.
   - `scoring` is `softmax` when the model picks one label, and `sigmoid` when it scores each label on its own (multi-label).
3. If the model's "nothing found" label isn't in `NORMAL_LABELS` (server) and `NORMAL` (`lib/tests.ts`), add it to both.
4. Restart the server. The upload page lists the new test automatically.

**A new scan type** (for example knee MRI) also needs:
- an entry in `SCANS` and `SCAN_NAMES` in `server.py`,
- example images: add public datasets for it to `SOURCES` in `build_references.py` and run it to rebuild `references.json`,
- a re-check of `MIN_SCAN_SCORE` against a few real scans and a few non-scans,
- an entry in `SCAN_NAMES` in `app/upload/page.tsx` if it gets sample scans.

## Sample scans

`public/samples/` holds anonymised scans from public datasets with their dataset labels in `samples.json`. `build_samples.py` downloads them; edit `WANTED` in that script to change the set. The analyse route only accepts sample ids found in `samples.json`, so the "known answer" stored with an analysis can't be supplied by the browser.

## Front end

- Pages are client components that call Supabase directly with the user's session (`lib/supabase.ts`, `lib/useSession.ts`). Only the analyse and tests routes run on the server.
- Styles are plain CSS in `app/globals.css`. Colours are tokens on `:root` with dark-mode values under `prefers-color-scheme` and `[data-theme]`. The theme toggle stores its choice in `localStorage`, and a small script in `app/layout.tsx` applies it before the first paint.
- `components/ScanImage.tsx` draws a scan, its region boxes and heatmap as an SVG laid over the image in the image's own pixel coordinates.

## Known limitations

- **Model quality.** The tests are small community models trained on narrow datasets (for example, the pneumonia model mostly saw children's X-rays). In testing, the COVID-19 model said "COVID-19" with near 100% confidence on a normal X-ray, and the brain model missed a small lesion. The "diffuse" warning catches some of these cases, but not all.
- **Heatmaps show what the model relied on, not where disease is.** Circles sometimes land on film edges or text markers.
- **Photos of film** are often not recognised. Cropping to the film itself fixes most cases.
- **Grid detection** needs visible gaps between slices in both directions. Small lesions in a grid's tiny slices are still easy to miss.
- **Speed.** Everything runs on the CPU. Heatmaps are the slow part (49 extra model runs per finding).
- **DICOM.** Only uncompressed single-frame files are supported.

## Ideas not built yet

- A written findings report from a larger medical model (MedGemma 4B) on a paid GPU endpoint, used only when it's switched on.
- A "report card" page measuring each test's accuracy on labelled public scans.
- Hosting: the web app on Vercel and the model server on a Hugging Face Space, connected with a shared secret.
