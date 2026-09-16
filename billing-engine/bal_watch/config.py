import os
import logging
from dotenv import load_dotenv
from pathlib import Path

# Load settings from .env in the current directory
current_dir = Path(__file__).resolve().parent
load_dotenv(current_dir / ".env")

class WatchConfig:
    INTERVAL_SEC = int(os.getenv('BAL_WATCH_INTERVAL_SEC', 10))
    LOW_BALANCE_THRESHOLD = float(os.getenv('BAL_WATCH_LOW_BALANCE_THRESHOLD', 10.0))
    
    REDIS_HOST = os.getenv('REDIS_HOST', '127.0.0.1')
    REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
    REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
    REDIS_DB = int(os.getenv('REDIS_DB', 2))
    REDIS_KEY_LOG = os.getenv('REDIS_KEY_LOG', 'billing:overlimit:log')
    REDIS_KEY_BLACKLIST = os.getenv('REDIS_KEY_BLACKLIST', 'blacklist:customers:overlimit')
    
    # We will import the DATABASE_DSN from the main billing-engine config
    # to avoid duplicating database connection strings.

watch_config = WatchConfig()

def setup_logger(name):
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s')
        ch.setFormatter(formatter)
        logger.addHandler(ch)
    return logger
