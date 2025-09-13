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
                usage: `${config.PREFIX}translate <to_language> <text> OR ${config.PREFIX}translate languages`,
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
            
            if (args.length < 1) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🌐 **Translation Tool**\n\n' +
                    '**Usage:**\n' +
                    `• ${config.PREFIX}translate <to_language> <text>\n` +
                    `• ${config.PREFIX}translate languages (or lg)\n\n` +
                    '**Examples:**\n' +
                    `• ${config.PREFIX}translate spanish Hello world\n` +
                    `• ${config.PREFIX}translate fr Good morning\n` +
                    `• ${config.PREFIX}translate zh How are you?\n` +
                    `• ${config.PREFIX}translate languages`);
                return;
            }

            // Check if first argument is "languages" or "lg" for language list
            const firstArg = args[0].toLowerCase();
            if (firstArg === 'languages' || firstArg === 'lg') {
                await this.handleLanguagesList(messageInfo);
                return;
            }

            // Handle translation
            if (args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🌐 Usage: .translate <to_language> <text>\n\n' +
                    'Examples:\n• .translate spanish Hello world\n• .translate fr Good morning\n\n' +
                    'Use .translate languages to see available language codes');
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
                    'Use .translate languages to see available options');
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

    async handleLanguagesList(messageInfo) {
        try {
            const langList = Object.entries(this.languages)
                .map(([code, name]) => `**${code}** - ${name}`)
                .join('\n');

            await this.bot.messageHandler.reply(messageInfo,
                `🌐 **Available Languages**\n\n${langList}\n\n` +
                'Usage: .translate <code> <text>\nExample: .translate es Hello world');

        } catch (error) {
            console.error('Error in languages list:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing languages.');
        }
    }

    async translateText(text, toLang) {
        try {
            // Try Google Translate free API with auto-detection (via translate.googleapis.com)
            const response = await axios.post('https://translate.googleapis.com/translate_a/single', null, {
                params: {
                    client: 'gtx',
                    sl: 'auto', // Auto-detect source language
                    tl: toLang,
                    dt: 't',
                    q: text
                },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.data && response.data[0] && response.data[0][0] && response.data[0][0][0]) {
                // Extract detected source language from response
                const detectedLang = response.data[2] || 'auto';
                return {
                    success: true,
                    text: response.data[0][0][0],
                    fromLang: detectedLang
                };
            }

            throw new Error('Google Translate API returned invalid response');

        } catch (error) {
            console.error('Google Translate error:', error.message);
            
            // Try LibreTranslate as backup
            try {
                const libreResponse = await axios.post('https://libretranslate.de/translate', {
                    q: text,
                    source: 'auto', // Auto-detect source language
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
                        fromLang: 'auto'
                    };
                }
            } catch (libreError) {
                console.error('LibreTranslate error:', libreError.message);
            }

            // Try Lingva Translate as final backup
            try {
                const lingvaResponse = await axios.get(`https://lingva.ml/api/v1/auto/${toLang}/${encodeURIComponent(text)}`, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (lingvaResponse.data && lingvaResponse.data.translation) {
                    return {
                        success: true,
                        text: lingvaResponse.data.translation,
                        fromLang: 'auto'
                    };
                }
            } catch (lingvaError) {
                console.error('Lingva error:', lingvaError.message);
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