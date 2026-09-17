import redis
from bal_watch.config import watch_config, setup_logger

logger = setup_logger(__name__)

class RedisManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RedisManager, cls).__new__(cls)
            cls._instance.client = cls._instance._create_client()
        return cls._instance

    def _create_client(self):
        """Initialize and return a Redis client instance."""
        try:
            client = redis.StrictRedis(
                host=watch_config.REDIS_HOST,
                port=watch_config.REDIS_PORT,
                password=watch_config.REDIS_PASSWORD,
                db=watch_config.REDIS_DB,
                decode_responses=True,
                socket_timeout=3
            )
            # Test connection
            client.ping()
            logger.info(f"Connected to Redis at {watch_config.REDIS_HOST}:{watch_config.REDIS_PORT}")
            return client
        except Exception as e:
            logger.warning(f"Failed to connect to Redis ({watch_config.REDIS_HOST}:{watch_config.REDIS_PORT}): {e}. Running without Redis sync.")
            return None

    def get_client(self):
        """Public accessor for the Redis client."""
        return self.client

def get_redis_client():
    """Helper function to get the singleton Redis client."""
    return RedisManager().get_client()

def sync_blacklist_set(overlimit_wallets):
    """
    Maintains a 'live' set of over-limit customers in Redis for instant call blocking.
    Logic: DELETE the key, then SADD current IDs.
    """
    client = get_redis_client()
    if not client:
        # Silently fail if redis is not connected (useful for local testing)
        return False

    set_key = watch_config.REDIS_KEY_BLACKLIST
    try:
        # Extract unique customer IDs
        customer_ids = list(set([w['customer_id'] for w in overlimit_wallets]))
        
        # Use a pipeline for atomicity
        pipe = client.pipeline()
        pipe.delete(set_key)
        if customer_ids:
            pipe.sadd(set_key, *customer_ids)
        pipe.execute()
        
        logger.info(f"Synchronized {len(customer_ids)} customers to Redis set '{set_key}'")
        return True
    except Exception as e:
        logger.error(f"Error syncing Redis set '{set_key}': {e}")
        return False
