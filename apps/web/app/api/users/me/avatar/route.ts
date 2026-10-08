/**
 * POST /api/users/me/avatar — multipart upload of avatar.
 * Re-encodes to 512x512 WebP at quality 80, uploads to Supabase Storage
 * bucket 'avatars' at path {user_id}/{uuid}.webp, returns the signed URL.
 *
 * Auth: required.
 *
 * Note: this endpoint uses multipart form data, so it cannot run on the
 * Edge runtime. The handler is plain Node.js (default).
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getServerSupabase } from '../../../../../lib/supabase/route-handler';

export const runtime = 'nodejs';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TARGET_SIZE = 512;
const WEBP_QUALITY = 80;

export async function POST(req: NextRequest) {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'avatar file is required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 400 });
  }
  if (!ACCEPTED_MIMES.has(file.type)) {
    return NextResponse.json({ error: `unsupported type (got ${file.type})` }, { status: 400 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    output = await sharp(input).resize(TARGET_SIZE, TARGET_SIZE, { fit: 'cover', position: 'center' }).webp({ quality: WEBP_QUALITY }).toBuffer();
  } catch (e) {
    return NextResponse.json({ error: `image processing failed: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 400 });
  }

  const path = `${user.id}/${randomUUID()}.webp`;
  const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, output, { contentType: 'image/webp', upsert: true });
  if (uploadErr) return NextResponse.json({ error: `storage upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: signed, error: signErr } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr || !signed) return NextResponse.json({ error: `signed url failed: ${signErr?.message}` }, { status: 500 });

  const { error: updateErr } = await supabase.from('users').update({ avatar_url: signed.signedUrl }).eq('id', user.id);
  if (updateErr) return NextResponse.json({ error: `users update failed: ${updateErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, avatar_url: signed.signedUrl });
}