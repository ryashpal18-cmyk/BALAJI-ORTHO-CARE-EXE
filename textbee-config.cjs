'use strict';

const MAX_API_URL_LENGTH = 2048;
const MAX_API_KEY_LENGTH = 4096;
const MAX_DEVICE_ID_LENGTH = 256;

function boundedString(value, label, maxLength) {
  if (typeof value !== 'string') throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized))
    throw new Error(`${label} must be between 1 and ${maxLength} characters`);
  return normalized;
}

function normalizeApiUrl(value) {
  const input = boundedString(value, 'TextBee API URL', MAX_API_URL_LENGTH);
  let url;
  try { url = new URL(input); }
  catch { throw new Error('TextBee API URL is invalid'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'api.textbee.dev' ||
      (url.port && url.port !== '443') || url.username || url.password || url.hash)
    throw new Error('TextBee API URL must use HTTPS on api.textbee.dev');
  return url.href;
}

function validateTextBeeConfig(input) {
  return {
    apiUrl: normalizeApiUrl(input?.apiUrl),
    apiKey: boundedString(input?.apiKey, 'TextBee API key', MAX_API_KEY_LENGTH),
    deviceId: boundedString(input?.deviceId, 'TextBee device ID', MAX_DEVICE_ID_LENGTH),
  };
}

function redact(value) {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

function createTextBeeConfig({ file, safeStorage, fs, logger }) {
  let cached;
  function assertSecureStorage() {
    let available = false;
    try { available = !!safeStorage?.isEncryptionAvailable?.() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; }
    catch { available = false; }
    if (!available) throw new Error('Secure credential storage is unavailable');
  }
  function read() {
    assertSecureStorage();
    if (cached !== undefined) return cached;
    if (!fs.existsSync(file)) return (cached = null);
    try {
      const decrypted = safeStorage.decryptString(fs.readFileSync(file));
      cached = validateTextBeeConfig(JSON.parse(decrypted));
      return cached;
    } catch (error) {
      logger?.logError?.('textbee-config', `Encrypted configuration could not be read: ${error.message}`);
      throw new Error('TextBee configuration could not be read securely');
    }
  }
  function save(input) {
    assertSecureStorage();
    const config = validateTextBeeConfig(input);
    const encrypted = safeStorage.encryptString(JSON.stringify(config));
    const temp = `${file}.tmp`;
    fs.mkdirSync(require('path').dirname(file), { recursive: true });
    fs.writeFileSync(temp, encrypted, { mode: 0o600 });
    fs.renameSync(temp, file);
    cached = config;
    return status();
  }
  function clear() {
    cached = null;
    for (const target of [file, `${file}.tmp`]) {
      try { if (fs.existsSync(target)) fs.unlinkSync(target); }
      catch (error) { logger?.logError?.('textbee-config', `Configuration clear failed: ${error.message}`); throw new Error('TextBee configuration could not be cleared'); }
    }
    return { available: true, configured: false, apiUrl: '', apiKey: '', deviceId: '' };
  }
  function status() {
    const config = read();
    if (!config) return { available: true, configured: false, apiUrl: '', apiKey: '', deviceId: '' };
    const url = new URL(config.apiUrl);
    return {
      available: true,
      configured: true,
      apiUrl: `${url.origin}${url.pathname === '/' ? '/' : '/…'}`,
      apiKey: '••••••••',
      deviceId: redact(config.deviceId),
    };
  }
  return { get: read, save, clear, status, isConfigured: () => !!read() };
}

module.exports = { createTextBeeConfig, validateTextBeeConfig, normalizeApiUrl };
