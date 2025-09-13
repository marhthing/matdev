const config = require('../config');

class UnitConverterPlugin {
    constructor() {
        this.name = 'unit-converter';
        this.description = 'Convert between different units (length, weight, temperature, etc.)';
        this.version = '1.0.0';
        this.enabled = true;
        
        // Conversion factors to meters, grams, celsius
        this.conversions = {
            length: {
                // Base unit: meters
                km: 1000, m: 1, cm: 0.01, mm: 0.001,
                mile: 1609.34, yard: 0.9144, feet: 0.3048, ft: 0.3048, inch: 0.0254, in: 0.0254
            },
            weight: {
                // Base unit: grams  
                kg: 1000, g: 1, mg: 0.001,
                lb: 453.592, pound: 453.592, oz: 28.3495, ton: 1000000
            },
            temperature: {
                // Special handling needed
                celsius: 'c', fahrenheit: 'f', kelvin: 'k', c: 'c', f: 'f', k: 'k'
            },
            volume: {
                // Base unit: liters
                l: 1, liter: 1, ml: 0.001, 
                gallon: 3.78541, gal: 3.78541, cup: 0.236588, oz: 0.0295735
            }
        };
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('convert', this.convertCommand.bind(this), {
                description: 'Convert between units',
                usage: `${config.PREFIX}convert <value> <from_unit> to <to_unit>`,
                category: 'utility',
                plugin: 'unit-converter',
                source: 'unit-converter.js'
            });

            console.log('✅ Unit Converter plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Unit Converter plugin:', error);
            return false;
        }
    }

    async convertCommand(messageInfo) {
        try {
            const args = messageInfo.args.join(' ').trim();
            if (!args) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔧 Usage: .convert <value> <from_unit> to <to_unit>\n\n' +
                    '📏 Length: km, m, cm, mm, mile, yard, ft, inch\n' +
                    '⚖️ Weight: kg, g, mg, lb, oz, ton\n' +
                    '🌡️ Temperature: celsius, fahrenheit, kelvin\n' +
                    '💧 Volume: l, ml, gallon, cup\n\n' +
                    'Examples:\n• .convert 100 cm to inch\n• .convert 32 fahrenheit to celsius\n• .convert 5.5 kg to lb');
                return;
            }

            // Parse input: "100 cm to inch" or "100cm to inch"
            const match = args.match(/^(\d+(?:\.\d+)?)\s*(\w+)\s+to\s+(\w+)$/i);
            if (!match) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Format: .convert <value> <from_unit> to <to_unit>');
                return;
            }

            const [, value, fromUnit, toUnit] = match;
            const numValue = parseFloat(value);

            const result = this.performConversion(numValue, fromUnit.toLowerCase(), toUnit.toLowerCase());
            
            if (result.error) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${result.error}`);
                return;
            }

            await this.bot.messageHandler.reply(messageInfo,
                `🔧 **Unit Conversion**\n\n` +
                `${value} ${fromUnit} = **${result.value}** ${toUnit}\n\n` +
                `_Category: ${result.category}_`);

        } catch (error) {
            console.error('Error in convert command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error performing conversion.');
        }
    }

    performConversion(value, fromUnit, toUnit) {
        // Find which category these units belong to
        let category = null;
        let fromFactor = null;
        let toFactor = null;

        for (const [cat, units] of Object.entries(this.conversions)) {
            if (units[fromUnit] !== undefined && units[toUnit] !== undefined) {
                category = cat;
                fromFactor = units[fromUnit];
                toFactor = units[toUnit];
                break;
            }
        }

        if (!category) {
            return { error: 'Units not found or not in the same category' };
        }

        // Special handling for temperature
        if (category === 'temperature') {
            const result = this.convertTemperature(value, fromFactor, toFactor);
            return {
                value: result.toFixed(2),
                category: 'Temperature'
            };
        }

        // Regular conversion using factors
        const baseValue = value * fromFactor;
        const convertedValue = baseValue / toFactor;
        
        return {
            value: convertedValue.toFixed(4).replace(/\.?0+$/, ''),
            category: category.charAt(0).toUpperCase() + category.slice(1)
        };
    }

    convertTemperature(value, from, to) {
        let celsius = value;
        
        // Convert to Celsius first
        if (from === 'f') celsius = (value - 32) * 5/9;
        else if (from === 'k') celsius = value - 273.15;
        
        // Convert from Celsius to target
        if (to === 'f') return celsius * 9/5 + 32;
        else if (to === 'k') return celsius + 273.15;
        else return celsius;
    }

    async cleanup() {
        console.log('🧹 Unit Converter plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new UnitConverterPlugin();
        await plugin.init(bot);
        return plugin;
    }
};