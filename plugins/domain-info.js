
/**
 * MATDEV Domain/Website Info Plugin
 * Get WHOIS data and website analysis information
 */

const axios = require('axios');
const config = require('../config');

class DomainInfoPlugin {
    constructor() {
        this.name = 'domain-info';
        this.description = 'Get domain WHOIS data and website information';
        this.version = '1.0.0';
        this.enabled = true;
        
        // Free APIs for domain and website information
        this.apis = {
            whois: 'https://api.whoisjson.com/v1',
            siteInfo: 'https://api.websitecarbon.org/site',
            ssl: 'https://api.ssllabs.com/api/v3/analyze',
            httpStatus: 'https://httpstatus.io/api/v1/status'
        };
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            this.registerCommands();
            console.log('✅ Domain/Website Info plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Domain Info plugin:', error);
            return false;
        }
    }

    /**
     * Register commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('whois', this.whoisCommand.bind(this), {
            description: 'Get WHOIS information for a domain',
            usage: `${config.PREFIX}whois <domain>`,
            category: 'utility',
            plugin: 'domain-info',
            source: 'domain-info.js'
        });

        this.bot.messageHandler.registerCommand('siteinfo', this.siteInfoCommand.bind(this), {
            description: 'Get comprehensive website information',
            usage: `${config.PREFIX}siteinfo <domain/URL>`,
            category: 'utility',
            plugin: 'domain-info',
            source: 'domain-info.js'
        });

        this.bot.messageHandler.registerCommand('ssl', this.sslCheckCommand.bind(this), {
            description: 'Check SSL certificate information',
            usage: `${config.PREFIX}ssl <domain>`,
            category: 'utility',
            plugin: 'domain-info',
            source: 'domain-info.js'
        });
    }

    /**
     * Handle WHOIS command
     */
    async whoisCommand(messageInfo) {
        try {
            let domain = messageInfo.args.join(' ').trim();
            
            if (!domain) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a domain name.\n\nUsage: ${config.PREFIX}whois <domain>\n\nExamples:\n• ${config.PREFIX}whois google.com\n• ${config.PREFIX}whois github.com`);
                return;
            }

            // Clean and validate domain
            domain = this.extractDomain(domain);
            if (!this.isValidDomain(domain)) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a valid domain name.\n\nExample: ${config.PREFIX}whois google.com`);
                return;
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                `🔍 Looking up WHOIS data for: ${domain}\n\n⏳ Please wait...`);

            try {
                const whoisData = await this.getWhoisData(domain);
                
                if (whoisData) {
                    const formattedInfo = this.formatWhoisData(whoisData, domain);
                    
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: formattedInfo,
                        edit: processingMsg.key
                    });
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: `❌ Could not retrieve WHOIS data for ${domain}.\n\nPossible reasons:\n• Domain doesn't exist\n• WHOIS data is private/protected\n• Domain registrar doesn't provide public WHOIS`,
                        edit: processingMsg.key
                    });
                }

            } catch (apiError) {
                console.error('WHOIS API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Error retrieving WHOIS data: ${apiError.message}`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in WHOIS command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Handle site info command
     */
    async siteInfoCommand(messageInfo) {
        try {
            let input = messageInfo.args.join(' ').trim();
            
            if (!input) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a domain or URL.\n\nUsage: ${config.PREFIX}siteinfo <domain/URL>\n\nExamples:\n• ${config.PREFIX}siteinfo google.com\n• ${config.PREFIX}siteinfo https://github.com`);
                return;
            }

            const domain = this.extractDomain(input);
            const url = this.formatUrl(input);

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                `🔍 Analyzing website: ${domain}\n\n⏳ Gathering information...`);

            try {
                // Get multiple types of information
                const [basicInfo, httpStatus, sslInfo] = await Promise.allSettled([
                    this.getBasicSiteInfo(domain, url),
                    this.getHttpStatus(url),
                    this.getBasicSSLInfo(domain)
                ]);

                const formattedInfo = this.formatSiteInfo(domain, url, {
                    basic: basicInfo.status === 'fulfilled' ? basicInfo.value : null,
                    http: httpStatus.status === 'fulfilled' ? httpStatus.value : null,
                    ssl: sslInfo.status === 'fulfilled' ? sslInfo.value : null
                });

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: formattedInfo,
                    edit: processingMsg.key
                });

            } catch (apiError) {
                console.error('Site info API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Error analyzing website: ${apiError.message}`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in site info command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Handle SSL check command
     */
    async sslCheckCommand(messageInfo) {
        try {
            let domain = messageInfo.args.join(' ').trim();
            
            if (!domain) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a domain name.\n\nUsage: ${config.PREFIX}ssl <domain>\n\nExample: ${config.PREFIX}ssl google.com`);
                return;
            }

            domain = this.extractDomain(domain);
            if (!this.isValidDomain(domain)) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a valid domain name.\n\nExample: ${config.PREFIX}ssl google.com`);
                return;
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                `🔒 Checking SSL certificate for: ${domain}\n\n⏳ Please wait...`);

            try {
                const sslInfo = await this.getDetailedSSLInfo(domain);
                
                if (sslInfo) {
                    const formattedInfo = this.formatSSLInfo(sslInfo, domain);
                    
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: formattedInfo,
                        edit: processingMsg.key
                    });
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: `❌ Could not retrieve SSL information for ${domain}.\n\nPossible reasons:\n• Domain doesn't have SSL certificate\n• Domain is not accessible\n• SSL service is temporarily unavailable`,
                        edit: processingMsg.key
                    });
                }

            } catch (apiError) {
                console.error('SSL API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Error checking SSL certificate: ${apiError.message}`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in SSL command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Get WHOIS data for domain
     */
    async getWhoisData(domain) {
        try {
            // Try free WHOIS API
            const response = await axios.get(`${this.apis.whois}/${domain}`, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0.0'
                }
            });

            return response.data;

        } catch (error) {
            // Fallback to alternative free WHOIS service
            try {
                const fallbackResponse = await axios.get(`https://whoisjson.com/api/v1/whois/${domain}`, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0.0'
                    }
                });
                
                return fallbackResponse.data;
            } catch (fallbackError) {
                console.error('Both WHOIS services failed:', error.message, fallbackError.message);
                return null;
            }
        }
    }

    /**
     * Get basic site information
     */
    async getBasicSiteInfo(domain, url) {
        try {
            // Try to get basic HTTP headers and status
            const response = await axios.head(url, {
                timeout: 10000,
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            return {
                status: response.status,
                headers: response.headers,
                accessible: true
            };

        } catch (error) {
            return {
                status: error.response?.status || 'N/A',
                headers: error.response?.headers || {},
                accessible: false,
                error: error.message
            };
        }
    }

    /**
     * Get HTTP status information
     */
    async getHttpStatus(url) {
        try {
            const response = await axios.get(`${this.apis.httpStatus}/${encodeURIComponent(url)}`, {
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error('HTTP status API error:', error);
            return null;
        }
    }

    /**
     * Get basic SSL information
     */
    async getBasicSSLInfo(domain) {
        try {
            const response = await axios.get(`https://${domain}`, {
                timeout: 10000,
                httpsAgent: new (require('https').Agent)({
                    rejectUnauthorized: false
                })
            });

            return {
                hasSSL: true,
                accessible: true
            };

        } catch (error) {
            return {
                hasSSL: false,
                accessible: false,
                error: error.message
            };
        }
    }

    /**
     * Get detailed SSL information
     */
    async getDetailedSSLInfo(domain) {
        try {
            // Use a simple SSL checker
            const response = await axios.get(`https://api.ssllabs.com/api/v3/analyze?host=${domain}&publish=off&startNew=on&all=done`, {
                timeout: 30000
            });

            return response.data;

        } catch (error) {
            console.error('Detailed SSL check error:', error);
            return null;
        }
    }

    /**
     * Format WHOIS data for display
     */
    formatWhoisData(data, domain) {
        let result = `🔍 *WHOIS Information*\n\n`;
        result += `🌐 *Domain:* ${domain}\n\n`;

        if (data.domain_name) {
            result += `📝 *Domain Name:* ${data.domain_name}\n`;
        }

        if (data.registrar) {
            result += `🏢 *Registrar:* ${data.registrar}\n`;
        }

        if (data.creation_date) {
            result += `📅 *Created:* ${new Date(data.creation_date).toLocaleDateString()}\n`;
        }

        if (data.expiration_date) {
            result += `⏰ *Expires:* ${new Date(data.expiration_date).toLocaleDateString()}\n`;
        }

        if (data.updated_date) {
            result += `🔄 *Updated:* ${new Date(data.updated_date).toLocaleDateString()}\n`;
        }

        if (data.name_servers && data.name_servers.length > 0) {
            result += `🌐 *Name Servers:*\n`;
            data.name_servers.slice(0, 4).forEach(ns => {
                result += `   • ${ns}\n`;
            });
        }

        if (data.status && data.status.length > 0) {
            result += `📊 *Status:* ${data.status[0]}\n`;
        }

        result += `\n_WHOIS lookup by ${config.BOT_NAME}_`;

        return result;
    }

    /**
     * Format site information for display
     */
    formatSiteInfo(domain, url, info) {
        let result = `🌐 *Website Information*\n\n`;
        result += `🔗 *Domain:* ${domain}\n`;
        result += `📡 *URL:* ${url}\n\n`;

        if (info.basic) {
            result += `📊 *HTTP Status:* ${info.basic.status}\n`;
            result += `✅ *Accessible:* ${info.basic.accessible ? 'Yes' : 'No'}\n`;
            
            if (info.basic.headers.server) {
                result += `⚙️ *Server:* ${info.basic.headers.server}\n`;
            }

            if (info.basic.headers['content-type']) {
                result += `📄 *Content Type:* ${info.basic.headers['content-type']}\n`;
            }
        }

        if (info.ssl) {
            result += `🔒 *SSL:* ${info.ssl.hasSSL ? 'Enabled' : 'Disabled'}\n`;
        }

        if (info.basic && info.basic.headers['last-modified']) {
            result += `🕐 *Last Modified:* ${new Date(info.basic.headers['last-modified']).toLocaleDateString()}\n`;
        }

        result += `📅 *Checked:* ${new Date().toLocaleString()}\n`;
        result += `\n_Website analysis by ${config.BOT_NAME}_`;

        return result;
    }

    /**
     * Format SSL information for display
     */
    formatSSLInfo(data, domain) {
        let result = `🔒 *SSL Certificate Information*\n\n`;
        result += `🌐 *Domain:* ${domain}\n\n`;

        if (data.endpoints && data.endpoints.length > 0) {
            const endpoint = data.endpoints[0];
            result += `📊 *Grade:* ${endpoint.grade || 'N/A'}\n`;
            result += `✅ *Has Warnings:* ${endpoint.hasWarnings ? 'Yes' : 'No'}\n`;
            
            if (endpoint.details) {
                const cert = endpoint.details.cert;
                if (cert) {
                    result += `📄 *Issuer:* ${cert.issuerLabel || 'N/A'}\n`;
                    result += `📅 *Valid From:* ${new Date(cert.notBefore).toLocaleDateString()}\n`;
                    result += `⏰ *Valid Until:* ${new Date(cert.notAfter).toLocaleDateString()}\n`;
                    result += `🔐 *Algorithm:* ${cert.sigAlg || 'N/A'}\n`;
                }
            }
        }

        result += `📅 *Checked:* ${new Date().toLocaleString()}\n`;
        result += `\n_SSL analysis by ${config.BOT_NAME}_`;

        return result;
    }

    /**
     * Extract domain from URL or input
     */
    extractDomain(input) {
        try {
            // Remove protocol if present
            input = input.replace(/^https?:\/\//, '');
            // Remove www. if present
            input = input.replace(/^www\./, '');
            // Remove path and query parameters
            input = input.split('/')[0].split('?')[0];
            // Remove port if present
            input = input.split(':')[0];
            
            return input.toLowerCase();
        } catch (error) {
            return input.toLowerCase();
        }
    }

    /**
     * Format input to proper URL
     */
    formatUrl(input) {
        if (!input.match(/^https?:\/\//)) {
            return 'https://' + input;
        }
        return input;
    }

    /**
     * Validate domain format
     */
    isValidDomain(domain) {
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
        return domainRegex.test(domain);
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Domain/Website Info plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new DomainInfoPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
