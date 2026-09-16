import json
from decimal import Decimal
from datetime import datetime
from bal_watch.config import watch_config, setup_logger
from bal_watch.redis_manager import get_redis_client

logger = setup_logger(__name__)

def _decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError

def publish_overlimit(wallet_data):
    """
    Pushes overlimit wallet data to Redis list using the centralized manager.
    """
    client = get_redis_client()
    if not client:
        return False

    try:
        payload = {
            "event_type": "wallet.overlimit",
            "timestamp": datetime.now().isoformat(),
            "data": wallet_data
        }
        
        message = json.dumps(payload, default=_decimal_default)
        client.rpush(watch_config.REDIS_KEY_LOG, message)
        
        logger.info(f"Published overlimit event for customer {wallet_data['customer_id']} to Redis list '{watch_config.REDIS_KEY_LOG}'")
        return True
    except Exception as e:
        logger.error(f"Error publishing to Redis: {e}")
        return False
