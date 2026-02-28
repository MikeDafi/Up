"""
Lightweight attestation verification endpoint.

Accepts an X-Attestation-Token header, verifies it via the shared attestation
layer, and returns a session JWT. This allows the client to exchange attestation
credentials for a JWT proactively — before making any business API calls.
"""

import json
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    try:
        from attestation_verifier import verify_request
        result = verify_request(event)

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps(result),
        }
    except PermissionError as pe:
        return {
            'statusCode': 403,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(pe)}),
        }
    except Exception:
        logger.exception("Attestation verification failed")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Verification failed'}),
        }
