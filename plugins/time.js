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
            
            // Middle Eastern Countries
            'SA': 'Asia/Riyadh',
            'SAUDI': 'Asia/Riyadh',
            'UAE': 'Asia/Dubai',
            'DUBAI': 'Asia/Dubai',
            'TR': 'Europe/Istanbul',
            'TURKEY': 'Europe/Istanbul',
            'IL': 'Asia/Jerusalem',
            'ISRAEL': 'Asia/Jerusalem',
            
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
            
            // Oceania
            'NZ': 'Pacific/Auckland',
            'NEW_ZEALAND': 'Pacific/Auckland',
            'FJ': 'Pacific/Fiji',
            'FIJI': 'Pacific/Fiji'
        };
        
        // Alternative city names
        this.cityTimezones = {
            'LONDON': 'Europe/London',
            'PARIS': 'Europe/Paris',
            'BERLIN': 'Europe/Berlin',
            'ROME': 'Europe/Rome',
            'MADRID': 'Europe/Madrid',
            'MOSCOW': 'Europe/Moscow',
            'TOKYO': 'Asia/Tokyo',
            'SEOUL': 'Asia/Seoul',
            'BEIJING': 'Asia/Shanghai',
            'MUMBAI': 'Asia/Kolkata',
            'DELHI': 'Asia/Kolkata',
            'DUBAI': 'Asia/Dubai',
            'LAGOS': 'Africa/Lagos',
            'CAIRO': 'Africa/Cairo',
            'JOHANNESBURG': 'Africa/Johannesburg',
            'SYDNEY': 'Australia/Sydney',
            'MELBOURNE': 'Australia/Melbourne',
            'AUCKLAND': 'Pacific/Auckland',
            'NEW_YORK': 'America/New_York',
            'LOS_ANGELES': 'America/Los_Angeles',
            'CHICAGO': 'America/Chicago',
            'TORONTO': 'America/Toronto',
            'SAO_PAULO': 'America/Sao_Paulo',
            'MEXICO_CITY': 'America/Mexico_City'
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
            description: 'Time commands - .time, .time world, .time zones',
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
        const timeInfo = `🇳🇬 *Lagos Time:* ${lagosTime.format('DD/MM/YYYY HH:mm:ss')}`;
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
            'NG': '🇳🇬', 'NIGERIA': '🇳🇬',
            'UAE': '🇦🇪', 'DUBAI': '🇦🇪',
            'SA': '🇸🇦', 'SAUDI': '🇸🇦',
            'KR': '🇰🇷', 'KOREA': '🇰🇷',
            'SG': '🇸🇬', 'SINGAPORE': '🇸🇬',
            'MY': '🇲🇾', 'MALAYSIA': '🇲🇾'
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