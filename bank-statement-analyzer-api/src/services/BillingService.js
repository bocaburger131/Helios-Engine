import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import BillingPlan from '../models/BillingPlan.js';
import UsageTracker from '../models/UsageTracker.js';
import logger from '../utils/logger.js';

export default class BillingService {
  constructor() {
    this.plans = this.initializePlans();
  }

  initializePlans() {
    return {
      free: {
        name: 'Free',
        limits: {
          apiCalls: 1000,
          storage: 100 * 1024 * 1024, // 100MB
          users: 2,
          statementsPerMonth: 10,
          requestsPerWindow: 100,
          rateLimitWindow: 3600000 // 1 hour
        },
        features: ['basic_parsing', 'manual_upload'],
        price: 0
      },
      starter: {
        name: 'Starter',
        limits: {
          apiCalls: 10000,
          storage: 1024 * 1024 * 1024, // 1GB
          users: 5,
          statementsPerMonth: 100,
          requestsPerWindow: 500,
          rateLimitWindow: 3600000
        },
        features: ['basic_parsing', 'manual_upload', 'api_access', 'basic_analytics'],
        price: 49
      },
      professional: {
        name: 'Professional',
        limits: {
          apiCalls: 100000,
          storage: 10 * 1024 * 1024 * 1024, // 10GB
          users: 20,
          statementsPerMonth: 1000,
          requestsPerWindow: 2000,
          rateLimitWindow: 3600000
        },
        features: [
          'advanced_parsing', 
          'api_access', 
          'advanced_analytics',
          'risk_analysis',
          'custom_rules',
          'webhook_notifications'
        ],
        price: 199
      },
      enterprise: {
        name: 'Enterprise',
        limits: {
          apiCalls: -1, // unlimited
          storage: -1,
          users: -1,
          statementsPerMonth: -1,
          requestsPerWindow: 10000,
          rateLimitWindow: 3600000
        },
        features: [
          'all_features',
          'dedicated_support',
          'custom_integration',
          'sla_guarantee',
          'white_label'
        ],
        price: 'custom'
      }
    };
  }

  async getTenantPlan(tenantId) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      // Return free plan as default
      return this.plans.free;
    }

    return this.plans[tenant.billingPlan] || this.plans.free;
  }

  async checkLimits(tenantId, action) {
    try {
      const plan = await this.getTenantPlan(tenantId);
      const usage = await this.getCurrentUsage(tenantId);

      // Check various limits
      const checks = {
        apiCalls: plan.limits.apiCalls !== -1 && usage.apiCalls >= plan.limits.apiCalls,
        storage: plan.limits.storage !== -1 && usage.storage >= plan.limits.storage,
        statements: plan.limits.statementsPerMonth !== -1 && usage.statementsThisMonth >= plan.limits.statementsPerMonth
      };

      return Object.values(checks).some(exceeded => exceeded);
    } catch (error) {
      logger.error('Error checking limits:', error);
      return false; // Don't block on errors
    }
  }

  async getCurrentUsage(tenantId) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [apiCalls, storage, statements] = await Promise.all([
      UsageTracker.countDocuments({
        tenantId,
        timestamp: { $gte: startOfMonth }
      }),
      this.calculateStorage(tenantId),
      this.countStatements(tenantId, startOfMonth)
    ]);

    return {
      apiCalls,
      storage,
      statementsThisMonth: statements,
      periodStart: startOfMonth,
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
    };
  }

  async incrementUsage(tenantId, metrics) {
    try {
      // Update usage metrics in database
      const update = {
        $inc: {
          'usage.apiCalls': metrics.apiCalls || 0,
          'usage.dataTransfer': metrics.dataTransfer || 0
        },
        $set: {
          'usage.lastActivity': new Date()
        }
      };

      if (metrics.endpoint) {
        const endpointKey = `usage.endpoints.${metrics.endpoint.replace(/[.\/]/g, '_')}`;
        update.$inc[endpointKey] = 1;
      }

      await Tenant.findByIdAndUpdate(tenantId, update);
    } catch (error) {
      logger.error('Error incrementing usage:', error);
    }
  }

  async calculateStorage(tenantId) {
    // Placeholder - implement actual storage calculation
    // Would calculate total storage used by tenant's statements, files, etc.
    return 0;
  }

  async countStatements(tenantId, since) {
    // Placeholder - implement actual statement counting
    // Would count statements uploaded since the given date
    return 0;
  }

  async generateInvoice(tenantId, period) {
    const tenant = await Tenant.findById(tenantId);
    const plan = this.plans[tenant?.billingPlan || 'free'];
    const usage = await this.getUsageForPeriod(tenantId, period);

    const invoice = {
      tenantId,
      period,
      plan: plan.name,
      basePrice: plan.price,
      usage,
      overages: this.calculateOverages(usage, plan),
      total: 0,
      createdAt: new Date()
    };

    // Calculate total
    invoice.total = typeof plan.price === 'number' ? plan.price : 0;
    invoice.total += Object.values(invoice.overages).reduce((sum, cost) => sum + cost, 0);

    return invoice;
  }

  calculateOverages(usage, plan) {
    const overages = {};

    // API calls overage
    if (plan.limits.apiCalls !== -1 && usage.apiCalls > plan.limits.apiCalls) {
      const excess = usage.apiCalls - plan.limits.apiCalls;
      overages.apiCalls = Math.ceil(excess / 1000) * 5; // $5 per 1000 calls
    }

    // Storage overage
    if (plan.limits.storage !== -1 && usage.storage > plan.limits.storage) {
      const excessGB = (usage.storage - plan.limits.storage) / (1024 * 1024 * 1024);
      overages.storage = Math.ceil(excessGB) * 10; // $10 per GB
    }

    return overages;
  }

  async getUsageForPeriod(tenantId, period) {
    const { start, end } = period;
    
    const usage = await UsageTracker.aggregate([
      {
        $match: {
          tenantId: mongoose.Types.ObjectId.createFromHexString(tenantId),
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          apiCalls: { $sum: 1 },
          dataTransfer: { $sum: { $add: ['$requestSize', '$responseSize'] } },
          avgResponseTime: { $avg: '$duration' }
        }
      }
    ]);

    return usage[0] || { apiCalls: 0, dataTransfer: 0, avgResponseTime: 0 };
  }

  async upgradePlan(tenantId, newPlan) {
    if (!this.plans[newPlan]) {
      throw new Error('Invalid plan');
    }

    await Tenant.findByIdAndUpdate(tenantId, {
      billingPlan: newPlan,
      'billing.planChangedAt': new Date()
    });

    logger.info(`Tenant ${tenantId} upgraded to ${newPlan} plan`);
    
    return this.plans[newPlan];
  }

}