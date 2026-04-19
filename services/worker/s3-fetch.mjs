import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Load image bytes from a public HTTP(S) URL or from a private S3 object URL in our bucket (uses AWS credentials).
 */
export async function fetchImageBytes(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("Missing image_url");
  }

  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";

  if (bucket && imageUrl.includes(bucket) && imageUrl.includes(".amazonaws.com")) {
    const key = extractS3KeyFromUrl(imageUrl, bucket);
    if (key) {
      const client = new S3Client({ region });
      const out = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key
        })
      );
      const bytes = await out.Body?.transformToByteArray?.();
      if (bytes) {
        return Buffer.from(bytes);
      }
    }
  }

  const imageResp = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imageResp.ok) {
    throw new Error(`Failed to fetch image: ${imageResp.status}`);
  }
  return Buffer.from(await imageResp.arrayBuffer());
}

function extractS3KeyFromUrl(imageUrl, bucket) {
  try {
    const u = new URL(imageUrl);
    if (u.hostname.startsWith(`${bucket}.s3`)) {
      return decodeURIComponent(u.pathname.replace(/^\//, "").replace(/\+/g, " "));
    }
  } catch {
    return null;
  }
  return null;
}
