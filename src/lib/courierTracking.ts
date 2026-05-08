/**
 * Courier tracking URL builders.
 * Given a courier name + tracking number, returns the carrier's
 * tracking page URL with the number prefilled where possible.
 */

export interface CourierOption {
  name: string;
  /** Builds a tracking URL for a given AWB / tracking number. */
  build: (trackingNumber: string) => string;
  /** Fallback site URL if tracking number not provided. */
  homepage: string;
}

const enc = (s: string) => encodeURIComponent(s.trim());

export const COURIER_PARTNERS: CourierOption[] = [
  {
    name: 'Shree Tirupati Courier',
    homepage: 'http://www.shreetirupaticourier.net/',
    build: (n) => `http://www.shreetirupaticourier.net/?awb=${enc(n)}`,
  },
  {
    name: 'DTDC',
    homepage: 'https://www.dtdc.com/track-your-shipment/',
    build: (n) => `https://www.dtdc.in/tracking/tracking_results.asp?strCnno=${enc(n)}&TrkType=cnno`,
  },
  {
    name: 'Bluedart',
    homepage: 'https://www.bluedart.com/',
    build: (n) => `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${enc(n)}`,
  },
  {
    name: 'Shadowfax',
    homepage: 'https://shadowfax.in/',
    build: (n) => `https://tracker.shadowfax.in/#/awb/${enc(n)}`,
  },
  {
    name: 'Delhivery',
    homepage: 'https://www.delhivery.com/',
    build: (n) => `https://www.delhivery.com/tracking?awb=${enc(n)}`,
  },
  {
    name: 'Trackon',
    homepage: 'https://www.trackon.in/',
    build: (n) => `https://trackon.in/Tracking/MultiAWBTracking?awb=${enc(n)}`,
  },
  {
    name: 'The Professional Couriers',
    homepage: 'https://www.tpcindia.com/',
    build: (n) => `https://www.tpcindia.com/Tracking2.aspx?id=${enc(n)}`,
  },
  {
    name: 'Xpressbees',
    homepage: 'https://www.xpressbees.com/',
    build: (n) => `https://www.xpressbees.com/shipment/tracking?awbNo=${enc(n)}`,
  },
  {
    name: 'FedEx India',
    homepage: 'https://www.fedex.com/en-in/home.html',
    build: (n) => `https://www.fedex.com/fedextrack/?trknbr=${enc(n)}`,
  },
  {
    name: 'Gati',
    homepage: 'https://www.gati.com/',
    build: (n) => `https://www.gati.com/tracking/?awbNo=${enc(n)}`,
  },
  {
    name: 'Ecom Express',
    homepage: 'https://ecomexpress.in/',
    build: (n) => `https://ecomexpress.in/tracking/?awb=${enc(n)}`,
  },
  {
    name: 'DHL Express India',
    homepage: 'https://www.dhl.co.in/',
    build: (n) => `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${enc(n)}`,
  },
  {
    name: 'Aramex India',
    homepage: 'https://www.aramex.com/',
    build: (n) => `https://www.aramex.com/in/en/track/results?ShipmentNumber=${enc(n)}`,
  },
  {
    name: 'India Post (Speed Post)',
    homepage: 'https://www.indiapost.gov.in/',
    build: (n) => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id=${enc(n)}`,
  },
  {
    name: 'ST Courier',
    homepage: 'https://stcourier.com/',
    build: (n) => `https://stcourier.com/track/shipment?id=${enc(n)}`,
  },
  {
    name: 'Porter',
    homepage: 'https://porter.in/',
    build: (n) => `https://porter.in/track?id=${enc(n)}`,
  },
  {
    name: 'Office Delivery',
    homepage: '',
    build: () => '',
  },
  {
    name: 'Bus',
    homepage: '',
    build: () => '',
  },
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function findCourier(name: string | null | undefined): CourierOption | null {
  if (!name) return null;
  const target = norm(name);
  if (!target) return null;
  // exact / contains match
  for (const c of COURIER_PARTNERS) {
    const cn = norm(c.name);
    if (cn === target || cn.includes(target) || target.includes(cn)) return c;
  }
  return null;
}

/**
 * Build a tracking URL from courier name + tracking number.
 * Returns an empty string when no match or no number is provided.
 */
export function buildTrackingUrl(
  courierName: string | null | undefined,
  trackingNumber: string | null | undefined,
): string {
  const courier = findCourier(courierName);
  const num = (trackingNumber ?? '').trim();
  if (!courier) return '';
  if (!num) return courier.homepage;
  return courier.build(num);
}

export const COURIER_NAMES = COURIER_PARTNERS.map((c) => c.name);