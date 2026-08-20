function cleanString(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isStrongEnoughPassword(value) {
  return typeof value === 'string' && value.length >= 6 && value.length <= 128;
}

function isValidTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || '')) &&
    Number(value.slice(0, 2)) <= 23 &&
    Number(value.slice(3, 5)) <= 59;
}

module.exports = { cleanString, isEmail, isStrongEnoughPassword, isValidTime };
