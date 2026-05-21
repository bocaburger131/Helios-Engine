import React, { useState } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';

const TransactionCategorization = ({ transaction, onCategoryUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(transaction.category);

  const categories = [
    'Groceries', 'Dining', 'Transportation', 'Utilities',
    'Entertainment', 'Healthcare', 'Shopping', 'Income',
    'Transfer', 'Other'
  ];

  const confidenceColor = (confidence) => {
    if (confidence > 0.8) return 'text-green-600';
    if (confidence > 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleCategoryChange = async (newCategory) => {
    if (newCategory !== transaction.category) {
      // Send feedback to backend
      await fetch('/api/learning/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: transaction.id,
          category: newCategory
        })
      });
      
      onCategoryUpdate(transaction.id, newCategory);
    }
    
    setSelectedCategory(newCategory);
    setIsEditing(false);
  };

  return (
    <div className="flex items-center space-x-2">
      {!isEditing ? (
        <>
          <span className="px-3 py-1 rounded-full bg-gray-100 text-sm">
            {selectedCategory}
          </span>
          <span className={`text-xs ${confidenceColor(transaction.categoryConfidence)}`}>
            {(transaction.categoryConfidence * 100).toFixed(0)}%
          </span>
          <button
            onClick={() => setIsEditing(true)}
            className="text-blue-600 hover:text-blue-800"
            title="Change category"
          >
            <ChevronDown size={16} />
          </button>
        </>
      ) : (
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            onBlur={() => setIsEditing(false)}
            className="px-3 py-1 rounded border border-gray-300 focus:border-blue-500"
            autoFocus
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      )}
      
      {transaction.suggestedCategories && transaction.suggestedCategories.length > 0 && (
        <div className="text-xs text-gray-500">
          Also: {transaction.suggestedCategories.slice(0, 2).map(s => s.category).join(', ')}
        </div>
      )}
    </div>
  );
};

export default TransactionCategorization;