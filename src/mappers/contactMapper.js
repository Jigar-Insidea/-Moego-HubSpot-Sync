const { normalizeE164 } = require('../utils/phoneNormalizer');

function formatRawAddress(addrList) {
  if (!addrList || !Array.isArray(addrList) || addrList.length === 0) return '';
  const a = addrList[0];
  const parts = [a.address1, a.address2, a.city, a.state, a.postalCode];
  return parts.filter(p => p && String(p).trim().length > 0).map(p => String(p).trim()).join(', ');
}

function mapLocation(businessId) {
  if (businessId === 'bizVaEO') return 'okc';
  return 'moore'; // default Moore location
}

function mapCustomerStatus(status) {
  if (status && String(status).toUpperCase() === 'INACTIVE') return 'inactive';
  return 'active';
}

function mapContactType(source) {
  if (source && String(source).toLowerCase().includes('lead')) return 'lead';
  return 'customer';
}

function mapReferralSource(source) {
  if (!source) return '';
  const s = String(source).toLowerCase().trim();
  const validSources = ['dm', 'ob', 'manual', 'call', 'text'];
  return validSources.includes(s) ? s : 'manual';
}

function mapFixedStatus(rawFixed) {
  if (!rawFixed) return 'unknown';
  const rf = String(rawFixed).toLowerCase().trim();
  if (rf.includes('spayed')) return 'spayed';
  if (rf.includes('neutered')) return 'neutered';
  if (rf.includes('unaltered') || rf.includes('not fixed') || rf === 'no') return 'not_fixed';
  return 'unknown';
}

function mapPetType(type) {
  if (!type) return 'other';
  const t = String(type).toLowerCase();
  if (t.includes('dog')) return 'dog';
  if (t.includes('cat')) return 'cat';
  return 'other';
}

function mapPetSize(weightVal) {
  try {
    const w = parseFloat(weightVal);
    if (isNaN(w) || w <= 0) return 'small';
    if (w < 15) return 'extra_small';
    if (w <= 30) return 'small';
    if (w <= 50) return 'medium';
    if (w <= 80) return 'large';
    if (w <= 100) return 'extra_large';
    return 'xx_large';
  } catch {
    return 'small';
  }
}

/**
 * Maps a MoeGo Customer record + pets list + appointments list to HubSpot Contact properties
 */
function mapCustomerToContact(customer, pets = [], appointments = []) {
  const customerId = customer.id;
  const phone = normalizeE164(customer.phone);
  const email = customer.email ? customer.email.trim().toLowerCase() : '';

  // Active pets filter: status == ALIVE and not deleted
  const activePets = pets.filter(p => p.status === 'ALIVE' && !p.deleted);
  const petCount = activePets.length;
  const primaryPet = petCount > 0 ? activePets[0] : null;

  // Appointment calculations & roll-ups
  const totalBookings = appointments.length;
  let totalSales = 0;
  for (const a of appointments) {
    const amt = parseFloat(a.totalAmount?.units || 0);
    if (!isNaN(amt)) totalSales += amt;
  }

  let lastVisitDate = customer.lastAppointmentDate ? customer.lastAppointmentDate.split('T')[0] : '';
  let lastGroomingDate = '';
  let lastBoardingDate = '';
  let lastDaycareDate = '';
  let lastGroomerName = '';

  if (appointments.length > 0) {
    // Sort appointments descending
    const sortedApts = [...appointments].sort((a, b) => {
      const ta = a.duration?.startTime || '';
      const tb = b.duration?.startTime || '';
      return tb.localeCompare(ta);
    });

    if (!lastVisitDate && sortedApts[0].duration?.startTime) {
      lastVisitDate = sortedApts[0].duration.startTime.split('T')[0];
    }

    for (const a of sortedApts) {
      const sTime = a.duration?.startTime ? a.duration.startTime.split('T')[0] : '';
      const psdList = a.petServiceDetails || [];
      for (const ps of psdList) {
        for (const sd of ps.serviceDetails || []) {
          const stype = sd.serviceItemType || '';
          if (stype === 'GROOMING' && !lastGroomingDate) lastGroomingDate = sTime;
          else if (stype === 'BOARDING' && !lastBoardingDate) lastBoardingDate = sTime;
          else if (stype === 'DAYCARE' && !lastDaycareDate) lastDaycareDate = sTime;
        }
      }
    }
  }

  const properties = {
    moego_customer_id: customerId,
    firstname: customer.firstName || '',
    lastname: customer.lastName || '',
    phone: phone,
    street_address_raw: formatRawAddress(customer.address),
    location: mapLocation(customer.preferredBusinessId),
    customer_status: mapCustomerStatus(customer.status),
    contact_type: mapContactType(customer.source),
    pet_count: String(petCount),
    total_bookings_number: String(totalBookings),
    total_sales: String(Math.round(totalSales))
  };

  if (email && email.includes('@')) {
    properties.email = email;
  }

  if (customer.source) {
    properties.referral_source = mapReferralSource(customer.source);
  }

  if (lastVisitDate) properties.last_visit_date = lastVisitDate;
  if (lastGroomingDate) properties.last_grooming_date = lastGroomingDate;
  if (lastBoardingDate) properties.last_boarding_date = lastBoardingDate;
  if (lastDaycareDate) properties.last_daycare_date = lastDaycareDate;

  // Compliance / Do Not Contact rule: Write TRUE only, never false
  const mktgChannels = customer.complianceConfig?.marketingCampaignsChannels || [];
  if (customer.complianceConfig && mktgChannels.length === 0) {
    properties.do_not_contact = 'true';
  }

  // Primary Pet Stamping: ONLY if active pet exists; otherwise blank
  if (primaryPet) {
    const rawWeight = String(primaryPet.weight?.value || '');
    properties.primary_pet_name = primaryPet.name || '';
    properties.primary_pet_type = mapPetType(primaryPet.type);
    properties.primary_pet_breed = primaryPet.breed || '';
    properties.primary_pet_size = mapPetSize(rawWeight);
    if (rawWeight && rawWeight !== '0') properties.primary_pet_weight = rawWeight;
    properties.primary_pet_spayed__neutered = mapFixedStatus(primaryPet.fixed);
    if (primaryPet.coat) properties.primary_coat_type = primaryPet.coat.toLowerCase();
  } else {
    properties.primary_pet_name = '';
    properties.primary_pet_type = '';
    properties.primary_pet_breed = '';
    properties.primary_pet_size = '';
    properties.primary_pet_weight = '';
    properties.primary_pet_spayed__neutered = '';
    properties.primary_coat_type = '';
  }

  return properties;
}

module.exports = {
  mapCustomerToContact,
  formatRawAddress,
  mapLocation,
  mapCustomerStatus,
  mapContactType,
  mapReferralSource,
  mapFixedStatus,
  mapPetType
};
