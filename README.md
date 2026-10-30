# ScanLens

Next.js + Supabase + Hugging Face CT analysis starter.

1. `npm install`
2. Create a Supabase project, run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and fill it in. Pick a CT model on Hugging Face (image-classification or object-detection) and set `HF_MODEL_URL`, `HF_TOKEN`, `HF_MODEL_NAME`.
4. `npm run dev`, open http://localhost:3000, create an account, upload a scan.

Notes
- The model token stays on the server (`app/api/analyze/route.ts`). The browser never sees it.
- Only classification and bounding-box outputs are parsed. Segmentation masks are saved in `raw` but not drawn.
- DICOM support: uncompressed single-frame only. Compressed DICOM needs a decoder (e.g. cornerstone codecs) or server-side conversion.
- Check the licence and intended use of any model and dataset before real clinical use.
Aimedical_1zJfrlbpEPcU6iYSd