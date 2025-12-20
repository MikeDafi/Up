import json
import boto3
import os
import uuid
import re

# Initialize the S3 client
s3 = boto3.client('s3')

# Allowed content types for video uploads
ALLOWED_CONTENT_TYPES = {
    'video/mp4',
    'video/quicktime',  # .mov
    'video/x-m4v',
    'video/webm',
}

# Allowed file extensions
ALLOWED_EXTENSIONS = {'.mp4', '.mov', '.m4v', '.webm'}

def sanitize_filename(filename):
    """
    Sanitize filename to prevent path traversal and injection attacks.
    - Removes path separators
    - Removes null bytes
    - Strips leading/trailing whitespace and dots
    - Only allows alphanumeric, dash, underscore, and single dot for extension
    """
    if not filename:
        return None
    
    # Remove path components (prevent path traversal)
    filename = os.path.basename(filename)
    
    # Remove null bytes
    filename = filename.replace('\x00', '')
    
    # Strip whitespace and dots from edges
    filename = filename.strip('. \t\n\r')
    
    if not filename:
        return None
    
    # Extract extension
    name, ext = os.path.splitext(filename)
    ext = ext.lower()
    
    # Validate extension
    if ext not in ALLOWED_EXTENSIONS:
        return None
    
    # Sanitize name part: only allow alphanumeric, dash, underscore
    name = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
    
    # Limit length
    name = name[:50]
    
    return f"{name}{ext}" if name else None

def lambda_handler(event, context):
    bucket_name = 'up-staging-content'

    try:
        # Extract and validate parameters
        query_params = event.get('queryStringParameters', {})
        if not query_params:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing query parameters'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        raw_file_name = query_params.get('fileName', '')
        content_type = query_params.get('contentType', '')
        
        # Validate content type
        if content_type not in ALLOWED_CONTENT_TYPES:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Invalid content type. Allowed: {list(ALLOWED_CONTENT_TYPES)}'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        # Sanitize filename
        sanitized_name = sanitize_filename(raw_file_name)
        if not sanitized_name:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Invalid filename. Must be a valid video file (.mp4, .mov, .m4v, .webm)'}),
                'headers': {'Content-Type': 'application/json'}
            }
        
        # Generate a unique key for the uploaded file
        file_key = f"{uuid.uuid4()}-{sanitized_name}"
        
        # Generate a pre-signed URL
        presigned_url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': file_key,
                'ContentType': content_type
            },
            ExpiresIn=300  # URL expires in 5 minutes
        )
        
        # Return the pre-signed URL and file key
        return {
            'statusCode': 200,
            'body': json.dumps({'url': presigned_url, 'key': file_key}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }
    except Exception as e:
        # Handle any errors
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }