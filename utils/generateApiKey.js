const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class ApiKeyGenerator {
  static generate() {
    const randomBytes = crypto.randomBytes(32).toString('base64url');
    const apiKey = 'hdm_' + randomBytes;
    const prefix = apiKey.substring(0, 16);

    return {
      fullKey: apiKey,
      prefix,
      displayKey: prefix + '...' + apiKey.slice(-4),
    };
  }

  static async hashKey(apiKey) {
    return bcrypt.hash(apiKey, 10);
  }

  static generatePassword(length) {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
  }
}

module.exports = ApiKeyGenerator;