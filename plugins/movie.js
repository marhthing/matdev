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
     * Search for movies using OMDB API with free key
     */
    async searchMovie(title) {
        try {
            // Using a free public OMDB API key
            const response = await axios.get('https://www.omdbapi.com/', {
                params: {
                    apikey: 'trilogy',  // Free public key
                    t: title,
                    type: 'movie',
                    plot: 'full'
                },
                timeout: 15000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0.0 (WhatsApp Bot)'
                }
            });

            // Validate response structure
            if (!response.data) {
                throw new Error('Invalid API response structure');
            }

            if (response.data.Response === 'False') {
                console.log(`Movie not found with primary API: ${response.data.Error || 'Unknown error'}`);
                // Try alternative free movie API
                return await this.searchMovieAlternative(title);
            }

            return response.data;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error('Movie search timeout:', error.message);
                throw new Error('Movie search timed out. Please try again.');
            } else if (error.response) {
                console.error('Movie API HTTP error:', error.response.status, error.response.statusText);
                throw new Error(`Movie API returned error: ${error.response.status}`);
            } else if (error.request) {
                console.error('Movie API network error:', error.message);
                throw new Error('Network error accessing movie database. Please check your connection.');
            } else {
                console.error('Movie search error:', error.message);
            }
            
            // Fallback to alternative API on any error
            console.log('Trying alternative movie API...');
            return await this.searchMovieAlternative(title);
        }
    }

    /**
     * Alternative movie search using another free API
     */
    async searchMovieAlternative(title) {
        try {
            // Try with another free key or API
            const response = await axios.get('https://www.omdbapi.com/', {
                params: {
                    apikey: '8265bd1c',  // Another free public key
                    t: title,
                    type: 'movie',
                    plot: 'full'
                },
                timeout: 15000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0.0 (WhatsApp Bot)'
                }
            });

            // Validate response structure
            if (!response.data) {
                throw new Error('Invalid API response structure');
            }

            if (response.data.Response === 'False') {
                throw new Error(`Movie not found: ${response.data.Error || 'Unknown error'}`);
            }

            return response.data;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error('Alternative movie search timeout:', error.message);
                throw new Error('Movie search timed out. Please try again later.');
            } else if (error.response) {
                console.error('Alternative movie API HTTP error:', error.response.status);
                throw new Error(`Movie database is temporarily unavailable (${error.response.status})`);
            } else if (error.request) {
                console.error('Alternative movie API network error:', error.message);
                throw new Error('Network error accessing movie database. Please check your connection.');
            } else {
                console.error('Alternative movie search error:', error.message);
                throw new Error(error.message || 'Unable to fetch movie data from any source');
            }
        }
    }

    /**
     * Search for TV shows
     */
    async searchTVShow(title) {
        try {
            const response = await axios.get('https://www.omdbapi.com/', {
                params: {
                    apikey: 'trilogy',
                    t: title,
                    type: 'series',
                    plot: 'full'
                },
                timeout: 15000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0.0 (WhatsApp Bot)'
                }
            });

            // Validate response structure
            if (!response.data) {
                throw new Error('Invalid API response structure');
            }

            if (response.data.Response === 'False') {
                console.log(`TV show not found with primary API: ${response.data.Error || 'Unknown error'}`);
                // Try alternative
                try {
                    const altResponse = await axios.get('https://www.omdbapi.com/', {
                        params: {
                            apikey: '8265bd1c',
                            t: title,
                            type: 'series',
                            plot: 'full'
                        },
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'MATDEV-Bot/1.0.0 (WhatsApp Bot)'
                        }
                    });

                    if (!altResponse.data) {
                        throw new Error('Invalid alternative API response structure');
                    }

                    if (altResponse.data.Response === 'False') {
                        throw new Error(`TV show not found: ${altResponse.data.Error || 'Unknown error'}`);
                    }

                    return altResponse.data;
                } catch (altError) {
                    console.error('Alternative TV show search error:', altError.message);
                    throw new Error(`TV show "${title}" not found in any database`);
                }
            }

            return response.data;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error('TV show search timeout:', error.message);
                throw new Error('TV show search timed out. Please try again.');
            } else if (error.response) {
                console.error('TV show API HTTP error:', error.response.status, error.response.statusText);
                throw new Error(`TV show database returned error: ${error.response.status}`);
            } else if (error.request) {
                console.error('TV show API network error:', error.message);
                throw new Error('Network error accessing TV show database. Please check your connection.');
            } else {
                console.error('TV show search error:', error.message);
                throw new Error(error.message || 'Unable to fetch TV show data');
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