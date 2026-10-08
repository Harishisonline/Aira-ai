/**
 * Unit tests for the TypeScript NAQI mirror. Verifies that the TS version
 * produces the same output as the Python source of truth for the canonical
 * CPCB test cases. Cross-language consistency is also checked by
 * tests/test_aqi_consistency.py at the repo level.
 */

import { describe, it, expect } from 'vitest';
import { computeAqi, bucketFromAqi, BUCKETS, type PollutantKey } from './aqi';

describe('NAQI: low readings (Satisfactory)', () => {
  it('Case 1: PM2.5=20, PM10=40, NO2=20 -> Satisfactory', () => {
    const r = computeAqi({ pm25: 20, pm10: 40, no2: 20 });
    expect(r.bucket.label).toBe('Satisfactory');
    expect(r.aqi).toBeLessThan(100);
    expect(r.aqi).toBeGreaterThanOrEqual(51);
  });
});

describe('NAQI: Moderate from PM2.5', () => {
  it('Borivali-ish: PM2.5=78, PM10=128 -> AQI ~159', () => {
    const r = computeAqi({ pm25: 78, pm10: 128, no2: 32, so2: 9, co: 0.6, o3: 41 });
    expect(r.aqi).toBeGreaterThanOrEqual(130);
    expect(r.aqi).toBeLessThan(200);
    expect(r.bucket.label).toBe('Moderate');
    expect(r.dominantPollutant).toBe('pm25');
  });
});

describe('NAQI: Very Poor', () => {
  it('PM2.5=250 -> AQI=400, Very Poor', () => {
    const r = computeAqi({ pm25: 250 });
    expect(r.aqi).toBe(400);
    expect(r.bucket.label).toBe('Very Poor');
    expect(r.dominantPollutant).toBe('pm25');
  });
});

describe('NAQI: Severe', () => {
  it('PM2.5=380 -> AQI=500, Severe', () => {
    const r = computeAqi({ pm25: 380 });
    expect(r.aqi).toBe(500);
    expect(r.bucket.label).toBe('Severe');
  });
});

describe('NAQI: bucket ordering', () => {
  it('BUCKETS has exactly 6 buckets in order', () => {
    expect(BUCKETS).toHaveLength(6);
    expect(BUCKETS.map(b => b.label)).toEqual([
      'Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe',
    ]);
  });

  it('bucket boundaries are non-overlapping and ordered', () => {
    for (let i = 0; i < BUCKETS.length - 1; i++) {
      expect(BUCKETS[i].hiAqi).toBeLessThan(BUCKETS[i + 1].loAqi);
    }
  });
});

describe('NAQI: cross-language consistency with Python', () => {
  it('matches Python: PM2.5=35, PM10=75, NO2=60 -> AQI=75', () => {
    // Hardcoded from the Python naqi.py Case 1 output
    const r = computeAqi({ pm25: 35, pm10: 75, no2: 60 });
    expect(r.aqi).toBe(75);
    expect(r.bucket.label).toBe('Satisfactory');
    expect(r.dominantPollutant).toBe('pm10');
  });
});

describe('bucketFromAqi', () => {
  it('0 -> Good', () => expect(bucketFromAqi(0).label).toBe('Good'));
  it('50 -> Good', () => expect(bucketFromAqi(50).label).toBe('Good'));
  it('51 -> Satisfactory', () => expect(bucketFromAqi(51).label).toBe('Satisfactory'));
  it('100 -> Satisfactory', () => expect(bucketFromAqi(100).label).toBe('Satisfactory'));
  it('101 -> Moderate', () => expect(bucketFromAqi(101).label).toBe('Moderate'));
  it('200 -> Moderate', () => expect(bucketFromAqi(200).label).toBe('Moderate'));
  it('201 -> Poor', () => expect(bucketFromAqi(201).label).toBe('Poor'));
  it('500 -> Severe', () => expect(bucketFromAqi(500).label).toBe('Severe'));
});

describe('sub-indices', () => {
  it('returns sub-indices for each pollutant', () => {
    const r = computeAqi({ pm25: 78, pm10: 128, no2: 32, so2: 9, co: 0.6, o3: 41 });
    expect(Object.keys(r.subIndices).sort()).toEqual(['co', 'no2', 'o3', 'pm10', 'pm25', 'so2']);
    expect(r.subIndices.pm25).toBeGreaterThan(100);
  });
});

// Sanity: ensure every PollutantKey is accounted for in subIndices
describe('completeness', () => {
  it('every pollutant has a sub-index', () => {
    const pollutants: PollutantKey[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];
    const r = computeAqi({ pm25: 50, pm10: 80, no2: 40, so2: 10, co: 1, o3: 50 });
    for (const p of pollutants) {
      expect(r.subIndices[p]).toBeDefined();
      expect(r.subIndices[p]).toBeGreaterThanOrEqual(0);
    }
  });
});