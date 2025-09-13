const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');

class NewsFeedPlugin {
    constructor() {
        this.name = 'news-feed';
        this.description = 'Get latest news from various sources and scheduled notifications';
        this.version = '2.0.0';
        this.enabled = true;
        
        // Categories for news
        this.categories = ['general', 'sports', 'health', 'business', 'technology', 'entertainment'];
        
        // Storage paths
        this.newsSettingsPath = path.join(__dirname, '../session/storage/news_settings.json');
        this.newsSettings = new Map();
        this.newsCheckInterval = null;
        
        // Schedule times (7am and 7pm)
        this.scheduleTimes = ['07:00', '19:00'];
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Load news settings
            await this.loadNewsSettings();
            
            // Start news scheduler
            this.startNewsScheduler();
            
            // Register existing commands
            this.bot.messageHandler.registerCommand('news', this.newsCommand.bind(this), {
                description: 'Get latest news or manage news notifications',
                usage: `${config.PREFIX}news [category] | ${config.PREFIX}news [category] on/off`,
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
            const args = messageInfo.args;
            const userJid = messageInfo.from;
            
            // Handle different command patterns
            if (args.length === 0) {
                // .news - get general news
                return await this.handleNewsRequest('general', messageInfo);
            } else if (args.length === 1) {
                const param = args[0].toLowerCase();
                
                if (param === 'on') {
                    // .news on - enable all news notifications
                    return await this.toggleAllNewsNotifications(userJid, true, messageInfo);
                } else if (param === 'off') {
                    // .news off - disable all news notifications  
                    return await this.toggleAllNewsNotifications(userJid, false, messageInfo);
                } else if (param === 'status') {
                    // .news status - show current settings
                    return await this.showNewsStatus(userJid, messageInfo);
                } else if (this.categories.includes(param)) {
                    // .news <category> - get news for category
                    return await this.handleNewsRequest(param, messageInfo);
                } else if (param.includes('@') || /^\d+$/.test(param)) {
                    // .news <jid> - set default destination for scheduled news
                    return await this.setNewsDestination(param, messageInfo);
                }
            } else if (args.length === 2) {
                const category = args[0].toLowerCase();
                const action = args[1].toLowerCase();
                
                if (this.categories.includes(category) && (action === 'on' || action === 'off')) {
                    // .news <category> on/off - toggle specific category
                    return await this.toggleCategoryNotification(userJid, category, action === 'on', messageInfo);
                }
            }
            
            // Show usage if command doesn't match patterns
            await this.bot.messageHandler.reply(messageInfo,
                `📰 **News Commands:**\n\n` +
                `**Get News:**\n` +
                `• \`.news\` - General news\n` +
                `• \`.news <category>\` - Category news\n\n` +
                `**Notifications (7am & 7pm daily):**\n` +
                `• \`.news on/off\` - All categories\n` +
                `• \`.news <category> on/off\` - Specific category\n` +
                `• \`.news <jid>\` - Set destination for scheduled news\n` +
                `• \`.news status\` - View current settings\n\n` +
                `**Categories:**\n${this.categories.map(c => `• ${c}`).join('\n')}\n\n` +
                `**Examples:**\n` +
                `• \`.news sports on\`\n` +
                `• \`.news health off\`\n` +
                `• \`.news 2347018091555\`\n` +
                `• \`.news user@g.us\``);

        } catch (error) {
            console.error('Error in news command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing news command.');
        }
    }

    async handleNewsRequest(category, messageInfo) {
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
            // Use free news sources as fallback with category-specific RSS feeds
            let rssUrl = 'https://feeds.bbci.co.uk/news/rss.xml'; // Default to general
            
            if (category === 'technology') {
                rssUrl = 'https://feeds.bbci.co.uk/news/technology/rss.xml';
            } else if (category === 'business') {
                rssUrl = 'https://feeds.bbci.co.uk/news/business/rss.xml';
            } else if (category === 'sports') {
                rssUrl = 'https://feeds.bbci.co.uk/sport/rss.xml';
            } else if (category === 'health') {
                rssUrl = 'https://feeds.bbci.co.uk/news/health/rss.xml';
            } else if (category === 'entertainment') {
                rssUrl = 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml';
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
            // Improved RSS parsing to correctly match title, link, and description from same item
            const items = [];
            
            // Extract individual RSS items first
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let itemMatch;
            let count = 0;

            while ((itemMatch = itemRegex.exec(xmlData)) && count < 5) {
                const itemContent = itemMatch[1];
                
                // Extract title, link, and description from this specific item
                const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
                const linkMatch = itemContent.match(/<link>(.*?)<\/link>/) || 
                                itemContent.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/);
                const descMatch = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
                
                if (titleMatch && titleMatch[1] && !titleMatch[1].includes('BBC News')) {
                    const title = titleMatch[1].trim();
                    const url = linkMatch ? linkMatch[1].trim() : '#';
                    const description = descMatch ? this.truncateText(descMatch[1].trim(), 100) : 'No description';
                    
                    // Validate URL format
                    const validUrl = url.startsWith('http') ? url : '#';
                    
                    items.push({
                        title: title,
                        url: validUrl,
                        description: description,
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

    // News Settings Management
    async loadNewsSettings() {
        try {
            if (fs.existsSync(this.newsSettingsPath)) {
                const data = fs.readJsonSync(this.newsSettingsPath);
                this.newsSettings = new Map(Object.entries(data));
                console.log(`📰 Loaded news settings for ${this.newsSettings.size} users`);
            } else {
                fs.ensureDirSync(path.dirname(this.newsSettingsPath));
                await this.saveNewsSettings();
            }
        } catch (error) {
            console.warn('⚠️  Error loading news settings:', error.message);
            this.newsSettings = new Map();
        }
    }

    async saveNewsSettings() {
        try {
            const dataObj = Object.fromEntries(this.newsSettings);
            fs.writeJsonSync(this.newsSettingsPath, dataObj, { spaces: 2 });
        } catch (error) {
            console.error('❌ Error saving news settings:', error.message);
        }
    }

    // Get user's news settings
    getUserSettings(userJid) {
        return this.newsSettings.get(userJid) || {
            enabled: false,
            categories: {
                general: false,
                sports: false,
                health: false,
                business: false,
                technology: false,
                entertainment: false
            }
        };
    }

    // Set user's news settings
    async setUserSettings(userJid, settings) {
        this.newsSettings.set(userJid, settings);
        await this.saveNewsSettings();
    }

    // Toggle all news notifications
    async toggleAllNewsNotifications(userJid, enable, messageInfo) {
        const settings = this.getUserSettings(userJid);
        settings.enabled = enable;
        
        // Enable/disable all categories
        Object.keys(settings.categories).forEach(category => {
            settings.categories[category] = enable;
        });

        await this.setUserSettings(userJid, settings);

        const status = enable ? 'enabled' : 'disabled';
        const emoji = enable ? '🟢' : '🔴';
        
        await this.bot.messageHandler.reply(messageInfo,
            `${emoji} **News notifications ${status}**\n\n` +
            `All categories (general, sports, health, business, technology, entertainment) are now ${status}.\n\n` +
            `📅 You'll receive news at **7:00 AM** and **7:00 PM** daily (Lagos time)`);
    }

    // Toggle specific category notification
    async toggleCategoryNotification(userJid, category, enable, messageInfo) {
        const settings = this.getUserSettings(userJid);
        settings.categories[category] = enable;
        
        // Update overall enabled status
        settings.enabled = Object.values(settings.categories).some(enabled => enabled);

        await this.setUserSettings(userJid, settings);

        const status = enable ? 'enabled' : 'disabled';
        const emoji = enable ? '🟢' : '🔴';
        
        await this.bot.messageHandler.reply(messageInfo,
            `${emoji} **${category.toUpperCase()} news notifications ${status}**\n\n` +
            `📅 You'll receive ${category} news at **7:00 AM** and **7:00 PM** daily (Lagos time)`);
    }

    // Set news destination JID
    async setNewsDestination(jid, messageInfo) {
        let newDefaultJid = jid;

        // Normalize JID format
        if (!newDefaultJid.includes('@')) {
            newDefaultJid = `${newDefaultJid}@s.whatsapp.net`;
        }

        // Save the new default destination
        this.bot.database.setData('newsDefaultDestination', newDefaultJid);
        console.log(`✅ Default news destination set to: ${newDefaultJid}`);

        await this.bot.messageHandler.reply(messageInfo,
            `✅ **News destination updated!**\n\n` +
            `📍 **Target:** ${newDefaultJid}\n\n` +
            `📅 Scheduled news (7am & 7pm) will now be sent to this destination.\n\n` +
            `💡 Use \`.news status\` to view your current settings.`);
    }

    // Show current news status
    async showNewsStatus(userJid, messageInfo) {
        const settings = this.getUserSettings(userJid);
        const newsDestination = this.bot.database.getData('newsDefaultDestination') || `${config.OWNER_NUMBER}@s.whatsapp.net (Bot private chat)`;
        
        let message = `📰 **Your News Notification Settings**\n\n`;
        message += `**Overall Status:** ${settings.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n\n`;
        
        message += `**Categories:**\n`;
        Object.entries(settings.categories).forEach(([category, enabled]) => {
            const emoji = enabled ? '🟢' : '🔴';
            message += `• ${category}: ${emoji}\n`;
        });

        message += `\n📅 **Schedule:** 7:00 AM & 7:00 PM daily (Lagos time)\n`;
        message += `📍 **Destination:** ${newsDestination}`;
        
        await this.bot.messageHandler.reply(messageInfo, message);
    }

    // News Scheduler
    startNewsScheduler() {
        if (this.newsCheckInterval) {
            clearInterval(this.newsCheckInterval);
        }
        
        // Check every minute for scheduled times
        this.newsCheckInterval = setInterval(() => {
            this.checkScheduledNews();
        }, 60000);
        
        // Initial check after 5 seconds
        setTimeout(() => this.checkScheduledNews(), 5000);
    }

    async checkScheduledNews() {
        const now = moment().tz(config.TIMEZONE);
        const currentTime = now.format('HH:mm');
        
        // Check if current time matches any of our schedule times
        if (this.scheduleTimes.includes(currentTime)) {
            // Prevent duplicate sends by tracking last delivery time
            const lastDeliveryKey = `last_delivery_${currentTime}`;
            const today = now.format('YYYY-MM-DD');
            const lastDeliveryDate = this.lastDeliveryDate || {};
            
            if (lastDeliveryDate[lastDeliveryKey] === today) {
                return; // Already delivered today at this time
            }
            
            console.log(`📰 News scheduled delivery time: ${currentTime}`);
            await this.sendScheduledNews();
            
            // Mark as delivered today
            lastDeliveryDate[lastDeliveryKey] = today;
            this.lastDeliveryDate = lastDeliveryDate;
        }
    }

    async sendScheduledNews() {
        // Get the target destination for news delivery
        const newsDestination = this.bot.database.getData('newsDefaultDestination') || `${config.OWNER_NUMBER}@s.whatsapp.net`;
        
        // Check if anyone has news enabled
        const enabledUsers = Array.from(this.newsSettings.entries()).filter(([, settings]) => settings.enabled);
        
        if (enabledUsers.length === 0) {
            return; // No one has news enabled
        }

        try {
            // Collect all enabled categories from all users
            const allEnabledCategories = new Set();
            for (const [userJid, settings] of enabledUsers) {
                Object.entries(settings.categories).forEach(([category, enabled]) => {
                    if (enabled) {
                        allEnabledCategories.add(category);
                    }
                });
            }

            // Send news for each enabled category to the destination
            for (const category of allEnabledCategories) {
                await this.sendNewsToDestination(newsDestination, category);
                // Add small delay between messages
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            console.error(`❌ Error sending scheduled news:`, error.message);
        }
    }

    async sendNewsToDestination(destinationJid, category) {
        try {
            const news = await this.getNews(category);
            if (news.success && news.articles.length > 0) {
                const now = moment().tz(config.TIMEZONE);
                const timeEmoji = now.hour() < 12 ? '🌅' : '🌆';
                
                let message = `${timeEmoji} **${category.toUpperCase()} NEWS UPDATE**\n\n`;
                
                // Send top 3 articles for scheduled news
                news.articles.slice(0, 3).forEach((article, index) => {
                    message += `**${index + 1}.** ${article.title}\n`;
                    message += `${article.description}\n`;
                    message += `🔗 ${article.url}\n\n`;
                });

                message += `📅 ${now.format('dddd, MMMM Do YYYY, h:mm A')}\n`;
                message += `💡 Type \`.news ${category} off\` to manage category settings`;
                
                await this.bot.sock.sendMessage(destinationJid, { text: message });
                console.log(`📰 Sent ${category} news to ${destinationJid}`);
            }
        } catch (error) {
            console.error(`❌ Error sending ${category} news to ${destinationJid}:`, error.message);
        }
    }

    async cleanup() {
        if (this.newsCheckInterval) {
            clearInterval(this.newsCheckInterval);
        }
        await this.saveNewsSettings();
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