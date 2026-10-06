import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local');
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'value-lens-documents';
const client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const found = await client.storage.getBucket(bucket);
  if (found.data) {
    if (found.data.public || Number(found.data.file_size_limit) !== 25*1024*1024) throw new Error('Existing bucket must be private with a 25 MiB limit');
    console.log('Private document bucket already configured.');
  } else {
    if (String(found.error?.statusCode) !== '404') throw new Error('Unable to inspect bucket');
    const { error } = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: 25*1024*1024 });
    if (error) throw new Error('Unable to create bucket');
    console.log('Private document bucket created.');
  }
} catch { console.error('Storage setup failed. Check project credentials and private bucket settings.'); process.exitCode=1; }
