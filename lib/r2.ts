import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 holds full CT and MRI series. The bucket is private: the browser only ever gets
// short-lived links made here, after the API route has checked who is asking.

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set. Add the R2 settings to .env.local (see .env.example).`);
  return v;
};

let client: S3Client | null = null;
const r2 = () =>
  (client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  }));

const bucket = () => env("R2_BUCKET");

export const uploadUrl = (key: string) =>
  getSignedUrl(r2(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: "application/gzip" }), { expiresIn: 15 * 60 });

export const viewUrl = (key: string) =>
  getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 60 * 60 });

export const remove = (key: string) => r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
