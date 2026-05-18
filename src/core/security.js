import crypto from 'node:crypto';

export const roles = { admin: 100, editor: 70, author: 50, subscriber: 10 };

/**
 * Generates a consistent SHA-256 hex digest hash for a plaintext password.
 * @param {string} password
 * @returns {string} Hex-encoded hash
 */
export function hashPassword(password) {
    if (!password) {
        throw new Error('Password payload is required for hashing.');
    }
    return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Validates a plaintext password string against a stored hash using a timing-safe operation.
 * @param {string} password 
 * @param {string} storedHash 
 * @returns {boolean}
 */
export function verifyPassword(password, storedHash) {
    if (!password || !storedHash) return false;
    const incomingHash = hashPassword(password);
    
    return crypto.timingSafeEqual(
        Buffer.from(incomingHash, 'utf8'),
        Buffer.from(storedHash, 'utf8')
    );
}

export function totpCode(secret) {
    const window = Math.floor(Date.now() / 30000);
    return crypto.createHmac('sha1', secret).update(String(window)).digest('hex').slice(0, 6);
}

export function sanitizeHtml(input = '') {
    return String(input).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/on\w+="[^"]*"/g, '');
}

export function slugify(s = '') {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function can(user, level = 'subscriber') {
    return !!user && (roles[user.role] || 0) >= (roles[level] || 0);
}
