import crypto from 'crypto';

const secret = crypto.randomBytes(32).toString('base64');
console.log('Generated JWT Secret:', secret);