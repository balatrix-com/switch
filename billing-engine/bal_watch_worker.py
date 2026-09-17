import os
import sys

# Ensure the root billing-engine directory is in the Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from bal_watch.main import main

if __name__ == "__main__":
    main()
