// Centralized model exports for consistent imports
// Use: import { Statement, Transaction, User } from '../models/index.js';

import Statement from './Statement.js';
import Transaction from './Transaction.js';
import User from './User.js';
import Alert from './Alert.js';
import Analysis from './Analysis.js';
import Merchant from './Merchant.js';
import MerchantCache from './MerchantCache.js';
import TransactionCategory from './TransactionCategory.js';
import UsageTracker from './UsageTracker.js';
import RiskProfile from './RiskProfile.js';
import InstitutionalProfile from './InstitutionalProfile.js';
import ProcessingRun from './ProcessingRun.js';

// Export all models
export {
  Statement,
  Transaction,
  User,
  Alert,
  Analysis,
  Merchant,
  MerchantCache,
  TransactionCategory,
  UsageTracker,
  RiskProfile,
  InstitutionalProfile,
  ProcessingRun
};

// Default export for the main models
export default {
  Statement,
  Transaction,
  User,
  Alert,
  Analysis,
  Merchant,
  MerchantCache,
  TransactionCategory,
  UsageTracker,
  RiskProfile,
  InstitutionalProfile,
  ProcessingRun
};
