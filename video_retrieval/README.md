# TikTok Video Retrieval & Publishing CLI

Automated pipeline for scraping TikTok videos, downloading them, and publishing to AWS S3 with metadata.

## Features

- **Scrape** video IDs from TikTok search results
- **Extract hashtags** from individual video pages
- **Download** videos using Playwright + requests
- **Crop** videos to 9:14 aspect ratio with FFmpeg
- **Publish** to AWS S3 via Lambda
- **Automatic compression** via S3-triggered Lambda
- **Persistent browser state** to maintain login between runs

## Architecture

```
1. Scrape (get)     → TikTok Search → Extract video IDs + hashtags
2. Download         → ssstik.io → Get tikcdn URL → Download with requests
3. Publish          → Crop video → Upload to S3 staging → Invoke Lambda
4. Auto-compress    → S3 trigger → Lambda compresses → Move to final bucket
```

## Prerequisites

- Python 3.9+
- Playwright (Chromium browser)
- FFmpeg
- AWS CLI configured
- boto3

## Installation

```bash
# Install Python dependencies
pip install playwright requests boto3 click

# Install Playwright browsers
playwright install chromium

# Make CLI executable
chmod +x videos
```

## Usage

### 1. Scrape Videos

```bash
# Scrape 5 videos per category (without hashtags - fast)
./videos get -c fitness,dance,comedy -n 5

# Scrape with hashtag extraction (slower but gets real hashtags)
./videos get -c fitness -n 3 --extract-hashtags
```

**Options:**
- `-c, --categories`: Comma-separated categories (default: trending,comedy,dance)
- `-n, --count`: Videos per category (default: 10)
- `-e, --extract-hashtags`: Visit each video page to extract hashtags
- `--headless`: Run browser in headless mode

### 2. List Videos

```bash
# List all videos
./videos list

# List specific category
./videos list -c fitness
```

**Legend:**
- `⬜⬜`: Not downloaded, not published
- `💾⬜`: Downloaded, not published  
- `💾☁️`: Downloaded and published

### 3. Download Videos

```bash
# Download all undownloaded videos
./videos download --undownloaded-only

# Download specific video
./videos download -i 7280275650265632043

# Download with headless browser
./videos download --headless
```

### 4. Publish Videos

```bash
# Publish all unpublished videos
./videos publish --unpublished-only

# Publish specific video
./videos publish -i 7280275650265632043

# Publish with custom settings
./videos publish --category fitness --limit 5
```

**What happens during publish:**
1. Video cropped to 9:14 aspect ratio (720x896)
2. Uploaded to `up-staging-content` S3 bucket
3. Metadata + hashtags saved to DynamoDB via Lambda
4. S3 trigger invokes compression Lambda
5. Compressed video moved to `up-compressed-content`

### 5. Remove Duplicates

```bash
./videos dedupe
```

## Video Storage Format

Videos are stored in `video_ids.txt` as JSON lines:

```json
{
  "id": "7308066694805654826",
  "category": "fitness",
  "description": "",
  "hashtags": ["fyp", "gymtok", "fitness", "motivation"],
  "date": "2025-12-20 01:19:17",
  "downloaded": false,
  "published": false
}
```

## Hashtag Strategy

### Option 1: Fast (No extraction)
- Uses category name as hashtag (e.g., "fitness")
- Fast scraping, no individual page visits
- Good for bulk operations

### Option 2: Full Extraction (--extract-hashtags)
- Visits each video page individually
- Extracts real hashtags from TikTok
- Slower but more accurate
- **Recommended for production**

Example hashtags extracted:
```
#gymtok #fitness #motivation #fyp #trending #shoulderworkout
```

## AWS Infrastructure

### Lambda Functions

1. **up-create-video-metadata**
   - Saves video metadata to DynamoDB
   - Stores hashtags for feed matching
   - Runtime: Python 3.13

2. **up-s3-staged-to-compressed**
   - Triggered on S3 ObjectCreated
   - Compresses videos with FFmpeg
   - Moves to final bucket
   - Runtime: Python 3.13, 3GB RAM, FFmpeg layer

3. **up-generate-feed**
   - Generates personalized video feeds
   - Matches videos to users via hashtags
   - Used by mobile app

### S3 Buckets

- **up-staging-content**: Initial upload destination
- **up-compressed-content**: Final compressed videos
- Videos named: `{uuid}-{video_id}.mp4`

### DynamoDB

- **up-videometadata**: Stores video metadata + hashtags

## Troubleshooting

### Videos not appearing in app feed?
- **Problem**: Videos have no hashtags
- **Solution**: Re-scrape with `--extract-hashtags` flag
- **Verify**: Check DynamoDB for hashtag field

### Download fails?
- Check if `ssstik.io` is accessible
- Try without headless: `./videos download`
- Check browser state: `rm -rf browser_state/`

### Publish fails?
- Verify AWS credentials: `aws sts get-caller-identity`
- Check Lambda permissions
- View logs: `aws logs tail /aws/lambda/up-create-video-metadata`

## End-to-End Example

```bash
# 1. Clean start
rm video_ids.txt

# 2. Scrape 3 fitness videos with hashtags
./videos get -c fitness -n 3 --extract-hashtags

# 3. List scraped videos
./videos list

# 4. Download all
./videos download --undownloaded-only

# 5. Publish all
./videos publish --unpublished-only

# 6. Verify in S3
aws s3 ls s3://up-compressed-content/ | tail -3
```

## Files

- `videos` - Main CLI tool
- `video_ids.txt` - Video metadata storage
- `browser_state/` - Persistent browser state (login/cookies)
- `videos_downloads/` - Downloaded video files

## Performance

- Scraping: ~2-3 videos/second (without hashtag extraction)
- Hashtag extraction: ~3-5 seconds per video
- Download: ~2-5 seconds per video (depends on size)
- Publish: ~30-45 seconds per video (crop + upload + compress)

## Notes

- Browser state preserves TikTok login between runs
- Videos are automatically cropped to 9:14 for mobile feed
- S3 compression happens asynchronously (~30s delay)
- Category is used as fallback hashtag if extraction fails

