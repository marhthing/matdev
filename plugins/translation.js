const axios = require('axios');
const config = require('../config');

class TranslationPlugin {
    constructor() {
        this.name = 'translation';
        this.description = 'Translate text between different languages using free APIs';
        this.version = '1.0.0';
        this.enabled = true;
        
        // Common language codes
        this.languages = {
            'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian',
            'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
            'ar': 'Arabic', 'hi': 'Hindi', 'tr': 'Turkish', 'pl': 'Polish', 'nl': 'Dutch',
            'sv': 'Swedish', 'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish', 'cs': 'Czech',
            'hu': 'Hungarian', 'ro': 'Romanian', 'bg': 'Bulgarian', 'hr': 'Croatian', 'sk': 'Slovak',
            'sl': 'Slovenian', 'et': 'Estonian', 'lv': 'Latvian', 'lt': 'Lithuanian', 'mt': 'Maltese'
        };
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('translate', this.translateCommand.bind(this), {
                description: 'Translate text to another language',
                usage: `${config.PREFIX}translate <to_language> <text>`,
                category: 'utility',
                plugin: 'translation',
                source: 'translation.js'
            });

            this.bot.messageHandler.registerCommand('languages', this.languagesCommand.bind(this), {
                description: 'List available languages for translation',
                usage: `${config.PREFIX}languages`,
                category: 'utility',
                plugin: 'translation',
                source: 'translation.js'
            });

            console.log('✅ Translation plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Translation plugin:', error);
            return false;
        }
    }

    async translateCommand(messageInfo) {
        try {
            const args = messageInfo.args;
            if (args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🌐 Usage: .translate <to_language> <text>\n\n' +
                    'Examples:\n• .translate spanish Hello world\n• .translate fr Good morning\n• .translate zh How are you?\n\n' +
                    'Use .languages to see available language codes');
                return;
            }

            const toLang = args[0].toLowerCase();
            const text = args.slice(1).join(' ');

            if (text.length > 500) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long! Maximum 500 characters for translation.');
                return;
            }

            // Convert full language names to codes
            const toLangCode = this.getLanguageCode(toLang);
            if (!toLangCode) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Language "${toLang}" not supported.\n\n` +
                    'Use .languages to see available options');
                return;
            }

            const translation = await this.translateText(text, toLangCode);
            if (translation.success) {
                await this.bot.messageHandler.reply(messageInfo,
                    `🌐 **Translation**\n\n` +
                    `**From:** ${this.languages[translation.fromLang] || translation.fromLang}\n` +
                    `**To:** ${this.languages[toLangCode]}\n\n` +
                    `**Original:**\n${text}\n\n` +
                    `**Translation:**\n${translation.text}`);
            } else {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${translation.error}`);
            }

        } catch (error) {
            console.error('Error in translate command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing translation.');
        }
    }

    async languagesCommand(messageInfo) {
        try {
            const langList = Object.entries(this.languages)
                .map(([code, name]) => `**${code}** - ${name}`)
                .join('\n');

            await this.bot.messageHandler.reply(messageInfo,
                `🌐 **Available Languages**\n\n${langList}\n\n` +
                'Usage: .translate <code> <text>\nExample: .translate es Hello world');

        } catch (error) {
            console.error('Error in languages command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing languages.');
        }
    }

    async translateText(text, toLang) {
        try {
            // Try MyMemory API (free, no API key required)
            const response = await axios.get('https://api.mymemory.translated.net/get', {
                params: {
                    q: text,
                    langpair: `en|${toLang}`, // Assuming source is English for now
                    de: 'matdev@bot.com'
                },
                timeout: 10000
            });

            if (response.data && response.data.responseStatus === 200) {
                return {
                    success: true,
                    text: response.data.responseData.translatedText,
                    fromLang: 'en'
                };
            }

            throw new Error('Translation API returned an error');

        } catch (error) {
            console.error('Translation error:', error.message);
            
            // Try LibreTranslate as backup (if available)
            try {
                const libreResponse = await axios.post('https://libretranslate.de/translate', {
                    q: text,
                    source: 'en',
                    target: toLang,
                    format: 'text'
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (libreResponse.data && libreResponse.data.translatedText) {
                    return {
                        success: true,
                        text: libreResponse.data.translatedText,
                        fromLang: 'en'
                    };
                }
            } catch (libreError) {
                console.error('LibreTranslate error:', libreError.message);
            }

            return {
                success: false,
                error: 'Translation service temporarily unavailable. Please try again later.'
            };
        }
    }

    getLanguageCode(input) {
        const lower = input.toLowerCase();
        
        // Check if it's already a valid code
        if (this.languages[lower]) {
            return lower;
        }
        
        // Check if it's a language name
        for (const [code, name] of Object.entries(this.languages)) {
            if (name.toLowerCase() === lower) {
                return code;
            }
        }
        
        return null;
    }

    async cleanup() {
        console.log('🧹 Translation plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new TranslationPlugin();
        await plugin.init(bot);
        return plugin;
    }
};