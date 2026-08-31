import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// S3-compatible object storage. Two supported backends, same code path:
//  • Neon Object Storage  — AWS-standard env vars (AWS_ENDPOINT_URL_S3, AWS_REGION,
//    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY), bucket declared in neon.ts.
//  • Self-hosted MinIO/S3 — the S3_* vars (see docker-compose.yml).
// Neon requires path-style addressing, so forcePathStyle is always on.
const endpoint = process.env.AWS_ENDPOINT_URL_S3 || process.env.S3_ENDPOINT;
const region = process.env.AWS_REGION || process.env.S3_REGION || "us-east-2";
const accessKeyId =
  process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

export const bucket = process.env.S3_BUCKET || "attachments";

export const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials:
    accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
});

export function newKey(filename: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-80);
  return `${new Date().getFullYear()}/${randomUUID()}-${safe}`;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Short-lived download URL — the reviewer's browser fetches attachments directly. */
export async function signedDownloadUrl(key: string, filename?: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: filename
        ? `inline; filename="${filename}"`
        : undefined,
    }),
    { expiresIn: 300 },
  );
}
