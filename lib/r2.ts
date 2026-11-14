import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 holds full CT and MRI series. The bucket is private: the browser only ever gets
// short-lived links made here, after the API route has checked who is asking.

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set. Add the R2 settings to .env.local (see .env.example).`);
  return v;
};

// Accepts the bare account ID or the whole endpoint URL pasted from the Cloudflare dashboard.
const accountId = () => env("R2_ACCOUNT_ID").trim().replace(/^https?:\/\//, "").replace(/\.r2\.cloudflarestorage\.com.*$/, "");

let client: S3Client | null = null;
const r2 = () =>
  (client ??= new S3Client({
    region: "auto",
    endpoint: `https://${accountId()}.r2.cloudflarestorage.com`,
    // Newer AWS SDKs add checksums to every upload link by default; R2 asks for them only when required.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  }));

const bucket = () => env("R2_BUCKET");

export const uploadUrl = (key: string) =>
  getSignedUrl(r2(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: "application/gzip" }), { expiresIn: 15 * 60 });

export const viewUrl = (key: string) =>
  getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 60 * 60 });

// A link that downloads the file under a readable name instead of opening it.
export const downloadUrl = (key: string, filename: string) =>
  getSignedUrl(r2(), new GetObjectCommand({
    Bucket: bucket(), Key: key, ResponseContentDisposition: `attachment; filename="${filename}"`,
  }), { expiresIn: 15 * 60 });

export const remove = (key: string) => r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
