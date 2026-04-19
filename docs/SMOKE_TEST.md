# End-to-end smoke test (AWS 2-EC2 + Supabase + S3)

Run after `scripts/deploy-all.sh`, `.env` on both instances, and `npm run seed:supabase`.

1. **Web state:** `curl -s http://$WEB_HOST:3000/api/state | jq .meta.supabase` → `true`
2. **S3 object:** Open `http://$WEB_HOST:3000/camera/pantry`, allow camera, send snapshot → verify object appears: `aws s3 ls s3://$AWS_S3_BUCKET/snapshots/pantry/ --recursive`
3. **Worker:** On worker host, `npx pm2 logs caretaker-worker` shows pantry loop processing and `purchase_proposals` inserts (or use Supabase Table Editor).
4. **Approve:** Dashboard → approve proposal → worker `caretaker-worker` logs show Knot checkout; `purchase_proposals.status` becomes `completed`.
5. **Photon:** With `PHOTON_SERVER_URL` + `PHOTON_SECRET_KEY`, notifier logs show outbound HTTP; `notifications` table gains a row for medication events.
