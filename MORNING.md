# When you wake — get phones on Swing Bus

The POC is built. This Cursor VM **cannot** join the xAI Tailscale network or enable Funnel. Do this on any **internal host** (desk machine, lab VM) that is already on Tailscale:

```bash
git clone <repo> && cd <repo>   # or pull this branch
npm ci && npm run build && npm start
./scripts/expose-funnel.sh 43127
```

1. Tailscale admin: enable **Funnel** (once) for that node/tag.
2. Share the printed `https://….ts.net` URL — works on personal phones **without** Tailscale.
3. Open `/stops` **on that Funnel URL** and print QR codes (so they encode the public origin).
4. On ground control (`/dispatch`) hit **Seed scenario**, then try passenger + driver phones.

Seat model: `docs/GROUND-CONTROL.md`  
Deploy options: `DEPLOY.md`

Local demo still running in the agent at http://127.0.0.1:43127
