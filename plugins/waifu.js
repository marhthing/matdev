
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
            // SFW Categories
            'sfw': ['waifu', 'maid', 'school'],
            'cute': ['neko', 'kitsune', 'elf'],
            'aesthetic': ['uniform', 'dress', 'kimono'],
            'popular': ['marin-kitagawa', 'mori-calliope', 'raiden-shogun'],
            
            // NSFW Categories - Comprehensive list
            'boobs': ['oppai', 'paizuri', 'ecchi'],
            'nsfw': ['hentai', 'ass', 'milf', 'oral'],
            'lewd': ['oppai', 'ecchi', 'hentai'],
            'uniform': ['hentai', 'ecchi', 'oppai'],
            'pussy': ['hentai', 'ecchi', 'milf'],
            'bikini': ['ecchi', 'oppai', 'hentai'],
            'panties': ['ecchi', 'hentai', 'oppai'],
            'lingerie': ['ecchi', 'oppai', 'hentai'],
            'nude': ['hentai', 'oppai', 'ecchi'],
            'naked': ['hentai', 'oppai', 'ecchi'],
            'ass': ['ass', 'hentai', 'ecchi'],
            'butt': ['ass', 'hentai', 'ecchi'],
            'thicc': ['ass', 'oppai', 'hentai'],
            'thick': ['ass', 'oppai', 'hentai'],
            'milf': ['milf', 'oppai', 'hentai'],
            'mom': ['milf', 'oppai', 'hentai'],
            'mature': ['milf', 'hentai', 'oppai'],
            'oral': ['oral', 'hentai', 'ecchi'],
            'blowjob': ['oral', 'hentai', 'ecchi'],
            'bj': ['oral', 'hentai', 'ecchi'],
            'paizuri': ['paizuri', 'oppai', 'hentai'],
            'titjob': ['paizuri', 'oppai', 'hentai'],
            'school': ['hentai', 'ecchi', 'oppai'],
            'schoolgirl': ['hentai', 'ecchi', 'oppai'],
            'student': ['hentai', 'ecchi', 'oppai'],
            'teacher': ['milf', 'hentai', 'oppai'],
            'nurse': ['hentai', 'ecchi', 'oppai'],
            'maid': ['hentai', 'ecchi', 'oppai'],
            'bunny': ['ecchi', 'hentai', 'oppai'],
            'catgirl': ['hentai', 'ecchi', 'oppai'],
            'neko': ['hentai', 'ecchi', 'oppai'],
            'demon': ['hentai', 'ecchi', 'oppai'],
            'angel': ['hentai', 'ecchi', 'oppai'],
            'elf': ['hentai', 'ecchi', 'oppai'],
            'witch': ['hentai', 'ecchi', 'oppai'],
            'vampire': ['hentai', 'ecchi', 'oppai'],
            'swimsuit': ['ecchi', 'oppai', 'hentai'],
            'beach': ['ecchi', 'oppai', 'hentai'],
            'summer': ['ecchi', 'oppai', 'hentai'],
            'shower': ['hentai', 'ecchi', 'oppai'],
            'bath': ['hentai', 'ecchi', 'oppai'],
            'wet': ['hentai', 'ecchi', 'oppai'],
            'loli': ['hentai', 'ecchi', 'oppai'],
            'young': ['hentai', 'ecchi', 'oppai'],
            'teen': ['hentai', 'ecchi', 'oppai'],
            'ahegao': ['hentai', 'ecchi', 'oral'],
            'cumshot': ['hentai', 'oral', 'ecchi'],
            'creampie': ['hentai', 'ecchi', 'oppai'],
            'gangbang': ['hentai', 'oral', 'ecchi'],
            'group': ['hentai', 'oral', 'ecchi'],
            'threesome': ['hentai', 'oral', 'ecchi'],
            'lesbian': ['hentai', 'ecchi', 'oppai'],
            'yuri': ['hentai', 'ecchi', 'oppai'],
            'futanari': ['hentai', 'ecchi', 'oppai'],
            'futa': ['hentai', 'ecchi', 'oppai'],
            'trap': ['hentai', 'ecchi', 'oppai'],
            'femboy': ['hentai', 'ecchi', 'oppai'],
            'tentacle': ['hentai', 'ecchi', 'oppai'],
            'monster': ['hentai', 'ecchi', 'oppai'],
            'bdsm': ['hentai', 'ecchi', 'oppai'],
            'bondage': ['hentai', 'ecchi', 'oppai'],
            'domination': ['hentai', 'ecchi', 'oppai'],
            'submissive': ['hentai', 'ecchi', 'oppai']
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
        // Generate SFW waifu
        this.bot.messageHandler.registerCommand('waifu', this.generateWaifuCommand.bind(this), {
            description: 'Generate SFW anime waifu image',
            usage: `${config.PREFIX}waifu [category]`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });

        // Generate NSFW waifu
        this.bot.messageHandler.registerCommand('nsfw', this.generateNSFWCommand.bind(this), {
            description: 'Generate NSFW anime waifu image',
            usage: `${config.PREFIX}nsfw [category]`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });
    }

    /**
     * Generate SFW waifu command
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
            const tag = this.getSFWTag(category);

            await this.bot.messageHandler.reply(messageInfo, '🎨 Generating your anime waifu... ✨');

            const waifuData = await this.fetchWaifu(tag, false);
            
            if (!waifuData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to generate waifu. Try again!\n\n' +
                    `💡 Available SFW categories: sfw, cute, aesthetic, popular`
                );
                return;
            }

            await this.sendWaifu(messageInfo, waifuData);

        } catch (error) {
            console.error('Error in generateWaifuCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error generating waifu: ' + error.message);
        }
    }

    /**
     * Generate NSFW waifu command
     */
    async generateNSFWCommand(messageInfo) {
        try {
            if (!this.checkRateLimit()) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '⏰ Rate limit reached! Please wait before generating more waifus.\n\n' +
                    `🔄 Limit resets every hour (${this.maxRequests} requests per hour)`
                );
                return;
            }

            const category = messageInfo.args[0]?.toLowerCase();
            const tag = this.getNSFWTag(category);

            await this.bot.messageHandler.reply(messageInfo, '🔞 Generating your NSFW waifu... ✨');

            const waifuData = await this.fetchWaifu(tag, true);
            
            if (!waifuData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to generate NSFW waifu. Try again!\n\n' +
                    `💡 Popular NSFW categories: boobs, pussy, bikini, uniform, panties, lingerie, nude, ass, thicc, milf, oral, schoolgirl, nurse, maid, catgirl, swimsuit, shower, ahegao, lesbian, futanari, tentacle, bdsm\n\n` +
                    `🔞 Use: .nsfw [category] - Example: .nsfw uniform`
                );
                return;
            }

            await this.sendWaifu(messageInfo, waifuData);

        } catch (error) {
            console.error('Error in generateNSFWCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error generating NSFW waifu: ' + error.message);
        }
    }

    /**
     * Fetch waifu from APIs
     */
    async fetchWaifu(tag = null, isNSFW = false) {
        try {
            // Reset rate limit counter if an hour has passed
            if (Date.now() - this.lastReset > 3600000) {
                this.requestCount = 0;
                this.lastReset = Date.now();
            }

            this.requestCount++;

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
     * Send waifu image to chat
     */
    async sendWaifu(messageInfo, waifuData) {
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
     * Get SFW tag based on category
     */
    getSFWTag(category = null) {
        const sfwCategories = ['sfw', 'cute', 'aesthetic', 'popular'];
        
        if (category && this.categories[category] && sfwCategories.includes(category)) {
            const tags = this.categories[category];
            return tags[Math.floor(Math.random() * tags.length)];
        }

        // Get random tag from SFW categories
        const sfwTags = sfwCategories.map(cat => this.categories[cat] || []).flat();
        return sfwTags[Math.floor(Math.random() * sfwTags.length)];
    }

    /**
     * Get NSFW tag based on category
     */
    getNSFWTag(category = null) {
        // All NSFW categories (excluding SFW ones)
        const nsfwCategories = [
            'boobs', 'nsfw', 'lewd', 'uniform', 'pussy', 'bikini', 'panties', 
            'lingerie', 'nude', 'naked', 'ass', 'butt', 'thicc', 'thick', 
            'milf', 'mom', 'mature', 'oral', 'blowjob', 'bj', 'paizuri', 
            'titjob', 'school', 'schoolgirl', 'student', 'teacher', 'nurse', 
            'maid', 'bunny', 'catgirl', 'neko', 'demon', 'angel', 'elf', 
            'witch', 'vampire', 'swimsuit', 'beach', 'summer', 'shower', 
            'bath', 'wet', 'loli', 'young', 'teen', 'ahegao', 'cumshot', 
            'creampie', 'gangbang', 'group', 'threesome', 'lesbian', 'yuri', 
            'futanari', 'futa', 'trap', 'femboy', 'tentacle', 'monster', 
            'bdsm', 'bondage', 'domination', 'submissive'
        ];
        
        if (category && this.categories[category] && nsfwCategories.includes(category)) {
            const tags = this.categories[category];
            return tags[Math.floor(Math.random() * tags.length)];
        }

        // Get random tag from basic NSFW categories if category not found
        const basicNsfwTags = ['hentai', 'ecchi', 'oppai', 'ass', 'milf', 'oral'];
        return basicNsfwTags[Math.floor(Math.random() * basicNsfwTags.length)];
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
