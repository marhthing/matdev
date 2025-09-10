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
        // Main currency conversion command
        this.bot.messageHandler.registerCommand('convert', this.convertCommand.bind(this), {
            description: 'Convert between currencies worldwide',
            usage: `${config.PREFIX}convert 2000usd to ngn`,
            category: 'utility',
            plugin: 'currency',
            source: 'currency.js'
        });

        // Alternative command name
        this.bot.messageHandler.registerCommand('currency', this.convertCommand.bind(this), {
            description: 'Currency conversion (alternative)',
            usage: `${config.PREFIX}currency 100eur to usd`,
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
                const header = i === 0 ? `💱 *Available Currencies* (${i + 1}/${chunks.length})\n\n` : `💱 *Available Currencies* (${i + 1}/${chunks.length})\n\n`;
                const message = header + chunks[i];
                
                await this.bot.messageHandler.reply(messageInfo, message);
                
                // Small delay between messages to avoid spam detection
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
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
                    `❌ Please provide conversion details!\n\n` +
                    `💡 *Usage examples:*\n` +
                    `• ${config.PREFIX}convert 2000usd to ngn\n` +
                    `• ${config.PREFIX}convert 100eur to usd\n` +
                    `• ${config.PREFIX}convert 50gbp to inr\n` +
                    `• ${config.PREFIX}convert 1000 usd to eur\n` +
                    `• ${config.PREFIX}convert list\n\n` +
                    `_Supports 200+ currencies worldwide_`
                );
                return;
            }

            // Parse conversion input
            const conversionData = this.parseConversionInput(args.join(' '));
            
            if (!conversionData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Invalid format! Please use:\n\n` +
                    `• ${config.PREFIX}convert 2000usd to ngn\n` +
                    `• ${config.PREFIX}convert 100 eur to usd\n` +
                    `• ${config.PREFIX}convert 50gbp to inr\n\n` +
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
                    `❌ Conversion failed. Please check:\n\n` +
                    `• Currency codes are valid (USD, EUR, NGN, etc.)\n` +
                    `• Network connection is stable\n` +
                    `• Try again in a moment\n\n` +
                    `_Example: ${config.PREFIX}convert 100usd to eur_`
                );
                return;
            }

            // Format and send conversion response
            const responseMessage = this.formatConversionResponse(result);
            await this.bot.messageHandler.reply(messageInfo, responseMessage);

        } catch (error) {
            console.error('Error in currency conversion command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing currency conversion. Please try again later.\n\n' +
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

            const response = `💱 *Currency Conversion*\n\n` +
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
     * Get comprehensive list of all available currencies
     */
    getCompleteCurrencyList() {
        return {
            // Major Global Currencies
            'USD': 'United States Dollar',
            'EUR': 'Euro',
            'GBP': 'British Pound Sterling', 
            'JPY': 'Japanese Yen',
            'CNY': 'Chinese Yuan',
            'AUD': 'Australian Dollar',
            'CAD': 'Canadian Dollar',
            'CHF': 'Swiss Franc',
            'KRW': 'South Korean Won',
            'SGD': 'Singapore Dollar',
            
            // European Currencies
            'NOK': 'Norwegian Krone',
            'SEK': 'Swedish Krona',
            'DKK': 'Danish Krone',
            'PLN': 'Polish Zloty',
            'CZK': 'Czech Koruna',
            'HUF': 'Hungarian Forint',
            'RON': 'Romanian Leu',
            'BGN': 'Bulgarian Lev',
            'HRK': 'Croatian Kuna',
            'RSD': 'Serbian Dinar',
            
            // Americas
            'MXN': 'Mexican Peso',
            'BRL': 'Brazilian Real',
            'ARS': 'Argentine Peso',
            'CLP': 'Chilean Peso',
            'COP': 'Colombian Peso',
            'PEN': 'Peruvian Sol',
            'UYU': 'Uruguayan Peso',
            'VES': 'Venezuelan Bolívar',
            'BOB': 'Bolivian Boliviano',
            'PYG': 'Paraguayan Guarani',
            
            // Asia-Pacific
            'INR': 'Indian Rupee',
            'THB': 'Thai Baht',
            'MYR': 'Malaysian Ringgit',
            'IDR': 'Indonesian Rupiah',
            'PHP': 'Philippine Peso',
            'VND': 'Vietnamese Dong',
            'HKD': 'Hong Kong Dollar',
            'TWD': 'Taiwan Dollar',
            'NZD': 'New Zealand Dollar',
            'PKR': 'Pakistani Rupee',
            'LKR': 'Sri Lankan Rupee',
            'BDT': 'Bangladeshi Taka',
            'NPR': 'Nepalese Rupee',
            'MMK': 'Myanmar Kyat',
            'KHR': 'Cambodian Riel',
            'LAK': 'Laotian Kip',
            
            // Middle East
            'SAR': 'Saudi Riyal',
            'AED': 'UAE Dirham',
            'QAR': 'Qatari Riyal',
            'KWD': 'Kuwaiti Dinar',
            'BHD': 'Bahraini Dinar',
            'OMR': 'Omani Rial',
            'JOD': 'Jordanian Dinar',
            'LBP': 'Lebanese Pound',
            'SYP': 'Syrian Pound',
            'IQD': 'Iraqi Dinar',
            'IRR': 'Iranian Rial',
            'ILS': 'Israeli New Shekel',
            'TRY': 'Turkish Lira',
            
            // Africa
            'ZAR': 'South African Rand',
            'EGP': 'Egyptian Pound',
            'NGN': 'Nigerian Naira',
            'KES': 'Kenyan Shilling',
            'UGX': 'Ugandan Shilling',
            'TZS': 'Tanzanian Shilling',
            'RWF': 'Rwandan Franc',
            'GHS': 'Ghanaian Cedi',
            'XOF': 'West African CFA Franc',
            'XAF': 'Central African CFA Franc',
            'MAD': 'Moroccan Dirham',
            'TND': 'Tunisian Dinar',
            'DZD': 'Algerian Dinar',
            'LYD': 'Libyan Dinar',
            'ETB': 'Ethiopian Birr',
            'MUR': 'Mauritian Rupee',
            'ZMW': 'Zambian Kwacha',
            'BWP': 'Botswana Pula',
            'NAD': 'Namibian Dollar',
            'SZL': 'Swazi Lilangeni',
            'LSL': 'Lesotho Loti',
            
            // Russia & Eastern Europe
            'RUB': 'Russian Ruble',
            'UAH': 'Ukrainian Hryvnia',
            'BYN': 'Belarusian Ruble',
            'KZT': 'Kazakhstani Tenge',
            'UZS': 'Uzbekistani Som',
            'KGS': 'Kyrgyzstani Som',
            'TJS': 'Tajikistani Somoni',
            'TMT': 'Turkmenistani Manat',
            'AZN': 'Azerbaijani Manat',
            'GEL': 'Georgian Lari',
            'AMD': 'Armenian Dram',
            'MDL': 'Moldovan Leu',
            
            // Caribbean & Island Nations  
            'JMD': 'Jamaican Dollar',
            'BBD': 'Barbadian Dollar',
            'TTD': 'Trinidad & Tobago Dollar',
            'BSD': 'Bahamian Dollar',
            'BZD': 'Belize Dollar',
            'KYD': 'Cayman Islands Dollar',
            'XCD': 'East Caribbean Dollar',
            'AWG': 'Aruban Florin',
            'CUP': 'Cuban Peso',
            'DOP': 'Dominican Peso',
            'HTG': 'Haitian Gourde',
            'FJD': 'Fijian Dollar',
            'PGK': 'Papua New Guinea Kina',
            'SBD': 'Solomon Islands Dollar',
            'TOP': 'Tongan Pa\'anga',
            'VUV': 'Vanuatu Vatu',
            'WST': 'Samoan Tala',
            
            // Additional Global Currencies
            'ISK': 'Icelandic Krona',
            'ALL': 'Albanian Lek',
            'MKD': 'Macedonian Denar',
            'BAM': 'Bosnia-Herzegovina Convertible Mark',
            'RSD': 'Serbian Dinar',
            'MNT': 'Mongolian Tugrik',
            'AFN': 'Afghan Afghani',
            'BDT': 'Bangladeshi Taka',
            'BTN': 'Bhutanese Ngultrum',
            'BND': 'Brunei Dollar',
            'KPW': 'North Korean Won',
            'MVR': 'Maldivian Rufiyaa',
            'LKR': 'Sri Lankan Rupee',
            
            // Special & Historical
            'XAU': 'Gold (Troy Ounce)',
            'XAG': 'Silver (Troy Ounce)',
            'XPD': 'Palladium (Troy Ounce)',
            'XPT': 'Platinum (Troy Ounce)',
            'XDR': 'IMF Special Drawing Rights'
        };
    }

    /**
     * Split currency list into chunks for WhatsApp messages
     */
    splitCurrencyList(currencyList) {
        const entries = Object.entries(currencyList);
        const chunks = [];
        const maxPerChunk = 30; // Adjust based on message length limits
        
        for (let i = 0; i < entries.length; i += maxPerChunk) {
            const chunk = entries.slice(i, i + maxPerChunk);
            const chunkText = chunk.map(([code, name]) => `${code} - ${name}`).join('\n');
            chunks.push(chunkText);
        }
        
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