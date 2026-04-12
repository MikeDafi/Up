---
description: Video CLI operations for sourcing, download, and publish in Up
globs:
  - video_retrieval/videos
  - video_retrieval/**
---

# Video CLI Skills (Up Project)

Use this when running or editing the `video_retrieval/videos` pipeline.

## Standard Execution Pattern

Run as separate threads when large batches are involved:

1. Thread A: scrape + download
2. Thread B: publish

This avoids publish waiting for long scrape/download phases.

## Commands That Match Current Project Flow

```bash
# scrape with details
./video_retrieval/videos get -c "fitness,comedy,travel" -n 10 --extract-details --headless

# download only missing
./video_retrieval/videos download --undownloaded-only --headless

# publish only unpublished
./video_retrieval/videos publish --unpublished-only
```

## Known Failure Modes + What To Do

1. **Stuck during details extraction**
   - Symptom: no category progress for minutes, process still alive.
   - Action: stop stuck process, resume from remaining categories only.

2. **Publish fails with hashtag validation**
   - Server requires >=3 hashtags and no duplicates.
   - Ensure CLI normalizes/dedupes hashtags before submit.

3. **S3 verify 404 right after publish**
   - Usually compression lag, not always permanent failure.
   - Re-run publish pass later for unfinished records.

4. **Heavy local CPU during publish**
   - ffmpeg may run very hot with slow presets.
   - Prefer `medium` unless quality testing explicitly needs slower.

## Content Policy for This Project

1. TikTok scraping is not copyright-safe by default.
2. For dummy/seed content intended for production-like use, ingest from copyright-free licensed sources only.
3. Keep source provenance when possible (provider, URL, license notes).

## Operational Guardrails

1. Keep long-running jobs in background and monitor terminal outputs.
2. Do not start duplicate scrape/download jobs accidentally.
3. Resume with targeted categories instead of restarting full 25-category runs.
4. If publish and download run concurrently, run final publish pass after download completes.
