import sys
import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Append billing-engine root to path to import config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from config import DATABASE_DSN
except ImportError:
    DATABASE_DSN = os.getenv("DATABASE_URL")

from bal_watch.config import setup_logger

logger = setup_logger(__name__)

def get_db_connection():
    if not DATABASE_DSN:
        raise ValueError("DATABASE_DSN is not configured.")
    return psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor)

def fetch_wallets():
    """
    Fetches all active customer wallets from Switch DB.
    Returns a list of dictionaries.
    """
    query = """
    SELECT 
        cw.customer_id,
        c.account_code,
        cw.currency, 
        cw.fiat_balance, 
        cw.credit_limit,
        cw.credit_used,
        cw.tfn_free_minutes,
        cw.did_free_minutes,
        cw.ob_free_minutes,
        cw.is_suspended
    FROM 
        customer_wallets cw
    JOIN
        customers c ON cw.customer_id = c.id
    WHERE
        c.is_active = TRUE;
    """
    
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(query)
            wallets = cursor.fetchall()
            return [dict(w) for w in wallets]
    except Exception as e:
        logger.error(f"Error fetching wallets: {e}")
        return []
    finally:
        if conn:
            conn.close()
