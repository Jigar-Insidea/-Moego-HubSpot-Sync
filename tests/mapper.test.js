const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeE164 } = require('../src/utils/phoneNormalizer');
const { mapCustomerToContact } = require('../src/mappers/contactMapper');
const { mapPetToCompany } = require('../src/mappers/petMapper');
const { mapAppointmentToDeal } = require('../src/mappers/appointmentMapper');
const { acquireLock, releaseLock } = require('../src/sync/reconcileJob');

test('Phone normalization to E.164', () => {
  assert.equal(normalizeE164('4056097730'), '+14056097730');
  assert.equal(normalizeE164('(405) 609-7730'), '+14056097730');
  assert.equal(normalizeE164('+14056097730'), '+14056097730');
  assert.equal(normalizeE164(''), '');
});

test('Customer mapper strictly follows SOW and Active Pet rules', () => {
  const customer = {
    id: 'cuxXUwGVQ',
    firstName: 'James',
    lastName: 'Attaway',
    phone: '4056097730',
    email: '',
    status: 'INACTIVE',
    source: 'dm',
    preferredBusinessId: 'bizT2HX',
    address: [{ address1: '808 S Silver Leaf Dr', city: 'Moore', state: 'OK', postalCode: '73160' }]
  };

  const pets = [
    { id: 'petLnrgRW', name: 'McDuff', status: 'PASSED_AWAY', breed: 'Scottish Terrier', fixed: 'Neutered' }
  ];

  const appointments = [
    { id: 'apt1', totalAmount: { units: '20' }, duration: { startTime: '2012-11-23T13:00:00Z' } },
    { id: 'apt2', totalAmount: { units: '30' }, duration: { startTime: '2013-11-03T12:00:00Z' } }
  ];

  const contactProps = mapCustomerToContact(customer, pets, appointments);

  assert.equal(contactProps.firstname, 'James');
  assert.equal(contactProps.lastname, 'Attaway');
  assert.equal(contactProps.phone, '+14056097730');
  assert.equal(contactProps.customer_status, 'inactive');
  assert.equal(contactProps.location, 'moore');
  assert.equal(contactProps.referral_source, 'dm');
  assert.equal(contactProps.street_address_raw, '808 S Silver Leaf Dr, Moore, OK, 73160');
  assert.equal(contactProps.pet_count, '0');
  assert.equal(contactProps.primary_pet_name, '');
  assert.equal(contactProps.total_bookings_number, '2');
  assert.equal(contactProps.total_sales, '50');
});

test('Pet mapper enforces Rule 2 (domain is empty) and Rule 4 (Passed Away)', () => {
  const pet = {
    id: 'petLnrgRW',
    name: 'McDuff',
    type: 'DOG',
    breed: 'Scottish Terrier',
    status: 'PASSED_AWAY',
    fixed: 'Neutered',
    birthday: { year: 2010, month: 8, day: 28 },
    weight: { value: 20 }
  };

  const petProps = mapPetToCompany(pet);

  assert.equal(petProps.name, 'McDuff');
  assert.equal(petProps.moego_pet_id, 'petLnrgRW');
  assert.equal(petProps.pet_status, 'Passed Away');
  assert.equal(petProps.pet_spayed_neutered, 'neutered');
  assert.equal(petProps.pet_birthday, '2010-08-28');
  assert.equal(petProps.domain, undefined);
});

test('Appointment mapper suppresses closedate on open stages', () => {
  const openAppt = {
    id: 'aptY0j28r',
    status: 'UNCONFIRMED',
    totalAmount: { units: '20' },
    duration: { startTime: '2012-11-23T13:00:00Z' },
    petServiceDetails: [{
      pet: { name: 'McDuff' },
      serviceDetails: [{ name: 'Bath' }]
    }]
  };

  const dealProps = mapAppointmentToDeal(openAppt, 'Staff Posh Paws');

  assert.equal(dealProps.dealname, 'McDuff - Bath - 2012-11-23');
  assert.equal(dealProps.dealstage, '4186335942');
  assert.equal(dealProps.amount, '20');
  assert.equal(dealProps.appointment_date, '2012-11-23T13:00:00Z');
  assert.equal(dealProps.closedate, '');
});

test('Concurrency Lock prevents overlapping sync cycles', () => {
  releaseLock();
  
  // First cycle acquires lock
  const lock1 = acquireLock();
  assert.equal(lock1, true, 'First lock acquisition should succeed');

  // Second concurrent cycle tries to acquire lock while first is still running
  const lock2 = acquireLock();
  assert.equal(lock2, false, 'Second concurrent lock acquisition should be rejected/skipped');

  // First cycle finishes and releases lock
  releaseLock();

  // Subsequent cycle can now acquire lock
  const lock3 = acquireLock();
  assert.equal(lock3, true, 'Lock acquisition should succeed after previous cycle released lock');
  releaseLock();
});
