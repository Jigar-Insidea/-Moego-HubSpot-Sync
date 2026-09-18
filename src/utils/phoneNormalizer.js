/**
 * Normalizes phone numbers to standard E.164 international format
 * Example: "4056097730" -> "+14056097730"
 * Example: "(405) 609-7730" -> "+14056097730"
 */
function normalizeE164(phoneStr) {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (String(phoneStr).trim().startsWith('+')) {
    return `+${digits}`;
  }
  return `+1${digits}`;
}

module.exports = { normalizeE164 };
