# FindBack deployment

## Frontend on Vercel

Set the project root directory to `frontend`, framework to Next.js, and build command to `npm run build`.
Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL` before building. Use only the public Supabase key in the frontend.
Add `findback-ai-system.inteliodev.com` to the Vercel project's domains. Use the exact DNS target provided by that project.

## Backend

Deploy the root Dockerfile on a container host. The application uses CPU PyTorch and FaceNet; select resources appropriate for the actual model workload rather than assuming Vercel Python function limits will accommodate it.
Set `SUPABASE_URL`, backend-only `SUPABASE_SECRET_KEY`, and comma-separated `CORS_ORIGINS`. Include the exact production frontend origin.
Configure `/health` as the health-check path. The web server binds to the host's `PORT`.
Model weights download on first use; the backend host needs outbound access and writable cache space. Test model initialization before treating the AI feature as ready.

## Supabase

For the newly requested empty Supabase project, apply `supabase/migrations/202611060001_initial.sql` once in the SQL editor. It creates reports, matches, notifications, recovery audit tables, private image buckets and row-level access policies. Do not apply it blindly to a previously populated project. Sign up the intended admin normally, then assign that user's UUID the `admin` role through the trusted SQL editor. Users cannot assign themselves staff roles.
Set the production Site URL and allowed authentication redirect URLs to the frontend domain, including `/reset-password` as required by the application.

## Verification

Check the frontend build, backend `/health`, allowed CORS origin, login redirect and authenticated role restrictions. Use synthetic test reports only for write-path checks. Do not run repository database test scripts against production without reviewing their mutations.
