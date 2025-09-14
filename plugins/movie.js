/**
 * MATDEV Movie/TV Info Plugin
 * Get movie and TV show details using free APIs
 */

const axios = require('axios');
const config = require('../config');

class MoviePlugin {
    constructor() {
        this.name = 'movie';
        this.description = 'Movie and TV show information plugin';
        this.version = '1.0.0';
        this.enabled = true;
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            // Register movie/tv commands
            this.bot.messageHandler.registerCommand('movie', this.movieCommand.bind(this), {
                description: 'Get movie information',
                usage: `${config.PREFIX}movie <movie title>`,
                category: 'entertainment',
                plugin: 'movie',
                source: 'movie.js'
            });

            this.bot.messageHandler.registerCommand('tv', this.tvCommand.bind(this), {
                description: 'Get TV show information',
                usage: `${config.PREFIX}tv <show title>`,
                category: 'entertainment',
                plugin: 'movie',
                source: 'movie.js'
            });

            console.log('✅ Movie/TV Info plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Movie plugin:', error);
            return false;
        }
    }

    /**
     * Search for movies using OMDB API with multiple fallback keys
     */
    async searchMovie(title) {
        const apiKeys = [
            'trilogy',
            '8265bd1c', 
            'b6003d8a',
            '2dca5df0',
            'thewdb',
            '72bc447a',
            'ac7b6e48',
            '40e9cece'
        ];

        for (let i = 0; i < apiKeys.length; i++) {
            const apiKey = apiKeys[i];
            try {
                console.log(`Trying API key ${i + 1}/${apiKeys.length}...`);
                
                const response = await axios.get('https://www.omdbapi.com/', {
                    params: {
                        apikey: apiKey,
                        t: title,
                        type: 'movie',
                        plot: 'full'
                    },
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0.0 (WhatsApp Bot)'
                    }
                });

                // Validate response structure
                if (!response.data) {
                    throw new Error('Invalid API response structure');
                }

                if (response.data.Response === 'False') {
                    console.log(`Movie not found with API key ${i + 1}: ${response.data.Error || 'Unknown error'}`);
                    if (i === apiKeys.length - 1) {
                        throw new Error(`Movie "${title}" not found in database`);
                    }
                    continue; // Try next API key
                }

                console.log(`✅ Found movie with API key ${i + 1}`);
                return response.data;

            } catch (error) {
                console.log(`❌ API key ${i + 1} failed:`, error.response?.status || error.message);
                
                if (i === apiKeys.length - 1) {
                    // Last API key failed
                    if (error.code === 'ECONNABORTED') {
                        throw new Error('Movie search timed out. Please try again.');
                    } else if (error.response?.status === 401) {
                        throw new Error('All movie API keys are unauthorized. Service temporarily unavailable.');
                    } else if (error.response?.status === 429) {
                        throw new Error('Movie API rate limit exceeded. Please try again later.');
                    } else {
                        throw new Error(`Movie search failed: ${error.message}`);
                    }
                }
                // Continue to next API key
            }
        }
    }

    /**
     * Search for TV shows using multiple fallback keys
     */
    async searchTVShow(title) {
        const apiKeys = [
            'trilogy',
            '8265bd1c', 
            'b6003d8a',
            '2dca5df0',
            'thewdb',
            '72bc447a',
            'ac7b6e48',
            '40e9cece'
        ];

        for (let i = 0; i < apiKeys.length; i++) {
            const apiKey = apiKeys[i];
            try {
                console.log(`Trying TV API key ${i + 1}/${apiKeys.length}...`);
                
                const response = await axios.get('https://www.omdbapi.com/', {
                    params: {
                        apikey: apiKey,
                        t: title,
                        type: 'series',
                        plot: 'full'
                    },
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0.0 (WhatsApp Bot)'
                    }
                });

                // Validate response structure
                if (!response.data) {
                    throw new Error('Invalid API response structure');
                }

                if (response.data.Response === 'False') {
                    console.log(`TV show not found with API key ${i + 1}: ${response.data.Error || 'Unknown error'}`);
                    if (i === apiKeys.length - 1) {
                        throw new Error(`TV show "${title}" not found in database`);
                    }
                    continue; // Try next API key
                }

                console.log(`✅ Found TV show with API key ${i + 1}`);
                return response.data;

            } catch (error) {
                console.log(`❌ TV API key ${i + 1} failed:`, error.response?.status || error.message);
                
                if (i === apiKeys.length - 1) {
                    // Last API key failed
                    if (error.code === 'ECONNABORTED') {
                        throw new Error('TV show search timed out. Please try again.');
                    } else if (error.response?.status === 401) {
                        throw new Error('All TV API keys are unauthorized. Service temporarily unavailable.');
                    } else if (error.response?.status === 429) {
                        throw new Error('TV API rate limit exceeded. Please try again later.');
                    } else {
                        throw new Error(`TV show search failed: ${error.message}`);
                    }
                }
                // Continue to next API key
            }
        }
    }

    

    /**
     * Format movie/TV info for WhatsApp
     */
    formatMovieInfo(data, type = 'movie') {
        if (data.Response === 'False') {
            return `❌ ${type === 'movie' ? 'Movie' : 'TV Show'} not found. Please check the title and try again.`;
        }

        const emoji = type === 'movie' ? '🎬' : '📺';
        let text = `${emoji} *${data.Title}* (${data.Year})\n\n`;
        
        if (data.Plot && data.Plot !== 'N/A') {
            text += `📝 *Plot:*\n${data.Plot}\n\n`;
        }
        
        if (data.Genre && data.Genre !== 'N/A') {
            text += `🎭 *Genre:* ${data.Genre}\n`;
        }
        
        if (data.Director && data.Director !== 'N/A') {
            text += `🎥 *Director:* ${data.Director}\n`;
        }
        
        if (data.Actors && data.Actors !== 'N/A') {
            text += `👥 *Cast:* ${data.Actors}\n`;
        }
        
        if (data.Runtime && data.Runtime !== 'N/A') {
            text += `⏱️ *Runtime:* ${data.Runtime}\n`;
        }
        
        if (data.imdbRating && data.imdbRating !== 'N/A') {
            text += `⭐ *IMDB Rating:* ${data.imdbRating}/10\n`;
        }
        
        if (data.Language && data.Language !== 'N/A') {
            text += `🌐 *Language:* ${data.Language}\n`;
        }
        
        if (data.Country && data.Country !== 'N/A') {
            text += `🌍 *Country:* ${data.Country}\n`;
        }

        if (type === 'series' && data.totalSeasons && data.totalSeasons !== 'N/A') {
            text += `📺 *Total Seasons:* ${data.totalSeasons}\n`;
        }
        
        text += `\n_🔧 Generated by: ${config.BOT_NAME}_`;
        
        return text;
    }

    /**
     * Handle movie command
     */
    async movieCommand(messageInfo) {
        try {
            const title = messageInfo.args.join(' ').trim();
            
            if (!title) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a movie title.\nUsage: ${config.PREFIX}movie <movie title>\nExample: ${config.PREFIX}movie The Matrix`);
                return;
            }

            // Send searching message
            const searchingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching for movie...');

            try {
                const movieData = await this.searchMovie(title);
                const formattedInfo = this.formatMovieInfo(movieData, 'movie');

                // Edit the searching message with results
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: formattedInfo,
                    edit: searchingMsg.key
                });

            } catch (apiError) {
                console.error('Movie API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Failed to fetch movie information. Please try again later or check the movie title.`,
                    edit: searchingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in movie command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Handle TV show command
     */
    async tvCommand(messageInfo) {
        try {
            const title = messageInfo.args.join(' ').trim();
            
            if (!title) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a TV show title.\nUsage: ${config.PREFIX}tv <show title>\nExample: ${config.PREFIX}tv Breaking Bad`);
                return;
            }

            // Send searching message
            const searchingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching for TV show...');

            try {
                const tvData = await this.searchTVShow(title);
                const formattedInfo = this.formatMovieInfo(tvData, 'series');

                // Edit the searching message with results
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: formattedInfo,
                    edit: searchingMsg.key
                });

            } catch (apiError) {
                console.error('TV API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Failed to fetch TV show information. Please try again later or check the show title.`,
                    edit: searchingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in TV command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Movie plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new MoviePlugin();
        await plugin.init(bot);
        return plugin;
    }
};