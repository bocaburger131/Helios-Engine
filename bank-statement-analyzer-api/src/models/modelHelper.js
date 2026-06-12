import mongoose from 'mongoose';

export function createModel(name, schema) {
  // Check if model already exists
  if (mongoose.models[name]) {
    return mongoose.models[name];
  }
  
  // Create new model
  return mongoose.model(name, schema);
}