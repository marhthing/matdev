
/**
 * MATDEV Waifu Generator Plugin
 * Generate high-quality anime waifu images using free APIs
 */

const config = require('../config');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

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
            'tits': ['oppai', 'paizuri', 'ecchi'],
            'breasts': ['oppai', 'paizuri', 'ecchi'],
            'nsfw': ['hentai', 'ass', 'milf', 'oral'],
            'lewd': ['oppai', 'ecchi', 'hentai'],
            'uniform': ['hentai', 'ecchi', 'oppai'],
            'pussy': ['hentai', 'ecchi', 'milf'],
            'vagina': ['hentai', 'ecchi', 'milf'],
            'cunt': ['hentai', 'ecchi', 'milf'],
            'dick': ['hentai', 'oral', 'ecchi'],
            'cock': ['hentai', 'oral', 'ecchi'],
            'penis': ['hentai', 'oral', 'ecchi'],
            'balls': ['hentai', 'oral', 'ecchi'],
            'nuts': ['hentai', 'oral', 'ecchi'],
            'shaft': ['hentai', 'oral', 'ecchi'],
            'member': ['hentai', 'oral', 'ecchi'],
            'rod': ['hentai', 'oral', 'ecchi'],
            'bikini': ['ecchi', 'oppai', 'hentai'],
            'panties': ['ecchi', 'hentai', 'oppai'],
            'underwear': ['ecchi', 'hentai', 'oppai'],
            'bra': ['ecchi', 'oppai', 'hentai'],
            'lingerie': ['ecchi', 'oppai', 'hentai'],
            'nude': ['hentai', 'oppai', 'ecchi'],
            'naked': ['hentai', 'oppai', 'ecchi'],
            'topless': ['hentai', 'oppai', 'ecchi'],
            'bottomless': ['hentai', 'ecchi', 'ass'],
            'ass': ['ass', 'hentai', 'ecchi'],
            'butt': ['ass', 'hentai', 'ecchi'],
            'booty': ['ass', 'hentai', 'ecchi'],
            'thicc': ['ass', 'oppai', 'hentai'],
            'thick': ['ass', 'oppai', 'hentai'],
            'curvy': ['ass', 'oppai', 'hentai'],
            'milf': ['milf', 'oppai', 'hentai'],
            'mom': ['milf', 'oppai', 'hentai'],
            'mommy': ['milf', 'oppai', 'hentai'],
            'mature': ['milf', 'hentai', 'oppai'],
            'cougar': ['milf', 'hentai', 'oppai'],
            'oral': ['oral', 'hentai', 'ecchi'],
            'blowjob': ['oral', 'hentai', 'ecchi'],
            'bj': ['oral', 'hentai', 'ecchi'],
            'deepthroat': ['oral', 'hentai', 'ecchi'],
            'facefuck': ['oral', 'hentai', 'ecchi'],
            'throatfuck': ['oral', 'hentai', 'ecchi'],
            'suck': ['oral', 'hentai', 'ecchi'],
            'lick': ['oral', 'hentai', 'ecchi'],
            'paizuri': ['paizuri', 'oppai', 'hentai'],
            'titjob': ['paizuri', 'oppai', 'hentai'],
            'titfuck': ['paizuri', 'oppai', 'hentai'],
            'boobjob': ['paizuri', 'oppai', 'hentai'],
            'handjob': ['hentai', 'ecchi', 'oral'],
            'fingering': ['hentai', 'ecchi', 'oral'],
            'masturbation': ['hentai', 'ecchi', 'oppai'],
            'solo': ['hentai', 'ecchi', 'oppai'],
            'touching': ['hentai', 'ecchi', 'oppai'],
            'school': ['hentai', 'ecchi', 'oppai'],
            'schoolgirl': ['hentai', 'ecchi', 'oppai'],
            'student': ['hentai', 'ecchi', 'oppai'],
            'teacher': ['milf', 'hentai', 'oppai'],
            'professor': ['milf', 'hentai', 'oppai'],
            'nurse': ['hentai', 'ecchi', 'oppai'],
            'doctor': ['hentai', 'ecchi', 'oppai'],
            'maid': ['hentai', 'ecchi', 'oppai'],
            'servant': ['hentai', 'ecchi', 'oppai'],
            'waitress': ['hentai', 'ecchi', 'oppai'],
            'secretary': ['hentai', 'ecchi', 'oppai'],
            'office': ['hentai', 'ecchi', 'oppai'],
            'boss': ['hentai', 'ecchi', 'oppai'],
            'bunny': ['ecchi', 'hentai', 'oppai'],
            'catgirl': ['hentai', 'ecchi', 'oppai'],
            'neko': ['hentai', 'ecchi', 'oppai'],
            'foxgirl': ['hentai', 'ecchi', 'oppai'],
            'wolfgirl': ['hentai', 'ecchi', 'oppai'],
            'demon': ['hentai', 'ecchi', 'oppai'],
            'succubus': ['hentai', 'ecchi', 'oppai'],
            'angel': ['hentai', 'ecchi', 'oppai'],
            'goddess': ['hentai', 'ecchi', 'oppai'],
            'elf': ['hentai', 'ecchi', 'oppai'],
            'witch': ['hentai', 'ecchi', 'oppai'],
            'vampire': ['hentai', 'ecchi', 'oppai'],
            'zombie': ['hentai', 'ecchi', 'oppai'],
            'ghost': ['hentai', 'ecchi', 'oppai'],
            'alien': ['hentai', 'ecchi', 'oppai'],
            'princess': ['hentai', 'ecchi', 'oppai'],
            'queen': ['hentai', 'ecchi', 'oppai'],
            'knight': ['hentai', 'ecchi', 'oppai'],
            'warrior': ['hentai', 'ecchi', 'oppai'],
            'swimsuit': ['ecchi', 'oppai', 'hentai'],
            'bikini': ['ecchi', 'oppai', 'hentai'],
            'beach': ['ecchi', 'oppai', 'hentai'],
            'pool': ['ecchi', 'oppai', 'hentai'],
            'summer': ['ecchi', 'oppai', 'hentai'],
            'vacation': ['ecchi', 'oppai', 'hentai'],
            'shower': ['hentai', 'ecchi', 'oppai'],
            'bath': ['hentai', 'ecchi', 'oppai'],
            'bathroom': ['hentai', 'ecchi', 'oppai'],
            'wet': ['hentai', 'ecchi', 'oppai'],
            'soap': ['hentai', 'ecchi', 'oppai'],
            'loli': ['hentai', 'ecchi', 'oppai'],
            'young': ['hentai', 'ecchi', 'oppai'],
            'teen': ['hentai', 'ecchi', 'oppai'],
            'petite': ['hentai', 'ecchi', 'oppai'],
            'small': ['hentai', 'ecchi', 'oppai'],
            'tiny': ['hentai', 'ecchi', 'oppai'],
            'ahegao': ['hentai', 'ecchi', 'oral'],
            'orgasm': ['hentai', 'ecchi', 'oral'],
            'climax': ['hentai', 'ecchi', 'oral'],
            'cum': ['hentai', 'oral', 'ecchi'],
            'cumshot': ['hentai', 'oral', 'ecchi'],
            'facial': ['hentai', 'oral', 'ecchi'],
            'creampie': ['hentai', 'ecchi', 'oppai'],
            'bukkake': ['hentai', 'oral', 'ecchi'],
            'gangbang': ['hentai', 'oral', 'ecchi'],
            'group': ['hentai', 'oral', 'ecchi'],
            'threesome': ['hentai', 'oral', 'ecchi'],
            'foursome': ['hentai', 'oral', 'ecchi'],
            'orgy': ['hentai', 'oral', 'ecchi'],
            'lesbian': ['hentai', 'ecchi', 'oppai'],
            'yuri': ['hentai', 'ecchi', 'oppai'],
            'gay': ['hentai', 'ecchi', 'oral'],
            'yaoi': ['hentai', 'ecchi', 'oral'],
            'futanari': ['hentai', 'ecchi', 'oppai'],
            'futa': ['hentai', 'ecchi', 'oppai'],
            'shemale': ['hentai', 'ecchi', 'oppai'],
            'trans': ['hentai', 'ecchi', 'oppai'],
            'trap': ['hentai', 'ecchi', 'oppai'],
            'femboy': ['hentai', 'ecchi', 'oppai'],
            'crossdress': ['hentai', 'ecchi', 'oppai'],
            'tentacle': ['hentai', 'ecchi', 'oppai'],
            'monster': ['hentai', 'ecchi', 'oppai'],
            'beast': ['hentai', 'ecchi', 'oppai'],
            'bdsm': ['hentai', 'ecchi', 'oppai'],
            'bondage': ['hentai', 'ecchi', 'oppai'],
            'tied': ['hentai', 'ecchi', 'oppai'],
            'rope': ['hentai', 'ecchi', 'oppai'],
            'chains': ['hentai', 'ecchi', 'oppai'],
            'domination': ['hentai', 'ecchi', 'oppai'],
            'submissive': ['hentai', 'ecchi', 'oppai'],
            'slave': ['hentai', 'ecchi', 'oppai'],
            'master': ['hentai', 'ecchi', 'oppai'],
            'mistress': ['hentai', 'ecchi', 'oppai'],
            'punishment': ['hentai', 'ecchi', 'oppai'],
            'spanking': ['hentai', 'ecchi', 'ass'],
            'whip': ['hentai', 'ecchi', 'oppai'],
            'torture': ['hentai', 'ecchi', 'oppai'],
            'pain': ['hentai', 'ecchi', 'oppai'],
            'rough': ['hentai', 'ecchi', 'oppai'],
            'hard': ['hentai', 'ecchi', 'oppai'],
            'hardcore': ['hentai', 'ecchi', 'oppai'],
            'extreme': ['hentai', 'ecchi', 'oppai'],
            'kinky': ['hentai', 'ecchi', 'oppai'],
            'fetish': ['hentai', 'ecchi', 'oppai'],
            'kink': ['hentai', 'ecchi', 'oppai']
        };
        
        // Request tracking for rate limiting
        this.requestCount = 0;
        this.lastReset = Date.now();
        this.maxRequests = 20; // per hour
        
        // Temp directory for image processing
        this.tempDir = path.join(process.cwd(), 'tmp');
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure temp directory exists
        await fs.ensureDir(this.tempDir);

        console.log('✅ Waifu Generator plugin loaded');
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Generate waifu (auto-detects SFW/NSFW based on category)
        this.bot.messageHandler.registerCommand('waifu', this.generateWaifuCommand.bind(this), {
            description: 'Generate anime waifu image (auto-detects SFW/NSFW)',
            usage: `${config.PREFIX}waifu [category]`,
            category: 'fun',
            plugin: 'waifu',
            source: 'waifu.js'
        });
    }

    /**
     * Generate waifu command (auto-detects SFW/NSFW)
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
            const isNSFW = this.isNSFWCategory(category);
            const tag = isNSFW ? this.getNSFWTag(category) : this.getSFWTag(category);

            const waifuData = await this.fetchWaifu(tag, isNSFW);
            
            if (!waifuData) {
                const categoryExamples = isNSFW 
                    ? 'boobs, pussy, bikini, uniform, panties, lingerie, nude, ass, thicc, milf, oral, schoolgirl, nurse, maid, catgirl, swimsuit, shower, ahegao, lesbian, futanari, tentacle, bdsm'
                    : 'sfw, cute, aesthetic, popular';
                    
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to generate waifu. Try again!\n\n' +
                    `💡 Available categories: ${categoryExamples}\n\n` +
                    `📝 Usage: .waifu [category] - Example: .waifu ${isNSFW ? 'boobs' : 'cute'}`
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
        let tempFilePath = null;
        
        try {
            // Download image to temp directory
            const response = await axios.get(waifuData.url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0'
                }
            });

            // Generate temp filename
            const timestamp = Date.now();
            const extension = this.getFileExtension(waifuData.url);
            const tempFileName = `waifu_${timestamp}${extension}`;
            tempFilePath = path.join(this.tempDir, tempFileName);

            // Save to temp file
            await fs.writeFile(tempFilePath, response.data);

            // Send image from temp file
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                image: { url: tempFilePath }
            });

        } catch (error) {
            console.error('Error sending waifu:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Waifu generated successfully! 🎉\n\n` +
                `🔗 *Direct Link:* ${waifuData.url}`
            );
        } finally {
            // Clean up temp file
            if (tempFilePath && await fs.pathExists(tempFilePath)) {
                try {
                    await fs.remove(tempFilePath);
                    // console.log(`🗑️ Cleaned up waifu temp file: ${tempFilePath}`);
                } catch (cleanupError) {
                    console.error('Error cleaning up waifu temp file:', cleanupError);
                }
            }
        }
    }

    /**
     * Get file extension from URL
     */
    getFileExtension(url) {
        try {
            const urlPath = new URL(url).pathname;
            const extension = path.extname(urlPath);
            return extension || '.jpg';
        } catch (error) {
            return '.jpg';
        }
    }

    /**
     * Check if category is NSFW
     */
    isNSFWCategory(category = null) {
        if (!category) return false;
        
        const sfwCategories = ['sfw', 'cute', 'aesthetic', 'popular'];
        return !sfwCategories.includes(category) && this.categories[category];
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
            'boobs', 'tits', 'breasts', 'nsfw', 'lewd', 'uniform', 'pussy', 'vagina', 'cunt',
            'dick', 'cock', 'penis', 'balls', 'nuts', 'shaft', 'member', 'rod', 'bikini', 'panties', 
            'underwear', 'bra', 'lingerie', 'nude', 'naked', 'topless', 'bottomless', 'ass', 'butt', 
            'booty', 'thicc', 'thick', 'curvy', 'milf', 'mom', 'mommy', 'mature', 'cougar', 'oral', 
            'blowjob', 'bj', 'deepthroat', 'facefuck', 'throatfuck', 'suck', 'lick', 'paizuri', 
            'titjob', 'titfuck', 'boobjob', 'handjob', 'fingering', 'masturbation', 'solo', 'touching',
            'school', 'schoolgirl', 'student', 'teacher', 'professor', 'nurse', 'doctor', 'maid', 
            'servant', 'waitress', 'secretary', 'office', 'boss', 'bunny', 'catgirl', 'neko', 'foxgirl',
            'wolfgirl', 'demon', 'succubus', 'angel', 'goddess', 'elf', 'witch', 'vampire', 'zombie',
            'ghost', 'alien', 'princess', 'queen', 'knight', 'warrior', 'swimsuit', 'beach', 'pool',
            'summer', 'vacation', 'shower', 'bath', 'bathroom', 'wet', 'soap', 'loli', 'young', 'teen',
            'petite', 'small', 'tiny', 'ahegao', 'orgasm', 'climax', 'cum', 'cumshot', 'facial', 
            'creampie', 'bukkake', 'gangbang', 'group', 'threesome', 'foursome', 'orgy', 'lesbian', 
            'yuri', 'gay', 'yaoi', 'futanari', 'futa', 'shemale', 'trans', 'trap', 'femboy', 'crossdress',
            'tentacle', 'monster', 'beast', 'bdsm', 'bondage', 'tied', 'rope', 'chains', 'domination', 
            'submissive', 'slave', 'master', 'mistress', 'punishment', 'spanking', 'whip', 'torture', 
            'pain', 'rough', 'hard', 'hardcore', 'extreme', 'kinky', 'fetish', 'kink'
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
