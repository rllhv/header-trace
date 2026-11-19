export type Severity = 'danger' | 'warning' | 'info' | 'ok';

export interface HeaderField {
  name: string;
  value: string;
  line: number;
}

export interface ParsedHeaders {
  fields: HeaderField[];
  malformedLines: number;
  truncated: boolean;
}

export interface Address {
  display: string;
  email: string;
  local: string;
  domain: string;
}

export interface Hop {
  raw: string;
  /** Name the sending server gave itself (HELO/EHLO). A claim, not proof. */
  from: string;
  /** Reverse-DNS name recorded by the receiving server, "" when none. */
  rdns: string;
  ip: string;
  by: string;
  protocol: string;
  /** Epoch milliseconds, null when the timestamp could not be read. */
  time: number | null;
  /** Milliseconds since the previous timestamped hop (chronological). */
  delayMs: number | null;
  /** True when the step was recorded by the recipient's own mail provider. */
  trusted: boolean;
}

export interface AuthMethodResult {
  method: string;
  result: string;
  props: Record<string, string>;
}

export interface AuthResults {
  source: 'authentication-results' | 'received-spf' | 'none';
  serverId: string;
  results: AuthMethodResult[];
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  why: string;
  evidence: string[];
}

export interface Context {
  headers: ParsedHeaders;
  from: Address | null;
  hops: Hop[];
  auth: AuthResults;
}

export interface Counts {
  danger: number;
  warning: number;
  info: number;
  ok: number;
}

export interface Analysis {
  headers: ParsedHeaders;
  from: Address | null;
  subject: string;
  date: number | null;
  dateRaw: string;
  hops: Hop[];
  auth: AuthResults;
  findings: Finding[];
  counts: Counts;
}
