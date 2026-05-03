// Comprehensive Geography Data for EduKar Admin Panel

export const countries = ["Pakistan"];

const stateData = {
  "Pakistan": ["Sindh", "Punjab", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan", "Azad Kashmir", "Islamabad Capital Territory"],
  "China": ["Beijing", "Shanghai", "Guangdong", "Sichuan", "Zhejiang", "Jiangsu"],
  "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
  "United States": ["California", "New York", "Texas", "Florida", "Illinois", "Massachusetts"],
  "Turkey": ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya"],
  "Germany": ["Bavaria", "Berlin", "Hamburg", "Hesse", "Saxony"],
  "Australia": ["New South Wales", "Victoria", "Queensland", "Western Australia"],
  "Saudi Arabia": ["Riyadh", "Makkah", "Madinah", "Eastern Province"],
  "Malaysia": ["Kuala Lumpur", "Selangor", "Penang", "Johor"]
};

const cityData = {
  "Sindh": ["Karachi", "Hyderabad", "Sukkur", "Larkana", "Mirpur Khas", "Nawabshah", "Jamshoro", "Khairpur"],
  "Punjab": ["Lahore", "Faisalabad", "Rawalpindi", "Multan", "Gujranwala", "Sialkot", "Bahawalpur", "Sargodha"],
  "Khyber Pakhtunkhwa": ["Peshawar", "Mardan", "Abbottabad", "Swat", "Kohat", "Dera Ismail Khan"],
  "Balochistan": ["Quetta", "Gwadar", "Turbat", "Khuzdar", "Sibi"],
  "Islamabad Capital Territory": ["Islamabad"],
  "England": ["London", "Manchester", "Birmingham", "Oxford", "Cambridge"],
  "Scotland": ["Edinburgh", "Glasgow", "Aberdeen"],
  "California": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Stanford", "Berkeley"],
  "New York": ["New York City", "Buffalo", "Rochester", "Ithaca"],
  "Massachusetts": ["Boston", "Cambridge", "Worcester"],
  "Beijing": ["Beijing City"],
  "Shanghai": ["Shanghai City"],
  "Istanbul": ["Istanbul City"],
  "Berlin": ["Berlin City"],
  "Bavaria": ["Munich", "Nuremberg"],
  "New South Wales": ["Sydney", "Newcastle"],
  "Victoria": ["Melbourne"],
  "Riyadh": ["Riyadh City"],
  "Makkah": ["Jeddah", "Makkah City"],
  "Kuala Lumpur": ["Kuala Lumpur City"],
  "Selangor": ["Shah Alam", "Petaling Jaya"]
};

const currencyData = {
  "Pakistan": "PKR",
  "China": "CNY",
  "United Kingdom": "GBP",
  "United States": "USD",
  "Turkey": "TRY",
  "Australia": "AUD",
  "Germany": "EUR",
  "Canada": "CAD",
  "Saudi Arabia": "SAR",
  "United Arab Emirates": "AED",
  "Malaysia": "MYR"
};

export const getStates = (country) => {
  if (!country) return [];
  return stateData[country] || [];
};

export const getCities = (country, state) => {
  if (!state) return [];
  return cityData[state] || [];
};

export const getCurrency = (country) => {
  if (!country) return "";
  return currencyData[country] || "PKR";
};
