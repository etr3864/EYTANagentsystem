/** Format phone for URL display: 972523006544 → 9720523006544 */
export function phoneToUrl(phone: string): string {
  if (phone.startsWith('972')) return '9720' + phone.slice(3);
  return phone;
}

/** Session create/update: 054 / 972 / +972 → +9725… */
export function toSessionPhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 9) digits = `972${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith('5')) digits = `972${digits}`;
  if (digits.startsWith('9720') && digits.length >= 13) digits = `972${digits.slice(4)}`;
  if (digits.length < 10 || digits.length > 15) return '';
  return `+${digits}`;
}

/** Digits for matching WaSender jid to conversation phone. */
export function phoneKey(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('9720') && digits.length >= 13) digits = `972${digits.slice(4)}`;
  else if (digits.startsWith('0') && digits.length >= 9) digits = `972${digits.slice(1)}`;
  return digits;
}

/** Parse phone from URL back to DB format: 9720523006544 → 972523006544 */
export function phoneFromUrl(urlPhone: string): string {
  if (urlPhone.startsWith('9720')) return '972' + urlPhone.slice(4);
  return urlPhone;
}
