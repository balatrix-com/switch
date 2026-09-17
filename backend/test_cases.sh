#!/usr/bin/env bash
# ==============================================================================
# BSWITCHSUB INTEGRATION TEST SUITE (CURL VERIFICATION)
# Switch Backend (Port 3100) -> bswitchsub (Port 5010)
# ==============================================================================

SWITCH_URL="http://localhost:3100/api/v1"

echo "======================================================================"
echo "1. HEALTH CHECKS & PREREQUISITES"
echo "======================================================================"

# [TEST 1.1] Switch Backend Health Check
# Expected: HTTP 200 { "status": "ok" }
echo -e "\n[TEST 1.1] Checking Switch Backend Health..."
curl -s -i -X GET "${SWITCH_URL}/health"

echo -e "\n\n======================================================================"
echo "2. PLANS CATALOG MANAGEMENT (HAPPY PATHS & EDGE CASES)"
echo "======================================================================"

# [TEST 2.1] List all plans
# Expected: HTTP 200 with JSON Array of plans
echo -e "\n[TEST 2.1] Fetch all plans (GET /plans)..."
curl -s -X GET "${SWITCH_URL}/plans"

# [TEST 2.2] Filter active asset plans
# Expected: HTTP 200 with JSON Array of active asset plans
echo -e "\n\n[TEST 2.2] Filter active asset plans (GET /plans?status=active&plan_category=asset)..."
curl -s -X GET "${SWITCH_URL}/plans?status=active&plan_category=asset"

# [TEST 2.3] Create a new Asset Plan (Happy Path)
# Expected: HTTP 201 Created with created plan JSON object
echo -e "\n\n[TEST 2.3] Create New Asset Plan (POST /plans)..."
curl -s -i -X POST "${SWITCH_URL}/plans" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_name": "Premium High-Volume Inbound",
    "plan_category": "asset",
    "asset_type": "TFN",
    "otc": 50.00,
    "recurring_cost": 150.00,
    "validity_value": 30,
    "validity_unit": "days",
    "tfn_asset_count": 3,
    "did_asset_count": 10,
    "tfn_free_minutes": 2500,
    "did_free_minutes": 1000,
    "status": "active"
  }'

# [TEST 2.4] Edge Case: Validation Failure (Empty Plan Name / Missing Category)
# Expected: HTTP 400 Bad Request
echo -e "\n\n[TEST 2.4] Edge Case: Invalid Plan Payload (POST /plans)..."
curl -s -i -X POST "${SWITCH_URL}/plans" \
  -H "Content-Type: application/json" \
  -d '{
    "otc": -10.00
  }'

# [TEST 2.5] Edge Case: Non-existent Plan ID
# Expected: HTTP 404 Not Found
echo -e "\n\n[TEST 2.5] Edge Case: Fetch Non-Existent Plan (GET /plans/non_existent_999)..."
curl -s -i -X GET "${SWITCH_URL}/plans/non_existent_999"

echo -e "\n\n======================================================================"
echo "3. CUSTOMER WALLET MANAGEMENT (HAPPY PATHS & EDGE CASES)"
echo "======================================================================"

# [TEST 3.1] Initialize Customer Wallet
# Expected: HTTP 201 Created or 200 OK
echo -e "\n[TEST 3.1] Initialize Customer Wallet (POST /wallets/customer)..."
curl -s -i -X POST "${SWITCH_URL}/wallets/customer" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_demo_001",
    "fiat_balance": 250.00,
    "currency": "USD"
  }'

# [TEST 3.2] Fetch Customer Multi-pocket Wallet (Happy Path)
# Expected: HTTP 200 with { customer_id, fiat_balance, tfn_free_minutes, did_free_minutes, ob_free_minutes }
echo -e "\n\n[TEST 3.2] Fetch Customer Wallet (GET /wallets/cust_demo_001)..."
curl -s -X GET "${SWITCH_URL}/wallets/cust_demo_001"

# [TEST 3.3] Adjust / Top-up Customer Wallet
# Expected: HTTP 200 with updated wallet balances
echo -e "\n\n[TEST 3.3] Adjust Customer Free Minutes Allowance (PATCH /wallets/cust_demo_001)..."
curl -s -i -X PATCH "${SWITCH_URL}/wallets/cust_demo_001" \
  -H "Content-Type: application/json" \
  -d '{
    "fiat_balance": 500.00,
    "tfn_free_minutes": 1000,
    "did_free_minutes": 500,
    "ob_free_minutes": 2000
  }'

# [TEST 3.4] Deduct Usage / Free Minutes (Live Rating Simulation)
# Expected: HTTP 200 with deducted minutes and remaining balance
echo -e "\n\n[TEST 3.4] Deduct Usage from Free Minute Bucket (POST /wallets/deduct)..."
curl -s -i -X POST "${SWITCH_URL}/wallets/deduct" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_demo_001",
    "usage_type": "TFN",
    "duration_seconds": 180
  }'

# [TEST 3.5] Edge Case: Deduct with Invalid Usage Type
# Expected: HTTP 400 Bad Request
echo -e "\n\n[TEST 3.5] Edge Case: Deduct with Invalid Usage Type (POST /wallets/deduct)..."
curl -s -i -X POST "${SWITCH_URL}/wallets/deduct" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_demo_001",
    "usage_type": "INVALID_TYPE",
    "duration_seconds": 60
  }'

echo -e "\n\n======================================================================"
echo "ALL VERIFICATION TESTS EXECUTED"
echo "======================================================================"
