/**
 * MATDEV Waifu Generator Plugin
 * Generate high-quality anime waifu images using free APIs
 */

const config = require('../config');
const axios = require('axios');

class WaifuPlugin {
    constructor() {
        this.name = 'waifu';
        this.description = 'Anime waifu image generator';
        this.version = '1.0.0';
        
        // Free waifu APIs (SFW and NSFW)
        this.apis = {
            sfw: [
                {
                    name: 'waifu.im',
                    url: 'https://api.waifu.im/search',
                    type: 'database',
                    tags: ['waifu', 'maid', 'marin-kitagawa', 'mori-calliope', 'raiden-shogun']
                },
                {
                    name: 'waifu.pics',
                    url: 'https://api.waifu.pics/sfw/waifu',
                    type: 'simple'
                },
                {
                    name: 'nekos.best',
                    url: 'https://nekos.best/api/v2/waifu',
                    type: 'nekos'
                }
            ],
            nsfw: [
                {
                    name: 'waifu.im',
                    url: 'https://api.waifu.im/search',
                    type: 'database',
                    tags: ['oppai', 'ass', 'hentai', 'milf', 'oral', 'paizuri', 'ecchi']
                },
                {
                    name: 'waifu.pics',
                    url: 'https://api.waifu.pics/nsfw/waifu',
                    type: 'simple'
                },
                {
                    name: 'nekos.best',
                    url: 'https://nekos.best/api/v2/hentai',
                    type: 'nekos'
                }
            ]
        };
        
        // Image categories
        this.categories = {
            'sfw': ['waifu', 'maid', 'school'],
            'cute': ['neko', 'kitsune', 'elf'],
            'aesthetic': ['uniform', 'dress', 'kimono'],
            'popular': ['marin-kitagawa', 'mori-calliope', 'raiden-shogun'],
            'boobs': ['oppai', 'paizuri', 'ecchi'],
            'nsfw': ['hentai', 'ass', 'milf', 'oral'],
            'lewd': ['oppai', 'ecchi', 'hentai']
        };
        
        // Request tracking for rate limiting
        this.requestCount = 0;
        this.lastReset = Date.now();
        this.maxRequests = 20; // per hour
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        console.log('✅ Waifu Generator plugin loaded');
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Generate waifu
        this.bot.messageHandler.registerCommand('waifu', this.generateWaifuCommand.bind(this), {
            description: 'Generate random anime waifu image',
            usage: `${config.PREFIX}waifu [category]`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });

        // Generate multiple waifus
        this.bot.messageHandler.registerCommand('waifus', this.generateMultipleWaifusCommand.bind(this), {
            description: 'Generate multiple waifu images (2-5)',
            usage: `${config.PREFIX}waifus [count]`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });

        // Search waifu by tag
        this.bot.messageHandler.registerCommand('searchwaifu', this.searchWaifuCommand.bind(this), {
            description: 'Search waifu by specific tag',
            usage: `${config.PREFIX}searchwaifu <tag>`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });

        // List waifu categories
        this.bot.messageHandler.registerCommand('waifucats', this.listCategoriesCommand.bind(this), {
            description: 'List available waifu categories and tags',
            usage: `${config.PREFIX}waifucats`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });

        // Random neko
        this.bot.messageHandler.registerCommand('neko', this.generateNekoCommand.bind(this), {
            description: 'Generate random neko girl image',
            usage: `${config.PREFIX}neko`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });

        // Waifu info/stats
        this.bot.messageHandler.registerCommand('waifustats', this.statsCommand.bind(this), {
            description: 'Show waifu generator statistics',
            usage: `${config.PREFIX}waifustats`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });
    }

    /**
     * Generate waifu command
     */
    async generateWaifuCommand(messageInfo) {
        try {
            if (!this.checkRateLimit()) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '⏰ Rate limit reached! Please wait before generating more waifus.\n\n' +
                    `🔄 Limit resets every hour (${this.maxRequests} requests per hour)`
                );
                return;
            }

            const category = messageInfo.args[0]?.toLowerCase();
            const tag = this.getRandomTag(category);

            await this.bot.messageHandler.reply(messageInfo, '🎨 Generating your anime waifu... ✨');

            const waifuData = await this.fetchWaifu(tag);
            
            if (!waifuData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to generate waifu. Try again!\n\n' +
                    `💡 Use *${config.PREFIX}waifucats* to see available categories.`
                );
                return;
            }

            await this.sendWaifu(messageInfo, waifuData, category);

        } catch (error) {
            console.error('Error in generateWaifuCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error generating waifu: ' + error.message);
        }
    }

    /**
     * Generate multiple waifus command
     */
    async generateMultipleWaifusCommand(messageInfo) {
        try {
            let count = parseInt(messageInfo.args[0]) || 3;
            count = Math.max(2, Math.min(5, count)); // Limit between 2-5

            if (!this.checkRateLimit(count)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `⏰ Not enough requests remaining for ${count} waifus!\n\n` +
                    `🔄 You have ${this.getRemainingRequests()} requests left this hour.`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, `🎨 Generating ${count} anime waifus... ✨`);

            const waifus = [];
            for (let i = 0; i < count; i++) {
                const tag = this.getRandomTag();
                const waifu = await this.fetchWaifu(tag);
                if (waifu) {
                    waifus.push(waifu);
                }
                // Small delay between requests to be respectful
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (waifus.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to generate any waifus. Try again!');
                return;
            }

            // Send all waifus
            for (let i = 0; i < waifus.length; i++) {
                const waifu = waifus[i];
                await this.sendWaifu(messageInfo, waifu, null, `${i + 1}/${waifus.length}`);
                // Delay between sending to avoid flooding
                if (i < waifus.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Generated ${waifus.length}/${count} waifus successfully! 🎉`
            );

        } catch (error) {
            console.error('Error in generateMultipleWaifusCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error generating multiple waifus: ' + error.message);
        }
    }

    /**
     * Search waifu command
     */
    async searchWaifuCommand(messageInfo) {
        try {
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a search tag.\n\n` +
                    `*Usage:* ${config.PREFIX}searchwaifu <tag>\n` +
                    `*Example:* ${config.PREFIX}searchwaifu maid\n\n` +
                    `Use *${config.PREFIX}waifucats* to see available tags.`
                );
                return;
            }

            if (!this.checkRateLimit()) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '⏰ Rate limit reached! Please wait before searching waifus.'
                );
                return;
            }

            const searchTag = messageInfo.args[0].toLowerCase();
            
            await this.bot.messageHandler.reply(messageInfo, `🔍 Searching for *${searchTag}* waifus... ✨`);

            const waifuData = await this.fetchWaifu(searchTag);
            
            if (!waifuData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ No waifus found for tag: *${searchTag}*\n\n` +
                    `💡 Try different tags or use *${config.PREFIX}waifucats* for available options.`
                );
                return;
            }

            await this.sendWaifu(messageInfo, waifuData, searchTag);

        } catch (error) {
            console.error('Error in searchWaifuCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error searching waifu: ' + error.message);
        }
    }

    /**
     * Generate neko command
     */
    async generateNekoCommand(messageInfo) {
        try {
            if (!this.checkRateLimit()) {
                await this.bot.messageHandler.reply(messageInfo, '⏰ Rate limit reached! Please wait before generating nekos.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🐱 Generating your neko waifu... ✨');

            const nekoData = await this.fetchNeko();
            
            if (!nekoData) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to generate neko. Try again!');
                return;
            }

            await this.sendWaifu(messageInfo, nekoData, 'neko');

        } catch (error) {
            console.error('Error in generateNekoCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error generating neko: ' + error.message);
        }
    }

    /**
     * List categories command
     */
    async listCategoriesCommand(messageInfo) {
        try {
            let response = '*🎨 WAIFU CATEGORIES & TAGS*\n\n';
            
            for (const [category, tags] of Object.entries(this.categories)) {
                response += `*${category.toUpperCase()}:* ${tags.join(', ')}\n`;
            }

            response += `\n*📊 AVAILABLE COMMANDS:*\n`;
            response += `${config.PREFIX}waifu [category] - Generate random waifu\n`;
            response += `${config.PREFIX}waifus [2-5] - Generate multiple waifus\n`;
            response += `${config.PREFIX}searchwaifu <tag> - Search by specific tag\n`;
            response += `${config.PREFIX}neko - Generate neko girl\n\n`;
            response += `*⚡ Rate Limit:* ${this.maxRequests} requests per hour\n`;
            response += `*🔄 Remaining:* ${this.getRemainingRequests()} requests\n\n`;
            response += `*Example:* ${config.PREFIX}waifu cute`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in listCategoriesCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing categories: ' + error.message);
        }
    }

    /**
     * Stats command
     */
    async statsCommand(messageInfo) {
        try {
            const uptime = Date.now() - this.lastReset;
            const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
            const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

            const response = `*📊 WAIFU GENERATOR STATS*\n\n` +
                           `*🎨 SFW APIs:* ${this.apis.sfw.length}\n` +
                           `*🔞 NSFW APIs:* ${this.apis.nsfw.length}\n` +
                           `*🏷️ Categories:* ${Object.keys(this.categories).length}\n` +
                           `*📋 Total Tags:* ${Object.values(this.categories).flat().length}\n\n` +
                           `*⚡ RATE LIMITING:*\n` +
                           `*Requests Used:* ${this.requestCount}/${this.maxRequests}\n` +
                           `*Remaining:* ${this.getRemainingRequests()}\n` +
                           `*Reset Time:* ${uptimeHours}h ${uptimeMinutes}m ago\n\n` +
                           `*🔗 SOURCES:*\n` +
                           `• waifu.im - SFW/NSFW database\n` +
                           `• waifu.pics - SFW/NSFW collection\n` +
                           `• nekos.best - Waifu/Hentai specialists\n\n` +
                           `*🔞 NSFW CATEGORIES:*\n` +
                           `• boobs, nsfw, lewd\n\n` +
                           `*Usage:* ${config.PREFIX}waifu [category]\n` +
                           `*Example:* ${config.PREFIX}waifu boobs`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in statsCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting stats: ' + error.message);
        }
    }

    /**
     * Fetch waifu from APIs
     */
    async fetchWaifu(tag = null) {
        try {
            // Reset rate limit counter if an hour has passed
            if (Date.now() - this.lastReset > 3600000) {
                this.requestCount = 0;
                this.lastReset = Date.now();
            }

            this.requestCount++;

            // Determine if request is NSFW
            const isNSFW = this.isNSFWTag(tag);
            const apiList = isNSFW ? this.apis.nsfw : this.apis.sfw;

            // Try waifu.im first (best quality)
            try {
                const params = {};
                if (tag && apiList[0].tags.includes(tag)) {
                    params.included_tags = tag;
                }
                if (isNSFW) {
                    params.is_nsfw = true;
                }
                
                const response = await axios.get(apiList[0].url, {
                    params,
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0'
                    }
                });

                if (response.data && response.data.images && response.data.images.length > 0) {
                    const image = response.data.images[0];
                    return {
                        url: image.url,
                        source: 'waifu.im',
                        tags: image.tags || [],
                        artist: image.artist || 'Unknown',
                        nsfw: isNSFW
                    };
                }
            } catch (error) {
                console.log('waifu.im failed, trying next API...');
            }

            // Try waifu.pics as fallback
            try {
                const response = await axios.get(apiList[1].url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0'
                    }
                });

                if (response.data && response.data.url) {
                    return {
                        url: response.data.url,
                        source: 'waifu.pics',
                        tags: [tag || (isNSFW ? 'hentai' : 'waifu')],
                        artist: 'Unknown',
                        nsfw: isNSFW
                    };
                }
            } catch (error) {
                console.log('waifu.pics failed, trying next API...');
            }

            // Try nekos.best
            try {
                const response = await axios.get(apiList[2].url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0'
                    }
                });

                if (response.data && response.data.results && response.data.results.length > 0) {
                    const result = response.data.results[0];
                    return {
                        url: result.url,
                        source: 'nekos.best',
                        tags: [isNSFW ? 'hentai' : 'waifu'],
                        artist: result.artist_name || 'Unknown',
                        nsfw: isNSFW
                    };
                }
            } catch (error) {
                console.log('nekos.best failed, all APIs exhausted');
            }

            return null;
        } catch (error) {
            console.error('Error fetching waifu:', error);
            return null;
        }
    }

    /**
     * Fetch neko specifically
     */
    async fetchNeko() {
        try {
            this.requestCount++;

            const response = await axios.get('https://nekos.best/api/v2/neko', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0'
                }
            });

            if (response.data && response.data.results && response.data.results.length > 0) {
                const result = response.data.results[0];
                return {
                    url: result.url,
                    source: 'nekos.best',
                    tags: ['neko'],
                    artist: result.artist_name || 'Unknown'
                };
            }

            return null;
        } catch (error) {
            console.error('Error fetching neko:', error);
            return null;
        }
    }

    /**
     * Send waifu image to chat
     */
    async sendWaifu(messageInfo, waifuData, category = null, counter = null) {
        try {
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                image: { url: waifuData.url }
            });

        } catch (error) {
            console.error('Error sending waifu:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Waifu generated successfully! 🎉\n\n` +
                `🔗 *Direct Link:* ${waifuData.url}`
            );
        }
    }

    /**
     * Get random tag based on category
     */
    getRandomTag(category = null) {
        if (category && this.categories[category]) {
            const tags = this.categories[category];
            return tags[Math.floor(Math.random() * tags.length)];
        }

        // Get random tag from SFW categories only
        const sfwCategories = ['sfw', 'cute', 'aesthetic', 'popular'];
        const sfwTags = sfwCategories.map(cat => this.categories[cat] || []).flat();
        return sfwTags[Math.floor(Math.random() * sfwTags.length)];
    }

    /**
     * Check if a tag is NSFW
     */
    isNSFWTag(tag) {
        if (!tag) return false;
        
        const nsfwCategories = ['boobs', 'nsfw', 'lewd'];
        const nsfwTags = nsfwCategories.map(cat => this.categories[cat] || []).flat();
        
        return nsfwTags.includes(tag.toLowerCase()) || 
               ['oppai', 'hentai', 'ass', 'milf', 'oral', 'paizuri', 'ecchi', 'boobs'].includes(tag.toLowerCase());
    }

    /**
     * Check rate limit
     */
    checkRateLimit(requestCount = 1) {
        // Reset counter if an hour has passed
        if (Date.now() - this.lastReset > 3600000) {
            this.requestCount = 0;
            this.lastReset = Date.now();
        }

        return (this.requestCount + requestCount) <= this.maxRequests;
    }

    /**
     * Get remaining requests
     */
    getRemainingRequests() {
        if (Date.now() - this.lastReset > 3600000) {
            return this.maxRequests;
        }
        return Math.max(0, this.maxRequests - this.requestCount);
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new WaifuPlugin();
        await plugin.init(bot);
        return plugin;
    }
};