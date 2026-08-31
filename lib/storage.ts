import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const bucket = process.env.S3_BUCKET!;

export const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
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
