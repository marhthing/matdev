/**
 * MATDEV Time Plugin
 * Consolidated time functionality with subcommands
 */

const config = require('../config');
const moment = require('moment-timezone');

class TimePlugin {
    constructor() {
        this.name = 'time';
        this.description = 'Time and timezone commands';
        this.version = '1.0.0';

        // Country code to timezone mapping
        this.countryTimezones = {
            // Major Countries
            'US': 'America/New_York',
            'USA': 'America/New_York',
            'UK': 'Europe/London',
            'GB': 'Europe/London',
            'IN': 'Asia/Kolkata',
            'INDIA': 'Asia/Kolkata',
            'JP': 'Asia/Tokyo',
            'JAPAN': 'Asia/Tokyo',
            'CN': 'Asia/Shanghai',
            'CHINA': 'Asia/Shanghai',
            'RU': 'Europe/Moscow',
            'RUSSIA': 'Europe/Moscow',
            'DE': 'Europe/Berlin',
            'GERMANY': 'Europe/Berlin',
            'FR': 'Europe/Paris',
            'FRANCE': 'Europe/Paris',
            'CA': 'America/Toronto',
            'CANADA': 'America/Toronto',
            'AU': 'Australia/Sydney',
            'AUSTRALIA': 'Australia/Sydney',
            'BR': 'America/Sao_Paulo',
            'BRAZIL': 'America/Sao_Paulo',

            // African Countries
            'NG': 'Africa/Lagos',
            'NIGERIA': 'Africa/Lagos',
            'EG': 'Africa/Cairo',
            'EGYPT': 'Africa/Cairo',
            'ZA': 'Africa/Johannesburg',
            'SOUTH_AFRICA': 'Africa/Johannesburg',
            'KE': 'Africa/Nairobi',
            'KENYA': 'Africa/Nairobi',
            'GH': 'Africa/Accra',
            'GHANA': 'Africa/Accra',
            'MA': 'Africa/Casablanca',
            'MOROCCO': 'Africa/Casablanca',
            'MU': 'Indian/Mauritius',
            'MAURITIUS': 'Indian/Mauritius',
            'ET': 'Africa/Addis_Ababa',
            'ETHIOPIA': 'Africa/Addis_Ababa',
            'TZ': 'Africa/Dar_es_Salaam',
            'TANZANIA': 'Africa/Dar_es_Salaam',
            'UG': 'Africa/Kampala',
            'UGANDA': 'Africa/Kampala',
            'RW': 'Africa/Kigali',
            'RWANDA': 'Africa/Kigali',
            'DZ': 'Africa/Algiers',
            'ALGERIA': 'Africa/Algiers',
            'TN': 'Africa/Tunis',
            'TUNISIA': 'Africa/Tunis',
            'LY': 'Africa/Tripoli',
            'LIBYA': 'Africa/Tripoli',
            'SD': 'Africa/Khartoum',
            'SUDAN': 'Africa/Khartoum',
            'SN': 'Africa/Dakar',
            'SENEGAL': 'Africa/Dakar',
            'CI': 'Africa/Abidjan',
            'IVORY_COAST': 'Africa/Abidjan',
            'BF': 'Africa/Ouagadougou',
            'BURKINA_FASO': 'Africa/Ouagadougou',
            'ML': 'Africa/Bamako',
            'MALI': 'Africa/Bamako',
            'NE': 'Africa/Niamey',
            'NIGER': 'Africa/Niamey',
            'TD': 'Africa/Ndjamena',
            'CHAD': 'Africa/Ndjamena',
            'CM': 'Africa/Douala',
            'CAMEROON': 'Africa/Douala',
            'GA': 'Africa/Libreville',
            'GABON': 'Africa/Libreville',
            'CG': 'Africa/Brazzaville',
            'CONGO': 'Africa/Brazzaville',
            'CD': 'Africa/Kinshasa',
            'DRC': 'Africa/Kinshasa',
            'AO': 'Africa/Luanda',
            'ANGOLA': 'Africa/Luanda',
            'ZM': 'Africa/Lusaka',
            'ZAMBIA': 'Africa/Lusaka',
            'ZW': 'Africa/Harare',
            'ZIMBABWE': 'Africa/Harare',
            'BW': 'Africa/Gaborone',
            'BOTSWANA': 'Africa/Gaborone',
            'NA': 'Africa/Windhoek',
            'NAMIBIA': 'Africa/Windhoek',
            'MZ': 'Africa/Maputo',
            'MOZAMBIQUE': 'Africa/Maputo',
            'MW': 'Africa/Blantyre',
            'MALAWI': 'Africa/Blantyre',
            'MG': 'Indian/Antananarivo',
            'MADAGASCAR': 'Indian/Antananarivo',

            // Middle Eastern Countries
            'SA': 'Asia/Riyadh',
            'SAUDI': 'Asia/Riyadh',
            'UAE': 'Asia/Dubai',
            'DUBAI': 'Asia/Dubai',
            'TR': 'Europe/Istanbul',
            'TURKEY': 'Europe/Istanbul',
            'IL': 'Asia/Jerusalem',
            'ISRAEL': 'Asia/Jerusalem',
            'IR': 'Asia/Tehran',
            'IRAN': 'Asia/Tehran',
            'IQ': 'Asia/Baghdad',
            'IRAQ': 'Asia/Baghdad',
            'SY': 'Asia/Damascus',
            'SYRIA': 'Asia/Damascus',
            'LB': 'Asia/Beirut',
            'LEBANON': 'Asia/Beirut',
            'JO': 'Asia/Amman',
            'JORDAN': 'Asia/Amman',
            'KW': 'Asia/Kuwait',
            'KUWAIT': 'Asia/Kuwait',
            'BH': 'Asia/Bahrain',
            'BAHRAIN': 'Asia/Bahrain',
            'QA': 'Asia/Qatar',
            'QATAR': 'Asia/Qatar',
            'OM': 'Asia/Muscat',
            'OMAN': 'Asia/Muscat',
            'YE': 'Asia/Aden',
            'YEMEN': 'Asia/Aden',
            'AF': 'Asia/Kabul',
            'AFGHANISTAN': 'Asia/Kabul',

            // Asian Countries
            'KR': 'Asia/Seoul',
            'KOREA': 'Asia/Seoul',
            'ID': 'Asia/Jakarta',
            'INDONESIA': 'Asia/Jakarta',
            'TH': 'Asia/Bangkok',
            'THAILAND': 'Asia/Bangkok',
            'SG': 'Asia/Singapore',
            'SINGAPORE': 'Asia/Singapore',
            'MY': 'Asia/Kuala_Lumpur',
            'MALAYSIA': 'Asia/Kuala_Lumpur',
            'PH': 'Asia/Manila',
            'PHILIPPINES': 'Asia/Manila',
            'VN': 'Asia/Ho_Chi_Minh',
            'VIETNAM': 'Asia/Ho_Chi_Minh',
            'MM': 'Asia/Yangon',
            'MYANMAR': 'Asia/Yangon',
            'LA': 'Asia/Vientiane',
            'LAOS': 'Asia/Vientiane',
            'KH': 'Asia/Phnom_Penh',
            'CAMBODIA': 'Asia/Phnom_Penh',
            'BD': 'Asia/Dhaka',
            'BANGLADESH': 'Asia/Dhaka',
            'PK': 'Asia/Karachi',
            'PAKISTAN': 'Asia/Karachi',
            'LK': 'Asia/Colombo',
            'SRI_LANKA': 'Asia/Colombo',
            'NP': 'Asia/Kathmandu',
            'NEPAL': 'Asia/Kathmandu',
            'BT': 'Asia/Thimphu',
            'BHUTAN': 'Asia/Thimphu',
            'MV': 'Indian/Maldives',
            'MALDIVES': 'Indian/Maldives',
            'MN': 'Asia/Ulaanbaatar',
            'MONGOLIA': 'Asia/Ulaanbaatar',
            'KZ': 'Asia/Almaty',
            'KAZAKHSTAN': 'Asia/Almaty',
            'UZ': 'Asia/Tashkent',
            'UZBEKISTAN': 'Asia/Tashkent',
            'KG': 'Asia/Bishkek',
            'KYRGYZSTAN': 'Asia/Bishkek',
            'TJ': 'Asia/Dushanbe',
            'TAJIKISTAN': 'Asia/Dushanbe',
            'TM': 'Asia/Ashgabat',
            'TURKMENISTAN': 'Asia/Ashgabat',
            'AZ': 'Asia/Baku',
            'AZERBAIJAN': 'Asia/Baku',
            'AM': 'Asia/Yerevan',
            'ARMENIA': 'Asia/Yerevan',
            'GE': 'Asia/Tbilisi',
            'GEORGIA': 'Asia/Tbilisi',

            // European Countries
            'IT': 'Europe/Rome',
            'ITALY': 'Europe/Rome',
            'ES': 'Europe/Madrid',
            'SPAIN': 'Europe/Madrid',
            'NL': 'Europe/Amsterdam',
            'NETHERLANDS': 'Europe/Amsterdam',
            'BE': 'Europe/Brussels',
            'BELGIUM': 'Europe/Brussels',
            'CH': 'Europe/Zurich',
            'SWITZERLAND': 'Europe/Zurich',
            'AT': 'Europe/Vienna',
            'AUSTRIA': 'Europe/Vienna',
            'SE': 'Europe/Stockholm',
            'SWEDEN': 'Europe/Stockholm',
            'NO': 'Europe/Oslo',
            'NORWAY': 'Europe/Oslo',
            'DK': 'Europe/Copenhagen',
            'DENMARK': 'Europe/Copenhagen',
            'PT': 'Europe/Lisbon',
            'PORTUGAL': 'Europe/Lisbon',
            'GR': 'Europe/Athens',
            'GREECE': 'Europe/Athens',
            'IE': 'Europe/Dublin',
            'IRELAND': 'Europe/Dublin',
            'PL': 'Europe/Warsaw',
            'POLAND': 'Europe/Warsaw',
            'FI': 'Europe/Helsinki',
            'FINLAND': 'Europe/Helsinki',
            'CZ': 'Europe/Prague',
            'CZECHIA': 'Europe/Prague',
            'SK': 'Europe/Bratislava',
            'SLOVAKIA': 'Europe/Bratislava',
            'HU': 'Europe/Budapest',
            'HUNGARY': 'Europe/Budapest',
            'RO': 'Europe/Bucharest',
            'ROMANIA': 'Europe/Bucharest',
            'BG': 'Europe/Sofia',
            'BULGARIA': 'Europe/Sofia',
            'HR': 'Europe/Zagreb',
            'CROATIA': 'Europe/Zagreb',
            'SI': 'Europe/Ljubljana',
            'SLOVENIA': 'Europe/Ljubljana',
            'BA': 'Europe/Sarajevo',
            'BOSNIA': 'Europe/Sarajevo',
            'RS': 'Europe/Belgrade',
            'SERBIA': 'Europe/Belgrade',
            'ME': 'Europe/Podgorica',
            'MONTENEGRO': 'Europe/Podgorica',
            'MK': 'Europe/Skopje',
            'MACEDONIA': 'Europe/Skopje',
            'AL': 'Europe/Tirane',
            'ALBANIA': 'Europe/Tirane',
            'XK': 'Europe/Belgrade',
            'KOSOVO': 'Europe/Belgrade',
            'MD': 'Europe/Chisinau',
            'MOLDOVA': 'Europe/Chisinau',
            'UA': 'Europe/Kiev',
            'UKRAINE': 'Europe/Kiev',
            'BY': 'Europe/Minsk',
            'BELARUS': 'Europe/Minsk',
            'LT': 'Europe/Vilnius',
            'LITHUANIA': 'Europe/Vilnius',
            'LV': 'Europe/Riga',
            'LATVIA': 'Europe/Riga',
            'EE': 'Europe/Tallinn',
            'ESTONIA': 'Europe/Tallinn',
            'IS': 'Atlantic/Reykjavik',
            'ICELAND': 'Atlantic/Reykjavik',
            'MT': 'Europe/Malta',
            'MALTA': 'Europe/Malta',
            'CY': 'Asia/Nicosia',
            'CYPRUS': 'Asia/Nicosia',
            'LU': 'Europe/Luxembourg',
            'LUXEMBOURG': 'Europe/Luxembourg',
            'MC': 'Europe/Monaco',
            'MONACO': 'Europe/Monaco',
            'AD': 'Europe/Andorra',
            'ANDORRA': 'Europe/Andorra',
            'SM': 'Europe/San_Marino',
            'SAN_MARINO': 'Europe/San_Marino',
            'VA': 'Europe/Vatican',
            'VATICAN': 'Europe/Vatican',
            'LI': 'Europe/Vaduz',
            'LIECHTENSTEIN': 'Europe/Vaduz',

            // American Countries
            'MX': 'America/Mexico_City',
            'MEXICO': 'America/Mexico_City',
            'AR': 'America/Argentina/Buenos_Aires',
            'ARGENTINA': 'America/Argentina/Buenos_Aires',
            'CL': 'America/Santiago',
            'CHILE': 'America/Santiago',
            'CO': 'America/Bogota',
            'COLOMBIA': 'America/Bogota',
            'PE': 'America/Lima',
            'PERU': 'America/Lima',
            'VE': 'America/Caracas',
            'VENEZUELA': 'America/Caracas',
            'EC': 'America/Guayaquil',
            'ECUADOR': 'America/Guayaquil',
            'BO': 'America/La_Paz',
            'BOLIVIA': 'America/La_Paz',
            'PY': 'America/Asuncion',
            'PARAGUAY': 'America/Asuncion',
            'UY': 'America/Montevideo',
            'URUGUAY': 'America/Montevideo',
            'GY': 'America/Guyana',
            'GUYANA': 'America/Guyana',
            'SR': 'America/Paramaribo',
            'SURINAME': 'America/Paramaribo',
            'GF': 'America/Cayenne',
            'FRENCH_GUIANA': 'America/Cayenne',
            'GT': 'America/Guatemala',
            'GUATEMALA': 'America/Guatemala',
            'BZ': 'America/Belize',
            'BELIZE': 'America/Belize',
            'SV': 'America/El_Salvador',
            'EL_SALVADOR': 'America/El_Salvador',
            'HN': 'America/Tegucigalpa',
            'HONDURAS': 'America/Tegucigalpa',
            'NI': 'America/Managua',
            'NICARAGUA': 'America/Managua',
            'CR': 'America/Costa_Rica',
            'COSTA_RICA': 'America/Costa_Rica',
            'PA': 'America/Panama',
            'PANAMA': 'America/Panama',
            'CU': 'America/Havana',
            'CUBA': 'America/Havana',
            'JM': 'America/Jamaica',
            'JAMAICA': 'America/Jamaica',
            'HT': 'America/Port-au-Prince',
            'HAITI': 'America/Port-au-Prince',
            'DO': 'America/Santo_Domingo',
            'DOMINICAN': 'America/Santo_Domingo',
            'PR': 'America/Puerto_Rico',
            'PUERTO_RICO': 'America/Puerto_Rico',
            'TT': 'America/Port_of_Spain',
            'TRINIDAD': 'America/Port_of_Spain',
            'BB': 'America/Barbados',
            'BARBADOS': 'America/Barbados',
            'LC': 'America/St_Lucia',
            'ST_LUCIA': 'America/St_Lucia',
            'GD': 'America/Grenada',
            'GRENADA': 'America/Grenada',
            'VC': 'America/St_Vincent',
            'ST_VINCENT': 'America/St_Vincent',
            'AG': 'America/Antigua',
            'ANTIGUA': 'America/Antigua',
            'DM': 'America/Dominica',
            'DOMINICA': 'America/Dominica',
            'KN': 'America/St_Kitts',
            'ST_KITTS': 'America/St_Kitts',
            'BS': 'America/Nassau',
            'BAHAMAS': 'America/Nassau',

            // Oceania
            'NZ': 'Pacific/Auckland',
            'NEW_ZEALAND': 'Pacific/Auckland',
            'FJ': 'Pacific/Fiji',
            'FIJI': 'Pacific/Fiji',
            'TO': 'Pacific/Tongatapu',
            'TONGA': 'Pacific/Tongatapu',
            'WS': 'Pacific/Apia',
            'SAMOA': 'Pacific/Apia',
            'VU': 'Pacific/Efate',
            'VANUATU': 'Pacific/Efate',
            'SB': 'Pacific/Guadalcanal',
            'SOLOMON': 'Pacific/Guadalcanal',
            'PG': 'Pacific/Port_Moresby',
            'PAPUA': 'Pacific/Port_Moresby',
            'NC': 'Pacific/Noumea',
            'NEW_CALEDONIA': 'Pacific/Noumea',
            'PF': 'Pacific/Tahiti',
            'TAHITI': 'Pacific/Tahiti',
            'CK': 'Pacific/Rarotonga',
            'COOK_ISLANDS': 'Pacific/Rarotonga',
            'NU': 'Pacific/Niue',
            'NIUE': 'Pacific/Niue',
            'TV': 'Pacific/Funafuti',
            'TUVALU': 'Pacific/Funafuti',
            'KI': 'Pacific/Tarawa',
            'KIRIBATI': 'Pacific/Tarawa',
            'NR': 'Pacific/Nauru',
            'NAURU': 'Pacific/Nauru',
            'MH': 'Pacific/Majuro',
            'MARSHALL': 'Pacific/Majuro',
            'FM': 'Pacific/Chuuk',
            'MICRONESIA': 'Pacific/Chuuk',
            'PW': 'Pacific/Palau',
            'PALAU': 'Pacific/Palau',
            'GU': 'Pacific/Guam',
            'GUAM': 'Pacific/Guam',
            'MP': 'Pacific/Saipan',
            'NORTHERN_MARIANA': 'Pacific/Saipan',

            // Additional Countries
            'LS': 'Africa/Maseru',
            'LESOTHO': 'Africa/Maseru',
            'SZ': 'Africa/Mbabane',
            'SWAZILAND': 'Africa/Mbabane',
            'GM': 'Africa/Banjul',
            'GAMBIA': 'Africa/Banjul',
            'GW': 'Africa/Bissau',
            'GUINEA_BISSAU': 'Africa/Bissau',
            'GN': 'Africa/Conakry',
            'GUINEA': 'Africa/Conakry',
            'SL': 'Africa/Freetown',
            'SIERRA_LEONE': 'Africa/Freetown',
            'LR': 'Africa/Monrovia',
            'LIBERIA': 'Africa/Monrovia',
            'CV': 'Atlantic/Cape_Verde',
            'CAPE_VERDE': 'Atlantic/Cape_Verde',
            'ST': 'Africa/Sao_Tome',
            'SAO_TOME': 'Africa/Sao_Tome',
            'GQ': 'Africa/Malabo',
            'EQUATORIAL_GUINEA': 'Africa/Malabo',
            'DJ': 'Africa/Djibouti',
            'DJIBOUTI': 'Africa/Djibouti',
            'ER': 'Africa/Asmara',
            'ERITREA': 'Africa/Asmara',
            'SO': 'Africa/Mogadishu',
            'SOMALIA': 'Africa/Mogadishu',
            'KM': 'Indian/Comoro',
            'COMOROS': 'Indian/Comoro',
            'SC': 'Indian/Mahe',
            'SEYCHELLES': 'Indian/Mahe',
            'RE': 'Indian/Reunion',
            'REUNION': 'Indian/Reunion',
            'YT': 'Indian/Mayotte',
            'MAYOTTE': 'Indian/Mayotte',
            'SH': 'Atlantic/St_Helena',
            'ST_HELENA': 'Atlantic/St_Helena',

            // Central Asian additions
            'MO': 'Asia/Macau',
            'MACAU': 'Asia/Macau',
            'HK': 'Asia/Hong_Kong',
            'HONG_KONG': 'Asia/Hong_Kong',
            'TW': 'Asia/Taipei',
            'TAIWAN': 'Asia/Taipei',
            'KP': 'Asia/Pyongyang',
            'NORTH_KOREA': 'Asia/Pyongyang',
            'BN': 'Asia/Brunei',
            'BRUNEI': 'Asia/Brunei',
            'TL': 'Asia/Dili',
            'EAST_TIMOR': 'Asia/Dili',

            // Caribbean additions
            'AI': 'America/Anguilla',
            'ANGUILLA': 'America/Anguilla',
            'AW': 'America/Aruba',
            'ARUBA': 'America/Aruba',
            'BQ': 'America/Kralendijk',
            'BONAIRE': 'America/Kralendijk',
            'CW': 'America/Curacao',
            'CURACAO': 'America/Curacao',
            'SX': 'America/Lower_Princes',
            'SINT_MAARTEN': 'America/Lower_Princes',
            'MF': 'America/Marigot',
            'SAINT_MARTIN': 'America/Marigot',
            'BL': 'America/St_Barthelemy',
            'ST_BARTHELEMY': 'America/St_Barthelemy',
            'GP': 'America/Guadeloupe',
            'GUADELOUPE': 'America/Guadeloupe',
            'MQ': 'America/Martinique',
            'MARTINIQUE': 'America/Martinique',
            'VI': 'America/St_Thomas',
            'US_VIRGIN_ISLANDS': 'America/St_Thomas',
            'VG': 'America/Tortola',
            'BRITISH_VIRGIN_ISLANDS': 'America/Tortola',
            'TC': 'America/Grand_Turk',
            'TURKS_CAICOS': 'America/Grand_Turk',
            'KY': 'America/Cayman',
            'CAYMAN_ISLANDS': 'America/Cayman',
            'MS': 'America/Montserrat',
            'MONTSERRAT': 'America/Montserrat',

            // Atlantic islands
            'FO': 'Atlantic/Faroe',
            'FAROE_ISLANDS': 'Atlantic/Faroe',
            'GL': 'America/Godthab',
            'GREENLAND': 'America/Godthab',
            'FK': 'Atlantic/Stanley',
            'FALKLAND_ISLANDS': 'Atlantic/Stanley',
            'GS': 'Atlantic/South_Georgia',
            'SOUTH_GEORGIA': 'Atlantic/South_Georgia',

            // Indian Ocean
            'IO': 'Indian/Chagos',
            'BRITISH_INDIAN_OCEAN': 'Indian/Chagos',
            'TF': 'Indian/Kerguelen',
            'FRENCH_SOUTHERN': 'Indian/Kerguelen',
            'HM': 'Indian/Kerguelen',
            'HEARD_MCDONALD': 'Indian/Kerguelen',
            'CC': 'Indian/Cocos',
            'COCOS_ISLANDS': 'Indian/Cocos',
            'CX': 'Indian/Christmas',
            'CHRISTMAS_ISLAND': 'Indian/Christmas',
            'NF': 'Pacific/Norfolk',
            'NORFOLK_ISLAND': 'Pacific/Norfolk'
        };

        // Alternative city names
        this.cityTimezones = {
            // European Cities
            'LONDON': 'Europe/London',
            'PARIS': 'Europe/Paris',
            'BERLIN': 'Europe/Berlin',
            'ROME': 'Europe/Rome',
            'MADRID': 'Europe/Madrid',
            'MOSCOW': 'Europe/Moscow',
            'LISBON': 'Europe/Lisbon',
            'ATHENS': 'Europe/Athens',
            'DUBLIN': 'Europe/Dublin',
            'WARSAW': 'Europe/Warsaw',
            'HELSINKI': 'Europe/Helsinki',
            'STOCKHOLM': 'Europe/Stockholm',
            'OSLO': 'Europe/Oslo',
            'COPENHAGEN': 'Europe/Copenhagen',
            'AMSTERDAM': 'Europe/Amsterdam',
            'BRUSSELS': 'Europe/Brussels',
            'ZURICH': 'Europe/Zurich',
            'VIENNA': 'Europe/Vienna',
            'PRAGUE': 'Europe/Prague',
            'BUDAPEST': 'Europe/Budapest',
            'BUCHAREST': 'Europe/Bucharest',
            'SOFIA': 'Europe/Sofia',
            'ZAGREB': 'Europe/Zagreb',
            'BELGRADE': 'Europe/Belgrade',
            'SARAJEVO': 'Europe/Sarajevo',
            'SKOPJE': 'Europe/Skopje',
            'TIRANA': 'Europe/Tirane',
            'VILNIUS': 'Europe/Vilnius',
            'RIGA': 'Europe/Riga',
            'TALLINN': 'Europe/Tallinn',
            'REYKJAVIK': 'Atlantic/Reykjavik',
            'KIEV': 'Europe/Kiev',
            'MINSK': 'Europe/Minsk',
            'CHISINAU': 'Europe/Chisinau',
            'ISTANBUL': 'Europe/Istanbul',

            // Asian Cities
            'TOKYO': 'Asia/Tokyo',
            'SEOUL': 'Asia/Seoul',
            'BEIJING': 'Asia/Shanghai',
            'SHANGHAI': 'Asia/Shanghai',
            'MUMBAI': 'Asia/Kolkata',
            'DELHI': 'Asia/Kolkata',
            'KOLKATA': 'Asia/Kolkata',
            'CHENNAI': 'Asia/Kolkata',
            'BANGALORE': 'Asia/Kolkata',
            'HYDERABAD': 'Asia/Kolkata',
            'DUBAI': 'Asia/Dubai',
            'ABU_DHABI': 'Asia/Dubai',
            'DOHA': 'Asia/Qatar',
            'RIYADH': 'Asia/Riyadh',
            'KUWAIT_CITY': 'Asia/Kuwait',
            'MANAMA': 'Asia/Bahrain',
            'MUSCAT': 'Asia/Muscat',
            'TEHRAN': 'Asia/Tehran',
            'BAGHDAD': 'Asia/Baghdad',
            'DAMASCUS': 'Asia/Damascus',
            'BEIRUT': 'Asia/Beirut',
            'AMMAN': 'Asia/Amman',
            'JERUSALEM': 'Asia/Jerusalem',
            'TEL_AVIV': 'Asia/Jerusalem',
            'KABUL': 'Asia/Kabul',
            'ISLAMABAD': 'Asia/Karachi',
            'KARACHI': 'Asia/Karachi',
            'LAHORE': 'Asia/Karachi',
            'DHAKA': 'Asia/Dhaka',
            'COLOMBO': 'Asia/Colombo',
            'KATHMANDU': 'Asia/Kathmandu',
            'THIMPHU': 'Asia/Thimphu',
            'BANGKOK': 'Asia/Bangkok',
            'HO_CHI_MINH': 'Asia/Ho_Chi_Minh',
            'HANOI': 'Asia/Ho_Chi_Minh',
            'SINGAPORE': 'Asia/Singapore',
            'KUALA_LUMPUR': 'Asia/Kuala_Lumpur',
            'JAKARTA': 'Asia/Jakarta',
            'MANILA': 'Asia/Manila',
            'YANGON': 'Asia/Yangon',
            'PHNOM_PENH': 'Asia/Phnom_Penh',
            'VIENTIANE': 'Asia/Vientiane',
            'ULAANBAATAR': 'Asia/Ulaanbaatar',
            'ALMATY': 'Asia/Almaty',
            'TASHKENT': 'Asia/Tashkent',
            'BISHKEK': 'Asia/Bishkek',
            'DUSHANBE': 'Asia/Dushanbe',
            'ASHGABAT': 'Asia/Ashgabat',
            'BAKU': 'Asia/Baku',
            'YEREVAN': 'Asia/Yerevan',
            'TBILISI': 'Asia/Tbilisi',

            // African Cities
            'LAGOS': 'Africa/Lagos',
            'ABUJA': 'Africa/Lagos',
            'KANO': 'Africa/Lagos',
            'CAIRO': 'Africa/Cairo',
            'ALEXANDRIA': 'Africa/Cairo',
            'JOHANNESBURG': 'Africa/Johannesburg',
            'CAPE_TOWN': 'Africa/Johannesburg',
            'DURBAN': 'Africa/Johannesburg',
            'NAIROBI': 'Africa/Nairobi',
            'MOMBASA': 'Africa/Nairobi',
            'ACCRA': 'Africa/Accra',
            'KUMASI': 'Africa/Accra',
            'CASABLANCA': 'Africa/Casablanca',
            'RABAT': 'Africa/Casablanca',
            'PORT_LOUIS': 'Indian/Mauritius',
            'ADDIS_ABABA': 'Africa/Addis_Ababa',
            'DAR_ES_SALAAM': 'Africa/Dar_es_Salaam',
            'KAMPALA': 'Africa/Kampala',
            'KIGALI': 'Africa/Kigali',
            'ALGIERS': 'Africa/Algiers',
            'TUNIS': 'Africa/Tunis',
            'TRIPOLI': 'Africa/Tripoli',
            'KHARTOUM': 'Africa/Khartoum',
            'DAKAR': 'Africa/Dakar',
            'ABIDJAN': 'Africa/Abidjan',
            'OUAGADOUGOU': 'Africa/Ouagadougou',
            'BAMAKO': 'Africa/Bamako',
            'NIAMEY': 'Africa/Niamey',
            'NDJAMENA': 'Africa/Ndjamena',
            'DOUALA': 'Africa/Douala',
            'YAOUNDE': 'Africa/Douala',
            'LIBREVILLE': 'Africa/Libreville',
            'BRAZZAVILLE': 'Africa/Brazzaville',
            'KINSHASA': 'Africa/Kinshasa',
            'LUANDA': 'Africa/Luanda',
            'LUSAKA': 'Africa/Lusaka',
            'HARARE': 'Africa/Harare',
            'GABORONE': 'Africa/Gaborone',
            'WINDHOEK': 'Africa/Windhoek',
            'MAPUTO': 'Africa/Maputo',
            'BLANTYRE': 'Africa/Blantyre',
            'ANTANANARIVO': 'Indian/Antananarivo',

            // American Cities
            'NEW_YORK': 'America/New_York',
            'LOS_ANGELES': 'America/Los_Angeles',
            'CHICAGO': 'America/Chicago',
            'HOUSTON': 'America/Chicago',
            'PHILADELPHIA': 'America/New_York',
            'PHOENIX': 'America/Phoenix',
            'SAN_ANTONIO': 'America/Chicago',
            'SAN_DIEGO': 'America/Los_Angeles',
            'DALLAS': 'America/Chicago',
            'SAN_JOSE': 'America/Los_Angeles',
            'AUSTIN': 'America/Chicago',
            'JACKSONVILLE': 'America/New_York',
            'SAN_FRANCISCO': 'America/Los_Angeles',
            'COLUMBUS': 'America/New_York',
            'CHARLOTTE': 'America/New_York',
            'FORT_WORTH': 'America/Chicago',
            'DETROIT': 'America/Detroit',
            'EL_PASO': 'America/Denver',
            'MEMPHIS': 'America/Chicago',
            'SEATTLE': 'America/Los_Angeles',
            'DENVER': 'America/Denver',
            'WASHINGTON': 'America/New_York',
            'BOSTON': 'America/New_York',
            'NASHVILLE': 'America/Chicago',
            'BALTIMORE': 'America/New_York',
            'OKLAHOMA_CITY': 'America/Chicago',
            'TORONTO': 'America/Toronto',
            'MONTREAL': 'America/Montreal',
            'VANCOUVER': 'America/Vancouver',
            'CALGARY': 'America/Edmonton',
            'OTTAWA': 'America/Toronto',
            'EDMONTON': 'America/Edmonton',
            'WINNIPEG': 'America/Winnipeg',
            'QUEBEC_CITY': 'America/Montreal',
            'HAMILTON': 'America/Toronto',
            'KITCHENER': 'America/Toronto',
            'SAO_PAULO': 'America/Sao_Paulo',
            'RIO_DE_JANEIRO': 'America/Sao_Paulo',
            'BRASILIA': 'America/Sao_Paulo',
            'SALVADOR': 'America/Bahia',
            'FORTALEZA': 'America/Fortaleza',
            'BELO_HORIZONTE': 'America/Sao_Paulo',
            'MANAUS': 'America/Manaus',
            'CURITIBA': 'America/Sao_Paulo',
            'RECIFE': 'America/Recife',
            'PORTO_ALEGRE': 'America/Sao_Paulo',
            'MEXICO_CITY': 'America/Mexico_City',
            'GUADALAJARA': 'America/Mexico_City',
            'MONTERREY': 'America/Monterrey',
            'PUEBLA': 'America/Mexico_City',
            'TIJUANA': 'America/Tijuana',
            'LEON': 'America/Mexico_City',
            'JUAREZ': 'America/Ojinaga',
            'TORREON': 'America/Mexico_City',
            'MERIDA': 'America/Merida',
            'BUENOS_AIRES': 'America/Argentina/Buenos_Aires',
            'CORDOBA': 'America/Argentina/Cordoba',
            'ROSARIO': 'America/Argentina/Buenos_Aires',
            'MENDOZA': 'America/Argentina/Mendoza',
            'TUCUMAN': 'America/Argentina/Tucuman',
            'LA_PLATA': 'America/Argentina/Buenos_Aires',
            'MAR_DEL_PLATA': 'America/Argentina/Buenos_Aires',
            'SANTIAGO': 'America/Santiago',
            'VALPARAISO': 'America/Santiago',
            'CONCEPCION': 'America/Santiago',
            'LA_SERENA': 'America/Santiago',
            'ANTOFAGASTA': 'America/Santiago',
            'TEMUCO': 'America/Santiago',
            'BOGOTA': 'America/Bogota',
            'MEDELLIN': 'America/Bogota',
            'CALI': 'America/Bogota',
            'BARRANQUILLA': 'America/Bogota',
            'CARTAGENA': 'America/Bogota',
            'CUCUTA': 'America/Bogota',
            'LIMA': 'America/Lima',
            'AREQUIPA': 'America/Lima',
            'TRUJILLO': 'America/Lima',
            'CHICLAYO': 'America/Lima',
            'PIURA': 'America/Lima',
            'IQUITOS': 'America/Lima',
            'CARACAS': 'America/Caracas',
            'MARACAIBO': 'America/Caracas',
            'VALENCIA': 'America/Caracas',
            'BARQUISIMETO': 'America/Caracas',
            'MARACAY': 'America/Caracas',
            'CIUDAD_GUAYANA': 'America/Caracas',
            'QUITO': 'America/Guayaquil',
            'GUAYAQUIL': 'America/Guayaquil',
            'CUENCA': 'America/Guayaquil',
            'MACHALA': 'America/Guayaquil',
            'MANTA': 'America/Guayaquil',
            'LA_PAZ': 'America/La_Paz',
            'SANTA_CRUZ': 'America/La_Paz',
            'COCHABAMBA': 'America/La_Paz',
            'SUCRE': 'America/La_Paz',
            'ORURO': 'America/La_Paz',
            'POTOSI': 'America/La_Paz',
            'ASUNCION': 'America/Asuncion',
            'CIUDAD_DEL_ESTE': 'America/Asuncion',
            'SAN_LORENZO': 'America/Asuncion',
            'LUQUE': 'America/Asuncion',
            'MONTEVIDEO': 'America/Montevideo',
            'SALTO': 'America/Montevideo',
            'PAYSANDU': 'America/Montevideo',
            'LAS_PIEDRAS': 'America/Montevideo',
            'RIVERA': 'America/Montevideo',
            'MALDONADO': 'America/Montevideo',
            'GEORGETOWN': 'America/Guyana',
            'LINDEN': 'America/Guyana',
            'NEW_AMSTERDAM': 'America/Guyana',
            'PARAMARIBO': 'America/Paramaribo',
            'LELYDORP': 'America/Paramaribo',
            'NIEUW_NICKERIE': 'America/Paramaribo',
            'CAYENNE': 'America/Cayenne',
            'SAINT_LAURENT': 'America/Cayenne',
            'KOUROU': 'America/Cayenne',
            'GUATEMALA_CITY': 'America/Guatemala',
            'MIXCO': 'America/Guatemala',
            'VILLA_NUEVA': 'America/Guatemala',
            'BELIZE_CITY': 'America/Belize',
            'SAN_IGNACIO': 'America/Belize',
            'ORANGE_WALK': 'America/Belize',
            'SAN_SALVADOR': 'America/El_Salvador',
            'SOYAPANGO': 'America/El_Salvador',
            'SANTA_ANA': 'America/El_Salvador',
            'TEGUCIGALPA': 'America/Tegucigalpa',
            'SAN_PEDRO_SULA': 'America/Tegucigalpa',
            'CHOLOMA': 'America/Tegucigalpa',
            'MANAGUA': 'America/Managua',
            'LEON': 'America/Managua',
            'MASAYA': 'America/Managua',
            'SAN_JOSE': 'America/Costa_Rica',
            'SAN_FRANCISCO': 'America/Costa_Rica',
            'CARTAGO': 'America/Costa_Rica',
            'PANAMA_CITY': 'America/Panama',
            'SAN_MIGUELITO': 'America/Panama',
            'TOCUMEN': 'America/Panama',
            'HAVANA': 'America/Havana',
            'SANTIAGO_DE_CUBA': 'America/Havana',
            'CAMAGUEY': 'America/Havana',
            'KINGSTON': 'America/Jamaica',
            'SPANISH_TOWN': 'America/Jamaica',
            'PORTMORE': 'America/Jamaica',
            'PORT_AU_PRINCE': 'America/Port-au-Prince',
            'CARREFOUR': 'America/Port-au-Prince',
            'DELMAS': 'America/Port-au-Prince',
            'SANTO_DOMINGO': 'America/Santo_Domingo',
            'SANTIAGO': 'America/Santo_Domingo',
            'LOS_ALCARRIZOS': 'America/Santo_Domingo',
            'SAN_JUAN': 'America/Puerto_Rico',
            'BAYAMON': 'America/Puerto_Rico',
            'CAROLINA': 'America/Puerto_Rico',
            'PORT_OF_SPAIN': 'America/Port_of_Spain',
            'CHAGUANAS': 'America/Port_of_Spain',
            'SAN_FERNANDO': 'America/Port_of_Spain',
            'BRIDGETOWN': 'America/Barbados',
            'SPEIGHTSTOWN': 'America/Barbados',
            'OISTINS': 'America/Barbados',

            // Oceania Cities
            'SYDNEY': 'Australia/Sydney',
            'MELBOURNE': 'Australia/Melbourne',
            'BRISBANE': 'Australia/Brisbane',
            'PERTH': 'Australia/Perth',
            'ADELAIDE': 'Australia/Adelaide',
            'CANBERRA': 'Australia/Sydney',
            'GOLD_COAST': 'Australia/Brisbane',
            'NEWCASTLE': 'Australia/Sydney',
            'WOLLONGONG': 'Australia/Sydney',
            'GEELONG': 'Australia/Melbourne',
            'HOBART': 'Australia/Hobart',
            'TOWNSVILLE': 'Australia/Brisbane',
            'CAIRNS': 'Australia/Brisbane',
            'TOOWOOMBA': 'Australia/Brisbane',
            'DARWIN': 'Australia/Darwin',
            'BALLARAT': 'Australia/Melbourne',
            'BENDIGO': 'Australia/Melbourne',
            'ALBURY': 'Australia/Sydney',
            'LAUNCESTON': 'Australia/Hobart',
            'MACKAY': 'Australia/Brisbane',
            'ROCKHAMPTON': 'Australia/Brisbane',
            'BUNBURY': 'Australia/Perth',
            'COFFS_HARBOUR': 'Australia/Sydney',
            'BUNDABERG': 'Australia/Brisbane',
            'WAGGA_WAGGA': 'Australia/Sydney',
            'HERVEY_BAY': 'Australia/Brisbane',
            'MILDURA': 'Australia/Melbourne',
            'SHEPPARTON': 'Australia/Melbourne',
            'GLADSTONE': 'Australia/Brisbane',
            'AUCKLAND': 'Pacific/Auckland',
            'WELLINGTON': 'Pacific/Auckland',
            'CHRISTCHURCH': 'Pacific/Auckland',
            'HAMILTON': 'Pacific/Auckland',
            'TAURANGA': 'Pacific/Auckland',
            'NAPIER': 'Pacific/Auckland',
            'DUNEDIN': 'Pacific/Auckland',
            'PALMERSTON_NORTH': 'Pacific/Auckland',
            'NELSON': 'Pacific/Auckland',
            'ROTORUA': 'Pacific/Auckland',
            'NEW_PLYMOUTH': 'Pacific/Auckland',
            'WHANGAREI': 'Pacific/Auckland',
            'INVERCARGILL': 'Pacific/Auckland',
            'WANGANUI': 'Pacific/Auckland',
            'GISBORNE': 'Pacific/Auckland',
            'SUVA': 'Pacific/Fiji',
            'NADI': 'Pacific/Fiji',
            'LAUTOKA': 'Pacific/Fiji',
            'LABASA': 'Pacific/Fiji',
            'BA': 'Pacific/Fiji',
            'LEVUKA': 'Pacific/Fiji',
            'NUKU_ALOFA': 'Pacific/Tongatapu',
            'NEIAFU': 'Pacific/Tongatapu',
            'HAVELULOTO': 'Pacific/Tongatapu',
            'APIA': 'Pacific/Apia',
            'ASAU': 'Pacific/Apia',
            'MULIFANUA': 'Pacific/Apia',
            'PORT_VILA': 'Pacific/Efate',
            'LUGANVILLE': 'Pacific/Efate',
            'ISANGEL': 'Pacific/Efate',
            'HONIARA': 'Pacific/Guadalcanal',
            'AUKI': 'Pacific/Guadalcanal',
            'GIZO': 'Pacific/Guadalcanal',
            'PORT_MORESBY': 'Pacific/Port_Moresby',
            'LAE': 'Pacific/Port_Moresby',
            'MOUNT_HAGEN': 'Pacific/Port_Moresby',
            'NOUMEA': 'Pacific/Noumea',
            'MONT_DORE': 'Pacific/Noumea',
            'DUMBEA': 'Pacific/Noumea',
            'PAPEETE': 'Pacific/Tahiti',
            'FAAA': 'Pacific/Tahiti',
            'PUNAAUIA': 'Pacific/Tahiti',
            'RAROTONGA': 'Pacific/Rarotonga',
            'AVARUA': 'Pacific/Rarotonga',
            'ARORANGI': 'Pacific/Rarotonga'
        };
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        console.log('✅ Time plugin loaded');
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Main time command with subcommands
        this.bot.messageHandler.registerCommand('time', this.timeCommand.bind(this), {
            description: 'Time and timezone commands',
            usage: `${config.PREFIX}time [world|zones|country]`,
            category: 'time',
            plugin: 'time',
            source: 'time.js'
        });
    }

    /**
     * Main time command handler
     */
    async timeCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            // No arguments - show Lagos time
            if (args.length === 0) {
                return await this.showBotTime(messageInfo);
            }

            const subcommand = args[0].toLowerCase();

            // Handle subcommands
            if (subcommand === 'world') {
                return await this.worldClockCommand(messageInfo);
            } else if (subcommand === 'zones') {
                return await this.timezonesCommand(messageInfo);
            } else {
                // Try to interpret as country/city code
                const location = args[0].toUpperCase();
                const timezone = this.getTimezone(location);

                if (!timezone) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Unknown location: *${location}*\n\n` +
                        `💡 Available commands:\n` +
                        `• ${config.PREFIX}time - Current Lagos time\n` +
                        `• ${config.PREFIX}time world - World clock\n` +
                        `• ${config.PREFIX}time zones - Available timezone codes\n` +
                        `• ${config.PREFIX}time <country> - Specific country time\n\n` +
                        `Example: ${config.PREFIX}time UK`
                    );
                    return;
                }

                const timeData = await this.getTimeForTimezone(timezone, location);
                await this.bot.messageHandler.reply(messageInfo, timeData);
            }

        } catch (error) {
            console.error('Error in timeCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving time information.');
        }
    }

    /**
     * Show bot's default time (Lagos time)
     */
    async showBotTime(messageInfo) {
        const lagosTime = moment().tz(config.TIMEZONE);
        const timeInfo = `🇳🇬 *Lagos Time:* ${lagosTime.format('DD/MM/YYYY HH:mm:ss')}\n\n` +
                        `💡 *Quick Tools:*\n` +
                        `• ${config.PREFIX}time world - World clock\n` +
                        `• ${config.PREFIX}time zones - Available codes\n` +
                        `• ${config.PREFIX}time <country> - Specific time`;
        await this.bot.messageHandler.reply(messageInfo, timeInfo);
    }

    /**
     * World clock command - show multiple times
     */
    async worldClockCommand(messageInfo) {
        try {
            const majorTimezones = [
                { name: 'Lagos 🇳🇬', zone: 'Africa/Lagos' },
                { name: 'London 🇬🇧', zone: 'Europe/London' },
                { name: 'New York 🇺🇸', zone: 'America/New_York' },
                { name: 'Tokyo 🇯🇵', zone: 'Asia/Tokyo' },
                { name: 'Dubai 🇦🇪', zone: 'Asia/Dubai' },
                { name: 'Sydney 🇦🇺', zone: 'Australia/Sydney' }
            ];

            let response = `🌍 *WORLD CLOCK*\n\n`;

            for (const tz of majorTimezones) {
                const time = moment().tz(tz.zone);
                response += `${tz.name}: ${time.format('HH:mm')} (${time.format('DD/MM')})\n`;
            }

            response += `\n🕐 *Updated:* ${moment().tz(config.TIMEZONE).format('HH:mm DD/MM/YYYY')}\n`;
            response += `💡 Use *${config.PREFIX}time <country>* for specific locations`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in worldClockCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error displaying world clock: ' + error.message);
        }
    }

    /**
     * Timezones command - list all available timezone codes
     */
    async timezonesCommand(messageInfo) {
        try {
            let response = `🌍 *AVAILABLE TIMEZONE CODES*\n\n`;

            // Country codes section
            response += `📍 *Country Codes:*\n`;
            const countryEntries = Object.entries(this.countryTimezones);
            for (let i = 0; i < countryEntries.length; i += 2) {
                const [code1, tz1] = countryEntries[i];
                const [code2, tz2] = countryEntries[i + 1] || ['', ''];
                if (code2) {
                    response += `• ${code1.padEnd(8)} • ${code2}\n`;
                } else {
                    response += `• ${code1}\n`;
                }
            }

            response += `\n🏙️ *City Names:*\n`;
            const cityEntries = Object.entries(this.cityTimezones);
            for (let i = 0; i < cityEntries.length; i += 2) {
                const [city1, tz1] = cityEntries[i];
                const [city2, tz2] = cityEntries[i + 1] || ['', ''];
                if (city2) {
                    response += `• ${city1.padEnd(12)} • ${city2}\n`;
                } else {
                    response += `• ${city1}\n`;
                }
            }

            response += `\n💡 Usage: *${config.PREFIX}time <code>*\nExample: *${config.PREFIX}time UK*`;

            await this.bot.messageHandler.reply(messageInfo, response);

        } catch (error) {
            console.error('Error in timezonesCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing timezones: ' + error.message);
        }
    }

    /**
     * Get timezone for location
     */
    getTimezone(location) {
        // Check country codes first
        if (this.countryTimezones[location]) {
            return this.countryTimezones[location];
        }

        // Check city names
        if (this.cityTimezones[location]) {
            return this.cityTimezones[location];
        }

        return null;
    }

    /**
     * Get formatted time for timezone
     */
    async getTimeForTimezone(timezone, location) {
        try {
            const now = moment().tz(timezone);
            const utcOffset = now.format('Z');
            const countryFlag = this.getCountryFlag(location);

            return `${countryFlag} *${location} Time*\n\n` +
                   `🕐 *Current Time:* ${now.format('HH:mm:ss')}\n` +
                   `📅 *Date:* ${now.format('dddd, DD MMMM YYYY')}\n` +
                   `🌍 *UTC Offset:* ${utcOffset}\n` +
                   `⏰ *Timezone:* ${timezone}\n\n` +
                   `_Updated: ${moment().tz(config.TIMEZONE).format('HH:mm')}_`;
        } catch (error) {
            throw new Error('Failed to get timezone information');
        }
    }

    /**
     * Get country flag emoji
     */
    getCountryFlag(location) {
        const flags = {
            // Major Countries
            'US': '🇺🇸', 'USA': '🇺🇸',
            'UK': '🇬🇧', 'GB': '🇬🇧',
            'IN': '🇮🇳', 'INDIA': '🇮🇳',
            'JP': '🇯🇵', 'JAPAN': '🇯🇵',
            'CN': '🇨🇳', 'CHINA': '🇨🇳',
            'RU': '🇷🇺', 'RUSSIA': '🇷🇺',
            'DE': '🇩🇪', 'GERMANY': '🇩🇪',
            'FR': '🇫🇷', 'FRANCE': '🇫🇷',
            'CA': '🇨🇦', 'CANADA': '🇨🇦',
            'AU': '🇦🇺', 'AUSTRALIA': '🇦🇺',
            'BR': '🇧🇷', 'BRAZIL': '🇧🇷',

            // African Countries
            'NG': '🇳🇬', 'NIGERIA': '🇳🇬',
            'EG': '🇪🇬', 'EGYPT': '🇪🇬',
            'ZA': '🇿🇦', 'SOUTH_AFRICA': '🇿🇦',
            'KE': '🇰🇪', 'KENYA': '🇰🇪',
            'GH': '🇬🇭', 'GHANA': '🇬🇭',
            'MA': '🇲🇦', 'MOROCCO': '🇲🇦',
            'MU': '🇲🇺', 'MAURITIUS': '🇲🇺',
            'ET': '🇪🇹', 'ETHIOPIA': '🇪🇹',
            'TZ': '🇹🇿', 'TANZANIA': '🇹🇿',
            'UG': '🇺🇬', 'UGANDA': '🇺🇬',
            'RW': '🇷🇼', 'RWANDA': '🇷🇼',
            'DZ': '🇩🇿', 'ALGERIA': '🇩🇿',
            'TN': '🇹🇳', 'TUNISIA': '🇹🇳',
            'LY': '🇱🇾', 'LIBYA': '🇱🇾',
            'SD': '🇸🇩', 'SUDAN': '🇸🇩',
            'SN': '🇸🇳', 'SENEGAL': '🇸🇳',
            'CI': '🇨🇮', 'IVORY_COAST': '🇨🇮',
            'BF': '🇧🇫', 'BURKINA_FASO': '🇧🇫',
            'ML': '🇲🇱', 'MALI': '🇲🇱',
            'NE': '🇳🇪', 'NIGER': '🇳🇪',
            'TD': '🇹🇩', 'CHAD': '🇹🇩',
            'CM': '🇨🇲', 'CAMEROON': '🇨🇲',
            'GA': '🇬🇦', 'GABON': '🇬🇦',
            'CG': '🇨🇬', 'CONGO': '🇨🇬',
            'CD': '🇨🇩', 'DRC': '🇨🇩',
            'AO': '🇦🇴', 'ANGOLA': '🇦🇴',
            'ZM': '🇿🇲', 'ZAMBIA': '🇿🇲',
            'ZW': '🇿🇼', 'ZIMBABWE': '🇿🇼',
            'BW': '🇧🇼', 'BOTSWANA': '🇧🇼',
            'NA': '🇳🇦', 'NAMIBIA': '🇳🇦',
            'MZ': '🇲🇿', 'MOZAMBIQUE': '🇲🇿',
            'MW': '🇲🇼', 'MALAWI': '🇲🇼',
            'MG': '🇲🇬', 'MADAGASCAR': '🇲🇬',

            // Middle Eastern Countries
            'SA': '🇸🇦', 'SAUDI': '🇸🇦',
            'UAE': '🇦🇪', 'DUBAI': '🇦🇪',
            'TR': '🇹🇷', 'TURKEY': '🇹🇷',
            'IL': '🇮🇱', 'ISRAEL': '🇮🇱',
            'IR': '🇮🇷', 'IRAN': '🇮🇷',
            'IQ': '🇮🇶', 'IRAQ': '🇮🇶',
            'SY': '🇸🇾', 'SYRIA': '🇸🇾',
            'LB': '🇱🇧', 'LEBANON': '🇱🇧',
            'JO': '🇯🇴', 'JORDAN': '🇯🇴',
            'KW': '🇰🇼', 'KUWAIT': '🇰🇼',
            'BH': '🇧🇭', 'BAHRAIN': '🇧🇭',
            'QA': '🇶🇦', 'QATAR': '🇶🇦',
            'OM': '🇴🇲', 'OMAN': '🇴🇲',
            'YE': '🇾🇪', 'YEMEN': '🇾🇪',
            'AF': '🇦🇫', 'AFGHANISTAN': '🇦🇫',

            // Asian Countries
            'KR': '🇰🇷', 'KOREA': '🇰🇷',
            'ID': '🇮🇩', 'INDONESIA': '🇮🇩',
            'TH': '🇹🇭', 'THAILAND': '🇹🇭',
            'SG': '🇸🇬', 'SINGAPORE': '🇸🇬',
            'MY': '🇲🇾', 'MALAYSIA': '🇲🇾',
            'PH': '🇵🇭', 'PHILIPPINES': '🇵🇭',
            'VN': '🇻🇳', 'VIETNAM': '🇻🇳',
            'MM': '🇲🇲', 'MYANMAR': '🇲🇲',
            'LA': '🇱🇦', 'LAOS': '🇱🇦',
            'KH': '🇰🇭', 'CAMBODIA': '🇰🇭',
            'BD': '🇧🇩', 'BANGLADESH': '🇧🇩',
            'PK': '🇵🇰', 'PAKISTAN': '🇵🇰',
            'LK': '🇱🇰', 'SRI_LANKA': '🇱🇰',
            'NP': '🇳🇵', 'NEPAL': '🇳🇵',
            'BT': '🇧🇹', 'BHUTAN': '🇧🇹',
            'MV': '🇲🇻', 'MALDIVES': '🇲🇻',
            'MN': '🇲🇳', 'MONGOLIA': '🇲🇳',
            'KZ': '🇰🇿', 'KAZAKHSTAN': '🇰🇿',
            'UZ': '🇺🇿', 'UZBEKISTAN': '🇺🇿',
            'KG': '🇰🇬', 'KYRGYZSTAN': '🇰🇬',
            'TJ': '🇹🇯', 'TAJIKISTAN': '🇹🇯',
            'TM': '🇹🇲', 'TURKMENISTAN': '🇹🇲',
            'AZ': '🇦🇿', 'AZERBAIJAN': '🇦🇿',
            'AM': '🇦🇲', 'ARMENIA': '🇦🇲',
            'GE': '🇬🇪', 'GEORGIA': '🇬🇪',

            // European Countries
            'IT': '🇮🇹', 'ITALY': '🇮🇹',
            'ES': '🇪🇸', 'SPAIN': '🇪🇸',
            'NL': '🇳🇱', 'NETHERLANDS': '🇳🇱',
            'BE': '🇧🇪', 'BELGIUM': '🇧🇪',
            'CH': '🇨🇭', 'SWITZERLAND': '🇨🇭',
            'AT': '🇦🇹', 'AUSTRIA': '🇦🇹',
            'SE': '🇸🇪', 'SWEDEN': '🇸🇪',
            'NO': '🇳🇴', 'NORWAY': '🇳🇴',
            'DK': '🇩🇰', 'DENMARK': '🇩🇰',
            'PT': '🇵🇹', 'PORTUGAL': '🇵🇹',
            'GR': '🇬🇷', 'GREECE': '🇬🇷',
            'IE': '🇮🇪', 'IRELAND': '🇮🇪',
            'PL': '🇵🇱', 'POLAND': '🇵🇱',
            'FI': '🇫🇮', 'FINLAND': '🇫🇮',
            'CZ': '🇨🇿', 'CZECHIA': '🇨🇿',
            'SK': '🇸🇰', 'SLOVAKIA': '🇸🇰',
            'HU': '🇭🇺', 'HUNGARY': '🇭🇺',
            'RO': '🇷🇴', 'ROMANIA': '🇷🇴',
            'BG': '🇧🇬', 'BULGARIA': '🇧🇬',
            'HR': '🇭🇷', 'CROATIA': '🇭🇷',
            'SI': '🇸🇮', 'SLOVENIA': '🇸🇮',
            'BA': '🇧🇦', 'BOSNIA': '🇧🇦',
            'RS': '🇷🇸', 'SERBIA': '🇷🇸',
            'ME': '🇲🇪', 'MONTENEGRO': '🇲🇪',
            'MK': '🇲🇰', 'MACEDONIA': '🇲🇰',
            'AL': '🇦🇱', 'ALBANIA': '🇦🇱',
            'XK': '🇽🇰', 'KOSOVO': '🇽🇰',
            'MD': '🇲🇩', 'MOLDOVA': '🇲🇩',
            'UA': '🇺🇦', 'UKRAINE': '🇺🇦',
            'BY': '🇧🇾', 'BELARUS': '🇧🇾',
            'LT': '🇱🇹', 'LITHUANIA': '🇱🇹',
            'LV': '🇱🇻', 'LATVIA': '🇱🇻',
            'EE': '🇪🇪', 'ESTONIA': '🇪🇪',
            'IS': '🇮🇸', 'ICELAND': '🇮🇸',
            'MT': '🇲🇹', 'MALTA': '🇲🇹',
            'CY': '🇨🇾', 'CYPRUS': '🇨🇾',
            'LU': '🇱🇺', 'LUXEMBOURG': '🇱🇺',
            'MC': '🇲🇨', 'MONACO': '🇲🇨',
            'AD': '🇦🇩', 'ANDORRA': '🇦🇩',
            'SM': '🇸🇲', 'SAN_MARINO': '🇸🇲',
            'VA': '🇻🇦', 'VATICAN': '🇻🇦',
            'LI': '🇱🇮', 'LIECHTENSTEIN': '🇱🇮',

            // American Countries
            'MX': '🇲🇽', 'MEXICO': '🇲🇽',
            'AR': '🇦🇷', 'ARGENTINA': '🇦🇷',
            'CL': '🇨🇱', 'CHILE': '🇨🇱',
            'CO': '🇨🇴', 'COLOMBIA': '🇨🇴',
            'PE': '🇵🇪', 'PERU': '🇵🇪',
            'VE': '🇻🇪', 'VENEZUELA': '🇻🇪',
            'EC': '🇪🇨', 'ECUADOR': '🇪🇨',
            'BO': '🇧🇴', 'BOLIVIA': '🇧🇴',
            'PY': '🇵🇾', 'PARAGUAY': '🇵🇾',
            'UY': '🇺🇾', 'URUGUAY': '🇺🇾',
            'GY': '🇬🇾', 'GUYANA': '🇬🇾',
            'SR': '🇸🇷', 'SURINAME': '🇸🇷',
            'GF': '🇬🇫', 'FRENCH_GUIANA': '🇬🇫',
            'GT': '🇬🇹', 'GUATEMALA': '🇬🇹',
            'BZ': '🇧🇿', 'BELIZE': '🇧🇿',
            'SV': '🇸🇻', 'EL_SALVADOR': '🇸🇻',
            'HN': '🇭🇳', 'HONDURAS': '🇭🇳',
            'NI': '🇳🇮', 'NICARAGUA': '🇳🇮',
            'CR': '🇨🇷', 'COSTA_RICA': '🇨🇷',
            'PA': '🇵🇦', 'PANAMA': '🇵🇦',
            'CU': '🇨🇺', 'CUBA': '🇨🇺',
            'JM': '🇯🇲', 'JAMAICA': '🇯🇲',
            'HT': '🇭🇹', 'HAITI': '🇭🇹',
            'DO': '🇩🇴', 'DOMINICAN': '🇩🇴',
            'PR': '🇵🇷', 'PUERTO_RICO': '🇵🇷',
            'TT': '🇹🇹', 'TRINIDAD': '🇹🇹',
            'BB': '🇧🇧', 'BARBADOS': '🇧🇧',
            'LC': '🇱🇨', 'ST_LUCIA': '🇱🇨',
            'GD': '🇬🇩', 'GRENADA': '🇬🇩',
            'VC': '🇻🇨', 'ST_VINCENT': '🇻🇨',
            'AG': '🇦🇬', 'ANTIGUA': '🇦🇬',
            'DM': '🇩🇲', 'DOMINICA': '🇩🇲',
            'KN': '🇰🇳', 'ST_KITTS': '🇰🇳',
            'BS': '🇧🇸', 'BAHAMAS': '🇧🇸',

            // Oceania
            'NZ': '🇳🇿', 'NEW_ZEALAND': '🇳🇿',
            'FJ': '🇫🇯', 'FIJI': '🇫🇯',
            'TO': '🇹🇴', 'TONGA': '🇹🇴',
            'WS': '🇼🇸', 'SAMOA': '🇼🇸',
            'VU': '🇻🇺', 'VANUATU': '🇻🇺',
            'SB': '🇸🇧', 'SOLOMON': '🇸🇧',
            'PG': '🇵🇬', 'PAPUA': '🇵🇬',
            'NC': '🇳🇨', 'NEW_CALEDONIA': '🇳🇨',
            'PF': '🇵🇫', 'TAHITI': '🇵🇫',
            'CK': '🇨🇰', 'COOK_ISLANDS': '🇨🇰',
            'NU': '🇳🇺', 'NIUE': '🇳🇺',
            'TV': '🇹🇻', 'TUVALU': '🇹🇻',
            'KI': '🇰🇮', 'KIRIBATI': '🇰🇮',
            'NR': '🇳🇷', 'NAURU': '🇳🇷',
            'MH': '🇲🇭', 'MARSHALL': '🇲🇭',
            'FM': '🇫🇲', 'MICRONESIA': '🇫🇲',
            'PW': '🇵🇼', 'PALAU': '🇵🇼',
            'GU': '🇬🇺', 'GUAM': '🇬🇺',
            'MP': '🇲🇵', 'NORTHERN_MARIANA': '🇲🇵'
        };

        return flags[location] || '🌍';
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new TimePlugin();
        await plugin.init(bot);
        return plugin;
    }
};