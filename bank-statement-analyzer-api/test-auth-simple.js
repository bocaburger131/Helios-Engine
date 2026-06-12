console.log('Simple auth: Starting...');

export const authenticateToken = (req, res, next) => {
  console.log('authenticateToken called');
  next();
};

export const authenticateUser = (req, res, next) => {
  console.log('authenticateUser called');
  next();
};

export const optionalAuth = (req, res, next) => {
  console.log('optionalAuth called');
  next();
};

console.log('Simple auth: Exports defined');
