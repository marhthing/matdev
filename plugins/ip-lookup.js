
/**
 * MATDEV IP Lookup Plugin
 * Get detailed information about IP addresses
 */

const axios = require('axios');
const config = require('../config');

class IPLookupPlugin {
    constructor() {
        this.name = 'ip-lookup';
        this.description = 'Get detailed information about IP addresses';
        this.version = '1.0.0';
        this.enabled = true;
        
        // Free IP lookup APIs
        this.apis = [
            {
                name: 'ipapi.co',
                url: 'https://ipapi.co',
                format: (ip) => `${ip}/json`
            },
            {
                name: 'ip-api.com',
                url: 'http://ip-api.com/json',
                format: (ip) => `/${ip}`
            },
            {
                name: 'ipinfo.io',
                url: 'https://ipinfo.io',
                format: (ip) => `/${ip}/json`
            }
        ];
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            this.registerCommands();
            console.log('✅ IP Lookup plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize IP Lookup plugin:', error);
            return false;
        }
    }

    /**
     * Register commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('ip', this.ipLookupCommand.bind(this), {
            description: 'Get detailed information about an IP address',
            usage: `${config.PREFIX}ip <IP address>`,
            category: 'utility',
            plugin: 'ip-lookup',
            source: 'ip-lookup.js'
        });

        this.bot.messageHandler.registerCommand('myip', this.myIpCommand.bind(this), {
            description: 'Get your public IP address information',
            usage: `${config.PREFIX}myip`,
            category: 'utility',
            plugin: 'ip-lookup',
            source: 'ip-lookup.js'
        });

        this.bot.messageHandler.registerCommand('iplookup', this.ipLookupCommand.bind(this), {
            description: 'Get detailed information about an IP address (alias)',
            usage: `${config.PREFIX}iplookup <IP address>`,
            category: 'utility',
            plugin: 'ip-lookup',
            source: 'ip-lookup.js'
        });
    }

    /**
     * Handle IP lookup command
     */
    async ipLookupCommand(messageInfo) {
        try {
            let ip = messageInfo.args.join(' ').trim();
            
            // Check if it's a reply to a message with IP
            if (!ip && messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const quotedText = this.extractTextFromQuoted(messageInfo.message.extendedTextMessage.contextInfo.quotedMessage);
                if (quotedText) {
                    ip = quotedText.trim();
                }
            }
            
            if (!ip) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide an IP address.\n\nUsage: ${config.PREFIX}ip <IP address>\n\nExamples:\n• ${config.PREFIX}ip 8.8.8.8\n• ${config.PREFIX}ip 1.1.1.1\n• ${config.PREFIX}myip (for your IP)`);
                return;
            }

            // Validate IP address
            if (!this.isValidIP(ip)) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a valid IP address.\n\nExample: ${config.PREFIX}ip 8.8.8.8`);
                return;
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                `🔍 Looking up information for IP: ${ip}\n\n⏳ Please wait...`);

            try {
                const ipData = await this.getIPInfo(ip);
                
                if (ipData) {
                    const formattedInfo = this.formatIPInfo(ipData, ip);
                    
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: formattedInfo,
                        edit: processingMsg.key
                    });
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: `❌ Could not retrieve information for IP: ${ip}\n\nPossible reasons:\n• IP address is private/local\n• IP address is invalid\n• Lookup service is temporarily unavailable`,
                        edit: processingMsg.key
                    });
                }

            } catch (apiError) {
                console.error('IP lookup API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Error looking up IP information: ${apiError.message}`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in IP lookup command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Handle my IP command
     */
    async myIpCommand(messageInfo) {
        try {
            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                `🔍 Getting your public IP information...\n\n⏳ Please wait...`);

            try {
                // Get the user's public IP first
                const myIpData = await this.getMyIP();
                
                if (myIpData && myIpData.ip) {
                    // Then get detailed information about that IP
                    const ipInfo = await this.getIPInfo(myIpData.ip);
                    
                    if (ipInfo) {
                        const formattedInfo = this.formatIPInfo(ipInfo, myIpData.ip, true);
                        
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: formattedInfo,
                            edit: processingMsg.key
                        });
                    } else {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: `🌐 *Your Public IP:* ${myIpData.ip}\n\n❌ Could not retrieve detailed information about your IP.`,
                            edit: processingMsg.key
                        });
                    }
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Could not determine your public IP address.\n\nThis might be due to network restrictions or service unavailability.',
                        edit: processingMsg.key
                    });
                }

            } catch (apiError) {
                console.error('My IP API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Error getting your IP information: ${apiError.message}`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in my IP command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Get IP information using multiple APIs as fallback
     */
    async getIPInfo(ip) {
        for (const api of this.apis) {
            try {
                console.log(`🔍 Trying ${api.name} for IP lookup of ${ip}`);
                
                const url = api.url + api.format(ip);
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0.0'
                    }
                });
                
                if (response.data && !response.data.error) {
                    console.log(`✅ IP information retrieved successfully using ${api.name}`);
                    return { ...response.data, source: api.name };
                }
                
            } catch (error) {
                console.error(`❌ ${api.name} failed:`, error.message);
                continue;
            }
        }
        
        return null;
    }

    /**
     * Get user's public IP address
     */
    async getMyIP() {
        const ipServices = [
            'https://api.ipify.org?format=json',
            'https://ipapi.co/json',
            'https://ipinfo.io/json'
        ];
        
        for (const service of ipServices) {
            try {
                const response = await axios.get(service, {
                    timeout: 8000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0.0'
                    }
                });
                
                if (response.data && (response.data.ip || response.data.query)) {
                    return { ip: response.data.ip || response.data.query };
                }
                
            } catch (error) {
                console.error(`IP service ${service} failed:`, error.message);
                continue;
            }
        }
        
        return null;
    }

    /**
     * Format IP information for display
     */
    formatIPInfo(data, ip, isMyIP = false) {
        let result = `🌐 *${isMyIP ? 'Your Public ' : ''}IP Information*\n\n`;
        result += `📍 *IP Address:* ${ip}\n\n`;

        // Location information
        if (data.country || data.country_name) {
            result += `🏳️ *Country:* ${data.country_name || data.country}`;
            if (data.country_code || data.countryCode) {
                result += ` (${data.country_code || data.countryCode})`;
            }
            result += '\n';
        }

        if (data.region || data.regionName) {
            result += `🗺️ *Region:* ${data.region || data.regionName}\n`;
        }

        if (data.city) {
            result += `🏙️ *City:* ${data.city}\n`;
        }

        if (data.postal || data.zip) {
            result += `📮 *Postal Code:* ${data.postal || data.zip}\n`;
        }

        // Coordinates
        if (data.latitude || data.lat) {
            result += `📍 *Coordinates:* ${data.latitude || data.lat}, ${data.longitude || data.lon}\n`;
        }

        // ISP and network information
        if (data.isp || data.org) {
            result += `🌐 *ISP:* ${data.isp || data.org}\n`;
        }

        if (data.as || data.asn) {
            result += `🔢 *ASN:* ${data.as || data.asn}\n`;
        }

        // Timezone
        if (data.timezone) {
            result += `🕐 *Timezone:* ${data.timezone}\n`;
        }

        // Security information
        if (data.proxy !== undefined) {
            result += `🛡️ *Proxy:* ${data.proxy ? 'Yes' : 'No'}\n`;
        }

        if (data.hosting !== undefined) {
            result += `🏢 *Hosting:* ${data.hosting ? 'Yes' : 'No'}\n`;
        }

        // IP type
        if (data.type) {
            result += `📊 *Type:* ${data.type}\n`;
        }

        // Mobile detection
        if (data.mobile !== undefined) {
            result += `📱 *Mobile:* ${data.mobile ? 'Yes' : 'No'}\n`;
        }

        result += `\n📅 *Looked up:* ${new Date().toLocaleString()}\n`;
        
        if (data.source) {
            result += `📡 *Source:* ${data.source}\n`;
        }

        result += `\n_IP lookup by ${config.BOT_NAME}_`;

        return result;
    }

    /**
     * Validate IP address format (IPv4 and IPv6)
     */
    isValidIP(ip) {
        // IPv4 regex
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        
        // IPv6 regex (simplified)
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
        
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
    }

    /**
     * Extract text from quoted message
     */
    extractTextFromQuoted(quotedMessage) {
        if (!quotedMessage) return null;
        
        const messageTypes = Object.keys(quotedMessage);
        for (const type of messageTypes) {
            const content = quotedMessage[type];
            if (typeof content === 'string') {
                return content;
            } else if (content?.text) {
                return content.text;
            } else if (content?.caption) {
                return content.caption;
            }
        }
        
        return null;
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 IP Lookup plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new IPLookupPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
