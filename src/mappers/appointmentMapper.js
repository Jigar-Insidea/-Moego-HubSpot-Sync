const env = require('../config/env');

const STAGE_MAP = {
  'UNCONFIRMED': '4186335942', // Booked
  'CONFIRMED': '4186335942',   // Booked
  'CHECKED_IN': '4186335943',  // Checked In
  'READY': '4186335944',       // Ready
  'FINISHED': '4186335945',    // Completed
  'CANCELED': '4186335946',    // Cancelled
  'NO_SHOW': '4186335947'      // No-Show
};

const CLOSED_STAGES = new Set([
  '4186335945', // Completed
  '4186335946', // Cancelled
  '4186335947'  // No-Show
]);

function mapAppointmentLocation(businessId) {
  if (businessId === 'bizVaEO') return "Vera's Posh Paws OKC";
  return "Vera's Posh Paws Moore";
}

function mapDealStage(appointment) {
  if (appointment.noShow) return STAGE_MAP['NO_SHOW'];
  const status = appointment.status || 'UNCONFIRMED';
  return STAGE_MAP[status] || STAGE_MAP['CONFIRMED'];
}

/**
 * Maps MoeGo Appointment to HubSpot Deal in "MoeGo Appointments" pipeline
 */
function mapAppointmentToDeal(appointment, groomerName = '') {
  const apptId = appointment.id;
  const psd = appointment.petServiceDetails || [];
  const petInAppt = psd[0]?.pet?.name || 'Pet';
  
  const sd = psd[0]?.serviceDetails || [];
  const sd0 = sd[0] || {};
  const serviceName = sd0.name || 'Grooming';
  const serviceType = (sd0.serviceItemType || 'GROOMING').toLowerCase();
  const formattedServiceType = serviceType.charAt(0).toUpperCase() + serviceType.slice(1);

  const totalUnits = appointment.totalAmount?.units || sd0.price?.units || '0';
  const startTime = appointment.duration?.startTime || '';
  const dateStr = startTime ? startTime.split('T')[0] : new Date().toISOString().split('T')[0];
  const dealName = `${petInAppt} - ${serviceName} - ${dateStr}`;

  const dealStage = mapDealStage(appointment);
  const isClosedStage = CLOSED_STAGES.has(dealStage);

  const properties = {
    moego_appointment_id: apptId,
    dealname: dealName,
    pipeline: env.HUBSPOT_PIPELINE_ID || 'default',
    dealstage: dealStage,
    amount: String(totalUnits),
    appointment_service_type: formattedServiceType,
    appointment_groomer: groomerName,
    appointment_location: mapAppointmentLocation(appointment.businessId)
  };

  if (startTime) {
    properties.appointment_date = startTime;
    // Strict SOW Rule: closedate is only stamped on closed stages
    if (isClosedStage) {
      properties.closedate = startTime;
    } else {
      properties.closedate = '';
    }
  }

  return properties;
}

module.exports = {
  mapAppointmentToDeal,
  mapDealStage,
  mapAppointmentLocation,
  STAGE_MAP,
  CLOSED_STAGES
};
