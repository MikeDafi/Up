---
description: AWS feed/profile lambda operating rules for Up
globs:
  - aws/lambda/up-generate-feed.py
  - aws/lambda/up-update-user-profiles.py
  - aws/lambda/up-create-pre-signed-url.py
  - aws/lambda/up-s3-staged-to-compressed.py
---

# AWS Feed + Profile Skills (Up Project)

Use this when editing feed generation, profile updates, presigned upload, or compression lambdas.

## Non-Negotiable Data Contracts

1. **Confidence scores live under `algorithm`**
   - Read/write confidence maps from:
     - `algorithm.VIDEO_FOCUSED_FEED`
     - `algorithm.VIDEO_AUDIO_FEED`
   - Do not reintroduce root-level `VIDEO_FOCUSED_FEED` / `VIDEO_AUDIO_FEED`.

2. **DynamoDB numeric safety**
   - Never send Python `float` to DynamoDB (`TypeError: Float types are not supported`).
   - Recursively convert all nested floats with `Decimal(str(x))` before `update_item`/`put_item`.

3. **Seen checksums shape**
   - Keep client/server checksum payload shape consistent.
   - If client sends `seen_video_ids_checksums`, server should read the same key path; do not silently map to a different field unless both sides are updated.

## Feed Rate-Limit Rules

1. **Individual requests**
   - Rate-limit per feed type with:
     - `last_updated_feed_VIDEO_FOCUSED_FEED`
     - `last_updated_feed_VIDEO_AUDIO_FEED`

2. **Batch job**
   - Use a separate timestamp key (`last_batch_feed_update`).
   - Never block user real-time feed requests because batch job recently ran.

3. **Cooldown expectations**
   - Current target behavior is 1 minute cooldown for new feed generation.
   - If changing cooldown, check both user-visible UX and 429 logs.

## Performance Moves That Matter

1. Replace N+1 item lookups with parallel query strategy where possible.
2. Use projection expressions to avoid over-fetching DynamoDB items.
3. Cache global hashtag scans in module scope with TTL (7 days currently).
4. Prefer parallel I/O (`ThreadPoolExecutor`) for independent hashtag queries.

## Presigned Upload Guardrails

1. Use **presigned POST**, not PUT, when enforcing upload size.
2. Keep `content-length-range` policy in sync with client-side checks.
3. Return fields required by client upload flow: `url`, `fields`, `key`, `maxSizeBytes`.

## Compression Lambda Guardrails

1. Resolve correct PK/SK before status update (query index first if needed).
2. Always set compressed upload content type to `video/mp4`.
3. Clean `/tmp` files in `finally` to avoid storage exhaustion.
4. Prefer practical ffmpeg preset (`medium`) over high-cost presets unless explicitly requested.

## Lambda Deployment (Manual CLI, us-east-2)

No IaC — deploy via AWS CLI.

### Deploy a Lambda layer
```bash
# Package
mkdir -p python && cp <files> python/
zip -r <layer-name>.zip python/

# Publish
aws lambda publish-layer-version \
  --layer-name <layer-name> \
  --zip-file fileb://<layer-name>.zip \
  --compatible-runtimes python3.13 \
  --region us-east-2

# Attach (preserve existing layers)
aws lambda get-function-configuration --function-name <fn> --region us-east-2 --query 'Layers[].Arn'
aws lambda update-function-configuration --function-name <fn> --layers <all-layer-arns> --region us-east-2
```

### Deploy Lambda code
```bash
zip <fn>.zip <fn>.py
aws lambda update-function-code --function-name <fn> --zip-file fileb://<fn>.zip --region us-east-2
```

### Current layers on up-generate-feed
- `up-attestation-verifier` — shared attestation/session verification
- `feed-word-list` — hashtag-to-feed-type word list for new user seeding

## Required Verification After Lambda Changes

```bash
aws logs tail /aws/lambda/up-generate-feed --since 15m --region us-east-2
aws logs tail /aws/lambda/up-update-user-profiles --since 15m --region us-east-2
aws logs tail /aws/lambda/up-s3-staged-to-compressed --since 15m --region us-east-2
```

Check for:
- `TypeError: Float types are not supported`
- 500s from profile update endpoint
- feed generation 429 spikes
- compression failures or missing object transitions
