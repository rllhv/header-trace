export interface Brand {
  name: string;
  /** Main label used for look-alike comparison, lower case. */
  label: string;
  /** Registrable domains that genuinely belong to the brand. */
  domains: string[];
  /** Names that may appear in a display name, lower case. Defaults to [label]. */
  aliases?: string[];
}

// Examples only. Extend this list for the brands that matter to your readers.
export const BRANDS: Brand[] = [
  { name: 'PayPal', label: 'paypal', domains: ['paypal.com', 'paypal.me'] },
  { name: 'Google', label: 'google', domains: ['google.com', 'gmail.com', 'googlemail.com', 'youtube.com'] },
  { name: 'Microsoft', label: 'microsoft', domains: ['microsoft.com', 'outlook.com', 'office.com', 'live.com', 'microsoftonline.com', 'office365.com'] },
  { name: 'Apple', label: 'apple', domains: ['apple.com', 'icloud.com'] },
  { name: 'Amazon', label: 'amazon', domains: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.in', 'amazon.sa', 'amazon.ae', 'amazon.eg', 'amazon.com.au'] },
  { name: 'Facebook', label: 'facebook', domains: ['facebook.com', 'facebookmail.com', 'fb.com', 'meta.com'] },
  { name: 'Instagram', label: 'instagram', domains: ['instagram.com'] },
  { name: 'WhatsApp', label: 'whatsapp', domains: ['whatsapp.com'] },
  { name: 'Netflix', label: 'netflix', domains: ['netflix.com'] },
  { name: 'LinkedIn', label: 'linkedin', domains: ['linkedin.com'] },
  { name: 'Dropbox', label: 'dropbox', domains: ['dropbox.com'] },
  { name: 'DocuSign', label: 'docusign', domains: ['docusign.com', 'docusign.net'] },
  { name: 'GitHub', label: 'github', domains: ['github.com'] },
  { name: 'Binance', label: 'binance', domains: ['binance.com'] },
  { name: 'Coinbase', label: 'coinbase', domains: ['coinbase.com'] },
  { name: 'Telegram', label: 'telegram', domains: ['telegram.org', 't.me'] },
  { name: 'DHL', label: 'dhl', domains: ['dhl.com', 'dhl.de'] },
  { name: 'FedEx', label: 'fedex', domains: ['fedex.com'] },
  { name: 'UPS', label: 'ups', domains: ['ups.com'] },
  { name: 'Aramex', label: 'aramex', domains: ['aramex.com'] },
  { name: 'Noon', label: 'noon', domains: ['noon.com'] },
  { name: 'Careem', label: 'careem', domains: ['careem.com'] },
  { name: 'stc', label: 'stc', domains: ['stc.com.sa'] },
  { name: 'Al Rajhi Bank', label: 'alrajhibank', domains: ['alrajhibank.com.sa'], aliases: ['al rajhi', 'alrajhi', 'alrajhibank', 'الراجحي'] },
  { name: 'Saudi National Bank', label: 'snb', domains: ['snb.com.sa'] },
  { name: 'Riyad Bank', label: 'riyadbank', domains: ['riyadbank.com'], aliases: ['riyad bank', 'riyadbank'] },
  { name: 'Alinma Bank', label: 'alinma', domains: ['alinma.com'] },
  { name: 'Absher', label: 'absher', domains: ['absher.sa'], aliases: ['absher', 'أبشر'] },
  { name: 'Saudi Post (SPL)', label: 'splonline', domains: ['splonline.com.sa'], aliases: ['splonline', 'saudi post'] },
];
