import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerName } from '../src/features/signing/certificate.js';

test('certificate owner prefers personal attributes and accepts their long aliases', () => {
  assert.equal(ownerName('CN=Organization, SN=Ivanov, G=Ivan'), 'Ivanov Ivan');
  assert.equal(ownerName('SURNAME=Ivanov, GIVENNAME=Ivan'), 'Ivanov Ivan');
  assert.equal(ownerName('cn=Example'), 'Example');
});

test('certificate owner handles quoted commas, escaped punctuation, and missing names', () => {
  assert.equal(
    ownerName('CN="Example, ""Company""", O=Other'),
    'Example, "Company"',
  );
  assert.equal(ownerName('CN=Example\\, Company, O=Other'), 'Example, Company');
  assert.equal(ownerName('O=Company', 'Unavailable'), 'Unavailable');
  assert.equal(ownerName('Unstructured subject'), 'Unstructured subject');
});
