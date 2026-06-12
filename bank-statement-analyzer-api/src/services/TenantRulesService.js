import TenantRule from '../models/TenantRule.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export class TenantRulesService {
  constructor() {
    this.ruleCache = new Map();
    this.ruleEngine = this.initializeRuleEngine();
  }

  initializeRuleEngine() {
    return {
      operators: {
        'equals': (a, b) => a === b,
        'not_equals': (a, b) => a !== b,
        'greater_than': (a, b) => a > b,
        'less_than': (a, b) => a < b,
        'contains': (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
        'in': (a, b) => Array.isArray(b) ? b.includes(a) : false,
        'regex': (a, b) => new RegExp(b).test(a)
      },
      
      actions: {
        'categorize': this.actionCategorize.bind(this),
        'flag': this.actionFlag.bind(this),
        'alert': this.actionAlert.bind(this),
        'transform': this.actionTransform.bind(this),
        'calculate': this.actionCalculate.bind(this)
      }
    };
  }

  async createRule(tenantId, ruleData) {
    this.validateRule(ruleData);

    const rule = new TenantRule({
      tenantId,
      ...ruleData,
      version: 1,
      isActive: true,
      createdAt: new Date()
    });

    await rule.save();
    this.invalidateCache(tenantId);

    logger.info(`Rule created for tenant ${tenantId}: ${rule.name}`);
    return rule;
  }

  async updateRule(tenantId, ruleId, updates) {
    const rule = await TenantRule.findOne({ _id: ruleId, tenantId });
    
    if (!rule) {
      throw new ValidationError('Rule not found');
    }

    if (updates.conditions || updates.actions) {
      this.validateRule(updates);
    }

    // Version the rule
    rule.version += 1;
    rule.previousVersions.push({
      version: rule.version - 1,
      conditions: rule.conditions,
      actions: rule.actions,
      updatedAt: rule.updatedAt
    });

    Object.assign(rule, updates);
    await rule.save();

    this.invalidateCache(tenantId);
    return rule;
  }

  async getRules(tenantId, filters = {}) {
    const query = { tenantId, ...filters };
    return await TenantRule.find(query).sort({ priority: 1, createdAt: -1 });
  }

  async applyRules(tenantId, context, data) {
    const rules = await this.getActiveRules(tenantId, context);
    const results = [];

    for (const rule of rules) {
      try {
        if (await this.evaluateConditions(rule.conditions, data)) {
          const actionResults = await this.executeActions(rule.actions, data);
          results.push({
            ruleId: rule._id,
            ruleName: rule.name,
            applied: true,
            results: actionResults
          });

          // Track rule usage
          await this.trackRuleUsage(rule._id);

          // Stop if rule is set to stop on match
          if (rule.stopOnMatch) {
            break;
          }
        }
      } catch (error) {
        logger.error(`Error applying rule ${rule._id}:`, error);
        results.push({
          ruleId: rule._id,
          ruleName: rule.name,
          applied: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async getActiveRules(tenantId, context) {
    const cacheKey = `${tenantId}-${context}`;
    
    if (this.ruleCache.has(cacheKey)) {
      return this.ruleCache.get(cacheKey);
    }

    const rules = await TenantRule.find({
      tenantId,
      context,
      isActive: true
    }).sort({ priority: 1 });

    this.ruleCache.set(cacheKey, rules);
    return rules;
  }

  async evaluateConditions(conditions, data) {
    if (!conditions || !conditions.logic) return true;

    return this.evaluateLogic(conditions.logic, conditions.rules || [], data);
  }

  evaluateLogic(logic, rules, data) {
    if (logic === 'all') {
      return rules.every(rule => this.evaluateRule(rule, data));
    } else if (logic === 'any') {
      return rules.some(rule => this.evaluateRule(rule, data));
    } else if (logic === 'none') {
      return !rules.some(rule => this.evaluateRule(rule, data));
    }

    throw new Error(`Unknown logic operator: ${logic}`);
  }

  evaluateRule(rule, data) {
    const { field, operator, value } = rule;
    const fieldValue = this.getFieldValue(field, data);
    const operatorFn = this.ruleEngine.operators[operator];

    if (!operatorFn) {
      throw new Error(`Unknown operator: ${operator}`);
    }

    return operatorFn(fieldValue, value);
  }

  getFieldValue(field, data) {
    const path = field.split('.');
    let value = data;

    for (const key of path) {
      value = value?.[key];
    }

    return value;
  }

  async executeActions(actions, data) {
    const results = [];

    for (const action of actions) {
      const actionFn = this.ruleEngine.actions[action.type];
      
      if (!actionFn) {
        throw new Error(`Unknown action type: ${action.type}`);
      }

      const result = await actionFn(action.params, data);
      results.push(result);
    }

    return results;
  }

  // Action implementations
  actionCategorize(params, data) {
    return {
      type: 'categorize',
      category: params.category,
      confidence: params.confidence || 1.0
    };
  }

  actionFlag(params, data) {
    return {
      type: 'flag',
      flagType: params.flagType,
      severity: params.severity || 'medium',
      message: params.message
    };
  }

  async actionAlert(params, data) {
    // Send alert through notification service
    logger.info(`Alert triggered: ${params.message}`);
    return {
      type: 'alert',
      channel: params.channel,
      sent: true
    };
  }

  actionTransform(params, data) {
    const { field, transformation } = params;
    let value = this.getFieldValue(field, data);

    switch (transformation) {
      case 'uppercase':
        value = String(value).toUpperCase();
        break;
      case 'lowercase':
        value = String(value).toLowerCase();
        break;
      case 'trim':
        value = String(value).trim();
        break;
      default:
        throw new Error(`Unknown transformation: ${transformation}`);
    }

    return {
      type: 'transform',
      field,
      originalValue: this.getFieldValue(field, data),
      newValue: value
    };
  }

  actionCalculate(params, data) {
    const { expression, resultField } = params;
    // Safe expression evaluation
    const result = this.evaluateExpression(expression, data);
    
    return {
      type: 'calculate',
      resultField,
      value: result
    };
  }

  evaluateExpression(expression, data) {
    // Simple expression evaluator - in production, use a proper expression parser
    // This is a placeholder for demonstration
    return 0;
  }

  validateRule(ruleData) {
    if (!ruleData.name) {
      throw new ValidationError('Rule name is required');
    }

    if (!ruleData.context) {
      throw new ValidationError('Rule context is required');
    }

    if (ruleData.conditions && !ruleData.conditions.logic) {
      throw new ValidationError('Conditions must specify logic (all/any/none)');
    }

    if (!ruleData.actions || ruleData.actions.length === 0) {
      throw new ValidationError('At least one action is required');
    }

    return true;
  }

  async trackRuleUsage(ruleId) {
    await TenantRule.findByIdAndUpdate(ruleId, {
      $inc: { 'usage.count': 1 },
      $set: { 'usage.lastUsed': new Date() }
    });
  }

  invalidateCache(tenantId) {
    // Remove all cache entries for this tenant
    for (const key of this.ruleCache.keys()) {
      if (key.startsWith(tenantId)) {
        this.ruleCache.delete(key);
      }
    }
  }

  // AI Training Support
  async generateRuleSuggestions(tenantId, trainingData) {
    const patterns = await this.analyzePatterns(trainingData);
    const suggestions = [];

    for (const pattern of patterns) {
      if (pattern.confidence > 0.8) {
        suggestions.push({
          name: `Auto-generated: ${pattern.description}`,
          context: pattern.context,
          conditions: this.patternToConditions(pattern),
          actions: this.patternToActions(pattern),
          confidence: pattern.confidence
        });
      }
    }

    return suggestions;
  }

  async analyzePatterns(data) {
    // Placeholder for ML pattern analysis
    return [];
  }

  patternToConditions(pattern) {
    // Convert detected pattern to rule conditions
    return {
      logic: 'all',
      rules: pattern.conditions || []
    };
  }

  patternToActions(pattern) {
    // Convert pattern to appropriate actions
    return pattern.suggestedActions || [];
  }
}