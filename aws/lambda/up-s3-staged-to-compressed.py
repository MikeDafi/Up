import logging
import boto3
import os
import re
import subprocess
import uuid

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
metadata_table = dynamodb.Table('up-videometadata')

COMPRESSED_BUCKET = "up-compressed-content"
TEMP_DIR = "/tmp"

# Must match the key format produced by up-create-pre-signed-url
VALID_KEY_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-zA-Z0-9_-]{1,50}\.(mp4|mov|m4v|webm)$'
)

VIDEOID_GSI = 'videoId-uploadedAt-index'


def update_compression_status(video_id, status):
    """Resolve the item's PK via videoId GSI, then update compressionStatus."""
    try:
        response = metadata_table.query(
            IndexName=VIDEOID_GSI,
            KeyConditionExpression='videoId = :vid',
            ExpressionAttributeValues={':vid': video_id},
            ProjectionExpression='#r, uploadedAt',
            ExpressionAttributeNames={'#r': 'region'},
            Limit=1,
        )
        items = response.get('Items', [])
        if not items:
            logger.warning("No metadata record found for videoId %s, skipping status update", video_id)
            return

        region = items[0]['region']
        uploaded_at = items[0]['uploadedAt']

        metadata_table.update_item(
            Key={'region': region, 'uploadedAt': uploaded_at},
            UpdateExpression='SET compressionStatus = :s',
            ExpressionAttributeValues={':s': status},
        )
        logger.info("Updated compressionStatus to %s for %s", status, video_id)
    except Exception as e:
        logger.error("Failed to update compressionStatus for %s: %s", video_id, e)

def list_tmp_directory():
    logger.debug("Contents of %s:", TEMP_DIR)
    for root, dirs, files in os.walk(TEMP_DIR):
        for name in files:
            logger.debug("File: %s", os.path.join(root, name))
        for name in dirs:
            logger.debug("Directory: %s", os.path.join(root, name))

def lambda_handler(event, context):
    for record in event["Records"]:
        download_path = None
        compressed_path = None
        try:
            source_bucket = record["s3"]["bucket"]["name"]
            object_key = record["s3"]["object"]["key"]
            logger.info("Processing file %s from bucket %s", object_key, source_bucket)

            if not VALID_KEY_PATTERN.match(object_key):
                raise ValueError(f"Rejecting invalid object key: {object_key!r}")

            list_tmp_directory()

            # UUID-only local filenames — object_key never touches local paths
            download_path = os.path.join(TEMP_DIR, f"{uuid.uuid4()}.mp4")
            s3_client.download_file(source_bucket, object_key, download_path)
            logger.info("Downloaded %s to %s", object_key, download_path)

            list_tmp_directory()

            compressed_path = os.path.join(TEMP_DIR, f"compressed_{uuid.uuid4()}.mp4")
            compress_video(download_path, compressed_path)

            list_tmp_directory()

            if not os.path.exists(compressed_path) or os.path.getsize(compressed_path) == 0:
                raise Exception(f"Compression failed or output file is empty: {compressed_path}")

            s3_client.upload_file(compressed_path, COMPRESSED_BUCKET, object_key)
            logger.info("Uploaded compressed file to %s/%s", COMPRESSED_BUCKET, object_key)

            update_compression_status(object_key, "READY")

            s3_client.delete_object(Bucket=source_bucket, Key=object_key)
            logger.info("Deleted original file from %s/%s", source_bucket, object_key)

        except Exception as e:
            logger.error("Error processing file %s: %s", object_key, e)
            update_compression_status(object_key, "FAILED")
            raise e
        finally:
            # Clean up /tmp files to prevent "No space left on device" on warm Lambda reuse
            for path in [download_path, compressed_path]:
                try:
                    if path and os.path.exists(path):
                        os.remove(path)
                except Exception:
                    pass


def compress_video(input_path, output_path):
    """Compress to H.264/AAC with faststart for streaming."""
    try:
        command = [
            "/opt/bin/ffmpeg",
            "-y",
            "-i", input_path,
            "-c:v", "libx264",
            "-crf", "25",
            "-preset", "medium",  # 'slower' is too expensive for Lambda
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            output_path
        ]
        logger.info("Running command: %s", ' '.join(command))
        subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        logger.info("Video compression complete: %s", output_path)
    except subprocess.CalledProcessError as e:
        logger.error("FFmpeg compression failed: %s", e.stderr.decode())
        raise e