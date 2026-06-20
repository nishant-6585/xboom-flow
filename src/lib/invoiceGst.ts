// GST helpers for self-generated XBoom Proforma invoices.
// Seller state = Karnataka (state code 29). Line totals can be either
// GST-inclusive or GST-exclusive depending on the source pricing flag.

export const SELLER_STATE_CODE = '29';
export const SELLER_STATE_NAME = 'Karnataka';
export const DEFAULT_HSN = '88062200';
export const DEFAULT_GST_RATE = 5;

export type GstTreatment = 'igst' | 'cgst_sgst';

export interface GstSplit {
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  treatment: GstTreatment;
  rate: number;
}

export function getGstTreatment(placeOfSupplyCode: string | null | undefined): GstTreatment {
  return (placeOfSupplyCode || '').trim() === SELLER_STATE_CODE ? 'cgst_sgst' : 'igst';
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Back-calculate taxable + tax from a GST-INCLUSIVE gross amount.
 */
export function splitGstInclusive(gross: number, rate: number, treatment: GstTreatment): GstSplit {
  const r = Number(rate) || 0;
  const taxable = round2(gross / (1 + r / 100));
  const tax = round2(gross - taxable);
  if (treatment === 'cgst_sgst') {
    const half = round2(tax / 2);
    return { taxable, tax, cgst: half, sgst: tax - half, igst: 0, treatment, rate: r };
  }
  return { taxable, tax, cgst: 0, sgst: 0, igst: tax, treatment, rate: r };
}

/**
 * Compute taxable + tax from a GST-EXCLUSIVE net amount.
 * Total line amount = net + tax.
 */
export function splitGstExclusive(net: number, rate: number, treatment: GstTreatment): GstSplit {
  const r = Number(rate) || 0;
  const taxable = round2(net);
  const tax = round2(taxable * r / 100);
  if (treatment === 'cgst_sgst') {
    const half = round2(tax / 2);
    return { taxable, tax, cgst: half, sgst: tax - half, igst: 0, treatment, rate: r };
  }
  return { taxable, tax, cgst: 0, sgst: 0, igst: tax, treatment, rate: r };
}

// Indian-numbering amount in words for INR (paise included).
export function inrAmountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  };
  const threeDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 100) return twoDigits(n);
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + twoDigits(n % 100) : '');
  };
  const inrWords = (n: number): string => {
    if (n === 0) return 'Zero';
    let out = '';
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) out += twoDigits(crore) + ' Crore ';
    if (lakh) out += twoDigits(lakh) + ' Lakh ';
    if (thousand) out += twoDigits(thousand) + ' Thousand ';
    if (n) out += threeDigits(n);
    return out.trim().replace(/\s+/g, ' ');
  };

  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  let words = 'Indian Rupee ' + inrWords(rupees);
  if (paise > 0) words += ' and ' + inrWords(paise) + ' Paise';
  return words + ' Only';
}

// Heuristic to guess Indian state code from an address/state string.
const STATE_CODES: Record<string, string> = {
  'andhra pradesh': '37', 'arunachal pradesh': '12', 'assam': '18', 'bihar': '10',
  'chhattisgarh': '22', 'goa': '30', 'gujarat': '24', 'haryana': '06',
  'himachal pradesh': '02', 'jharkhand': '20', 'karnataka': '29', 'kerala': '32',
  'madhya pradesh': '23', 'maharashtra': '27', 'manipur': '14', 'meghalaya': '17',
  'mizoram': '15', 'nagaland': '13', 'odisha': '21', 'punjab': '03', 'rajasthan': '08',
  'sikkim': '11', 'tamil nadu': '33', 'telangana': '36', 'tripura': '16',
  'uttar pradesh': '09', 'uttarakhand': '05', 'west bengal': '19',
  'delhi': '07', 'jammu and kashmir': '01', 'ladakh': '38', 'chandigarh': '04',
  'puducherry': '34', 'andaman and nicobar islands': '35', 'dadra and nagar haveli': '26',
  'daman and diu': '25', 'lakshadweep': '31',
};

export function guessStateCode(text: string | null | undefined): { code: string; name: string } {
  const s = (text || '').toLowerCase();
  for (const [name, code] of Object.entries(STATE_CODES)) {
    if (s.includes(name)) return { code, name: name.replace(/\b\w/g, c => c.toUpperCase()) };
  }
  return { code: SELLER_STATE_CODE, name: SELLER_STATE_NAME };
}

export const INDIAN_STATES = Object.entries(STATE_CODES)
  .map(([name, code]) => ({ code, name: name.replace(/\b\w/g, c => c.toUpperCase()) }))
  .sort((a, b) => a.name.localeCompare(b.name));