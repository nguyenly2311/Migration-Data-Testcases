const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const pLimit = require('p-limit');

// Config
const CONFIG = {
  CUSTOMERS_CSV: './customers_addresses.csv',
  MAPPING_CSV: './customerID.csv',
  API_TEMPLATE: 'API_URL',
  BEARER_TOKEN: 'BEARER_TOKEN',
  MAX_CONCURRENT_REQUESTS: 10,
};

// Utils
const readCsv = (path) =>
  new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });

const fetchCustomerInfo = async (id) => {
  const url = CONFIG.API_TEMPLATE.replace('{customerId}', id);
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${CONFIG.BEARER_TOKEN}` }
    });
    return res.data?.Data || null;
  } catch (err) {
    throw new Error(`Fetch failed for ID ${id}: ${err.response?.data?.message || err.message}`);
  }
};

const normalize = (value, field) => {
  if (!value) return '';
  return field === 'SSN' ? value.replace(/\s+/g, '') : value.toString().trim();
};

const compareCustomFields = (csvStr, apiFields) => {
  const csvFields = JSON.parse(csvStr || '{}');
  const mismatches = Object.keys(csvFields).filter((key) => csvFields[key] !== apiFields[key]);
  if (mismatches.length === 0) return { match: true };
  return {
    match: false,
    details: mismatches.map(k => `Key: ${k}, CSV="${csvFields[k]}", API="${apiFields[k]}"`).join('; ')
  };
};

const compareFields = (csvData, apiData, fields) => {
  for (const [apiField, csvField] of Object.entries(fields)) {
    const csvVal = normalize(csvData[csvField], apiField);
    const apiVal = apiData[apiField];

    if (apiField === 'Addresses' && Array.isArray(apiVal)) {
      const out = apiVal.map(a => `${a.Address || ''}, ${a.City || ''}, ${a.Province || ''}, ${a.PostCode || ''}`).join('; ');
      console.log(`✅ Addresses: ${out}`);
    } else if (apiField === 'Emails' && Array.isArray(apiVal)) {
      console.log(`✅ Emails: ${apiVal.map(e => e.Address).join(', ')}`);
    } else if (apiField === 'Phones' && Array.isArray(apiVal)) {
      console.log(`✅ Phones: ${apiVal.map(p => p.Number).join(', ')}`);
    } else if (apiField === 'CustomFields') {
      const result = compareCustomFields(csvVal, apiVal || {});
      result.match
        ? console.log(`✅ CustomFields match`)
        : console.log(`❌ CustomFields mismatch: ${result.details}`);
    } else if (typeof apiVal === 'string' || typeof apiVal === 'number') {
      csvVal === apiVal.toString().trim()
        ? console.log(`✅ ${apiField} match: ${apiVal}`)
        : console.log(`❌ ${apiField} mismatch: CSV="${csvVal}", API="${apiVal}"`);
    } else {
      console.warn(`⚠️ ${apiField} missing or unhandled type`);
    }
  }
};

// Mapping
const FIELDS_TO_COMPARE = {
  FullName: 'fullName',
  SSN: 'ssn',
  Addresses: 'addresses',
  Emails: 'emails',
  Phones: 'phones',
  CustomFields: 'customFields'
};

// Main
(async () => {
  try {
    console.log('🔄 Reading CSV files...');
    const [customers, mappings] = await Promise.all([
      readCsv(CONFIG.CUSTOMERS_CSV),
      readCsv(CONFIG.MAPPING_CSV)
    ]);

    const idMap = mappings.reduce((map, row) => {
      if (row.Identity_OriginalId && row.Identity_NewId) {
        map[row.Identity_OriginalId] = row.Identity_NewId;
      }
      return map;
    }, {});

    const matched = customers.filter(c => idMap[c.OriginalEntityId]);
    const unmatched = customers.filter(c => !idMap[c.OriginalEntityId]);

    console.log(`📦 Total customers: ${customers.length}`);
    console.log(`✅ Mapped: ${matched.length}`);
    if (unmatched.length > 0) {
      console.error(`❌ Unmapped OriginalEntityId(s):`, unmatched.map(c => c.OriginalEntityId));
      return process.exit(1);
    }

    console.log('🚀 Fetching customer info in parallel...');
    const limit = pLimit(CONFIG.MAX_CONCURRENT_REQUESTS);
    const fetchPromises = matched.map(c =>
      limit(() =>
        fetchCustomerInfo(idMap[c.OriginalEntityId])
          .then(data => ({ success: true, data, customer: c, newId: idMap[c.OriginalEntityId] }))
          .catch(err => ({ success: false, error: err.message, newId: idMap[c.OriginalEntityId] }))
      )
    );

    const results = await Promise.all(fetchPromises);
    let successCount = 0;
    const failedList = [];

    for (const result of results) {
      const { success, data, customer, newId, error } = result;
      if (success && data) {
        successCount++;
        console.log(`\n📄 Customer: ${newId}`);
        compareFields(customer, data, FIELDS_TO_COMPARE);
        console.log('-------------------------');
      } else {
        failedList.push({ newId, error });
      }
    }

    console.log(`\n✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failedList.length}`);
    if (failedList.length > 0) {
      console.log('🔎 Failed IDs and reasons:');
      failedList.forEach(f => console.log(`- ${f.newId}: ${f.error}`));
    }

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err.message);
    process.exit(1);
  }
})();
