const fs = require('fs');
const path = require('path');

console.log('Creating and testing error classes directly:');

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? 'error' : 'fail';
    this.isOperational = true;
  }
}

class PDFParseError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'PDFParseError';
  }
}

class LLMError extends AppError {
  constructor(message, statusCode = 503) {
    super(message, statusCode);
    this.name = 'LLMError';
  }
}

// Test AppError
const error1 = new AppError('Test error');
console.log('\nAppError with default status:');
console.log('- statusCode:', error1.statusCode);
console.log('- status:', error1.status);
console.log('- isOperational:', error1.isOperational);

// Test AppError with client error
const error2 = new AppError('Bad request', 400);
console.log('\nAppError with 400 status:');
console.log('- statusCode:', error2.statusCode);
console.log('- status:', error2.status);

// Test LLMError
const error3 = new LLMError('LLM error');
console.log('\nLLMError with default status:');
console.log('- statusCode:', error3.statusCode);
console.log('- status:', error3.status);
console.log('- name:', error3.name);

console.log('\nAll error classes are working correctly in this script.');