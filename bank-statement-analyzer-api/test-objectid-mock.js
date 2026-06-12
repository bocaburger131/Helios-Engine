// Quick test of ObjectId.isValid mock
import mongoose from 'mongoose';

console.log('Testing ObjectId.isValid...');
console.log('mongoose.Types:', typeof mongoose.Types);
console.log('mongoose.Types.ObjectId:', typeof mongoose.Types.ObjectId);
console.log('mongoose.Types.ObjectId.isValid:', typeof mongoose.Types.ObjectId.isValid);

if (mongoose.Types.ObjectId.isValid) {
  console.log('Result for "123":', mongoose.Types.ObjectId.isValid("123"));
  console.log('Result for "abc":', mongoose.Types.ObjectId.isValid("abc"));
  console.log('Result for "507f1f77bcf86cd799439011":', mongoose.Types.ObjectId.isValid("507f1f77bcf86cd799439011"));
} else {
  console.log('isValid method not found!');
}
