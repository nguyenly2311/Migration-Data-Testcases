const xlsx = require('xlsx');
const axios = require('axios');

// ==== Configuration for Token and API ====
const BEARER_TOKEN = 'eyJraWQiOiJtWlwvXC9GV0NwR0VacEd2ZEtkUWYzWTRpbExzcXY5N2lcL1ZpbkRNc1M2c1wvMD0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI0M2Q0ODhkMi03MDUxLTcwYzQtOTdkYi0wN2M1Y2E3MWFjMmUiLCJkZXZpY2Vfa2V5IjoiZXUtY2VudHJhbC0xXzk4ODkyOTcwLTAxYTAtNDhhMy05NGM4LWRiNTViODk2OGE0ZCIsImNvZ25pdG86Z3JvdXBzIjpbIm1pZ3JhdGlvbi1zdGFnaW5nIl0sImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC5ldS1jZW50cmFsLTEuYW1hem9uYXdzLmNvbVwvZXUtY2VudHJhbC0xXzVQZXFHcktlZSIsImNsaWVudF9pZCI6IjE1OXZndGptbXAyZjFqdjY5OTZidWp1ZzMxIiwib3JpZ2luX2p0aSI6IjI1MjIzMDEyLTlkYmUtNGU2Yi05MzE1LTY4ZWJlNWU5OGE0MiIsImV2ZW50X2lkIjoiNjQ3M2MwZmUtOTBiZi00YTcyLTg1MzMtMjQwNDZjNTZiOGZlIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTc0NTIyNjc5NywiZXhwIjoxNzQ1MzEzMTk2LCJpYXQiOjE3NDUyMjY3OTcsImp0aSI6ImQ4OTQ4ZGIxLWU1MzItNDA5Yy04ZGY1LTlkYWI1NzY5MmY5MiIsInVzZXJuYW1lIjoiYmlsbHkubHlAbWlncmF0aW9uLXN0YWdpbmcifQ.iBODOmYB3czFLQbvlE0nyfEunrQU-XJ6kyApBRT7eH-uCvcS3Lsp8pN5wid_PbdhB08gg_KnllNwgkGuk9Jk1Hp_aY9dDNbT7dWv_MH1UKcZQSUF9-MeCj3n0jAkW9Xwkoa_NwIuLpKZBfTEcIOiSsICVAA5kNCgSOqTMlY0fFzgNyNWnvpV2mYD3qEtTHlVQhd1LfDMhgva_TFEAButQawKalC0RN466n_nL_Mxb1FjbFm2p-sHJTH0vPH0GbLRgB7uet4u5JIr_PtTqxlI8P4VBtTVyNKlPAxF-T28IjBfs6uhhhIIITKTHnV-QrXSpjs8_oz9v_PBP-FygzY5ug'; // Replace with your actual token
const API_URL = 'https://api.staging.contemisaasdev.com/users/api/v1/organizations';

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