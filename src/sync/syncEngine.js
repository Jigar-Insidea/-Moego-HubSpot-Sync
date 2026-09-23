const moegoClient = require('../services/moegoClient');
const hubspotClient = require('../services/hubspotClient');
const { mapCustomerToContact } = require('../mappers/contactMapper');
const { mapPetToCompany } = require('../mappers/petMapper');
const { mapAppointmentToDeal } = require('../mappers/appointmentMapper');
const { getSyncCursor, setSyncCursor, logSyncRun } = require('../storage/stateStore');
const logger = require('../utils/logger');

/**
 * Syncs a full customer tree (Contact -> Pets -> Appointments -> Dual Associations)
 */
async function syncCustomerBundle(customerId, preloadedAppointments = null) {
  logger.info(`Starting full bundle sync for customer ${customerId}...`);

  // 1. Fetch real customer profile
  const customer = await moegoClient.getCustomerById(customerId);
  if (!customer || !customer.id) {
    throw new Error(`Customer ${customerId} not found in MoeGo.`);
  }

  // 2. Fetch appointments for customer
  const appointments = preloadedAppointments || await moegoClient.getAllAppointmentsForCustomer(customerId);

  // 3. Fetch pets for customer
  const petData = await moegoClient.listPets(1, 100);
  const customerPets = (petData.pets || []).filter(p => p.customerId === customerId);

  // 4. STEP 1: Sync Contact (Rule 5: Order matters)
  const contactProps = mapCustomerToContact(customer, customerPets, appointments);
  const contactRes = await hubspotClient.upsertContact(customerId, contactProps);
  const hubspotContactId = contactRes.id;
  logger.info(`Contact ${customer.firstName} ${customer.lastName} (${customerId}) -> HubSpot Contact ID: ${hubspotContactId} [${contactRes.action}]`);

  // 5. STEP 2: Sync Pets (Company Object) and Associate to Contact
  const petHubspotMap = {};
  const petSyncResults = [];

  for (const pet of customerPets) {
    const petProps = mapPetToCompany(pet);
    const petRes = await hubspotClient.upsertPet(pet.id, petProps);
    const hubspotCompanyId = petRes.id;
    petHubspotMap[pet.id] = hubspotCompanyId;

    // Associate Pet -> Contact
    await hubspotClient.associatePetToContact(hubspotCompanyId, hubspotContactId);
    petSyncResults.push({ petId: pet.id, name: pet.name, hubspotId: hubspotCompanyId, action: petRes.action });
    logger.info(`Pet ${pet.name} (${pet.id}) -> HubSpot Company/Pet ID: ${hubspotCompanyId} [${petRes.action}]`);
  }

  // 6. STEP 3: Sync Appointments (Deals) and Dual Associate
  const dealSyncResults = [];
  const staffMap = await moegoClient.getStaffMap();

  for (const appt of appointments) {
    const psd = appt.petServiceDetails || [];
    const staffIds = psd[0]?.serviceDetails?.[0]?.staffIds || [];
    const groomerName = staffIds.length > 0 ? (staffMap[staffIds[0]] || 'Staff Posh Paws') : '';
    const petMoegoId = psd[0]?.pet?.id;

    const dealProps = mapAppointmentToDeal(appt, groomerName);
    const dealRes = await hubspotClient.upsertDeal(appt.id, dealProps);
    const hubspotDealId = dealRes.id;

    // Dual Associations
    await hubspotClient.associateDealToContact(hubspotDealId, hubspotContactId);
    if (petMoegoId && petHubspotMap[petMoegoId]) {
      await hubspotClient.associateDealToPet(hubspotDealId, petHubspotMap[petMoegoId]);
    }

    dealSyncResults.push({ appointmentId: appt.id, hubspotId: hubspotDealId, action: dealRes.action });
    logger.info(`Appointment ${dealProps.dealname} (${appt.id}) -> HubSpot Deal ID: ${hubspotDealId} [${dealRes.action}]`);
  }

  return {
    contact: { id: hubspotContactId, action: contactRes.action, customerId },
    pets: petSyncResults,
    deals: dealSyncResults
  };
}

/**
 * Helper to find the latest page number in MoeGo lists
 */
async function findLatestPage(listFn, estimatedPage = 170) {
  let low = 1;
  let high = estimatedPage;
  // Quickly check estimated page
  try {
    const data = await listFn(high, 100);
    if (data && data.nextPageToken) {
      high += 50;
    }
  } catch {
    high = Math.max(1, high - 20);
  }
  return high;
}

/**
 * Lightweight 5-Minute Delta Reconciliation Pass
 * Scans both recent (latest pages) and first pages for modifications
 */
async function runDeltaReconcile() {
  logger.info('Running 5-minute lightweight Delta Reconciliation...');
  const startTime = Date.now();
  const modifiedCustomerIds = new Set();

  try {
    // 1. Scan latest appointment pages (pages 1 to 5 and last known pages)
    for (let p = 1; p <= 5; p++) {
      const aptData = await moegoClient.listAppointments(p, 100);
      for (const a of aptData.appointments || []) {
        if (a.customerId) modifiedCustomerIds.add(a.customerId);
      }
    }

    // 2. Scan latest customer pages where new customers are appended (e.g. 170..178 and page 1)
    for (let p = 170; p <= 178; p++) {
      try {
        const custData = await moegoClient.listCustomers(p, 100);
        for (const c of custData.customers || []) {
          if (c.id) modifiedCustomerIds.add(c.id);
        }
      } catch {}
    }

    logger.info(`Delta sync identified ${modifiedCustomerIds.size} active/recent customer trees to reconcile.`);

    let syncedCount = 0;
    for (const custId of modifiedCustomerIds) {
      try {
        await syncCustomerBundle(custId);
        syncedCount++;
      } catch (err) {
        logger.error(`Delta sync error on customer ${custId}: %s`, err.message);
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const nowIso = new Date().toISOString();
    setSyncCursor('last_reconcile_timestamp', nowIso);
    logger.info(`Delta sync completed: Reconciled ${syncedCount}/${modifiedCustomerIds.size} customer trees in ${elapsed}s.`);

    return {
      status: 'SUCCESS',
      reconciled: syncedCount,
      durationSeconds: elapsed
    };
  } catch (err) {
    logger.error('Delta reconciliation error: %s', err.message);
    throw err;
  }
}

/**
 * Memory-Optimized Full Historical Backfill
 */
async function runFullBackfill(progressCallback = null) {
  logger.info('====================================================');
  logger.info('   STARTING FULL HISTORICAL BACKFILL (MoeGo -> HubSpot)');
  logger.info('====================================================');

  const startTime = new Date();
  let totalCustomersProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  try {
    // Prime staff cache
    await moegoClient.getStaffMap(true);

    // 1. Fetch appointments across all pages and store lean summary objects
    logger.info('Step 1/3: Fetching all appointments across all pages (lean index)...');
    const allAppointmentsByCustomer = {};
    let apptPage = 1;
    let totalAppts = 0;

    while (true) {
      const apptData = await moegoClient.listAppointments(apptPage, 100);
      const apts = apptData.appointments || [];
      if (!apts.length) break;

      totalAppts += apts.length;
      for (const a of apts) {
        if (a.customerId) {
          if (!allAppointmentsByCustomer[a.customerId]) {
            allAppointmentsByCustomer[a.customerId] = [];
          }
          allAppointmentsByCustomer[a.customerId].push({
            id: a.id,
            customerId: a.customerId,
            businessId: a.businessId,
            status: a.status,
            noShow: a.noShow,
            totalAmount: a.totalAmount,
            duration: a.duration,
            petServiceDetails: a.petServiceDetails
          });
        }
      }

      if (!apptData.nextPageToken || apptData.nextPageToken === '') break;
      apptPage++;
      if (apptPage > 180) break;
    }
    logger.info(`Loaded ${totalAppts} appointments across ${apptPage} pages for ${Object.keys(allAppointmentsByCustomer).length} customers.`);

    // 2. Fetch pets across all pages (lean index)
    logger.info('Step 2/3: Fetching all pets across all pages (lean index)...');
    const allPetsByCustomer = {};
    let petPage = 1;
    let totalPets = 0;

    while (true) {
      const petData = await moegoClient.listPets(petPage, 100);
      const pets = petData.pets || [];
      if (!pets.length) break;

      totalPets += pets.length;
      for (const p of pets) {
        if (p.customerId) {
          if (!allPetsByCustomer[p.customerId]) {
            allPetsByCustomer[p.customerId] = [];
          }
          allPetsByCustomer[p.customerId].push({
            id: p.id,
            name: p.name,
            type: p.type,
            breed: p.breed,
            weight: p.weight,
            fixed: p.fixed,
            birthday: p.birthday,
            coat: p.coat,
            notes: p.notes,
            status: p.status,
            deleted: p.deleted
          });
        }
      }

      if (!petData.nextPageToken || petData.nextPageToken === '') break;
      petPage++;
      if (petPage > 180) break;
    }
    logger.info(`Loaded ${totalPets} pets across ${petPage} pages.`);

    // 3. Process all customers page by page
    logger.info('Step 3/3: Syncing customers, pets, and appointments...');
    let custPage = 1;

    while (true) {
      const custData = await moegoClient.listCustomers(custPage, 100);
      const customers = custData.customers || [];
      if (!customers.length) break;

      for (const customer of customers) {
        const custId = customer.id;
        try {
          const custPets = allPetsByCustomer[custId] || [];
          const custAppts = allAppointmentsByCustomer[custId] || [];

          // 1. Sync Contact
          const contactProps = mapCustomerToContact(customer, custPets, custAppts);
          const cRes = await hubspotClient.upsertContact(custId, contactProps);
          const contactId = cRes.id;
          if (cRes.action === 'CREATED') totalCreated++;
          else totalUpdated++;

          // 2. Sync Pets & Associate
          const petHubspotMap = {};
          for (const pet of custPets) {
            const petProps = mapPetToCompany(pet);
            const pRes = await hubspotClient.upsertPet(pet.id, petProps);
            petHubspotMap[pet.id] = pRes.id;
            await hubspotClient.associatePetToContact(pRes.id, contactId);
          }

          // 3. Sync Appointments & Dual Associate
          const staffMap = await moegoClient.getStaffMap();
          for (const a of custAppts) {
            const psd = a.petServiceDetails || [];
            const staffIds = psd[0]?.serviceDetails?.[0]?.staffIds || [];
            const groomerName = staffIds.length > 0 ? (staffMap[staffIds[0]] || 'Staff Posh Paws') : '';
            const petMoegoId = psd[0]?.pet?.id;

            const dealProps = mapAppointmentToDeal(a, groomerName);
            const dRes = await hubspotClient.upsertDeal(a.id, dealProps);
            await hubspotClient.associateDealToContact(dRes.id, contactId);
            if (petMoegoId && petHubspotMap[petMoegoId]) {
              await hubspotClient.associateDealToPet(dRes.id, petHubspotMap[petMoegoId]);
            }
          }

          totalCustomersProcessed++;
          if (totalCustomersProcessed % 50 === 0) {
            logger.info(`Progress: Synced ${totalCustomersProcessed} customer trees...`);
          }
        } catch (err) {
          totalErrors++;
          logger.error(`Error syncing customer ${custId}: %s`, err.message);
        }
      }

      if (!custData.nextPageToken || custData.nextPageToken === '') break;
      custPage++;
      if (custPage > 180) break;
    }

    const nowIso = new Date().toISOString();
    setSyncCursor('last_backfill_completed_at', nowIso);
    setSyncCursor('last_reconcile_timestamp', nowIso);

    logSyncRun('FULL_BACKFILL', 'SUCCESS', {
      processed: totalCustomersProcessed,
      created: totalCreated,
      updated: totalUpdated,
      errors: totalErrors
    }, `Completed full backfill in ${Math.round((Date.now() - startTime.getTime()) / 1000)}s`);

    logger.info('====================================================');
    logger.info(`FULL BACKFILL COMPLETE: Processed=${totalCustomersProcessed}, Created=${totalCreated}, Updated=${totalUpdated}, Errors=${totalErrors}`);
    logger.info('====================================================');

    return {
      status: 'SUCCESS',
      processed: totalCustomersProcessed,
      created: totalCreated,
      updated: totalUpdated,
      errors: totalErrors,
      durationSeconds: Math.round((Date.now() - startTime.getTime()) / 1000)
    };
  } catch (err) {
    logger.error('Full backfill failed: %s', err.stack || err.message);
    logSyncRun('FULL_BACKFILL', 'FAILED', { processed: totalCustomersProcessed, errors: totalErrors + 1 }, err.message);
    throw err;
  }
}

module.exports = {
  syncCustomerBundle,
  runDeltaReconcile,
  runFullBackfill
};
