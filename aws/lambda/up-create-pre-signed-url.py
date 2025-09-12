import json
import boto3
import os
import uuid

# Initialize the S3 client
s3 = boto3.client('s3')

def lambda_handler(event, context):
    # Replace with your bucket name
    bucket_name = 'up-staging-content'

    try:
        # Extract file name and content type from the query parameters
        file_name = event['queryStringParameters']['fileName']
        content_type = event['queryStringParameters']['contentType']
        
        # Generate a unique key for the uploaded file
        file_key = f"{uuid.uuid4()}-{file_name}"
        
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