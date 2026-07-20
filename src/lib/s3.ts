import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required S3 configuration: ${name}`);
  }
  return value;
}

let s3Client: S3Client | null = null;

export function getS3Client() {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: required('S3_REGION'),
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: required('S3_ACCESS_KEY_ID'),
      secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
    },
  });

  return s3Client;
}

export function getS3Bucket() {
  return required('S3_BUCKET');
}

export function buildMediaAssetKey(userId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `settings/images/${userId}/${Date.now()}-${safeName}`;
}

export function buildPublicS3Url(key: string) {
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim();
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  }

  const bucket = getS3Bucket();
  const region = required('S3_REGION');
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function uploadToS3(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

export async function deleteFromS3(key: string) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
    }),
  );
}
