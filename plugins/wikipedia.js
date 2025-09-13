const axios = require('axios');
const config = require('../config');

class WikipediaPlugin {
    constructor() {
        this.name = 'wikipedia';
        this.description = 'Search Wikipedia articles and get quick information';
        this.version = '1.0.0';
        this.enabled = true;
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('wiki', this.wikiCommand.bind(this), {
                description: 'Search Wikipedia',
                usage: `${config.PREFIX}wiki <search_term>`,
                category: 'information',
                plugin: 'wikipedia',
                source: 'wikipedia.js'
            });

            this.bot.messageHandler.registerCommand('wikisummary', this.wikiSummaryCommand.bind(this), {
                description: 'Get Wikipedia article summary',
                usage: `${config.PREFIX}wikisummary <article_title>`,
                category: 'information',
                plugin: 'wikipedia',
                source: 'wikipedia.js'
            });

            console.log('✅ Wikipedia plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Wikipedia plugin:', error);
            return false;
        }
    }

    async wikiCommand(messageInfo) {
        try {
            const query = messageInfo.args.join(' ').trim();
            if (!query) {
                await this.bot.messageHandler.reply(messageInfo,
                    '📖 Usage: .wiki <search_term>\n\n' +
                    'Examples:\n• .wiki Albert Einstein\n• .wiki Machine Learning\n• .wiki Nigeria history');
                return;
            }

            const results = await this.searchWikipedia(query);
            if (results.success) {
                if (results.results.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, `❌ No Wikipedia articles found for "${query}"`);
                    return;
                }

                let message = `📖 **Wikipedia Search: "${query}"**\n\n`;
                
                results.results.slice(0, 5).forEach((result, index) => {
                    message += `**${index + 1}.** ${result.title}\n${result.snippet}\n\n`;
                });

                message += `🔗 Use .wikisummary <title> to get full article summary`;
                
                await this.bot.messageHandler.reply(messageInfo, message);
            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${results.error}`);
            }

        } catch (error) {
            console.error('Error in wiki command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error searching Wikipedia.');
        }
    }

    async wikiSummaryCommand(messageInfo) {
        try {
            const title = messageInfo.args.join(' ').trim();
            if (!title) {
                await this.bot.messageHandler.reply(messageInfo,
                    '📚 Usage: .wikisummary <article_title>\n\n' +
                    'Examples:\n• .wikisummary Albert Einstein\n• .wikisummary Python programming language');
                return;
            }

            const summary = await this.getWikipediaSummary(title);
            if (summary.success) {
                await this.bot.messageHandler.reply(messageInfo,
                    `📚 **Wikipedia Summary**\n\n` +
                    `**Title:** ${summary.title}\n\n` +
                    `${summary.extract}\n\n` +
                    `🔗 **Full article:** ${summary.url}`);
            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${summary.error}`);
            }

        } catch (error) {
            console.error('Error in wikisummary command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting Wikipedia summary.');
        }
    }

    async searchWikipedia(query) {
        try {
            const response = await axios.get('https://en.wikipedia.org/api/rest_v1/page/search', {
                params: {
                    q: query,
                    limit: 5
                },
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0 (https://github.com/matdev; matdev@bot.com)'
                },
                timeout: 10000
            });

            if (response.data && response.data.pages) {
                return {
                    success: true,
                    results: response.data.pages.map(page => ({
                        title: page.title,
                        snippet: this.cleanSnippet(page.description || page.excerpt || 'No description available'),
                        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
                    }))
                };
            }

            return {
                success: false,
                error: 'No results found'
            };

        } catch (error) {
            console.error('Wikipedia search error:', error.message);
            return {
                success: false,
                error: 'Wikipedia search temporarily unavailable'
            };
        }
    }

    async getWikipediaSummary(title) {
        try {
            const response = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
                headers: {
                    'User-Agent': 'MATDEV-Bot/1.0 (https://github.com/matdev; matdev@bot.com)'
                },
                timeout: 10000
            });

            if (response.data && response.data.extract) {
                let extract = response.data.extract;
                
                // Limit length for WhatsApp
                if (extract.length > 800) {
                    extract = extract.substring(0, 800) + '...';
                }

                return {
                    success: true,
                    title: response.data.title,
                    extract: extract,
                    url: response.data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
                };
            }

            return {
                success: false,
                error: `No Wikipedia article found for "${title}"`
            };

        } catch (error) {
            if (error.response && error.response.status === 404) {
                return {
                    success: false,
                    error: `Article "${title}" not found on Wikipedia`
                };
            }

            console.error('Wikipedia summary error:', error.message);
            return {
                success: false,
                error: 'Wikipedia temporarily unavailable'
            };
        }
    }

    cleanSnippet(text) {
        return text
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&[^;]+;/g, '') // Remove HTML entities
            .substring(0, 150) + (text.length > 150 ? '...' : '');
    }

    async cleanup() {
        console.log('🧹 Wikipedia plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new WikipediaPlugin();
        await plugin.init(bot);
        return plugin;
    }
};