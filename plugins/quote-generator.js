const axios = require('axios');
const config = require('../config');

class QuoteGeneratorPlugin {
    constructor() {
        this.name = 'quote-generator';
        this.description = 'Get inspirational and funny quotes';
        this.version = '1.0.0';
        this.enabled = true;
        
        // Fallback quotes in case APIs are down
        this.fallbackQuotes = [
            { text: "The only way to do great work is to love what you do.", author: "Steve Jobs", categories: ["motivational", "success", "life"] },
            { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon", categories: ["life", "inspirational"] },
            { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", categories: ["inspirational", "motivational", "success"] },
            { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle", categories: ["inspirational", "motivational"] },
            { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney", categories: ["motivational", "success"] },
            { text: "Don't let yesterday take up too much of today.", author: "Will Rogers", categories: ["life", "motivational"] },
            { text: "You learn more from failure than from success.", author: "Unknown", categories: ["motivational", "life"] },
            { text: "If you are working on something that you really care about, you don't have to be pushed.", author: "Steve Jobs", categories: ["motivational", "success"] },
            { text: "Experience is the teacher of all things.", author: "Julius Caesar", categories: ["life", "inspirational"] },
            { text: "What we think, we become.", author: "Buddha", categories: ["inspirational", "life"] },
            { text: "Being deeply loved by someone gives you strength, while loving someone deeply gives you courage.", author: "Lao Tzu", categories: ["love"] },
            { text: "The best thing to hold onto in life is each other.", author: "Audrey Hepburn", categories: ["love", "life"] },
            { text: "Love is not about how many days, weeks or months you've been together, it's all about how much you love each other every day.", author: "Unknown", categories: ["love"] },
            { text: "A successful marriage requires falling in love many times, always with the same person.", author: "Mignon McLaughlin", categories: ["love"] },
            { text: "Life is better when you're laughing.", author: "Unknown", categories: ["funny", "life"] },
            { text: "I'm not lazy, I'm on energy saving mode.", author: "Unknown", categories: ["funny"] },
            { text: "The early bird might get the worm, but the second mouse gets the cheese.", author: "Unknown", categories: ["funny", "life"] }
        ];
        
        this.categories = ['inspirational', 'motivational', 'funny', 'love', 'life', 'success'];
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('quote', this.quoteCommand.bind(this), {
                description: 'Quote system with subcommands: author, daily, or random',
                usage: `${config.PREFIX}quote [author|daily|category]`,
                category: 'fun',
                plugin: 'quote-generator',
                source: 'quote-generator.js'
            });

            console.log('✅ Quote Generator plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Quote Generator plugin:', error);
            return false;
        }
    }

    async quoteCommand(messageInfo) {
        try {
            const subcommand = messageInfo.args[0]?.toLowerCase();
            
            // Handle subcommands
            if (subcommand === 'author') {
                await this.handleAuthorQuote(messageInfo);
                return;
            }
            
            if (subcommand === 'daily') {
                await this.handleDailyQuote(messageInfo);
                return;
            }
            
            // Handle help or show usage
            if (subcommand === 'help') {
                await this.showQuoteHelp(messageInfo);
                return;
            }
            
            // Handle random quote with optional category
            const category = subcommand || 'random';
            
            if (category !== 'random' && !this.categories.includes(category)) {
                await this.showQuoteHelp(messageInfo);
                return;
            }

            const quote = await this.getRandomQuote(category);
            if (quote.success) {
                await this.bot.messageHandler.reply(messageInfo,
                    `💬 **Quote of the Moment**\n\n` +
                    `"${quote.text}"\n\n` +
                    `— _${quote.author}_\n\n` +
                    `📂 Category: ${quote.category || 'General'}`);
            } else {
                // Use category-aware fallback quote
                const fallback = this.getCategoryFallbackQuote(category);
                await this.bot.messageHandler.reply(messageInfo,
                    `💬 **Quote of the Moment** _(offline mode)_\n\n` +
                    `"${fallback.text}"\n\n` +
                    `— _${fallback.author}_\n\n` +
                    `📂 Category: ${category === 'random' ? 'General' : category.charAt(0).toUpperCase() + category.slice(1)}`);
            }

        } catch (error) {
            console.error('Error in quote command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting quote.');
        }
    }

    async handleDailyQuote(messageInfo) {
        try {
            const quote = await this.getDailyQuote();
            if (quote.success) {
                await this.bot.messageHandler.reply(messageInfo,
                    `🌅 **Quote of the Day**\n\n` +
                    `"${quote.text}"\n\n` +
                    `— _${quote.author}_\n\n` +
                    `📅 ${new Date().toLocaleDateString()}`);
            } else {
                // Use date-based fallback
                const today = new Date().getDate();
                const fallback = this.fallbackQuotes[today % this.fallbackQuotes.length];
                await this.bot.messageHandler.reply(messageInfo,
                    `🌅 **Quote of the Day**\n\n` +
                    `"${fallback.text}"\n\n` +
                    `— _${fallback.author}_\n\n` +
                    `📅 ${new Date().toLocaleDateString()}`);
            }

        } catch (error) {
            console.error('Error in daily quote:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting daily quote.');
        }
    }

    async handleAuthorQuote(messageInfo) {
        try {
            // Remove 'author' from args and get the author name
            const authorArgs = messageInfo.args.slice(1);
            const author = authorArgs.join(' ').trim();
            
            if (!author) {
                await this.bot.messageHandler.reply(messageInfo,
                    '👤 Usage: .quote author <author_name>\n\n' +
                    'Examples:\n• .quote author Albert Einstein\n• .quote author Maya Angelou\n• .quote author Steve Jobs');
                return;
            }

            const quote = await this.getQuoteByAuthor(author);
            if (quote.success) {
                await this.bot.messageHandler.reply(messageInfo,
                    `👤 **Quote by ${quote.author}**\n\n` +
                    `"${quote.text}"\n\n` +
                    `— _${quote.author}_`);
            } else {
                // Check if the requested author matches any in our fallback quotes
                const fallbackQuote = this.fallbackQuotes.find(q => 
                    q.author.toLowerCase().includes(author.toLowerCase()) || 
                    author.toLowerCase().includes(q.author.toLowerCase())
                );
                
                if (fallbackQuote) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `👤 **Quote by ${fallbackQuote.author}** _(offline mode)_\n\n` +
                        `"${fallbackQuote.text}"\n\n` +
                        `— _${fallbackQuote.author}_`);
                } else {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ No quotes found for "${author}". The quote service is currently unavailable.\n\n` +
                        `💡 Try these available authors: Steve Jobs, Buddha, Walt Disney, Eleanor Roosevelt, Julius Caesar`);
                }
            }

        } catch (error) {
            console.error('Error in author quote:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting author quote.');
        }
    }

    async getRandomQuote(category) {
        try {
            // Try Quotable API (free, no auth required)
            let url = 'https://api.quotable.io/random';
            if (category !== 'random') {
                // Map our categories to Quotable tags
                const tagMap = {
                    'inspirational': 'inspirational',
                    'motivational': 'motivational',
                    'funny': 'humorous',
                    'love': 'love',
                    'life': 'life',
                    'success': 'success'
                };
                const tag = tagMap[category] || category;
                url += `?tags=${tag}`;
            }

            const response = await axios.get(url, { timeout: 8000 });
            
            if (response.data && response.data.content) {
                return {
                    success: true,
                    text: response.data.content,
                    author: response.data.author,
                    category: category
                };
            }

            throw new Error('No quote data received');

        } catch (error) {
            console.error('Quote API error:', error.message);
            return { success: false };
        }
    }

    async getDailyQuote() {
        try {
            // Use Quotable's quote of the day endpoint
            const response = await axios.get('https://api.quotable.io/today', {
                timeout: 8000
            });

            if (response.data && response.data.content) {
                return {
                    success: true,
                    text: response.data.content,
                    author: response.data.author
                };
            }

            throw new Error('No daily quote data received');

        } catch (error) {
            console.error('Daily quote API error:', error.message);
            return { success: false };
        }
    }

    async getQuoteByAuthor(author) {
        try {
            // Search for quotes by specific author
            const response = await axios.get('https://api.quotable.io/quotes', {
                params: {
                    author: author,
                    limit: 1
                },
                timeout: 8000
            });

            if (response.data && response.data.results && response.data.results.length > 0) {
                const quote = response.data.results[0];
                return {
                    success: true,
                    text: quote.content,
                    author: quote.author
                };
            }

            return { success: false };

        } catch (error) {
            console.error('Author quote API error:', error.message);
            return { success: false };
        }
    }

    getCategoryFallbackQuote(category) {
        // Filter quotes by category
        let filteredQuotes = this.fallbackQuotes;
        
        if (category && category !== 'random') {
            filteredQuotes = this.fallbackQuotes.filter(quote => 
                quote.categories && quote.categories.includes(category.toLowerCase())
            );
        }
        
        // If no quotes found for the category, use all quotes
        if (filteredQuotes.length === 0) {
            filteredQuotes = this.fallbackQuotes;
        }
        
        // Return random quote from filtered results
        return filteredQuotes[Math.floor(Math.random() * filteredQuotes.length)];
    }

    async showQuoteHelp(messageInfo) {
        await this.bot.messageHandler.reply(messageInfo,
            `💬 **Quote Generator Commands**\n\n` +
            `**Usage:**\n` +
            `• \`.quote\` - Random quote\n` +
            `• \`.quote daily\` - Quote of the day\n` +
            `• \`.quote author <name>\` - Quote by specific author\n` +
            `• \`.quote <category>\` - Quote from category\n\n` +
            `**Available categories:**\n${this.categories.map(c => `• ${c}`).join('\n')}\n\n` +
            `**Examples:**\n` +
            `• \`.quote\`\n` +
            `• \`.quote daily\`\n` +
            `• \`.quote author Steve Jobs\`\n` +
            `• \`.quote inspirational\`\n` +
            `• \`.quote funny\``);
    }

    async cleanup() {
        console.log('🧹 Quote Generator plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new QuoteGeneratorPlugin();
        await plugin.init(bot);
        return plugin;
    }
};