# Local setup — status and remaining steps

## Installed and verified

| Component | State |
|---|---|
| Model router (3 tiers + failover) | ✅ working |
| Session handoff + auto-injection | ✅ working |
| `cliclick` — mouse/keyboard control | ✅ installed |
| `ffmpeg` — video editing | ✅ installed |
| `whisper-cpp` — transcription | ✅ installed + model, verified |
| `ffmpeg-full` + libass | ✅ burned-in captions verified |
| Python CA certificates | ✅ fixed system-wide |
| Screen control | ✅ verified (screenshot + cursor) |
| Agent-Reach — social read | ✅ installed |
| OpenMontage — 13 video pipelines | ✅ deps installed |
| Mail.app — email | ✅ 3 accounts |
| `gh` — GitHub | ✅ jjnotmid |
| 271 specialist agents | ✅ indexed |
| `ruflo` orchestration | ✅ v3.38.16 |

Two substitutions worth knowing about:

- `openai-whisper` does not build on Python 3.13. Replaced with **`whisper-cpp`**,
  which is faster on Mac and emits SRT directly. Verified end to end: generated
  speech → `wa-video transcribe` → correct timestamped SRT.
- Python 3.13 from python.org ships **without a CA bundle**, so every HTTPS call
  from Python failed cert verification (it broke Agent-Reach and the free proxy).
  Fixed system-wide via `Install Certificates.command`.

## Social channels

`wa-social doctor` — 4/15 platforms live (RSS, any webpage via Jina, YouTube via
yt-dlp, Bilibili). Twitter/X, Reddit, Instagram, LinkedIn need logins:
`wa-social setup`. **All read-only — Agent-Reach cannot post.**

---

## Two steps left — they need you

### 1. Schedule the morning brief

Installing a launchd job is a persistent background service, so the permission
classifier blocks an agent from doing it. Run:

```bash
wa-schedule add-daily 07:30
```

Then `wa-schedule list` to confirm. Change the time freely; add other jobs with
`wa-schedule add <name> <HH:MM> <command>`.

**A sleeping Mac runs nothing.** launchd fires a missed job once on wake, so a
03:00 job on a closed laptop runs when you open it — not at 03:00. If timing
matters, `wa-schedule awake on` (holds the system awake, lets the display sleep).

### 2. macOS permissions — DONE

- ✅ **Screen Recording** — screenshots verified
- ✅ **Accessibility** — cursor control verified (moved to 700,450 and back)
- **Automation → Mail** — will prompt on first `wa-email` use; approve it then

---

## Verify

```bash
wa-doctor
```

Everything should be green except what you have not granted yet.

## Video quick reference

```bash
wa-video autocaption raw.mp4 done.mp4   # transcribe + burn captions
wa-video cut-silence raw.mp4 tight.mp4  # auto jump-cuts
wa-video vertical tight.mp4 tiktok.mp4  # 1080x1920
```

Chain them: `cut-silence` → `vertical` → `autocaption` is the standard
short-form pipeline.
