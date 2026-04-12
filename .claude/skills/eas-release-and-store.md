---
description: EAS update/build/submit release rules for Up
globs:
  - eas.json
  - .github/workflows/update.yml
  - .github/workflows/build-and-submit.yml
  - app.json
---

# EAS + App Store Skills (Up Project)

Use this when shipping staging updates or App Store builds.

## Release Workflow Canonical Path

1. Push to `main` -> `Deploy to Staging` workflow publishes OTA (`eas update --branch staging`).
2. Verify staging update group exists and contains expected commit message.
3. Trigger App Store build workflow manually:
   - `.github/workflows/build-and-submit.yml`
   - `profile=production` for production/TestFlight path.

## Commands

```bash
# check latest workflow runs
gh run list --limit 5

# trigger build+submit workflow
gh workflow run ".github/workflows/build-and-submit.yml" -f profile=production

# inspect run details
gh run view <run_id>
```

## Practical Rules

1. Do not treat GitHub cache warnings as release failures if required steps are green.
2. Keep staging and production channels distinct (`staging`, `production`).
3. Do not change runtime/update compatibility settings casually during hotfixes.
4. When switching GitHub accounts locally, verify active account before push/workflow actions.

## Pre-Release Checks Specific to Up

1. Feed renders with no duplicate key warnings.
2. Manual refresh excludes already seen videos.
3. Attestation flows remain enabled in production endpoints.
4. Upload path still enforces max file size via presigned POST policy.

## Post-Release Checks

1. Confirm OTA group appears on staging branch with expected message.
2. Confirm App Store workflow reaches build+submit success.
3. Verify critical cloud logs are clean for first traffic window:
   - feed 500/429 patterns
   - user profile update errors
   - compression status transitions
