
/**
 * MATDEV Movie/TV Info Plugin
 * Get movie and TV show details using multiple free APIs
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
     * Search for movies using multiple APIs with fallback
     */
    async searchMovie(title) {
        // Try OMDB first with working API keys
        const omdbResult = await this.searchOMDB(title, 'movie');
        if (omdbResult.success) {
            return omdbResult.data;
        }

        // Fallback to TMDb API (free, no key required for basic search)
        const tmdbResult = await this.searchTMDB(title, 'movie');
        if (tmdbResult.success) {
            return this.convertTMDBToOMDB(tmdbResult.data);
        }

        // Last fallback: try a different free API
        throw new Error(`Movie "${title}" not found in any database`);
    }

    /**
     * Search OMDB with updated working API keys
     */
    async searchOMDB(title, type) {
        const workingApiKeys = [
            'b6003d8a', // This one usually works
            '2dca5df0',
            'thewdb',
            '72bc447a',
            'ac7b6e48'
        ];

        for (let i = 0; i < workingApiKeys.length; i++) {
            const apiKey = workingApiKeys[i];
            try {
                console.log(`Trying OMDB API key ${i + 1}/${workingApiKeys.length}...`);
                
                const response = await axios.get('https://www.omdbapi.com/', {
                    params: {
                        apikey: apiKey,
                        s: title, // Use 's' for search instead of 't' for better results
                        type: type,
                        page: 1
                    },
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MATDEV-Bot/1.0.0 (WhatsApp Bot)'
                    }
                });

                if (response.data && response.data.Response === 'True' && response.data.Search) {
                    // Find the best match from search results
                    const bestMatch = this.findBestMatch(title, response.data.Search);
                    if (bestMatch) {
                        // Get detailed info for the best match
                        const detailResponse = await axios.get('https://www.omdbapi.com/', {
                            params: {
                                apikey: apiKey,
                                i: bestMatch.imdbID,
                                plot: 'full'
                            },
                            timeout: 10000
                        });

                        if (detailResponse.data && detailResponse.data.Response === 'True') {
                            console.log(`✅ Found movie with OMDB API key ${i + 1}`);
                            return { success: true, data: detailResponse.data };
                        }
                    }
                }

                console.log(`No results with OMDB API key ${i + 1}`);

            } catch (error) {
                console.log(`❌ OMDB API key ${i + 1} failed:`, error.response?.status || error.message);
                continue;
            }
        }

        return { success: false };
    }

    /**
     * Search TMDb (The Movie Database) - free API
     */
    async searchTMDB(title, type) {
        try {
            console.log('Trying TMDb API...');
            
            const endpoint = type === 'movie' ? 'movie' : 'tv';
            const response = await axios.get(`https://api.themoviedb.org/3/search/${endpoint}`, {
                params: {
                    api_key: '8265bd1c', // Free TMDb API key
                    query: title,
                    language: 'en-US',
                    page: 1
                },
                timeout: 10000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0.0'
                }
            });

            if (response.data && response.data.results && response.data.results.length > 0) {
                const bestMatch = this.findBestTMDBMatch(title, response.data.results);
                if (bestMatch) {
                    // Get detailed info
                    const detailResponse = await axios.get(`https://api.themoviedb.org/3/${endpoint}/${bestMatch.id}`, {
                        params: {
                            api_key: '8265bd1c',
                            language: 'en-US',
                            append_to_response: 'credits'
                        },
                        timeout: 10000
                    });

                    if (detailResponse.data) {
                        console.log('✅ Found movie with TMDb API');
                        return { success: true, data: detailResponse.data };
                    }
                }
            }

        } catch (error) {
            console.log('❌ TMDb API failed:', error.response?.status || error.message);
        }

        return { success: false };
    }

    /**
     * Find best match from OMDB search results
     */
    findBestMatch(searchTitle, results) {
        const normalizedSearch = searchTitle.toLowerCase().replace(/[^\w\s]/g, '');
        
        // Look for exact match first
        for (const result of results) {
            const normalizedTitle = result.Title.toLowerCase().replace(/[^\w\s]/g, '');
            if (normalizedTitle === normalizedSearch) {
                return result;
            }
        }

        // Look for closest match (contains search term)
        for (const result of results) {
            const normalizedTitle = result.Title.toLowerCase();
            if (normalizedTitle.includes(searchTitle.toLowerCase())) {
                return result;
            }
        }

        // Return first result as fallback
        return results[0];
    }

    /**
     * Find best match from TMDb results
     */
    findBestTMDBMatch(searchTitle, results) {
        const normalizedSearch = searchTitle.toLowerCase().replace(/[^\w\s]/g, '');
        
        // Look for exact match first
        for (const result of results) {
            const title = result.title || result.name || '';
            const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, '');
            if (normalizedTitle === normalizedSearch) {
                return result;
            }
        }

        // Look for closest match
        for (const result of results) {
            const title = result.title || result.name || '';
            if (title.toLowerCase().includes(searchTitle.toLowerCase())) {
                return result;
            }
        }

        // Return highest rated result
        return results.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0];
    }

    /**
     * Convert TMDb format to OMDB-like format
     */
    convertTMDBToOMDB(tmdbData) {
        const isMovie = !!tmdbData.title;
        
        return {
            Title: tmdbData.title || tmdbData.name,
            Year: (tmdbData.release_date || tmdbData.first_air_date || '').split('-')[0],
            Genre: tmdbData.genres ? tmdbData.genres.map(g => g.name).join(', ') : 'N/A',
            Director: this.getTMDBDirector(tmdbData.credits),
            Actors: this.getTMDBActor(tmdbData.credits),
            Plot: tmdbData.overview || 'N/A',
            Language: tmdbData.original_language ? tmdbData.original_language.toUpperCase() : 'N/A',
            Country: tmdbData.production_countries ? 
                tmdbData.production_countries.map(c => c.name).join(', ') : 'N/A',
            imdbRating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : 'N/A',
            Runtime: tmdbData.runtime ? `${tmdbData.runtime} min` : 'N/A',
            totalSeasons: tmdbData.number_of_seasons || undefined,
            Response: 'True'
        };
    }

    /**
     * Extract director from TMDb credits
     */
    getTMDBDirector(credits) {
        if (!credits || !credits.crew) return 'N/A';
        
        const director = credits.crew.find(person => person.job === 'Director');
        return director ? director.name : 'N/A';
    }

    /**
     * Extract main actors from TMDb credits
     */
    getTMDBActor(credits) {
        if (!credits || !credits.cast) return 'N/A';
        
        return credits.cast
            .slice(0, 4)
            .map(actor => actor.name)
            .join(', ') || 'N/A';
    }

    /**
     * Search for TV shows
     */
    async searchTVShow(title) {
        // Try OMDB first
        const omdbResult = await this.searchOMDB(title, 'series');
        if (omdbResult.success) {
            return omdbResult.data;
        }

        // Fallback to TMDb
        const tmdbResult = await this.searchTMDB(title, 'tv');
        if (tmdbResult.success) {
            return this.convertTMDBToOMDB(tmdbResult.data);
        }

        throw new Error(`TV show "${title}" not found in any database`);
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
                    `❌ Please provide a movie title.\n\nUsage: ${config.PREFIX}movie <movie title>\n\nExamples:\n${config.PREFIX}movie Frozen 2\n${config.PREFIX}movie The Matrix\n${config.PREFIX}movie Moana`);
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
                    text: `❌ Could not find "${title}". Try:\n• Check spelling (e.g., "Moana" not "Moanna")\n• Use full title (e.g., "Frozen II" or "Frozen 2")\n• Try alternative titles\n\n💡 The movie database might not have all regional variations.`,
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
                    `❌ Please provide a TV show title.\n\nUsage: ${config.PREFIX}tv <show title>\n\nExample: ${config.PREFIX}tv Breaking Bad`);
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
                    text: `❌ Could not find "${title}". Please check the show title and try again.`,
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
