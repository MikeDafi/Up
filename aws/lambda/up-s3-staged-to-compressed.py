import boto3
import os
import subprocess
import uuid

# Initialize S3 client
s3_client = boto3.client('s3')

# Environment variables
COMPRESSED_BUCKET = "up-compressed-content"
TEMP_DIR = "/tmp"

def list_tmp_directory():
    """Prints the contents of the /tmp directory"""
    print(f"Contents of {TEMP_DIR}:")
    for root, dirs, files in os.walk(TEMP_DIR):
        for name in files:
            print(f"File: {os.path.join(root, name)}")
        for name in dirs:
            print(f"Directory: {os.path.join(root, name)}")

def lambda_handler(event, context):
    # Process each record in the S3 event
    for record in event["Records"]:
        try:
            # Extract bucket name and object key
            source_bucket = record["s3"]["bucket"]["name"]
            object_key = record["s3"]["object"]["key"]
            print(f"Processing file {object_key} from bucket {source_bucket}")

            # Print contents of /tmp before processing
            list_tmp_directory()

            # Download the video from the source S3 bucket
            download_path = os.path.join(TEMP_DIR, str(uuid.uuid4()) + os.path.basename(object_key))
            s3_client.download_file(source_bucket, object_key, download_path)
            print(f"Downloaded {object_key} to {download_path}")

            # Print contents of /tmp after downloading the video
            list_tmp_directory()

            # Define the compressed file path
            compressed_path = os.path.join(TEMP_DIR, "compressed_" + os.path.basename(object_key))

            # Compress the video using FFmpeg
            compress_video(download_path, compressed_path)

            # Print contents of /tmp after compression
            list_tmp_directory()

            # Validate compressed file
            if not os.path.exists(compressed_path) or os.path.getsize(compressed_path) == 0:
                raise Exception(f"Compression failed or output file is empty: {compressed_path}")

            # Upload the compressed video to the target S3 bucket
            compressed_key = object_key  # Preserve original folder structure and file name
            s3_client.upload_file(compressed_path, COMPRESSED_BUCKET, compressed_key)
            print(f"Uploaded compressed file to {COMPRESSED_BUCKET}/{compressed_key}")

            # Delete the original video from the staging bucket
            s3_client.delete_object(Bucket=source_bucket, Key=object_key)
            print(f"Deleted original file from {source_bucket}/{object_key}")

            # Print contents of /tmp after cleaning up
            list_tmp_directory()

        except Exception as e:
            print(f"Error processing file {object_key}: {e}")
            raise e


def compress_video(input_path, output_path):
    """Compress the video using FFmpeg to roughly 720p"""
    try:
        # FFmpeg command to compress the video and resize to 720p
        command = [
            "/opt/bin/ffmpeg",  # FFmpeg binary location in the Lambda layer
            "-y",  # Overwrite output file if it exists
            "-i", input_path,  # Input file
            "-c:v", "libx264",  # Use H.264 codec
            # "-vf", "scale=trunc(iw/2)*2:720",  # Resize to 720p with even width
            "-crf", "25",  # Constant Rate Factor (lower is higher quality)
            "-preset", "slower",  # Encoding speed/quality tradeoff
            "-c:a", "aac",  # Audio codec
            "-b:a", "128k",  # Audio bitrate
            "-movflags", "+faststart",  # Optimize for streaming
            output_path
        ]
        print(f"Running command: {' '.join(command)}")
        subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        print(f"Video compression complete: {output_path}")
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg compression failed: {e.stderr.decode()}")
        raise e