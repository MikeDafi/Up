import json
import logging
import boto3
import os
import uuid
import re

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')

ALLOWED_CONTENT_TYPES = {
    'video/mp4',
    'video/quicktime',
    'video/x-m4v',
    'video/webm',
}

ALLOWED_EXTENSIONS = {'.mp4', '.mov', '.m4v', '.webm'}
MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024

def sanitize_filename(filename):
    """Strip path traversal, null bytes, and non-alphanumeric chars. Returns None if invalid."""
    if not filename:
        return None

    filename = os.path.basename(filename)
    filename = filename.replace('\x00', '')
    filename = filename.strip('. \t\n\r')

    if not filename:
        return None

    name, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in ALLOWED_EXTENSIONS:
        return None

    name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)[:50]

    return f"{name}{ext}" if name else None

def lambda_handler(event, context):
    bucket_name = 'up-staging-content'

    try:
        from attestation_verifier import verify_request
        attestation_result = verify_request(event)

        query_params = event.get('queryStringParameters', {})
        if not query_params:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing query parameters'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        raw_file_name = query_params.get('fileName', '')
        content_type = query_params.get('contentType', '')

        if content_type not in ALLOWED_CONTENT_TYPES:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Invalid content type. Allowed: {list(ALLOWED_CONTENT_TYPES)}'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        sanitized_name = sanitize_filename(raw_file_name)
        if not sanitized_name:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Invalid filename. Must be a valid video file (.mp4, .mov, .m4v, .webm)'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        file_key = f"{uuid.uuid4()}-{sanitized_name}"

        # Presigned POST (not presigned URL) — supports server-side content-length enforcement
        presigned_post = s3.generate_presigned_post(
            Bucket=bucket_name,
            Key=file_key,
            Fields={
                'Content-Type': content_type,
            },
            Conditions=[
                ['content-length-range', 1, MAX_UPLOAD_SIZE_BYTES],
                {'Content-Type': content_type},
            ],
            ExpiresIn=300
        )
        
        response_body = {
            'url': presigned_post['url'],
            'fields': presigned_post['fields'],
            'key': file_key,
            'maxSizeBytes': MAX_UPLOAD_SIZE_BYTES,
        }
        if attestation_result.get('session_token'):
            response_body['session_token'] = attestation_result['session_token']

        return {
            'statusCode': 200,
            'body': json.dumps(response_body),
            'headers': {
                'Content-Type': 'application/json'
            }
        }
    except PermissionError as pe:
        return {
            'statusCode': 403,
            'body': json.dumps({'error': str(pe)}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }
    except Exception as e:
        logger.exception("Error generating pre-signed URL")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal server error'}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }