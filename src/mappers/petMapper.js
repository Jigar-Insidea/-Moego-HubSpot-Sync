const { mapFixedStatus } = require('./contactMapper');

function mapPetStatus(status, isDeleted) {
  if (status === 'PASSED_AWAY') return 'Passed Away';
  if (isDeleted) return 'Inactive';
  return 'Active';
}

function mapPetType(type) {
  if (!type) return 'Other';
  const t = String(type).toLowerCase();
  if (t.includes('dog')) return 'Dog';
  if (t.includes('cat')) return 'Cat';
  return 'Other';
}

function formatBirthday(bdayObj) {
  if (!bdayObj || !bdayObj.year) return '';
  const y = String(bdayObj.year).padStart(4, '0');
  const m = String(bdayObj.month || 1).padStart(2, '0');
  const d = String(bdayObj.day || 1).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Maps MoeGo Pet to HubSpot Company (Pets) properties
 * CRITICAL RULE 2: NEVER write the 'domain' property.
 */
function mapPetToCompany(pet) {
  const petId = pet.id;
  const petName = pet.name || 'Unnamed Pet';
  const notesList = (pet.notes || []).map(n => n.content || '').filter(Boolean);
  const groomingNotes = notesList.join('\n');

  const properties = {
    moego_pet_id: petId,
    name: petName,
    pet_type: mapPetType(pet.type),
    pet_breed: pet.breed || '',
    pet_weight: String(pet.weight?.value || ''),
    pet_spayed_neutered: mapFixedStatus(pet.fixed),
    pet_coat_type: pet.coat || '',
    pet_grooming_notes: groomingNotes,
    pet_status: mapPetStatus(pet.status, pet.deleted)
  };

  const bdayStr = formatBirthday(pet.birthday);
  if (bdayStr) {
    properties.pet_birthday = bdayStr;
  }

  return properties;
}

module.exports = {
  mapPetToCompany,
  mapPetStatus,
  mapPetType,
  formatBirthday
};
