import { label } from '../utils/format.js';

const toneMap = {
  CRITICAL: 'tone-red',
  HIGH: 'tone-orange',
  MEDIUM: 'tone-amber',
  LOW: 'tone-green',
  NEGATIVE: 'tone-red',
  NEUTRAL: 'tone-gray',
  POSITIVE: 'tone-teal',
  OPEN: 'tone-blue',
  IN_PROGRESS: 'tone-purple',
  RESOLVED: 'tone-green',
  CLOSED: 'tone-gray',
  LOCAL: 'tone-teal',
  REAL: 'tone-blue',
  ENABLED: 'tone-green',
  DISABLED: 'tone-gray',
  HIGH_VALUE: 'tone-blue',
  PREMIUM: 'tone-teal',
  AT_RISK: 'tone-orange',
  NORMAL: 'tone-gray',
};

export function Badge({ value }) {
  return <span className={`badge ${toneMap[value] || 'tone-gray'}`}>{label(value)}</span>;
}
