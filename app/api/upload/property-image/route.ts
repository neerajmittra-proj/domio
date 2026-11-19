import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { randomBytes } from 'crypto';
import { uploadToR2 } from '@/lib/r2';
import { PROPERTY_IMAGE_PREFIX } from '@/lib/property-images';

// Extension is derived from the verified MIME type, never from the filename the
// client sent (a ".html" name with an image MIME type would otherwise be served
// back from our own origin).
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

// Check the file's magic bytes really match the claimed image type.
function looksLikeImage(buf: Buffer, mime: string): boolean {
  const ascii = (s: number, e: number) => buf.subarray(s, e).toString('latin1');
  switch (mime) {
    case 'image/jpeg':
      return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/png':
      return buf.length > 8 && buf[0] === 0x89 && ascii(1, 4) === 'PNG';
    case 'image/gif':
      return ascii(0, 4) === 'GIF8';
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'image/avif':
      return ascii(4, 8) === 'ftyp';
    default:
      return false;
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Property photos are uploaded by owners and their managers only.
    if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const fileEntry = formData.get('file');
    const file = typeof fileEntry === 'string' ? null : (fileEntry as File | null);

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    // Validate type
    if (!Object.prototype.hasOwnProperty.call(EXT_BY_MIME, file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a JPEG, PNG, WEBP, or AVIF image.' },
        { status: 400 },
      );
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image size exceeds 5MB limit. Please upload a smaller photo.' },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (!looksLikeImage(buffer, file.type)) {
      return NextResponse.json(
        { error: 'That file is not a valid image.' },
        { status: 400 },
      );
    }

    // Store in R2 (works on Cloudflare and Vercel; neither has a lasting disk).
    // Served back through /api/property-image/<fileName>.
    const cleanExt = EXT_BY_MIME[file.type];
    const fileName = `prop_${Date.now()}_${randomBytes(4).toString('hex')}.${cleanExt}`;
    await uploadToR2(`${PROPERTY_IMAGE_PREFIX}${fileName}`, buffer, file.type);

    const publicUrl = `/api/property-image/${fileName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName,
    });
  } catch (error: any) {
    console.error('Property image upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image. Please try again.' },
      { status: 500 },
    );
  }
}
