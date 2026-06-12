/**
 * Anonymous principal for login-free demo uploads.
 */
export function assignPublicGuest(req, _res, next) {
  if (!req.user) {
    req.user = {
      id: 'public-submit',
      _id: 'public-submit',
      role: 'guest',
      email: 'guest@public-upload.local'
    };
  }
  next();
}

export default assignPublicGuest;
