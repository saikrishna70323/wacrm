import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { buildMediaAssetKey, buildPublicS3Url, uploadToS3 } from '@/lib/s3';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be 10MB or smaller' }, { status: 400 });
    }

    const key = buildMediaAssetKey(user.id, file.name);
    const body = Buffer.from(await file.arrayBuffer());

    await uploadToS3({
      key,
      body,
      contentType: file.type || 'application/octet-stream',
    });

    const publicUrl = buildPublicS3Url(key);
    const { data, error } = await supabaseAdmin()
      .from('media_assets')
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        media_kind: 'image',
        file_size: file.size,
        storage_key: key,
        public_url: publicUrl,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ asset: data }, { status: 200 });
  } catch (error) {
    console.error('[settings/images/upload] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
