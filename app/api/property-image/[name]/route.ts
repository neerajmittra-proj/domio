import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { PROPERTY_IMAGE_NAME, PROPERTY_IMAGE_PREFIX, PROPERTY_IMAGE_TYPES } from '@/lib/property-images';

// Public, cacheable property photo served from R2.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!PROPERTY_IMAGE_NAME.test(name)) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const obj = await r2Client.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: `${PROPERTY_IMAGE_PREFIX}${name}` }),
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return new Response('Not found', { status: 404 });
    const ext = name.split('.').pop() as string;
    return new Response(bytes as BodyInit, {
      headers: {
        'content-type': PROPERTY_IMAGE_TYPES[ext] ?? 'application/octet-stream',
        // File names are unique per upload, so they can be cached for a long time.
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
