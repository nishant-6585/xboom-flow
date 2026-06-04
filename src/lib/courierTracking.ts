/**
 * Courier tracking URL builders.
 * Given a courier name + tracking number, returns the carrier's
 * tracking page URL with the number prefilled where possible.
 */

export interface CourierOption {
  name: string;
  /**
   * Public tracking landing page where the customer pastes their
   * tracking number to view shipment status. We DO NOT append the
   * tracking number to the URL — most courier sites don't accept it
   * via querystring reliably, so we send the customer to the page
   * where they manually enter the AWB/tracking number.
   */
  trackingPage: string;
}

/**
 * In-memory cache of courier partners. Seeded with the same list that
 * lives in the `public.courier_partners` table so that lookups work
 * before the DB has been hydrated. Once `useCourierPartners` (or any
 * caller) fetches the live list, it calls `setCourierPartners()` to
 * replace this cache so newly-added couriers from the Suppliers tab
 * become available everywhere (combobox, tracking link generator).
 */
let COURIER_PARTNERS: CourierOption[] = [
  { name: 'Shree Tirupati Courier', trackingPage: 'http://www.shreetirupaticourier.net/' },
  { name: 'DTDC', trackingPage: 'https://www.dtdc.com/track-your-shipment/' },
  { name: 'Bluedart', trackingPage: 'https://www.bluedart.com/tracking' },
  { name: 'Shadowfax', trackingPage: 'https://tracker.shadowfax.in/' },
  { name: 'Delhivery', trackingPage: 'https://www.delhivery.com/tracking' },
  { name: 'Trackon', trackingPage: 'https://trackon.in/Tracking/MultiAWBTracking' },
  { name: 'The Professional Couriers', trackingPage: 'https://www.tpcindia.com/Tracking2.aspx' },
  { name: 'Xpressbees', trackingPage: 'https://www.xpressbees.com/shipment/tracking' },
  { name: 'FedEx India', trackingPage: 'https://www.fedex.com/fedextrack/' },
  { name: 'Gati', trackingPage: 'https://www.gati.com/tracking/' },
  { name: 'Ecom Express', trackingPage: 'https://ecomexpress.in/tracking/' },
  { name: 'DHL Express India', trackingPage: 'https://www.dhl.com/in-en/home/tracking.html' },
  { name: 'Aramex India', trackingPage: 'https://www.aramex.com/in/en/track/track-by-tracking-number' },
  { name: 'India Post (Speed Post)', trackingPage: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx' },
  { name: 'ST Courier', trackingPage: 'https://stcourier.com/track/shipment' },
  { name: 'Porter', trackingPage: 'https://porter.in/track' },
  { name: 'Office Delivery', trackingPage: '' },
  { name: 'Bus', trackingPage: '' },
];

export function getCourierPartners(): CourierOption[] {
  return COURIER_PARTNERS;
}

export function getCourierNames(): string[] {
  return COURIER_PARTNERS.map((c) => c.name);
}

/** Replace the in-memory cache with the live list from the DB. */
export function setCourierPartners(list: CourierOption[]) {
  if (Array.isArray(list) && list.length > 0) {
    COURIER_PARTNERS = list;
  }
}

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
  _trackingNumber?: string | null | undefined,
): string {
  const courier = findCourier(courierName);
  if (!courier) return '';
  return courier.trackingPage;
}

/**
 * @deprecated Use `getCourierNames()` so newly-added couriers from the
 * Suppliers tab are reflected. Kept as a Proxy-backed live view so
 * existing imports (`COURIER_NAMES.filter(...)`, `.some(...)`, `.map(...)`)
 * keep working without immediate refactors.
 */
export const COURIER_NAMES: string[] = new Proxy([] as string[], {
  get(_t, prop, receiver) {
    const live = COURIER_PARTNERS.map((c) => c.name);
    const value = Reflect.get(live, prop, receiver);
    return typeof value === 'function' ? value.bind(live) : value;
  },
  has(_t, prop) {
    return prop in COURIER_PARTNERS.map((c) => c.name);
  },
  ownKeys() {
    return Reflect.ownKeys(COURIER_PARTNERS.map((c) => c.name));
  },
  getOwnPropertyDescriptor(_t, prop) {
    return Object.getOwnPropertyDescriptor(COURIER_PARTNERS.map((c) => c.name), prop);
  },
}) as string[];