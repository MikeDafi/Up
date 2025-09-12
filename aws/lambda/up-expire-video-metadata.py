import boto3
from datetime import datetime, timedelta, timezone


# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
DAYS_OLD = 7

def expire_table_items(table_name, partition_key, sort_key, timestamp_key, days_expired):
    table = dynamodb.Table(table_name)

    # Calculate the cutoff timestamp (n days ago)
    days_expired_ago = datetime.now(timezone.utc) - timedelta(days=days_expired)

    # Scan DynamoDB to find items older than n days
    response = table.scan()  # Replace with a query if you use a GSI for filtering
    items = response.get('Items', [])
    
    # Find items older than days_expired_ago
    old_items = []
    for item in items:
        uploaded_at = item.get(timestamp_key)
        if uploaded_at:
            try:
                # Parse the uploadedAt timestamp
                item_time = datetime.fromisoformat(uploaded_at)
                
                # Make naive datetime offset-aware (assumes UTC timezone if missing)
                if item_time.tzinfo is None:
                    item_time = item_time.replace(tzinfo=timezone.utc)
                
                # Compare timestamps
                if item_time < days_expired_ago:
                    old_items.append(item)
            except ValueError:
                print(f"Skipping invalid timestamp: {uploaded_at}")


    # Delete old items
    for old_item in old_items:
        try:
            table.delete_item(
                Key={
                    partition_key: old_item[partition_key],
                    sort_key: old_item[sort_key] 
                }
            )
        except Exception as e:
            print(f"Failed to delete {old_item} - {e}")

    return len(old_items)

def lambda_handler(event, context):
    # Get the table reference
    video_metadatas_deleted = expire_table_items("up-videometadata", 'region', 'uploadedAt', "uploadedAt", DAYS_OLD)
    hashtags_deleted = expire_table_items("up-hashtag", 'hashtag', 'timestamp', "timestamp", DAYS_OLD)

    # Return the response for debugging or chaining
    return {
        'statusCode': 200,
        'body': f"Deleted {video_metadatas_deleted} video metadatas and {hashtags_deleted} hashtags older than {DAYS_OLD} days."
    }