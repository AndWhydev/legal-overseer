/** Directory domains to filter from organic SERP results */
export const DIRECTORY_DOMAINS = new Set([
  // Social media
  'facebook.com', 'linkedin.com', 'instagram.com', 'twitter.com', 'x.com',
  'youtube.com', 'tiktok.com', 'reddit.com', 'quora.com', 'pinterest.com', 'threads.net',
  // Australian directories
  'yellowpages.com.au', 'truelocal.com.au', 'hotfrog.com.au', 'oneflare.com.au',
  'hipages.com.au', 'productreview.com.au', 'localsearch.com.au', 'startlocal.com.au',
  'yelp.com.au', 'yelp.com', 'whitepages.com.au', 'infobel.com',
  // Marketplaces
  'airtasker.com', 'serviceseeking.com.au', 'bark.com', 'thumbtack.com',
  'fiverr.com', 'upwork.com', 'freelancer.com',
  // Job boards
  'seek.com.au', 'indeed.com', 'indeed.com.au', 'glassdoor.com',
  'jora.com', 'careerone.com.au',
  // Review aggregators
  'birdeye.com', 'trustpilot.com', 'reviews.io', 'podium.com',
  // Generic/tech
  'wikipedia.org', 'google.com', 'google.com.au', 'bing.com',
  'g2.com', 'capterra.com', 'medium.com', 'github.com',
  // News/media
  'news.com.au', 'smh.com.au', 'abc.net.au', 'sbs.com.au',
])

export const DIRECTORY_URL_PATTERNS = [
  '/r/', '/company/', '/biz/', '/local/', '/business/',
  '/pages/', '/profile/', '/user/', '/comments/', '/questions/',
  '/listing/', '/directory/', '/find-a-', '/search?', '/review/',
  '/reviews/', '/category/', '/service-provider/', '/tradies/',
]

export const CMS_SIGNATURES: Record<string, string[]> = {
  'WordPress': ['/wp-content/', '/wp-includes/', 'wp-json', 'wordpress'],
  'Wix': ['wix.com', 'wixsite.com', '_wix_browser_sess', 'wix-code'],
  'Squarespace': ['squarespace.com', 'static.squarespace', 'sqsp.net'],
  'Shopify': ['cdn.shopify.com', 'myshopify.com', 'shopify'],
  'Webflow': ['webflow.com', 'assets-global.website-files', 'webflow.io'],
  'Weebly': ['weebly.com', 'weeblycloud.com'],
  'GoDaddy': ['godaddy.com', 'secureserver.net', 'godaddysites'],
  'Joomla': ['joomla', '/components/com_'],
  'Drupal': ['drupal', '/sites/default/'],
}

export const TRACKING_SIGNATURES: Record<string, string[]> = {
  google_analytics: ['google-analytics.com', 'gtag(', 'ga(', 'G-', 'UA-', 'googletagmanager.com'],
  facebook_pixel: ['facebook.com/tr', 'fbq(', 'connect.facebook.net'],
  google_ads: ['googleadservices.com', 'googlesyndication.com', 'AW-', 'google_conversion'],
}

export const BOOKING_SIGNATURES = [
  'calendly.com', 'acuityscheduling', 'youcanbook.me', 'setmore.com',
  'square.site/book', 'fresha.com', 'book-online', 'book-now',
  'schedule-appointment', 'hubspot.com/meetings', 'bookings.google.com',
  'appointlet.com', 'simplybook.me', 'timify.com',
]

/** DIY CMS platforms (high opportunity signal) */
export const DIY_CMS = ['Wix', 'Weebly', 'GoDaddy']

/** Australian phone regex patterns */
export const PHONE_PATTERNS = [
  /(?:\+61|0)[2-478](?:[ -]?\d){8}/g,
  /\(\d{2}\)[ -]?\d{4}[ -]?\d{4}/g,
  /1[38]00[ -]?\d{3}[ -]?\d{3}/g,
  /13[ -]?\d{2}[ -]?\d{2}/g,
]

export const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

export const SPAM_EMAIL_DOMAINS = new Set([
  'error-tracking.reddit.com', 'sentry.io', 'bugsnag.com', 'wix.com',
  'wixpress.com', 'wordpress.com', 'squarespace.com', 'squarespace-mail.com',
  'mailchimp.com', 'sendgrid.net', 'amazonses.com', 'mailgun.org',
  'mandrillapp.com', 'sparkpostmail.com', 'postmarkapp.com',
  'intercom-mail.com', 'zendesk.com', 'freshdesk.com',
])

export const SPAM_EMAIL_PATTERNS = [
  /error[-_]tracking/i, /sentry/i, /bugsnag/i, /noreply/i,
  /no-reply/i, /donotreply/i, /mailer-daemon/i, /postmaster/i,
  /automated/i, /notifications/i, /[a-f0-9]{20,}@.*/i,
]

/** Australian state abbreviation to full name mapping */
export const AU_STATES: Record<string, string> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  WA: 'Western Australia',
  SA: 'South Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
}

/** Scoring weights */
export const FIT_WEIGHTS = {
  website: 15,
  phone: 15,
  email: 10,
  maps_presence: 15,
  good_rating: 10,
  review_count: 10,
  ads_presence: 10,
  organic_top10: 15,
} as const

export const OPPORTUNITY_WEIGHTS = {
  no_analytics: 15,
  no_pixel: 10,
  no_booking: 15,
  no_contact: 10,
  weak_cms: 10,
  slow_site: 10,
  running_ads_penalty: -10,
  good_tracking_penalty: -10,
  poor_maps_ranking: 10,
  poor_organic_ranking: 20,
} as const

export const PRIORITY_WEIGHTS = { fit: 0.4, opportunity: 0.6 } as const
