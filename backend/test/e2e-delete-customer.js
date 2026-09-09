// Automated E2E test script for Customer Delete API
const BASE_URL = 'http://127.0.0.1:3100/api/v1';

async function runTests() {
  console.log('=== Starting Customer Delete API E2E Verification ===\n');

  // Step 1: Create a test customer
  const randomCode = 'DEL_TEST_' + Math.floor(1000 + Math.random() * 9000);
  console.log(`[1] Creating test customer (Account Code: ${randomCode})...`);
  const createRes = await fetch(`${BASE_URL}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountCode: randomCode,
      name: 'Automated Delete Test Customer',
      creditBalance: 150,
      currency: 'USD',
      isActive: true,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create customer: ${createRes.status} ${await createRes.text()}`);
  }

  const createdCustomer = await createRes.json();
  const customerId = createdCustomer.id;
  console.log(`✓ Customer created successfully. ID: ${customerId}, AccountCode: ${createdCustomer.accountCode}\n`);

  // Step 2: Verify customer is retrievable
  console.log(`[2] Verifying customer exists via GET /customers/${customerId}...`);
  const getRes = await fetch(`${BASE_URL}/customers/${customerId}`);
  if (!getRes.ok) {
    throw new Error(`Failed to retrieve customer: ${getRes.status} ${await getRes.text()}`);
  }
  const fetchedCustomer = await getRes.json();
  console.log(`✓ Customer found. Name: "${fetchedCustomer.name}"\n`);

  // Step 3: Delete the customer via DELETE /customers/:id
  console.log(`[3] Invoking DELETE /customers/${customerId}...`);
  const deleteRes = await fetch(`${BASE_URL}/customers/${customerId}`, {
    method: 'DELETE',
  });

  if (!deleteRes.ok) {
    throw new Error(`DELETE failed: ${deleteRes.status} ${await deleteRes.text()}`);
  }

  const deleteData = await deleteRes.json();
  console.log(`✓ Delete response:`, deleteData);

  if (!deleteData.success || deleteData.id !== customerId) {
    throw new Error(`Assertion failed on delete payload: ${JSON.stringify(deleteData)}`);
  }
  console.log(`✓ Assertion passed: Customer deletion confirmed.\n`);

  // Step 4: Verify customer is no longer found (GET should return 404)
  console.log(`[4] Verifying customer is deleted via GET /customers/${customerId}...`);
  const verifyGetRes = await fetch(`${BASE_URL}/customers/${customerId}`);
  if (verifyGetRes.status !== 404) {
    throw new Error(`Expected 404 Not Found, but received status ${verifyGetRes.status}`);
  }
  console.log(`✓ Confirmed 404 Not Found as expected.\n`);

  // Step 5: Verify calling DELETE on already deleted customer returns 404
  console.log(`[5] Verifying DELETE on non-existent/already deleted customer returns 404...`);
  const secondDeleteRes = await fetch(`${BASE_URL}/customers/${customerId}`, {
    method: 'DELETE',
  });
  if (secondDeleteRes.status !== 404) {
    throw new Error(`Expected 404 Not Found on repeated delete, but got ${secondDeleteRes.status}`);
  }
  console.log(`✓ Confirmed 404 Not Found on duplicate delete.\n`);

  // Step 6: Verify calling DELETE with totally invalid ID returns 404
  console.log(`[6] Verifying DELETE /customers/invalid-nonexistent-id returns 404...`);
  const invalidDeleteRes = await fetch(`${BASE_URL}/customers/invalid-nonexistent-id`, {
    method: 'DELETE',
  });
  if (invalidDeleteRes.status !== 404) {
    throw new Error(`Expected 404 Not Found on invalid ID, but got ${invalidDeleteRes.status}`);
  }
  console.log(`✓ Confirmed 404 Not Found for invalid ID.\n`);

  console.log('🎉 ALL AUTOMATED E2E TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
