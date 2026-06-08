const dns = require('dns').promises;

class DnsValidator {
  static async checkSPF(domain) {
    try {
      const records = await dns.resolveTxt(domain);
      const spfRecord = records
        .flat()
        .find((r) => r.startsWith('v=spf1'));
      
      return {
        exists: !!spfRecord,
        value: spfRecord || null,
        includesHDM: spfRecord ? spfRecord.includes('include:hdmbridge.com') : false,
      };
    } catch {
      return { exists: false, value: null, includesHDM: false };
    }
  }

  static async checkDKIM(domain, selector = 'hdm') {
    try {
      const dkimDomain = `${selector}._domainkey.${domain}`;
      const records = await dns.resolveTxt(dkimDomain);
      
      return {
        exists: records.length > 0,
        value: records.flat().join(''),
        selector,
      };
    } catch {
      return { exists: false, value: null, selector };
    }
  }

  static async checkDMARC(domain) {
    try {
      const dmarcDomain = `_dmarc.${domain}`;
      const records = await dns.resolveTxt(dmarcDomain);
      const dmarcRecord = records
        .flat()
        .find((r) => r.startsWith('v=DMARC1'));
      
      return {
        exists: !!dmarcRecord,
        value: dmarcRecord || null,
        policy: dmarcRecord ? this.parseDmarcPolicy(dmarcRecord) : null,
      };
    } catch {
      return { exists: false, value: null, policy: null };
    }
  }

  static parseDmarcPolicy(record) {
    const policyMatch = record.match(/p=(\w+)/);
    return policyMatch ? policyMatch[1] : 'none';
  }

  static async verifyDomain(domain) {
    const [spf, dkim, dmarc] = await Promise.all([
      this.checkSPF(domain),
      this.checkDKIM(domain),
      this.checkDMARC(domain),
    ]);

    return {
      domain,
      verified: spf.exists && dkim.exists,
      records: { spf, dkim, dmarc },
      recommendations: this.getRecommendations({ spf, dkim, dmarc }, domain),
    };
  }

  static getRecommendations(records, domain) {
    const recs = [];

    if (!records.spf.exists) {
      recs.push({
        type: 'TXT',
        host: '@',
        value: 'v=spf1 include:hdmbridge.com ~all',
        reason: 'Required for email authentication',
      });
    }

    if (!records.dkim.exists) {
      recs.push({
        type: 'TXT',
        host: 'hdm._domainkey',
        value: `v=DKIM1; k=rsa; p=YOUR_DKIM_PUBLIC_KEY`,
        reason: 'Required for email signing',
      });
    }

    if (!records.dmarc.exists) {
      recs.push({
        type: 'TXT',
        host: '_dmarc',
        value: 'v=DMARC1; p=none; rua=mailto:dmarc@hdmbridge.com',
        reason: 'Recommended for domain protection',
      });
    }

    return recs;
  }

  static generateDKIMKeyPair() {
    const crypto = require('crypto');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const cleanPublic = publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\n/g, '');

    return { publicKey: cleanPublic, privateKey };
  }
}

module.exports = DnsValidator;