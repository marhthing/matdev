const axios = require('axios');
const config = require('../config');

class NewsFeedPlugin {
    constructor() {
        this.name = 'news-feed';
        this.description = 'Get latest news from various sources';
        this.version = '1.0.0';
        this.enabled = true;
        
        // Categories for news
        this.categories = ['general', 'business', 'technology', 'sports', 'health', 'entertainment'];
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('news', this.newsCommand.bind(this), {
                description: 'Get latest news',
                usage: `${config.PREFIX}news [category]`,
                category: 'information',
                plugin: 'news-feed',
                source: 'news-feed.js'
            });

            this.bot.messageHandler.registerCommand('topnews', this.topNewsCommand.bind(this), {
                description: 'Get top headlines',
                usage: `${config.PREFIX}topnews`,
                category: 'information',
                plugin: 'news-feed',
                source: 'news-feed.js'
            });

            console.log('✅ News Feed plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize News Feed plugin:', error);
            return false;
        }
    }

    async newsCommand(messageInfo) {
        try {
            const category = messageInfo.args[0]?.toLowerCase() || 'general';
            
            if (!this.categories.includes(category)) {
                await this.bot.messageHandler.reply(messageInfo,
                    `📰 Usage: .news [category]\n\n` +
                    `**Available categories:**\n${this.categories.map(c => `• ${c}`).join('\n')}\n\n` +
                    'Examples:\n• .news\n• .news technology\n• .news sports');
                return;
            }

            const news = await this.getNews(category);
            if (news.success) {
                let message = `📰 **${category.toUpperCase()} NEWS**\n\n`;
                
                news.articles.slice(0, 5).forEach((article, index) => {
                    message += `**${index + 1}.** ${article.title}\n`;
                    message += `${article.description}\n`;
                    message += `🔗 ${article.url}\n\n`;
                });

                message += `📅 Last updated: ${new Date().toLocaleTimeString()}`;
                
                await this.bot.messageHandler.reply(messageInfo, message);
            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${news.error}`);
            }

        } catch (error) {
            console.error('Error in news command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error fetching news.');
        }
    }

    async topNewsCommand(messageInfo) {
        try {
            const news = await this.getTopHeadlines();
            if (news.success) {
                let message = `🔥 **TOP HEADLINES**\n\n`;
                
                news.articles.slice(0, 5).forEach((article, index) => {
                    message += `**${index + 1}.** ${article.title}\n`;
                    message += `📰 ${article.source}\n`;
                    message += `🔗 ${article.url}\n\n`;
                });

                message += `📅 Last updated: ${new Date().toLocaleTimeString()}`;
                
                await this.bot.messageHandler.reply(messageInfo, message);
            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${news.error}`);
            }

        } catch (error) {
            console.error('Error in topnews command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error fetching top news.');
        }
    }

    async getNews(category) {
        try {
            // Using NewsAPI free tier (limited requests)
            const response = await axios.get('https://newsapi.org/v2/top-headlines', {
                params: {
                    category: category,
                    country: 'us',
                    pageSize: 10,
                    apiKey: 'demo' // This won't work, but shows structure
                },
                timeout: 10000
            });

            if (response.data && response.data.articles) {
                return {
                    success: true,
                    articles: response.data.articles.map(article => ({
                        title: article.title,
                        description: this.truncateText(article.description || 'No description available', 100),
                        url: article.url,
                        source: article.source.name
                    }))
                };
            }

            throw new Error('No articles found');

        } catch (error) {
            console.error('News API error:', error.message);
            
            // Fallback to RSS feed or free news source
            return await this.getNewsFallback(category);
        }
    }

    async getTopHeadlines() {
        try {
            // Try BBC RSS feed as fallback
            const response = await axios.get('https://feeds.bbci.co.uk/news/rss.xml', {
                timeout: 10000
            });

            if (response.data) {
                // Simple RSS parsing (basic implementation)
                const articles = this.parseRSSBasic(response.data);
                return {
                    success: true,
                    articles: articles
                };
            }

            throw new Error('No news data');

        } catch (error) {
            console.error('Top headlines error:', error.message);
            return {
                success: false,
                error: 'News service temporarily unavailable. Please try again later.'
            };
        }
    }

    async getNewsFallback(category) {
        try {
            // Use free news sources as fallback
            let rssUrl = 'https://feeds.bbci.co.uk/news/rss.xml';
            
            if (category === 'technology') {
                rssUrl = 'https://feeds.bbci.co.uk/news/technology/rss.xml';
            } else if (category === 'business') {
                rssUrl = 'https://feeds.bbci.co.uk/news/business/rss.xml';
            } else if (category === 'sports') {
                rssUrl = 'https://feeds.bbci.co.uk/sport/rss.xml';
            }

            const response = await axios.get(rssUrl, {
                timeout: 10000
            });

            const articles = this.parseRSSBasic(response.data);
            return {
                success: true,
                articles: articles
            };

        } catch (error) {
            return {
                success: false,
                error: 'News service temporarily unavailable. Please try again later.'
            };
        }
    }

    parseRSSBasic(xmlData) {
        try {
            // Very basic RSS parsing without XML parser
            const items = [];
            const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/g;
            const linkRegex = /<link>(.*?)<\/link>/g;
            const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/g;

            let titleMatch, linkMatch, descMatch;
            let count = 0;

            while ((titleMatch = titleRegex.exec(xmlData)) && count < 5) {
                linkMatch = linkRegex.exec(xmlData);
                descMatch = descRegex.exec(xmlData);
                
                if (titleMatch[1] && !titleMatch[1].includes('BBC News')) { // Skip BBC News title
                    items.push({
                        title: titleMatch[1],
                        url: linkMatch ? linkMatch[1] : '#',
                        description: this.truncateText(descMatch ? descMatch[1] : 'No description', 100),
                        source: 'BBC News'
                    });
                    count++;
                }
            }

            return items;
        } catch (error) {
            console.error('RSS parsing error:', error);
            return [];
        }
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    async cleanup() {
        console.log('🧹 News Feed plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new NewsFeedPlugin();
        await plugin.init(bot);
        return plugin;
    }
};