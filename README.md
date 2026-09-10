# Table Tennis Live

A shared, realtime version of the Match Sheet tournament tool 

"THAT MULTIPLE FREE AIs WROTE AND 'NOT ME' (BUT YOU CAN APPRECIATE MY LOGICAL PART)"

- Everyone who opens the link sees the **same** tournament.
- The **first person to connect** becomes the admin and runs the draw.
- Everyone after that is a **guest** — they watch the scores and standings
  update live, but can't click anything.
- If the admin closes their tab, the session ends for everyone (the app
  resets, so the next person to open the link starts a fresh tournament).

There's no login, no accounts, no security beyond "first one in runs the
show" — it's built for a quick, casual game night, not for anything
sensitive.

## How it works

- `server.js` — a small Node server. It holds the one shared tournament
  state in memory and pushes updates to every connected browser over a
  WebSocket.
- `logic.js` — the tournament rules (round robin, knockout, hybrid draws,
  tie-breaks). Only the server runs this; it's the single source of truth.
- `public/index.html` — the page everyone loads. It just displays whatever
  state the server sends it, and for the admin, sends button clicks back to
  the server as actions.

Because the state lives only in the server's memory, restarting the server
(or your host redeploying it) clears the tournament. That's expected for a
project like this — no database needed.

## Running it yourself, locally

You'll need [Node.js](https://nodejs.org) installed (18 or newer).

```bash
npm install
npm start
```

Then open `http://localhost:3000` in a browser tab — that tab becomes the
admin. Open the same address in another tab, another browser, or your phone
(on the same Wi-Fi, using your computer's local IP instead of `localhost`)
to join as a guest.

## Putting it on GitHub

1. Create a new repository on GitHub (e.g. `table-tennis-live`).
2. In this folder, run:
   ```bash
   git init
   git add .
   git commit -m "Table tennis live"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

That gets your code onto GitHub. **GitHub itself can only serve static
files** — it can't keep a server running to hold shared state or push live
updates. So for other people to actually use the app, you need to deploy it
somewhere that runs a Node process. [Render](https://render.com) has a free
tier and connects directly to a GitHub repo:

1. Sign up at render.com and choose **New → Web Service**.
2. Connect your GitHub account and pick this repository.
3. Render should auto-detect Node. If it asks:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Click **Create Web Service**. After a minute or two, Render gives you a
   public URL like `https://table-tennis-live.onrender.com`.
5. Share that link — the first person to open it is the admin, everyone
   else who opens it afterward is a guest watching live.

Every time you push new commits to GitHub, Render redeploys automatically
(and the tournament resets, since it only lives in memory).

Free-tier Render services "spin down" after periods of no traffic and take
a few seconds to wake back up on the next visit — that's fine for a casual
project like this, just know the first person to open the link after a
quiet spell might see "Connecting…" for a moment.
