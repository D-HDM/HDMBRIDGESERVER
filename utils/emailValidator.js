const dns = require('dns').promises;

class EmailValidator {
  static isValidFormat(email) {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email);
  }

  static async hasMXRecord(domain) {
    try {
      const addresses = await dns.resolveMx(domain);
      return addresses && addresses.length > 0;
    } catch (error) {
      return false;
    }
  }

  static async validate(email, checkMX = false) {
    const errors = [];

    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
      return { valid: false, errors };
    }

    const trimmed = email.trim().toLowerCase();

    if (!this.isValidFormat(trimmed)) {
      errors.push('Invalid email format');
      return { valid: false, errors };
    }

    if (trimmed.length > 254) {
      errors.push('Email too long');
      return { valid: false, errors };
    }

    const domain = trimmed.split('@')[1];

    const disposableDomains = [
      'mailinator.com', 'guerrillamail.com', 'tempmail.com',
      '10minutemail.com', 'yopmail.com', 'throwaway.email',
    ];

    if (disposableDomains.includes(domain)) {
      errors.push('Disposable email addresses not allowed');
    }

    if (checkMX) {
      const hasMX = await this.hasMXRecord(domain);
      if (!hasMX) {
        errors.push('Domain has no mail server (MX record)');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      normalized: trimmed,
      domain,
    };
  }
}

module.exports = EmailValidator;