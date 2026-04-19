import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Presign PUT for browser snapshot upload. Returns public HTTPS URL for the object after upload.
 */
export async function createSnapshotPutUrl({ bucket, region, role, cameraId, contentType = "image/jpeg" }) {
  const key = `snapshots/${role}/${cameraId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const client = new S3Client({ region: region || process.env.AWS_REGION || "us-east-1" });
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const reg = region || process.env.AWS_REGION || "us-east-1";
  const pathEnc = key.split("/").map(encodeURIComponent).join("/");
  const imageUrl = `https://${bucket}.s3.${reg}.amazonaws.com/${pathEnc}`;
  return { uploadUrl, imageUrl, key };
}
