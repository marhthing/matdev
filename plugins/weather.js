/**
 * MATDEV Weather Plugin
 * Get weather information for any city, country, or location worldwide
 */

const config = require('../config');
const axios = require('axios');

class WeatherPlugin {
    constructor() {
        this.name = 'weather';
        this.description = 'Weather information for any location worldwide';
        this.version = '1.0.0';
        
        // OpenWeatherMap API endpoints
        this.apiBaseUrl = 'https://api.openweathermap.org/data/2.5';
        
        // Weather condition icons mapping
        this.weatherIcons = {
            '01d': '☀️', '01n': '🌙',     // clear sky
            '02d': '⛅', '02n': '☁️',     // few clouds  
            '03d': '☁️', '03n': '☁️',     // scattered clouds
            '04d': '☁️', '04n': '☁️',     // broken clouds
            '09d': '🌧️', '09n': '🌧️',     // shower rain
            '10d': '🌦️', '10n': '🌧️',     // rain
            '11d': '⛈️', '11n': '⛈️',     // thunderstorm
            '13d': '❄️', '13n': '❄️',     // snow
            '50d': '🌫️', '50n': '🌫️'      // mist
        };
        
        // Country code to flag emoji mapping
        this.countryFlags = {
            'AD': '🇦🇩', 'AE': '🇦🇪', 'AF': '🇦🇫', 'AG': '🇦🇬', 'AI': '🇦🇮', 'AL': '🇦🇱', 'AM': '🇦🇲',
            'AO': '🇦🇴', 'AQ': '🇦🇶', 'AR': '🇦🇷', 'AS': '🇦🇸', 'AT': '🇦🇹', 'AU': '🇦🇺', 'AW': '🇦🇼',
            'AX': '🇦🇽', 'AZ': '🇦🇿', 'BA': '🇧🇦', 'BB': '🇧🇧', 'BD': '🇧🇩', 'BE': '🇧🇪', 'BF': '🇧🇫',
            'BG': '🇧🇬', 'BH': '🇧🇭', 'BI': '🇧🇮', 'BJ': '🇧🇯', 'BL': '🇧🇱', 'BM': '🇧🇲', 'BN': '🇧🇳',
            'BO': '🇧🇴', 'BQ': '🇧🇶', 'BR': '🇧🇷', 'BS': '🇧🇸', 'BT': '🇧🇹', 'BV': '🇧🇻', 'BW': '🇧🇼',
            'BY': '🇧🇾', 'BZ': '🇧🇿', 'CA': '🇨🇦', 'CC': '🇨🇨', 'CD': '🇨🇩', 'CF': '🇨🇫', 'CG': '🇨🇬',
            'CH': '🇨🇭', 'CI': '🇨🇮', 'CK': '🇨🇰', 'CL': '🇨🇱', 'CM': '🇨🇲', 'CN': '🇨🇳', 'CO': '🇨🇴',
            'CR': '🇨🇷', 'CU': '🇨🇺', 'CV': '🇨🇻', 'CW': '🇨🇼', 'CX': '🇨🇽', 'CY': '🇨🇾', 'CZ': '🇨🇿',
            'DE': '🇩🇪', 'DJ': '🇩🇯', 'DK': '🇩🇰', 'DM': '🇩🇲', 'DO': '🇩🇴', 'DZ': '🇩🇿', 'EC': '🇪🇨',
            'EE': '🇪🇪', 'EG': '🇪🇬', 'EH': '🇪🇭', 'ER': '🇪🇷', 'ES': '🇪🇸', 'ET': '🇪🇹', 'FI': '🇫🇮',
            'FJ': '🇫🇯', 'FK': '🇫🇰', 'FM': '🇫🇲', 'FO': '🇫🇴', 'FR': '🇫🇷', 'GA': '🇬🇦', 'GB': '🇬🇧',
            'GD': '🇬🇩', 'GE': '🇬🇪', 'GF': '🇬🇫', 'GG': '🇬🇬', 'GH': '🇬🇭', 'GI': '🇬🇮', 'GL': '🇬🇱',
            'GM': '🇬🇲', 'GN': '🇬🇳', 'GP': '🇬🇵', 'GQ': '🇬🇶', 'GR': '🇬🇷', 'GS': '🇬🇸', 'GT': '🇬🇹',
            'GU': '🇬🇺', 'GW': '🇬🇼', 'GY': '🇬🇾', 'HK': '🇭🇰', 'HM': '🇭🇲', 'HN': '🇭🇳', 'HR': '🇭🇷',
            'HT': '🇭🇹', 'HU': '🇭🇺', 'ID': '🇮🇩', 'IE': '🇮🇪', 'IL': '🇮🇱', 'IM': '🇮🇲', 'IN': '🇮🇳',
            'IO': '🇮🇴', 'IQ': '🇮🇶', 'IR': '🇮🇷', 'IS': '🇮🇸', 'IT': '🇮🇹', 'JE': '🇯🇪', 'JM': '🇯🇲',
            'JO': '🇯🇴', 'JP': '🇯🇵', 'KE': '🇰🇪', 'KG': '🇰🇬', 'KH': '🇰🇭', 'KI': '🇰🇮', 'KM': '🇰🇲',
            'KN': '🇰🇳', 'KP': '🇰🇵', 'KR': '🇰🇷', 'KW': '🇰🇼', 'KY': '🇰🇾', 'KZ': '🇰🇿', 'LA': '🇱🇦',
            'LB': '🇱🇧', 'LC': '🇱🇨', 'LI': '🇱🇮', 'LK': '🇱🇰', 'LR': '🇱🇷', 'LS': '🇱🇸', 'LT': '🇱🇹',
            'LU': '🇱🇺', 'LV': '🇱🇻', 'LY': '🇱🇾', 'MA': '🇲🇦', 'MC': '🇲🇨', 'MD': '🇲🇩', 'ME': '🇲🇪',
            'MF': '🇲🇫', 'MG': '🇲🇬', 'MH': '🇲🇭', 'MK': '🇲🇰', 'ML': '🇲🇱', 'MM': '🇲🇲', 'MN': '🇲🇳',
            'MO': '🇲🇴', 'MP': '🇲🇵', 'MQ': '🇲🇶', 'MR': '🇲🇷', 'MS': '🇲🇸', 'MT': '🇲🇹', 'MU': '🇲🇺',
            'MV': '🇲🇻', 'MW': '🇲🇼', 'MX': '🇲🇽', 'MY': '🇲🇾', 'MZ': '🇲🇿', 'NA': '🇳🇦', 'NC': '🇳🇨',
            'NE': '🇳🇪', 'NF': '🇳🇫', 'NG': '🇳🇬', 'NI': '🇳🇮', 'NL': '🇳🇱', 'NO': '🇳🇴', 'NP': '🇳🇵',
            'NR': '🇳🇷', 'NU': '🇳🇺', 'NZ': '🇳🇿', 'OM': '🇴🇲', 'PA': '🇵🇦', 'PE': '🇵🇪', 'PF': '🇵🇫',
            'PG': '🇵🇬', 'PH': '🇵🇭', 'PK': '🇵🇰', 'PL': '🇵🇱', 'PM': '🇵🇲', 'PN': '🇵🇳', 'PR': '🇵🇷',
            'PS': '🇵🇸', 'PT': '🇵🇹', 'PW': '🇵🇼', 'PY': '🇵🇾', 'QA': '🇶🇦', 'RE': '🇷🇪', 'RO': '🇷🇴',
            'RS': '🇷🇸', 'RU': '🇷🇺', 'RW': '🇷🇼', 'SA': '🇸🇦', 'SB': '🇸🇧', 'SC': '🇸🇨', 'SD': '🇸🇩',
            'SE': '🇸🇪', 'SG': '🇸🇬', 'SH': '🇸🇭', 'SI': '🇸🇮', 'SJ': '🇸🇯', 'SK': '🇸🇰', 'SL': '🇸🇱',
            'SM': '🇸🇲', 'SN': '🇸🇳', 'SO': '🇸🇴', 'SR': '🇸🇷', 'SS': '🇸🇸', 'ST': '🇸🇹', 'SV': '🇸🇻',
            'SX': '🇸🇽', 'SY': '🇸🇾', 'SZ': '🇸🇿', 'TC': '🇹🇨', 'TD': '🇹🇩', 'TF': '🇹🇫', 'TG': '🇹🇬',
            'TH': '🇹🇭', 'TJ': '🇹🇯', 'TK': '🇹🇰', 'TL': '🇹🇱', 'TM': '🇹🇲', 'TN': '🇹🇳', 'TO': '🇹🇴',
            'TR': '🇹🇷', 'TT': '🇹🇹', 'TV': '🇹🇻', 'TW': '🇹🇼', 'TZ': '🇹🇿', 'UA': '🇺🇦', 'UG': '🇺🇬',
            'UM': '🇺🇲', 'US': '🇺🇸', 'UY': '🇺🇾', 'UZ': '🇺🇿', 'VA': '🇻🇦', 'VC': '🇻🇨', 'VE': '🇻🇪',
            'VG': '🇻🇬', 'VI': '🇻🇮', 'VN': '🇻🇳', 'VU': '🇻🇺', 'WF': '🇼🇫', 'WS': '🇼🇸', 'YE': '🇾🇪',
            'YT': '🇾🇹', 'ZA': '🇿🇦', 'ZM': '🇿🇲', 'ZW': '🇿🇼'
        };
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        console.log('✅ Weather plugin loaded');
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Main weather command
        this.bot.messageHandler.registerCommand('weather', this.weatherCommand.bind(this), {
            description: 'Get weather information for any location',
            usage: `${config.PREFIX}weather <city/country/coordinates>`,
            category: 'utility',
            plugin: 'weather',
            source: 'weather.js'
        });

        // Alternative command name
        this.bot.messageHandler.registerCommand('w', this.weatherCommand.bind(this), {
            description: 'Get weather information (short version)',
            usage: `${config.PREFIX}w <location>`,
            category: 'utility',
            plugin: 'weather',
            source: 'weather.js'
        });
    }

    /**
     * Main weather command handler
     */
    async weatherCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            // Check if API key is configured
            if (!config.WEATHER_API_KEY) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Weather service not configured. Please set WEATHER_API_KEY in environment variables.\n\n' +
                    '💡 Get a free API key from: https://openweathermap.org/api'
                );
                return;
            }

            // Check if location is provided
            if (!args.length) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a location!\n\n` +
                    `💡 *Usage examples:*\n` +
                    `• ${config.PREFIX}weather Lagos\n` +
                    `• ${config.PREFIX}weather London, UK\n` +
                    `• ${config.PREFIX}weather New York\n` +
                    `• ${config.PREFIX}weather 40.7128,-74.0060\n\n` +
                    `_Supports cities, countries, and coordinates worldwide_`
                );
                return;
            }

            const location = args.join(' ').trim();
            
            // Send typing indicator
            await this.bot.messageHandler.reply(messageInfo, '🔍 Getting weather data...');

            // Get weather data
            const weatherData = await this.getWeatherData(location);
            
            if (!weatherData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Location not found: *${location}*\n\n` +
                    `💡 Try:\n` +
                    `• Full city name: "New York" or "Lagos, Nigeria"\n` +
                    `• Country name: "Japan" or "United Kingdom"\n` +
                    `• Coordinates: "40.7128,-74.0060"`
                );
                return;
            }

            // Format and send weather response
            const weatherMessage = this.formatWeatherResponse(weatherData);
            await this.bot.messageHandler.reply(messageInfo, weatherMessage);

        } catch (error) {
            console.error('Error in weather command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error getting weather data. Please try again later.\n\n' +
                '_If the problem persists, the weather service might be temporarily unavailable._'
            );
        }
    }

    /**
     * Get weather data for a location
     */
    async getWeatherData(location) {
        try {
            // Get current weather data using the location name directly
            const weatherResponse = await axios.get(`${this.apiBaseUrl}/weather`, {
                params: {
                    q: location,
                    appid: config.WEATHER_API_KEY,
                    units: 'metric'
                },
                timeout: 10000
            });

            return weatherResponse.data;

        } catch (error) {
            console.error('Error fetching weather data:', error.message);
            return null;
        }
    }

    /**
     * Format weather response message
     */
    formatWeatherResponse(data) {
        try {
            // Extract data
            const location = data.name;
            const country = data.sys.country;
            const countryFlag = this.countryFlags[country] || '🌍';
            const weatherIcon = this.weatherIcons[data.weather[0].icon] || '🌤️';
            const description = data.weather[0].description;
            const temp = Math.round(data.main.temp);
            const feelsLike = Math.round(data.main.feels_like);
            const humidity = data.main.humidity;
            const pressure = data.main.pressure;
            const windSpeed = data.wind?.speed || 0;
            const windDir = data.wind?.deg || 0;
            const visibility = data.visibility ? (data.visibility / 1000).toFixed(1) : 'N/A';
            const cloudiness = data.clouds.all;

            // Convert wind direction to compass
            const windDirection = this.getWindDirection(windDir);

            // Get sunrise/sunset times
            const sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            // Format response
            const response = `${weatherIcon} *Weather for ${location}* ${countryFlag}\n\n` +
                `🌡️ *Temperature:* ${temp}°C (feels like ${feelsLike}°C)\n` +
                `☁️ *Condition:* ${description.charAt(0).toUpperCase() + description.slice(1)}\n` +
                `💧 *Humidity:* ${humidity}%\n` +
                `🌬️ *Wind:* ${windSpeed} m/s ${windDirection}\n` +
                `📊 *Pressure:* ${pressure} hPa\n` +
                `👁️ *Visibility:* ${visibility} km\n` +
                `☁️ *Cloudiness:* ${cloudiness}%\n\n` +
                `🌅 *Sunrise:* ${sunrise}\n` +
                `🌇 *Sunset:* ${sunset}\n\n` +
                `_Updated: ${new Date().toLocaleTimeString('en-US', { hour12: false })}_`;

            return response;
        } catch (error) {
            console.error('Error formatting weather response:', error);
            return '❌ Error formatting weather data';
        }
    }

    /**
     * Convert wind degrees to compass direction
     */
    getWindDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    /**
     * Get temperature color based on value
     */
    getTempColor(temp) {
        if (temp >= 30) return '🔥'; // Very hot
        if (temp >= 25) return '🌡️'; // Hot
        if (temp >= 15) return '🌤️'; // Warm
        if (temp >= 5) return '🌥️'; // Cool
        if (temp >= 0) return '❄️'; // Cold
        return '🧊'; // Freezing
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new WeatherPlugin();
        await plugin.init(bot);
        return plugin;
    }
};