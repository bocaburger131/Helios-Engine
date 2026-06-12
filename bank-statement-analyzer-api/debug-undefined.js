// Test the validation logic
console.log('arguments.length when calling with undefined:', );

function testFunc(transactions, openingBalance) {
  console.log('arguments.length:', arguments.length);
  console.log('openingBalance:', openingBalance);
  console.log('typeof openingBalance:', typeof openingBalance);
  console.log('openingBalance === undefined:', openingBalance === undefined);
}

testFunc([], undefined);
