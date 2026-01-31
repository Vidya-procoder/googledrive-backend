const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Generate random token for activation/reset
const generateRandomToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate JWT token
const generateJWT = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Verify JWT token
const verifyJWT = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateRandomToken,
  generateJWT,
  verifyJWT
};
