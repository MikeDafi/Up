"""
Attestation verification layer for Up Lambda functions (iOS App Attest + session JWT).

Env vars: JWT_SECRET, NONCE_TABLE, ATTESTED_KEYS_TABLE, APPLE_TEAM_ID,
          APPLE_BUNDLE_ID, BYPASS_ATTESTATION
Deps:     PyJWT, cbor2, cryptography (lazy-imported)
"""

import json
import os
import time

import boto3


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

JWT_SECRET = os.environ.get('JWT_SECRET', '')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_SECONDS = 3600  # 1 hour

NONCE_TABLE = os.environ.get('NONCE_TABLE', 'up-attestation-nonces')
ATTESTED_KEYS_TABLE = os.environ.get('ATTESTED_KEYS_TABLE', 'up-attested-keys')

APPLE_TEAM_ID = os.environ.get('APPLE_TEAM_ID', '')
APPLE_BUNDLE_ID = os.environ.get('APPLE_BUNDLE_ID', 'com.failco.Splytt')
APPLE_APP_ID = f"{APPLE_TEAM_ID}.{APPLE_BUNDLE_ID}"

BYPASS_ATTESTATION = os.environ.get('BYPASS_ATTESTATION', 'false').lower() == 'true'

# Apple App Attestation Root CA — downloaded from
# https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
# Pinned here to avoid runtime network dependency and MITM risk.
APPLE_APP_ATTEST_ROOT_CA_PEM = b"""\
-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----
"""

dynamodb = boto3.resource('dynamodb')
nonce_table = dynamodb.Table(NONCE_TABLE)
attested_keys_table = dynamodb.Table(ATTESTED_KEYS_TABLE)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def verify_request(event):
    """Returns {'device_id': ...} and optionally {'session_token': ...}. Raises PermissionError."""
    if BYPASS_ATTESTATION:
        return {}

    # Direct Lambda invocations (boto3) are IAM-authenticated — skip attestation
    if not event.get('requestContext') and not event.get('headers'):
        return {}

    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET environment variable is not set")

    headers = _normalize_headers(event.get('headers', {}))

    auth_header = headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        claims = _verify_session_jwt(token)
        return {'device_id': claims.get('device_id')}

    attestation_raw = headers.get('x-attestation-token', '')
    if not attestation_raw:
        raise PermissionError("Missing authentication. Provide Authorization or X-Attestation-Token header.")

    try:
        attestation = json.loads(attestation_raw)
    except (json.JSONDecodeError, TypeError):
        raise PermissionError("Malformed attestation token")

    platform = attestation.get('platform', '').lower()
    if platform != 'ios':
        raise PermissionError(f"Unsupported platform: {platform}. Only iOS is supported.")

    nonce = attestation.get('nonce', '')
    attestation_type = attestation.get('type', 'attestation')

    _consume_nonce(nonce)

    if attestation_type == 'assertion':
        device_id = _verify_apple_assertion(attestation, nonce)
    else:
        device_id = _verify_apple_attestation(attestation, nonce)

    session_token = _issue_session_jwt(device_id, platform)
    return {'session_token': session_token, 'device_id': device_id}


# ---------------------------------------------------------------------------
# Nonce management
# ---------------------------------------------------------------------------

def _consume_nonce(nonce):
    """Atomically consume a nonce (replay prevention)."""
    if not nonce:
        raise PermissionError("Missing nonce")

    try:
        nonce_table.update_item(
            Key={'nonce': nonce},
            UpdateExpression='SET #used = :true_val',
            ConditionExpression='attribute_exists(nonce) AND #used = :false_val AND #ttl > :now',
            ExpressionAttributeNames={
                '#used': 'used',
                '#ttl': 'ttl',
            },
            ExpressionAttributeValues={
                ':true_val': True,
                ':false_val': False,
                ':now': int(time.time()),
            },
            ReturnValues='ALL_NEW',
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        raise PermissionError("Invalid, expired, or already-used nonce")


# ---------------------------------------------------------------------------
# Session JWT
# ---------------------------------------------------------------------------

def _issue_session_jwt(device_id, platform):
    import jwt as _jwt
    now = int(time.time())
    payload = {
        'device_id': device_id,
        'platform': platform,
        'iat': now,
        'exp': now + JWT_EXPIRY_SECONDS,
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _verify_session_jwt(token):
    import jwt as _jwt
    try:
        return _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except _jwt.ExpiredSignatureError:
        raise PermissionError("Session expired. Re-attest to continue.")
    except _jwt.InvalidTokenError as e:
        raise PermissionError(f"Invalid session token: {e}")


# ---------------------------------------------------------------------------
# Apple certificate chain verification
# ---------------------------------------------------------------------------

def _verify_certificate_chain(x5c):
    """
    Verify that the x5c certificate chain (DER-encoded certs) chains back to
    Apple's pinned App Attestation Root CA.

    x5c[0] = leaf (credCert), x5c[1] = intermediate, ... , root is pinned.
    Raises PermissionError if the chain is invalid.
    """
    from cryptography import x509 as _x509
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes
    import datetime

    root_cert = _x509.load_pem_x509_certificate(APPLE_APP_ATTEST_ROOT_CA_PEM)

    chain_certs = []
    for der_bytes in x5c:
        try:
            chain_certs.append(_x509.load_der_x509_certificate(der_bytes))
        except Exception:
            raise PermissionError("Malformed certificate in x5c chain")

    # Build the ordered chain: [leaf, intermediate(s)..., root]
    # The root is pinned — append it as the trust anchor
    chain_certs.append(root_cert)

    now = datetime.datetime.now(datetime.timezone.utc)
    for i in range(len(chain_certs) - 1):
        child = chain_certs[i]
        parent = chain_certs[i + 1]

        # 1. Check the child's issuer matches the parent's subject
        if child.issuer != parent.subject:
            raise PermissionError(
                f"Certificate chain broken: cert[{i}] issuer does not match cert[{i+1}] subject"
            )

        # 2. Check validity period
        if now < child.not_valid_before_utc or now > child.not_valid_after_utc:
            raise PermissionError(f"Certificate cert[{i}] is not within its validity period")

        # 3. Verify the child's signature using the parent's public key.
        #    tbs_certificate_bytes is the raw TBSCertificate — verify() hashes it
        #    internally using the algorithm declared in the child cert.
        try:
            parent_public_key = parent.public_key()
            sig_hash = _hash_for_algorithm(child.signature_hash_algorithm)
            parent_public_key.verify(
                child.signature,
                child.tbs_certificate_bytes,
                ec.ECDSA(sig_hash),
            )
        except PermissionError:
            raise  # Re-raise unsupported algorithm errors
        except Exception:
            raise PermissionError(
                f"Certificate chain signature verification failed at cert[{i}]"
            )

    # Verify the root cert is self-signed (trust anchor sanity check)
    if root_cert.issuer != root_cert.subject:
        raise PermissionError("Pinned root CA is not self-signed")


def _hash_for_algorithm(sig_hash_algo):
    """Map a certificate's signature hash algorithm to a cryptography hash instance."""
    from cryptography.hazmat.primitives import hashes
    name = sig_hash_algo.name.upper()
    if name == 'SHA256':
        return hashes.SHA256()
    elif name == 'SHA384':
        return hashes.SHA384()
    elif name == 'SHA512':
        return hashes.SHA512()
    raise PermissionError(f"Unsupported signature hash algorithm: {name}")


# ---------------------------------------------------------------------------
# Apple App Attest — full attestation (first time per device)
# ---------------------------------------------------------------------------

def _verify_apple_attestation(attestation, nonce):
    """Verify first-time Apple App Attest, store public key, return device_id."""
    token_b64 = attestation.get('token', '')
    key_id = attestation.get('key_id', '')

    if not token_b64 or not key_id:
        raise PermissionError("Missing Apple attestation token or key_id")

    import base64
    import hashlib
    import cbor2
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization

    try:
        token_bytes = base64.b64decode(token_b64)
        attestation_obj = cbor2.loads(token_bytes)
    except Exception as e:
        raise PermissionError(f"Failed to decode Apple attestation: {e}")

    fmt = attestation_obj.get('fmt', '')
    if fmt != 'apple-appattest':
        raise PermissionError(f"Unexpected attestation format: {fmt}")

    att_stmt = attestation_obj.get('attStmt', {})
    auth_data = attestation_obj.get('authData', b'')

    x5c = att_stmt.get('x5c', [])
    if not x5c or len(x5c) < 2:
        raise PermissionError("Invalid certificate chain in attestation")

    _verify_certificate_chain(x5c)

    cred_cert = x509.load_der_x509_certificate(x5c[0])

    client_data_hash = hashlib.sha256(nonce.encode('utf-8')).digest()
    composite = hashlib.sha256(auth_data + client_data_hash).digest()  # SHA256(authData || clientDataHash)

    APPLE_NONCE_OID = x509.ObjectIdentifier('1.2.840.113635.100.8.2')
    try:
        nonce_ext = cred_cert.extensions.get_extension_for_oid(APPLE_NONCE_OID)
        ext_value = nonce_ext.value.value
        if composite not in ext_value:
            raise PermissionError("Nonce mismatch in Apple attestation")
    except x509.ExtensionNotFound:
        raise PermissionError("Nonce extension not found in Apple attestation certificate")

    if len(auth_data) < 37:
        raise PermissionError("authData too short")

    rp_id_hash = auth_data[:32]
    expected_rp_id_hash = hashlib.sha256(APPLE_APP_ID.encode('utf-8')).digest()
    if rp_id_hash != expected_rp_id_hash:
        raise PermissionError("App ID mismatch in Apple attestation")

    public_key_pem = cred_cert.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('utf-8')

    attested_keys_table.put_item(
        Item={
            'key_id': key_id,
            'public_key_pem': public_key_pem,
            'platform': 'ios',
            'attested_at': int(time.time()),
            'assertion_counter': 0,
        }
    )

    return f"ios:{key_id}"


# ---------------------------------------------------------------------------
# Apple App Attest — assertion (lightweight, subsequent requests)
# ---------------------------------------------------------------------------

def _verify_apple_assertion(assertion, nonce):
    """Verify a subsequent Apple assertion against the stored public key."""
    token_b64 = assertion.get('token', '')
    key_id = assertion.get('key_id', '')

    if not token_b64 or not key_id:
        raise PermissionError("Missing Apple assertion token or key_id")

    import base64
    import hashlib
    import cbor2
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    response = attested_keys_table.get_item(Key={'key_id': key_id})
    stored_key = response.get('Item')
    if not stored_key:
        raise PermissionError("Unknown key_id. Device must re-attest.")

    try:
        token_bytes = base64.b64decode(token_b64)
        assertion_obj = cbor2.loads(token_bytes)
    except Exception as e:
        raise PermissionError(f"Failed to decode Apple assertion: {e}")

    authenticator_data = assertion_obj.get('authenticatorData', b'')
    signature = assertion_obj.get('signature', b'')

    if not authenticator_data or not signature:
        raise PermissionError("Incomplete assertion data")

    # Anti-replay: counter must increment
    if len(authenticator_data) >= 37:
        counter = int.from_bytes(authenticator_data[33:37], byteorder='big')
        stored_counter = int(stored_key.get('assertion_counter', 0))
        if counter <= stored_counter:
            raise PermissionError("Assertion counter did not increment (possible replay)")

        attested_keys_table.update_item(
            Key={'key_id': key_id},
            UpdateExpression='SET assertion_counter = :c',
            ExpressionAttributeValues={':c': counter},
        )

    client_data_hash = hashlib.sha256(nonce.encode('utf-8')).digest()
    composite_data = authenticator_data + client_data_hash

    public_key = serialization.load_pem_public_key(
        stored_key['public_key_pem'].encode('utf-8')
    )

    try:
        public_key.verify(signature, composite_data, ec.ECDSA(hashes.SHA256()))
    except Exception:
        raise PermissionError("Invalid assertion signature")

    return f"ios:{key_id}"


# ---------------------------------------------------------------------------
# IDOR protection — device_id ↔ user_id binding
# ---------------------------------------------------------------------------

def enforce_user_binding(device_id, user_id):
    """TOFU binding: device_id → user_id. Raises PermissionError on mismatch."""
    if not device_id or not user_id:
        return

    raw_key_id = device_id.split(':', 1)[-1] if ':' in device_id else device_id

    response = attested_keys_table.get_item(Key={'key_id': raw_key_id})
    item = response.get('Item')

    if not item:
        raise PermissionError("Device not attested")

    bound_user_id = item.get('bound_user_id')

    if not bound_user_id:
        try:
            attested_keys_table.update_item(
                Key={'key_id': raw_key_id},
                UpdateExpression='SET bound_user_id = :uid',
                ConditionExpression='attribute_not_exists(bound_user_id)',
                ExpressionAttributeValues={':uid': user_id},
            )
        except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
            response = attested_keys_table.get_item(Key={'key_id': raw_key_id})
            item = response.get('Item', {})
            if item.get('bound_user_id') != user_id:
                raise PermissionError("User ID mismatch: this device is bound to a different user")
    elif bound_user_id != user_id:
        raise PermissionError("User ID mismatch: this device is bound to a different user")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_headers(headers):
    if not headers:
        return {}
    return {k.lower(): v for k, v in headers.items()}
