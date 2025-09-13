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
            { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs", categories: ["motivational", "success"] },
            { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs", categories: ["motivational", "life"] },
            { text: "Imagination is more important than knowledge.", author: "Albert Einstein", categories: ["inspirational", "life"] },
            { text: "Try not to become a person of success, but rather try to become a person of value.", author: "Albert Einstein", categories: ["success", "inspirational"] },
            { text: "The important thing is not to stop questioning.", author: "Albert Einstein", categories: ["inspirational", "life"] },
            { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon", categories: ["life", "inspirational"] },
            { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", categories: ["inspirational", "motivational", "success"] },
            { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle", categories: ["inspirational", "motivational"] },
            { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney", categories: ["motivational", "success"] },
            { text: "All our dreams can come true, if we have the courage to pursue them.", author: "Walt Disney", categories: ["motivational", "success"] },
            { text: "Don't let yesterday take up too much of today.", author: "Will Rogers", categories: ["life", "motivational"] },
            { text: "You learn more from failure than from success.", author: "Unknown", categories: ["motivational", "life"] },
            { text: "Experience is the teacher of all things.", author: "Julius Caesar", categories: ["life", "inspirational"] },
            { text: "What we think, we become.", author: "Buddha", categories: ["inspirational", "life"] },
            { text: "Peace comes from within. Do not seek it without.", author: "Buddha", categories: ["inspirational", "life"] },
            { text: "The mind is everything. What you think you become.", author: "Buddha", categories: ["inspirational", "motivational"] },
            { text: "Being deeply loved by someone gives you strength, while loving someone deeply gives you courage.", author: "Lao Tzu", categories: ["love"] },
            { text: "The best thing to hold onto in life is each other.", author: "Audrey Hepburn", categories: ["love", "life"] },
            { text: "Love is not about how many days, weeks or months you've been together, it's all about how much you love each other every day.", author: "Unknown", categories: ["love"] },
            { text: "A successful marriage requires falling in love many times, always with the same person.", author: "Mignon McLaughlin", categories: ["love"] },
            { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde", categories: ["life", "inspirational"] },
            { text: "Two things are infinite: the universe and human stupidity; and I'm not sure about the universe.", author: "Albert Einstein", categories: ["funny", "life"] },
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
        // Array of working APIs to try
        const apis = [
            // API 1: ZenQuotes (reliable and free)
            async () => {
                const response = await axios.get('https://zenquotes.io/api/random', { 
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                if (response.data && response.data[0]) {
                    return {
                        success: true,
                        text: response.data[0].q,
                        author: response.data[0].a,
                        category: category
                    };
                }
                throw new Error('No data');
            },
            
            // API 2: QuoteGarden (backup)
            async () => {
                const response = await axios.get('https://quotegarden.herokuapp.com/api/v3/quotes/random', { 
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                if (response.data && response.data.statusCode === 200 && response.data.data) {
                    return {
                        success: true,
                        text: response.data.data.quoteText,
                        author: response.data.data.quoteAuthor,
                        category: category
                    };
                }
                throw new Error('No data');
            },
            
            // API 3: Quotable (original, keep as backup)
            async () => {
                let url = 'https://api.quotable.io/random';
                if (category !== 'random') {
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
                
                const response = await axios.get(url, { 
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                
                if (response.data && response.data.content) {
                    return {
                        success: true,
                        text: response.data.content,
                        author: response.data.author,
                        category: category
                    };
                }
                throw new Error('No data');
            }
        ];

        // Try each API in sequence
        for (let i = 0; i < apis.length; i++) {
            try {
                console.log(`📡 Trying API ${i + 1}/3 for quotes...`);
                const result = await apis[i]();
                console.log(`✅ API ${i + 1} successful for quotes`);
                return result;
            } catch (error) {
                console.log(`❌ API ${i + 1} failed: ${error.message}`);
                if (i === apis.length - 1) {
                    console.log('🔄 All quote APIs failed, using fallback');
                }
            }
        }

        return { success: false };
    }

    async getDailyQuote() {
        // Try multiple APIs for daily quotes
        const apis = [
            // ZenQuotes daily quote
            async () => {
                const response = await axios.get('https://zenquotes.io/api/today', { 
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                if (response.data && response.data[0]) {
                    return {
                        success: true,
                        text: response.data[0].q,
                        author: response.data[0].a
                    };
                }
                throw new Error('No data');
            },
            
            // Fallback to random quote from ZenQuotes
            async () => {
                const response = await axios.get('https://zenquotes.io/api/random', { 
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                if (response.data && response.data[0]) {
                    return {
                        success: true,
                        text: response.data[0].q,
                        author: response.data[0].a
                    };
                }
                throw new Error('No data');
            }
        ];

        for (let i = 0; i < apis.length; i++) {
            try {
                console.log(`📡 Trying daily quote API ${i + 1}/2...`);
                const result = await apis[i]();
                console.log(`✅ Daily quote API ${i + 1} successful`);
                return result;
            } catch (error) {
                console.log(`❌ Daily quote API ${i + 1} failed: ${error.message}`);
            }
        }

        console.log('🔄 All daily quote APIs failed, using fallback');
        return { success: false };
    }

    async getQuoteByAuthor(author) {
        // Try multiple APIs for author search
        const apis = [
            // ZenQuotes author search (most reliable)
            async () => {
                const response = await axios.get(`https://zenquotes.io/api/quotes/${encodeURIComponent(author)}`, {
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    const quote = response.data[0];
                    return {
                        success: true,
                        text: quote.q,
                        author: quote.a
                    };
                }
                throw new Error('No data');
            },
            
            // Try searching quotes with author name in content from ZenQuotes
            async () => {
                const response = await axios.get('https://zenquotes.io/api/random', { 
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                
                // This gets a random quote - not ideal but better than nothing
                if (response.data && response.data[0]) {
                    return {
                        success: true,
                        text: response.data[0].q,
                        author: response.data[0].a
                    };
                }
                throw new Error('No data');
            },
            
            // QuoteGarden as backup
            async () => {
                const response = await axios.get(`https://quotegarden.herokuapp.com/api/v3/quotes`, {
                    params: {
                        author: author,
                        limit: 1
                    },
                    timeout: 5000,
                    headers: { 'User-Agent': 'MATDEV-Bot/2.0' }
                });
                
                if (response.data && response.data.statusCode === 200 && response.data.data && response.data.data.length > 0) {
                    const quote = response.data.data[0];
                    return {
                        success: true,
                        text: quote.quoteText,
                        author: quote.quoteAuthor
                    };
                }
                throw new Error('No data');
            }
        ];

        for (let i = 0; i < apis.length; i++) {
            try {
                console.log(`📡 Trying author quote API ${i + 1}/3 for "${author}"...`);
                const result = await apis[i]();
                console.log(`✅ Author quote API ${i + 1} successful`);
                return result;
            } catch (error) {
                console.log(`❌ Author quote API ${i + 1} failed: ${error.message}`);
            }
        }

        console.log(`🔄 All author quote APIs failed for "${author}", using fallback`);
        return { success: false };
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