import crypto from 'crypto';

/**
 * Generate a secure random password
 * @param length - Length of the password (default: 12)
 * @param includeSymbols - Whether to include special characters (default: true)
 * @returns Generated password string
 */
export const generateSecurePassword = (length: number = 12, includeSymbols: boolean = true): string => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let charset = lowercase + uppercase + numbers;
  if (includeSymbols) {
    charset += symbols;
  }
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += numbers[crypto.randomInt(0, numbers.length)];
  
  if (includeSymbols) {
    password += symbols[crypto.randomInt(0, symbols.length)];
  }
  
  // Fill the rest of the password length
  const remainingLength = length - password.length;
  for (let i = 0; i < remainingLength; i++) {
    password += charset[crypto.randomInt(0, charset.length)];
  }
  
  // Shuffle the password to randomize character positions
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Generate a secure verification token
 * @returns Verification token string
 */
export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate a secure temporary password with user-friendly characters
 * @param length - Length of the password (default: 10)
 * @returns Generated password string
 */
export const generateTempPassword = (length: number = 10): string => {
  // Exclude confusing characters like 0, O, l, 1, I
  const charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[crypto.randomInt(0, charset.length)];
  }
  
  return password;
};