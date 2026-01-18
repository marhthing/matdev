/**
 * MATDEV Giphy Plugin
 * Search GIFs from Giphy and convert them to stickers
 */

const axios = require('axios');
const config = require('../config');

class GiphyPlugin {
    constructor() {
        this.name = 'giphy';
        this.description = 'Search GIFs from Giphy and convert to stickers';
        this.version = '1.0.0';
        
        // Giphy API configuration
        this.apiKey = config.GIPHY_API_KEY || process.env.GIPHY_API_KEY;
        this.baseUrl = 'https://api.giphy.com/v1/gifs';
    }

    async init(bot) {
        this.bot = bot;
        this.logger = bot.logger;
        this.registerCommands();

        // Check if API key is configured
        if (!this.apiKey) {
            console.log('⚠️  Giphy API key not configured. Please set GIPHY_API_KEY in .env');
            console.log('   Get your API key at: https://developers.giphy.com/');
        } else {
            console.log('✅ Giphy plugin loaded');
        }
        
        return this;
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('tenor', this.tenorCommand.bind(this), {
            description: 'Search GIF from Giphy and convert to sticker',
            usage: `${config.PREFIX}tenor <search query>`,
            category: 'media',
            plugin: 'giphy',
            source: 'giphy.js'
        });
    }

    /**
     * Main tenor command handler
     */
    async tenorCommand(messageInfo) {
        try {
            // Check if API key is configured
            if (!this.apiKey) {
                await this.bot.messageHandler.reply(
                    messageInfo,
                    '❌ Giphy API key not configured. Please contact bot admin.'
                );
                return;
            }

            // Extract search query from message
            const text = messageInfo.message?.conversation || 
                        messageInfo.message?.extendedTextMessage?.text || '';
            
            const args = text.split(' ');
            args.shift(); // Remove command

            if (args.length === 0) {
                await this.bot.messageHandler.reply(
                    messageInfo,
                    `❌ Please provide a search query.\n\nUsage: ${config.PREFIX}tenor <search query>\nExample: ${config.PREFIX}tenor laughing cat`
                );
                return;
            }

            const searchQuery = args.join(' ');
            console.log(`🔍 Searching Giphy for: "${searchQuery}"`);

            // Send searching message
            await this.bot.messageHandler.reply(
                messageInfo,
                `🔍 Searching for "${searchQuery}"...`
            );

            // Search GIF from Giphy
            const gifUrl = await this.searchGiphyGif(searchQuery);

            if (!gifUrl) {
                await this.bot.messageHandler.reply(
                    messageInfo,
                    `❌ No GIF found for "${searchQuery}". Try a different search term.`
                );
                return;
            }

            console.log(`✅ Found GIF: ${gifUrl}`);

            // Download the GIF
            const gifBuffer = await this.downloadGif(gifUrl);

            if (!gifBuffer) {
                await this.bot.messageHandler.reply(
                    messageInfo,
                    '❌ Failed to download GIF from Giphy.'
                );
                return;
            }

            console.log(`📥 Downloaded GIF (${gifBuffer.length} bytes)`);

            // Convert GIF to sticker using the sticker plugin
            await this.convertToSticker(messageInfo, gifBuffer);

        } catch (error) {
            console.error(`Error in tenor command: ${error.message}`);
            await this.bot.messageHandler.reply(
                messageInfo,
                '❌ An error occurred while processing your request.'
            );
        }
    }

    /**
     * Search for GIF on Giphy API
     */
    async searchGiphyGif(query) {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: {
                    api_key: this.apiKey,
                    q: query,
                    limit: 1,
                    offset: 0,
                    rating: 'g', // G-rated content only (family friendly)
                    lang: 'en'
                },
                timeout: 10000
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const result = response.data.data[0];
                
                // Get the best GIF format available
                // Prefer downsized for smaller file size, fallback to original
                const images = result.images;
                
                if (images.downsized && images.downsized.url) {
                    return images.downsized.url;
                } else if (images.downsized_medium && images.downsized_medium.url) {
                    return images.downsized_medium.url;
                } else if (images.original && images.original.url) {
                    return images.original.url;
                }
            }

            return null;

        } catch (error) {
            if (error.response && error.response.status === 429) {
                console.error('❌ Giphy API rate limit exceeded. Please wait before trying again.');
            } else if (error.response && error.response.status === 403) {
                console.error('❌ Giphy API key is invalid or has been disabled.');
            } else {
                console.error(`Error searching Giphy: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Download GIF from URL
     */
    async downloadGif(url) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: 10 * 1024 * 1024 // 10MB max
            });

            return Buffer.from(response.data);

        } catch (error) {
            console.error(`Error downloading GIF: ${error.message}`);
            return null;
        }
    }

    /**
     * Convert GIF buffer to sticker using sticker plugin
     */
    async convertToSticker(messageInfo, gifBuffer) {
        try {
            // Get the sticker plugin
            const stickerPlugin = this.bot.plugins.sticker;
            
            if (!stickerPlugin) {
                console.error('❌ Sticker plugin not found');
                await this.bot.messageHandler.reply(
                    messageInfo,
                    '❌ Sticker plugin not available.'
                );
                return;
            }

            console.log(`🎨 Converting GIF to sticker...`);

            // Convert the GIF buffer to sticker
            const stickerBuffer = await stickerPlugin.videoToSticker(gifBuffer);

            if (!stickerBuffer) {
                await this.bot.messageHandler.reply(
                    messageInfo,
                    '❌ Failed to convert GIF to sticker.'
                );
                return;
            }

            console.log(`✅ Sticker created (${stickerBuffer.length} bytes)`);

            // Send sticker with metadata
            const packname = config.STICKER_PACK_NAME || config.BOT_NAME || 'MATDEV';
            const author = config.STICKER_AUTHOR || config.BOT_NAME || 'MATDEV';
            
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                sticker: stickerBuffer,
                packname,
                author
            });

            console.log(`✅ Sticker sent successfully`);

        } catch (error) {
            console.error(`Error converting to sticker: ${error.message}`);
            await this.bot.messageHandler.reply(
                messageInfo,
                '❌ Failed to convert GIF to sticker.'
            );
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new GiphyPlugin();
        await plugin.init(bot);
        return plugin;
    }
};