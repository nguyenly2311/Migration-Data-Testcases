const xlsx = require('xlsx');
const axios = require('axios');

// ==== Configuration for Token and API ====
const BEARER_TOKEN = 'BEARER_TOKEN';
const API_URL = 'API_URL';

// ==== Read Excel File ====
const workbook = xlsx.readFile('./Organizations.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const excelData = xlsx.utils.sheet_to_json(sheet);

// ==== Normalize the PhoneNumber Format ====
const normalizePhone = (phone) => phone.replace(/\D/g, '');

// ==== Fetch API Data ====
const fetchApiData = async () => {
  let apiData = [];
  let page = 1;
  let hasMoreData = true;

  while (hasMoreData) {
    const response = await axios.get(`${API_URL}?page[size]=100&page[number]=${page}`, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
    });
    apiData = apiData.concat(response.data.data);
    hasMoreData = response.data.meta && response.data.meta.hasNextPage;
    page++;
  }

  return apiData;
};

// ==== Synchronize and Compare ====
(async () => {
  try {
    console.log('🔄 Fetching data from API...');
    const apiData = await fetchApiData();
    console.log(`✅ Successfully fetched ${apiData.length} records from API.`);

    const fieldMap = {
      Name: 'name',
      OrganizationNumber: 'organizationNumber',
      PhoneNumber: 'phoneNumber',
      Email: 'email',
      Address: 'address',
      City: 'city',
      Country: 'country',
      Postcode: 'postcode',
      Industry: 'industry',
    };

    excelData.forEach((org) => {
      const matched = apiData.find(
        (apiOrg) =>
          (apiOrg.attributes.name || '').trim().toLowerCase() ===
          (org.Name || '').trim().toLowerCase()
      );

      if (!matched) {
        console.log(`❌ Organization not found in API: ${org.Name}`);
        return;
      }

      console.log(`✅ Organization found: ${matched.attributes.name}`);

      Object.keys(fieldMap).forEach((field) => {
        let excelVal = (org[field] || '').toString().trim();
        let apiVal = (matched.attributes[fieldMap[field]] || '').toString().trim();

        // Normalize phone numbers
        if (field === 'PhoneNumber') {
          excelVal = normalizePhone(excelVal);
          apiVal = normalizePhone(apiVal);
        }

        // Compare values
        if (excelVal === apiVal) {
          console.log(`✅ ${field} matches`);
        } else {
          console.log(`❌ ${field} mismatch: Excel="${excelVal}" | API="${apiVal}"`);
        }
      });

      console.log('-------------------');
    });
  } catch (error) {
    console.error('❌ An error occurred:', error.message);
  } finally {
    console.log('✅ Comparison process completed.');
  }
})();
