'use strict';

const OFFICIAL_WHATSAPP_HOSTS = new Set(['web.whatsapp.com', 'wa.me', 'api.whatsapp.com']);

function parseOfficialUrl(input) {
  if (typeof input !== 'string' || !input || input.length > 8192) throw new Error('Invalid WhatsApp URL');
  let url;
  try { url = new URL(input); }
  catch { throw new Error('Invalid WhatsApp URL'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !OFFICIAL_WHATSAPP_HOSTS.has(host) ||
      (url.port && url.port !== '443') || url.username || url.password)
    throw new Error('WhatsApp URL is not allowed');
  return url;
}

function safeSendUrl(phone, text) {
  const digits = String(phone || '').replace(/^\+/, '');
  if (!/^\d{7,15}$/.test(digits)) throw new Error('Invalid WhatsApp recipient');
  const safe = new URL('https://web.whatsapp.com/send');
  safe.searchParams.set('phone', digits);
  if (text) safe.searchParams.set('text', text);
  return safe.href;
}

function normalizeWhatsAppUrl(input) {
  const url = parseOfficialUrl(input);
  const host = url.hostname.toLowerCase();
  if (host === 'wa.me') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) throw new Error('WhatsApp URL is not allowed');
    return safeSendUrl(parts[0], url.searchParams.get('text') || '');
  }
  if (host === 'api.whatsapp.com') {
    if (!/^\/send\/?$/i.test(url.pathname)) throw new Error('WhatsApp URL is not allowed');
    return safeSendUrl(url.searchParams.get('phone'), url.searchParams.get('text') || '');
  }
  url.protocol = 'https:';
  url.hostname = 'web.whatsapp.com';
  url.port = '';
  url.username = '';
  url.password = '';
  url.hash = '';
  return url.href;
}

function isOfficialWhatsAppUrl(input) {
  try { parseOfficialUrl(input); return true; }
  catch { return false; }
}

module.exports = { normalizeWhatsAppUrl, isOfficialWhatsAppUrl, OFFICIAL_WHATSAPP_HOSTS };
