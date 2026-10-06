import test from 'node:test';
import assert from 'node:assert/strict';
import { atYear, yearLength, dayIndex, dateAt } from '../src/dates.ts';

test('year selection clamps leap day without rolling into March', () => {
  assert.equal(atYear('2028-02-29', 2029), '2029-02-28');
  assert.equal(atYear('2027-02-28', 2028), '2028-02-28');
  assert.equal(atYear('2026-12-31', 2027), '2027-12-31');
});
test('slider covers every date once and never leaves the selected year', () => {
  for (const year of [2026, 2028, 2100, 2400]) {
    const count = yearLength(year);
    assert.equal(dateAt(year, -1), `${year}-01-01`);
    assert.equal(dateAt(year, count + 1), `${year}-12-31`);
    const dates = new Set();
    for (let index = 0; index < count; index++) {
      const date = dateAt(year, index);
      assert.equal(dayIndex(date), index);
      dates.add(date);
    }
    assert.equal(dates.size, count);
  }
  assert.equal(yearLength(2028), 366);
  assert.equal(yearLength(2100), 365);
});
