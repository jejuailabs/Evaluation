import { createClient } from '@supabase/supabase-js';
import type { ObjectStore } from './database';

export function createObjectStore(url: string, secret: string, bucket = 'value-lens-documents'): ObjectStore {
  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const files = client.storage.from(bucket);
  const fail = () => new Error('파일 저장소 요청을 처리하지 못했어요.');
  return {
    async put(key, bytes) {
      const { error } = await files.upload(key, bytes, { upsert: false, contentType: 'application/octet-stream' });
      if (error) throw fail();
    },
    async get(key) {
      const { data, error } = await files.download(key);
      if (error || !data) return null;
      return { body: data };
    },
    async delete(key) { const { error } = await files.remove([key]); if (error) throw fail(); },
    async signUpload(key) {
      const { data, error } = await files.createSignedUploadUrl(key, { upsert: false });
      if (error || !data) throw fail();
      return data.signedUrl;
    },
    async head(key) {
      const { data, error } = await files.info(key);
      if (error || !data) return null;
      return { size: Number(data.size) };
    },
    async signDownload(key, filename) {
      const { data, error } = await files.createSignedUrl(key, 60, { download: filename });
      if (error || !data) throw fail();
      return data.signedUrl;
    },
  };
}
