/** Format phone for URL display: 972523006544 → 9720523006544 */
export function phoneToUrl(phone: string): string {
  if (phone.startsWith('972')) return '9720' + phone.slice(3);
  return phone;
}

/** Parse phone from URL back to DB format: 9720523006544 → 972523006544 */
export function phoneFromUrl(urlPhone: string): string {
  if (urlPhone.startsWith('9720')) return '972' + urlPhone.slice(4);
  return urlPhone;
}
