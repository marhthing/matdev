/**
 * MATDEV World Time Plugin
 * Extended time functionality with support for multiple countries and timezones
 */

const config = require('../config');
const axios = require('axios');
const moment = require('moment-timezone');

class WorldTimePlugin {
    constructor() {
        this.name = 'worldtime';
        this.description = 'World time and timezone information';
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

        console.log('✅ World Time plugin loaded');
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Override the existing time command with extended functionality
        this.bot.messageHandler.registerCommand('time', this.worldTimeCommand.bind(this), {
            description: 'Show world time for any country/city',
            usage: `${config.PREFIX}time [country/city code]`,
            category: 'utility',
            plugin: 'worldtime',
            source: 'worldtime.js'
        });

        // World clock command
        this.bot.messageHandler.registerCommand('worldclock', this.worldClockCommand.bind(this), {
            description: 'Show multiple world times at once',
            usage: `${config.PREFIX}worldclock`,
            category: 'utility',
            plugin: 'worldtime',
            source: 'worldtime.js'
        });

        // World clock alias
        this.bot.messageHandler.registerCommand('wc', this.worldClockCommand.bind(this), {
            description: 'Show multiple world times at once (alias for worldclock)',
            usage: `${config.PREFIX}wc`,
            category: 'utility',
            plugin: 'worldtime',
            source: 'worldtime.js'
        });

        // Timezone converter
        this.bot.messageHandler.registerCommand('timeconv', this.timeConverterCommand.bind(this), {
            description: 'Convert time between timezones',
            usage: `${config.PREFIX}timeconv <time> <from> <to>`,
            category: 'utility',
            plugin: 'worldtime',
            source: 'worldtime.js'
        });

        // List timezones
        this.bot.messageHandler.registerCommand('timezones', this.listTimezonesCommand.bind(this), {
            description: 'List available country codes and timezones',
            usage: `${config.PREFIX}timezones [search]`,
            category: 'utility',
            plugin: 'worldtime',
            source: 'worldtime.js'
        });

        // Time difference
        this.bot.messageHandler.registerCommand('timediff', this.timeDifferenceCommand.bind(this), {
            description: 'Calculate time difference between two locations',
            usage: `${config.PREFIX}timediff <location1> <location2>`,
            category: 'utility',
            plugin: 'worldtime',
            source: 'worldtime.js'
        });
    }

    /**
     * Extended world time command
     */
    async worldTimeCommand(messageInfo) {
        try {
            // If no arguments, show bot's default time (existing behavior)
            if (!messageInfo.args.length) {
                return await this.showBotTime(messageInfo);
            }

            const location = messageInfo.args[0].toUpperCase();
            const timezone = this.getTimezone(location);

            if (!timezone) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unknown location: *${location}*\n\n` +
                    `💡 Try using:\n` +
                    `• Country codes: US, UK, IN, JP, etc.\n` +
                    `• City names: LONDON, TOKYO, DUBAI, etc.\n\n` +
                    `Use *${config.PREFIX}timezones* to see all available codes.`
                );
                return;
            }

            const timeData = await this.getTimeForTimezone(timezone, location);
            await this.bot.messageHandler.reply(messageInfo, timeData);

        } catch (error) {
            console.error('Error in worldTimeCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting time information: ' + error.message);
        }
    }

    /**
     * Show bot's default time (original functionality)
     */
    async showBotTime(messageInfo) {
        const lagosTime = moment().tz(config.TIMEZONE);
        const utcTime = moment().utc();

        const timeInfo = `🕐 *Bot Time Information*\n\n` +
                        `🇳🇬 *Lagos Time:* ${lagosTime.format('DD/MM/YYYY HH:mm:ss')}\n` +
                        `🌍 *UTC Time:* ${utcTime.format('DD/MM/YYYY HH:mm:ss')}\n` +
                        `⏰ *Timezone:* ${config.TIMEZONE}\n` +
                        `📍 *Offset:* UTC${lagosTime.format('Z')}\n\n` +
                        `💡 *Usage:* ${config.PREFIX}time <country/city>\n` +
                        `*Example:* ${config.PREFIX}time UK\n\n` +
                        `_Use this time for scheduling messages_`;

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
     * Time converter command
     */
    async timeConverterCommand(messageInfo) {
        try {
            if (messageInfo.args.length < 3) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide time and locations.\n\n` +
                    `*Usage:* ${config.PREFIX}timeconv <time> <from> <to>\n` +
                    `*Example:* ${config.PREFIX}timeconv 15:30 UK US\n` +
                    `*Example:* ${config.PREFIX}timeconv "2:30 PM" TOKYO LONDON`
                );
                return;
            }

            const timeStr = messageInfo.args[0];
            const fromLocation = messageInfo.args[1].toUpperCase();
            const toLocation = messageInfo.args[2].toUpperCase();

            const fromTimezone = this.getTimezone(fromLocation);
            const toTimezone = this.getTimezone(toLocation);

            if (!fromTimezone) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Unknown source location: *${fromLocation}*`);
                return;
            }

            if (!toTimezone) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Unknown destination location: *${toLocation}*`);
                return;
            }

            // Parse time and convert
            const sourceTime = moment.tz(timeStr, 'HH:mm', fromTimezone);
            if (!sourceTime.isValid()) {
                // Try 12-hour format
                const sourceTime12 = moment.tz(timeStr, 'h:mm A', fromTimezone);
                if (!sourceTime12.isValid()) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Invalid time format. Use HH:mm or h:mm AM/PM');
                    return;
                }
                sourceTime = sourceTime12;
            }

            const convertedTime = sourceTime.clone().tz(toTimezone);

            const response = `🔄 *TIME CONVERSION*\n\n` +
                           `📍 *From:* ${fromLocation}\n` +
                           `⏰ *Time:* ${sourceTime.format('HH:mm (DD/MM)')}\n\n` +
                           `📍 *To:* ${toLocation}\n` +
                           `⏰ *Time:* ${convertedTime.format('HH:mm (DD/MM)')}\n\n` +
                           `⚡ *Difference:* ${this.getTimeDifference(sourceTime, convertedTime)}`;

            await this.bot.messageHandler.reply(messageInfo, response);

        } catch (error) {
            console.error('Error in timeConverterCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting time: ' + error.message);
        }
    }

    /**
     * List timezones command
     */
    async listTimezonesCommand(messageInfo) {
        try {
            const search = messageInfo.args[0]?.toUpperCase();
            let response = `🌍 *AVAILABLE TIMEZONES*\n\n`;

            if (search) {
                response += `🔍 *Search results for: ${search}*\n\n`;
                const filtered = Object.entries(this.countryTimezones)
                    .filter(([code, _]) => code.includes(search))
                    .slice(0, 15);

                if (filtered.length === 0) {
                    response += `❌ No timezones found matching "${search}"\n\n`;
                } else {
                    for (const [code, timezone] of filtered) {
                        const time = moment().tz(timezone).format('HH:mm');
                        response += `${code}: ${time}\n`;
                    }
                    response += `\n`;
                }
            } else {
                // Show popular ones
                response += `*🔥 Popular Countries:*\n`;
                const popular = ['US', 'UK', 'IN', 'JP', 'CN', 'DE', 'FR', 'CA', 'AU', 'BR', 'NG', 'UAE'];
                for (const code of popular) {
                    const timezone = this.countryTimezones[code];
                    const time = moment().tz(timezone).format('HH:mm');
                    response += `${code}: ${time}\n`;
                }
                response += `\n*💡 Total available:* ${Object.keys(this.countryTimezones).length} countries\n`;
            }

            response += `*Usage:* ${config.PREFIX}time <code>\n`;
            response += `*Search:* ${config.PREFIX}timezones <search>`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in listTimezonesCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing timezones: ' + error.message);
        }
    }

    /**
     * Time difference command
     */
    async timeDifferenceCommand(messageInfo) {
        try {
            if (messageInfo.args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide two locations.\n\n` +
                    `*Usage:* ${config.PREFIX}timediff <location1> <location2>\n` +
                    `*Example:* ${config.PREFIX}timediff UK US`
                );
                return;
            }

            const location1 = messageInfo.args[0].toUpperCase();
            const location2 = messageInfo.args[1].toUpperCase();

            const timezone1 = this.getTimezone(location1);
            const timezone2 = this.getTimezone(location2);

            if (!timezone1) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Unknown location: *${location1}*`);
                return;
            }

            if (!timezone2) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Unknown location: *${location2}*`);
                return;
            }

            const time1 = moment().tz(timezone1);
            const time2 = moment().tz(timezone2);

            const difference = time1.utcOffset() - time2.utcOffset();
            const diffHours = Math.abs(difference / 60);
            const ahead = difference > 0 ? location1 : location2;
            const behind = difference > 0 ? location2 : location1;

            const response = `⏰ *TIME DIFFERENCE*\n\n` +
                           `📍 *${location1}:* ${time1.format('HH:mm (DD/MM)')}\n` +
                           `📍 *${location2}:* ${time2.format('HH:mm (DD/MM)')}\n\n` +
                           `⚡ *Difference:* ${diffHours} hour${diffHours !== 1 ? 's' : ''}\n` +
                           `🔄 *${ahead}* is ${diffHours} hour${diffHours !== 1 ? 's' : ''} ahead of *${behind}*`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in timeDifferenceCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error calculating time difference: ' + error.message);
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

    /**
     * Calculate time difference between two moments
     */
    getTimeDifference(time1, time2) {
        const diff = Math.abs(time1.diff(time2, 'hours', true));
        if (diff < 1) {
            const minutes = Math.abs(time1.diff(time2, 'minutes'));
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        return `${Math.round(diff)} hour${Math.round(diff) !== 1 ? 's' : ''}`;
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new WorldTimePlugin();
        await plugin.init(bot);
        return plugin;
    }
};