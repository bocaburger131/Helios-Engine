import dotenv from 'dotenv';
import perplexityEnhancer from './src/services/perplexityEnhancementService.js';

dotenv.config();

// Mock database operations
const mockDatabase = {
    transactions: [],
    statements: [],
    
    async createStatement(data) {
        const statement = {
            _id: Date.now().toString(),
            ...data,
            insights: null
        };
        this.statements.push(statement);
        return statement;
    },
    
    async createTransactions(transactions) {
        const created = transactions.map((t, i) => ({
            _id: `${Date.now()}_${i}`,
            ...t
        }));
        this.transactions.push(...created);
        return created;
    },
    
    async updateTransaction(id, updates) {
        const index = this.transactions.findIndex(t => t._id === id);
        if (index >= 0) {
            Object.assign(this.transactions[index], updates);
        }
    },
    
    async updateStatement(id, updates) {
        const index = this.statements.findIndex(s => s._id === id);
        if (index >= 0) {
            Object.assign(this.statements[index], updates);
        }
    }
};

async function testCompleteEnhancement() {
    console.log('🚀 Complete Enhancement Test (No Database Required)\n');
    
    try {
        // 1. Create mock statement
        console.log('1️⃣ Creating mock statement...');
        const statement = await mockDatabase.createStatement({
            userId: 'test-user-123',
            fileName: 'june-2025-statement.pdf',
            startDate: new Date('2025-06-01'),
            endDate: new Date('2025-06-30'),
            accountType: 'checking'
        });
        console.log(`✅ Created statement: ${statement._id}\n`);
        
        // 2. Create mock transactions
        console.log('2️⃣ Creating mock transactions...');
        const transactionData = [
            // Recurring subscriptions
            { description: 'NETFLIX.COM MONTHLY', amount: 15.99, type: 'debit', date: new Date('2025-06-05') },
            { description: 'SPOTIFY USA 877-778-1161', amount: 9.99, type: 'debit', date: new Date('2025-06-05') },
            { description: 'AMAZON PRIME MEMBERSHIP', amount: 14.99, type: 'debit', date: new Date('2025-06-07') },
            
            // Food & Dining
            { description: 'STARBUCKS STORE #12345', amount: 6.50, type: 'debit', date: new Date('2025-06-10') },
            { description: 'WHOLE FOODS MKT #10234', amount: 127.43, type: 'debit', date: new Date('2025-06-12') },
            { description: 'UBER EATS ORDER_HELP.UBER', amount: 32.18, type: 'debit', date: new Date('2025-06-15') },
            
            // Transportation
            { description: 'SHELL OIL 574298573', amount: 65.00, type: 'debit', date: new Date('2025-06-08') },
            { description: 'UBER *TRIP HELP.UBER.COM', amount: 23.45, type: 'debit', date: new Date('2025-06-14') },
            
            // Shopping
            { description: 'AMAZON.COM*2G4D93JK2', amount: 89.99, type: 'debit', date: new Date('2025-06-18') },
            { description: 'TARGET 00012345 BROOKLYN', amount: 156.78, type: 'debit', date: new Date('2025-06-20') },
            
            // Income
            { description: 'DIRECT DEP PAYROLL ACME CORP', amount: 3500.00, type: 'credit', date: new Date('2025-06-15') },
            { description: 'VENMO CASHOUT', amount: 250.00, type: 'credit', date: new Date('2025-06-22') },
            
            // Bills
            { description: 'VERIZON WIRELESS PAYMENT', amount: 85.00, type: 'debit', date: new Date('2025-06-25') },
            { description: 'CON EDISON ONLINE PAYMENT', amount: 120.00, type: 'debit', date: new Date('2025-06-26') }
        ];
        
        const transactions = await mockDatabase.createTransactions(
            transactionData.map(t => ({
                ...t,
                statementId: statement._id,
                userId: statement.userId
            }))
        );
        console.log(`✅ Created ${transactions.length} transactions\n`);
        
        // 3. Enhance transactions with Perplexity
        console.log('3️⃣ Enhancing transactions with Perplexity AI...');
        const startTime = Date.now();
        
        // Process in batches like the real service would
        const batchSize = 5;
        const allEnhancements = [];
        
        for (let i = 0; i < transactions.length; i += batchSize) {
            const batch = transactions.slice(i, i + batchSize);
            console.log(`\nProcessing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(transactions.length/batchSize)}...`);
            
            const enhancements = await perplexityEnhancer.processBatch(batch);
            allEnhancements.push(...enhancements);
            
            // Update mock database
            for (const enhancement of enhancements) {
                await mockDatabase.updateTransaction(enhancement.transactionId, {
                    category: enhancement.category,
                    merchant: enhancement.merchant,
                    tags: enhancement.tags,
                    aiAnalysis: enhancement.aiAnalysis
                });
            }
        }
        
        const processingTime = (Date.now() - startTime) / 1000;
        console.log(`\n✅ Enhancement completed in ${processingTime.toFixed(1)}s\n`);
        
        // 4. Display results
        console.log('4️⃣ Enhancement Results:\n');
        
        // Category summary
        const categoryTotals = {};
        const categoryCount = {};
        
        mockDatabase.transactions.forEach(t => {
            const category = t.category || 'Uncategorized';
            categoryTotals[category] = (categoryTotals[category] || 0) + Math.abs(t.amount);
            categoryCount[category] = (categoryCount[category] || 0) + 1;
        });
        
        console.log('📊 Spending by Category:');
        console.log('========================');
        Object.entries(categoryTotals)
            .sort(([,a], [,b]) => b - a)
            .forEach(([category, total]) => {
                console.log(`${category.padEnd(20)} $${total.toFixed(2).padStart(10)} (${categoryCount[category]} transactions)`);
            });
        
        // Recurring transactions
        console.log('\n🔄 Recurring Transactions Detected:');
        console.log('===================================');
        const recurring = mockDatabase.transactions.filter(t => 
            t.tags && (t.tags.includes('subscription') || t.tags.includes('recurring'))
        );
        recurring.forEach(t => {
            console.log(`• ${t.merchant || t.description}: $${t.amount.toFixed(2)}/month`);
        });
        const monthlyRecurring = recurring.reduce((sum, t) => sum + t.amount, 0);
        console.log(`\nTotal monthly recurring: $${monthlyRecurring.toFixed(2)}`);
        
        // Income vs Expenses
        const totalIncome = mockDatabase.transactions
            .filter(t => t.type === 'credit')
            .reduce((sum, t) => sum + t.amount, 0);
        const totalExpenses = mockDatabase.transactions
            .filter(t => t.type === 'debit')
            .reduce((sum, t) => sum + t.amount, 0);
        
        console.log('\n💰 Financial Summary:');
        console.log('====================');
        console.log(`Total Income:    $${totalIncome.toFixed(2)}`);
        console.log(`Total Expenses:  $${totalExpenses.toFixed(2)}`);
        console.log(`Net Cash Flow:   $${(totalIncome - totalExpenses).toFixed(2)}`);
        console.log(`Savings Rate:    ${((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1)}%`);
        
        // 5. Generate insights
        console.log('\n5️⃣ Generating AI Insights...\n');
        const insightPrompt = `Analyze this financial data and provide specific, actionable advice:

Monthly Income: $${totalIncome.toFixed(2)}
Monthly Expenses: $${totalExpenses.toFixed(2)}
Recurring Subscriptions: $${monthlyRecurring.toFixed(2)}/month
Top spending categories: ${Object.entries(categoryTotals).sort(([,a],[,b]) => b-a).slice(0,3).map(([cat, amt]) => `${cat} ($${amt.toFixed(2)})`).join(', ')}

Provide 3-4 specific recommendations to improve financial health.`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-sonar-small-128k-online',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a personal financial advisor. Give specific, actionable advice based on the data provided.'
                    },
                    {
                        role: 'user',
                        content: insightPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 400
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('💡 AI Financial Insights:');
            console.log('========================\n');
            console.log(data.choices[0].message.content);
        }
        
        console.log('\n✅ Complete enhancement test finished successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testCompleteEnhancement().catch(console.error);