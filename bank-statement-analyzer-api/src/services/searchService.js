export function searchTransactions(transactions, filters) {
  let results = [...transactions];
  
  // Filter by search term
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    results = results.filter(t => 
      t.description.toLowerCase().includes(term) ||
      t.category?.toLowerCase().includes(term)
    );
  }
  
  // Filter by date range
  if (filters.startDate) {
    const start = new Date(filters.startDate);
    results = results.filter(t => new Date(t.date) >= start);
  }
  
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    results = results.filter(t => new Date(t.date) <= end);
  }
  
  // Filter by amount range
  if (filters.minAmount !== undefined) {
    results = results.filter(t => Math.abs(t.amount) >= Math.abs(filters.minAmount));
  }
  
  if (filters.maxAmount !== undefined) {
    results = results.filter(t => Math.abs(t.amount) <= Math.abs(filters.maxAmount));
  }
  
  // Filter by transaction type
  if (filters.type) {
    if (filters.type === 'deposit') {
      results = results.filter(t => t.amount > 0);
    } else if (filters.type === 'withdrawal') {
      results = results.filter(t => t.amount < 0);
    }
  }
  
  // Filter by categories
  if (filters.categories && filters.categories.length > 0) {
    results = results.filter(t => filters.categories.includes(t.category));
  }
  
  // Sort results
  if (filters.sortBy) {
    results.sort((a, b) => {
      switch (filters.sortBy) {
        case 'date-asc':
          return new Date(a.date) - new Date(b.date);
        case 'date-desc':
          return new Date(b.date) - new Date(a.date);
        case 'amount-asc':
          return a.amount - b.amount;
        case 'amount-desc':
          return b.amount - a.amount;
        default:
          return 0;
      }
    });
  }
  
  return {
    results,
    count: results.length,
    totalAmount: results.reduce((sum, t) => sum + t.amount, 0)
  };
}