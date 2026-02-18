import json
import logging
import os
import secrets
import time

import boto3

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
nonce_table = dynamodb.Table(os.environ.get('NONCE_TABLE', 'up-attestation-nonces'))
rate_limit_table = dynamodb.Table('up-rate-limits')

NONCE_TTL_SECONDS = 300  # 5 minutes

# Rate limit: max challenge requests per IP per minute
MAX_CHALLENGES_PER_MINUTE = 10
RATE_LIMIT_WINDOW_SECONDS = 60


def _get_source_ip(event):
    """Extract the client IP from the API Gateway v2 HTTP event."""
    try:
        return event['requestContext']['http']['sourceIp']
    except (KeyError, TypeError):
        return None


def _check_ip_rate_limit(source_ip):
    """
    Enforce per-IP rate limiting on challenge generation.

    Uses a minute-bucketed key so each window auto-expires via DynamoDB TTL.
    Raises PermissionError if the IP has exceeded MAX_CHALLENGES_PER_MINUTE.
    """
    minute_bucket = int(time.time()) // RATE_LIMIT_WINDOW_SECONDS
    rate_key = f"{source_ip}#challenge#{minute_bucket}"
    ttl = (minute_bucket + 2) * RATE_LIMIT_WINDOW_SECONDS  # expire 1 window after current

    response = rate_limit_table.update_item(
        Key={'rate_key': rate_key},
        UpdateExpression='SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
        ExpressionAttributeNames={'#count': 'request_count', '#ttl': 'ttl'},
        ExpressionAttributeValues={':zero': 0, ':one': 1, ':ttl': ttl},
        ReturnValues='UPDATED_NEW',
    )
    new_count = int(response['Attributes']['request_count'])
    if new_count > MAX_CHALLENGES_PER_MINUTE:
        raise PermissionError(
            f"Rate limit exceeded: {MAX_CHALLENGES_PER_MINUTE} challenge requests per minute"
        )


def lambda_handler(event, context):
    """
    Generate a cryptographic nonce for app attestation challenge-response.

    The client calls this before performing device attestation. The returned
    nonce is stored in DynamoDB with a 5-minute TTL and must be included in
    the attestation token. The verification layer checks the nonce is valid,
    unused, and not expired before accepting the attestation.

    IP-based rate limiting is enforced to prevent DynamoDB table flooding.

    Returns:
        { "nonce": "<base64url-encoded 32-byte random value>" }
    """
    try:
        # Enforce IP-based rate limit before writing to DynamoDB
        source_ip = _get_source_ip(event)
        if source_ip:
            _check_ip_rate_limit(source_ip)

        nonce = secrets.token_urlsafe(32)  # 32 bytes of cryptographic randomness
        ttl = int(time.time()) + NONCE_TTL_SECONDS

        nonce_table.put_item(
            Item={
                'nonce': nonce,
                'ttl': ttl,
                'used': False,
                'created_at': int(time.time()),
            }
        )

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'nonce': nonce}),
        }

    except PermissionError as pe:
        return {
            'statusCode': 429,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(pe)}),
        }
    except Exception as e:
        logger.exception("Error generating nonce")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Failed to generate challenge'}),
        }

