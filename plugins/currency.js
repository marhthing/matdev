/**
 * MATDEV Currency Conversion Plugin
 * Convert between currencies worldwide with real-time exchange rates
 */

const config = require('../config');
const axios = require('axios');

class CurrencyPlugin {
    constructor() {
        this.name = 'currency';
        this.description = 'Real-time currency conversion worldwide';
        this.version = '1.0.0';
        
        // Free Currency API - No API key required
        this.apiBaseUrl = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies';
        
        // Currency symbols mapping
        this.currencySymbols = {
            'usd': '$', 'eur': '€', 'gbp': '£', 'jpy': '¥', 'krw': '₩',
            'cny': '¥', 'inr': '₹', 'ngn': '₦', 'zar': 'R', 'cad': 'C$',
            'aud': 'A$', 'chf': 'Fr', 'sek': 'kr', 'nok': 'kr', 'dkk': 'kr',
            'pln': 'zł', 'czk': 'Kč', 'huf': 'Ft', 'ron': 'lei', 'bgn': 'лв',
            'hrk': 'kn', 'rub': '₽', 'try': '₺', 'brl': 'R$', 'mxn': '$',
            'ars': '$', 'clp': '$', 'cop': '$', 'pen': 'S/', 'ves': 'Bs',
            'thb': '฿', 'sgd': 'S$', 'myr': 'RM', 'idr': 'Rp', 'php': '₱',
            'vnd': '₫', 'aed': 'د.إ', 'sar': '﷼', 'ils': '₪', 'egp': '£',
            'kwd': 'د.ك', 'bhd': '.د.ب', 'omr': '﷼', 'qar': '﷼', 'jod': 'د.ا',
            'lbp': '£', 'pkr': '₨', 'lkr': '₨', 'bdt': '৳', 'afn': '؋'
        };

        // Currency name mapping for common names to codes
        this.currencyMapping = {
            'dollar': 'usd',
            'dollars': 'usd',
            'euro': 'eur',
            'euros': 'eur',
            'pound': 'gbp',
            'pounds': 'gbp',
            'yen': 'jpy',
            'yuan': 'cny',
            'rupee': 'inr',
            'rupees': 'inr',
            'naira': 'ngn',
            'rand': 'zar',
            'bitcoin': 'btc',
            'ethereum': 'eth'
        };

    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        console.log('✅ Currency plugin loaded');
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Main currency exchange command
        this.bot.messageHandler.registerCommand('exchange', this.convertCommand.bind(this), {
            description: 'Exchange between currencies worldwide',
            usage: `${config.PREFIX}exchange 2000usd to ngn`,
            category: 'utility',
            plugin: 'currency',
            source: 'currency.js'
        });

    }

    /**
     * Handle list command to show all available currencies
     */
    async listCommand(messageInfo) {
        try {
            const currencyList = this.getCompleteCurrencyList();
            
            // Split into chunks to avoid message length limits
            const chunks = this.splitCurrencyList(currencyList);
            
            for (let i = 0; i < chunks.length; i++) {
                const header = `💱 *Popular Currencies Supported*\n\n`;
                const footer = `\n\n_Supports 200+ currencies worldwide_\n_Use: ${config.PREFIX}exchange 100usd to ngn_`;
                const message = header + chunks[i] + footer;
                
                await this.bot.messageHandler.reply(messageInfo, message);
            }
        } catch (error) {
            console.error('Error in list command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error loading currency list. Please try again later.'
            );
        }
    }

    /**
     * Main currency conversion command handler
     */
    async convertCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            // Check if user wants to see currency list
            if (args.length === 1 && args[0].toLowerCase() === 'list') {
                await this.listCommand(messageInfo);
                return;
            }

            // Check if conversion parameters are provided
            if (args.length < 3) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide exchange details!\n\n` +
                    `💡 *Usage examples:*\n` +
                    `• ${config.PREFIX}exchange 2000usd to ngn\n` +
                    `• ${config.PREFIX}exchange 100eur to usd\n` +
                    `• ${config.PREFIX}exchange 50gbp to inr\n` +
                    `• ${config.PREFIX}exchange 1000 usd to eur\n` +
                    `• ${config.PREFIX}exchange list\n\n` +
                    `_Supports 200+ currencies worldwide_`
                );
                return;
            }

            // Parse conversion input
            const conversionData = this.parseConversionInput(args.join(' '));
            
            if (!conversionData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Invalid format! Please use:\n\n` +
                    `• ${config.PREFIX}exchange 2000usd to ngn\n` +
                    `• ${config.PREFIX}exchange 100 eur to usd\n` +
                    `• ${config.PREFIX}exchange 50gbp to inr\n\n` +
                    `_Format: amount + currency + "to" + target currency_`
                );
                return;
            }

            // Get conversion result
            const result = await this.getConversion(
                conversionData.amount, 
                conversionData.from, 
                conversionData.to
            );
            
            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Exchange failed. Please check:\n\n` +
                    `• Currency codes are valid (USD, EUR, NGN, etc.)\n` +
                    `• Network connection is stable\n` +
                    `• Try again in a moment\n\n` +
                    `_Example: ${config.PREFIX}exchange 100usd to eur_`
                );
                return;
            }

            // Format and send conversion response
            const responseMessage = this.formatConversionResponse(result);
            await this.bot.messageHandler.reply(messageInfo, responseMessage);

        } catch (error) {
            console.error('Error in currency exchange command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing currency exchange. Please try again later.\n\n' +
                '_If the problem persists, the currency service might be temporarily unavailable._'
            );
        }
    }

    /**
     * Parse conversion input from user command
     */
    parseConversionInput(input) {
        try {
            // Remove extra spaces and convert to lowercase
            const cleanInput = input.toLowerCase().replace(/\s+/g, ' ').trim();
            
            // Try different patterns
            let match;
            
            // Pattern 1: "2000usd to ngn" or "2000 usd to ngn"
            match = cleanInput.match(/^(\d+(?:\.\d+)?)\s*([a-z]{3})\s+to\s+([a-z]{3})$/);
            if (match) {
                return {
                    amount: parseFloat(match[1]),
                    from: this.normalizeCurrency(match[2]),
                    to: this.normalizeCurrency(match[3])
                };
            }

            // Pattern 2: "2000 usd to ngn"
            match = cleanInput.match(/^(\d+(?:\.\d+)?)\s+([a-z]{3})\s+to\s+([a-z]{3})$/);
            if (match) {
                return {
                    amount: parseFloat(match[1]),
                    from: this.normalizeCurrency(match[2]),
                    to: this.normalizeCurrency(match[3])
                };
            }

            // Pattern 3: "convert 2000 from usd to ngn"
            match = cleanInput.match(/^(?:convert\s+)?(\d+(?:\.\d+)?)\s+from\s+([a-z]{3})\s+to\s+([a-z]{3})$/);
            if (match) {
                return {
                    amount: parseFloat(match[1]),
                    from: this.normalizeCurrency(match[2]),
                    to: this.normalizeCurrency(match[3])
                };
            }

            return null;
        } catch (error) {
            console.error('Error parsing conversion input:', error);
            return null;
        }
    }

    /**
     * Normalize currency codes and handle common names
     */
    normalizeCurrency(currency) {
        const normalized = currency.toLowerCase().trim();
        
        // Check if it's a common name that needs mapping
        if (this.currencyMapping[normalized]) {
            return this.currencyMapping[normalized];
        }
        
        // Return as is if it's already a 3-letter code
        return normalized;
    }

    /**
     * Get currency conversion data
     */
    async getConversion(amount, fromCurrency, toCurrency) {
        try {
            // Get exchange rates for the base currency
            const response = await axios.get(`${this.apiBaseUrl}/${fromCurrency}.json`, {
                timeout: 10000
            });

            if (!response.data || !response.data[fromCurrency]) {
                return null;
            }

            const rates = response.data[fromCurrency];
            
            // Check if target currency exists in rates
            if (!rates[toCurrency]) {
                return null;
            }

            const exchangeRate = rates[toCurrency];
            const convertedAmount = amount * exchangeRate;

            return {
                amount: amount,
                fromCurrency: fromCurrency.toUpperCase(),
                toCurrency: toCurrency.toUpperCase(),
                rate: exchangeRate,
                convertedAmount: convertedAmount,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Error fetching conversion data:', error.message);
            return null;
        }
    }

    /**
     * Format conversion response message
     */
    formatConversionResponse(data) {
        try {
            const fromSymbol = this.currencySymbols[data.fromCurrency.toLowerCase()] || '';
            const toSymbol = this.currencySymbols[data.toCurrency.toLowerCase()] || '';
            
            // Format numbers with appropriate decimal places
            const originalAmount = this.formatAmount(data.amount);
            const convertedAmount = this.formatAmount(data.convertedAmount);
            const rate = this.formatRate(data.rate);

            const response = `💱 *Currency Exchange*\n\n` +
                `${fromSymbol}${originalAmount} ${data.fromCurrency} = ${toSymbol}${convertedAmount} ${data.toCurrency}\n\n` +
                `📊 *Exchange Rate:* 1 ${data.fromCurrency} = ${rate} ${data.toCurrency}\n` +
                `🕐 *Updated:* ${data.timestamp.toLocaleTimeString('en-US', { hour12: false })}\n\n` +
                `_Live exchange rates_`;

            return response;
        } catch (error) {
            console.error('Error formatting conversion response:', error);
            return '❌ Error formatting conversion result';
        }
    }

    /**
     * Format amount with appropriate decimal places
     */
    formatAmount(amount) {
        if (amount >= 1000000) {
            return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        } else if (amount >= 1) {
            return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
        }
    }

    /**
     * Format exchange rate with appropriate decimal places
     */
    formatRate(rate) {
        if (rate >= 100) {
            return rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (rate >= 1) {
            return rate.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        } else {
            return rate.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 });
        }
    }

    /**
     * Get popular currencies list
     */
    getCompleteCurrencyList() {
        return {
            // Major Global Currencies
            'USD': 'United States Dollar 🇺🇸',
            'EUR': 'Euro 🇪🇺',
            'GBP': 'British Pound Sterling 🇬🇧', 
            'JPY': 'Japanese Yen 🇯🇵',
            'CNY': 'Chinese Yuan 🇨🇳',
            'AUD': 'Australian Dollar 🇦🇺',
            'CAD': 'Canadian Dollar 🇨🇦',
            'CHF': 'Swiss Franc 🇨🇭',
            'KRW': 'South Korean Won 🇰🇷',
            'SGD': 'Singapore Dollar 🇸🇬',
            
            // Popular Regional Currencies
            'INR': 'Indian Rupee 🇮🇳',
            'NGN': 'Nigerian Naira 🇳🇬',
            'ZAR': 'South African Rand 🇿🇦',
            'BRL': 'Brazilian Real 🇧🇷',
            'MXN': 'Mexican Peso 🇲🇽',
            'THB': 'Thai Baht 🇹🇭',
            'TRY': 'Turkish Lira 🇹🇷',
            'RUB': 'Russian Ruble 🇷🇺',
            
            // Middle East & Gulf
            'SAR': 'Saudi Riyal 🇸🇦',
            'AED': 'UAE Dirham 🇦🇪',
            'KWD': 'Kuwaiti Dinar 🇰🇼',
            'QAR': 'Qatari Riyal 🇶🇦',
            'ILS': 'Israeli New Shekel 🇮🇱',
            
            // European Popular
            'NOK': 'Norwegian Krone 🇳🇴',
            'SEK': 'Swedish Krona 🇸🇪',
            'DKK': 'Danish Krone 🇩🇰',
            'PLN': 'Polish Zloty 🇵🇱',
            
            // Asian Popular
            'HKD': 'Hong Kong Dollar 🇭🇰',
            'IDR': 'Indonesian Rupiah 🇮🇩',
            'MYR': 'Malaysian Ringgit 🇲🇾',
            'PHP': 'Philippine Peso 🇵🇭',
            'VND': 'Vietnamese Dong 🇻🇳',
            'PKR': 'Pakistani Rupee 🇵🇰',
            'BDT': 'Bangladeshi Taka 🇧🇩',
            
            // African Popular
            'EGP': 'Egyptian Pound 🇪🇬',
            'KES': 'Kenyan Shilling 🇰🇪',
            'GHS': 'Ghanaian Cedi 🇬🇭',
            'MAD': 'Moroccan Dirham 🇲🇦',
            
            // Americas Popular
            'ARS': 'Argentine Peso 🇦🇷',
            'CLP': 'Chilean Peso 🇨🇱',
            'COP': 'Colombian Peso 🇨🇴'
        };
    }

    /**
     * Split currency list into chunks for WhatsApp messages
     */
    splitCurrencyList(currencyList) {
        const entries = Object.entries(currencyList);
        const chunks = [];
        
        // Since we now have only popular currencies (~40), show all in one message
        const chunkText = entries.map(([code, name]) => `${code} - ${name}`).join('\n');
        chunks.push(chunkText);
        
        return chunks;
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new CurrencyPlugin();
        await plugin.init(bot);
        return plugin;
    }
};