# Wavestation

A music analytics dashboard powered by your Spotify data. See your top artists, tracks, genres, decade breakdowns, playlist curation stats, momentum trends, and more.

**Live:** [https://wavestation.app](https://wavestation.app)

## Local Development

### 1. Create a Spotify App

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set the **Redirect URI** to `http://127.0.0.1:3000/callback`
4. Note your **Client ID** and **Client Secret**

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
SESSION_SECRET=any_random_string
```

### 3. Install & Run

```bash
npm install
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and sign in with Spotify.

## Railway Deployment

### Environment Variables

Set these in your Railway service settings:

| Variable | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | Your Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify app client secret |
| `SPOTIFY_REDIRECT_URI` | `https://wavestation.app/callback` |
| `SESSION_SECRET` | A long random string (e.g. `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |

### Spotify Developer Dashboard

Add `https://wavestation.app/callback` as a **Redirect URI** in your Spotify app settings (in addition to the local dev one).

## Features

- **Listening History** — top artists, tracks, recently played (4 weeks / 6 months / all time)
- **Playlist Analysis** — most curated artists & tracks, genre/decade breakdowns with filters
- **Genre Momentum** — which genres/decades/artists are trending up or cooling down
- **Trends Over Time** — interactive charts for genre, decade, and artist timelines
- **Library Stats** — total tracks, artists, playlists, saved items
