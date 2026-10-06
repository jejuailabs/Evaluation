-- Provision only this application's fixed worker schedule. Secrets stay inside DB/Vault.
DO $migration$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='vault') AND EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
  EXECUTE $fn$
  CREATE FUNCTION value_lens.configure_worker(worker_secret text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
  DECLARE secret_id uuid;
  BEGIN
   IF worker_secret !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid worker secret'; END IF;
   SELECT id INTO secret_id FROM vault.secrets WHERE name='value_lens_worker_secret';
   IF secret_id IS NULL THEN
    PERFORM vault.create_secret(worker_secret,'value_lens_worker_secret');
   ELSE
    PERFORM vault.update_secret(secret_id,worker_secret);
   END IF;
   PERFORM cron.schedule('value-lens-worker','* * * * *',$job$
    SELECT net.http_post(url:='https://evaluation-five-xi.vercel.app/api/internal/worker',
     headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='value_lens_worker_secret')),
     body:='{}'::jsonb,timeout_milliseconds:=100000)
    WHERE EXISTS(SELECT 1 FROM value_lens.background_jobs WHERE state='queued' AND available_at<=now() OR state='running' AND lease_until<now()) OR extract(minute from now())=0;
   $job$);
  END $body$;
  $fn$;
  REVOKE ALL ON FUNCTION value_lens.configure_worker(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION value_lens.configure_worker(text) TO value_lens_app;
 END IF;
END $migration$;
