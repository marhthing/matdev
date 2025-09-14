
/**
 * MATDEV GIF Search Plugin
 * Search and send GIFs from Giphy and Tenor APIs
 */

const axios = require('axios');
const config = require('../config');

class GifSearchPlugin {
    constructor() {
        this.name = 'gif-search';
        this.description = 'Search and send GIFs from Giphy and Tenor';
        this.version = '1.0.0';
        this.enabled = true;
        
        // Free API endpoints (no API key required for basic usage)
        this.apis = {
            giphy: {
                search: 'https://api.giphy.com/v1/gifs/search',
                trending: 'https://api.giphy.com/v1/gifs/trending',
                apiKey: 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65' // Free public API key
            },
            tenor: {
                search: 'https://tenor.googleapis.com/v2/search',
                trending: 'https://tenor.googleapis.com/v2/trending',
                apiKey: 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ' // Free public API key
            }
        };
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            this.registerCommands();
            console.log('✅ GIF Search plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize GIF Search plugin:', error);
            return false;
        }
    }

    /**
     * Register commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('gif', this.gifSearchCommand.bind(this), {
            description: 'Search for GIFs from Giphy and Tenor',
            usage: `${config.PREFIX}gif <search term>`,
            category: 'fun',
            plugin: 'gif-search',
            source: 'gif-search.js'
        });

        
    }

    /**
     * Handle GIF search command
     */
    async gifSearchCommand(messageInfo) {
        const fs = require('fs-extra');
        const path = require('path');
        const axios = require('axios');
        
        try {
            const query = messageInfo.args.join(' ').trim();
            
            if (!query) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a search term.\n\nUsage: ${config.PREFIX}gif <search term>\n\nExamples:\n• ${config.PREFIX}gif funny cat\n• ${config.PREFIX}gif happy dance\n• ${config.PREFIX}gif excited`);
                return;
            }

            try {
                // Try Giphy first
                let gifs = await this.searchGiphy(query);
                
                // If Giphy fails or returns no results, try Tenor
                if (!gifs || gifs.length === 0) {
                    gifs = await this.searchTenor(query);
                }

                if (!gifs || gifs.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, `❌ No GIFs found for "${query}". Try different keywords.`);
                    return;
                }

                // Select a random GIF from the results
                const randomGif = gifs[Math.floor(Math.random() * Math.min(gifs.length, 10))];
                
                // Download GIF to tmp directory
                const timestamp = Date.now();
                const tempFilePath = path.join(__dirname, '..', 'tmp', `gif_${timestamp}.mp4`);
                
                // Ensure tmp directory exists
                await fs.ensureDir(path.dirname(tempFilePath));
                
                // Download the GIF
                const response = await axios.get(randomGif.url, {
                    responseType: 'stream',
                    timeout: 30000
                });
                
                // Write to temp file
                await new Promise((resolve, reject) => {
                    const writeStream = fs.createWriteStream(tempFilePath);
                    response.data.pipe(writeStream);
                    
                    response.data.on('error', reject);
                    writeStream.on('error', reject);
                    writeStream.on('finish', resolve);
                });
                
                // Send the GIF without caption
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: { url: tempFilePath },
                    gifPlayback: true
                });

                // Clean up temp file after sending
                setTimeout(async () => {
                    try {
                        if (await fs.pathExists(tempFilePath)) {
                            await fs.remove(tempFilePath);
                        }
                    } catch (cleanupError) {
                        console.error('Error cleaning up GIF temp file:', cleanupError);
                    }
                }, 5000);

            } catch (apiError) {
                console.error('GIF search API error:', apiError);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error searching for GIFs. Please try again later.');
            }

        } catch (error) {
            console.error('Error in GIF search command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    

    /**
     * Search GIFs on Giphy
     */
    async searchGiphy(query) {
        try {
            const response = await axios.get(this.apis.giphy.search, {
                params: {
                    api_key: this.apis.giphy.apiKey,
                    q: query,
                    limit: 20,
                    rating: 'pg-13'
                },
                timeout: 10000
            });

            if (response.data && response.data.data) {
                return response.data.data.map(gif => ({
                    title: gif.title || 'Untitled GIF',
                    url: gif.images.original.mp4 || gif.images.original.url,
                    source: 'Giphy'
                }));
            }

            return [];
        } catch (error) {
            console.error('Giphy search error:', error);
            return [];
        }
    }

    /**
     * Search GIFs on Tenor
     */
    async searchTenor(query) {
        try {
            const response = await axios.get(this.apis.tenor.search, {
                params: {
                    key: this.apis.tenor.apiKey,
                    q: query,
                    limit: 20,
                    contentfilter: 'medium'
                },
                timeout: 10000
            });

            if (response.data && response.data.results) {
                return response.data.results.map(gif => ({
                    title: gif.content_description || 'Untitled GIF',
                    url: gif.media_formats.mp4?.url || gif.media_formats.gif?.url,
                    source: 'Tenor'
                }));
            }

            return [];
        } catch (error) {
            console.error('Tenor search error:', error);
            return [];
        }
    }

    /**
     * Get trending GIFs from Giphy
     */
    async getTrendingGiphy() {
        try {
            const response = await axios.get(this.apis.giphy.trending, {
                params: {
                    api_key: this.apis.giphy.apiKey,
                    limit: 25,
                    rating: 'pg-13'
                },
                timeout: 10000
            });

            if (response.data && response.data.data) {
                return response.data.data.map(gif => ({
                    title: gif.title || 'Trending GIF',
                    url: gif.images.original.mp4 || gif.images.original.url,
                    source: 'Giphy'
                }));
            }

            return [];
        } catch (error) {
            console.error('Giphy trending error:', error);
            return [];
        }
    }

    /**
     * Get trending GIFs from Tenor
     */
    async getTrendingTenor() {
        try {
            const response = await axios.get(this.apis.tenor.trending, {
                params: {
                    key: this.apis.tenor.apiKey,
                    limit: 25,
                    contentfilter: 'medium'
                },
                timeout: 10000
            });

            if (response.data && response.data.results) {
                return response.data.results.map(gif => ({
                    title: gif.content_description || 'Trending GIF',
                    url: gif.media_formats.mp4?.url || gif.media_formats.gif?.url,
                    source: 'Tenor'
                }));
            }

            return [];
        } catch (error) {
            console.error('Tenor trending error:', error);
            return [];
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 GIF Search plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new GifSearchPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
